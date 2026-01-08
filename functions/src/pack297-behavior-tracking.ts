/**
 * PACK 297 - User Behavior Tracking & Abuse Detection
 * 
 * Tracks user behavior patterns to detect spam and abuse
 * Integrates with existing Risk Engine
 * NO ECONOMIC CHANGES - only tracks behavior for safety
 */

import { db } from './init.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface UserBehaviorStats {
  userId: string;
  outgoingMessagesLast24h: number;
  uniqueRecipientsLast24h: number;
  safetyReportsAgainstLast30d: number;
  blockedByCountLast30d: number;
  lastMessageSentAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface BehaviorCheckResult {
  allowed: boolean;
  reason?: string;
  shouldThrottle: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Behavior thresholds for abuse detection
 */
const BEHAVIOR_THRESHOLDS = {
  maxOutgoingMessages24h: 500,
  maxUniqueRecipients24h: 100,
  spamIndicatorMessages: 200, // Many messages in short time
  spamIndicatorRecipients: 50, // To many different users
  maxSafetyReports30d: 10,
  maxBlockedBy30d: 20,
  criticalSafetyReports: 5,
  criticalBlockedBy: 10
};

/**
 * Get or create user behavior stats
 */
export async function getUserBehaviorStats(userId: string): Promise<UserBehaviorStats> {
  const docRef = db.collection('userBehaviorStats').doc(userId);
  const doc = await docRef.get();
  
  if (doc.exists) {
    return doc.data() as UserBehaviorStats;
  }
  
  // Create new stats document
  const newStats: UserBehaviorStats = {
    userId,
    outgoingMessagesLast24h: 0,
    uniqueRecipientsLast24h: 0,
    safetyReportsAgainstLast30d: 0,
    blockedByCountLast30d: 0,
    updatedAt: Timestamp.now()
  };
  
  await docRef.set(newStats);
  return newStats;
}

/**
 * Track outgoing message
 */
export async function trackOutgoingMessage(
  userId: string,
  recipientId: string
): Promise<void> {
  const docRef = db.collection('userBehaviorStats').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    
    if (!doc.exists) {
      // Create new document
      const newStats: UserBehaviorStats = {
        userId,
        outgoingMessagesLast24h: 1,
        uniqueRecipientsLast24h: 1,
        safetyReportsAgainstLast30d: 0,
        blockedByCountLast30d: 0,
        lastMessageSentAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      transaction.set(docRef, newStats);
    } else {
      const stats = doc.data() as UserBehaviorStats;
      
      // Increment message count
      transaction.update(docRef, {
        outgoingMessagesLast24h: (stats.outgoingMessagesLast24h || 0) + 1,
        lastMessageSentAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      // Track unique recipient (separately to avoid complex queries)
      const recipientTrackRef = db
        .collection('userBehaviorStats')
        .doc(userId)
        .collection('recipients24h')
        .doc(recipientId);
      
      transaction.set(recipientTrackRef, {
        recipientId,
        trackedAt: Timestamp.now()
      }, { merge: true });
    }
  });
}

/**
 * Track safety report
 */
export async function trackSafetyReport(reportedUserId: string): Promise<void> {
  const docRef = db.collection('userBehaviorStats').doc(reportedUserId);
  
  await docRef.set({
    userId: reportedUserId,
    safetyReportsAgainstLast30d: FieldValue.increment(1),
    updatedAt: Timestamp.now()
  }, { merge: true });
}

/**
 * Track user block
 */
export async function trackUserBlock(blockedUserId: string): Promise<void> {
  const docRef = db.collection('userBehaviorStats').doc(blockedUserId);
  
  await docRef.set({
    userId: blockedUserId,
    blockedByCountLast30d: FieldValue.increment(1),
    updatedAt: Timestamp.now()
  }, { merge: true });
}

/**
 * Check if user behavior is suspicious
 */
export async function checkUserBehavior(userId: string): Promise<BehaviorCheckResult> {
  const stats = await getUserBehaviorStats(userId);
  
  // Count unique recipients
  const recipientsSnapshot = await db
    .collection('userBehaviorStats')
    .doc(userId)
    .collection('recipients24h')
    .get();
  
  const uniqueRecipients = recipientsSnapshot.size;
  
  // Update unique recipients count
  if (uniqueRecipients !== stats.uniqueRecipientsLast24h) {
    await db.collection('userBehaviorStats').doc(userId).update({
      uniqueRecipientsLast24h: uniqueRecipients
    });
    stats.uniqueRecipientsLast24h = uniqueRecipients;
  }
  
  // Check for critical violations
  if (stats.safetyReportsAgainstLast30d >= BEHAVIOR_THRESHOLDS.criticalSafetyReports) {
    return {
      allowed: false,
      reason: 'Multiple safety reports against your account',
      shouldThrottle: true,
      riskLevel: 'high'
    };
  }
  
  if (stats.blockedByCountLast30d >= BEHAVIOR_THRESHOLDS.criticalBlockedBy) {
    return {
      allowed: false,
      reason: 'Account flagged for suspicious behavior',
      shouldThrottle: true,
      riskLevel: 'high'
    };
  }
  
  // Check for spam patterns
  const isHighVolumeMessaging = stats.outgoingMessagesLast24h > BEHAVIOR_THRESHOLDS.spamIndicatorMessages;
  const isHighVolumeRecipients = uniqueRecipients > BEHAVIOR_THRESHOLDS.spamIndicatorRecipients;
  
  if (isHighVolumeMessaging && isHighVolumeRecipients) {
    return {
      allowed: true,
      reason: 'High volume messaging detected',
      shouldThrottle: true,
      riskLevel: 'high'
    };
  }
  
  // Check for excessive behavior
  if (stats.outgoingMessagesLast24h > BEHAVIOR_THRESHOLDS.maxOutgoingMessages24h) {
    return {
      allowed: false,
      reason: 'Daily message limit reached',
      shouldThrottle: true,
      riskLevel: 'medium'
    };
  }
  
  if (uniqueRecipients > BEHAVIOR_THRESHOLDS.maxUniqueRecipients24h) {
    return {
      allowed: false,
      reason: 'Too many unique recipients',
      shouldThrottle: true,
      riskLevel: 'medium'
    };
  }
  
  // Moderate warnings
  if (stats.safetyReportsAgainstLast30d > 0 || stats.blockedByCountLast30d > 0) {
    return {
      allowed: true,
      shouldThrottle: false,
      riskLevel: 'medium'
    };
  }
  
  // Normal behavior
  return {
    allowed: true,
    shouldThrottle: false,
    riskLevel: 'low'
  };
}

/**
 * Reset 24h counters for a user (called by daily job)
 */
export async function resetDailyCounters(userId: string): Promise<void> {
  const docRef = db.collection('userBehaviorStats').doc(userId);
  
  await docRef.update({
    outgoingMessagesLast24h: 0,
    uniqueRecipientsLast24h: 0,
    updatedAt: Timestamp.now()
  });
  
  // Delete recipients collection
  const recipientsRef = docRef.collection('recipients24h');
  const snapshot = await recipientsRef.get();
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

/**
 * Reset 30d counters for a user (called by monthly job)
 */
export async function resetMonthlyCounters(userId: string): Promise<void> {
  const docRef = db.collection('userBehaviorStats').doc(userId);
  
  await docRef.update({
    safetyReportsAgainstLast30d: 0,
    blockedByCountLast30d: 0,
    updatedAt: Timestamp.now()
  });
}

/**
 * Get spam/abuse statistics (admin)
 */
export async function getAbuseStatistics(): Promise<{
  totalFlagged: number;
  highRisk: number;
  mediumRisk: number;
  topOffenders: Array<{ userId: string; reports: number; blocks: number }>;
}> {
  const snapshot = await db
    .collection('userBehaviorStats')
    .where('safetyReportsAgainstLast30d', '>', 0)
    .get();
  
  let highRisk = 0;
  let mediumRisk = 0;
  const offenders: Array<{ userId: string; reports: number; blocks: number }> = [];
  
  snapshot.docs.forEach(doc => {
    const stats = doc.data() as UserBehaviorStats;
    
    if (stats.safetyReportsAgainstLast30d >= BEHAVIOR_THRESHOLDS.criticalSafetyReports ||
        stats.blockedByCountLast30d >= BEHAVIOR_THRESHOLDS.criticalBlockedBy) {
      highRisk++;
    } else {
      mediumRisk++;
    }
    
    offenders.push({
      userId: stats.userId,
      reports: stats.safetyReportsAgainstLast30d,
      blocks: stats.blockedByCountLast30d
    });
  });
  
  // Sort by total risk score
  offenders.sort((a, b) => 
    (b.reports + b.blocks * 2) - (a.reports + a.blocks * 2)
  );
  
  return {
    totalFlagged: snapshot.size,
    highRisk,
    mediumRisk,
    topOffenders: offenders.slice(0, 20)
  };
}