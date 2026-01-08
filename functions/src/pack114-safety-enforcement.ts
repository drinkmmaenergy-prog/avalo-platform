/**
 * PACK 114 — Safety & Enforcement for Agency System
 * Protects creators from exploitation and abuse
 * 
 * ENFORCEMENT RULES:
 * - Detect forced linkage attempts
 * - Monitor suspicious payout patterns
 * - Prevent minor exploitation
 * - Block excessive percentage claims
 * - Track privacy violations
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  AgencyViolation,
  AgencyViolationType,
  CreatorAgencyAccount,
  CreatorAgencyLink,
  DEFAULT_AGENCY_RULES,
} from './pack114-types';
import { updateAgencyStatus } from './pack114-agency-engine';
// Note: Integration with moderation system - implement if moderationEngine has this function
// import { createModerationCase } from './moderationEngine';

// ============================================================================
// VIOLATION DETECTION
// ============================================================================

/**
 * Detect forced linkage patterns
 * Red flags:
 * - Multiple requests to same creator
 * - High rejection rate
 * - Requests to creators who blocked sender
 */
export async function detectForcedLinkage(agencyId: string): Promise<AgencyViolation | null> {
  const last24Hours = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

  // Get all requests from this agency
  const requestsSnapshot = await db
    .collection('agency_link_requests')
    .where('agencyId', '==', agencyId)
    .where('createdAt', '>=', last24Hours)
    .get();

  if (requestsSnapshot.empty) {
    return null;
  }

  const totalRequests = requestsSnapshot.size;
  const rejectedRequests = requestsSnapshot.docs.filter(
    (doc) => doc.data().status === 'REJECTED'
  ).length;

  const rejectionRate = rejectedRequests / totalRequests;

  // Red flag: >80% rejection rate with >10 requests
  if (rejectionRate > 0.8 && totalRequests > 10) {
    const affectedCreatorIds = Array.from(
      new Set(requestsSnapshot.docs.map((doc) => doc.data().creatorUserId))
    );

    const violation: AgencyViolation = {
      violationId: generateId(),
      agencyId,
      type: 'FORCED_LINKAGE',
      severity: 'HIGH',
      affectedCreatorIds,
      evidenceRefs: requestsSnapshot.docs.map((doc) => doc.id),
      description: `High rejection rate detected: ${(rejectionRate * 100).toFixed(1)}% of ${totalRequests} requests rejected in 24h`,
      status: 'DETECTED',
      agencySuspended: false,
      creatorProtectionApplied: false,
      criminalReferral: false,
      detectedAt: Timestamp.now(),
    };

    await db.collection('agency_violations').add(violation);

    logger.warn('Forced linkage detected', { agencyId, rejectionRate, totalRequests });

    return violation;
  }

  return null;
}

/**
 * Detect unsolicited mass requests
 * Red flag: >50 requests in 24h
 */
export async function detectUnsolicitedRequests(agencyId: string): Promise<AgencyViolation | null> {
  const last24Hours = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

  const requestsSnapshot = await db
    .collection('agency_link_requests')
    .where('agencyId', '==', agencyId)
    .where('createdAt', '>=', last24Hours)
    .get();

  const totalRequests = requestsSnapshot.size;

  if (totalRequests > 50) {
    const affectedCreatorIds = Array.from(
      new Set(requestsSnapshot.docs.map((doc) => doc.data().creatorUserId))
    );

    const violation: AgencyViolation = {
      violationId: generateId(),
      agencyId,
      type: 'UNSOLICITED_REQUESTS',
      severity: 'MEDIUM',
      affectedCreatorIds,
      evidenceRefs: requestsSnapshot.docs.slice(0, 100).map((doc) => doc.id),
      description: `Mass request spam detected: ${totalRequests} requests in 24h to ${affectedCreatorIds.length} creators`,
      status: 'DETECTED',
      agencySuspended: false,
      creatorProtectionApplied: false,
      criminalReferral: false,
      detectedAt: Timestamp.now(),
    };

    await db.collection('agency_violations').add(violation);

    logger.warn('Unsolicited mass requests detected', { agencyId, totalRequests });

    return violation;
  }

  return null;
}

/**
 * Detect suspicious payout patterns
 * Red flags:
 * - Sudden large payouts
 * - Unusual payout timing
 * - Multiple failed payouts
 */
export async function detectSuspiciousPayouts(agencyId: string): Promise<AgencyViolation | null> {
  const last7Days = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const payoutsSnapshot = await db
    .collection('agency_payouts')
    .where('agencyId', '==', agencyId)
    .where('requestedAt', '>=', last7Days)
    .get();

  if (payoutsSnapshot.empty) {
    return null;
  }

  const payouts = payoutsSnapshot.docs.map((doc) => doc.data());
  const failedPayouts = payouts.filter((p) => p.status === 'FAILED').length;
  const totalPayouts = payouts.length;
  const failureRate = failedPayouts / totalPayouts;

  // Red flag: >50% failure rate with >5 attempts
  if (failureRate > 0.5 && totalPayouts > 5) {
    const violation: AgencyViolation = {
      violationId: generateId(),
      agencyId,
      type: 'SUSPICIOUS_PAYOUT',
      severity: 'HIGH',
      affectedCreatorIds: [],
      evidenceRefs: payoutsSnapshot.docs.map((doc) => doc.id),
      description: `High payout failure rate: ${(failureRate * 100).toFixed(1)}% of ${totalPayouts} payouts failed in 7 days`,
      status: 'DETECTED',
      agencySuspended: false,
      creatorProtectionApplied: false,
      criminalReferral: false,
      detectedAt: Timestamp.now(),
    };

    await db.collection('agency_violations').add(violation);

    logger.warn('Suspicious payout pattern detected', { agencyId, failureRate, totalPayouts });

    return violation;
  }

  return null;
}

/**
 * Detect excessive percentage claims
 * Red flag: Agency taking >40% of creator earnings
 */
export async function detectExcessivePercentage(agencyId: string): Promise<AgencyViolation | null> {
  const linksSnapshot = await db
    .collection('creator_agency_links')
    .where('agencyId', '==', agencyId)
    .where('status', '==', 'ACTIVE')
    .get();

  const excessiveLinks = linksSnapshot.docs.filter(
    (doc) => doc.data().percentageForAgency > DEFAULT_AGENCY_RULES.maxPercentage
  );

  if (excessiveLinks.length > 0) {
    const affectedCreatorIds = excessiveLinks.map((doc) => doc.data().creatorUserId);

    const violation: AgencyViolation = {
      violationId: generateId(),
      agencyId,
      type: 'EXCESSIVE_PERCENTAGE',
      severity: 'CRITICAL',
      affectedCreatorIds,
      evidenceRefs: excessiveLinks.map((doc) => doc.id),
      description: `Excessive percentage detected: ${excessiveLinks.length} creators with >${DEFAULT_AGENCY_RULES.maxPercentage}% agency cut`,
      status: 'DETECTED',
      agencySuspended: false,
      creatorProtectionApplied: false,
      criminalReferral: false,
      detectedAt: Timestamp.now(),
    };

    await db.collection('agency_violations').add(violation);

    logger.error('Excessive percentage violation', { agencyId, affectedCount: excessiveLinks.length });

    return violation;
  }

  return null;
}

/**
 * Check for minor exploitation
 * Requires integration with user age verification
 */
export async function detectMinorExploitation(agencyId: string): Promise<AgencyViolation | null> {
  const linksSnapshot = await db
    .collection('creator_agency_links')
    .where('agencyId', '==', agencyId)
    .where('status', '==', 'ACTIVE')
    .get();

  if (linksSnapshot.empty) {
    return null;
  }

  const creatorIds = linksSnapshot.docs.map((doc) => doc.data().creatorUserId);
  const minorCreators: string[] = [];

  // Check each creator's age
  for (const creatorId of creatorIds) {
    const userDoc = await db.collection('users').doc(creatorId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.dateOfBirth) {
        const birthDate = new Date(userData.dateOfBirth);
        const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        
        if (age < 18) {
          minorCreators.push(creatorId);
        }
      }
    }
  }

  if (minorCreators.length > 0) {
    const violation: AgencyViolation = {
      violationId: generateId(),
      agencyId,
      type: 'MINOR_EXPLOITATION',
      severity: 'CRITICAL',
      affectedCreatorIds: minorCreators,
      evidenceRefs: [],
      description: `Minor exploitation detected: ${minorCreators.length} linked creators are under 18`,
      status: 'CONFIRMED',
      agencySuspended: true,
      creatorProtectionApplied: true,
      criminalReferral: true,
      detectedAt: Timestamp.now(),
    };

    await db.collection('agency_violations').add(violation);

    logger.error('CRITICAL: Minor exploitation detected', {
      agencyId,
      minorCount: minorCreators.length,
    });

    // Immediately suspend agency
    await updateAgencyStatus(agencyId, 'BLOCKED', 'Minor exploitation detected', 'SYSTEM');

    // Remove all links and protect creators
    await protectAffectedCreators(minorCreators, agencyId);

    return violation;
  }

  return null;
}

// ============================================================================
// ENFORCEMENT ACTIONS
// ============================================================================

/**
 * Process violation and take action
 */
export async function processViolation(violation: AgencyViolation): Promise<void> {
  const { violationId, agencyId, type, severity, affectedCreatorIds } = violation;

  logger.info('Processing agency violation', { violationId, agencyId, type, severity });

  // Determine action based on severity and type
  let suspendAgency = false;
  let protectCreators = false;
  let createCase = true;

  switch (severity) {
    case 'CRITICAL':
      suspendAgency = true;
      protectCreators = true;
      break;
    case 'HIGH':
      if (type === 'FORCED_LINKAGE' || type === 'EXCESSIVE_PERCENTAGE') {
        suspendAgency = true;
      }
      protectCreators = true;
      break;
    case 'MEDIUM':
      // Warning only, create moderation case
      break;
    case 'LOW':
      createCase = false;
      break;
  }

  // Apply enforcement actions
  if (suspendAgency) {
    await updateAgencyStatus(agencyId, 'SUSPENDED', `Violation: ${type}`, 'SYSTEM');
    await db.collection('agency_violations').doc(violationId).update({
      agencySuspended: true,
    });
  }

  if (protectCreators && affectedCreatorIds.length > 0) {
    await protectAffectedCreators(affectedCreatorIds, agencyId);
    await db.collection('agency_violations').doc(violationId).update({
      creatorProtectionApplied: true,
    });
  }

  if (createCase) {
    // Create moderation case for review
    // TODO: Integrate with moderation system
    logger.info('Moderation case should be created', {
      violationId,
      type,
      severity,
      agencyId,
    });
  }

  logger.info('Violation processed', {
    violationId,
    suspendAgency,
    protectCreators,
    createCase,
  });
}

/**
 * Protect affected creators
 */
async function protectAffectedCreators(creatorIds: string[], agencyId: string): Promise<void> {
  const batch = db.batch();

  for (const creatorId of creatorIds) {
    // Find and suspend all links
    const linksSnapshot = await db
      .collection('creator_agency_links')
      .where('creatorUserId', '==', creatorId)
      .where('agencyId', '==', agencyId)
      .where('status', 'in', ['ACTIVE', 'PENDING'])
      .get();

    linksSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'SUSPENDED',
        removedAt: serverTimestamp(),
        removedReason: 'Creator protection - agency violation detected',
      });
    });

    // TODO: Send notification to creator
  }

  await batch.commit();

  logger.info('Creators protected', { creatorIds, agencyId });
}

// ============================================================================
// SCHEDULED MONITORING
// ============================================================================

/**
 * Daily agency safety scan
 * Runs automated checks on all active agencies
 */
export const runDailyAgencySafetyScan = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    logger.info('Starting daily agency safety scan');

    try {
      // Get all active agencies
      const agenciesSnapshot = await db
        .collection('creator_agency_accounts')
        .where('status', '==', 'ACTIVE')
        .get();

      let scannedCount = 0;
      let violationsDetected = 0;

      for (const agencyDoc of agenciesSnapshot.docs) {
        const agencyId = agencyDoc.id;

        try {
          // Run all detection checks
          const violations = await Promise.all([
            detectForcedLinkage(agencyId),
            detectUnsolicitedRequests(agencyId),
            detectSuspiciousPayouts(agencyId),
            detectExcessivePercentage(agencyId),
            detectMinorExploitation(agencyId),
          ]);

          // Process any detected violations
          for (const violation of violations) {
            if (violation) {
              await processViolation(violation);
              violationsDetected++;
            }
          }

          scannedCount++;
        } catch (error) {
          logger.error('Error scanning agency', { agencyId, error });
        }
      }

      logger.info('Daily agency safety scan completed', {
        scannedCount,
        violationsDetected,
      });

      return null;
    } catch (error: any) {
      logger.error('Error in daily safety scan', error);
      throw error;
    }
  }
);

// ============================================================================
// MANUAL ENFORCEMENT TOOLS
// ============================================================================

/**
 * Manually block agency (admin function)
 */
export async function blockAgencyForViolation(
  agencyId: string,
  reason: string,
  adminId: string,
  criminalReferral: boolean = false
): Promise<void> {
  // Update agency status
  await updateAgencyStatus(agencyId, 'BLOCKED', reason, adminId);

  // Get all linked creators
  const linksSnapshot = await db
    .collection('creator_agency_links')
    .where('agencyId', '==', agencyId)
    .where('status', 'in', ['ACTIVE', 'PENDING'])
    .get();

  const affectedCreatorIds = linksSnapshot.docs.map((doc) => doc.data().creatorUserId);

  // Create violation record
  const violation: AgencyViolation = {
    violationId: generateId(),
    agencyId,
    type: 'CONTRACT_VIOLATION',
    severity: 'CRITICAL',
    affectedCreatorIds,
    evidenceRefs: [],
    description: reason,
    status: 'CONFIRMED',
    agencySuspended: true,
    creatorProtectionApplied: true,
    criminalReferral,
    detectedAt: Timestamp.now(),
    resolvedBy: adminId,
  };

  await db.collection('agency_violations').add(violation);

  // Protect all creators
  await protectAffectedCreators(affectedCreatorIds, agencyId);

  logger.warn('Agency blocked by admin', {
    agencyId,
    adminId,
    reason,
    affectedCreatorCount: affectedCreatorIds.length,
    criminalReferral,
  });
}

/**
 * Get violation history for agency
 */
export async function getAgencyViolationHistory(
  agencyId: string
): Promise<AgencyViolation[]> {
  const violationsSnapshot = await db
    .collection('agency_violations')
    .where('agencyId', '==', agencyId)
    .orderBy('detectedAt', 'desc')
    .limit(50)
    .get();

  return violationsSnapshot.docs.map((doc) => doc.data() as AgencyViolation);
}