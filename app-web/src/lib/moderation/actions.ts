/**
 * Moderation Actions — Client-side helpers for moderation operations.
 *
 * All moderation actions are executed via Cloud Functions to ensure
 * proper authorization, audit logging, and security rules enforcement.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export type ModerationActionType =
  | 'WARN'
  | 'MUTE'
  | 'SUSPEND'
  | 'BAN'
  | 'UNBAN'
  | 'DISMISS'
  | 'ESCALATE'
  | 'RESOLVE'
  | 'APPROVE_APPEAL'
  | 'DENY_APPEAL';

export interface ModerationActionResult {
  success: boolean;
  actionId?: string;
  error?: string;
}

/**
 * Apply a moderation action to a user or incident.
 */
export async function applyModerationAction(
  actionType: ModerationActionType,
  targetUserId: string,
  reason: string,
  incidentId?: string,
  duration?: number,
): Promise<ModerationActionResult> {
  const fn = httpsCallable<
    {
      actionType: ModerationActionType;
      targetUserId: string;
      reason: string;
      incidentId?: string;
      duration?: number;
    },
    ModerationActionResult
  >(functions, 'applyModerationAction');

  const result = await fn({
    actionType,
    targetUserId,
    reason,
    incidentId,
    duration,
  });

  return result.data;
}

/**
 * Update appeal status (convenience wrapper for moderation action on appeals).
 */
export async function updateAppealStatus(
  appealId: string,
  status: 'APPROVED' | 'DENIED',
  reason: string,
  targetUserId: string,
): Promise<ModerationActionResult> {
  const actionType: ModerationActionType = status === 'APPROVED' ? 'APPROVE_APPEAL' : 'DENY_APPEAL';
  return applyModerationAction(actionType, targetUserId, reason, appealId);
}
