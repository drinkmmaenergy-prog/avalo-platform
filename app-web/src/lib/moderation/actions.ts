export type UpdateAppealStatusInput = {
  appealId: string;
  status: string;
  moderatorNote?: string;
};

export type ModerationActionType =
  | 'WARN'
  | 'RESTRICT'
  | 'SUSPEND'
  | 'SHADOWBAN'
  | 'BAN_PERMANENT'
  | 'BAN'
  | 'UNLOCK'
  | 'REMOVE';

export type ApplyModerationActionInput = {
  targetId?: string;
  targetType?: 'USER' | 'CONTENT' | 'INCIDENT';
  userId?: string;
  action: ModerationActionType;
  duration?: number;
  reason?: string;
  moderatorNote?: string; // ✅ CANONICAL
};


export async function updateAppealStatus(
  input: UpdateAppealStatusInput
): Promise<{ success: true }> {
  return { success: true };
}

export type ApplyModerationActionResult = {
  success: true;
  message?: string;
};

export async function applyModerationAction(
  input: ApplyModerationActionInput
): Promise<ApplyModerationActionResult> {
  return {
    success: true,
    message: 'Moderation action applied successfully',
  };
}

