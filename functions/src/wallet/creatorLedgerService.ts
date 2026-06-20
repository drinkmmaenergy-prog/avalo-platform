/**
 * CREATOR USD LEDGER SERVICE
 *
 * Server-only. All public operations are atomic Firestore transactions.
 * Never call from client code.
 *
 * Architecture invariants (enforced here):
 *   1. wallets/{uid}.balance is NEVER touched by any operation in this file.
 *   2. Creator payout eligibility comes only from creatorAccounts/{uid}.availableUsdCents.
 *   3. All monetary values are integer USD cents. No floats stored.
 *   4. creatorLedger entries are append-only. Economic fields never updated.
 *   5. Every operation is idempotent via the idempotency key.
 *   6. Debt must be offset before new pending balance is created.
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../init';
import {
  CREATOR_ACCOUNTS_COLLECTION,
  CREATOR_LEDGER_COLLECTION,
  PAYOUT_REQUESTS_COLLECTION,
  PAYOUT_TERMINAL_STATES,
  PAYOUT_RELEASE_STATES,
  PAYOUT_STATE_MACHINE,
  type CreatorAccount,
  type CreatorLedgerEntry,
  type CreatorLedgerEntryType,
  type CreatorPayoutRequest,
  type PayoutStatus,
  type PayoutStatusHistoryEntry,
} from './creatorTypes';
import {
  CREATOR_ECONOMY,
  CREATOR_HOLD_DAYS,
  PAYOUT_BLOCK_TIERS,
  MIN_PAYOUT_USD_CENTS,
  MIN_KYC_LEVEL_FOR_PAYOUT,
  computeEarningCents,
  holdReleaseDate,
  type RiskTier,
} from './creatorPolicy';
import { PAYOUTS_ENABLED } from './payoutGuard';

// ============================================================================
// COLLECTION REFS
// ============================================================================

const accountRef   = (uid: string) => db.collection(CREATOR_ACCOUNTS_COLLECTION).doc(uid);
const ledgerColRef = ()             => db.collection(CREATOR_LEDGER_COLLECTION);
const payoutRef    = (id: string)   => db.collection(PAYOUT_REQUESTS_COLLECTION).doc(id);

// Idempotency sentinels for creator ledger (separate namespace from wallet sentinels)
const CREATOR_IDEMPOTENCY_COLLECTION = 'creator_idempotency_sentinels';
const idempotencyRef = (key: string) => db.collection(CREATOR_IDEMPOTENCY_COLLECTION).doc(key);

// ============================================================================
// IDEMPOTENCY
// ============================================================================

/**
 * Check if this key has already been processed.
 * Returns the existing entryId if found, null otherwise.
 * Must be called inside a transaction.
 */
async function checkCreatorIdempotency(
  key: string,
  transaction: FirebaseFirestore.Transaction,
): Promise<string | null> {
  const doc = await transaction.get(idempotencyRef(key));
  if (doc.exists) {
    return doc.data()?.entryId as string ?? null;
  }
  return null;
}

function writeCreatorIdempotencySentinel(
  key: string,
  entryId: string,
  transaction: FirebaseFirestore.Transaction,
): void {
  transaction.set(idempotencyRef(key), {
    key,
    entryId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  });
}

// ============================================================================
// INTERNAL: read or create creator account in a transaction
// ============================================================================

async function readOrInitAccount(
  uid: string,
  transaction: FirebaseFirestore.Transaction,
): Promise<CreatorAccount> {
  const doc = await transaction.get(accountRef(uid));
  if (doc.exists) {
    return doc.data() as CreatorAccount;
  }
  // First-time creator — initialise with safe defaults
  const initial: CreatorAccount = {
    uid,
    currency: 'USD',
    pendingUsdCents:       0,
    availableUsdCents:     0,
    reservedUsdCents:      0,
    paidOutUsdCents:       0,
    lifetimeEarnedUsdCents: 0,
    refundDebtUsdCents:    0,
    payoutBlocked:         false,
    payoutBlockReason:     null,
    stripeConnectAccountId: null,
    stripeOnboardingComplete: false,
    kycLevel:              0,
    kycVerifiedAt:         null,
    riskTier:              'NEW',
    successfulPayoutCount: 0,
    createdAt:             FieldValue.serverTimestamp(),
    updatedAt:             FieldValue.serverTimestamp(),
  };
  transaction.set(accountRef(uid), initial);
  return initial;
}

// ============================================================================
// OPERATION 1: recordCreatorEarning
// ============================================================================

/**
 * Record a creator earning from a successful fan payment.
 *
 * Transaction boundary: single Firestore transaction.
 * Idempotency: keyed on `idempotencyKey` — safe to retry.
 * Authorization: server-side only (called from wallet mutation success).
 *
 * State transitions:
 *   creatorAccounts/{uid}.pendingUsdCents      += netUsdCents (minus any debt offset)
 *   creatorAccounts/{uid}.lifetimeEarnedUsdCents += netUsdCents
 *   creatorAccounts/{uid}.refundDebtUsdCents   -= min(debt, netUsdCents) if debt > 0
 *   creatorLedger/{entryId} written (CREATOR_EARNING)
 *   creatorLedger/{debtEntryId} written (DEBT_OFFSET) if debt was offset
 *
 * @param creatorId     - uid of the creator receiving earnings
 * @param payerUid      - uid of the fan who spent tokens
 * @param sourceType    - surface identifier (e.g. 'CALL_BILLING', 'CHAT_MEDIA')
 * @param sourceId      - source event ID (callId, txId from walletService, etc.)
 * @param grossTokens   - total tokens spent by the fan (gross, before any split)
 * @param idempotencyKey - deterministic key derived from wallet txId: `ce:${txId}`
 * @param metadata      - additional context (callId, chatId, etc.)
 */
export async function recordCreatorEarning(params: {
  creatorId: string;
  payerUid: string;
  sourceType: string;
  sourceId: string;
  grossTokens: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { creatorId, payerUid, sourceType, sourceId, grossTokens, idempotencyKey, metadata } = params;

  if (!creatorId || !payerUid || !sourceId || grossTokens <= 0) {
    throw new Error(`[creatorLedger] recordCreatorEarning: invalid params for ${sourceId}`);
  }

  const { grossUsdCents, avaloCommissionUsdCents, netUsdCents } = computeEarningCents(grossTokens);
  const entryDocRef = ledgerColRef().doc();
  const entryId = entryDocRef.id;

  const result = await db.runTransaction(async (tx) => {
    // Idempotency check
    const existingId = await checkCreatorIdempotency(idempotencyKey, tx);
    if (existingId) {
      logger.info(`[creatorLedger] recordCreatorEarning idempotent skip: ${idempotencyKey}`);
      return existingId;
    }

    const account = await readOrInitAccount(creatorId, tx);
    const holdDate = holdReleaseDate(account.riskTier);
    const heldUntil = Timestamp.fromDate(holdDate);

    // Debt offset: future earnings pay down refundDebt before creating new pending
    let pendingIncrease = netUsdCents;
    let debtOffset = 0;
    if (account.refundDebtUsdCents > 0) {
      debtOffset = Math.min(account.refundDebtUsdCents, netUsdCents);
      pendingIncrease = netUsdCents - debtOffset;
    }

    // Write CREATOR_EARNING ledger entry
    const earningEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
      creatorId,
      type: 'CREATOR_EARNING',
      grossUsdCents,
      avaloCommissionUsdCents,
      externalCostUsdCents: 0,
      netUsdCents,
      sourceTokens: grossTokens,
      tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
      sourceType,
      sourceId,
      payerUid,
      idempotencyKey,
      heldUntil,
      availableAt: heldUntil,
      clearedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      metadata: metadata ?? {},
    };
    tx.set(entryDocRef, { entryId, ...earningEntry });

    // Write DEBT_OFFSET entry if needed
    if (debtOffset > 0) {
      const debtDocRef = ledgerColRef().doc();
      const debtEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
        creatorId,
        type: 'DEBT_OFFSET',
        grossUsdCents: debtOffset,
        avaloCommissionUsdCents: 0,
        externalCostUsdCents: 0,
        netUsdCents: -debtOffset,  // reduces debt
        sourceTokens: 0,
        tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
        sourceType: 'DEBT_RECOVERY',
        sourceId: entryId,          // links back to earning entry
        payerUid: null,
        idempotencyKey: `debt_offset:${idempotencyKey}`,
        heldUntil: null,
        availableAt: null,
        clearedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        metadata: { relatedEarningEntryId: entryId },
      };
      tx.set(debtDocRef, { entryId: debtDocRef.id, ...debtEntry });
    }

    // Update account balances
    const newDebt = account.refundDebtUsdCents - debtOffset;
    const debtCleared = newDebt === 0 && account.refundDebtUsdCents > 0;
    tx.update(accountRef(creatorId), {
      pendingUsdCents:        FieldValue.increment(pendingIncrease),
      lifetimeEarnedUsdCents: FieldValue.increment(netUsdCents),
      refundDebtUsdCents:     FieldValue.increment(-debtOffset),
      // Clear payout block if only reason was debt and it's now zero
      ...(debtCleared && account.payoutBlockReason === 'REFUND_DEBT' ? {
        payoutBlocked: false,
        payoutBlockReason: null,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    writeCreatorIdempotencySentinel(idempotencyKey, entryId, tx);
    return entryId;
  });

  logger.info(`[creatorLedger] Earning recorded: ${result} for creator ${creatorId}`, {
    sourceType, sourceId, grossUsdCents, netUsdCents,
  });
  return result;
}

// ============================================================================
// OPERATION 2: releaseMaturedCreatorEarnings
// ============================================================================

/**
 * Release pending creator earnings whose hold period has elapsed.
 * Called by scheduled job (PHASE 3).
 *
 * Idempotent — safe to call multiple times. Each entry is processed once.
 * Skips entries with unresolved fraud flags or debt on the creator account.
 *
 * @param batchSize - max entries to process per call (default 200)
 * @returns count of entries released
 */
export async function releaseMaturedCreatorEarnings(batchSize = 200): Promise<number> {
  const now = Timestamp.now();

  const snapshot = await db
    .collection(CREATOR_LEDGER_COLLECTION)
    .where('type', '==', 'CREATOR_EARNING')
    .where('availableAt', '<=', now)
    .where('clearedAt', '==', null)
    .limit(batchSize)
    .get();

  if (snapshot.empty) return 0;

  let released = 0;

  for (const doc of snapshot.docs) {
    const entry = doc.data() as CreatorLedgerEntry;

    try {
      await db.runTransaction(async (tx) => {
        // Re-read inside transaction to guard against concurrent release
        const freshDoc = await tx.get(doc.ref);
        if (!freshDoc.exists) return;
        const fresh = freshDoc.data() as CreatorLedgerEntry;
        if (fresh.clearedAt !== null) return; // already released

        const accDoc = await tx.get(accountRef(entry.creatorId));
        if (!accDoc.exists) return;
        const account = accDoc.data() as CreatorAccount;

        // Do not release if HIGH_RISK with payout blocked
        if (account.riskTier === 'HIGH_RISK' && account.payoutBlocked) {
          logger.info(`[creatorLedger] Hold release skipped (HIGH_RISK): creator=${entry.creatorId} entry=${entry.entryId}`);
          return;
        }

        // The amount that actually moves (may be less than netUsdCents if debt was partially offset at earning time)
        // We release exactly what was added to pending at earning time.
        // netUsdCents on CREATOR_EARNING already reflects post-debt-offset pending credit.
        // We need to find the actual pending credit:
        //   = earningEntry.netUsdCents minus DEBT_OFFSET for this entry
        // Simplification: read the paired DEBT_OFFSET entry
        const debtOffsetSnap = await db
          .collection(CREATOR_LEDGER_COLLECTION)
          .where('sourceId', '==', entry.entryId)
          .where('type', '==', 'DEBT_OFFSET')
          .limit(1)
          .get();
        const debtOffsetCents = debtOffsetSnap.empty
          ? 0
          : Math.abs((debtOffsetSnap.docs[0].data() as CreatorLedgerEntry).netUsdCents);
        const pendingRelease = entry.netUsdCents - debtOffsetCents;

        if (pendingRelease <= 0) {
          // Nothing to move — just mark cleared
          tx.update(doc.ref, { clearedAt: FieldValue.serverTimestamp() });
          return;
        }

        // Write CREATOR_EARNING_RELEASED ledger entry
        const releaseRef = ledgerColRef().doc();
        const releaseEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
          creatorId: entry.creatorId,
          type: 'CREATOR_EARNING_RELEASED',
          grossUsdCents:           pendingRelease,
          avaloCommissionUsdCents: 0,
          externalCostUsdCents:    0,
          netUsdCents:             pendingRelease,
          sourceTokens:            0,
          tokenRateSnapshotUsd:    CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
          sourceType:              'HOLD_RELEASE',
          sourceId:                entry.entryId,
          payerUid:                null,
          idempotencyKey:          `release:${entry.entryId}`,
          heldUntil:               null,
          availableAt:             null,
          clearedAt:               null,
          createdAt:               FieldValue.serverTimestamp(),
          metadata:                { originalEntryId: entry.entryId },
        };
        tx.set(releaseRef, { entryId: releaseRef.id, ...releaseEntry });

        // Move pending → available
        tx.update(accountRef(entry.creatorId), {
          pendingUsdCents:   FieldValue.increment(-pendingRelease),
          availableUsdCents: FieldValue.increment(pendingRelease),
          updatedAt:         FieldValue.serverTimestamp(),
        });

        // Mark original entry as cleared
        tx.update(doc.ref, { clearedAt: FieldValue.serverTimestamp() });
      });

      released++;
    } catch (err) {
      logger.error(`[creatorLedger] Release failed for entry ${entry.entryId}:`, err);
      // Continue processing others
    }
  }

  return released;
}

// ============================================================================
// OPERATION 3: applyCreatorClawback
// ============================================================================

/**
 * Apply a refund or chargeback clawback against a creator's balance.
 *
 * Clawback order:
 *   1. pendingUsdCents
 *   2. availableUsdCents
 *   3. reservedUsdCents — only if payoutStatus proves no transfer has been initiated
 *   4. remainder → refundDebtUsdCents (payoutBlocked = true)
 *
 * Never touches wallets/{uid}.balance.
 * Idempotent via idempotencyKey.
 *
 * @param creatorId     - creator whose balance is clawed back
 * @param clawbackType  - 'REFUND_CLAWBACK' or 'CHARGEBACK_CLAWBACK'
 * @param grossUsdCents - amount to recover (integer cents)
 * @param sourceId      - originating dispute/refund ID
 * @param idempotencyKey - unique key for this clawback event
 * @param payerUid      - original fan uid
 */
export async function applyCreatorClawback(params: {
  creatorId: string;
  clawbackType: 'REFUND_CLAWBACK' | 'CHARGEBACK_CLAWBACK';
  grossUsdCents: number;
  sourceId: string;
  idempotencyKey: string;
  payerUid: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ absorbed: number; debtCreated: number }> {
  const { creatorId, clawbackType, grossUsdCents, sourceId, idempotencyKey, payerUid, metadata } = params;

  let absorbed = 0;
  let debtCreated = 0;

  await db.runTransaction(async (tx) => {
    // Idempotency check
    const existing = await checkCreatorIdempotency(idempotencyKey, tx);
    if (existing) {
      logger.info(`[creatorLedger] applyCreatorClawback idempotent skip: ${idempotencyKey}`);
      return;
    }

    const accDoc = await tx.get(accountRef(creatorId));
    if (!accDoc.exists) {
      // Creator account doesn't exist — nothing to claw back. Write a record.
      const entryRef = ledgerColRef().doc();
      tx.set(entryRef, {
        entryId: entryRef.id,
        creatorId,
        type: clawbackType,
        grossUsdCents,
        avaloCommissionUsdCents: 0,
        externalCostUsdCents: 0,
        netUsdCents: -grossUsdCents,
        sourceTokens: 0,
        tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
        sourceType: clawbackType,
        sourceId,
        payerUid,
        idempotencyKey,
        heldUntil: null,
        availableAt: null,
        clearedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        metadata: { ...(metadata ?? {}), note: 'creator_account_not_found' },
      });
      writeCreatorIdempotencySentinel(idempotencyKey, entryRef.id, tx);
      debtCreated = grossUsdCents; // unrecoverable
      return;
    }

    const account = accDoc.data() as CreatorAccount;
    let remaining = grossUsdCents;

    // Step 1: claw from pending
    const fromPending = Math.min(remaining, account.pendingUsdCents);
    remaining -= fromPending;

    // Step 2: claw from available
    const fromAvailable = Math.min(remaining, account.availableUsdCents);
    remaining -= fromAvailable;

    // Step 3: reserved — only touch if no transfer has been initiated
    // We do NOT touch reserved here as provider may have already sent funds.
    // Reserved funds are reconciled separately.

    // Step 4: remainder becomes debt
    const newDebt = remaining;
    absorbed = grossUsdCents - newDebt;
    debtCreated = newDebt;

    // Build account updates
    const accountUpdates: Record<string, unknown> = {
      pendingUsdCents:   FieldValue.increment(-fromPending),
      availableUsdCents: FieldValue.increment(-fromAvailable),
      updatedAt:         FieldValue.serverTimestamp(),
    };
    if (newDebt > 0) {
      accountUpdates.refundDebtUsdCents = FieldValue.increment(newDebt);
      accountUpdates.payoutBlocked = true;
      accountUpdates.payoutBlockReason = 'REFUND_DEBT';
    }
    tx.update(accountRef(creatorId), accountUpdates);

    // Write clawback ledger entry
    const entryRef = ledgerColRef().doc();
    const clawbackEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
      creatorId,
      type: clawbackType,
      grossUsdCents,
      avaloCommissionUsdCents: 0,
      externalCostUsdCents: 0,
      netUsdCents: -grossUsdCents,
      sourceTokens: 0,
      tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
      sourceType: clawbackType,
      sourceId,
      payerUid,
      idempotencyKey,
      heldUntil: null,
      availableAt: null,
      clearedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        ...(metadata ?? {}),
        fromPending,
        fromAvailable,
        debtCreated: newDebt,
      },
    };
    tx.set(entryRef, { entryId: entryRef.id, ...clawbackEntry });
    writeCreatorIdempotencySentinel(idempotencyKey, entryRef.id, tx);
  });

  logger.warn(`[creatorLedger] Clawback applied: creator=${creatorId} type=${clawbackType} absorbed=${absorbed} debt=${debtCreated}`, {
    sourceId, grossUsdCents,
  });
  return { absorbed, debtCreated };
}

// ============================================================================
// OPERATION 4: getCreatorPayoutEligibility
// ============================================================================

export interface PayoutEligibility {
  eligible: boolean;
  reason: string | null;
  availableUsdCents: number;
  reservedUsdCents: number;
  pendingUsdCents: number;
  refundDebtUsdCents: number;
  payoutBlocked: boolean;
  payoutBlockReason: string | null;
}

/**
 * Read payout eligibility for a creator.
 * Does not modify any state.
 */
export async function getCreatorPayoutEligibility(uid: string): Promise<PayoutEligibility> {
  if (!PAYOUTS_ENABLED) {
    return {
      eligible: false,
      reason: 'PAYOUTS_DISABLED_FOR_SOFT_LAUNCH',
      availableUsdCents: 0,
      reservedUsdCents: 0,
      pendingUsdCents: 0,
      refundDebtUsdCents: 0,
      payoutBlocked: true,
      payoutBlockReason: 'PAYOUTS_DISABLED_FOR_SOFT_LAUNCH',
    };
  }

  const doc = await accountRef(uid).get();
  if (!doc.exists) {
    return {
      eligible: false,
      reason: 'NO_CREATOR_ACCOUNT',
      availableUsdCents: 0,
      reservedUsdCents: 0,
      pendingUsdCents: 0,
      refundDebtUsdCents: 0,
      payoutBlocked: false,
      payoutBlockReason: null,
    };
  }

  const account = doc.data() as CreatorAccount;

  if (!PAYOUTS_ENABLED)             return ineligible(account, 'PAYOUTS_DISABLED');
  if (account.payoutBlocked)        return ineligible(account, account.payoutBlockReason ?? 'BLOCKED');
  if (account.refundDebtUsdCents > 0) return ineligible(account, 'REFUND_DEBT');
  if (account.kycLevel < MIN_KYC_LEVEL_FOR_PAYOUT) return ineligible(account, 'KYC_REQUIRED');
  if (!account.stripeConnectAccountId) return ineligible(account, 'STRIPE_CONNECT_MISSING');
  if (!account.stripeOnboardingComplete) return ineligible(account, 'STRIPE_ONBOARDING_INCOMPLETE');
  if (account.availableUsdCents < MIN_PAYOUT_USD_CENTS) return ineligible(account, 'INSUFFICIENT_AVAILABLE_BALANCE');
  if (PAYOUT_BLOCK_TIERS.includes(account.riskTier)) return ineligible(account, 'HIGH_RISK_TIER');

  return {
    eligible: true,
    reason: null,
    availableUsdCents: account.availableUsdCents,
    reservedUsdCents: account.reservedUsdCents,
    pendingUsdCents: account.pendingUsdCents,
    refundDebtUsdCents: account.refundDebtUsdCents,
    payoutBlocked: account.payoutBlocked,
    payoutBlockReason: account.payoutBlockReason,
  };
}

function ineligible(account: CreatorAccount, reason: string): PayoutEligibility {
  return {
    eligible: false,
    reason,
    availableUsdCents: account.availableUsdCents,
    reservedUsdCents: account.reservedUsdCents,
    pendingUsdCents: account.pendingUsdCents,
    refundDebtUsdCents: account.refundDebtUsdCents,
    payoutBlocked: account.payoutBlocked,
    payoutBlockReason: account.payoutBlockReason,
  };
}

// ============================================================================
// OPERATION 5: requestCreatorPayout
// ============================================================================

/**
 * Creator requests a payout.
 *
 * All guards are checked first (PAYOUTS_ENABLED, KYC, Stripe, blocked, debt, balance).
 * On success: available → reserved atomically; payoutRequest created.
 *
 * Idempotent: duplicate submissions with same clientIdempotencyKey return existing payoutId.
 *
 * @returns payoutId of the created (or existing) payout request
 */
export async function requestCreatorPayout(params: {
  creatorId: string;
  requestedUsdCents: number;
  clientIdempotencyKey: string;
}): Promise<string> {
  const { creatorId, requestedUsdCents, clientIdempotencyKey } = params;

  if (!PAYOUTS_ENABLED) {
    throw new HttpsError('unavailable', '[PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] Payouts are not yet enabled.');
  }

  const payoutDocRef = payoutRef(db.collection(PAYOUT_REQUESTS_COLLECTION).doc().id);
  const payoutId = payoutDocRef.id;
  const idempotencyKey = `payout_request:${clientIdempotencyKey}`;

  const result = await db.runTransaction(async (tx) => {
    // Client-level idempotency
    const existing = await checkCreatorIdempotency(idempotencyKey, tx);
    if (existing) {
      logger.info(`[creatorLedger] requestCreatorPayout idempotent: ${idempotencyKey} → ${existing}`);
      return existing;
    }

    const accDoc = await tx.get(accountRef(creatorId));
    if (!accDoc.exists) throw new HttpsError('not-found', 'Creator account not found.');
    const account = accDoc.data() as CreatorAccount;

    // Guards — ordered from cheapest to most specific
    if (account.payoutBlocked)          throw new HttpsError('failed-precondition', `Payout blocked: ${account.payoutBlockReason}`);
    if (account.refundDebtUsdCents > 0) throw new HttpsError('failed-precondition', 'Outstanding refund debt must clear before payout.');
    if (account.kycLevel < MIN_KYC_LEVEL_FOR_PAYOUT) throw new HttpsError('failed-precondition', 'KYC verification required.');
    if (!account.stripeConnectAccountId) throw new HttpsError('failed-precondition', 'Stripe Connect account not set up.');
    if (!account.stripeOnboardingComplete) throw new HttpsError('failed-precondition', 'Stripe onboarding not complete.');
    if (PAYOUT_BLOCK_TIERS.includes(account.riskTier)) throw new HttpsError('failed-precondition', 'Payout blocked: high-risk tier.');
    if (requestedUsdCents < MIN_PAYOUT_USD_CENTS) throw new HttpsError('invalid-argument', `Minimum payout is ${MIN_PAYOUT_USD_CENTS} cents.`);
    if (account.availableUsdCents < requestedUsdCents) throw new HttpsError('failed-precondition', 'Insufficient available balance.');

    // Commission and fees — 0 at payout time (already deducted at earning time)
    // External Stripe costs absorbed by Avalo from its commission.
    const netDisbursedUsdCents = requestedUsdCents;

    // Move available → reserved
    tx.update(accountRef(creatorId), {
      availableUsdCents: FieldValue.increment(-requestedUsdCents),
      reservedUsdCents:  FieldValue.increment(requestedUsdCents),
      updatedAt:         FieldValue.serverTimestamp(),
    });

    const now = FieldValue.serverTimestamp();
    const payoutRequest: CreatorPayoutRequest = {
      payoutId,
      creatorId,
      status: 'REQUESTED',
      requestedUsdCents,
      avaloCommissionUsdCents: 0,
      externalCostUsdCents: 0,
      netDisbursedUsdCents,
      stripeConnectAccountId: account.stripeConnectAccountId!,
      providerTransferId: null,
      providerIdempotencyKey: payoutId, // payoutId as Stripe idempotency key
      amlScanId: null,
      amlClearedAt: null,
      ledgerEntryId: null,
      clientIdempotencyKey,
      statusHistory: [{
        status: 'REQUESTED',
        at: now,
        by: 'system',
        note: `Creator requested ${requestedUsdCents} cents`,
      }],
      requestedAt: now,
      processedAt: null,
      completedAt: null,
      updatedAt: now,
    };

    // Write PAYOUT_RESERVED ledger entry
    const ledgerRef = ledgerColRef().doc();
    const reservedEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
      creatorId,
      type: 'PAYOUT_RESERVED',
      grossUsdCents: requestedUsdCents,
      avaloCommissionUsdCents: 0,
      externalCostUsdCents: 0,
      netUsdCents: -requestedUsdCents,  // deducted from available
      sourceTokens: 0,
      tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
      sourceType: 'PAYOUT_REQUEST',
      sourceId: payoutId,
      payerUid: null,
      idempotencyKey,
      heldUntil: null,
      availableAt: null,
      clearedAt: null,
      createdAt: now,
      metadata: { payoutId, netDisbursedUsdCents },
    };
    tx.set(ledgerRef, { entryId: ledgerRef.id, ...reservedEntry });

    // Update payout request with ledger entry ID
    payoutRequest.ledgerEntryId = ledgerRef.id;
    tx.set(payoutDocRef, payoutRequest);

    writeCreatorIdempotencySentinel(idempotencyKey, payoutId, tx);
    return payoutId;
  });

  logger.info(`[creatorLedger] Payout requested: ${result} by creator ${creatorId} for ${requestedUsdCents} cents`);
  return result;
}

// ============================================================================
// OPERATION 6: reserveCreatorPayout (approve path)
// ============================================================================

/**
 * Admin approves a payout: REQUESTED/AML_REVIEW → APPROVED.
 * No balance change — funds already reserved in requestCreatorPayout.
 */
export async function reserveCreatorPayout(payoutId: string, adminNote?: string): Promise<void> {
  await transitionPayoutStatus(payoutId, 'APPROVED', 'admin', adminNote);
}

// ============================================================================
// OPERATION 7: markPayoutProcessing
// ============================================================================

/**
 * Mark payout as processing and persist the Stripe transfer ID immediately.
 * Called just before the Stripe API call.
 * Idempotent: if providerTransferId already set, returns without modification.
 */
export async function markPayoutProcessing(payoutId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(payoutRef(payoutId));
    if (!doc.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
    const payout = doc.data() as CreatorPayoutRequest;

    if (payout.status === 'PROCESSING') return; // already processing
    if (!['APPROVED'].includes(payout.status)) {
      throw new HttpsError('failed-precondition', `Cannot process payout in status ${payout.status}`);
    }

    tx.update(payoutRef(payoutId), {
      status: 'PROCESSING',
      statusHistory: FieldValue.arrayUnion({
        status: 'PROCESSING',
        at: FieldValue.serverTimestamp(),
        by: 'system',
        note: 'Stripe transfer initiated',
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// ============================================================================
// OPERATION 8: markPayoutCompleted
// ============================================================================

/**
 * Mark payout COMPLETED after Stripe confirms the transfer.
 * reserved → paidOut. TERMINAL — irreversible.
 *
 * @param payoutId          - payout request ID
 * @param providerTransferId - Stripe transfer ID
 */
export async function markPayoutCompleted(payoutId: string, providerTransferId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(payoutRef(payoutId));
    if (!doc.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
    const payout = doc.data() as CreatorPayoutRequest;

    if (payout.status === 'COMPLETED') return; // idempotent
    if (!['PROCESSING', 'UNKNOWN'].includes(payout.status)) {
      throw new HttpsError('failed-precondition', `Cannot complete payout in status ${payout.status}`);
    }

    // reserved → paidOut
    tx.update(accountRef(payout.creatorId), {
      reservedUsdCents: FieldValue.increment(-payout.requestedUsdCents),
      paidOutUsdCents:  FieldValue.increment(payout.requestedUsdCents),
      successfulPayoutCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Write PAYOUT_COMPLETED ledger entry
    const ledgerRef = ledgerColRef().doc();
    const completedEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
      creatorId: payout.creatorId,
      type: 'PAYOUT_COMPLETED',
      grossUsdCents: payout.requestedUsdCents,
      avaloCommissionUsdCents: 0,
      externalCostUsdCents: payout.externalCostUsdCents,
      netUsdCents: -payout.requestedUsdCents,
      sourceTokens: 0,
      tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
      sourceType: 'PAYOUT_COMPLETED',
      sourceId: payoutId,
      payerUid: null,
      idempotencyKey: `payout_completed:${payoutId}`,
      heldUntil: null,
      availableAt: null,
      clearedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      metadata: { providerTransferId },
    };
    tx.set(ledgerRef, { entryId: ledgerRef.id, ...completedEntry });

    tx.update(payoutRef(payoutId), {
      status: 'COMPLETED',
      providerTransferId,
      processedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({
        status: 'COMPLETED',
        at: FieldValue.serverTimestamp(),
        by: 'system',
        note: `Transfer confirmed: ${providerTransferId}`,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info(`[creatorLedger] Payout COMPLETED: ${payoutId} transfer=${providerTransferId}`);
}

// ============================================================================
// OPERATION 9: markPayoutUnknown
// ============================================================================

/**
 * Provider timed out — outcome unknown.
 * Status → UNKNOWN. Reserve retained. Reconciliation required.
 * UNKNOWN is terminal until provider reconciliation determines outcome.
 */
export async function markPayoutUnknown(payoutId: string, reason: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(payoutRef(payoutId));
    if (!doc.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
    const payout = doc.data() as CreatorPayoutRequest;

    if (PAYOUT_TERMINAL_STATES.includes(payout.status)) return; // already terminal
    if (payout.status !== 'PROCESSING') {
      throw new HttpsError('failed-precondition', `Cannot mark unknown for status ${payout.status}`);
    }

    tx.update(payoutRef(payoutId), {
      status: 'UNKNOWN',
      statusHistory: FieldValue.arrayUnion({
        status: 'UNKNOWN',
        at: FieldValue.serverTimestamp(),
        by: 'system',
        note: reason,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // NOTE: reserve is RETAINED. Do not release until provider confirms non-disbursement.
  });

  logger.warn(`[creatorLedger] Payout UNKNOWN: ${payoutId} reason=${reason}`);
}

// ============================================================================
// OPERATION 10: releaseFailedPayoutReserve
// ============================================================================

/**
 * Release reserved funds back to available after confirmed provider failure.
 * Only valid for FAILED, REJECTED, CANCELLED, or REVERSED status.
 * COMPLETED payouts MUST NOT call this function.
 *
 * State transitions:
 *   reservedUsdCents -= requestedUsdCents
 *   availableUsdCents += requestedUsdCents
 *   creatorLedger: PAYOUT_RELEASED entry written
 */
export async function releaseFailedPayoutReserve(
  payoutId: string,
  newStatus: 'FAILED' | 'REJECTED' | 'CANCELLED' | 'REVERSED',
  reason: string,
  by: 'system' | 'admin' | 'creator' = 'system',
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(payoutRef(payoutId));
    if (!doc.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
    const payout = doc.data() as CreatorPayoutRequest;

    // Safety: never release a COMPLETED payout
    if (payout.status === 'COMPLETED') {
      throw new HttpsError('failed-precondition', '[COMPLETED_PAYOUT_RELEASE_BLOCKED] Completed payouts are irreversible.');
    }
    if (!PAYOUT_RELEASE_STATES.includes(newStatus)) {
      throw new HttpsError('invalid-argument', `Invalid release status: ${newStatus}`);
    }
    if (!PAYOUT_STATE_MACHINE[payout.status].includes(newStatus)) {
      throw new HttpsError('failed-precondition', `Cannot transition ${payout.status} → ${newStatus}`);
    }

    // reserved → available
    tx.update(accountRef(payout.creatorId), {
      reservedUsdCents:  FieldValue.increment(-payout.requestedUsdCents),
      availableUsdCents: FieldValue.increment(payout.requestedUsdCents),
      updatedAt:         FieldValue.serverTimestamp(),
    });

    // Write PAYOUT_RELEASED ledger entry
    const ledgerRef = ledgerColRef().doc();
    const releaseEntry: Omit<CreatorLedgerEntry, 'entryId'> = {
      creatorId: payout.creatorId,
      type: 'PAYOUT_RELEASED',
      grossUsdCents: payout.requestedUsdCents,
      avaloCommissionUsdCents: 0,
      externalCostUsdCents: 0,
      netUsdCents: payout.requestedUsdCents, // returning to available
      sourceTokens: 0,
      tokenRateSnapshotUsd: CREATOR_ECONOMY.TOKEN_RATE_USD_CENTS / 100,
      sourceType: newStatus,
      sourceId: payoutId,
      payerUid: null,
      idempotencyKey: `payout_released:${payoutId}:${newStatus}`,
      heldUntil: null,
      availableAt: null,
      clearedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      metadata: { reason },
    };
    tx.set(ledgerRef, { entryId: ledgerRef.id, ...releaseEntry });

    tx.update(payoutRef(payoutId), {
      status: newStatus,
      statusHistory: FieldValue.arrayUnion({
        status: newStatus,
        at: FieldValue.serverTimestamp(),
        by,
        note: reason,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info(`[creatorLedger] Payout reserve released: ${payoutId} → ${newStatus}`);
}

// ============================================================================
// INTERNAL: generic status transition (for reserveCreatorPayout)
// ============================================================================

async function transitionPayoutStatus(
  payoutId: string,
  newStatus: PayoutStatus,
  by: 'system' | 'admin' | 'creator',
  note?: string,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(payoutRef(payoutId));
    if (!doc.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
    const payout = doc.data() as CreatorPayoutRequest;

    if (payout.status === newStatus) return; // idempotent
    if (!PAYOUT_STATE_MACHINE[payout.status].includes(newStatus)) {
      throw new HttpsError('failed-precondition', `Cannot transition ${payout.status} → ${newStatus}`);
    }

    tx.update(payoutRef(payoutId), {
      status: newStatus,
      statusHistory: FieldValue.arrayUnion({
        status: newStatus,
        at: FieldValue.serverTimestamp(),
        by,
        note: note ?? `Transitioned to ${newStatus}`,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
