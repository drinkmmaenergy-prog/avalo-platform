/**
 * PACK 174 - Emotional Manipulation Detection
 * Detect emotional manipulation tied to spending
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import { EmotionalManipulationLog, ManipulationType } from './types';

const MANIPULATION_PATTERNS = [
  {
    type: 'guilt_for_not_buying' as ManipulationType,
    patterns: [
      /(?:disappointed|sad|hurt).*(?:didn't|won't).*(?:buy|spend|gift)/i,
      /expected.*(?:more|better).*from.*you/i,
      /thought.*you.*cared.*(?:more|enough)/i,
    ],
    severity: 'high' as const,
  },
  {
    type: 'conditional_affection' as ManipulationType,
    patterns: [
      /(?:love|like|care).*you.*if.*(?:buy|spend|pay|gift)/i,
      /only.*(?:love|like|care).*(?:when|if).*(?:spend|pay|give)/i,
      /(?:affection|attention).*depends.*(?:on|spending|gifts)/i,
    ],
    severity: 'critical' as const,
  },
  {
    type: 'loyalty_through_spending' as ManipulationType,
    patterns: [
      /prove.*(?:loyalty|devotion).*(?:by|through).*(?:spending|buying|gifting)/i,
      /real.*(?:fan|supporter).*would.*(?:buy|spend|pay)/i,
      /show.*(?:you|your).*support.*(?:by|with).*money/i,
    ],
    severity: 'high' as const,
  },
  {
    type: 'transactional_love' as ManipulationType,
    patterns: [
      /(?:i'll|will|would).*love.*you.*(?:if|when).*(?:you|spend|pay)/i,
      /love.*(?:requires|needs).*(?:financial|money|spending)/i,
      /relationship.*(?:costs|requires).*money/i,
    ],
    severity: 'critical' as const,
  },
  {
    type: 'continuous_spending_pressure' as ManipulationType,
    patterns: [
      /(?:keep|continue).*spending.*(?:to|for).*(?:stay|remain|keep)/i,
      /stop.*spending.*(?:i'll|will).*(?:leave|ignore|block|stop)/i,
      /(?:more|keep).*gifts.*(?:or|to).*(?:maintain|keep|continue)/i,
    ],
    severity: 'critical' as const,
  },
];

/**
 * Detect emotional manipulation in message
 */
export const detectEmotionalManipulation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { content, recipientId, messageId } = request.data;

  if (!content) {
    throw new HttpsError('invalid-argument', 'Content is required');
  }

  const detection = analyzeForManipulation(content);

  if (detection.isManipulative) {
    const logId = generateId();
    const manipulationLog: Partial<EmotionalManipulationLog> = {
      id: logId,
      senderId: userId,
      victimUserId: recipientId,
      manipulationType: detection.type,
      severity: detection.severity,
      content,
      messageId,
      blocked: detection.shouldBlock,
      warningIssued: !detection.shouldBlock,
      createdAt: new Date(),
    };

    await db.collection('emotional_manipulation_logs').doc(logId).set(manipulationLog);

    if (detection.shouldBlock) {
      await applyManipulatorRestriction(userId, detection.type, detection.severity);
      
      await db.collection('fraud_cases').add({
        id: generateId(),
        userId,
        targetUserId: recipientId,
        fraudType: 'romance_fraud',
        status: 'open',
        severity: detection.severity,
        riskScore: detection.severity === 'critical' ? 90 : 70,
        evidence: [{
          type: 'message',
          id: messageId || logId,
          data: { content, manipulationType: detection.type },
          timestamp: new Date(),
        }],
        description: `Emotional manipulation detected: ${detection.type}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      allowed: !detection.shouldBlock,
      blocked: detection.shouldBlock,
      manipulationType: detection.type,
      severity: detection.severity,
      reason: detection.reason,
      warningMessage: detection.warningMessage,
    };
  }

  return {
    allowed: true,
    blocked: false,
  };
});

/**
 * Report emotional manipulation
 */
export const reportEmotionalManipulation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    manipulatorId,
    manipulationType,
    evidence,
    description,
  } = request.data;

  if (!manipulatorId || !manipulationType) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const logId = generateId();
  const now = new Date();

  await db.collection('emotional_manipulation_logs').doc(logId).set({
    id: logId,
    senderId: manipulatorId,
    victimUserId: userId,
    manipulationType,
    severity: 'high',
    content: description,
    blocked: false,
    warningIssued: false,
    createdAt: now,
  });

  await db.collection('fraud_cases').add({
    id: generateId(),
    userId: manipulatorId,
    targetUserId: userId,
    fraudType: 'romance_fraud',
    status: 'open',
    severity: 'high',
    riskScore: 75,
    evidence: [{
      type: 'report',
      id: logId,
      data: { description, evidence, manipulationType },
      timestamp: now,
    }],
    description: `Emotional manipulation reported: ${manipulationType}`,
    createdAt: now,
    updatedAt: now,
  });

  return { success: true, reportId: logId };
});

/**
 * Get user manipulation history
 */
export const getUserManipulationHistory = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId } = request.data;

  if (!targetUserId) {
    throw new HttpsError('invalid-argument', 'Target user ID is required');
  }

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (targetUserId !== userId && !isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  const logs = await db.collection('emotional_manipulation_logs')
    .where('senderId', '==', targetUserId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const manipulationCounts: { [key: string]: number } = {};
  const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  let blockedCount = 0;

  logs.forEach(doc => {
    const data = doc.data();
    manipulationCounts[data.manipulationType] = (manipulationCounts[data.manipulationType] || 0) + 1;
    severityCounts[data.severity as keyof typeof severityCounts]++;
    if (data.blocked) blockedCount++;
  });

  const riskScore = calculateManipulationRiskScore(logs.size, blockedCount, severityCounts);

  return {
    totalIncidents: logs.size,
    blockedIncidents: blockedCount,
    manipulationTypes: manipulationCounts,
    severityCounts,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
  };
});

/**
 * Analyze content for manipulation
 */
function analyzeForManipulation(content: string): {
  isManipulative: boolean;
  type: ManipulationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  shouldBlock: boolean;
  reason: string;
  warningMessage: string;
} {
  for (const category of MANIPULATION_PATTERNS) {
    for (const pattern of category.patterns) {
      if (pattern.test(content)) {
        return {
          isManipulative: true,
          type: category.type,
          severity: category.severity,
          shouldBlock: category.severity === 'critical',
          reason: `Emotional manipulation detected: ${category.type}`,
          warningMessage: category.severity === 'critical'
            ? 'This message has been blocked as it contains emotional manipulation tied to financial exploitation.'
            : 'Warning: This message may contain emotional manipulation. Please exercise caution.',
        };
      }
    }
  }

  return {
    isManipulative: false,
    type: 'guilt_for_not_buying',
    severity: 'low',
    shouldBlock: false,
    reason: '',
    warningMessage: '',
  };
}

/**
 * Calculate manipulation risk score
 */
function calculateManipulationRiskScore(
  totalIncidents: number,
  blockedIncidents: number,
  severityCounts: { low: number; medium: number; high: number; critical: number }
): number {
  let score = 0;

  score += totalIncidents * 8;
  score += blockedIncidents * 20;
  score += severityCounts.low * 5;
  score += severityCounts.medium * 10;
  score += severityCounts.high * 20;
  score += severityCounts.critical * 35;

  return Math.min(score, 100);
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Apply restrictions to manipulator
 */
async function applyManipulatorRestriction(
  userId: string,
  manipulationType: ManipulationType,
  severity: string
): Promise<void> {
  const duration = severity === 'critical' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + duration);

  await db.collection('fraud_mitigation_actions').add({
    id: generateId(),
    userId,
    caseId: 'emotional_manipulation_auto',
    actionType: severity === 'critical' ? 'account_freeze' : 'temp_restriction',
    reason: `Automatic restriction for emotional manipulation: ${manipulationType}`,
    duration,
    appliedAt: serverTimestamp(),
    expiresAt,
  });
}

/**
 * Helper: Check if user is fraud investigator
 */
async function checkIsFraudInvestigator(userId: string): Promise<boolean> {
  const investigatorDoc = await db.collection('fraud_investigators').doc(userId).get();
  return investigatorDoc.exists;
}

/**
 * Helper: Check if user is admin
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.role === 'admin';
}