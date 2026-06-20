/**
 * PAYOUT KILL SWITCH
 *
 * PAYOUTS_ENABLED is hardcoded false for soft-launch.
 *
 * Immutable architecture decision:
 *   - Payouts must NEVER debit wallets/{uid}.balance.
 *   - Creator payouts must eventually debit creatorAccounts/{uid}.availableUsdCents only.
 *   - This guard must remain active until the creator USD ledger is implemented and validated.
 *
 * To enable payouts: implement the creator USD ledger, then change this constant
 * AND update the corresponding Firestore remote-config document.
 *
 * The default is false when missing, malformed, or unavailable.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

// ─────────────────────────────────────────────────────────────────────────────
// KILL SWITCH — hardcoded false, never truthy from environment
// ─────────────────────────────────────────────────────────────────────────────
export const PAYOUTS_ENABLED = false as const;

const DISABLED_MESSAGE =
  '[PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] Creator payouts are not available during the current launch phase. The creator USD earnings ledger must be implemented and validated before payouts can be enabled.';

/**
 * assertPayoutsEnabled
 *
 * MUST be the FIRST statement in every payout onCall and onRequest handler.
 * Throws before any wallet mutation, balance read, or provider call.
 *
 * @throws HttpsError('unavailable') when payouts are disabled
 */
export function assertPayoutsEnabled(): void {
  if (!PAYOUTS_ENABLED) {
    throw new HttpsError('unavailable', DISABLED_MESSAGE);
  }
}

/**
 * checkPayoutsEnabledForScheduler
 *
 * Variant for onSchedule handlers where HttpsError cannot be thrown.
 * Returns false and logs a warning when payouts are disabled.
 * Caller must check the return value and return immediately if false.
 *
 * @param jobName — the name of the scheduler for the log line
 * @returns true if payouts are enabled; false if the job should be skipped
 */
export function checkPayoutsEnabledForScheduler(jobName: string): boolean {
  if (!PAYOUTS_ENABLED) {
    logger.warn(`[PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] Scheduled payout job skipped: ${jobName}`);
    return false;
  }
  return true;
}
