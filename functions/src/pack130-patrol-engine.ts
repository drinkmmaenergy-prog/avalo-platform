/**
 * PACK 130 — Long-Term Patrol AI
 * Pattern Detection Engine
 * 
 * Persistent behavior memory and pattern detection system
 * Tracks user behavior over months/years to detect concerning patterns
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  PatrolEventType,
  PatrolBehaviorLog,
  BehaviorPattern,
  PatrolLogEventInput,
  DEFAULT_PATROL_CONFIG,
} from './types/pack130-types';

const BEHAVIOR_LOG_COLLECTION = 'patrol_behavior_log';
const RISK_PROFILE_COLLECTION = 'patrol_risk_profiles';

// ============================================================================
// BEHAVIOR LOGGING
// ============================================================================

/**
 * Log a patrol event to persistent memory
 * This creates long-term records of user behavior patterns
 */
export async function patrolLogEvent(input: PatrolLogEventInput): Promise<string> {
  const { userId, eventType, metadata, counterpartId, importance = 'MEDIUM' } = input;
  
  // Check for existing similar events to track patterns
  const existingEvents = await getRecentEvents(userId, eventType, 90);
  const totalOccurrences = existingEvents.length + 1;
  
  // Calculate days since last occurrence
  let daysSinceLastOccurrence: number | undefined;
  if (existingEvents.length > 0) {
    const lastEvent = existingEvents[0];
    const daysDiff = Math.floor(
      (Date.now() - lastEvent.detectedAt.toMillis()) / (1000 * 60 * 60 * 24)
    );
    daysSinceLastOccurrence = daysDiff;
  }
  
  // Determine confidence based on frequency
  const confidence = calculateEventConfidence(totalOccurrences, daysSinceLastOccurrence);
  
  // Calculate expiration (36 months from now)
  const expiresAt = Timestamp.fromMillis(
    Date.now() + (36 * 30 * 24 * 60 * 60 * 1000)
  );
  
  const log: PatrolBehaviorLog = {
    logId: `${userId}_${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    eventType,
    detectedAt: Timestamp.now(),
    confidence,
    evidence: metadata,
    totalOccurrences,
    daysSinceLastOccurrence,
    counterpartId,
    expiresAt,
    importance,
  };
  
  // Determine if this is a cycle (recurring pattern)
  if (totalOccurrences > 1 && daysSinceLastOccurrence) {
    log.cycleNumber = totalOccurrences;
  }
  
  await db.collection(BEHAVIOR_LOG_COLLECTION).doc(log.logId).set(log);
  
  console.log(`[Patrol AI] Logged ${eventType} event for user ${userId} (occurrence ${totalOccurrences})`);
  
  return log.logId;
}

/**
 * Get recent events of a specific type for a user
 */
async function getRecentEvents(
  userId: string,
  eventType: PatrolEventType,
  daysBack: number
): Promise<PatrolBehaviorLog[]> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (daysBack * 24 * 60 * 60 * 1000)
  );
  
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('userId', '==', userId)
    .where('eventType', '==', eventType)
    .where('detectedAt', '>', cutoffDate)
    .orderBy('detectedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
}

/**
 * Calculate confidence level based on frequency and timing
 */
function calculateEventConfidence(
  totalOccurrences: number,
  daysSinceLastOccurrence?: number
): number {
  let confidence = 0.5;
  
  // More occurrences = higher confidence
  if (totalOccurrences >= 5) confidence = 0.95;
  else if (totalOccurrences >= 3) confidence = 0.85;
  else if (totalOccurrences >= 2) confidence = 0.7;
  
  // Recent events = higher confidence
  if (daysSinceLastOccurrence !== undefined) {
    if (daysSinceLastOccurrence < 7) confidence = Math.min(confidence + 0.1, 1.0);
    else if (daysSinceLastOccurrence < 30) confidence = Math.min(confidence + 0.05, 1.0);
  }
  
  return confidence;
}

// ============================================================================
// PATTERN DETECTION ENGINE
// ============================================================================

/**
 * Analyze user behavior logs to detect patterns
 */
export async function detectBehaviorPatterns(
  userId: string,
  lookbackMonths: number = 12
): Promise<BehaviorPattern[]> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (lookbackMonths * 30 * 24 * 60 * 60 * 1000)
  );
  
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('userId', '==', userId)
    .where('detectedAt', '>', cutoffDate)
    .orderBy('detectedAt', 'desc')
    .get();
  
  const logs = snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
  
  // Group by event type
  const eventGroups = new Map<PatrolEventType, PatrolBehaviorLog[]>();
  for (const log of logs) {
    if (!eventGroups.has(log.eventType)) {
      eventGroups.set(log.eventType, []);
    }
    eventGroups.get(log.eventType)!.push(log);
  }
  
  // Analyze each pattern
  const patterns: BehaviorPattern[] = [];
  
  for (const [eventType, events] of Array.from(eventGroups.entries())) {
    if (events.length === 0) continue;
    
    // Calculate average days between events
    let totalDaysBetween = 0;
    let intervalCount = 0;
    
    for (let i = 1; i < events.length; i++) {
      const daysDiff = Math.floor(
        (events[i - 1].detectedAt.toMillis() - events[i].detectedAt.toMillis()) / (1000 * 60 * 60 * 24)
      );
      totalDaysBetween += daysDiff;
      intervalCount++;
    }
    
    const averageDaysBetween = intervalCount > 0 ? totalDaysBetween / intervalCount : 0;
    
    // Determine trend
    let trend: BehaviorPattern['trend'] = 'STABLE';
    if (events.length >= 3) {
      const recentEvents = events.slice(0, 3);
      const olderEvents = events.slice(3, 6);
      
      if (olderEvents.length > 0) {
        const recentFreq = recentEvents.length;
        const olderFreq = olderEvents.length;
        
        if (recentFreq > olderFreq * 1.5) trend = 'WORSENING';
        else if (recentFreq < olderFreq * 0.7) trend = 'IMPROVING';
      }
    }
    
    patterns.push({
      patternType: eventType,
      frequency: events.length,
      lastOccurrence: events[0].detectedAt,
      averageDaysBetween,
      trend,
    });
  }
  
  return patterns;
}

/**
 * Detect harassment cycle patterns (respectful → relapse)
 */
export async function detectHarassmentCycle(
  userId: string,
  counterpartId: string
): Promise<{ hasCycle: boolean; cycleCount: number; daysInCycle: number }> {
  const logs = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('userId', '==', userId)
    .where('counterpartId', '==', counterpartId)
    .where('eventType', '==', 'HARASSMENT_CYCLE')
    .orderBy('detectedAt', 'desc')
    .limit(10)
    .get();
  
  if (logs.empty) {
    return { hasCycle: false, cycleCount: 0, daysInCycle: 0 };
  }
  
  const events = logs.docs.map(doc => doc.data() as PatrolBehaviorLog);
  const cycleCount = events.length;
  
  // Calculate average cycle length
  let totalDays = 0;
  for (let i = 1; i < events.length; i++) {
    const daysDiff = Math.floor(
      (events[i - 1].detectedAt.toMillis() - events[i].detectedAt.toMillis()) / (1000 * 60 * 60 * 24)
    );
    totalDays += daysDiff;
  }
  
  const daysInCycle = events.length > 1 ? totalDays / (events.length - 1) : 0;
  
  return {
    hasCycle: cycleCount >= 2,
    cycleCount,
    daysInCycle,
  };
}

/**
 * Detect NSFW bypass patterns (repeated "almost safe" content)
 */
export async function detectNSFWBypassPatterns(userId: string): Promise<{
  hasPattern: boolean;
  attemptCount: number;
  averageDaysBetween: number;
}> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (90 * 24 * 60 * 60 * 1000)  // 90 days
  );
  
  const logs = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('userId', '==', userId)
    .where('eventType', '==', 'NSFW_BYPASS_ATTEMPT')
    .where('detectedAt', '>', cutoffDate)
    .orderBy('detectedAt', 'desc')
    .get();
  
  if (logs.empty) {
    return { hasPattern: false, attemptCount: 0, averageDaysBetween: 0 };
  }
  
  const events = logs.docs.map(doc => doc.data() as PatrolBehaviorLog);
  const attemptCount = events.length;
  
  // Calculate average days between attempts
  let totalDays = 0;
  for (let i = 1; i < events.length; i++) {
    const daysDiff = Math.floor(
      (events[i - 1].detectedAt.toMillis() - events[i].detectedAt.toMillis()) / (1000 * 60 * 60 * 24)
    );
    totalDays += daysDiff;
  }
  
  const averageDaysBetween = events.length > 1 ? totalDays / (events.length - 1) : 0;
  
  return {
    hasPattern: attemptCount >= 3,
    attemptCount,
    averageDaysBetween,
  };
}

/**
 * Detect coordinated attack patterns (multiple users targeting one)
 */
export async function detectCoordinatedAttack(
  targetUserId: string,
  timeWindowHours: number = 24
): Promise<{
  isCoordinated: boolean;
  attackerIds: string[];
  attackCount: number;
}> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (timeWindowHours * 60 * 60 * 1000)
  );
  
  const logs = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('counterpartId', '==', targetUserId)
    .where('detectedAt', '>', cutoffDate)
    .get();
  
  if (logs.empty) {
    return { isCoordinated: false, attackerIds: [], attackCount: 0 };
  }
  
  // Group by attacker
  const attackerMap = new Map<string, number>();
  for (const doc of logs.docs) {
    const log = doc.data() as PatrolBehaviorLog;
    const count = attackerMap.get(log.userId) || 0;
    attackerMap.set(log.userId, count + 1);
  }
  
  const attackerIds = Array.from(attackerMap.keys());
  const attackCount = logs.size;
  
  // Coordinated if 3+ different users attack same target in short time
  const isCoordinated = attackerIds.length >= 3 && attackCount >= 5;
  
  return {
    isCoordinated,
    attackerIds,
    attackCount,
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all behavior logs for a user
 */
export async function getUserBehaviorLogs(
  userId: string,
  limit: number = 100
): Promise<PatrolBehaviorLog[]> {
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('detectedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
}

/**
 * Get logs by event type
 */
export async function getLogsByEventType(
  eventType: PatrolEventType,
  limit: number = 100
): Promise<PatrolBehaviorLog[]> {
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('eventType', '==', eventType)
    .orderBy('detectedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
}

/**
 * Get high-importance logs for review
 */
export async function getHighImportanceLogs(limit: number = 50): Promise<PatrolBehaviorLog[]> {
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('importance', 'in', ['HIGH', 'CRITICAL'])
    .orderBy('detectedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
}

/**
 * Get logs related to a specific case
 */
export async function getLogsForCase(caseId: string): Promise<PatrolBehaviorLog[]> {
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('relatedCaseId', '==', caseId)
    .orderBy('detectedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolBehaviorLog);
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Clean up expired behavior logs (36 months old)
 * Should be run as a scheduled job
 */
export async function cleanupExpiredLogs(): Promise<{ deletedCount: number }> {
  const now = Timestamp.now();
  
  const snapshot = await db.collection(BEHAVIOR_LOG_COLLECTION)
    .where('expiresAt', '<', now)
    .limit(500)  // Batch delete
    .get();
  
  if (snapshot.empty) {
    return { deletedCount: 0 };
  }
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`[Patrol AI] Cleaned up ${snapshot.size} expired behavior logs`);
  
  return { deletedCount: snapshot.size };
}

/**
 * Archive old logs to cold storage before deletion
 */
export async function archiveLogsToStorage(
  userId: string
): Promise<{ archived: boolean; logCount: number }> {
  const logs = await getUserBehaviorLogs(userId, 1000);
  
  if (logs.length === 0) {
    return { archived: false, logCount: 0 };
  }
  
  // In a real implementation, this would upload to Cloud Storage
  // For now, we just log the archive intent
  console.log(`[Patrol AI] Would archive ${logs.length} logs for user ${userId}`);
  
  return {
    archived: true,
    logCount: logs.length,
  };
}