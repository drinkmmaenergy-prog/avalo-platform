/**
 * PACK 174 - Crypto Scam Detection
 * Detect and block cryptocurrency investment scams and traps
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import { ScamType, CryptoScamLog } from './types';

const CRYPTO_SCAM_PATTERNS = [
  /invest.*(?:crypto|bitcoin|btc|eth|token|coin)/i,
  /guaranteed.*(?:profit|returns|roi)/i,
  /get.*rich.*(?:quick|fast)/i,
  /(?:10x|100x|1000x).*(?:gains|returns)/i,
  /send.*(?:crypto|bitcoin|eth).*(?:double|triple)/i,
  /wallet.*address.*(?:0x[a-fA-F0-9]{40}|[13][a-zA-Z0-9]{25,34})/i,
  /pyramid.*scheme/i,
  /multi.*level.*marketing/i,
  /ponzi.*scheme/i,
  /high.*yield.*investment/i,
  /trading.*signals.*group/i,
  /forex.*(?:trading|course|profits)/i,
  /nft.*(?:mint|drop).*guaranteed/i,
  /pump.*and.*dump/i,
  /private.*sale.*token/i,
  /presale.*guaranteed.*allocation/i,
];

const BANNED_CRYPTO_KEYWORDS = [
  'send crypto outside avalo',
  'transfer to my wallet',
  'invest in my coin',
  'buy my token',
  'guaranteed returns',
  'risk-free investment',
  'financial freedom',
  'passive income opportunity',
  'get rich scheme',
];

/**
 * Detect crypto scam in message content
 */
export const detectCryptoScam = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { content, messageId, recipientId, context } = request.data;

  if (!content) {
    throw new HttpsError('invalid-argument', 'Content is required');
  }

  const detection = analyzeContentForScam(content);

  if (detection.isScam) {
    const logId = generateId();
    const scamLog: Partial<CryptoScamLog> = {
      id: logId,
      userId,
      targetUserId: recipientId,
      scamType: detection.scamType,
      severity: detection.severity,
      content,
      context: {
        messageId,
        ...context,
      },
      blocked: detection.shouldBlock,
      actionTaken: detection.shouldBlock ? 'blocked' : 'flagged',
      createdAt: new Date(),
    };

    await db.collection('crypto_scam_logs').doc(logId).set(scamLog);

    if (detection.shouldBlock) {
      await applyScammerRestriction(userId, detection.scamType, detection.severity);
    }

    return {
      allowed: !detection.shouldBlock,
      blocked: detection.shouldBlock,
      reason: detection.reason,
      severity: detection.severity,
      warningMessage: detection.warningMessage,
    };
  }

  return {
    allowed: true,
    blocked: false,
  };
});

/**
 * Check if user is promoting crypto scams
 */
export const checkUserCryptoActivity = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId } = request.data;
  const checkUserId = targetUserId || userId;

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (checkUserId !== userId && !isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  const recentLogs = await db.collection('crypto_scam_logs')
    .where('userId', '==', checkUserId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const scamAttempts = recentLogs.size;
  const blockedAttempts = recentLogs.docs.filter(doc => doc.data().blocked).length;
  
  const severityCounts = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  const scamTypes: { [key: string]: number } = {};

  recentLogs.forEach(doc => {
    const data = doc.data();
    severityCounts[data.severity as keyof typeof severityCounts]++;
    scamTypes[data.scamType] = (scamTypes[data.scamType] || 0) + 1;
  });

  const riskScore = calculateCryptoRiskScore(scamAttempts, blockedAttempts, severityCounts);

  return {
    scamAttempts,
    blockedAttempts,
    severityCounts,
    scamTypes,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
  };
});

/**
 * Report crypto scam profile
 */
export const reportCryptoScammer = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { scammerId, scamType, evidence, description } = request.data;

  if (!scammerId || !scamType || !description) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const logId = generateId();
  const now = new Date();

  await db.collection('crypto_scam_logs').doc(logId).set({
    id: logId,
    userId: scammerId,
    targetUserId: userId,
    scamType,
    severity: 'high',
    content: description,
    context: {
      reportedBy: userId,
      evidence: evidence || [],
    },
    blocked: false,
    actionTaken: 'reported',
    createdAt: now,
  });

  await db.collection('fraud_cases').add({
    id: generateId(),
    userId: scammerId,
    targetUserId: userId,
    fraudType: 'crypto_trap',
    status: 'open',
    severity: 'high',
    riskScore: 75,
    evidence: [{
      type: 'report',
      id: logId,
      data: { description, evidence },
      timestamp: now,
    }],
    description: `Crypto scam report: ${scamType}`,
    createdAt: now,
    updatedAt: now,
  });

  return { success: true, reportId: logId };
});

/**
 * Analyze content for crypto scam patterns
 */
function analyzeContentForScam(content: string): {
  isScam: boolean;
  scamType: ScamType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  shouldBlock: boolean;
  reason?: string;
  warningMessage?: string;
} {
  const lowerContent = content.toLowerCase();

  for (const keyword of BANNED_CRYPTO_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return {
        isScam: true,
        scamType: 'crypto_investment',
        severity: 'critical',
        shouldBlock: true,
        reason: 'Contains banned crypto scam keyword',
        warningMessage: 'This message promotes cryptocurrency scams and has been blocked.',
      };
    }
  }

  for (const pattern of CRYPTO_SCAM_PATTERNS) {
    if (pattern.test(content)) {
      const severity = determineSeverityFromPattern(content);
      return {
        isScam: true,
        scamType: determineScamType(content),
        severity,
        shouldBlock: severity === 'critical' || severity === 'high',
        reason: 'Matches crypto scam pattern',
        warningMessage: severity === 'critical' || severity === 'high' 
          ? 'This message promotes suspicious investment schemes and has been blocked.'
          : 'Warning: This content may contain investment advice. Please exercise caution.',
      };
    }
  }

  return {
    isScam: false,
    scamType: 'crypto_investment',
    severity: 'low',
    shouldBlock: false,
  };
}

/**
 * Determine scam type from content
 */
function determineScamType(content: string): ScamType {
  const lowerContent = content.toLowerCase();

  if (/pyramid|mlm|multi.*level/i.test(content)) {
    return 'pyramid_scheme';
  }
  if (/guaranteed.*return|high.*yield/i.test(content)) {
    return 'high_yield_investment';
  }
  if (/trading.*signal|forex.*course/i.test(content)) {
    return lowerContent.includes('forex') ? 'forex_scam' : 'trading_signals';
  }
  if (/get.*rich.*quick|financial.*freedom/i.test(content)) {
    return 'get_rich_quick';
  }
  if (/nft.*mint|nft.*drop/i.test(content)) {
    return 'nft_scam';
  }
  if (/buy.*(?:my|our).*token|invest.*(?:my|our).*coin/i.test(content)) {
    return 'token_promotion';
  }

  return 'crypto_investment';
}

/**
 * Determine severity from pattern matching
 */
function determineSeverityFromPattern(content: string): 'low' | 'medium' | 'high' | 'critical' {
  const criticalPatterns = [
    /send.*(?:crypto|bitcoin|eth).*(?:address|wallet)/i,
    /guaranteed.*(?:10x|100x|1000x)/i,
    /pyramid.*scheme/i,
    /ponzi.*scheme/i,
  ];

  const highPatterns = [
    /invest.*guaranteed.*returns/i,
    /risk.*free.*investment/i,
    /financial.*freedom.*guaranteed/i,
  ];

  for (const pattern of criticalPatterns) {
    if (pattern.test(content)) {
      return 'critical';
    }
  }

  for (const pattern of highPatterns) {
    if (pattern.test(content)) {
      return 'high';
    }
  }

  if (CRYPTO_SCAM_PATTERNS.some(p => p.test(content))) {
    return 'medium';
  }

  return 'low';
}

/**
 * Calculate crypto risk score
 */
function calculateCryptoRiskScore(
  totalAttempts: number,
  blockedAttempts: number,
  severityCounts: { low: number; medium: number; high: number; critical: number }
): number {
  let score = 0;

  score += totalAttempts * 5;
  score += blockedAttempts * 15;
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
 * Apply restrictions to scammer
 */
async function applyScammerRestriction(
  userId: string,
  scamType: ScamType,
  severity: string
): Promise<void> {
  const duration = severity === 'critical' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + duration);

  await db.collection('fraud_mitigation_actions').add({
    id: generateId(),
    userId,
    caseId: 'crypto_scam_auto',
    actionType: severity === 'critical' ? 'account_freeze' : 'temp_restriction',
    reason: `Automatic restriction for crypto scam: ${scamType}`,
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