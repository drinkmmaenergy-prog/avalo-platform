/**
 * PACK 238 — Chat Motivation Engine
 * Safety Enforcement Module
 * 
 * Ensures boosters NEVER trigger when safety conditions are violated
 */

import * as admin from 'firebase-admin';
import { SafetyCheckResult } from './types/pack238-chat-motivation';

const db = admin.firestore();

/**
 * Safety Priority Levels
 */
export enum SafetyPriority {
  CRITICAL = 'critical',   // Immediate block, no exceptions
  HIGH = 'high',          // Block with monitoring
  MEDIUM = 'medium',      // Warn but allow with restrictions
}

/**
 * Safety Violation Types
 */
export interface SafetyViolation {
  type: 
    | 'sleep_mode'
    | 'breakup_recovery'
    | 'safety_incident'
    | 'age_gap_threshold'
    | 'stalker_risk'
    | 'harassment_detected'
    | 'block_active'
    | 'report_pending';
  
  priority: SafetyPriority;
  triggeredAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp | null;
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Comprehensive Safety Check
 * Checks all safety conditions before allowing booster activation
 */
export async function performSafetyCheck(chatId: string): Promise<SafetyCheckResult> {
  try {
    const chatDoc = await db.collection('chats').doc(chatId).get();
    
    if (!chatDoc.exists) {
      return {
        allowed: false,
        reason: 'Chat not found',
      };
    }

    const chatData = chatDoc.data()!;
    const violations: SafetyViolation[] = [];

    // CRITICAL SAFETY CHECKS (Immediate Block)

    // 1. Check if either user has blocked the other
    if (chatData.user1Blocked || chatData.user2Blocked) {
      violations.push({
        type: 'block_active',
        priority: SafetyPriority.CRITICAL,
        triggeredAt: admin.firestore.Timestamp.now(),
        expiresAt: null,
        reason: 'User has blocked the other participant',
      });
    }

    // 2. Check for active safety incidents
    if (chatData.safetyIncidentFlagged) {
      violations.push({
        type: 'safety_incident',
        priority: SafetyPriority.CRITICAL,
        triggeredAt: chatData.safetyIncidentFlaggedAt || admin.firestore.Timestamp.now(),
        expiresAt: null,
        reason: 'Safety incident has been flagged for this conversation',
      });
    }

    // 3. Check for stalker risk
    if (chatData.stalkerRiskHigh) {
      violations.push({
        type: 'stalker_risk',
        priority: SafetyPriority.CRITICAL,
        triggeredAt: chatData.stalkerRiskDetectedAt || admin.firestore.Timestamp.now(),
        expiresAt: null,
        reason: 'High stalker risk detected',
        metadata: {
          riskScore: chatData.stalkerRiskScore || 0,
        },
      });
    }

    // HIGH PRIORITY CHECKS

    // 4. Check Sleep Mode (user wants no interruptions)
    if (chatData.sleepModeActive) {
      const sleepModeEnd = chatData.sleepModeEndsAt;
      violations.push({
        type: 'sleep_mode',
        priority: SafetyPriority.HIGH,
        triggeredAt: chatData.sleepModeActivatedAt || admin.firestore.Timestamp.now(),
        expiresAt: sleepModeEnd || null,
        reason: 'User has activated Sleep Mode',
        metadata: {
          endsAt: sleepModeEnd?.toMillis() || null,
        },
      });
    }

    // 5. Check Breakup Recovery Mode
    if (chatData.breakupRecoveryActive) {
      const recoveryEnd = chatData.breakupRecoveryEndsAt;
      violations.push({
        type: 'breakup_recovery',
        priority: SafetyPriority.HIGH,
        triggeredAt: chatData.breakupRecoveryActivatedAt || admin.firestore.Timestamp.now(),
        expiresAt: recoveryEnd || null,
        reason: 'User is in Breakup Recovery mode',
        metadata: {
          endsAt: recoveryEnd?.toMillis() || null,
        },
      });
    }

    // 6. Check Age Gap Safety
    if (chatData.ageGapSafetyTriggered) {
      violations.push({
        type: 'age_gap_threshold',
        priority: SafetyPriority.HIGH,
        triggeredAt: admin.firestore.Timestamp.now(),
        expiresAt: null,
        reason: 'Age gap safety threshold exceeded',
        metadata: {
          ageGap: chatData.ageGap || 0,
          threshold: chatData.ageGapThreshold || 0,
        },
      });
    }

    // 7. Check for pending harassment reports
    const reportsSnapshot = await db
      .collection('safetyReports')
      .where('chatId', '==', chatId)
      .where('status', '==', 'pending')
      .where('type', '==', 'harassment')
      .limit(1)
      .get();

    if (!reportsSnapshot.empty) {
      violations.push({
        type: 'report_pending',
        priority: SafetyPriority.HIGH,
        triggeredAt: admin.firestore.Timestamp.now(),
        expiresAt: null,
        reason: 'Harassment report is pending investigation',
      });
    }

    // Check for CRITICAL violations
    const criticalViolations = violations.filter(v => v.priority === SafetyPriority.CRITICAL);
    if (criticalViolations.length > 0) {
      const violation = criticalViolations[0];
      return {
        allowed: false,
        reason: violation.reason,
        blockedBy: violation.type as any,
      };
    }

    // Check for HIGH priority violations
    const highViolations = violations.filter(v => v.priority === SafetyPriority.HIGH);
    if (highViolations.length > 0) {
      const violation = highViolations[0];
      return {
        allowed: false,
        reason: violation.reason,
        blockedBy: violation.type as any,
      };
    }

    // All checks passed
    return {
      allowed: true,
    };

  } catch (error) {
    console.error('Error performing safety check:', error);
    // Fail-safe: Block on error
    return {
      allowed: false,
      reason: 'Safety check error - blocking as precaution',
    };
  }
}

/**
 * Check User-Specific Safety Settings
 */
export async function checkUserSafetySettings(userId: string): Promise<{
  allowBoosters: boolean;
  reason?: string;
}> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { allowBoosters: false, reason: 'User not found' };
    }

    const userData = userDoc.data()!;

    // Check if user has disabled boosters
    if (userData.boostersDisabled === true) {
      return {
        allowBoosters: false,
        reason: 'User has disabled conversation boosters',
      };
    }

    // Check if user is under investigation
    if (userData.underInvestigation === true) {
      return {
        allowBoosters: false,
        reason: 'User account is under safety investigation',
      };
    }

    // Check if user is suspended
    if (userData.suspended === true) {
      return {
        allowBoosters: false,
        reason: 'User account is suspended',
      };
    }

    return { allowBoosters: true };

  } catch (error) {
    console.error('Error checking user safety settings:', error);
    // Fail-safe
    return { allowBoosters: false, reason: 'Safety check error' };
  }
}

/**
 * Check Both Participants Safety
 */
export async function checkParticipantsSafety(
  user1Id: string,
  user2Id: string
): Promise<SafetyCheckResult> {
  const user1Check = await checkUserSafetySettings(user1Id);
  const user2Check = await checkUserSafetySettings(user2Id);

  if (!user1Check.allowBoosters) {
    return {
      allowed: false,
      reason: `User 1: ${user1Check.reason}`,
    };
  }

  if (!user2Check.allowBoosters) {
    return {
      allowed: false,
      reason: `User 2: ${user2Check.reason}`,
    };
  }

  return { allowed: true };
}

/**
 * Log Safety Block Event
 */
export async function logSafetyBlock(
  chatId: string,
  userId: string,
  violation: SafetyViolation
): Promise<void> {
  try {
    await db.collection('safetyBlockLogs').add({
      chatId,
      userId,
      violationType: violation.type,
      priority: violation.priority,
      reason: violation.reason,
      blockedAt: admin.firestore.Timestamp.now(),
      metadata: violation.metadata || {},
    });
  } catch (error) {
    console.error('Error logging safety block:', error);
  }
}

/**
 * Emergency Safety Shutdown
 * Immediately disables all boosters for a chat
 */
export async function emergencyShutdown(
  chatId: string,
  reason: string
): Promise<void> {
  try {
    const batch = db.batch();

    // Deactivate all active boosters
    const boostersSnapshot = await db
      .collection('chats')
      .doc(chatId)
      .collection('boosters')
      .where('active', '==', true)
      .get();

    boostersSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        active: false,
        emergencyShutdown: true,
        shutdownReason: reason,
        shutdownAt: admin.firestore.Timestamp.now(),
      });
    });

    // Flag chat
    batch.update(db.collection('chats').doc(chatId), {
      boostersEmergencyShutdown: true,
      emergencyShutdownReason: reason,
      emergencyShutdownAt: admin.firestore.Timestamp.now(),
    });

    await batch.commit();

    console.log(`Emergency shutdown executed for chat ${chatId}: ${reason}`);

  } catch (error) {
    console.error('Error executing emergency shutdown:', error);
    throw error;
  }
}

/**
 * Validate Booster Content Safety
 * Ensures booster prompts are App Store compliant
 */
export function validateBoosterContent(prompt: string): {
  isAppStoreSafe: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Forbidden content patterns
  const forbiddenPatterns = [
    { pattern: /\bsex\b/i, reason: 'Sexual content' },
    { pattern: /\bnude\b/i, reason: 'Nudity reference' },
    { pattern: /\bexplicit\b/i, reason: 'Explicit content hint' },
    { pattern: /\bnsfw\b/i, reason: 'NSFW reference' },
    { pattern: /\b(penis|vagina|breast)\b/i, reason: 'Explicit anatomical terms' },
  ];

  forbiddenPatterns.forEach(({ pattern, reason }) => {
    if (pattern.test(prompt)) {
      violations.push(reason);
    }
  });

  return {
    isAppStoreSafe: violations.length === 0,
    violations,
  };
}

/**
 * Monitor and Auto-Adjust Safety Thresholds
 */
export async function adjustSafetyThresholds(chatId: string): Promise<void> {
  try {
    // Get recent safety incidents for this chat
    const incidentsSnapshot = await db
      .collection('safetyIncidents')
      .where('chatId', '==', chatId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const incidentCount = incidentsSnapshot.size;

    // If multiple incidents, increase safety level
    if (incidentCount >= 3) {
      await db.collection('chats').doc(chatId).update({
        safetyLevel: 'high',
        boosterCooldownMultiplier: 2.0, // Double cooldown time
        requireManualApproval: true,
      });
    } else if (incidentCount >= 1) {
      await db.collection('chats').doc(chatId).update({
        safetyLevel: 'elevated',
        boosterCooldownMultiplier: 1.5,
      });
    }

  } catch (error) {
    console.error('Error adjusting safety thresholds:', error);
  }
}

/**
 * NON-NEGOTIABLE: Safety > Monetization
 * This function is called before ANY booster activation
 */
export async function enforceSafetyFirst(
  chatId: string,
  user1Id: string,
  user2Id: string
): Promise<SafetyCheckResult> {
  // Check chat-level safety
  const chatSafety = await performSafetyCheck(chatId);
  if (!chatSafety.allowed) {
    await logSafetyBlock(chatId, user1Id, {
      type: chatSafety.blockedBy as any,
      priority: SafetyPriority.CRITICAL,
      triggeredAt: admin.firestore.Timestamp.now(),
      expiresAt: null,
      reason: chatSafety.reason || 'Safety check failed',
    });
    return chatSafety;
  }

  // Check both participants
  const participantsSafety = await checkParticipantsSafety(user1Id, user2Id);
  if (!participantsSafety.allowed) {
    return participantsSafety;
  }

  // All safety checks passed
  return { allowed: true };
}