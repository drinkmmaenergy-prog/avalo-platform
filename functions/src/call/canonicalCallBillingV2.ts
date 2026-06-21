/**
 * ============================================================================
 * CANONICAL CALL BILLING V2
 * ============================================================================
 *
 * Replaces callBilling.ts. Key corrections vs V1:
 *
 *  1. Creator call earnings route through canonicalEarningService.recordCreatorEarning()
 *     → pendingEarningTokens with risk-tier hold period (NEW=7d, VERIFIED=3d, TRUSTED=1d, HIGH_RISK=14d)
 *     → NOT directly to wallets/{uid}.balance
 *
 *  2. Fan debit and creator earning credit are committed atomically in a single
 *     Firestore transaction per billing window.
 *
 *  3. Idempotency key: `call_bill:{callSessionId}:{billingWindowId}`
 *     Retrying the same billing window is always safe.
 *
 *  4. Age guard required for both participants before billing starts.
 *
 *  5. Fail closed: if the earning ledger write fails, the entire transaction rolls
 *     back — fan is NOT charged without creator receiving credit.
 *
 * Earning flow per call billing window:
 *   Fan wallet       wallets/{fanId}.balance          → debit totalTokens
 *   Platform wallet  [REMOVED] — §1.2: no platform credit at billing time
 *   Creator ledger   creatorEarningAccounts/{creatorId}.pendingEarningTokens → credit earnerTokens (100%)
 *   Creator ledger entry  creatorEarningLedger/{entryId}               → immutable event
 *   Billing event    billingEvents/{idempotencyKey}                     → immutable payer audit
 *
 * @module call/canonicalCallBillingV2
 * @version 2.0.0
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireVerifiedAdult }     from '../compliance/ageGuard';
import {
  BASE_CREATOR_RESPONSE_RATE_TOKENS,
  CreatorEarningAccount,
  BillingEvent,
  getCreatorRiskTier,
  computeHoldRelease,
  computeGrossUsd,
} from '../creator/canonicalEarningService';

const db = getFirestore();

// ── Constants ─────────────────────────────────────────────────────────────────

const CREATOR_EARNING_ACCOUNTS = 'creatorEarningAccounts';
const CREATOR_EARNING_LEDGER   = 'creatorEarningLedger';
const BILLING_EVENTS           = 'billingEvents';
const WALLETS                  = 'wallets';

/** Creator earns 100% of charged tokens. Avalo 20% commission taken at PAYOUT time only. */
// No token split at delivery — see §1.2: creatorEarningTokens = payerTokensCharged

// ── Types ─────────────────────────────────────────────────────────────────────

export type CallMode = 'VOICE' | 'VIDEO';
export type CallBillingStatus = 'CHARGED' | 'PARTIALLY_CHARGED' | 'FAILED' | 'SKIPPED';

export interface CallBillingResult {
  callSessionId:      string;
  billingWindowId:    string;
  idempotencyKey:     string;
  totalTokensCharged: number;
  earnerTokens:       number;  // = totalTokensCharged (no split; commission at payout only)
  billingStatus:      CallBillingStatus;
  billingEventId:     string;
  ledgerEntryId:      string;
}

export interface CallBillingParams {
  callSessionId:   string;
  billingWindowId: string;  // e.g. 'minute_1', 'final', or a UUID for the window
  fanId:           string;
  creatorId:       string;
  totalTokens:     number;  // tokens to charge fan for this window
  callMode:        CallMode;
  tokensPerMinute: number;
  billedMinutes:   number;
  allowPartialCharge?: boolean;  // default true — charge available balance if < total
}

// ── Main billing function ─────────────────────────────────────────────────────

/**
 * Bill one call billing window atomically.
 *
 * Atomic guarantees (single Firestore transaction):
 *   • Fan wallet debited
 *   • Creator earning account credited (pendingEarningTokens with hold)
 *   • Platform wallet credited
 *   • Immutable billing event written
 *   • Immutable earning ledger entry written
 *   • Idempotency sentinel written (prevents double-charge on retry)
 *
 * Fails closed: if any step fails, the entire transaction rolls back.
 * Retrying with the same idempotencyKey is always safe (idempotent).
 */
export async function billCallWindow(params: CallBillingParams): Promise<CallBillingResult> {
  const {
    callSessionId, billingWindowId, fanId, creatorId,
    totalTokens, callMode, tokensPerMinute, billedMinutes,
    allowPartialCharge = true,
  } = params;

  // ── Age guard — fail closed if either party is unverified ────────────────
  await requireVerifiedAdult(fanId);
  await requireVerifiedAdult(creatorId);

  if (!Number.isInteger(totalTokens) || totalTokens < 0) {
    throw new Error(`[CallBillingV2] totalTokens must be a non-negative integer, got ${totalTokens}`);
  }

  // §1.2 canonical key format: CALL_BILL:{callSessionId}:{billingWindowId}
  const idempotencyKey = `CALL_BILL:${callSessionId}:${billingWindowId}`;

  // Sub-1-minute or zero-token windows — skip billing, return clean result
  if (totalTokens === 0) {
    return {
      callSessionId, billingWindowId, idempotencyKey,
      totalTokensCharged: 0, earnerTokens: 0,
      billingStatus: 'SKIPPED',
      billingEventId: '', ledgerEntryId: '',
    };
  }

  // ── Snapshot creator risk tier BEFORE transaction ─────────────────────────
  // Per §1.7: risk tier is snapshotted at earning time, not re-read later.
  const riskTier  = await getCreatorRiskTier(creatorId, db);
  const holdsUntil = computeHoldRelease(riskTier);

  // ── Atomic transaction ────────────────────────────────────────────────────
  return db.runTransaction(async (t) => {

    // ── 1. Idempotency guard (early exit if already billed) ────────────────
    const billingEventRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existingEvent   = await t.get(billingEventRef);
    if (existingEvent.exists) {
      const ev = existingEvent.data() as BillingEvent;
      return {
        callSessionId, billingWindowId, idempotencyKey,
        totalTokensCharged: ev.payerTokensCharged,
        earnerTokens:       ev.creatorEarningTokens,
        billingStatus:      'CHARGED' as CallBillingStatus,
        billingEventId:     idempotencyKey,
        ledgerEntryId:      ev.ledgerEntryId ?? '',
      };
    }

    // ── 2. Read fan wallet ─────────────────────────────────────────────────
    const fanWalletRef  = db.collection(WALLETS).doc(fanId);
    const fanWalletSnap = await t.get(fanWalletRef);
    const fanBalance    = fanWalletSnap.exists ? (fanWalletSnap.data()!.balance as number) : 0;

    if (fanBalance <= 0) {
      // Zero balance — billing window fails; call should already be terminated
      throw new Error(`CALL_BILL_ZERO_BALANCE: fanId=${fanId} callSessionId=${callSessionId}`);
    }

    // ── 3. Determine actual charge (partial allowed if configured) ─────────
    let actualCharge: number;
    let billingStatus: CallBillingStatus;

    if (fanBalance >= totalTokens) {
      actualCharge  = totalTokens;
      billingStatus = 'CHARGED';
    } else if (allowPartialCharge && fanBalance > 0) {
      actualCharge  = fanBalance;
      billingStatus = 'PARTIALLY_CHARGED';
    } else {
      throw new Error(`CALL_BILL_INSUFFICIENT: fan=${fanId} has ${fanBalance}, needs ${totalTokens}`);
    }

    // ── 4. Creator earns full charge (§1.2: no split at delivery; commission at payout only)
    const earnerTokens = actualCharge; // 100% — Avalo 20% taken at payout via canonicalPayoutSystemV2

    // ── 5. Debit fan wallet ────────────────────────────────────────────────
    if (fanWalletSnap.exists) {
      t.update(fanWalletRef, { balance: FieldValue.increment(-actualCharge) });
    } else {
      t.set(fanWalletRef, { balance: -actualCharge, uid: fanId }); // should never be negative; guard below
      throw new Error(`CALL_BILL_NO_FAN_WALLET: fanId=${fanId}`);
    }

    // ── 6. Credit creator earning account (pendingEarningTokens with hold) ─────
    const accountRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const accountSnap = await t.get(accountRef);
    if (!accountSnap.exists) {
      const newAccount: CreatorEarningAccount = {
        creatorId,
        pendingEarningTokens:    earnerTokens,
        availableEarningTokens:  0,
        reservedEarningTokens:   0,
        paidOutEarningTokens:    0,
        refundDebtEarningTokens: 0,
        lifetimeEarnedTokens:    earnerTokens,
        payoutBlocked:           false,
        payoutBlockReason:       null,
        riskTier:                'NEW',
        trustTier:               'NEW',
        kycLevel:                'NONE',
        successfulPayoutCount:   0,
        stripeConnectAccountId:  null,
        stripeOnboardingComplete: false,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      };
      t.set(accountRef, newAccount);
    } else {
      t.update(accountRef, {
        pendingEarningTokens: FieldValue.increment(earnerTokens),
        lifetimeEarnedTokens: FieldValue.increment(earnerTokens),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // ── 8. Immutable creator earning ledger entry ──────────────────────────
    const ledgerEntryId  = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    const grossUsd       = computeGrossUsd(earnerTokens);
    t.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId:        ledgerEntryId,
      creatorId,
      payerId:        fanId,
      type:           'CALL_BILLING',
      tokenAmount:    earnerTokens,
      grossUsd,
      sessionId:      callSessionId,
      idempotencyKey,
      riskTierSnapshot: riskTier,
      holdsUntil,
      createdAt:      FieldValue.serverTimestamp(),
      metadata: {
        callSessionId, billingWindowId, callMode, tokensPerMinute, billedMinutes,
        totalCharged: actualCharge, creatorShare: earnerTokens,
      },
    });

    // ── 9. Immutable billing event (payer audit) ───────────────────────────
    t.set(billingEventRef, {
      eventId:              idempotencyKey,
      payerId:              fanId,
      creatorId,
      type:                 'CALL_BILLING',
      payerTokensCharged:   actualCharge,
      creatorEarningTokens: earnerTokens,
      sessionId:            callSessionId,
      idempotencyKey,
      ledgerEntryId,
      createdAt:            FieldValue.serverTimestamp(),
      metadata: { callSessionId, billingWindowId, callMode, tokensPerMinute, billedMinutes },
    });

    return {
      callSessionId, billingWindowId, idempotencyKey,
      totalTokensCharged: actualCharge,
      earnerTokens, billingStatus,
      billingEventId: idempotencyKey, ledgerEntryId,
    };
  });
}

/**
 * Bill a completed call session end-to-end (full or partial charge).
 *
 * This replaces billCall() in callBilling.ts.
 * Call this from call session end handlers / schedulers.
 */
export async function billCompletedCall(params: {
  callSessionId:    string;
  fanId:            string;
  creatorId:        string;
  durationSeconds:  number;
  tokensPerMinute:  number;
  callMode:         CallMode;
}): Promise<CallBillingResult> {
  const { callSessionId, fanId, creatorId, durationSeconds, tokensPerMinute, callMode } = params;

  const billedMinutes = Math.ceil(durationSeconds / 60);
  const totalTokens   = billedMinutes * tokensPerMinute;

  return billCallWindow({
    callSessionId,
    billingWindowId: 'final',
    fanId, creatorId,
    totalTokens,
    callMode,
    tokensPerMinute,
    billedMinutes,
    allowPartialCharge: true,
  });
}

/**
 * Check if a fan has sufficient balance to start or continue a call.
 * Reads wallets/{fanId}.balance — canonical consumer wallet only.
 */
export async function checkCallBalance(
  fanId:          string,
  tokensPerMinute: number,
  minMinutes:      number = 1,
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  const required    = tokensPerMinute * minMinutes;
  const walletSnap  = await db.collection(WALLETS).doc(fanId).get();
  const balance     = walletSnap.exists ? (walletSnap.data()!.balance as number) : 0;
  return { sufficient: balance >= required, balance, required };
}
