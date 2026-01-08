/**
 * PACK 142 — Identity Fraud Social Graph Detection Engine
 * 
 * Detects repeated catfish patterns through:
 * - Phone number reuse
 * - Device fingerprint reuse
 * - Payout account reuse
 * - Region/IP mismatch
 * - Payment card pattern analysis
 * - Interaction cluster detection (from PACK 130)
 * 
 * NON-NEGOTIABLE RULES:
 * - Privacy-first (city-level location only)
 * - No economic interference
 * - Zero shame UX messaging
 * 
 * Integrates with PACK 130 Ban-Evasion Hunter
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  IdentityFraudSignal,
  SocialGraphFraudAnalysis,
  IdentityCheck,
  IdentityCheckStatus,
  IDENTITY_THRESHOLDS,
  shouldBlockUser,
} from './types/pack142-types';

const db = getFirestore();

declare const logger: {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
};

// ============================================================================
// PHONE NUMBER REUSE DETECTION
// ============================================================================

/**
 * Check if phone number is reused across accounts
 */
async function detectPhoneReuse(
  userId: string,
  phoneNumber: string
): Promise<IdentityFraudSignal | null> {
  // Get all users with this phone number
  const userSnapshot = await db
    .collection('users')
    .where('phoneNumber', '==', phoneNumber)
    .get();
  
  const relatedUserIds = userSnapshot.docs
    .map(doc => doc.id)
    .filter(id => id !== userId);
  
  if (relatedUserIds.length === 0) {
    return null;
  }
  
  const riskScore = Math.min(1.0, relatedUserIds.length * 0.3);
  const fraudDetected = relatedUserIds.length >= 2;
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_phone_${userId}_${Date.now()}`,
    userId,
    signalType: 'PHONE_REUSE',
    signalData: {
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), // Mask for privacy
      reuseCount: relatedUserIds.length,
    },
    riskScore,
    relatedUserIds,
    fraudDetected,
    confidence: 0.8,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// DEVICE FINGERPRINT REUSE DETECTION
// ============================================================================

/**
 * Check if device fingerprint is reused across accounts
 */
async function detectDeviceReuse(
  userId: string,
  deviceFingerprint: string
): Promise<IdentityFraudSignal | null> {
  // Get device fingerprints from PACK 130
  const fingerprintSnapshot = await db
    .collection('device_fingerprints')
    .where('fingerprint', '==', deviceFingerprint)
    .get();
  
  const relatedUserIds = fingerprintSnapshot.docs
    .map(doc => doc.data().userId)
    .filter(id => id !== userId);
  
  if (relatedUserIds.length === 0) {
    return null;
  }
  
  const riskScore = Math.min(1.0, relatedUserIds.length * 0.35);
  const fraudDetected = relatedUserIds.length >= 2;
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_device_${userId}_${Date.now()}`,
    userId,
    signalType: 'DEVICE_REUSE',
    signalData: {
      deviceFingerprintHash: deviceFingerprint.substring(0, 8) + '...',
      reuseCount: relatedUserIds.length,
    },
    riskScore,
    relatedUserIds,
    fraudDetected,
    confidence: 0.85,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// PAYOUT ACCOUNT REUSE DETECTION
// ============================================================================

/**
 * Check if payout account is reused across accounts
 */
async function detectPayoutAccountReuse(
  userId: string,
  payoutAccountId: string
): Promise<IdentityFraudSignal | null> {
  // Get all users with this payout account
  const payoutSnapshot = await db
    .collection('payout_accounts')
    .where('accountId', '==', payoutAccountId)
    .get();
  
  const relatedUserIds = payoutSnapshot.docs
    .map(doc => doc.data().userId)
    .filter(id => id !== userId);
  
  if (relatedUserIds.length === 0) {
    return null;
  }
  
  const riskScore = Math.min(1.0, relatedUserIds.length * 0.4);
  const fraudDetected = relatedUserIds.length >= 1; // Even 1 reuse is suspicious
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_payout_${userId}_${Date.now()}`,
    userId,
    signalType: 'PAYOUT_ACCOUNT_REUSE',
    signalData: {
      accountType: 'bank_account',
      reuseCount: relatedUserIds.length,
    },
    riskScore,
    relatedUserIds,
    fraudDetected,
    confidence: 0.9,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// REGION/IP MISMATCH DETECTION
// ============================================================================

/**
 * Check for suspicious region/IP mismatches
 */
async function detectRegionIPMismatch(
  userId: string,
  currentIP: string,
  declaredRegion: string
): Promise<IdentityFraudSignal | null> {
  // Get IP geolocation (in production, use IP geolocation service)
  // Simulated: assume IP gives us a region
  const ipRegion = 'region_from_ip';
  
  // Check if declared region matches IP region
  const mismatch = ipRegion !== declaredRegion;
  
  if (!mismatch) {
    return null;
  }
  
  // Check if user has history of VPN/proxy use
  const ipHistory = await db
    .collection('user_ip_history')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  
  const uniqueRegions = new Set(ipHistory.docs.map(doc => doc.data().region));
  const regionCount = uniqueRegions.size;
  
  const riskScore = Math.min(1.0, regionCount * 0.15);
  const fraudDetected = regionCount >= 5;
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_region_${userId}_${Date.now()}`,
    userId,
    signalType: 'REGION_IP_MISMATCH',
    signalData: {
      declaredRegion,
      ipRegion,
      uniqueRegionCount: regionCount,
    },
    riskScore,
    relatedUserIds: [],
    fraudDetected,
    confidence: 0.6,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// PAYMENT CARD PATTERN DETECTION
// ============================================================================

/**
 * Check for suspicious payment card patterns
 */
async function detectPaymentCardPattern(
  userId: string,
  cardFingerprint: string
): Promise<IdentityFraudSignal | null> {
  // Get payment card usage across accounts
  const cardSnapshot = await db
    .collection('payment_cards')
    .where('fingerprint', '==', cardFingerprint)
    .get();
  
  const relatedUserIds = cardSnapshot.docs
    .map(doc => doc.data().userId)
    .filter(id => id !== userId);
  
  if (relatedUserIds.length === 0) {
    return null;
  }
  
  const riskScore = Math.min(1.0, relatedUserIds.length * 0.25);
  const fraudDetected = relatedUserIds.length >= 3;
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_payment_${userId}_${Date.now()}`,
    userId,
    signalType: 'PAYMENT_CARD_PATTERN',
    signalData: {
      cardType: 'credit_card',
      reuseCount: relatedUserIds.length,
    },
    riskScore,
    relatedUserIds,
    fraudDetected,
    confidence: 0.75,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// INTERACTION CLUSTER DETECTION (PACK 130 INTEGRATION)
// ============================================================================

/**
 * Check for coordinated account interaction patterns
 */
async function detectInteractionCluster(
  userId: string
): Promise<IdentityFraudSignal | null> {
  // Get interaction patterns from PACK 130
  const patrolBehavior = await db
    .collection('patrol_behavior_log')
    .where('userId', '==', userId)
    .where('eventType', '==', 'COORDINATED_ATTACK')
    .orderBy('detectedAt', 'desc')
    .limit(1)
    .get();
  
  if (patrolBehavior.empty) {
    return null;
  }
  
  const behaviorData = patrolBehavior.docs[0].data();
  const relatedUserIds = behaviorData.relatedUsers || [];
  
  const riskScore = Math.min(1.0, relatedUserIds.length * 0.2);
  const fraudDetected = relatedUserIds.length >= 3;
  
  const signal: IdentityFraudSignal = {
    signalId: `fraud_interaction_${userId}_${Date.now()}`,
    userId,
    signalType: 'INTERACTION_CLUSTER',
    signalData: {
      clusterSize: relatedUserIds.length,
      behaviorPattern: 'coordinated_activity',
    },
    riskScore,
    relatedUserIds,
    fraudDetected,
    confidence: 0.7,
    detectedAt: Timestamp.now(),
  };
  
  return signal;
}

// ============================================================================
// SOCIAL GRAPH FRAUD ANALYSIS
// ============================================================================

/**
 * Comprehensive social graph fraud analysis
 */
export async function analyzeSocialGraphFraud(
  userId: string,
  userData: {
    phoneNumber?: string;
    deviceFingerprint?: string;
    payoutAccountId?: string;
    currentIP?: string;
    declaredRegion?: string;
    cardFingerprint?: string;
  }
): Promise<SocialGraphFraudAnalysis> {
  const analysisId = `fraud_analysis_${userId}_${Date.now()}`;
  
  logger.info(`Running social graph fraud analysis ${analysisId} for user ${userId}`);
  
  // Run all fraud checks in parallel
  const signals = await Promise.all([
    userData.phoneNumber ? detectPhoneReuse(userId, userData.phoneNumber) : null,
    userData.deviceFingerprint ? detectDeviceReuse(userId, userData.deviceFingerprint) : null,
    userData.payoutAccountId ? detectPayoutAccountReuse(userId, userData.payoutAccountId) : null,
    userData.currentIP && userData.declaredRegion 
      ? detectRegionIPMismatch(userId, userData.currentIP, userData.declaredRegion) 
      : null,
    userData.cardFingerprint ? detectPaymentCardPattern(userId, userData.cardFingerprint) : null,
    detectInteractionCluster(userId),
  ]);
  
  // Filter out null signals
  const validSignals = signals.filter(s => s !== null) as IdentityFraudSignal[];
  
  // Save all signals
  for (const signal of validSignals) {
    await db.collection('identity_fraud_signals').doc(signal.signalId).set(signal);
  }
  
  // Build network clusters
  const phoneNumberCluster = new Set<string>();
  const deviceFingerprintCluster = new Set<string>();
  const payoutAccountCluster = new Set<string>();
  const ipAddressCluster = new Set<string>();
  
  for (const signal of validSignals) {
    signal.relatedUserIds.forEach(relatedId => {
      if (signal.signalType === 'PHONE_REUSE') phoneNumberCluster.add(relatedId);
      if (signal.signalType === 'DEVICE_REUSE') deviceFingerprintCluster.add(relatedId);
      if (signal.signalType === 'PAYOUT_ACCOUNT_REUSE') payoutAccountCluster.add(relatedId);
      if (signal.signalType === 'REGION_IP_MISMATCH') ipAddressCluster.add(relatedId);
    });
  }
  
  // Pattern detection
  const repeatedCatfishPattern = 
    phoneNumberCluster.size >= 2 &&
    deviceFingerprintCluster.size >= 2;
  
  const coordinatedAccounts = 
    validSignals.some(s => s.signalType === 'INTERACTION_CLUSTER') &&
    (phoneNumberCluster.size > 0 || deviceFingerprintCluster.size > 0);
  
  const massRegistrationPattern =
    deviceFingerprintCluster.size >= 5 ||
    phoneNumberCluster.size >= 5;
  
  // Calculate fraud probability
  const signalCount = validSignals.length;
  const avgRiskScore = validSignals.length > 0
    ? validSignals.reduce((sum, s) => sum + s.riskScore, 0) / signalCount
    : 0;
  
  const patternMultiplier = 
    (repeatedCatfishPattern ? 1.5 : 1.0) *
    (coordinatedAccounts ? 1.3 : 1.0) *
    (massRegistrationPattern ? 1.4 : 1.0);
  
  const fraudProbability = Math.min(1.0, avgRiskScore * patternMultiplier);
  
  // Determine risk level
  const thresholds = IDENTITY_THRESHOLDS.fraud;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  if (fraudProbability >= thresholds.criticalRisk) {
    riskLevel = 'CRITICAL';
  } else if (fraudProbability >= thresholds.highRisk) {
    riskLevel = 'HIGH';
  } else if (fraudProbability >= thresholds.mediumRisk) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'LOW';
  }
  
  // Flags
  const flags: string[] = [];
  if (repeatedCatfishPattern) flags.push('repeated_catfish_pattern');
  if (coordinatedAccounts) flags.push('coordinated_accounts');
  if (massRegistrationPattern) flags.push('mass_registration');
  if (riskLevel === 'CRITICAL') flags.push('critical_fraud_risk');
  
  validSignals.forEach(s => {
    if (s.fraudDetected) flags.push(`fraud_${s.signalType.toLowerCase()}`);
  });
  
  const analysis: SocialGraphFraudAnalysis = {
    analysisId,
    targetUserId: userId,
    phoneNumberCluster: Array.from(phoneNumberCluster),
    deviceFingerprintCluster: Array.from(deviceFingerprintCluster),
    payoutAccountCluster: Array.from(payoutAccountCluster),
    ipAddressCluster: Array.from(ipAddressCluster),
    repeatedCatfishPattern,
    coordinatedAccounts,
    massRegistrationPattern,
    fraudProbability,
    riskLevel,
    flags,
    analyzedAt: Timestamp.now(),
  };
  
  // Save analysis
  await db.collection('social_graph_fraud_analysis').doc(analysisId).set(analysis);
  
  logger.info(`Social graph fraud analysis ${analysisId}: risk=${riskLevel}, probability=${fraudProbability.toFixed(2)}`);
  
  // Create identity check
  await createIdentityCheckFromFraudAnalysis(userId, analysisId, riskLevel, flags, fraudProbability);
  
  // If high risk, create safety case and integrate with PACK 130
  if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
    await createSafetyCaseForIdentityFraud(userId, analysisId, riskLevel, flags);
    await integratewithPack130BanEvasion(userId, analysis);
  }
  
  return analysis;
}

// ============================================================================
// IDENTITY CHECK INTEGRATION
// ============================================================================

/**
 * Create identity check from fraud analysis
 */
async function createIdentityCheckFromFraudAnalysis(
  userId: string,
  analysisId: string,
  riskLevel: string,
  flags: string[],
  confidence: number
): Promise<IdentityCheck> {
  const identityCheckId = `identity_fraud_${userId}_${Date.now()}`;
  
  const status: IdentityCheckStatus = 
    riskLevel === 'CRITICAL' ? 'REJECTED' :
    riskLevel === 'HIGH' ? 'FLAGGED' :
    riskLevel === 'MEDIUM' ? 'MANUAL_REVIEW' :
    'APPROVED';
  
  const identityCheck: IdentityCheck = {
    checkId: identityCheckId,
    userId,
    checkType: 'RECURRENT_AUTHENTICITY',
    status,
    triggerReason: 'social_graph_fraud_detection',
    confidence,
    passed: status === 'APPROVED',
    flags,
    evidence: {
      type: 'RECURRENT_AUTHENTICITY',
      data: {
        fraudAnalysisId: analysisId,
      },
      metadata: {},
    },
    initiatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  };
  
  await db.collection('identity_checks').doc(identityCheckId).set(identityCheck);
  
  return identityCheck;
}

/**
 * Create safety case for identity fraud
 */
async function createSafetyCaseForIdentityFraud(
  userId: string,
  analysisId: string,
  riskLevel: string,
  flags: string[]
): Promise<void> {
  const caseId = `safety_fraud_${userId}_${Date.now()}`;
  
  const priority = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
  
  const safetyCase = {
    caseId,
    userId,
    caseType: 'IDENTITY_FRAUD',
    checkIds: [analysisId],
    evidence: [],
    priority,
    status: 'OPEN',
    actionTaken: {
      accountLocked: riskLevel === 'CRITICAL',
      photosRemoved: [],
      notificationSent: true,
      banEvasionFlagged: true,
    },
    createdAt: Timestamp.now(),
  };
  
  await db.collection('identity_safety_cases').doc(caseId).set(safetyCase);
  
  logger.warn(`Created safety case ${caseId} for identity fraud: user ${userId}, risk=${riskLevel}`);
}

/**
 * Integrate with PACK 130 Ban-Evasion Hunter
 */
async function integratewithPack130BanEvasion(
  userId: string,
  analysis: SocialGraphFraudAnalysis
): Promise<void> {
  // Flag user in PACK 130 risk profile
  try {
    const riskProfileRef = db.collection('patrol_risk_profiles').doc(userId);
    const riskProfile = await riskProfileRef.get();
    
    if (riskProfile.exists) {
      await riskProfileRef.update({
        'active_flags.identity_fraud': true,
        'detected_patterns': [...(riskProfile.data()?.detected_patterns || []), 'CATFISH_PATTERN'],
        lastUpdatedAt: Timestamp.now(),
      });
    } else {
      await riskProfileRef.set({
        userId,
        riskLevel: analysis.riskLevel,
        riskScore: analysis.fraudProbability * 100,
        active_flags: {
          identity_fraud: true,
        },
        detected_patterns: ['CATFISH_PATTERN'],
        createdAt: Timestamp.now(),
        lastUpdatedAt: Timestamp.now(),
      });
    }
    
    logger.info(`Integrated fraud analysis with PACK 130 for user ${userId}`);
  } catch (error) {
    logger.error(`Failed to integrate with PACK 130: ${error}`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeSocialGraphFraud,
};