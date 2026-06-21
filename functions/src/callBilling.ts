/**
 * ⛔ DEPRECATED — DO NOT USE FOR NEW CALL BILLING
 *
 * This file credits creator earnings directly to wallets/{uid}.balance via
 * transactTokens() split — bypassing the creator earning ledger and hold period.
 *
 * ALL new call billing must use:
 *   import { billCallWindow, billCompletedCall } from './call/canonicalCallBillingV2';
 *
 * This file is retained only for legacy PACK75 call session infrastructure that
 * has not yet been migrated to canonicalCallMonetizationV2.ts.
 * It is classified: REACHABLE_DISABLED (call functions disabled in production).
 *
 * @deprecated use canonicalCallBillingV2.ts
 */
/* eslint-disable */
// @ts-nocheck
/**
 * PACK 75 - Call Billing Engine
 *
 * Handles per-minute billing for voice & video calls
 * Charges caller, pays earner (earner) with 80/20 split
 *
 * NO FREE CALLS - all calls are paid, insufficient funds = graceful termination
 *
 * Phase 2D: Migrated from phantom user_wallets paths to canonical walletService:
 *   BEFORE: user_wallets/{uid}.tokenBalance / earningsBalance (prod = 0, phantom)
 *   AFTER:  walletService.getBalance() + transactTokens() → wallets/{uid}.balance + ledger
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logEvent } from './observability';
import { admin, functions } from './runtime';
import { transactTokens, getBalance } from './wallet/walletService';
import { requireVerifiedAdult } from './compliance/ageGuard'; // C2

interface CallSession {
  callId: string;
  callerUserId: string;
  calleeUserId: string;
  mode: 'VOICE' | 'VIDEO';
  tokensPerMinute: number;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  billedMinutes: number;
  totalTokensCharged: number;
  billingStatus: 'PENDING' | 'CHARGED' | 'FAILED' | 'PARTIALLY_CHARGED';
}

/**
 * Revenue split constants for calls (80/20)
 * P0-C/D: Hardcoded to bypass monetizationSplits.ts V9 placeholder (all zeros).
 * Source of truth: canonicalEconomy.ts + callMonetization.ts (VOICE/VIDEO both 80/20).
 * Do NOT read from MONETIZATION_SPLITS until that file is fully migrated from V9.
 */
const EARNER_SPLIT = 0.80; // 80% to callee (creator)
const AVALO_SPLIT  = 0.20; // 20% to Avalo

/**
 * Bill a completed call session
 * Charges caller's canonical wallet (wallets/{uid}.balance), credits callee via walletService
 */
export async function billCall(callId: string): Promise<void> {
  try {
    // ── 1. Load call session ───────────────────────────────────────────────
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error(`Call session ${callId} not found`);
    }

    const callData = callDoc.data() as CallSession;

    // ── C2: Verified-adult guard ───────────────────────────────────────────
    // Both participants must be verified adults before billing proceeds.
    await requireVerifiedAdult(callData.callerUserId);
    await requireVerifiedAdult(callData.calleeUserId);

    // ── 2. Idempotency fast-exit (call_sessions status) ───────────────────
    // walletService.transactTokens() provides a second atomic idempotency guard
    // via idempotency_sentinels/{call_bill_{callId}}.
    if (callData.billingStatus === 'CHARGED' || callData.billingStatus === 'PARTIALLY_CHARGED') {
      console.log(`Call ${callId} already billed, skipping`);
      return;
    }

    // ── 3. Validate call has started and ended ─────────────────────────────
    if (!callData.startedAt || !callData.endedAt) {
      throw new Error(`Call ${callId} missing start or end time`);
    }

    // ── 4. Calculate duration + required tokens ────────────────────────────
    const startSeconds = callData.startedAt.toMillis() / 1000;
    const endSeconds = callData.endedAt.toMillis() / 1000;
    const durationSeconds = Math.max(0, endSeconds - startSeconds);

    const billedMinutes = Math.ceil(durationSeconds / 60);
    const requiredTokens = billedMinutes * callData.tokensPerMinute;

    // Sub-1-minute call — mark charged with zero tokens
    if (requiredTokens === 0) {
      await db.collection('call_sessions').doc(callId).update({
        billedMinutes: 0,
        totalTokensCharged: 0,
        billingStatus: 'CHARGED',
        lastUpdatedAt: serverTimestamp(),
      });
      return;
    }

    // ── 5. Read canonical balance ──────────────────────────────────────────
    // walletService.getBalance() reads wallets/{uid}.balance — the sole canonical field.
    const callerBalance = await getBalance(callData.callerUserId);

    // ── 6. Determine charge amount and call walletService ─────────────────
    let actualTokensCharged: number;
    let actualBilledMinutes: number;
    let finalBillingStatus: 'CHARGED' | 'PARTIALLY_CHARGED' | 'FAILED';

    // Single idempotency key for this call regardless of full vs partial path.
    // If transactTokens() already succeeded (sentinel exists), it returns early
    // without double-charging, even if the call_sessions update below failed.
    const idempotencyKey = `call_bill_${callId}`;

    if (callerBalance >= requiredTokens) {
      // ── Full charge ──────────────────────────────────────────────────────
      actualTokensCharged = requiredTokens;
      actualBilledMinutes = billedMinutes;
      finalBillingStatus = 'CHARGED';

      const earnerAmount  = Math.floor(requiredTokens * EARNER_SPLIT);
      const platformAmount = requiredTokens - earnerAmount; // remainder to platform

      await transactTokens({
        type: 'CALL_BILL',
        actorId: callData.callerUserId,
        counterpartyId: callData.calleeUserId,
        amountTokens: requiredTokens,
        split: {
          creatorTokens: earnerAmount,
          avaloTokens: platformAmount,
        },
        idempotencyKey,
        sessionId: callId,
        metadata: {
          callId,
          billedMinutes,
          tokensPerMinute: callData.tokensPerMinute,
          mode: callData.mode,
          chargeType: 'full',
        },
      });

      await logEvent({
        level: 'INFO',
        source: 'BACKEND',
        service: 'functions.calls',
        module: 'CALL_BILLING',
        message: `Call billed successfully: ${billedMinutes} minutes, ${requiredTokens} tokens`,
        context: {
          userId: callData.callerUserId,
          functionName: 'billCall',
        },
        details: {
          extra: {
            callId,
            billedMinutes,
            tokensCharged: requiredTokens,
            earnerAmount,
            platformAmount,
          },
        },
      });

    } else if (callerBalance > 0) {
      // ── Partial charge — use all available balance ────────────────────────
      actualTokensCharged = callerBalance;
      actualBilledMinutes = Math.floor(callerBalance / callData.tokensPerMinute);
      finalBillingStatus = 'PARTIALLY_CHARGED';

      const earnerAmount  = Math.floor(actualTokensCharged * EARNER_SPLIT);
      const platformAmount = actualTokensCharged - earnerAmount;

      await transactTokens({
        type: 'CALL_BILL',
        actorId: callData.callerUserId,
        counterpartyId: callData.calleeUserId,
        amountTokens: actualTokensCharged,
        split: {
          creatorTokens: earnerAmount,
          avaloTokens: platformAmount,
        },
        idempotencyKey,
        sessionId: callId,
        metadata: {
          callId,
          billedMinutes: actualBilledMinutes,
          tokensPerMinute: callData.tokensPerMinute,
          mode: callData.mode,
          chargeType: 'partial',
          requestedTokens: requiredTokens,
        },
      });

      await logEvent({
        level: 'WARN',
        source: 'BACKEND',
        service: 'functions.calls',
        module: 'CALL_BILLING',
        message: `Call partially billed: insufficient funds`,
        context: {
          userId: callData.callerUserId,
          functionName: 'billCall',
        },
        details: {
          extra: {
            callId,
            requestedMinutes: billedMinutes,
            billedMinutes: actualBilledMinutes,
            requestedTokens: requiredTokens,
            availableTokens: callerBalance,
            tokensCharged: actualTokensCharged,
          },
        },
      });

    } else {
      // ── Zero balance — billing failed ─────────────────────────────────────
      actualTokensCharged = 0;
      actualBilledMinutes = 0;
      finalBillingStatus = 'FAILED';

      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.calls',
        module: 'CALL_BILLING',
        message: `Call billing failed: zero balance`,
        context: {
          userId: callData.callerUserId,
          functionName: 'billCall',
        },
        details: {
          extra: {
            callId,
            requestedMinutes: billedMinutes,
            requestedTokens: requiredTokens,
          },
        },
      });
    }

    // ── 7. Update call session with billing results ────────────────────────
    await db.collection('call_sessions').doc(callId).update({
      billedMinutes: actualBilledMinutes,
      totalTokensCharged: actualTokensCharged,
      billingStatus: finalBillingStatus,
      lastUpdatedAt: serverTimestamp(),
    });

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALL_BILLING',
      message: `Call billing error: ${error.message}`,
      details: {
        stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n'),
        extra: { callId },
      },
    });

    throw error;
  }
}

/**
 * Check if user has sufficient balance for a call
 * Reads canonical wallets/{uid}.balance via walletService.getBalance()
 */
export async function checkCallBalance(
  userId: string,
  tokensPerMinute: number,
  minimumMinutes: number = 1
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  try {
    const balance = await getBalance(userId);
    const required = tokensPerMinute * minimumMinutes;

    return {
      sufficient: balance >= required,
      balance,
      required,
    };
  } catch (error) {
    console.error('Error checking call balance:', error);
    return {
      sufficient: false,
      balance: 0,
      required: tokensPerMinute * minimumMinutes,
    };
  }
}
