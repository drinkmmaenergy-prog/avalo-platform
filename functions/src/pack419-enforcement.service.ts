/**
 * PACK 419 — Abuse Enforcement Service
 * 
 * Core backend service for unified enforcement decisions, restrictions,
 * and user appeals. Integrates with PACK 190 (Reports), 296 (Audit Logs),
 * 302 (Fraud), 417 (Incidents), and all feature packs that need enforcement.
 */

import * as admin from 'firebase-admin';
import {
  EnforcementDecision,
  EnforcementAppeal,
  EnforcementActionType,
  EnforcementScope,
  EnforcementSource,
  AppealStatus,
  IssueEnforcementInput,
  CreateAppealInput,
  UpdateAppealStatusInput,
  EnforcementErrorCode,
  RestrictionCheckResult,
  EnforcementDecisionUserView,
  EnforcementStats,
  EnforcementReasonCode,
} from '../../shared/types/pack419-enforcement.types';

const db = admin.firestore();

/**
 * Custom error class for enforcement operations
 */
export class EnforcementError extends Error {
  constructor(
    public code: EnforcementErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'EnforcementError';
  }
}

/**
 * Policy validation: Ensure enforcement action is compatible with violation type
 */
function validateEnforcementPolicy(input: IssueEnforcementInput): void {
  // CSAM violations MUST be permanent ban with full account restriction
  if (input.reasonCode === 'CSAM') {
    if (input.action !== EnforcementActionType.PERMA_BAN) {
      throw new EnforcementError(
        EnforcementErrorCode.INVALID_ACTION_FOR_VIOLATION,
        'CSAM violations require PERMA_BAN action'
      );
    }
    if (!input.scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
      throw new EnforcementError(
        EnforcementErrorCode.INVALID_SCOPE_COMBINATION,
        'CSAM violations require ACCOUNT_FULL scope'
      );
    }
    if (!input.scopes.includes(EnforcementScope.MONETIZATION)) {
      throw new EnforcementError(
        EnforcementErrorCode.INVALID_SCOPE_COMBINATION,
        'CSAM violations require MONETIZATION scope restriction'
      );
    }
  }

  // MINOR_DETECTED must be permanent ban
  if (input.reasonCode === 'MINOR_DETECTED') {
    if (input.action !== EnforcementActionType.PERMA_BAN) {
      throw new EnforcementError(
        EnforcementErrorCode.INVALID_ACTION_FOR_VIOLATION,
        'Underage detection requires PERMA_BAN action'
      );
    }
    if (!input.scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
      throw new EnforcementError(
        EnforcementErrorCode.INVALID_SCOPE_COMBINATION,
        'Underage detection requires ACCOUNT_FULL scope'
      );
    }
  }

  // PERMA_BAN should not have expiresAt
  if (input.action === EnforcementActionType.PERMA_BAN && input.expiresAt) {
    throw new EnforcementError(
      EnforcementErrorCode.INVALID_ACTION_FOR_VIOLATION,
      'PERMA_BAN cannot have expiry date'
    );
  }

  // TEMP_RESTRICTION must have expiresAt
  if (input.action === EnforcementActionType.TEMP_RESTRICTION && !input.expiresAt) {
    throw new EnforcementError(
      EnforcementErrorCode.INVALID_ACTION_FOR_VIOLATION,
      'TEMP_RESTRICTION must have expiry date'
    );
  }

  // WARNING should not restrict ACCOUNT_FULL
  if (input.action === EnforcementActionType.WARNING && 
      input.scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
    throw new EnforcementError(
      EnforcementErrorCode.INVALID_SCOPE_COMBINATION,
      'WARNING action should not include ACCOUNT_FULL scope'
    );
  }

  // Validate scopes array is not empty
  if (!input.scopes || input.scopes.length === 0) {
    throw new EnforcementError(
      EnforcementErrorCode.INVALID_SCOPE_COMBINATION,
      'At least one enforcement scope is required'
    );
  }
}

/**
 * Log enforcement action to audit system (PACK 296)
 */
async function logEnforcementAction(
  action: string,
  userId: string,
  details: any,
  adminId?: string | null
): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      action,
      category: 'ENFORCEMENT',
      userId,
      adminId: adminId || null,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      severity: action.includes('BAN') ? 'CRITICAL' : 'HIGH',
    });
  } catch (error) {
    console.error('Failed to log enforcement action:', error);
    // Don't throw - logging failure shouldn't block enforcement
  }
}

/**
 * Issue a new enforcement decision
 * Called by abuse/fraud/safety systems to restrict user access
 */
export async function issueEnforcementDecision(
  input: IssueEnforcementInput
): Promise<EnforcementDecision> {
  // Validate policy compliance
  validateEnforcementPolicy(input);

  const now = Date.now();
  const decisionId = db.collection('enforcementDecisions').doc().id;

  // Determine if action is appealable (configurable by policy)
  const isAppealable = input.isAppealable !== undefined 
    ? input.isAppealable 
    : determineAppealability(input);

  const decision: EnforcementDecision = {
    id: decisionId,
    userId: input.userId,
    action: input.action,
    scopes: input.scopes,
    reasonCode: input.reasonCode,
    source: input.source,
    createdAt: now,
    expiresAt: input.expiresAt || null,
    createdByAdminId: input.createdByAdminId || null,
    linkedIncidentId: input.linkedIncidentId || null,
    linkedReportId: input.linkedReportId || null,
    isAppealable,
    appealId: null,
    internalNotes: input.internalNotes,
    evidence: input.evidence,
    isActive: true,
    supersededBy: null,
    updatedAt: now,
  };

  // Persist to Firestore
  await db.collection('enforcementDecisions').doc(decisionId).set(decision);

  // Log to audit system
  await logEnforcementAction(
    'ENFORCEMENT_ISSUED',
    input.userId,
    {
      decisionId,
      action: input.action,
      scopes: input.scopes,
      reasonCode: input.reasonCode,
      source: input.source,
      linkedIncidentId: input.linkedIncidentId,
      linkedReportId: input.linkedReportId,
    },
    input.createdByAdminId
  );

  // TODO: Trigger notification to user (PACK 293)
  // TODO: Update incident if linked (PACK 417)

  return decision;
}

/**
 * Determine if an enforcement action should be appealable
 */
function determineAppealability(input: IssueEnforcementInput): boolean {
  // CSAM and MINOR_DETECTED are never appealable
  if (input.reasonCode === 'CSAM' || input.reasonCode === 'MINOR_DETECTED') {
    return false;
  }

  // PERMA_BAN from FRAUD_ENGINE might not be appealable
  if (input.action === EnforcementActionType.PERMA_BAN && 
      input.source === EnforcementSource.FRAUD_ENGINE) {
    return false;
  }

  // Most other actions are appealable
  return input.action !== EnforcementActionType.WARNING;
}

/**
 * Get all active enforcement decisions for a user
 */
export async function getActiveEnforcementForUser(
  userId: string
): Promise<EnforcementDecision[]> {
  const now = Date.now();

  const snapshot = await db
    .collection('enforcementDecisions')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .orderBy('createdAt', 'desc')
    .get();

  const decisions: EnforcementDecision[] = [];

  for (const doc of snapshot.docs) {
    const decision = doc.data() as EnforcementDecision;

    // Check if temporary restriction has expired
    if (decision.expiresAt && decision.expiresAt <= now) {
      // Mark as inactive (expired)
      await doc.ref.update({ isActive: false, updatedAt: now });
      continue;
    }

    decisions.push(decision);
  }

  return decisions;
}

/**
 * Check if user is restricted in a specific scope
 * This is the primary gateway for feature-level enforcement checks
 */
export async function isUserRestricted(
  userId: string,
  scope: EnforcementScope
): Promise<RestrictionCheckResult> {
  const activeDecisions = await getActiveEnforcementForUser(userId);

  // Check for any decision that affects the requested scope
  for (const decision of activeDecisions) {
    // ACCOUNT_FULL scope affects everything
    if (decision.scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
      return {
        isRestricted: true,
        enforcement: decision,
        scopes: decision.scopes,
        expiresAt: decision.expiresAt,
      };
    }

    // Check specific scope
    if (decision.scopes.includes(scope)) {
      return {
        isRestricted: true,
        enforcement: decision,
        scopes: decision.scopes,
        expiresAt: decision.expiresAt,
      };
    }
  }

  return { isRestricted: false };
}

/**
 * Create an appeal for an enforcement decision
 */
export async function createAppeal(
  input: CreateAppealInput
): Promise<EnforcementAppeal> {
  // Validate enforcement exists and is appealable
  const enforcementDoc = await db
    .collection('enforcementDecisions')
    .doc(input.enforcementId)
    .get();

  if (!enforcementDoc.exists) {
    throw new EnforcementError(
      EnforcementErrorCode.ENFORCEMENT_NOT_FOUND,
      'Enforcement decision not found'
    );
  }

  const enforcement = enforcementDoc.data() as EnforcementDecision;

  // Verify it's the user's own enforcement
  if (enforcement.userId !== input.userId) {
    throw new EnforcementError(
      EnforcementErrorCode.INSUFFICIENT_PERMISSIONS,
      'Cannot appeal enforcement for another user'
    );
  }

  // Verify it's appealable
  if (!enforcement.isAppealable) {
    throw new EnforcementError(
      EnforcementErrorCode.NOT_APPEALABLE,
      'This enforcement decision is not appealable'
    );
  }

  // Check for existing active appeal
  const existingAppealSnapshot = await db
    .collection('enforcementAppeals')
    .where('enforcementId', '==', input.enforcementId)
    .where('status', 'in', [AppealStatus.PENDING, AppealStatus.ESCALATED])
    .limit(1)
    .get();

  if (!existingAppealSnapshot.empty) {
    throw new EnforcementError(
      EnforcementErrorCode.APPEAL_ALREADY_EXISTS,
      'An active appeal already exists for this enforcement'
    );
  }

  const now = Date.now();
  const appealId = db.collection('enforcementAppeals').doc().id;

  const appeal: EnforcementAppeal = {
    id: appealId,
    userId: input.userId,
    enforcementId: input.enforcementId,
    status: AppealStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    userMessage: input.userMessage,
    staffNotes: undefined,
    resolvedByAdminId: null,
    resolvedAt: undefined,
    userEvidence: input.userEvidence,
    outcome: undefined,
  };

  // Persist appeal
  await db.collection('enforcementAppeals').doc(appealId).set(appeal);

  // Update enforcement with appeal ID
  await enforcementDoc.ref.update({
    appealId,
    updatedAt: now,
  });

  // Log to audit system
  await logEnforcementAction(
    'APPEAL_CREATED',
    input.userId,
    { appealId, enforcementId: input.enforcementId },
    null
  );

  // TODO: Notify admins of new appeal (PACK 293)

  return appeal;
}

/**
 * Update appeal status (admin action)
 */
export async function updateAppealStatus(
  input: UpdateAppealStatusInput
): Promise<EnforcementAppeal> {
  const appealDoc = await db
    .collection('enforcementAppeals')
    .doc(input.appealId)
    .get();

  if (!appealDoc.exists) {
    throw new EnforcementError(
      EnforcementErrorCode.APPEAL_NOT_FOUND,
      'Appeal not found'
    );
  }

  const appeal = appealDoc.data() as EnforcementAppeal;
  const now = Date.now();

  // Prepare updates
  const updates: Partial<EnforcementAppeal> = {
    status: input.status,
    updatedAt: now,
    staffNotes: input.staffNotes,
  };

  if (input.status === AppealStatus.APPROVED || input.status === AppealStatus.REJECTED) {
    updates.resolvedByAdminId = input.adminId;
    updates.resolvedAt = now;
  }

  // Handle enforcement modifications if appeal approved
  if (input.status === AppealStatus.APPROVED && input.enforcementModification) {
    const enforcementDoc = await db
      .collection('enforcementDecisions')
      .doc(appeal.enforcementId)
      .get();

    if (enforcementDoc.exists) {
      const enforcement = enforcementDoc.data() as EnforcementDecision;
      const enforcementUpdates: Partial<EnforcementDecision> = {
        updatedAt: now,
      };

      if (input.enforcementModification.expireEnforcement) {
        // Expire the enforcement immediately
        enforcementUpdates.expiresAt = now;
        enforcementUpdates.isActive = false;
      } else if (input.enforcementModification.downgradeToWarning) {
        // Downgrade to warning
        enforcementUpdates.action = EnforcementActionType.WARNING;
        enforcementUpdates.expiresAt = now;
        enforcementUpdates.isActive = false;
      } else if (input.enforcementModification.newExpiryTime) {
        // Update expiry time
        enforcementUpdates.expiresAt = input.enforcementModification.newExpiryTime;
      }

      await enforcementDoc.ref.update(enforcementUpdates);

      updates.outcome = {
        enforcementModified: true,
        newEnforcementId: null,
        publicExplanation: input.publicExplanation,
      };
    }
  } else if (input.status === AppealStatus.REJECTED) {
    updates.outcome = {
      enforcementModified: false,
      newEnforcementId: null,
      publicExplanation: input.publicExplanation,
    };
  }

  // Update appeal
  await appealDoc.ref.update(updates);

  // Log to audit system
  await logEnforcementAction(
    'APPEAL_STATUS_UPDATED',
    appeal.userId,
    {
      appealId: input.appealId,
      newStatus: input.status,
      enforcementModification: input.enforcementModification,
    },
    input.adminId
  );

  // TODO: Notify user of appeal outcome (PACK 293)

  return { ...appeal, ...updates } as EnforcementAppeal;
}

/**
 * Sanitize enforcement decision for user view
 * Removes admin-only fields
 */
export function sanitizeEnforcementForUser(
  decision: EnforcementDecision
): EnforcementDecisionUserView {
  return {
    id: decision.id,
    action: decision.action,
    scopes: decision.scopes,
    reasonCode: decision.reasonCode,
    createdAt: decision.createdAt,
    expiresAt: decision.expiresAt,
    isAppealable: decision.isAppealable,
    appealId: decision.appealId,
    reasonDescription: getReasonDescription(decision.reasonCode),
  };
}

/**
 * Get user-friendly description for reason code
 */
function getReasonDescription(reasonCode: EnforcementReasonCode): string {
  const descriptions: Record<string, string> = {
    CSAM: 'Violation of child safety policies',
    HARASSMENT: 'Harassment or bullying behavior',
    SCAM: 'Fraudulent or scam activity',
    FAKE_ID: 'Identity verification violation',
    SPAM: 'Spam or excessive unwanted contact',
    HATE_SPEECH: 'Hate speech or discrimination',
    IMPERSONATION: 'Impersonating another user',
    NSFW_VIOLATION: 'Adult content policy violation',
    PAYMENT_FRAUD: 'Payment or transaction fraud',
    ACCOUNT_ABUSE: 'Multiple accounts or ban evasion',
    TOS_VIOLATION: 'Terms of service violation',
    POLICY_VIOLATION: 'Platform policy violation',
    SUSPICIOUS_ACTIVITY: 'Suspicious behavior detected',
    CHARGEBACK_ABUSE: 'Excessive payment chargebacks',
    MINOR_DETECTED: 'Underage account detected',
  };

  return descriptions[reasonCode] || 'Policy violation';
}

/**
 * Get enforcement statistics for admin dashboard
 */
export async function getEnforcementStats(
  startTime: number,
  endTime: number
): Promise<EnforcementStats> {
  // Query enforcement decisions in time range
  const decisionsSnapshot = await db
    .collection('enforcementDecisions')
    .where('createdAt', '>=', startTime)
    .where('createdAt', '<=', endTime)
    .get();

  const stats: EnforcementStats = {
    totalEnforcements: decisionsSnapshot.size,
    byAction: {
      warnings: 0,
      tempRestrictions: 0,
      permaBans: 0,
      shadowRestrictions: 0,
    },
    byScope: {} as Record<EnforcementScope, number>,
    bySource: {} as Record<EnforcementSource, number>,
    appeals: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      escalated: 0,
      approvalRate: 0,
      avgResolutionTimeMs: 0,
    },
  };

  // Initialize scope and source counters
  Object.values(EnforcementScope).forEach(scope => {
    stats.byScope[scope] = 0;
  });
  Object.values(EnforcementSource).forEach(source => {
    stats.bySource[source] = 0;
  });

  // Process decisions
  decisionsSnapshot.forEach(doc => {
    const decision = doc.data() as EnforcementDecision;

    // Count by action
    switch (decision.action) {
      case EnforcementActionType.WARNING:
        stats.byAction.warnings++;
        break;
      case EnforcementActionType.TEMP_RESTRICTION:
        stats.byAction.tempRestrictions++;
        break;
      case EnforcementActionType.PERMA_BAN:
        stats.byAction.permaBans++;
        break;
      case EnforcementActionType.SHADOW_RESTRICTION:
        stats.byAction.shadowRestrictions++;
        break;
    }

    // Count by scope
    decision.scopes.forEach(scope => {
      stats.byScope[scope]++;
    });

    // Count by source
    stats.bySource[decision.source]++;
  });

  // Query appeals in time range
  const appealsSnapshot = await db
    .collection('enforcementAppeals')
    .where('createdAt', '>=', startTime)
    .where('createdAt', '<=', endTime)
    .get();

  stats.appeals.total = appealsSnapshot.size;

  let totalResolutionTime = 0;
  let resolvedCount = 0;

  appealsSnapshot.forEach(doc => {
    const appeal = doc.data() as EnforcementAppeal;

    switch (appeal.status) {
      case AppealStatus.PENDING:
        stats.appeals.pending++;
        break;
      case AppealStatus.APPROVED:
        stats.appeals.approved++;
        break;
      case AppealStatus.REJECTED:
        stats.appeals.rejected++;
        break;
      case AppealStatus.ESCALATED:
        stats.appeals.escalated++;
        break;
    }

    // Calculate resolution time
    if (appeal.resolvedAt) {
      totalResolutionTime += appeal.resolvedAt - appeal.createdAt;
      resolvedCount++;
    }
  });

  // Calculate approval rate
  const totalResolved = stats.appeals.approved + stats.appeals.rejected;
  stats.appeals.approvalRate = totalResolved > 0 
    ? stats.appeals.approved / totalResolved 
    : 0;

  // Calculate average resolution time
  stats.appeals.avgResolutionTimeMs = resolvedCount > 0
    ? totalResolutionTime / resolvedCount
    : 0;

  return stats;
}

/**
 * Expire enforcement decision manually (admin action)
 */
export async function expireEnforcement(
  enforcementId: string,
  adminId: string,
  reason?: string
): Promise<void> {
  const now = Date.now();

  await db.collection('enforcementDecisions').doc(enforcementId).update({
    expiresAt: now,
    isActive: false,
    updatedAt: now,
    internalNotes: reason 
      ? `Manually expired by admin: ${reason}` 
      : 'Manually expired by admin',
  });

  await logEnforcementAction(
    'ENFORCEMENT_EXPIRED',
    '', // userId fetched from doc if needed
    { enforcementId, reason },
    adminId
  );
}

/**
 * Check and enforce restrictions for specific feature scopes
 * Returns standardized error if restricted
 */
export async function enforceRestriction(
  userId: string,
  scope: EnforcementScope
): Promise<void> {
  const result = await isUserRestricted(userId, scope);

  if (result.isRestricted && result.enforcement) {
    const scopeErrorMap: Record<EnforcementScope, string> = {
      [EnforcementScope.CHAT]: 'CHAT_RESTRICTED',
      [EnforcementScope.CALLS]: 'CALLS_RESTRICTED',
      [EnforcementScope.MEETINGS]: 'MEETINGS_RESTRICTED',
      [EnforcementScope.EVENTS]: 'EVENTS_RESTRICTED',
      [EnforcementScope.FEED]: 'FEED_RESTRICTED',
      [EnforcementScope.DISCOVERY]: 'DISCOVERY_RESTRICTED',
      [EnforcementScope.SWIPE]: 'SWIPE_RESTRICTED',
      [EnforcementScope.AI_COMPANIONS]: 'AI_COMPANIONS_RESTRICTED',
      [EnforcementScope.MONETIZATION]: 'MONETIZATION_RESTRICTED',
      [EnforcementScope.ACCOUNT_FULL]: 'ACCOUNT_RESTRICTED',
    };

    throw new EnforcementError(
      EnforcementErrorCode.USER_RESTRICTED,
      `User is restricted from ${scope}`,
      {
        code: scopeErrorMap[scope],
        enforcementId: result.enforcement.id,
        expiresAt: result.expiresAt,
        reasonCode: result.enforcement.reasonCode,
        isAppealable: result.enforcement.isAppealable,
        appealId: result.enforcement.appealId,
      }
    );
  }
}
