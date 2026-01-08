/**
 * PACK 389 — Breach Containment Automation
 * Automatic response to security threats with multi-system lockdown
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Containment levels
enum ContainmentLevel {
  SOFT_HOLD = 'soft_hold',      // 24h investigation
  HARD_HOLD = 'hard_hold',       // 72h compliance hold
  PERMANENT_FREEZE = 'permanent_freeze',  // Unlimited freeze
  TEMPORARY_LIMIT = 'temporary_limit'     // Feature-specific limits
}

interface ContainmentAction {
  userId: string;
  level: ContainmentLevel;
  reason: string;
  threatType: string;
  threatSeverity: number;
  actions: string[];
  expiresAt?: FirebaseFirestore.Timestamp;
  triggeredBy: string;
  timestamp: FirebaseFirestore.Timestamp;
}

/**
 * Execute account-level containment
 */
export const pack389_executeAccountContainment = async (
  userId: string,
  threatType: string,
  severity: number,
  reason: string
): Promise<void> => {
  console.log(`🔒 Executing account containment for user ${userId} - Threat: ${threatType} (${severity})`);
  
  try {
    // Determine containment level based on severity
    const level = determineContainmentLevel(severity, threatType);
    
    const actions: string[] = [];
    
    // 1. Freeze wallet (PACK 277)
    if (severity >= 0.75) {
      await freezeWallet(userId, reason);
      actions.push('wallet_frozen');
    }
    
    // 2. Lock account (PACK 300A + 388)
    if (severity >= 0.80) {
      await lockAccount(userId, reason);
      actions.push('account_locked');
    }
    
    // 3. Freeze AI Companions (PACK 279)
    if (threatType.includes('ai_companion') || severity >= 0.75) {
      await freezeAICompanions(userId, reason);
      actions.push('ai_companions_frozen');
    }
    
    // 4. Cancel active meetings (PACK 268)
    if (severity >= 0.85) {
      await cancelActiveMeetings(userId, reason);
      actions.push('meetings_cancelled');
    }
    
    // 5. Suspend chat access
    if (threatType.includes('chat') || severity >= 0.70) {
      await suspendChat(userId, reason);
      actions.push('chat_suspended');
    }
    
    // 6. Suspend store access
    if (threatType.includes('store') || severity >= 0.70) {
      await suspendStoreAccess(userId, reason);
      actions.push('store_suspended');
    }
    
    // 7. Create support ticket (SAFETY tier)
    const ticketId = await createSafetyTicket(userId, threatType, severity, reason);
    actions.push(`safety_ticket_created:${ticketId}`);
    
    // 8. Alert PR team (PACK 387) if high-profile user
    const isHighProfile = await checkIfHighProfile(userId);
    if (isHighProfile && severity >= 0.75) {
      await alertPRTeam(userId, threatType, severity);
      actions.push('pr_team_alerted');
    }
    
    // 9. Flag for legal compliance (PACK 388)
    if (severity >= 0.85 || threatType.includes('underage') || threatType.includes('kyc')) {
      await flagLegalCompliance(userId, threatType, reason);
      actions.push('legal_compliance_flagged');
    }
    
    // Record containment action
    const expiresAt = calculateExpirationTime(level);
    
    const containment: ContainmentAction = {
      userId,
      level,
      reason,
      threatType,
      threatSeverity: severity,
      actions,
      expiresAt,
      triggeredBy: 'pack389_automated_containment',
      timestamp: admin.firestore.Timestamp.now()
    };
    
    await db.collection('containmentActions').add(containment);
    
    // Update user security status
    await db.collection('users').doc(userId).update({
      securityStatus: 'contained',
      containmentLevel: level,
      containmentReason: reason,
      containedAt: admin.firestore.Timestamp.now(),
      containmentExpires: expiresAt
    });
    
    console.log(`✅ Account containment executed: ${actions.length} actions taken`);
    
  } catch (error) {
    console.error('Account containment error:', error);
    throw error;
  }
};

/**
 * Execute system-wide containment (when multiple accounts affected)
 */
export const pack389_executeSystemContainment = async (
  threatType: string,
  affectedUsers: string[],
  severity: number
): Promise<void> => {
  console.log(`🚨 Executing SYSTEM-WIDE containment - Threat: ${threatType}, Users: ${affectedUsers.length}`);
  
  try {
    // Contain all affected accounts
    const containmentPromises = affectedUsers.map(userId =>
      pack389_executeAccountContainment(userId, threatType, severity, 'System-wide threat detected')
    );
    
    await Promise.all(containmentPromises);
    
    // Log system-wide containment
    await db.collection('systemContainmentEvents').add({
      threatType,
      affectedUsersCount: affectedUsers.length,
      severity,
      timestamp: admin.firestore.Timestamp.now(),
      status: 'active'
    });
    
    // Alert admin team
    await alertAdminTeam({
      type: 'system_containment',
      threatType,
      affectedUsers: affectedUsers.length,
      severity
    });
    
    console.log(`✅ System containment executed for ${affectedUsers.length} users`);
    
  } catch (error) {
    console.error('System containment error:', error);
    throw error;
  }
};

/**
 * Determine containment level based on severity and threat type
 */
function determineContainmentLevel(severity: number, threatType: string): ContainmentLevel {
  // Permanent freeze for specific threats
  if (threatType.includes('underage') || threatType.includes('child')) {
    return ContainmentLevel.PERMANENT_FREEZE;
  }
  
  // Hard compliance hold for KYC/AML issues
  if (threatType.includes('kyc') || threatType.includes('aml') || threatType.includes('impersonation')) {
    return ContainmentLevel.HARD_HOLD;
  }
  
  // Severity-based determination
  if (severity >= 0.90) {
    return ContainmentLevel.PERMANENT_FREEZE;
  } else if (severity >= 0.75) {
    return ContainmentLevel.HARD_HOLD;
  } else if (severity >= 0.50) {
    return ContainmentLevel.SOFT_HOLD;
  } else {
    return ContainmentLevel.TEMPORARY_LIMIT;
  }
}

/**
 * Calculate expiration time based on containment level
 */
function calculateExpirationTime(level: ContainmentLevel): FirebaseFirestore.Timestamp | undefined {
  const now = Date.now();
  
  switch (level) {
    case ContainmentLevel.SOFT_HOLD:
      return admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000); // 24 hours
    case ContainmentLevel.HARD_HOLD:
      return admin.firestore.Timestamp.fromMillis(now + 72 * 60 * 60 * 1000); // 72 hours
    case ContainmentLevel.TEMPORARY_LIMIT:
      return admin.firestore.Timestamp.fromMillis(now + 6 * 60 * 60 * 1000); // 6 hours
    case ContainmentLevel.PERMANENT_FREEZE:
      return undefined; // No expiration
  }
}

/**
 * Freeze user's wallet
 */
async function freezeWallet(userId: string, reason: string): Promise<void> {
  await db.collection('wallets').doc(userId).update({
    frozen: true,
    freezeReason: reason,
    frozenAt: admin.firestore.Timestamp.now(),
    frozenBy: 'pack389_containment'
  });
  
  console.log(`💰 Wallet frozen for user ${userId}`);
}

/**
 * Lock user account
 */
async function lockAccount(userId: string, reason: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    accountStatus: 'locked',
    lockReason: reason,
    lockedAt: admin.firestore.Timestamp.now(),
    securityLock: true
  });
  
  // Revoke all sessions
  await db.collection('secureSessions').doc(userId).update({
    trustStatus: 'revoked',
    revokedReason: reason,
    revokedAt: admin.firestore.Timestamp.now()
  });
  
  console.log(`🔐 Account locked for user ${userId}`);
}

/**
 * Freeze AI Companions
 */
async function freezeAICompanions(userId: string, reason: string): Promise<void> {
  const companionsSnapshot = await db
    .collection('aiCompanions')
    .where('creatorId', '==', userId)
    .get();
  
  const freezePromises = companionsSnapshot.docs.map(doc =>
    doc.ref.update({
      frozen: true,
      freezeReason: reason,
      frozenAt: admin.firestore.Timestamp.now()
    })
  );
  
  await Promise.all(freezePromises);
  
  console.log(`🤖 AI Companions frozen for user ${userId} (${companionsSnapshot.size} companions)`);
}

/**
 * Cancel active meetings
 */
async function cancelActiveMeetings(userId: string, reason: string): Promise<void> {
  const now = Date.now();
  
  // Cancel as host
  const hostedMeetings = await db
    .collection('meetings')
    .where('hostId', '==', userId)
    .where('status', 'in', ['scheduled', 'active'])
    .where('scheduledTime', '>', admin.firestore.Timestamp.now())
    .get();
  
  const cancelPromises = hostedMeetings.docs.map(doc =>
    doc.ref.update({
      status: 'cancelled',
      cancelReason: `Security containment: ${reason}`,
      cancelledAt: admin.firestore.Timestamp.now(),
      cancelledBy: 'pack389_containment'
    })
  );
  
  await Promise.all(cancelPromises);
  
  console.log(`📅 Meetings cancelled for user ${userId} (${hostedMeetings.size} meetings)`);
}

/**
 * Suspend chat access
 */
async function suspendChat(userId: string, reason: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    chatSuspended: true,
    chatSuspensionReason: reason,
    chatSuspendedAt: admin.firestore.Timestamp.now()
  });
  
  console.log(`💬 Chat suspended for user ${userId}`);
}

/**
 * Suspend store access
 */
async function suspendStoreAccess(userId: string, reason: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    storeSuspended: true,
    storeSuspensionReason: reason,
    storeSuspendedAt: admin.firestore.Timestamp.now()
  });
  
  // Delist active store items
  const storeListings = await db
    .collection('storeListings')
    .where('sellerId', '==', userId)
    .where('status', '==', 'active')
    .get();
  
  const delistPromises = storeListings.docs.map(doc =>
    doc.ref.update({
      status: 'suspended',
      suspendedReason: reason,
      suspendedAt: admin.firestore.Timestamp.now()
    })
  );
  
  await Promise.all(delistPromises);
  
  console.log(`🛒 Store access suspended for user ${userId} (${storeListings.size} listings)`);
}

/**
 * Create safety support ticket
 */
async function createSafetyTicket(
  userId: string,
  threatType: string,
  severity: number,
  reason: string
): Promise<string> {
  const ticket = await db.collection('supportTickets').add({
    userId,
    type: 'SAFETY',
    priority: severity >= 0.85 ? 'CRITICAL' : 'HIGH',
    category: 'security_containment',
    subject: `Automated Security Containment: ${threatType}`,
    description: `User contained due to: ${reason}\nThreat Type: ${threatType}\nSeverity: ${severity}`,
    status: 'open',
    assignedTeam: 'safety',
    createdAt: admin.firestore.Timestamp.now(),
    createdBy: 'pack389_containment',
    automated: true
  });
  
  console.log(`🎫 Safety ticket created: ${ticket.id}`);
  return ticket.id;
}

/**
 * Check if user is high-profile (influencer, celebrity, etc.)
 */
async function checkIfHighProfile(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  return (
    userData?.verified === true ||
    userData?.influencerTier === 'celebrity' ||
    (userData?.followers || 0) > 100000
  );
}

/**
 * Alert PR team for high-profile containment
 */
async function alertPRTeam(userId: string, threatType: string, severity: number): Promise<void> {
  await db.collection('prAlerts').add({
    userId,
    alertType: 'security_containment',
    threatType,
    severity,
    priority: 'HIGH',
    status: 'pending',
    createdAt: admin.firestore.Timestamp.now()
  });
  
  console.log(`📢 PR team alerted for high-profile containment: ${userId}`);
}

/**
 * Flag for legal compliance review
 */
async function flagLegalCompliance(userId: string, threatType: string, reason: string): Promise<void> {
  await db.collection('legalComplianceFlags').add({
    userId,
    flagType: 'security_containment',
    threatType,
    reason,
    status: 'pending_review',
    priority: threatType.includes('underage') ? 'CRITICAL' : 'HIGH',
    createdAt: admin.firestore.Timestamp.now(),
    reviewRequired: true
  });
  
  console.log(`⚖️ Legal compliance flagged for user ${userId}`);
}

/**
 * Alert admin team
 */
async function alertAdminTeam(alert: any): Promise<void> {
  await db.collection('adminAlerts').add({
    ...alert,
    status: 'active',
    createdAt: admin.firestore.Timestamp.now()
  });
  
  console.log(`👨‍💼 Admin team alerted: ${alert.type}`);
}

/**
 * Lift containment (manual or automated expiration)
 */
export const liftContainment = async (
  userId: string,
  reason: string
): Promise<void> => {
  console.log(`🔓 Lifting containment for user ${userId}: ${reason}`);
  
  try {
    // Update user status
    await db.collection('users').doc(userId).update({
      securityStatus: 'active',
      containmentLevel: admin.firestore.FieldValue.delete(),
      containmentReason: admin.firestore.FieldValue.delete(),
      containedAt: admin.firestore.FieldValue.delete(),
      containmentExpires: admin.firestore.FieldValue.delete(),
      containmentLiftedAt: admin.firestore.Timestamp.now(),
      containmentLiftReason: reason,
      securityLock: false,
      accountStatus: 'active'
    });
    
    // Unfreeze wallet
    await db.collection('wallets').doc(userId).update({
      frozen: false,
      freezeReason: admin.firestore.FieldValue.delete(),
      frozenAt: admin.firestore.FieldValue.delete(),
      unfrozenAt: admin.firestore.Timestamp.now()
    });
    
    // Unsuspend features
    await db.collection('users').doc(userId).update({
      chatSuspended: false,
      storeSuspended: false
    });
    
    // Log lift action
    await db.collection('containmentLifts').add({
      userId,
      reason,
      liftedAt: admin.firestore.Timestamp.now(),
      liftedBy: 'pack389_containment'
    });
    
    console.log(`✅ Containment lifted for user ${userId}`);
    
  } catch (error) {
    console.error('Failed to lift containment:', error);
    throw error;
  }
};

/**
 * Cloud Function: Trigger containment manually
 */
export const triggerContainment = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }
  
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  const adminData = adminDoc.data();
  
  if (adminData?.role !== 'admin' && adminData?.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  
  const { userId, threatType, severity, reason } = data;
  
  if (!userId || !threatType || !severity || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  await pack389_executeAccountContainment(userId, threatType, severity, reason);
  
  return { success: true, message: 'Containment executed' };
});

/**
 * Cloud Function: Lift containment manually
 */
export const liftContainmentManually = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required');
  }
  
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  const adminData = adminDoc.data();
  
  if (adminData?.role !== 'admin' && adminData?.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  
  const { userId, reason } = data;
  
  if (!userId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  await liftContainment(userId, reason);
  
  return { success: true, message: 'Containment lifted' };
});

/**
 * Scheduled: Auto-lift expired containments
 */
export const autoLiftExpiredContainments = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('🔍 Checking for expired containments...');
    
    const now = admin.firestore.Timestamp.now();
    
    const expiredContainments = await db
      .collection('users')
      .where('securityStatus', '==', 'contained')
      .where('containmentExpires', '<=', now)
      .get();
    
    console.log(`Found ${expiredContainments.size} expired containments`);
    
    const liftPromises = expiredContainments.docs.map(doc =>
      liftContainment(doc.id, 'Containment period expired (automated)')
    );
    
    await Promise.all(liftPromises);
    
    console.log(`✅ Auto-lifted ${expiredContainments.size} expired containments`);
  });

/**
 * Trigger: Auto-contain on critical security alert
 */
export const autoContainOnCriticalAlert = functions.firestore
  .document('securityAlerts/{alertId}')
  .onCreate(async (snap, context) => {
    const alert = snap.data();
    
    // Auto-contain if severity is critical
    if (alert.severity >= 0.85 && alert.status === 'active') {
      console.log(`🚨 CRITICAL ALERT - Auto-containing user ${alert.userId}`);
      
      await pack389_executeAccountContainment(
        alert.userId,
        alert.type,
        alert.severity,
        `Critical security alert: ${alert.type}`
      );
      
      // Update alert with containment reference
      await snap.ref.update({
        containmentTriggered: true,
        containmentTriggeredAt: admin.firestore.Timestamp.now()
      });
    }
  });
