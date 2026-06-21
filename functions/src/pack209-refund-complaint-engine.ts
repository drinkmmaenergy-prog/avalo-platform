/**
 * HARD_DISABLED_COMPATIBILITY [G6a]
 *
 * Original pack209-refund-complaint-engine.ts archived to src-legacy-archive/.
 * This stub exists only to satisfy calendar.ts imports while all callers are
 * behind HARD_DISABLED throws (unreachable). No original implementation bodies remain.
 *
 * Canonical replacement: canonicalCalendarBillingV2.ts (not yet implemented).
 * Forbidden patterns removed: wallet/current, wallet/main, 65/35 split, Date.now() idempotency.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { RefundCalculation, ComplaintResponse, VoluntaryRefundResponse } from './pack209-refund-complaint-types';

/** HARD_DISABLED [G6a] - original used wallet/current. Canonical replacement pending. */
export async function calculateMeetingRefund(_params: {
  bookingId: string;
  meetingStartTime: Date;
  priceTokens: number;
  earnerTokens: number;
  platformCommission: number;
  cancelledBy: 'payer' | 'earner';
}): Promise<RefundCalculation> {
  throw new HttpsError(
    'failed-precondition',
    'HARD_DISABLED [G6a]: calculateMeetingRefund used wallet/current (forbidden).',
  );
}

/** HARD_DISABLED [G6a] - original used wallet/current. Canonical replacement pending. */
export async function processAppearanceComplaint(_params: {
  bookingId: string;
  complainantId: string;
  reportedUserId: string;
  liveSelfiUSDl?: string;
  decision: string;
  notes?: string;
  mismatchScore?: number;
  location?: unknown;
  deviceId?: string;
  ipHash?: string;
}): Promise<ComplaintResponse> {
  throw new HttpsError(
    'failed-precondition',
    'HARD_DISABLED [G6a]: processAppearanceComplaint used wallet/current (forbidden).',
  );
}

/** HARD_DISABLED [G6a] - original used wallet/current. Canonical replacement pending. */
export async function processVoluntaryMeetingRefund(_params: {
  bookingId: string;
  earnerId: string;
  refundPercent: number;
  reason?: string;
}): Promise<VoluntaryRefundResponse> {
  throw new HttpsError(
    'failed-precondition',
    'HARD_DISABLED [G6a]: processVoluntaryMeetingRefund used wallet/current (forbidden).',
  );
}

/** HARD_DISABLED [G6a] - original used wallet/current. Canonical replacement pending. */
export async function getUserRefundHistory(_params: {
  userId: string;
  limit: number;
}): Promise<{ refunds: unknown[]; voluntaryRefunds: unknown[]; complaints: unknown[] }> {
  throw new HttpsError(
    'failed-precondition',
    'HARD_DISABLED [G6a]: getUserRefundHistory used wallet/current (forbidden).',
  );
}
