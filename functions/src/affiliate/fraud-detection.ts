/**
 * PACK 131: Fraud Detection Engine
 * Detects and prevents fraudulent referral patterns
 */

import { FieldValue, QuerySnapshot } from 'firebase-admin/firestore';
import { db } from '../init';
import { FRAUD_DETECTION_CONFIG, FraudFlag, AffiliateReferral } from './types';

export interface FraudDetectionResult {
  fraudScore: number;
  fraudFlags: FraudFlag[];
  fraudStatus: 'clean' | 'suspicious' | 'confirmed_fraud';
  shouldBlock: boolean;
}

export async function detectFraud(
  affiliateCode: string,
  userId: string,
  signupIP?: string,
  signupDeviceId?: string,
  signupUserAgent?: string
): Promise<FraudDetectionResult> {
  const flags: FraudFlag[] = [];
  let fraudScore = 0;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Check 1: Duplicate IP within 24 hours
  if (signupIP) {
    const ipQuery = await db
      .collection('affiliate_referrals')
      .where('signupIP', '==', signupIP)
      .where('createdAt', '>', oneDayAgo)
      .limit(FRAUD_DETECTION_CONFIG.maxSignupsPerIPPerDay + 1)
      .get();

    if (ipQuery.size >= FRAUD_DETECTION_CONFIG.maxSignupsPerIPPerDay) {
      flags.push({
        type: 'duplicate_ip',
        severity: 'high',
        details: `${ipQuery.size} signups from same IP in 24h`,
        detectedAt: now,
      });
      fraudScore += 30;
    }
  }

  // Check 2: Duplicate device within 24 hours
  if (signupDeviceId) {
    const deviceQuery = await db
      .collection('affiliate_referrals')
      .where('signupDeviceId', '==', signupDeviceId)
      .where('createdAt', '>', oneDayAgo)
      .limit(FRAUD_DETECTION_CONFIG.maxSignupsPerDevicePerDay + 1)
      .get();

    if (deviceQuery.size >= FRAUD_DETECTION_CONFIG.maxSignupsPerDevicePerDay) {
      flags.push({
        type: 'duplicate_device',
        severity: 'high',
        details: `${deviceQuery.size} signups from same device in 24h`,
        detectedAt: now,
      });
      fraudScore += 35;
    }
  }

  // Check 3: Velocity check - Too many signups per hour for this affiliate
  const velocityQuery = await db
    .collection('affiliate_referrals')
    .where('affiliateCode', '==', affiliateCode)
    .where('createdAt', '>', oneHourAgo)
    .get();

  if (velocityQuery.size >= FRAUD_DETECTION_CONFIG.maxSignupsPerAffiliatePerHour) {
    flags.push({
      type: 'velocity_anomaly',
      severity: 'medium',
      details: `${velocityQuery.size} signups in last hour`,
      detectedAt: now,
    });
    fraudScore += 20;
  }

  // Check 4: VPN Detection (basic heuristics)
  if (FRAUD_DETECTION_CONFIG.vpnDetectionEnabled && signupIP) {
    const isVPN = await detectVPN(signupIP);
    if (isVPN) {
      flags.push({
        type: 'vpn_detected',
        severity: 'medium',
        details: 'VPN or proxy detected',
        detectedAt: now,
      });
      fraudScore += 15;
    }
  }

  // Check 5: Emulator Detection (based on user agent patterns)
  if (FRAUD_DETECTION_CONFIG.emulatorDetectionEnabled && signupUserAgent) {
    const isEmulator = detectEmulator(signupUserAgent);
    if (isEmulator) {
      flags.push({
        type: 'emulator_detected',
        severity: 'high',
        details: 'Emulator signature detected',
        detectedAt: now,
      });
      fraudScore += 25;
    }
  }

  // Check 6: Pattern matching - Same user creating multiple accounts
  const userPattern = await detectUserPattern(userId, signupIP, signupDeviceId);
  if (userPattern.isSuspicious) {
    flags.push({
      type: 'pattern_match',
      severity: userPattern.severity,
      details: userPattern.details,
      detectedAt: now,
    });
    fraudScore += userPattern.score;
  }

  // Determine fraud status
  let fraudStatus: 'clean' | 'suspicious' | 'confirmed_fraud' = 'clean';
  let shouldBlock = false;

  if (fraudScore >= FRAUD_DETECTION_CONFIG.fraudScoreThreshold) {
    fraudStatus = 'confirmed_fraud';
    shouldBlock = true;
  } else if (fraudScore >= FRAUD_DETECTION_CONFIG.suspiciousScoreThreshold) {
    fraudStatus = 'suspicious';
  }

  return {
    fraudScore,
    fraudFlags: flags,
    fraudStatus,
    shouldBlock,
  };
}

async function detectVPN(ip: string): Promise<boolean> {
  // Basic VPN detection heuristics
  // In production, integrate with VPN detection API (e.g., IPQualityScore, IPHub)
  
  // Common VPN IP ranges (simplified)
  const vpnPatterns = [
    /^10\./,           // Private network
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private network
    /^192\.168\./,     // Private network
  ];

  for (const pattern of vpnPatterns) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  // Check against known VPN provider IPs (would need database)
  // For now, return false for public IPs
  return false;
}

function detectEmulator(userAgent: string): boolean {
  const emulatorPatterns = [
    /Android.*Build\/.*SDK/i,
    /Android.*Emulator/i,
    /Android.*Generic/i,
    /Android.*test-keys/i,
    /genymotion/i,
    /BlueStacks/i,
    /NoxPlayer/i,
  ];

  return emulatorPatterns.some(pattern => pattern.test(userAgent));
}

async function detectUserPattern(
  userId: string,
  signupIP?: string,
  signupDeviceId?: string
): Promise<{
  isSuspicious: boolean;
  severity: 'low' | 'medium' | 'high';
  details: string;
  score: number;
}> {
  const queries: Promise<QuerySnapshot>[] = [];

  // Check if this user has been referred multiple times
  queries.push(
    db.collection('affiliate_referrals')
      .where('userId', '==', userId)
      .limit(5)
      .get()
  );

  // Check for similar fingerprints
  if (signupIP && signupDeviceId) {
    queries.push(
      db.collection('affiliate_referrals')
        .where('signupIP', '==', signupIP)
        .where('signupDeviceId', '==', signupDeviceId)
        .limit(5)
        .get()
    );
  }

  const results = await Promise.all(queries);
  const [existingReferrals, fingerprintMatches] = results;

  // User already referred
  if (existingReferrals.size > 1) {
    return {
      isSuspicious: true,
      severity: 'high',
      details: `User referred ${existingReferrals.size} times`,
      score: 40,
    };
  }

  // Multiple accounts from same fingerprint
  if (fingerprintMatches && fingerprintMatches.size > 2) {
    return {
      isSuspicious: true,
      severity: 'high',
      details: `${fingerprintMatches.size} accounts from same fingerprint`,
      score: 35,
    };
  }

  return {
    isSuspicious: false,
    severity: 'low',
    details: 'No pattern detected',
    score: 0,
  };
}

export async function updateReferralRetention(
  referralId: string,
  day: 1 | 7 | 30
): Promise<void> {
  const updateData: Partial<AffiliateReferral> = {
    updatedAt: new Date(),
  };

  if (day === 1) updateData.retentionDay1 = true;
  if (day === 7) updateData.retentionDay7 = true;
  if (day === 30) updateData.retentionDay30 = true;

  await db.collection('affiliate_referrals').doc(referralId).update(updateData);
}

export async function checkPayoutEligibility(referralId: string): Promise<boolean> {
  const referralDoc = await db.collection('affiliate_referrals').doc(referralId).get();
  if (!referralDoc.exists) return false;

  const referral = referralDoc.data() as AffiliateReferral;

  // Must be verified
  if (!referral.verificationCompleted) return false;

  // Must not be fraudulent
  if (referral.fraudStatus === 'confirmed_fraud') return false;

  // Must not already be paid
  if (referral.payoutProcessed) return false;

  // Must meet retention requirements (e.g., Day 1 retention)
  if (!referral.retentionDay1) return false;

  return true;
}

export async function blockFraudulentAffiliate(
  affiliateId: string,
  reason: string
): Promise<void> {
  const batch = db.batch();

  // Suspend affiliate
  const affiliateRef = db.collection('affiliate_profiles').doc(affiliateId);
  batch.update(affiliateRef, {
    status: 'suspended',
    suspendedAt: new Date(),
    'violations.count': FieldValue.increment(1),
    'violations.history': FieldValue.arrayUnion({
      violationId: `fraud_${Date.now()}`,
      type: 'fraud',
      description: reason,
      severity: 3,
      actionTaken: 'suspension',
      detectedAt: new Date(),
    }),
  });

  // Mark all suspicious referrals as ineligible
  const referralsQuery = await db
    .collection('affiliate_referrals')
    .where('affiliateId', '==', affiliateId)
    .where('fraudStatus', 'in', ['suspicious', 'confirmed_fraud'])
    .get();

  referralsQuery.docs.forEach(doc => {
    batch.update(doc.ref, {
      payoutEligible: false,
      fraudStatus: 'confirmed_fraud',
    });
  });

  await batch.commit();
}

export async function reviewSuspiciousReferrals(
  affiliateId: string
): Promise<AffiliateReferral[]> {
  const snapshot = await db
    .collection('affiliate_referrals')
    .where('affiliateId', '==', affiliateId)
    .where('fraudStatus', '==', 'suspicious')
    .orderBy('fraudScore', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => doc.data() as AffiliateReferral);
}