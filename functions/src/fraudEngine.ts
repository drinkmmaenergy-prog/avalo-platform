/**
 * PACK 71 — Fraud Analytics & Payment Anomaly Prediction
 * 
 * Core fraud detection engine that:
 * - Ingests signals from AML, Rate Limit, Payouts, Reservations, Referrals, Support, Observability
 * - Calculates probabilistic risk scores
 * - Flags payment anomalies
 * - Triggers enforcement actions (via PACK 54/65)
 * 
 * CRITICAL: This module ONLY scores & flags risk.
 * Enforcement decisions remain in PACK 54/65 (Enforcement).
 * NO changes to token pricing or 65/35 split.
 */

import { db, serverTimestamp, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  FraudProfile,
  FraudSignals,
  FraudAnalysisInput,
  FraudAnalysisResult,
  RiskLevel
} from './types/fraudTypes';
import { writeAuditLog } from './auditLogger';
import { logEvent } from './observability';

// ============================================================================
// CONFIGURATION & WEIGHTS
// ============================================================================

interface FraudWeights {
  amlSignals: number;          // 30%
  multiAccount: number;         // 20%
  disputeNoShow: number;        // 20%
  payoutAnomalies: number;      // 20%
  velocityAnomaly: number;      // 10%
}

const DEFAULT_WEIGHTS: FraudWeights = {
  amlSignals: 30,
  multiAccount: 20,
  disputeNoShow: 20,
  payoutAnomalies: 20,
  velocityAnomaly: 10
};

interface FraudThresholds {
  riskLevels: {
    low: number;      // 0-30
    medium: number;   // 31-60
    high: number;     // 61-80
    critical: number; // 81-100
  };
  payoutHold: {
    high: boolean;     // Hold payouts at HIGH
    critical: boolean; // Hold payouts at CRITICAL
  };
  aml: {
    highRiskScore: number;
    criticalRiskScore: number;
  };
  multiAccount: {
    suspectedThreshold: number;
    confirmedThreshold: number;
  };
  disputes: {
    highRateThreshold: number;
  };
  noShows: {
    highRateThreshold: number;
  };
  payouts: {
    highFailureRate: number;
    largePayoutCount: number;
  };
  velocity: {
    warningThreshold: number;
  };
}

const DEFAULT_THRESHOLDS: FraudThresholds = {
  riskLevels: {
    low: 30,
    medium: 60,
    high: 80,
    critical: 100
  },
  payoutHold: {
    high: true,
    critical: true
  },
  aml: {
    highRiskScore: 60,
    criticalRiskScore: 80
  },
  multiAccount: {
    suspectedThreshold: 2,
    confirmedThreshold: 5
  },
  disputes: {
    highRateThreshold: 0.3 // 30% dispute rate
  },
  noShows: {
    highRateThreshold: 0.25 // 25% no-show rate
  },
  payouts: {
    highFailureRate: 0.3, // 30% failure rate
    largePayoutCount: 3   // 3+ large payouts in 30d
  },
  velocity: {
    warningThreshold: 3 // 3+ warnings in 7d
  }
};

// ============================================================================
// FRAUD ANALYSIS ENGINE
// ============================================================================

/**
 * Analyze fraud risk for a user based on signals from multiple systems
 */
export async function analyzeFraudRisk(input: FraudAnalysisInput): Promise<FraudAnalysisResult> {
  const weights = DEFAULT_WEIGHTS;
  const thresholds = DEFAULT_THRESHOLDS;
  
  let riskScore = 0;
  const flags: string[] = [];
  const signals: FraudSignals = {
    amlMatches: 0,
    multiAccountFlags: 0,
    disputeRate: 0,
    noShowRate: 0,
    referralAbuseFlags: 0,
    aiSpamFlags: 0,
    payoutFailureCount: 0,
    velocityWarnings7d: 0
  };

  // ============================================================================
  // FACTOR 1: AML SIGNALS (30%)
  // ============================================================================
  
  let amlScore = 0;
  
  if (input.amlRiskScore !== undefined) {
    signals.amlMatches = input.amlRiskFlags?.length || 0;
    
    // High AML risk
    if (input.amlRiskScore >= thresholds.aml.criticalRiskScore) {
      amlScore = 30;
      flags.push('CRITICAL_AML_RISK');
    } else if (input.amlRiskScore >= thresholds.aml.highRiskScore) {
      amlScore = 20;
      flags.push('HIGH_AML_RISK');
    } else if (input.amlRiskScore > 30) {
      amlScore = 10;
      flags.push('ELEVATED_AML_RISK');
    }
    
    // KYC issues
    if (input.kycRequired && !input.kycVerified) {
      amlScore += 10;
      flags.push('KYC_VERIFICATION_REQUIRED');
    }
  }
  
  riskScore += Math.min(amlScore, weights.amlSignals);

  // ============================================================================
  // FACTOR 2: MULTI-ACCOUNT / DEVICE TOPOLOGY (20%)
  // ============================================================================
  
  let multiAccountScore = 0;
  
  if (input.deviceTopology) {
    const { suspectedMultiAccount, sharedDeviceCount } = input.deviceTopology;
    signals.multiAccountFlags = sharedDeviceCount;
    
    if (sharedDeviceCount >= thresholds.multiAccount.confirmedThreshold) {
      multiAccountScore = 20;
      flags.push('MULTI_ACCOUNT_CONFIRMED');
    } else if (suspectedMultiAccount || sharedDeviceCount >= thresholds.multiAccount.suspectedThreshold) {
      multiAccountScore = 10;
      flags.push('MULTI_ACCOUNT_SUSPECTED');
    }
  }
  
  riskScore += Math.min(multiAccountScore, weights.multiAccount);

  // ============================================================================
  // FACTOR 3: DISPUTE & NO-SHOW RATES (20%)
  // ============================================================================
  
  let disputeNoShowScore = 0;
  
  // Dispute rate
  if (input.disputeStats) {
    const { totalDisputes30d, completedReservations30d } = input.disputeStats;
    
    if (completedReservations30d > 0) {
      const disputeRate = totalDisputes30d / completedReservations30d;
      signals.disputeRate = Math.round(disputeRate * 100) / 100;
      
      if (disputeRate >= thresholds.disputes.highRateThreshold) {
        disputeNoShowScore += 10;
        flags.push('HIGH_DISPUTE_RATE');
      }
    }
  }
  
  // No-show rate
  if (input.reservationStats) {
    const { noShowFlags30d, completedReservations30d } = input.reservationStats;
    signals.noShowRate = completedReservations30d > 0 
      ? Math.round((noShowFlags30d / completedReservations30d) * 100) / 100
      : 0;
    
    if (noShowFlags30d > 0 && completedReservations30d > 0) {
      const noShowRate = noShowFlags30d / completedReservations30d;
      
      if (noShowRate >= thresholds.noShows.highRateThreshold) {
        disputeNoShowScore += 10;
        flags.push('HIGH_NO_SHOW_RATE');
      }
    }
  }
  
  riskScore += Math.min(disputeNoShowScore, weights.disputeNoShow);

  // ============================================================================
  // FACTOR 4: PAYOUT ANOMALIES (20%)
  // ============================================================================
  
  let payoutScore = 0;
  
  if (input.payoutStats) {
    const { totalPayouts30d, failedPayouts30d, largePayoutsCount30d } = input.payoutStats;
    signals.payoutFailureCount = failedPayouts30d;
    
    // High failure rate
    if (totalPayouts30d > 0) {
      const failureRate = failedPayouts30d / totalPayouts30d;
      
      if (failureRate >= thresholds.payouts.highFailureRate) {
        payoutScore += 10;
        flags.push('HIGH_PAYOUT_FAILURE_RATE');
      }
    }
    
    // Frequent large payouts (structuring indicator)
    if (largePayoutsCount30d >= thresholds.payouts.largePayoutCount) {
      payoutScore += 10;
      flags.push('FREQUENT_LARGE_PAYOUTS');
    }
  }
  
  riskScore += Math.min(payoutScore, weights.payoutAnomalies);

  // ============================================================================
  // FACTOR 5: VELOCITY ANOMALY (10%)
  // ============================================================================
  
  let velocityScore = 0;
  
  if (input.rateLimitViolations) {
    const { violations7d, escalations7d } = input.rateLimitViolations;
    signals.velocityWarnings7d = violations7d;
    
    if (violations7d >= thresholds.velocity.warningThreshold) {
      velocityScore = 10;
      flags.push('HIGH_VELOCITY_WARNINGS');
    }
    
    if (escalations7d > 0) {
      flags.push('RATE_LIMIT_ESCALATIONS');
    }
  }
  
  riskScore += Math.min(velocityScore, weights.velocityAnomaly);

  // ============================================================================
  // ADDITIONAL SIGNALS (NOT SCORED BUT TRACKED)
  // ============================================================================
  
  if (input.referralStats) {
    signals.referralAbuseFlags = (input.referralStats.suspiciousReferrals || 0) + 
                                  (input.referralStats.fakeAttributionFlags || 0);
    
    if (signals.referralAbuseFlags > 0) {
      flags.push('REFERRAL_ABUSE_DETECTED');
    }
  }
  
  if (input.aiModerationFlags) {
    signals.aiSpamFlags = input.aiModerationFlags.spamFlags30d;
    
    if (signals.aiSpamFlags >= 3) {
      flags.push('AI_SPAM_PATTERN');
    }
  }

  // ============================================================================
  // DETERMINE RISK LEVEL & PAYOUT HOLD
  // ============================================================================
  
  // Cap risk score at 100
  riskScore = Math.min(100, Math.round(riskScore));
  
  let riskLevel: RiskLevel;
  if (riskScore <= thresholds.riskLevels.low) {
    riskLevel = 'LOW';
  } else if (riskScore <= thresholds.riskLevels.medium) {
    riskLevel = 'MEDIUM';
  } else if (riskScore <= thresholds.riskLevels.high) {
    riskLevel = 'HIGH';
  } else {
    riskLevel = 'CRITICAL';
  }
  
  // Determine if payout should be held
  const payoutHold = (riskLevel === 'HIGH' && thresholds.payoutHold.high) ||
                     (riskLevel === 'CRITICAL' && thresholds.payoutHold.critical);
  
  // Calculate payment anomaly score (focused on financial patterns)
  const paymentAnomalyScore = Math.min(100, Math.round(
    (amlScore * 0.4) + 
    (payoutScore * 0.4) + 
    (multiAccountScore * 0.2)
  ));
  
  // Determine recommendation
  let recommendation: FraudAnalysisResult['recommendation'];
  if (riskLevel === 'CRITICAL') {
    recommendation = 'ESCALATE';
  } else if (riskLevel === 'HIGH') {
    recommendation = 'BLOCK_PAYOUT';
  } else if (riskLevel === 'MEDIUM') {
    recommendation = 'REVIEW_PAYOUT';
  } else if (flags.length > 0) {
    recommendation = 'MONITOR';
  } else {
    recommendation = 'NORMAL';
  }

  return {
    riskScore,
    riskLevel,
    paymentAnomalyScore,
    payoutHold,
    signals,
    flags,
    recommendation
  };
}

// ============================================================================
// FRAUD PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create fraud profile for a user
 */
export async function getFraudProfile(userId: string): Promise<FraudProfile | null> {
  const doc = await db.collection('fraud_profiles').doc(userId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as FraudProfile;
}

/**
 * Update fraud profile with new analysis results
 */
export async function updateFraudProfile(
  userId: string,
  analysis: FraudAnalysisResult
): Promise<FraudProfile> {
  const now = admin.firestore.Timestamp.now();
  const existingDoc = await db.collection('fraud_profiles').doc(userId).get();
  
  const profileData: FraudProfile = {
    userId,
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    paymentAnomalyScore: analysis.paymentAnomalyScore,
    payoutHold: analysis.payoutHold,
    signals: analysis.signals,
    lastUpdatedAt: now,
    createdAt: existingDoc.exists ? (existingDoc.data() as FraudProfile).createdAt : now
  };
  
  await db.collection('fraud_profiles').doc(userId).set(profileData);
  
  // Log to observability if risk level is HIGH or CRITICAL
  if (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'CRITICAL') {
    await logEvent({
      level: analysis.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'WARN',
      source: 'BACKEND',
      service: 'functions.fraudEngine',
      module: 'FRAUD_DETECTION',
      message: `Fraud risk detected: ${analysis.riskLevel}`,
      environment: 'PROD',
      context: {
        userId
      },
      details: {
        extra: {
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          payoutHold: analysis.payoutHold,
          flags: analysis.flags,
          recommendation: analysis.recommendation
        }
      }
    });
  }
  
  return profileData;
}

/**
 * Collect signals from various systems and analyze fraud risk
 */
export async function collectAndAnalyzeFraudSignals(userId: string): Promise<FraudProfile> {
  // Fetch AML profile
  const amlDoc = await db.collection('aml_profiles').doc(userId).get();
  const amlData = amlDoc.exists ? amlDoc.data() : null;
  
  // Fetch device trust data
  const deviceDoc = await db.collection('device_trust_profiles').doc(userId).get();
  const deviceData = deviceDoc.exists ? deviceDoc.data() : null;
  
  // Fetch payout stats
  const payoutSnapshot = await db.collection('payout_requests')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ))
    .get();
  
  const payoutRequests = payoutSnapshot.docs.map(doc => doc.data());
  const totalPayouts30d = payoutRequests.length;
  const failedPayouts30d = payoutRequests.filter(p => p.status === 'FAILED').length;
  const largePayoutsCount30d = payoutRequests.filter(p => p.tokensRequested >= 10000).length;
  
  // Fetch dispute stats
  const disputeSnapshot = await db.collection('disputes')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ))
    .get();
  
  const totalDisputes30d = disputeSnapshot.size;
  
  // Fetch reservation stats
  const reservationSnapshot = await db.collection('reservations')
    .where('bookerId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ))
    .get();
  
  const reservations = reservationSnapshot.docs.map(doc => doc.data());
  const completedReservations30d = reservations.filter(r => r.status === 'COMPLETED').length;
  const noShowFlags30d = reservations.filter(r => r.verification?.noShow === true).length;
  
  // Fetch rate limit violations
  const rateLimitSnapshot = await db.collection('rate_limits')
    .where('userId', '==', userId)
    .where('lastUpdatedAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ))
    .get();
  
  const violations7d = rateLimitSnapshot.size;
  
  // Fetch referral abuse flags
  const referralDoc = await db.collection('referral_profiles').doc(userId).get();
  const referralData = referralDoc.exists ? referralDoc.data() : null;
  
  // Fetch AI moderation flags
  const aiModerationSnapshot = await db.collection('ai_moderation_flags')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ))
    .where('flagType', '==', 'SPAM')
    .get();
  
  const spamFlags30d = aiModerationSnapshot.size;
  
  // Build analysis input
  const input: FraudAnalysisInput = {
    userId,
    amlRiskScore: amlData?.riskScore,
    amlRiskFlags: amlData?.riskFlags,
    kycRequired: amlData?.kycRequired,
    kycVerified: amlData?.kycVerified,
    deviceTopology: deviceData ? {
      suspectedMultiAccount: deviceData.multiAccountRisk === 'SUSPECTED' || deviceData.multiAccountRisk === 'CONFIRMED',
      sharedDeviceCount: deviceData.linkedAccounts?.length || 0
    } : undefined,
    payoutStats: {
      totalPayouts30d,
      failedPayouts30d,
      averagePayoutAmount: totalPayouts30d > 0
        ? payoutRequests.reduce((sum, p) => sum + p.tokensRequested, 0) / totalPayouts30d
        : 0,
      largePayoutsCount30d
    },
    disputeStats: {
      totalDisputes30d,
      completedReservations30d
    },
    reservationStats: {
      noShowFlags30d,
      completedReservations30d
    },
    referralStats: {
      suspiciousReferrals: referralData?.suspiciousReferralCount || 0,
      fakeAttributionFlags: referralData?.fakeAttributionFlags || 0
    },
    aiModerationFlags: {
      spamFlags30d
    },
    rateLimitViolations: {
      violations7d,
      escalations7d: 0 // Would need to track escalations separately
    }
  };
  
  // Analyze fraud risk
  const analysis = await analyzeFraudRisk(input);
  
  // Update fraud profile
  const profile = await updateFraudProfile(userId, analysis);
  
  return profile;
}

/**
 * Check if user has payout hold
 */
export async function checkPayoutHold(userId: string): Promise<{
  hasHold: boolean;
  reason?: string;
  riskLevel?: RiskLevel;
}> {
  const profile = await getFraudProfile(userId);
  
  if (!profile) {
    return { hasHold: false };
  }
  
  if (profile.payoutHold) {
    return {
      hasHold: true,
      reason: 'Your payout is under review for security reasons.',
      riskLevel: profile.riskLevel
    };
  }
  
  return { hasHold: false };
}