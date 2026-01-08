/**
 * PACK 126 — Harassment Shield System
 * 
 * Detects and responds to harassment patterns in real-time
 * Protects users with graduated enforcement without manual intervention
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  HarassmentShieldLevel,
  HarassmentDetectionSignal,
  HarassmentShieldState,
  HarassmentShieldAction,
  SafetyAuditLog,
} from './types/pack126-types';
import { revokeConsent } from './pack126-consent-protocol';

const SHIELD_COLLECTION = 'harassment_shields';
const SAFETY_AUDIT_COLLECTION = 'safety_audit_logs';

// Detection thresholds
const SPAM_BURST_THRESHOLD = 10;  // messages in 1 minute
const REPEATED_UNWANTED_THRESHOLD = 5;  // messages without reply
const SLOW_MODE_DELAY = 30;  // seconds between messages

// ============================================================================
// HARASSMENT DETECTION
// ============================================================================

/**
 * Detect potential harassment from messaging patterns
 */
export async function detectHarassmentFromMessage(
  senderId: string,
  recipientId: string,
  messageContent: string,
  metadata: {
    isReply: boolean;
    recentMessageCount: number;
    messagesInLastMinute: number;
  }
): Promise<HarassmentDetectionSignal[]> {
  const signals: HarassmentDetectionSignal[] = [];
  
  // 1. Spam burst detection
  if (metadata.messagesInLastMinute >= SPAM_BURST_THRESHOLD) {
    signals.push({
      type: 'SPAM_BURST',
      confidence: 0.9,
      detectedAt: Timestamp.now(),
      evidence: {
        messagesInLastMinute: metadata.messagesInLastMinute,
        threshold: SPAM_BURST_THRESHOLD,
      },
    });
  }
  
  // 2. Repeated unwanted messages (no reply from recipient)
  if (!metadata.isReply && metadata.recentMessageCount >= REPEATED_UNWANTED_THRESHOLD) {
    signals.push({
      type: 'REPEATED_UNWANTED',
      confidence: 0.8,
      detectedAt: Timestamp.now(),
      evidence: {
        unansweredCount: metadata.recentMessageCount,
        threshold: REPEATED_UNWANTED_THRESHOLD,
      },
    });
  }
  
  // 3. Trauma-risk phrases detection
  const traumaRiskKeywords = [
    'kill yourself',
    'end your life',
    'nobody likes you',
    'worthless',
    'deserve to die',
    'should die',
    'harm yourself',
  ];
  
  const lowerContent = messageContent.toLowerCase();
  const foundTraumaKeywords = traumaRiskKeywords.filter(kw => lowerContent.includes(kw));
  
  if (foundTraumaKeywords.length > 0) {
    signals.push({
      type: 'TRAUMA_RISK_PHRASE',
      confidence: 1.0,
      detectedAt: Timestamp.now(),
      evidence: {
        keywords: foundTraumaKeywords,
        severity: 'CRITICAL',
      },
    });
  }
  
  // 4. NSFW pressure detection
  const nsfwPressureKeywords = [
    'send nudes',
    'show me',
    'owe me',
    'have to',
    'or else',
    'you better',
  ];
  
  const foundNSFWPressure = nsfwPressureKeywords.filter(kw => lowerContent.includes(kw));
  
  if (foundNSFWPressure.length > 0) {
    signals.push({
      type: 'NSFW_PRESSURE',
      confidence: 0.7,
      detectedAt: Timestamp.now(),
      evidence: {
        keywords: foundNSFWPressure,
      },
    });
  }
  
  return signals;
}

/**
 * Check for impersonation attempts
 */
export async function detectImpersonation(
  suspectedImpersonatorId: string,
  targetUserId: string
): Promise<HarassmentDetectionSignal | null> {
  // Get both user profiles
  const impersonatorProfile = await db.collection('users').doc(suspectedImpersonatorId).get();
  const targetProfile = await db.collection('users').doc(targetUserId).get();
  
  if (!impersonatorProfile.exists || !targetProfile.exists) {
    return null;
  }
  
  const impersonatorData = impersonatorProfile.data();
  const targetData = targetProfile.data();
  
  // Check for similar names
  const nameSimilarity = calculateStringSimilarity(
    impersonatorData?.displayName || '',
    targetData?.displayName || ''
  );
  
  if (nameSimilarity > 0.8) {
    return {
      type: 'IMPERSONATION_ATTEMPT',
      confidence: nameSimilarity,
      detectedAt: Timestamp.now(),
      evidence: {
        suspectedName: impersonatorData?.displayName,
        targetName: targetData?.displayName,
        similarity: nameSimilarity,
      },
    };
  }
  
  return null;
}

/**
 * Check for block evasion (new account contacting after being blocked)
 */
export async function detectBlockEvasion(
  senderId: string,
  recipientId: string
): Promise<HarassmentDetectionSignal | null> {
  // Check if recipient has blocked any users
  const blocksSnapshot = await db.collection('blocks')
    .where('blockerId', '==', recipientId)
    .get();
  
  if (blocksSnapshot.empty) {
    return null;
  }
  
  // Get sender's device info
  const senderDevices = await db.collection('user_devices')
    .where('userId', '==', senderId)
    .get();
  
  if (senderDevices.empty) {
    return null;
  }
  
  const senderDeviceIds = senderDevices.docs.map(d => d.data().deviceId);
  
  // Check if any blocked users share device IDs
  for (const blockDoc of blocksSnapshot.docs) {
    const blockedUserId = blockDoc.data().blockedUserId;
    
    const blockedUserDevices = await db.collection('user_devices')
      .where('userId', '==', blockedUserId)
      .get();
    
    const blockedDeviceIds = blockedUserDevices.docs.map(d => d.data().deviceId);
    
    // Check for overlapping device IDs
    const overlap = senderDeviceIds.filter(id => blockedDeviceIds.includes(id));
    
    if (overlap.length > 0) {
      return {
        type: 'BLOCK_EVASION',
        confidence: 0.95,
        detectedAt: Timestamp.now(),
        evidence: {
          previouslyBlockedUserId: blockedUserId,
          sharedDevices: overlap.length,
        },
      };
    }
  }
  
  return null;
}

// ============================================================================
// SHIELD STATE MANAGEMENT
// ============================================================================

/**
 * Activate or escalate harassment shield
 */
export async function activateHarassmentShield(
  protectedUserId: string,
  harasserId: string,
  signals: HarassmentDetectionSignal[]
): Promise<HarassmentShieldState> {
  const shieldId = `${protectedUserId}_${harasserId}`;
  const shieldRef = db.collection(SHIELD_COLLECTION).doc(shieldId);
  
  const existingShield = await shieldRef.get();
  
  if (existingShield.exists) {
    // Escalate existing shield
    return await escalateShield(existingShield.data() as HarassmentShieldState, signals);
  } else {
    // Create new shield
    return await createNewShield(protectedUserId, harasserId, signals);
  }
}

/**
 * Create new harassment shield
 */
async function createNewShield(
  protectedUserId: string,
  harasserId: string,
  signals: HarassmentDetectionSignal[]
): Promise<HarassmentShieldState> {
  const riskScore = calculateRiskScore(signals);
  const level = determineShieldLevel(riskScore);
  
  const actions: HarassmentShieldAction[] = [];
  
  // Apply initial actions based on level
  if (level === 'LOW') {
    // Enable slow mode
    actions.push({
      action: 'ENABLED_SLOW_MODE',
      takenAt: Timestamp.now(),
      reason: 'Spam burst detected',
      automaticAction: true,
    });
  } else if (level === 'MEDIUM') {
    // Enable reply-only mode
    actions.push({
      action: 'ENABLED_REPLY_ONLY',
      takenAt: Timestamp.now(),
      reason: 'Repeated unwanted messages',
      automaticAction: true,
    });
  } else if (level === 'HIGH' || level === 'CRITICAL') {
    // Hard block + create case
    actions.push({
      action: 'CREATED_HARD_BLOCK',
      takenAt: Timestamp.now(),
      reason: level === 'CRITICAL' ? 'Critical harassment detected' : 'High-risk harassment pattern',
      automaticAction: true,
    });
    
    // Revoke consent immediately
    await revokeConsent(protectedUserId, harasserId, 'SYSTEM', 'Harassment shield activated');
  }
  
  const shield: HarassmentShieldState = {
    userId: protectedUserId,
    harasserId,
    level,
    signals,
    riskScore,
    slowModeEnabled: level === 'LOW',
    replyOnlyMode: level === 'MEDIUM',
    hardBlocked: level === 'HIGH' || level === 'CRITICAL',
    caseCreated: level === 'HIGH' || level === 'CRITICAL',
    activatedAt: Timestamp.now(),
    actions,
  };
  
  // Create case for HIGH and CRITICAL
  if (level === 'HIGH' || level === 'CRITICAL') {
    const caseId = await createSafetyCase(protectedUserId, harasserId, signals, level);
    shield.caseId = caseId;
    
    actions.push({
      action: 'CREATED_CASE',
      takenAt: Timestamp.now(),
      reason: 'Escalated to safety team',
      automaticAction: true,
    });
  }
  
  const shieldId = `${protectedUserId}_${harasserId}`;
  await db.collection(SHIELD_COLLECTION).doc(shieldId).set(shield);
  
  // Log safety event
  await logSafetyEvent('HARASSMENT_SHIELD_ACTIVATED', protectedUserId, harasserId, {
    level,
    riskScore,
    signalCount: signals.length,
  });
  
  return shield;
}

/**
 * Escalate existing shield to higher level
 */
async function escalateShield(
  existingShield: HarassmentShieldState,
  newSignals: HarassmentDetectionSignal[]
): Promise<HarassmentShieldState> {
  // Add new signals
  const allSignals = [...existingShield.signals, ...newSignals];
  const newRiskScore = calculateRiskScore(allSignals);
  const newLevel = determineShieldLevel(newRiskScore);
  
  const actions = [...existingShield.actions];
  
  // Check if escalation needed
  if (shouldEscalate(existingShield.level, newLevel)) {
    if (newLevel === 'MEDIUM' && existingShield.level === 'LOW') {
      // Upgrade to reply-only
      actions.push({
        action: 'ENABLED_REPLY_ONLY',
        takenAt: Timestamp.now(),
        reason: 'Harassment pattern continued',
        automaticAction: true,
      });
      existingShield.replyOnlyMode = true;
      existingShield.slowModeEnabled = false;
    } else if ((newLevel === 'HIGH' || newLevel === 'CRITICAL') && existingShield.level !== 'HIGH' && existingShield.level !== 'CRITICAL') {
      // Upgrade to hard block
      actions.push({
        action: 'CREATED_HARD_BLOCK',
        takenAt: Timestamp.now(),
        reason: 'Harassment escalated',
        automaticAction: true,
      });
      
      // Revoke consent
      await revokeConsent(existingShield.userId, existingShield.harasserId, 'SYSTEM', 'Harassment shield escalated');
      
      existingShield.hardBlocked = true;
      existingShield.replyOnlyMode = false;
      existingShield.slowModeEnabled = false;
      
      // Create case if not already created
      if (!existingShield.caseCreated) {
        const caseId = await createSafetyCase(
          existingShield.userId,
          existingShield.harasserId,
          allSignals,
          newLevel
        );
        existingShield.caseId = caseId;
        existingShield.caseCreated = true;
        
        actions.push({
          action: 'CREATED_CASE',
          takenAt: Timestamp.now(),
          reason: 'Escalated to safety team',
          automaticAction: true,
        });
      }
    }
    
    if (newLevel === 'CRITICAL') {
      actions.push({
        action: 'ESCALATED_TO_CRITICAL',
        takenAt: Timestamp.now(),
        reason: 'Critical harassment detected',
        automaticAction: true,
      });
    }
    
    existingShield.lastEscalatedAt = Timestamp.now();
  }
  
  // Update shield
  existingShield.level = newLevel;
  existingShield.riskScore = newRiskScore;
  existingShield.signals = allSignals;
  existingShield.actions = actions;
  
  const shieldId = `${existingShield.userId}_${existingShield.harasserId}`;
  await db.collection(SHIELD_COLLECTION).doc(shieldId).update({
    level: newLevel,
    riskScore: newRiskScore,
    signals: allSignals,
    actions,
    slowModeEnabled: existingShield.slowModeEnabled,
    replyOnlyMode: existingShield.replyOnlyMode,
    hardBlocked: existingShield.hardBlocked,
    caseCreated: existingShield.caseCreated,
    ...(existingShield.caseId && { caseId: existingShield.caseId }),
    ...(existingShield.lastEscalatedAt && { lastEscalatedAt: existingShield.lastEscalatedAt }),
  });
  
  return existingShield;
}

/**
 * Check if shield is active for a user pair
 */
export async function getActiveShield(
  userId: string,
  counterpartId: string
): Promise<HarassmentShieldState | null> {
  const shieldId = `${userId}_${counterpartId}`;
  const shield = await db.collection(SHIELD_COLLECTION).doc(shieldId).get();
  
  if (!shield.exists) {
    return null;
  }
  
  const data = shield.data() as HarassmentShieldState;
  
  // Only return if not resolved
  if (data.resolvedAt) {
    return null;
  }
  
  return data;
}

/**
 * Resolve harassment shield (manual moderator action)
 */
export async function resolveHarassmentShield(
  userId: string,
  harasserId: string,
  resolvedBy: string,
  reason: string
): Promise<void> {
  const shieldId = `${userId}_${harasserId}`;
  
  await db.collection(SHIELD_COLLECTION).doc(shieldId).update({
    resolvedAt: Timestamp.now(),
    actions: FieldValue.arrayUnion({
      action: 'RESOLVED',
      takenAt: Timestamp.now(),
      reason,
      automaticAction: false,
      resolvedBy,
    }),
  });
  
  await logSafetyEvent('HARASSMENT_SHIELD_RESOLVED', userId, harasserId, {
    resolvedBy,
    reason,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate aggregated risk score from signals
 */
function calculateRiskScore(signals: HarassmentDetectionSignal[]): number {
  if (signals.length === 0) return 0;
  
  const weights: Record<HarassmentDetectionSignal['type'], number> = {
    'SPAM_BURST': 15,
    'REPEATED_UNWANTED': 20,
    'IMPERSONATION_ATTEMPT': 40,
    'NSFW_PRESSURE': 35,
    'TRAUMA_RISK_PHRASE': 50,
    'BLOCK_EVASION': 45,
    'COORDINATED_HARASSMENT': 50,
  };
  
  let totalScore = 0;
  
  for (const signal of signals) {
    const baseWeight = weights[signal.type] || 10;
    const weightedScore = baseWeight * signal.confidence;
    totalScore += weightedScore;
  }
  
  // Cap at 100
  return Math.min(totalScore, 100);
}

/**
 * Determine shield level from risk score
 */
function determineShieldLevel(riskScore: number): HarassmentShieldLevel {
  if (riskScore >= 75) return 'CRITICAL';
  if (riskScore >= 50) return 'HIGH';
  if (riskScore >= 25) return 'MEDIUM';
  if (riskScore >= 10) return 'LOW';
  return 'NONE';
}

/**
 * Check if shield should escalate
 */
function shouldEscalate(currentLevel: HarassmentShieldLevel, newLevel: HarassmentShieldLevel): boolean {
  const levelOrder: HarassmentShieldLevel[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const currentIndex = levelOrder.indexOf(currentLevel);
  const newIndex = levelOrder.indexOf(newLevel);
  return newIndex > currentIndex;
}

/**
 * Calculate string similarity (for impersonation detection)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Levenshtein distance
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Create safety case for moderation
 */
async function createSafetyCase(
  protectedUserId: string,
  harasserId: string,
  signals: HarassmentDetectionSignal[],
  severity: HarassmentShieldLevel
): Promise<string> {
  const caseData = {
    subjectUserId: harasserId,
    reportedBy: protectedUserId,
    reasonCodes: signals.map(s => s.type),
    priority: severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
    status: 'OPEN',
    createdAt: Timestamp.now(),
    source: 'HARASSMENT_SHIELD',
    signals: signals.map(s => ({
      type: s.type,
      confidence: s.confidence,
      detectedAt: s.detectedAt,
    })),
  };
  
  const caseRef = await db.collection('moderation_cases').add(caseData);
  return caseRef.id;
}

/**
 * Log safety event
 */
async function logSafetyEvent(
  eventType: SafetyAuditLog['eventType'],
  userId: string,
  affectedUserId: string,
  details: Record<string, any>
): Promise<void> {
  const log: SafetyAuditLog = {
    logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    userId,
    affectedUserId,
    details,
    timestamp: Timestamp.now(),
    gdprCompliant: true,
    retentionPeriod: 90,
  };
  
  await db.collection(SAFETY_AUDIT_COLLECTION).add(log);
}