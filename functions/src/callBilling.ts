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
/**
 * PACK 75 - Call Billing Engine (LEGACY — ACTIVE_PRODUCTION call path, billCall HARD_DISABLED)
 *
 * @ts-nocheck REMOVED [P7]: file now type-checked.
 * billCall() HARD_DISABLED [P7]: used forbidden EARNER_SPLIT=0.80 at delivery —
 *   violates canonical rule payerTokensCharged=creatorEarningTokens.
 *   Replacement: billCompletedCall() from call/canonicalCallBillingV2.ts
 *   calls.ts must be updated to import billCompletedCall from canonicalCallBillingV2.ts.
 * checkCallBalance() retained — reads canonical wallets/{uid}.balance via getBalance().
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

// HARD_DISABLED [P7]: forbidden EARNER_SPLIT removed — no split at delivery.
// const EARNER_SPLIT = 0.80;  // PROHIBITED — removed P7
// const AVALO_SPLIT  = 0.20;  // PROHIBITED — removed P7

/**
 * Bill a completed call session.
 * HARD_DISABLED [P7]: used forbidden 80/20 split at delivery.
 * Use billCompletedCall() from call/canonicalCallBillingV2.ts instead.
 * calls.ts endCall() must be updated before this function is re-enabled.
 */
export async function billCall(_callId: string): Promise<void> {
  throw new Error(
    'HARD_DISABLED: legacy billCall() uses forbidden 80/20 delivery split — ' +
    'migrate calls.ts to use billCompletedCall() from call/canonicalCallBillingV2.ts [P7]'
  );
  // unreachable — satisfies TS void return
}

/** @deprecated DISABLED — kept to prevent import errors while calls.ts is migrated */

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
