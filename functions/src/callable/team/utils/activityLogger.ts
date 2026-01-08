/**
 * PACK 123 - Team Activity Logger
 * 
 * Comprehensive audit logging for all team member actions
 */

import * as admin from 'firebase-admin';
import { TeamAction, TeamActionMetadata } from '../../../types/team';

interface LogActivityParams {
  userId: string;
  memberUserId: string;
  action: TeamAction;
  target: string;
  metadata: TeamActionMetadata;
  success: boolean;
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  errorMessage?: string;
}

export async function logTeamActivity(params: LogActivityParams): Promise<void> {
  const db = admin.firestore();
  
  try {
    const logId = db.collection('team_activity_log').doc().id;
    
    await db.collection('team_activity_log').doc(logId).set({
      id: logId,
      userId: params.userId,
      memberUserId: params.memberUserId,
      action: params.action,
      target: params.target,
      metadata: params.metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: params.ipAddress,
      deviceFingerprint: params.deviceFingerprint,
      userAgent: params.userAgent,
      success: params.success,
      errorMessage: params.errorMessage,
    });

    // If this is a high-risk action, trigger additional monitoring
    if (isHighRiskAction(params.action)) {
      await triggerSecurityMonitoring(params);
    }
  } catch (error) {
    console.error('Failed to log team activity:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

function isHighRiskAction(action: TeamAction): boolean {
  return [
    'remove_member',
    'grant_dm_access',
    'respond_dm',
    'view_messages',
    'suspicious_activity_detected',
    'permission_denied',
  ].includes(action);
}

async function triggerSecurityMonitoring(params: LogActivityParams): Promise<void> {
  const db = admin.firestore();
  
  // Create security alert for high-risk actions
  await db.collection('security_alerts').add({
    type: 'team_high_risk_action',
    userId: params.userId,
    memberUserId: params.memberUserId,
    action: params.action,
    target: params.target,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    severity: 'medium',
    status: 'pending_review',
  });
}

export async function getTeamActivityLogs(
  userId: string,
  options: {
    limit?: number;
    startAfter?: admin.firestore.Timestamp;
    memberUserId?: string;
    action?: TeamAction;
  } = {}
): Promise<any[]> {
  const db = admin.firestore();
  
  let query = db
    .collection('team_activity_log')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc');

  if (options.memberUserId) {
    query = query.where('memberUserId', '==', options.memberUserId);
  }

  if (options.action) {
    query = query.where('action', '==', options.action);
  }

  if (options.startAfter) {
    query = query.startAfter(options.startAfter);
  }

  query = query.limit(options.limit || 100);

  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data());
}