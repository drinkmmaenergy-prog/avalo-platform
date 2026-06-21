import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 114 — Affiliate Layer for Professional Studio Creators & Agencies
 * Core Agency Engine
 * 
 * COMPLIANCE RULES ENFORCED:
 * - Token price per unit remains constant
 * - Avalo always receives 35% commission
 * - Creators never lose more than their 65% share
 * - Affiliates/Studios receive sub-split inside earner's 65%
 * - No visibility boosts or algorithmic bias
 * - No free tokens, discounts, bonuses
 * - Consent-based workflow preventing exploitation
 */

import { db, serverTimestamp, generateId, increment, admin } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  CreatorAgencyAccount,
  CreatorAgencyLink,
  AgencyLinkRequest,
  AgencyEarningsSplit,
  AgencyStatus,
  LinkStatus,
  AgencyError,
  AgencyErrorCode,
  DEFAULT_AGENCY_RULES,
  AgencyAuditLog,
  AgencyAuditEventType,
} from './pack114-types';
import { isUserVerifiedForPayouts } from './kyc';
import { logEvent } from './observability';
import { auth, functions, timestamp } from './runtime';

// ============================================================================
// AGENCY ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Create agency account
 */
export const createAgencyAccount = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ agencyId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { name, legalEntity, country, contactEmails } = request.data;

    // Validate inputs
    if (!name || !legalEntity || !country || !contactEmails) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (!Array.isArray(contactEmails) || contactEmails.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one contact email required');
    }

    if (country.length !== 2) {
      throw new HttpsError('invalid-argument', 'Country must be 2-letter ISO code');
    }

    try {
      const agencyId = generateId();

      const agency: CreatorAgencyAccount = {
        agencyId,
        name,
        legalEntity,
        country: country.toUpperCase(),
        status: 'PENDING_KYC',
        contactEmails,
        kycStatus: 'NOT_STARTED',
        linkedCreatorCount: 0,
        totalEarnings: 0,
        activeEarnings: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: request.auth.uid,
      };

      await db.collection('earner_agency_accounts').doc(agencyId).set(agency);

      // Audit log
      await logAgencyAudit({
        eventType: 'AGENCY_CREATED',
        agencyId,
        actorId: request.auth.uid,
        actorType: 'CREATOR',
        metadata: { name, legalEntity, country },
      });

      logger.info('Agency account created', { agencyId, name });

      return { agencyId };
    } catch (error: any) {
      logger.error('Error creating agency account', error);
      throw new HttpsError('internal', `Failed to create agency: ${error.message}`);
    }
  }
);

/**
 * Get agency account details
 */
export const getAgencyAccount = onCall(
  { region: 'europe-west1' },
  async (request): Promise<CreatorAgencyAccount> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    try {
      const agencyDoc = await db.collection('earner_agency_accounts').doc(agencyId).get();

      if (!agencyDoc.exists) {
        throw new AgencyError(
          AgencyErrorCode.AGENCY_NOT_FOUND,
          'Agency not found'
        );
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      // Security: Only agency owner or linked earners can view
      if (agency.createdBy !== request.auth.uid) {
        // Check if user is a linked earner
        const linkQuery = await db
          .collection('earner_agency_links')
          .where('agencyId', '==', agencyId)
          .where('earnerUserId', '==', request.auth.uid)
          .where('status', '==', 'ACTIVE')
          .limit(1)
          .get();

        if (linkQuery.empty) {
          throw new HttpsError('permission-denied', 'Not authorized to view this agency');
        }
      }

      return agency;
    } catch (error: any) {
      logger.error('Error getting agency account', error);
      
      if (error instanceof AgencyError) {
        throw new HttpsError('not-found', error.message);
      }
      
      throw new HttpsError('internal', `Failed to get agency: ${error.message}`);
    }
  }
);

/**
 * Update agency status (admin function)
 */
export async function updateAgencyStatus(
  agencyId: string,
  newStatus: AgencyStatus,
  reason?: string,
  adminId?: string
): Promise<void> {
  const agencyRef = db.collection('earner_agency_accounts').doc(agencyId);
  const agencyDoc = await agencyRef.get();

  if (!agencyDoc.exists) {
    throw new AgencyError(AgencyErrorCode.AGENCY_NOT_FOUND, 'Agency not found');
  }

  const oldStatus = (agencyDoc.data() as CreatorAgencyAccount).status;

  await agencyRef.update({
    status: newStatus,
    updatedAt: serverTimestamp(),
  });

  // Audit log
  await logAgencyAudit({
    eventType: 'AGENCY_STATUS_CHANGED',
    agencyId,
    actorId: adminId,
    actorType: 'ADMIN',
    metadata: {
      oldStatus,
      newStatus,
      reason,
    },
  });

  logger.info('Agency status updated', { agencyId, oldStatus, newStatus, reason });

  // If suspended or blocked, notify all linked earners
  if (newStatus === 'SUSPENDED' || newStatus === 'BLOCKED') {
    await notifyLinkedCreators(agencyId, `Agency has been ${newStatus.toLowerCase()}`);
  }
}

// ============================================================================
// CREATOR-AGENCY LINKAGE
// ============================================================================

/**
 * Request to link earner to agency
 */
export const requestCreatorLink = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ requestId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, earnerUserId, proposedPercentage, message } = request.data;

    // Validate inputs
    if (!agencyId || !earnerUserId || !proposedPercentage) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    // Validate percentage
    if (
      proposedPercentage < DEFAULT_AGENCY_RULES.minPercentage ||
      proposedPercentage > DEFAULT_AGENCY_RULES.maxPercentage
    ) {
      throw new HttpsError(
        'invalid-argument',
        `Percentage must be between ${DEFAULT_AGENCY_RULES.minPercentage}% and ${DEFAULT_AGENCY_RULES.maxPercentage}%`
      );
    }

    try {
      // Verify agency exists and is active
      const agencyDoc = await db.collection('earner_agency_accounts').doc(agencyId).get();
      
      if (!agencyDoc.exists) {
        throw new AgencyError(AgencyErrorCode.AGENCY_NOT_FOUND, 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.status !== 'ACTIVE') {
        throw new AgencyError(
          AgencyErrorCode.AGENCY_SUSPENDED,
          'Agency is not active'
        );
      }

      // Check if agency owner is making request
      const requestedBy = agency.createdBy === request.auth.uid ? 'AGENCY' : 'CREATOR';

      // Check for existing active link
      const existingLinkQuery = await db
        .collection('earner_agency_links')
        .where('earnerUserId', '==', earnerUserId)
        .where('agencyId', '==', agencyId)
        .where('status', 'in', ['ACTIVE', 'PENDING'])
        .limit(1)
        .get();

      if (!existingLinkQuery.empty) {
        throw new AgencyError(
          AgencyErrorCode.LINK_ALREADY_EXISTS,
          'Link already exists or is pending'
        );
      }

      // Check rate limiting (max requests per day)
      const rateLimitCheck = await checkLinkRequestRateLimit(agencyId);
      if (!rateLimitCheck.allowed) {
        throw new HttpsError('resource-exhausted', 'Daily link request limit exceeded');
      }

      // Create link request
      const requestId = generateId();
      const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const linkRequest: AgencyLinkRequest = {
        requestId,
        agencyId,
        earnerUserId,
        proposedPercentage,
        message,
        status: 'PENDING',
        createdAt: Timestamp.now(),
        expiresAt,
      };

      await db.collection('agency_link_requests').doc(requestId).set(linkRequest);

      // Audit log
      await logAgencyAudit({
        eventType: 'LINK_REQUESTED',
        agencyId,
        earnerUserId,
        actorId: request.auth.uid,
        actorType: requestedBy === 'AGENCY' ? 'AGENCY' : 'CREATOR',
        metadata: { proposedPercentage, requestedBy },
      });

      // TODO: Send notification to earner
      logger.info('Agency link requested', { requestId, agencyId, earnerUserId });

      return { requestId };
    } catch (error: any) {
      logger.error('Error requesting earner link', error);
      
      if (error instanceof AgencyError) {
        throw new HttpsError('failed-precondition', error.message);
      }
      
      throw new HttpsError('internal', `Failed to request link: ${error.message}`);
    }
  }
);

/**
 * Accept agency link request
 */
export const acceptAgencyLinkRequest = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ linkId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { requestId } = request.data;

    if (!requestId) {
      throw new HttpsError('invalid-argument', 'Request ID required');
    }

    try {
      const requestRef = db.collection('agency_link_requests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new AgencyError(AgencyErrorCode.LINK_NOT_FOUND, 'Link request not found');
      }

      const linkRequest = requestDoc.data() as AgencyLinkRequest;

      // Verify user is the target earner
      if (linkRequest.earnerUserId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to accept this request');
      }

      // Check if expired
      if (linkRequest.expiresAt.toMillis() < Date.now()) {
        throw new AgencyError(AgencyErrorCode.REQUEST_EXPIRED, 'Link request has expired');
      }

      // Check if already processed
      if (linkRequest.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', 'Request already processed');
      }

      // Verify agency is still active
      const agencyDoc = await db
        .collection('earner_agency_accounts')
        .doc(linkRequest.agencyId)
        .get();

      if (!agencyDoc.exists) {
        throw new AgencyError(AgencyErrorCode.AGENCY_NOT_FOUND, 'Agency not found');
      }

      const agency = agencyDoc.data() as CreatorAgencyAccount;

      if (agency.status !== 'ACTIVE') {
        throw new AgencyError(AgencyErrorCode.AGENCY_SUSPENDED, 'Agency is not active');
      }

      // Create the link
      const linkId = generateId();

      const link: CreatorAgencyLink = {
        linkId,
        earnerUserId: linkRequest.earnerUserId,
        agencyId: linkRequest.agencyId,
        percentageForAgency: linkRequest.proposedPercentage,
        status: 'ACTIVE',
        verified: true,
        requestedBy: 'AGENCY',
        requestedAt: linkRequest.createdAt,
        acceptedAt: Timestamp.now(),
        totalEarningsGenerated: 0,
        agencyEarningsTotal: 0,
        earnerEarningsTotal: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // Transaction: create link and update counters
      await db.runTransaction(async (transaction) => {
        transaction.set(db.collection('earner_agency_links').doc(linkId), link);
        transaction.update(requestRef, {
          status: 'ACCEPTED',
          resolvedAt: serverTimestamp(),
        });
        transaction.update(agencyDoc.ref, {
          linkedCreatorCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      });

      // Audit log
      await logAgencyAudit({
        eventType: 'LINK_ACCEPTED',
        agencyId: linkRequest.agencyId,
        earnerUserId: linkRequest.earnerUserId,
        actorId: request.auth.uid,
        actorType: 'CREATOR',
        metadata: { linkId, percentageForAgency: linkRequest.proposedPercentage },
      });

      logger.info('Agency link accepted', { linkId, agencyId: linkRequest.agencyId });

      return { linkId };
    } catch (error: any) {
      logger.error('Error accepting agency link', error);
      
      if (error instanceof AgencyError) {
        throw new HttpsError('failed-precondition', error.message);
      }
      
      throw new HttpsError('internal', `Failed to accept link: ${error.message}`);
    }
  }
);

/**
 * Reject agency link request
 */
export const rejectAgencyLinkRequest = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { requestId, reason } = request.data;

    if (!requestId) {
      throw new HttpsError('invalid-argument', 'Request ID required');
    }

    try {
      const requestRef = db.collection('agency_link_requests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new AgencyError(AgencyErrorCode.LINK_NOT_FOUND, 'Link request not found');
      }

      const linkRequest = requestDoc.data() as AgencyLinkRequest;

      // Verify user is the target earner
      if (linkRequest.earnerUserId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to reject this request');
      }

      await requestRef.update({
        status: 'REJECTED',
        resolvedAt: serverTimestamp(),
      });

      // Audit log
      await logAgencyAudit({
        eventType: 'LINK_REJECTED',
        agencyId: linkRequest.agencyId,
        earnerUserId: linkRequest.earnerUserId,
        actorId: request.auth.uid,
        actorType: 'CREATOR',
        metadata: { requestId, reason },
      });

      logger.info('Agency link rejected', { requestId, reason });

      return { success: true };
    } catch (error: any) {
      logger.error('Error rejecting agency link', error);
      throw new HttpsError('internal', `Failed to reject link: ${error.message}`);
    }
  }
);

/**
 * Remove agency link (can be done by earner or agency)
 */
export const removeAgencyLink = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { linkId, reason } = request.data;

    if (!linkId) {
      throw new HttpsError('invalid-argument', 'Link ID required');
    }

    try {
      const linkRef = db.collection('earner_agency_links').doc(linkId);
      const linkDoc = await linkRef.get();

      if (!linkDoc.exists) {
        throw new AgencyError(AgencyErrorCode.LINK_NOT_FOUND, 'Link not found');
      }

      const link = linkDoc.data() as CreatorAgencyLink;

      // Check authorization
      const agencyDoc = await db
        .collection('earner_agency_accounts')
        .doc(link.agencyId)
        .get();
      
      const agency = agencyDoc.data() as CreatorAgencyAccount;
      const isCreator = link.earnerUserId === request.auth.uid;
      const isAgency = agency?.createdBy === request.auth.uid;

      if (!isCreator && !isAgency) {
        throw new HttpsError('permission-denied', 'Not authorized to remove this link');
      }

      // Check minimum link duration (prevent abuse)
      const linkAge = Date.now() - link.createdAt.toMillis();
      const minDuration = DEFAULT_AGENCY_RULES.minLinkDuration * 60 * 60 * 1000;

      if (linkAge < minDuration && !isCreator) {
        throw new HttpsError(
          'failed-precondition',
          `Link must be active for at least ${DEFAULT_AGENCY_RULES.minLinkDuration} hours before removal`
        );
      }

      const removedBy = isCreator ? 'REMOVED_BY_CREATOR' : 'REMOVED_BY_AGENCY';

      await db.runTransaction(async (transaction) => {
        transaction.update(linkRef, {
          status: removedBy,
          removedAt: serverTimestamp(),
          removedReason: reason,
          updatedAt: serverTimestamp(),
        });

        if (agencyDoc.exists) {
          transaction.update(agencyDoc.ref, {
            linkedCreatorCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Audit log
      await logAgencyAudit({
        eventType: 'LINK_REMOVED',
        agencyId: link.agencyId,
        earnerUserId: link.earnerUserId,
        actorId: request.auth.uid,
        actorType: isCreator ? 'CREATOR' : 'AGENCY',
        metadata: { linkId, reason, removedBy },
      });

      logger.info('Agency link removed', { linkId, removedBy, reason });

      return { success: true };
    } catch (error: any) {
      logger.error('Error removing agency link', error);
      
      if (error instanceof AgencyError) {
        throw new HttpsError('failed-precondition', error.message);
      }
      
      throw new HttpsError('internal', `Failed to remove link: ${error.message}`);
    }
  }
);

// ============================================================================
// EARNINGS SPLIT ENGINE
// ============================================================================

/**
 * Apply agency earnings split
 * Called by earnings recording functions
 */
export async function applyAgencyEarningsSplit(params: {
  earnerUserId: string;
  grossTokens: number;
  sourceType: 'GIFT' | 'PREMIUM_STORY' | 'PAID_MEDIA' | 'PAID_CALL' | 'AI_COMPANION' | 'OTHER';
  sourceId: string;
  earningId: string;
}): Promise<{
  agencyAmount: number;
  earnerAmount: number;
  splitApplied: boolean;
}> {
  const { earnerUserId, grossTokens, sourceType, sourceId, earningId } = params;

  // Check for active agency link
  const linkQuery = await db
    .collection('earner_agency_links')
    .where('earnerUserId', '==', earnerUserId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  if (linkQuery.empty) {
    // No agency link, earner gets full 65%
    const earnerAmount = Math.floor(grossTokens * MONETIZATION_SPLITS.CHAT.earner);
    return {
      agencyAmount: 0,
      earnerAmount,
      splitApplied: false,
    };
  }

  const link = linkQuery.docs[0].data() as CreatorAgencyLink;

  // Calculate split
  const platformAmount = Math.floor(grossTokens * MONETIZATION_SPLITS.CHAT.platform); // 35% to Avalo (fixed)
  const earnerBefore = grossTokens - platformAmount; // 65% earner share

  // Agency gets percentage of earner's 65%
  const agencyAmount = Math.floor(earnerBefore * (link.percentageForAgency / 100));
  const earnerAmount = earnerBefore - agencyAmount;

  // Record the split
  const split: AgencyEarningsSplit = {
    earningId,
    earnerUserId,
    agencyId: link.agencyId,
    linkId: link.linkId,
    grossTokens,
    platformAmount,
    earnerBefore,
    agencyPercentage: link.percentageForAgency,
    agencyAmount,
    earnerAmount,
    sourceType,
    sourceId,
    createdAt: Timestamp.now(),
  };

  // Store split record and update totals
  await db.runTransaction(async (transaction) => {
    const splitRef = db.collection('agency_earnings_splits').doc();
    transaction.set(splitRef, split);

    // Update link totals
    const linkRef = db.collection('earner_agency_links').doc(link.linkId);
    transaction.update(linkRef, {
      totalEarningsGenerated: increment(earnerBefore),
      agencyEarningsTotal: increment(agencyAmount),
      earnerEarningsTotal: increment(earnerAmount),
      updatedAt: serverTimestamp(),
    });

    // Update agency totals
    const agencyRef = db.collection('earner_agency_accounts').doc(link.agencyId);
    transaction.update(agencyRef, {
      totalEarnings: increment(agencyAmount),
      activeEarnings: increment(agencyAmount),
      updatedAt: serverTimestamp(),
    });
  });

  // Audit log
  await logAgencyAudit({
    eventType: 'EARNING_SPLIT_APPLIED',
    agencyId: link.agencyId,
    earnerUserId,
    actorType: 'SYSTEM',
    metadata: {
      earningId,
      grossTokens,
      agencyAmount,
      earnerAmount,
      percentage: link.percentageForAgency,
    },
  });

  logger.info('Agency earnings split applied', {
    earnerUserId,
    agencyId: link.agencyId,
    grossTokens,
    agencyAmount,
    earnerAmount,
  });

  return {
    agencyAmount,
    earnerAmount,
    splitApplied: true,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check rate limit for link requests
 */
async function checkLinkRequestRateLimit(agencyId: string): Promise<{ allowed: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  const rateLimitRef = db
    .collection('agency_link_request_rate_limits')
    .doc(`${agencyId}_${today}`);

  const result = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);

    if (!doc.exists) {
      transaction.set(rateLimitRef, {
        agencyId,
        date: today,
        count: 1,
        createdAt: serverTimestamp(),
      });
      return { allowed: true };
    }

    const data = doc.data();
    if (data.count >= DEFAULT_AGENCY_RULES.maxRequestsPerDay) {
      return { allowed: false };
    }

    transaction.update(rateLimitRef, {
      count: increment(1),
    });
    return { allowed: true };
  });

  return result;
}

/**
 * Notify all linked earners
 */
async function notifyLinkedCreators(agencyId: string, message: string): Promise<void> {
  const linksSnapshot = await db
    .collection('earner_agency_links')
    .where('agencyId', '==', agencyId)
    .where('status', '==', 'ACTIVE')
    .get();

  // TODO: Send actual notifications
  logger.info('Notifying linked earners', {
    agencyId,
    earnerCount: linksSnapshot.size,
    message,
  });
}

/**
 * Log agency audit event
 */
async function logAgencyAudit(params: {
  eventType: AgencyAuditEventType;
  agencyId: string;
  earnerUserId?: string;
  actorId?: string;
  actorType: 'AGENCY' | 'CREATOR' | 'ADMIN' | 'SYSTEM';
  metadata: Record<string, any>;
  previousValue?: any;
  newValue?: any;
}): Promise<void> {
  const log: AgencyAuditLog = {
    logId: generateId(),
    eventType: params.eventType,
    agencyId: params.agencyId,
    earnerUserId: params.earnerUserId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    metadata: params.metadata,
    actorId: params.actorId,
    actorType: params.actorType,
    timestamp: Timestamp.now(),
  };

  await db.collection('agency_audit_log').add(log);

  // Also log to observability
  await logEvent({
    level: 'INFO',
    source: 'BACKEND',
    service: 'functions.pack114-agency-engine',
    module: 'AGENCY_AUDIT',
    message: `Agency event: ${params.eventType}`,
    environment: 'PROD',
    context: { userId: params.earnerUserId || params.actorId },
    details: {
      extra: {
        agencyId: params.agencyId,
        eventType: params.eventType,
        metadata: params.metadata,
      },
    },
  });
}




























