/**
 * PACK 123 - Team Security Monitoring
 * 
 * Real-time security monitoring for team actions
 * Integrates with PACK 87 (Enforcement), PACK 103, PACK 104
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Monitor team activity for suspicious patterns
 */
export const monitorTeamActivity = functions.firestore
  .document('team_activity_log/{logId}')
  .onCreate(async (snapshot, context) => {
    const db = admin.firestore();
    const activity = snapshot.data();

    try {
      // Check for suspicious patterns
      const suspiciousPatterns = await detectSuspiciousActivity(activity);

      if (suspiciousPatterns.length > 0) {
        // Create security alert
        await db.collection('security_alerts').add({
          type: 'team_suspicious_activity',
          userId: activity.userId,
          memberUserId: activity.memberUserId,
          action: activity.action,
          patterns: suspiciousPatterns,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          severity: 'high',
          status: 'pending_review',
        });

        // If critical, auto-suspend member
        if (suspiciousPatterns.some(p => p.severity === 'critical')) {
          await suspendTeamMember(activity.userId, activity.memberUserId);
        }
      }

      // Rate limiting check
      await checkRateLimit(activity.memberUserId, activity.action);
    } catch (error) {
      console.error('Error monitoring team activity:', error);
    }
  });

/**
 * Detect suspicious activity patterns
 */
async function detectSuspiciousActivity(activity: any): Promise<any[]> {
  const db = admin.firestore();
  const patterns: any[] = [];

  // Pattern 1: Rapid successive actions
  const recentActions = await db
    .collection('team_activity_log')
    .where('memberUserId', '==', activity.memberUserId)
    .where('timestamp', '>', new Date(Date.now() - 60000)) // Last minute
    .get();

  if (recentActions.size > 10) {
    patterns.push({
      type: 'rapid_actions',
      severity: 'medium',
      count: recentActions.size,
    });
  }

  // Pattern 2: Failed authentication attempts
  if (activity.action === 'login_attempt' && !activity.success) {
    const failedLogins = await db
      .collection('team_activity_log')
      .where('memberUserId', '==', activity.memberUserId)
      .where('action', '==', 'login_attempt')
      .where('success', '==', false)
      .where('timestamp', '>', new Date(Date.now() - 3600000)) // Last hour
      .get();

    if (failedLogins.size >= 5) {
      patterns.push({
        type: 'failed_logins',
        severity: 'critical',
        count: failedLogins.size,
      });
    }
  }

  // Pattern 3: Bulk DM access patterns
  if (activity.action === 'view_messages') {
    const dmViews = await db
      .collection('team_activity_log')
      .where('memberUserId', '==', activity.memberUserId)
      .where('action', '==', 'view_messages')
      .where('timestamp', '>', new Date(Date.now() - 300000)) // Last 5 minutes
      .get();

    if (dmViews.size > 50) {
      patterns.push({
        type: 'bulk_message_access',
        severity: 'critical',
        count: dmViews.size,
      });
    }
  }

  // Pattern 4: Off-hours access from unusual location
  const hour = new Date().getHours();
  if (hour >= 2 && hour <= 5) {
    patterns.push({
      type: 'off_hours_access',
      severity: 'low',
      hour,
    });
  }

  // Pattern 5: Permission escalation attempts
  if (!activity.success && activity.action === 'permission_denied') {
    const deniedAttempts = await db
      .collection('team_activity_log')
      .where('memberUserId', '==', activity.memberUserId)
      .where('action', '==', 'permission_denied')
      .where('timestamp', '>', new Date(Date.now() - 3600000))
      .get();

    if (deniedAttempts.size > 3) {
      patterns.push({
        type: 'escalation_attempts',
        severity: 'high',
        count: deniedAttempts.size,
      });
    }
  }

  return patterns;
}

/**
 * Check rate limits for team member actions
 */
async function checkRateLimit(memberUserId: string, action: string): Promise<void> {
  const db = admin.firestore();

  const rateLimits: Record<string, { window: number; limit: number }> = {
    view_messages: { window: 60000, limit: 100 }, // 100 per minute
    respond_dm: { window: 60000, limit: 30 }, // 30 per minute
    create_post: { window: 300000, limit: 10 }, // 10 per 5 minutes
    edit_profile: { window: 60000, limit: 5 }, // 5 per minute
  };

  const rateLimit = rateLimits[action];
  if (!rateLimit) return;

  const recentActions = await db
    .collection('team_activity_log')
    .where('memberUserId', '==', memberUserId)
    .where('action', '==', action)
    .where('timestamp', '>', new Date(Date.now() - rateLimit.window))
    .get();

  if (recentActions.size > rateLimit.limit) {
    // Rate limit exceeded - create alert
    await db.collection('security_alerts').add({
      type: 'rate_limit_exceeded',
      memberUserId,
      action,
      count: recentActions.size,
      limit: rateLimit.limit,
      window: rateLimit.window,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      severity: 'medium',
      status: 'auto_handled',
    });

    // Auto-suspend for severe violations
    if (recentActions.size > rateLimit.limit * 2) {
      const membership = await db
        .collection('team_memberships')
        .where('memberUserId', '==', memberUserId)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!membership.empty) {
        await membership.docs[0].ref.update({
          status: 'suspended',
          'metadata.removalReason': 'rate_limit_exceeded',
          'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }
}

/**
 * Auto-suspend team member for critical violations
 */
async function suspendTeamMember(ownerUserId: string, memberUserId: string): Promise<void> {
  const db = admin.firestore();

  const membership = await db
    .collection('team_memberships')
    .where('ownerUserId', '==', ownerUserId)
    .where('memberUserId', '==', memberUserId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!membership.empty) {
    await membership.docs[0].ref.update({
      status: 'suspended',
      dmAccessGranted: false,
      'metadata.removalReason': 'suspicious_activity_detected',
      'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify owner
    await db.collection('notification_queue').add({
      type: 'team_member_suspended',
      recipientUserId: ownerUserId,
      data: {
        memberUserId,
        reason: 'Suspicious activity detected - member auto-suspended',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
    });
  }
}

/**
 * Device fingerprint validation
 */
export const validateDeviceFingerprint = functions.https.onCall(
  async (data: { membershipId: string; deviceFingerprint: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
    }

    const db = admin.firestore();
    const membershipDoc = await db
      .collection('team_memberships')
      .doc(data.membershipId)
      .get();

    if (!membershipDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Membership not found');
    }

    const membership = membershipDoc.data();
    if (!membership) return { valid: false };

    // Check if device is recognized
    const knownFingerprints = membership.deviceFingerprints || [];
    const isKnownDevice = knownFingerprints.includes(data.deviceFingerprint);

    if (!isKnownDevice) {
      // New device detected - flag for review
      await db.collection('security_alerts').add({
        type: 'new_device_detected',
        userId: membership.ownerUserId,
        memberUserId: membership.memberUserId,
        deviceFingerprint: data.deviceFingerprint,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        severity: 'low',
        status: 'pending_review',
      });

      // Add to known devices
      await membershipDoc.ref.update({
        deviceFingerprints: admin.firestore.FieldValue.arrayUnion(data.deviceFingerprint),
      });
    }

    return { valid: true, isNewDevice: !isKnownDevice };
  }
);