/**
 * AVALO — C4: Canonical Creator Earning-Token Ledger
 *
 * This is the SERVER-ONLY source of truth for creator earnings.
 * Clients may NOT write creatorEarningAccounts, creatorEarningLedger,
 * creatorPayoutRequests, or billingEvents (Firestore rules: write: if false).
 *
 * Canonical earning invariants (§0.3):
 *   BASE_CREATOR_RESPONSE_RATE_TOKENS = 3
 *   finalChargedTokens = 3 × multiplier
 *   payerTokensCharged = finalChargedTokens
 *   creatorEarningTokens = finalChargedTokens   ← no per-delivery token split
 *   Payout rate: 1 token = $0.04 gross
 *   Avalo commission: 20% (applied at payout time, NOT at earning time)
 *   Net per token: $0.04 × 0.80 = $0.032
 *
 * Collections (all server-only writes):
 *   creatorEarningAccounts/{uid}      — current earning account state
 *   creatorEarningLedger/{entryId}    — append-only per-event entries
 *   billingEvents/{eventId}           — immutable payer/creator billing audit
 *   creatorPayoutRequests/{payoutId}  — payout state machine (C12)
 *
 * IMPORTANT: Do NOT read from MONETIZATION_SPLITS (all zeros in production).
 * All split logic in this file uses hardcoded canonical constants.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical constants
// ─────────────────────────────────────────────────────────────────────────────

/** §0.3: Base creator response rate. finalChargedTokens = BASE × multiplier. */
export const BASE_CREATOR_RESPONSE_RATE_TOKENS = 3;

export const TOKEN_PAYOUT_USD_GROSS = 0.04;
export const AVALO_COMMISSION_RATE  = 0.20;
export const TOKEN_PAYOUT_USD_NET   = TOKEN_PAYOUT_USD_GROSS * (1 - AVALO_COMMISSION_RATE);

/**
 * Creator risk tiers — determine earning hold duration (§1.7).
 * Risk tier is snapshotted at earning time, stored in ledger entry.
 * Do NOT re-read current tier to alter a historical earning event.
 */
export type CreatorRiskTier = 'NEW' | 'VERIFIED' | 'TRUSTED' | 'HIGH_RISK';

/** Hold duration in days per risk tier (§1.7). */
export const EARNING_HOLD_DAYS_BY_TIER: Record<CreatorRiskTier, number> = {
  NEW:       7,
  VERIFIED:  3,
  TRUSTED:   1,
  HIGH_RISK: 14,
};

/** Fallback hold — used for backward compat and NEW creators without tier set. */
export const EARNING_HOLD_DAYS = EARNING_HOLD_DAYS_BY_TIER.NEW; // 7 days

/**
 * Read creator's current risk tier from creatorEarningAccounts/{uid}.riskTier.
 * Returns 'NEW' as safe default if not set.
 * Caller must snapshot this at earning time — do not re-read later for historical events.
 */
export async function getCreatorRiskTier(
  creatorId: string,
  db: FirebaseFirestore.Firestore,
): Promise<CreatorRiskTier> {
  const snap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  if (!snap.exists) return 'NEW';
  const tier = (snap.data() as any).riskTier as CreatorRiskTier | undefined;
  return tier ?? 'NEW';
}

/**
 * Compute hold release date for a new earning event.
 * Snapshots the creator's current risk tier.
 */
export function computeHoldRelease(riskTier: CreatorRiskTier): Date {
  const holdDays = EARNING_HOLD_DAYS_BY_TIER[riskTier] ?? EARNING_HOLD_DAYS_BY_TIER.NEW;
  return new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore collection paths
// ─────────────────────────────────────────────────────────────────────────────

const CREATOR_EARNING_ACCOUNTS   = 'creatorEarningAccounts';
const CREATOR_EARNING_LEDGER     = 'creatorEarningLedger';
const BILLING_EVENTS             = 'billingEvents';
export const CREATOR_PAYOUT_REQUESTS = 'creatorPayoutRequests';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EarningEventType =
  | 'DIRECT_CHAT_RESPONSE'
  | 'MEDIA_PPV'
  | 'TIP'
  | 'GIFT'
  | 'CALL_BILLING'
  | 'SUBSCRIPTION_PAYMENT'
  | 'CALENDAR_BOOKING'
  | 'ROOM_PRODUCT'
  | 'EARNING_HOLD_RELEASE'
  | 'EARNING_CLAWBACK';

export type CreatorPayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface CreatorEarningAccount {
  creatorId: string;
  /** Earning tokens in hold period (not yet available for payout). */
  pendingTokens: number;
  /** Earning tokens released from hold — available for payout. Spec: availableEarningTokens. */
  availableEarningTokens: number;
  /** Earning tokens reserved for an active payout request. Spec: reservedEarningTokens. */
  reservedEarningTokens: number;
  /** Total earning tokens paid out lifetime. Spec: paidOutEarningTokens. */
  paidOutEarningTokens: number;
  lifetimeEarnedTokens: number;
  riskTier?: string;
  stripeConnectAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  stripeAccountUpdatedAt?: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

export interface CreatorEarningLedgerEntry {
  entryId: string;
  creatorId: string;
  payerId: string | null;
  type: EarningEventType;
  tokenAmount: number;
  grossUsd: number;
  chatId?: string;
  sessionId?: string;
  messageId?: string;
  sourceRef?: string;
  idempotencyKey: string;
  holdsUntil: Timestamp | null;
  createdAt: Timestamp | FieldValue;
}

export interface BillingEvent {
  eventId: string;
  payerId: string;
  creatorId: string;
  type: EarningEventType;
  payerTokensCharged: number;
  creatorEarningTokens: number;
  chatId?: string;
  sessionId?: string;
  messageId?: string;
  reservationId?: string;
  multiplier?: number;
  idempotencyKey: string;
  createdAt: Timestamp | FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const db = getFirestore();

function holdReleaseDate(): Timestamp {
  return Timestamp.fromMillis(Date.now() + EARNING_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

export function computeGrossUsd(tokenAmount: number): number {
  return Math.round(tokenAmount * TOKEN_PAYOUT_USD_GROSS * 1_000_000) / 1_000_000;
}

export function computeNetUsd(tokenAmount: number): number {
  return Math.round(tokenAmount * TOKEN_PAYOUT_USD_NET * 1_000_000) / 1_000_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// recordCreatorEarning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically record a creator earning event.
 *
 * Called by the C5 chat state machine inside the same Firestore transaction
 * that commits the creator message visible to the payer (§0.2 atomicity).
 *
 * Tokens go to pendingTokens (hold period). releaseHeldEarnings() (C7 scheduler)
 * moves them to availableEarningTokens after the risk-tier hold period.
 */
export async function recordCreatorEarning(params: {
  creatorId: string;
  payerId: string;
  type: EarningEventType;
  tokenAmount: number;
  idempotencyKey: string;
  chatId?: string;
  sessionId?: string;
  messageId?: string;
  reservationId?: string;
  multiplier?: number;
  sourceRef?: string;
}): Promise<{ entryId: string; eventId: string }> {
  const {
    creatorId, payerId, type, tokenAmount, idempotencyKey,
    chatId, sessionId, messageId, reservationId, multiplier, sourceRef,
  } = params;

  if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) {
    throw new Error('[EarningService] tokenAmount must be a positive integer');
  }
  if (!idempotencyKey) {
    throw new Error('[EarningService] idempotencyKey is required');
  }

  const grossUsd    = computeGrossUsd(tokenAmount);
  const holdsUntil  = holdReleaseDate();

  return db.runTransaction(async (transaction) => {
    // 1. Idempotency via billingEvents doc
    const billingEventRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existingEvent   = await transaction.get(billingEventRef);
    if (existingEvent.exists) {
      const existing = existingEvent.data() as BillingEvent;
      return { entryId: existing.eventId, eventId: idempotencyKey };
    }

    // 2. Create or update earning account
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const accountSnap = await transaction.get(accountRef);

    if (!accountSnap.exists) {
      const newAccount: CreatorEarningAccount = {
        creatorId,
        pendingTokens:          tokenAmount,
        availableEarningTokens: 0,
        reservedEarningTokens:  0,
        paidOutEarningTokens:   0,
        lifetimeEarnedTokens:   tokenAmount,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      };
      transaction.set(accountRef, newAccount);
    } else {
      transaction.update(accountRef, {
        pendingTokens:        FieldValue.increment(tokenAmount),
        lifetimeEarnedTokens: FieldValue.increment(tokenAmount),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // 3. Immutable earning ledger entry
    const entryId       = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    const ledgerEntry: CreatorEarningLedgerEntry = {
      entryId, creatorId, payerId, type, tokenAmount, grossUsd,
      idempotencyKey, holdsUntil,
      createdAt: FieldValue.serverTimestamp(),
      ...(chatId    && { chatId }),
      ...(sessionId && { sessionId }),
      ...(messageId && { messageId }),
      ...(sourceRef && { sourceRef }),
    };
    transaction.set(db.collection(CREATOR_EARNING_LEDGER).doc(entryId), ledgerEntry);

    // 4. Immutable billing event (payer-side audit)
    const billingEvent: BillingEvent = {
      eventId:              idempotencyKey,
      payerId, creatorId, type,
      payerTokensCharged:   tokenAmount,   // §0.3: equals finalChargedTokens
      creatorEarningTokens: tokenAmount,   // §0.3: no per-delivery token split
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      ...(chatId        && { chatId }),
      ...(sessionId     && { sessionId }),
      ...(messageId     && { messageId }),
      ...(reservationId && { reservationId }),
      ...(multiplier !== undefined && { multiplier }),
    };
    transaction.set(billingEventRef, billingEvent);

    return { entryId, eventId: idempotencyKey };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// releaseHeldEarnings (called by C7 scheduler)
// ─────────────────────────────────────────────────────────────────────────────

export async function releaseHeldEarnings(
  creatorId: string,
): Promise<{ tokensReleased: number; entryId: string | null }> {
  const now = Timestamp.now();

  const pendingSnap = await db
    .collection(CREATOR_EARNING_LEDGER)
    .where('creatorId', '==', creatorId)
    .where('type', '!=', 'EARNING_HOLD_RELEASE')
    .where('holdsUntil', '<=', now)
    .get();

  if (pendingSnap.empty) return { tokensReleased: 0, entryId: null };

  // Sum — only entries where holdsUntil is set (exclude EARNING_CLAWBACK which has null)
  let tokensToRelease = 0;
  const processedIds: string[] = [];
  for (const doc of pendingSnap.docs) {
    const entry = doc.data() as CreatorEarningLedgerEntry;
    if (entry.holdsUntil !== null && entry.tokenAmount > 0) {
      tokensToRelease += entry.tokenAmount;
      processedIds.push(entry.entryId);
    }
  }

  if (tokensToRelease === 0) return { tokensReleased: 0, entryId: null };

  const idempotencyKey = `hold_release_${creatorId}_${now.toMillis()}`;

  return db.runTransaction(async (transaction) => {
    const sentinelRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existing    = await transaction.get(sentinelRef);
    if (existing.exists) return { tokensReleased: 0, entryId: null };

    const accountRef = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    transaction.update(accountRef, {
      pendingTokens:          FieldValue.increment(-tokensToRelease),
      availableEarningTokens: FieldValue.increment(tokensToRelease),
      updatedAt:       FieldValue.serverTimestamp(),
    });

    const entryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    transaction.set(db.collection(CREATOR_EARNING_LEDGER).doc(entryId), {
      entryId, creatorId, payerId: null,
      type: 'EARNING_HOLD_RELEASE' as EarningEventType,
      tokenAmount: tokensToRelease,
      grossUsd:    computeGrossUsd(tokensToRelease),
      idempotencyKey, holdsUntil: null,
      createdAt: FieldValue.serverTimestamp(),
    } as CreatorEarningLedgerEntry);

    transaction.set(sentinelRef, {
      eventId: idempotencyKey, type: 'EARNING_HOLD_RELEASE', creatorId,
      tokensReleased: tokensToRelease, processedIds,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { tokensReleased: tokensToRelease, entryId };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getCreatorEarningAccount(
  creatorId: string,
): Promise<CreatorEarningAccount | null> {
  const snap = await db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId).get();
  if (!snap.exists) return null;
  return snap.data() as CreatorEarningAccount;
}

export async function getBillingEvent(eventId: string): Promise<BillingEvent | null> {
  const snap = await db.collection(BILLING_EVENTS).doc(eventId).get();
  if (!snap.exists) return null;
  return snap.data() as BillingEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout reservation (used by C12)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertPayoutEligibility(
  creatorId: string,
  requestedTokens: number,
): Promise<CreatorEarningAccount> {
  const account = await getCreatorEarningAccount(creatorId);
  if (!account) {
    throw new HttpsError(
      'failed-precondition',
      'PAYOUT_NO_ACCOUNT: Creator earning account not found.',
    );
  }
  if ((account.availableEarningTokens ?? 0) < requestedTokens) {
    throw new HttpsError(
      'failed-precondition',
      `PAYOUT_INSUFFICIENT: ${account.availableEarningTokens ?? 0} available, needs ${requestedTokens}.`,
    );
  }
  return account;
}

export async function reserveForPayout(params: {
  creatorId: string;
  tokenAmount: number;
  payoutId: string;
}): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(params.creatorId);
    const snap        = await transaction.get(accountRef);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'PAYOUT_NO_ACCOUNT');
    const account = snap.data() as CreatorEarningAccount;
    if ((account.availableEarningTokens ?? 0) < params.tokenAmount) {
      throw new HttpsError('failed-precondition', 'PAYOUT_INSUFFICIENT');
    }
    transaction.update(accountRef, {
      availableEarningTokens: FieldValue.increment(-params.tokenAmount),
      reservedEarningTokens:  FieldValue.increment(params.tokenAmount),
      updatedAt:              FieldValue.serverTimestamp(),
    });
  });
}

export async function finalizePayoutReservation(params: {
  creatorId: string;
  tokenAmount: number;
  success: boolean;
}): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const accountRef = db.collection(CREATOR_EARNING_ACCOUNTS).doc(params.creatorId);
    if (params.success) {
      transaction.update(accountRef, {
        reservedEarningTokens: FieldValue.increment(-params.tokenAmount),
        paidOutEarningTokens:  FieldValue.increment(params.tokenAmount),
        updatedAt:             FieldValue.serverTimestamp(),
      });
    } else {
      transaction.update(accountRef, {
        reservedEarningTokens:  FieldValue.increment(-params.tokenAmount),
        availableEarningTokens: FieldValue.increment(params.tokenAmount),
        updatedAt:              FieldValue.serverTimestamp(),
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Clawback (C8: refund/chargeback reversal)
// ─────────────────────────────────────────────────────────────────────────────

export async function clawbackCreatorEarning(params: {
  creatorId: string;
  payerId: string;
  tokenAmount: number;
  idempotencyKey: string;
  sourceRef?: string;
}): Promise<{ entryId: string; tokensClawedBack: number }> {
  const { creatorId, payerId, tokenAmount, idempotencyKey, sourceRef } = params;

  return db.runTransaction(async (transaction) => {
    const sentinelRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existing    = await transaction.get(sentinelRef);
    if (existing.exists) return { entryId: idempotencyKey, tokensClawedBack: 0 };

    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const snap        = await transaction.get(accountRef);
    if (!snap.exists) return { entryId: idempotencyKey, tokensClawedBack: 0 };

    const account = snap.data() as CreatorEarningAccount;
    const fromPending   = Math.min(tokenAmount, account.pendingTokens);
    const fromAvailable = Math.min(tokenAmount - fromPending, account.availableEarningTokens ?? 0);
    const total         = fromPending + fromAvailable;

    if (total > 0) {
      transaction.update(accountRef, {
        pendingTokens:          FieldValue.increment(-fromPending),
        availableEarningTokens: FieldValue.increment(-fromAvailable),
        updatedAt:       FieldValue.serverTimestamp(),
      });
    }

    const entryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    transaction.set(db.collection(CREATOR_EARNING_LEDGER).doc(entryId), {
      entryId, creatorId, payerId,
      type: 'EARNING_CLAWBACK' as EarningEventType,
      tokenAmount: -total,
      grossUsd: -computeGrossUsd(total),
      idempotencyKey, holdsUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      ...(sourceRef && { sourceRef }),
    } as CreatorEarningLedgerEntry);

    transaction.set(sentinelRef, {
      eventId: idempotencyKey, type: 'EARNING_CLAWBACK',
      creatorId, payerId, tokenAmount: -total,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { entryId, tokensClawedBack: total };
  });
}
