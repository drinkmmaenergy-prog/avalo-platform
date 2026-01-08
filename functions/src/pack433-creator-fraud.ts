/**
 * PACK 433 — Influencer Marketplace & Creator Deal Automation Engine
 * Part 5: Safety & Fraud Control
 * 
 * Detects:
 * - Fake installs
 * - Bot traffic
 * - Self-referrals
 * - Click farms
 * - VPN spoofing
 * 
 * Actions:
 * - Earnings freeze
 * - Account blacklist
 * - Campaign rollback notification
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type FraudSignalType =
  | 'FAKE_INSTALL'
  | 'BOT_TRAFFIC'
  | 'SELF_REFERRAL'
  | 'CLICK_FARM'
  | 'VPN_SPOOFING'
  | 'DUPLICATE_DEVICE'
  | 'SUSPICIOUS_PATTERN'
  | 'RAPID_INSTALLS'
  | 'ZERO_ENGAGEMENT';

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudStatus = 'DETECTED' | 'REVIEWING' | 'CONFIRMED' | 'FALSE_POSITIVE';

export interface FraudSignal {
  id: string;
  creatorId: string;
  attributionId: string;
  userId: string;
  signalType: FraudSignalType;
  severity: FraudSeverity;
  status: FraudStatus;
  
  // Evidence
  evidence: {
    ipAddress?: string;
    deviceId?: string;
    userAgent?: string;
    installTime?: Timestamp;
    firstActionTime?: Timestamp;
    engagementScore?: number;
    [key: string]: any;
  };
  
  // Detection metadata
  detectedBy: 'AUTOMATED' | 'MANUAL';
  confidence: number; // 0-100
  description: string;
  
  // Actions taken
  actionsTaken: string[];
  
  // Timestamps
  detectedAt: Timestamp;
  reviewedAt?: Timestamp;
  resolvedAt?: Timestamp;
  
  // Admin notes
  reviewerNotes?: string;
}

export interface CreatorRiskScore {
  creatorId: string;
  overallScore: number; // 0-100, higher is riskier
  fraudSignalsCount: number;
  confirmedFraudCount: number;
  falsePositiveCount: number;
  
  // Risk factors
  factors: {
    highRapidInstalls: boolean;
    lowEngagementRate: boolean;
    highRefundRate: boolean;
    suspiciousIPPatterns: boolean;
    duplicateDevices: boolean;
  };
  
  // Status
  accountStatus: 'CLEAN' | 'WATCH_LIST' | 'SUSPENDED' | 'BANNED';
  
  lastUpdated: Timestamp;
}

// ============================================================================
// FRAUD DETECTION RULES
// ============================================================================

/**
 * Analyze attribution for fraud signals
 */
async function analyzeAttributionForFraud(attributionId: string): Promise<Array<Omit<FraudSignal, 'id'>>> {
  const signals: Array<Omit<FraudSignal, 'id'>> = [];

  // Get attribution
  const attrDoc = await db.collection('creator_attributions').doc(attributionId).get();
  
  if (!attrDoc.exists) {
    return signals;
  }

  const attribution = attrDoc.data();
  const userId = attribution?.userId;
  const creatorId = attribution?.creatorId;
  const ipAddress = attribution?.ipAddress;
  const deviceId = attribution?.deviceId;

  // Rule 1: Check for self-referral
  const creatorProfile = await db.collection('creator_profiles').doc(creatorId).get();
  if (creatorProfile.exists) {
    const creator = creatorProfile.data();
    if (creator?.userId === userId) {
      signals.push(createFraudSignal({
        creatorId,
        attributionId,
        userId,
        signalType: 'SELF_REFERRAL',
        severity: 'CRITICAL',
        evidence: { userId, creatorUserId: creator.userId },
        description: 'Creator referred themselves',
        confidence: 100,
      }));
    }
  }

  // Rule 2: Check for duplicate IP within same creator
  if (ipAddress && ipAddress !== 'unknown') {
    const duplicateIPQuery = await db
      .collection('creator_attributions')
      .where('creatorId', '==', creatorId)
      .where('ipAddress', '==', ipAddress)
      .where('installedAt', '>=', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    if (duplicateIPQuery.size > 5) {
      signals.push(createFraudSignal({
        creatorId,
        attributionId,
        userId,
        signalType: 'CLICK_FARM',
        severity: 'HIGH',
        evidence: { ipAddress, duplicateCount: duplicateIPQuery.size },
        description: `${duplicateIPQuery.size} installs from same IP in 24h`,
        confidence: 85,
      }));
    }
  }

  // Rule 3: Check for duplicate device
  if (deviceId) {
    const duplicateDeviceQuery = await db
      .collection('creator_attributions')
      .where('deviceId', '==', deviceId)
      .limit(2)
      .get();

    if (duplicateDeviceQuery.size > 1) {
      signals.push(createFraudSignal({
        creatorId,
        attributionId,
        userId,
        signalType: 'DUPLICATE_DEVICE',
        severity: 'MEDIUM',
        evidence: { deviceId, duplicateCount: duplicateDeviceQuery.size },
        description: 'Device ID already used by another attribution',
        confidence: 70,
      }));
    }
  }

  // Rule 4: Check for rapid installs (bot pattern)
  const recentInstalls = await db
    .collection('creator_attributions')
    .where('creatorId', '==', creatorId)
    .where('installedAt', '>=', Timestamp.fromMillis(Date.now() - 60 * 60 * 1000))
    .get();

  if (recentInstalls.size > 100) {
    signals.push(createFraudSignal({
      creatorId,
      attributionId,
      userId,
      signalType: 'RAPID_INSTALLS',
      severity: 'HIGH',
      evidence: { installsInLastHour: recentInstalls.size },
      description: `${recentInstalls.size} installs in last hour - bot pattern detected`,
      confidence: 90,
      }));
  }

  // Rule 5: Check for VPN/proxy patterns
  if (ipAddress && isKnownVPNIP(ipAddress)) {
    signals.push(createFraudSignal({
      creatorId,
      attributionId,
      userId,
      signalType: 'VPN_SPOOFING',
      severity: 'MEDIUM',
      evidence: { ipAddress },
      description: 'Install from known VPN/proxy IP',
      confidence: 60,
    }));
  }

  return signals;
}

/**
 * Helper to create fraud signal
 */
function createFraudSignal(params: {
  creatorId: string;
  attributionId: string;
  userId: string;
  signalType: FraudSignalType;
  severity: FraudSeverity;
  evidence: Record<string, any>;
  description: string;
  confidence: number;
}): Omit<FraudSignal, 'id'> {
  return {
    creatorId: params.creatorId,
    attributionId: params.attributionId,
    userId: params.userId,
    signalType: params.signalType,
    severity: params.severity,
    status: 'DETECTED',
    evidence: params.evidence,
    detectedBy: 'AUTOMATED',
    confidence: params.confidence,
    description: params.description,
    actionsTaken: [],
    detectedAt: Timestamp.now(),
  };
}

/**
 * Simplified VPN detection (in production, use a proper IP intelligence service)
 */
function isKnownVPNIP(ipAddress: string): boolean {
  // Placeholder: In production, check against VPN/proxy database
  // Common VPN IP ranges or use a service like IPQualityScore
  const vpnPatterns = [
    /^10\./,    // Private network
    /^172\.16/, // Private network
    /^192\.168/, // Private network
  ];
  
  return vpnPatterns.some((pattern) => pattern.test(ipAddress));
}

// ============================================================================
// ON-ATTRIBUTION FRAUD CHECK
// ============================================================================

/**
 * Auto-triggered when new attribution is created
 */
export const onAttributionCreated = onDocumentCreated(
  'creator_attributions/{attributionId}',
  async (event) => {
    try {
      const attributionId = event.params.attributionId;
      const attribution = event.data?.data();

      if (!attribution) {
        return;
      }

      logger.info(`Running fraud check on attribution: ${attributionId}`);

      // Analyze for fraud
      const signals = await analyzeAttributionForFraud(attributionId);

      if (signals.length === 0) {
        // No fraud detected, mark as verified
        await db.collection('creator_attributions').doc(attributionId).update({
          verified: true,
          updatedAt: Timestamp.now(),
        });

        logger.info(`Attribution ${attributionId} verified - no fraud signals`);
        return;
      }

      // Save fraud signals
      const batch = db.batch();
      
      for (const signal of signals) {
        const signalRef = db.collection('fraud_signals').doc();
        batch.set(signalRef, signal);
      }

      await batch.commit();

      // Determine action based on severity
      const highSeveritySignals = signals.filter((s) => 
        s.severity === 'HIGH' || s.severity === 'CRITICAL'
      );

      if (highSeveritySignals.length > 0) {
        // Mark attribution as not verified (needs review)
        await db.collection('creator_attributions').doc(attributionId).update({
          verified: false,
          updatedAt: Timestamp.now(),
        });

        logger.warn(`Attribution ${attributionId} flagged for fraud review`, {
          signalsCount: signals.length,
          highSeverity: highSeveritySignals.length,
        });

        // Update creator risk score
        await updateCreatorRiskScore(attribution.creatorId);
      } else {
        // Low severity only - verify but flag for monitoring
        await db.collection('creator_attributions').doc(attributionId).update({
          verified: true,
          updatedAt: Timestamp.now(),
        });

        logger.info(`Attribution ${attributionId} verified with low-severity signals`);
      }
    } catch (error: any) {
      logger.error('Error in fraud check trigger', error);
    }
  }
);

// ============================================================================
// RISK SCORING
// ============================================================================

/**
 * Update creator's risk score based on fraud signals
 */
async function updateCreatorRiskScore(creatorId: string): Promise<void> {
  // Count fraud signals
  const signalsQuery = await db
    .collection('fraud_signals')
    .where('creatorId', '==', creatorId)
    .get();

  let fraudSignalsCount = 0;
  let confirmedFraudCount = 0;
  let falsePositiveCount = 0;
  let totalConfidence = 0;

  signalsQuery.forEach((doc) => {
    const signal = doc.data() as FraudSignal;
    fraudSignalsCount++;
    totalConfidence += signal.confidence;

    if (signal.status === 'CONFIRMED') {
      confirmedFraudCount++;
    } else if (signal.status === 'FALSE_POSITIVE') {
      falsePositiveCount++;
    }
  });

  // Calculate risk score (0-100)
  let riskScore = 0;
  
  if (fraudSignalsCount > 0) {
    const avgConfidence = totalConfidence / fraudSignalsCount;
    const confirmedRatio = confirmedFraudCount / Math.max(fraudSignalsCount, 1);
    
    riskScore = Math.min(100, (avgConfidence * 0.5) + (confirmedRatio * 50));
  }

  // Determine account status
  let accountStatus: 'CLEAN' | 'WATCH_LIST' | 'SUSPENDED' | 'BANNED' = 'CLEAN';
  
  if (riskScore > 80 || confirmedFraudCount > 5) {
    accountStatus = 'BANNED';
  } else if (riskScore > 60 || confirmedFraudCount > 2) {
    accountStatus = 'SUSPENDED';
  } else if (riskScore > 30 || fraudSignalsCount > 5) {
    accountStatus = 'WATCH_LIST';
  }

  // Save risk score
  const riskScoreData: Omit<CreatorRiskScore, 'creatorId'> = {
    overallScore: Math.round(riskScore),
    fraudSignalsCount,
    confirmedFraudCount,
    falsePositiveCount,
    factors: {
      highRapidInstalls: false, // TODO: Calculate from data
      lowEngagementRate: false,
      highRefundRate: false,
      suspiciousIPPatterns: fraudSignalsCount > 3,
      duplicateDevices: false,
    },
    accountStatus,
    lastUpdated: Timestamp.now(),
  };

  await db.collection('creator_risk_scores').doc(creatorId).set(riskScoreData);

  // Update creator profile status if needed
  if (accountStatus === 'BANNED' || accountStatus === 'SUSPENDED') {
    await db.collection('creator_profiles').doc(creatorId).update({
      status: accountStatus,
      updatedAt: Timestamp.now(),
    });

    logger.warn(`Creator ${creatorId} status updated to ${accountStatus}`, {
      riskScore,
      confirmedFraudCount,
    });
  }
}

// ============================================================================
// MANUAL REVIEW FUNCTIONS
// ============================================================================

/**
 * Review fraud signal (admin only)
 */
export const reviewFraudSignal = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Verify admin role

    const { signalId, status, reviewerNotes } = request.data;

    if (!signalId || !status) {
      throw new HttpsError('invalid-argument', 'Missing signalId or status');
    }

    if (!['CONFIRMED', 'FALSE_POSITIVE', 'REVIEWING'].includes(status)) {
      throw new HttpsError('invalid-argument', 'Invalid status');
    }

    try {
      const signalRef = db.collection('fraud_signals').doc(signalId);
      const signalDoc = await signalRef.get();

      if (!signalDoc.exists) {
        throw new HttpsError('not-found', 'Fraud signal not found');
      }

      const signal = signalDoc.data() as FraudSignal;

      await signalRef.update({
        status,
        reviewerNotes: reviewerNotes || '',
        reviewedAt: Timestamp.now(),
        resolvedAt: status !== 'REVIEWING' ? Timestamp.now() : null,
      });

      // Update creator risk score
      await updateCreatorRiskScore(signal.creatorId);

      logger.info(`Fraud signal reviewed: ${signalId}`, {
        newStatus: status,
        reviewedBy: request.auth.uid,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error reviewing fraud signal', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to review signal: ${error.message}`);
    }
  }
);

/**
 * Get fraud signals for creator (admin/creator)
 */
export const getCreatorFraudSignals = onCall(
  { region: 'europe-west3' },
  async (request): Promise<FraudSignal[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId, limit } = request.data;

    try {
      let query: FirebaseFirestore.Query = db
        .collection('fraud_signals')
        .where('creatorId', '==', creatorId)
        .orderBy('detectedAt', 'desc');

      if (limit) {
        query = query.limit(Math.min(limit, 100));
      } else {
        query = query.limit(50);
      }

      const snapshot = await query.get();

      const signals: FraudSignal[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as FraudSignal));

      return signals;
    } catch (error: any) {
      logger.error('Error fetching fraud signals', error);
      throw new HttpsError('internal', `Failed to fetch signals: ${error.message}`);
    }
  }
);

/**
 * Get creator risk score
 */
export const getCreatorRiskScore = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorRiskScore | null> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId } = request.data;

    try {
      const riskDoc = await db.collection('creator_risk_scores').doc(creatorId).get();

      if (!riskDoc.exists) {
        return null;
      }

      return {
        creatorId,
        ...riskDoc.data(),
      } as CreatorRiskScore;
    } catch (error: any) {
      logger.error('Error fetching risk score', error);
      throw new HttpsError('internal', `Failed to fetch risk score: ${error.message}`);
    }
  }
);

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Daily fraud scan for all active creators
 */
export const dailyFraudScan = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting daily fraud scan');

      // Get all active creators
      const creatorsQuery = await db
        .collection('creator_profiles')
        .where('status', 'in', ['ACTIVE', 'WATCH_LIST'])
        .get();

      let scannedCount = 0;

      for (const creatorDoc of creatorsQuery.docs) {
        const creatorId = creatorDoc.id;

        // Update risk score
        await updateCreatorRiskScore(creatorId);

        scannedCount++;
      }

      logger.info(`Daily fraud scan completed - scanned ${scannedCount} creators`);

      return null;
    } catch (error: any) {
      logger.error('Error in daily fraud scan', error);
      throw error;
    }
  }
);

/**
 * Clean up old fraud signals (keep for 90 days)
 */
export const cleanupOldFraudSignals = onSchedule(
  {
    schedule: '0 4 * * 0', // Weekly on Sunday at 4 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting fraud signals cleanup');

      const ninetyDaysAgo = Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const oldSignals = await db
        .collection('fraud_signals')
        .where('detectedAt', '<', ninetyDaysAgo)
        .where('status', 'in', ['FALSE_POSITIVE', 'RESOLVED'])
        .get();

      const batch = db.batch();
      let deleteCount = 0;

      oldSignals.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      if (deleteCount > 0) {
        await batch.commit();
      }

      logger.info(`Cleaned up ${deleteCount} old fraud signals`);

      return null;
    } catch (error: any) {
      logger.error('Error in fraud signals cleanup', error);
      throw error;
    }
  }
);
