/**
 * PACK 449 - Insider Risk Monitoring Functions
 * 
 * Firebase Cloud Functions for automated insider risk monitoring:
 * - Periodic risk score calculations
 * - Access grant expiration
 * - Anomaly detection
 * - Alert generation
 * 
 * Dependencies:
 * - PACK 296: Compliance & Audit Layer
 * - PACK 364: Observability
 * - PACK 448: Incident Response
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// Scheduled Functions
// ============================================

/**
 * Calculate insider risk scores daily
 * Runs at 2 AM UTC daily
 */
export const calculateDailyRiskScores = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting daily risk score calculation...');
    
    try {
      // Get all internal users
      const usersSnapshot = await db.collection('internal_users').get();
      
      let processed = 0;
      let high_risk = 0;
      let critical_risk = 0;
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        try {
          // Calculate risk score
          const riskProfile = await calculateUserRiskScore(userId, userData);
          
          // Store profile
          await db.collection('insider_risk_profiles').doc(userId).set(riskProfile);
          
          // Count risk levels
          if (riskProfile.riskLevel === 'high') high_risk++;
          if (riskProfile.riskLevel === 'critical') critical_risk++;
          
          // Generate alerts if needed
          if (riskProfile.riskLevel === 'high' || riskProfile.riskLevel === 'critical') {
            await generateRiskAlert(userId, riskProfile);
          }
          
          processed++;
        } catch (error) {
          console.error(`Error calculating risk for user ${userId}:`, error);
        }
      }
      
      console.log(`Risk calculation complete. Processed: ${processed}, High Risk: ${high_risk}, Critical: ${critical_risk}`);
      
      // Log to audit
      await db.collection('audit_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'pack449_risk_calculation',
        event: 'daily_risk_scores_calculated',
        data: {
          processed,
          high_risk,
          critical_risk
        }
      });
      
    } catch (error) {
      console.error('Error in daily risk calculation:', error);
      throw error;
    }
  });

/**
 * Expire old access grants
 * Runs every hour
 */
export const expireAccessGrants = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Checking for expired access grants...');
    
    try {
      const now = admin.firestore.Timestamp.now();
      
      // Find expired grants that are not revoked
      const expiredSnapshot = await db.collection('internal_access_grants')
        .where('revoked', '==', false)
        .where('expiresAt', '<=', now)
        .get();
      
      let expired = 0;
      
      const batch = db.batch();
      
      for (const grantDoc of expiredSnapshot.docs) {
        batch.update(grantDoc.ref, {
          revoked: true,
          revokedAt: admin.firestore.FieldValue.serverTimestamp(),
          revokedBy: 'system',
          revokedReason: 'Expired'
        });
        expired++;
      }
      
      await batch.commit();
      
      console.log(`Expired ${expired} access grants`);
      
      // Audit log
      await db.collection('audit_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'pack449_access_expiration',
        event: 'access_grants_expired',
        data: { count: expired }
      });
      
    } catch (error) {
      console.error('Error expiring access grants:', error);
    }
  });

/**
 * Detect anomalous behavior
 * Runs every 6 hours
 */
export const detectAnomalies = functions.pubsub
  .schedule('0 */6 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Running anomaly detection...');
    
    try {
      // Get risk profiles
      const profilesSnapshot = await db.collection('insider_risk_profiles')
        .where('riskScore', '>=', 50)
        .get();
      
      let anomalies = 0;
      
      for (const profileDoc of profilesSnapshot.docs) {
        const profile = profileDoc.data();
        
        // Check for unusual patterns
        const hasAnomalies = await checkForAnomalies(profile);
        
        if (hasAnomalies) {
          anomalies++;
          
          // Generate alert
          await db.collection('security_events').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'anomaly_detected',
            severity: profile.riskLevel,
            userId: profile.userId,
            details: {
              riskScore: profile.riskScore,
              riskLevel: profile.riskLevel,
              factors: profile.factors
            }
          });
        }
      }
      
      console.log(`Anomaly detection complete. Found ${anomalies} anomalies`);
      
    } catch (error) {
      console.error('Error in anomaly detection:', error);
    }
  });

/**
 * Check privileged action timeouts
 * Runs every hour
 */
export const checkActionTimeouts = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Checking for timed out privileged actions...');
    
    try {
      const now = Date.now();
      
      // Get pending actions
      const pendingSnapshot = await db.collection('privileged_actions')
        .where('status', '==', 'pending')
        .get();
      
      let timedOut = 0;
      
      for (const actionDoc of pendingSnapshot.docs) {
        const action = actionDoc.data();
        const timeoutHours = getTimeoutHours(action.type);
        const expiresAt = action.createdAt.toMillis() + (timeoutHours * 60 * 60 * 1000);
        
        if (now > expiresAt) {
          // Mark as timed out
          await actionDoc.ref.update({
            status: 'denied',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            timeoutReason: `Timed out after ${timeoutHours} hours without sufficient approvals`
          });
          
          timedOut++;
          
          // Notify requester
          await db.collection('notifications').add({
            userId: action.requesterId,
            type: 'action_timeout',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            data: {
              actionId: actionDoc.id,
              actionType: action.type,
              reason: 'Insufficient approvals within timeout period'
            }
          });
        }
      }
      
      console.log(`Timed out ${timedOut} privileged actions`);
      
    } catch (error) {
      console.error('Error checking action timeouts:', error);
    }
  });

// ============================================
// Firestore Triggers
// ============================================

/**
 * Monitor access grant creation
 */
export const onAccessGrantCreated = functions.firestore
  .document('internal_access_grants/{grantId}')
  .onCreate(async (snap, context) => {
    const grant = snap.data();
    
    // Log to observability (PACK 364)
    await db.collection('observability_events').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'access_grant_created',
      userId: grant.userId,
      data: {
        grantId: context.params.grantId,
        role: grant.role,
        permissions: grant.permissions,
        duration: grant.expiresAt.toMillis() - grant.grantedAt.toMillis()
      }
    });
    
    // Check if high-risk grant
    if (isHighRiskGrant(grant)) {
      await db.collection('security_events').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'high_risk_access_granted',
        severity: 'high',
        userId: grant.userId,
        data: {
          grantId: context.params.grantId,
          role: grant.role,
          permissions: grant.permissions
        }
      });
    }
  });

/**
 * Monitor privileged action approvals
 */
export const onPrivilegedActionUpdated = functions.firestore
  .document('privileged_actions/{actionId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if status changed to approved
    if (before.status === 'pending' && after.status === 'approved') {
      // Log approval
      await db.collection('audit_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'pack449_privileged_actions',
        event: 'action_approved',
        severity: after.riskLevel,
        data: {
          actionId: context.params.actionId,
          type: after.type,
          requesterId: after.requesterId,
          approvalCount: after.approvals.length
        }
      });
      
      // Notify requester
      await db.collection('notifications').add({
        userId: after.requesterId,
        type: 'action_approved',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          actionId: context.params.actionId,
          actionType: after.type
        }
      });
    }
    
    // Check if status changed to denied
    if (before.status === 'pending' && after.status === 'denied') {
      await db.collection('audit_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'pack449_privileged_actions',
        event: 'action_denied',
        severity: after.riskLevel,
        data: {
          actionId: context.params.actionId,
          type: after.type,
          requesterId: after.requesterId
        }
      });
    }
  });

/**
 * Monitor risk profile changes
 */
export const onRiskProfileUpdated = functions.firestore
  .document('insider_risk_profiles/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if risk level increased
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const beforeLevel = riskLevels.indexOf(before.riskLevel);
    const afterLevel = riskLevels.indexOf(after.riskLevel);
    
    if (afterLevel > beforeLevel) {
      // Risk increased
      await db.collection('security_events').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'risk_level_increased',
        severity: after.riskLevel,
        userId: context.params.userId,
        data: {
          fromLevel: before.riskLevel,
          toLevel: after.riskLevel,
          riskScore: after.riskScore,
          factors: after.factors
        }
      });
      
      // If critical, alert security team
      if (after.riskLevel === 'critical') {
        await notifySecurityTeam({
          type: 'critical_risk_detected',
          userId: context.params.userId,
          riskScore: after.riskScore,
          factors: after.factors
        });
      }
    }
  });

/**
 * Monitor emergency mode activation
 */
export const onEmergencyModeCreated = functions.firestore
  .document('emergency_modes/{emergencyId}')
  .onCreate(async (snap, context) => {
    const emergency = snap.data();
    
    // Log to audit
    await db.collection('audit_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: 'pack449_emergency',
      event: 'emergency_mode_activated',
      severity: 'critical',
      data: {
        emergencyId: context.params.emergencyId,
        type: emergency.type,
        severity: emergency.severity,
        activatedBy: emergency.activatedBy
      }
    });
    
    // Alert all internal users
    const usersSnapshot = await db.collection('internal_users').get();
    
    const batch = db.batch();
    
    usersSnapshot.docs.forEach(userDoc => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: userDoc.id,
        type: 'emergency_mode_activated',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'critical',
        data: {
          emergencyId: context.params.emergencyId,
          emergencyType: emergency.type,
          description: emergency.description
        }
      });
    });
    
    await batch.commit();
  });

// ============================================
// Helper Functions
// ============================================

async function calculateUserRiskScore(userId: string, userData: any): Promise<any> {
  // Simplified risk calculation
  // In production, this would integrate with the full InsiderRiskScoringService
  
  const baseline = {
    avgAccessesPerDay: 50,
    avgAccessesPerHour: 5,
    typicalHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    typicalDays: [1, 2, 3, 4, 5]
  };
  
  const recentActivity = await getRecentActivity(userId);
  
  // Calculate basic risk score
  let riskScore = 0;
  const factors = [];
  
  // Access frequency
  if (recentActivity.totalAccesses > baseline.avgAccessesPerDay * 1.5) {
    riskScore += 20;
    factors.push({
      type: 'access_frequency',
      score: 20,
      description: 'Higher than normal access frequency'
    });
  }
  
  // Failed attempts
  if (recentActivity.failedAttempts > 5) {
    riskScore += 30;
    factors.push({
      type: 'failed_attempts',
      score: 30,
      description: `${recentActivity.failedAttempts} failed access attempts`
    });
  }
  
  // Out of hours access
  if (recentActivity.outOfHoursAccess > 10) {
    riskScore += 25;
    factors.push({
      type: 'unusual_hours',
      score: 25,
      description: `${recentActivity.outOfHoursAccess} out-of-hours accesses`
    });
  }
  
  const riskLevel = riskScore >= 75 ? 'critical' :
                    riskScore >= 50 ? 'high' :
                    riskScore >= 25 ? 'medium' : 'low';
  
  return {
    userId,
    role: userData.role,
    department: userData.department,
    riskScore,
    riskLevel,
    factors,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function getRecentActivity(userId: string): Promise<any> {
  // Mock activity data
  return {
    totalAccesses: 50,
    failedAttempts: 2,
    outOfHoursAccess: 5
  };
}

async function generateRiskAlert(userId: string, riskProfile: any): Promise<void> {
  await db.collection('security_events').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: 'high_risk_user_detected',
    severity: riskProfile.riskLevel,
    userId,
    data: {
      riskScore: riskProfile.riskScore,
      riskLevel: riskProfile.riskLevel,
      factors: riskProfile.factors
    }
  });
}

async function checkForAnomalies(profile: any): Promise<boolean> {
  // Simplified anomaly detection
  return profile.riskScore >= 60 && profile.factors.length >= 2;
}

function getTimeoutHours(actionType: string): number {
  // Default timeout mapping
  const timeouts: Record<string, number> = {
    'infrastructure.deploy': 24,
    'infrastructure.rollback': 4,
    'database.migration': 24,
    'financial.payout': 24,
    'user.ban': 24
  };
  
  return timeouts[actionType] || 24;
}

function isHighRiskGrant(grant: any): boolean {
  const highRiskPermissions = [
    'infrastructure.manage',
    'database.delete_data',
    'financial.write',
    'security.grant_admin'
  ];
  
  return grant.permissions.some((p: string) => highRiskPermissions.includes(p));
}

async function notifySecurityTeam(event: any): Promise<void> {
  // Get security team members
  const securitySnapshot = await db.collection('internal_users')
    .where('role', 'in', ['security_analyst', 'executive_cto'])
    .get();
  
  const batch = db.batch();
  
  securitySnapshot.docs.forEach(secDoc => {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: secDoc.id,
      type: event.type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      priority: 'critical',
      data: event
    });
  });
  
  await batch.commit();
}
