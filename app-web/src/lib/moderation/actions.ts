/**
 * Moderation Actions — Apply moderation actions via Cloud Functions.
 */

import { httpsCallable } from 'firebase/functions';
import { requireFunctions } from '@/lib/firebase';

export type ModerationActionType =
  | 'WARN'
  | 'MUTE'
  | 'SUSPEND'
  | 'BAN'
  | 'BAN_PERMANENT'
  | 'RESTRICT'
  | 'SHADOWBAN'
  | 'ESCALATE'
  | 'RESOLVE'
  | 'DISMISS'
  | 'APPROVE_APPEAL'
  | 'REJECT_APPEAL'
  | 'UNLOCK';

interface ModerationActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface ApplyModerationActionParams {
  /** User ID targeted by action. Pass as `userId` or `targetId`. */
  userId?: string;
  targetId?: string;
  targetType?: string;
  action: ModerationActionType | string;
  reason?: string;
  duration?: string | number;
  moderatorNote?: string;
}

interface UpdateAppealStatusParams {
  appealId: string;
  status: string;
}

/**
 * Apply a moderation action via Cloud Function.
 */
export async function applyModerationAction(
  params: ApplyModerationActionParams,
): Promise<ModerationActionResult> {
  try {
    const fn = httpsCallable<ApplyModerationActionParams, ModerationActionResult>(
      requireFunctions(),
      'moderation_applyAction',
    );

    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[moderation] applyAction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply action',
    };
  }
}

/**
 * Update the status of a moderation appeal via Cloud Function.
 */
export async function updateAppealStatus(
  params: UpdateAppealStatusParams,
): Promise<ModerationActionResult> {
  try {
    const fn = httpsCallable<UpdateAppealStatusParams, ModerationActionResult>(
      requireFunctions(),
      'moderation_updateAppealStatus',
    );

    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[moderation] updateAppealStatus error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update appeal status',
    };
  }
}
