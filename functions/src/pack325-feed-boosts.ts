/**
 * ========================================================================
 * PACK 325 - FEED MONETIZATION: BOOSTS & PROMOTED POSTS
 * ========================================================================
 * Mobile + Web · Uses existing Wallet (PACK 277/321) · No tokenomics drift
 * 
 * Enable creators to pay in tokens to:
 * - Boost their posts/reels (higher visibility for limited time)
 * - Promote content to broader audiences
 * 
 * TOKENOMICS RULES:
 * - Boosts = 100% Avalo revenue (AVALO_ONLY_REVENUE context)
 * - NO earnings to other users from boosts - B2C feature
 * - Uses existing wallet + token packs
 * - Respects current revenue splits (no changes to existing flows)
 * - NO free tokens, cashback, or discounts
 * 
 * @version 1.0.0
 * @pack PACK_325
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { spendTokens } from './pack277-wallet-service';

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type BoostSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type BoostStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type ContentType = 'POST' | 'REEL';
export type Gender = 'MALE' | 'FEMALE' | 'NONBINARY' | 'ANY';

export interface FeedBoost {
  id: string;
  ownerUserId: string;
  contentType: ContentType;
  contentId: string;
  status: BoostStatus;
  startAt: string;
  endAt: string;
  tokensPaid: number;
  createdAt: string;
  updatedAt: string;
  targeting: {
    region?: string;
    gender?: Gender;
    minAge?: number;
    maxAge?: number;
  };
  metrics: {
    impressions: number;
    clicks: number;
    profileVisits: number;
  };
}

// ============================================================================
// BOOST PRICING MODEL
// ============================================================================

const BOOST_PRICING = {
  SMALL: { tokens: 200, durationHours: 24 },
  MEDIUM: { tokens: 500, durationHours: 72 },
  LARGE: { tokens: 1000, durationHours: 168 },
};

// ============================================================================
// CLOUD FUNCTIONS - BOOST OPERATIONS
// ============================================================================

/**
 * Create a feed boost
 * Users pay tokens to promote their posts/reels
 */
export const pack325_createFeedBoost = onCall(
  { region: 'europe-west3', maxInstances: 50 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      contentType,
      contentId,
      boostSize,
      targeting = {},
    } = request.data;

    // Validation
    if (!contentType || !contentId || !boostSize) {
      throw new HttpsError(
        'invalid-argument',
        'contentType, contentId, and boostSize are required'
      );
    }

    if (!['POST', 'REEL'].includes(contentType)) {
      throw new HttpsError('invalid-argument', 'Invalid content type');
    }

    if (!['SMALL', 'MEDIUM', 'LARGE'].includes(boostSize)) {
      throw new HttpsError('invalid-argument', 'Invalid boost size');
    }

    // Get pricing
    const pricing = BOOST_PRICING[boostSize as BoostSize];
    const costTokens = pricing.tokens;
    const durationHours = pricing.durationHours;

    // Verify user owns the content
    const contentCollection = contentType === 'POST' ? 'feedPosts' : 'feedReels';
    const contentDoc = await db.collection(contentCollection).doc(contentId).get();

    if (!contentDoc.exists) {
      throw new HttpsError('not-found', 'Content not found');
    }

    const contentData = contentDoc.data();
    if (contentData?.ownerUserId !== uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only boost your own content'
      );
    }

    if (contentData?.isDeleted) {
      throw new HttpsError('failed-precondition', 'Cannot boost deleted content');
    }

    // Check user is 18+ and verified
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new HttpsError('not-found', 'User not found');
    }

    const age = calculateAge(userData.dateOfBirth);
    if (age < 18) {
      throw new HttpsError(
        'failed-precondition',
        'Must be 18+ to boost content'
      );
    }

    if (userData.verificationStatus !== 'VERIFIED') {
      throw new HttpsError(
        'failed-precondition',
        'Must be verified to boost content'
      );
    }

    // Charge wallet using spendTokens with AVALO_ONLY_REVENUE context
    const spendResult = await spendTokens({
      userId: uid,
      amountTokens: costTokens,
      source: 'MEDIA', // Using MEDIA as source for feed content
      relatedId: contentId,
      contextType: 'AVALO_ONLY_REVENUE', // 100% Avalo revenue
      contextRef: `boost:${contentId}`,
      metadata: {
        boostSize,
        contentType,
      },
    });

    if (!spendResult.success) {
      throw new HttpsError(
        'failed-precondition',
        spendResult.error || 'Failed to charge tokens'
      );
    }

    // Calculate start and end times
    const now = new Date();
    const startAt = now.toISOString();
    const endAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();

    // Create boost document
    const boostRef = db.collection('feedBoosts').doc();
    const boost: Omit<FeedBoost, 'id'> = {
      ownerUserId: uid,
      contentType,
      contentId,
      status: 'ACTIVE',
      startAt,
      endAt,
      tokensPaid: costTokens,
      createdAt: startAt,
      updatedAt: startAt,
      targeting: {
        region: targeting.region,
        gender: targeting.gender || 'ANY',
        minAge: targeting.minAge,
        maxAge: targeting.maxAge,
      },
      metrics: {
        impressions: 0,
        clicks: 0,
        profileVisits: 0,
      },
    };

    await boostRef.set(boost);

    logger.info(`Boost created: ${boostRef.id} for ${contentType} ${contentId} by ${uid}`);

    return {
      success: true,
      boostId: boostRef.id,
      boost: {
        ...boost,
        id: boostRef.id,
      },
      charged: {
        tokens: costTokens,
        newBalance: spendResult.newBalance,
      },
    };
  }
);

/**
 * Cancel a boost (before it ends)
 * No refund - tokens already spent
 */
export const pack325_cancelFeedBoost = onCall(
  { region: 'europe-west3', maxInstances: 20 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { boostId } = request.data;

    if (!boostId) {
      throw new HttpsError('invalid-argument', 'boostId is required');
    }

    const boostRef = db.collection('feedBoosts').doc(boostId);
    const boostDoc = await boostRef.get();

    if (!boostDoc.exists) {
      throw new HttpsError('not-found', 'Boost not found');
    }

    const boostData = boostDoc.data() as FeedBoost;

    // Verify ownership
    if (boostData.ownerUserId !== uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only cancel your own boosts'
      );
    }

    // Can only cancel active boosts
    if (boostData.status !== 'ACTIVE') {
      throw new HttpsError(
        'failed-precondition',
        'Can only cancel active boosts'
      );
    }

    // Update status to cancelled (no refund)
    await boostRef.update({
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Boost cancelled: ${boostId} by ${uid} (no refund)`);

    return {
      success: true,
      boostId,
      message: 'Boost cancelled (no refund)',
    };
  }
);

/**
 * Get user's boosts history
 */
export const pack325_getUserBoosts = onCall(
  { region: 'europe-west3', maxInstances: 50 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { limit = 20, status } = request.data;

    let query = db
      .collection('feedBoosts')
      .where('ownerUserId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const boosts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      boosts,
    };
  }
);

/**
 * Track boost impression
 */
export const pack325_trackBoostImpression = onCall(
  { region: 'europe-west3', maxInstances: 200 },
  async (request) => {
    const { boostId } = request.data;

    if (!boostId) {
      throw new HttpsError('invalid-argument', 'boostId is required');
    }

    const boostRef = db.collection('feedBoosts').doc(boostId);
    const boostDoc = await boostRef.get();

    if (!boostDoc.exists) {
      throw new HttpsError('not-found', 'Boost not found');
    }

    // Increment impressions
    await boostRef.update({
      'metrics.impressions': FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  }
);

/**
 * Track boost click
 */
export const pack325_trackBoostClick = onCall(
  { region: 'europe-west3', maxInstances: 200 },
  async (request) => {
    const { boostId } = request.data;

    if (!boostId) {
      throw new HttpsError('invalid-argument', 'boostId is required');
    }

    const boostRef = db.collection('feedBoosts').doc(boostId);
    const boostDoc = await boostRef.get();

    if (!boostDoc.exists) {
      throw new HttpsError('not-found', 'Boost not found');
    }

    // Increment clicks
    await boostRef.update({
      'metrics.clicks': FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  }
);

/**
 * Track boost profile visit
 */
export const pack325_trackBoostProfileVisit = onCall(
  { region: 'europe-west3', maxInstances: 200 },
  async (request) => {
    const { boostId } = request.data;

    if (!boostId) {
      throw new HttpsError('invalid-argument', 'boostId is required');
    }

    const boostRef = db.collection('feedBoosts').doc(boostId);
    const boostDoc = await boostRef.get();

    if (!boostDoc.exists) {
      throw new HttpsError('not-found', 'Boost not found');
    }

    // Increment profile visits
    await boostRef.update({
      'metrics.profileVisits': FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Expire boosts job
 * Runs every 15 minutes to mark expired boosts
 */
export const pack325_expireFeedBoosts = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west3',
    timeZone: 'UTC',
  },
  async () => {
    logger.info('Starting boost expiration job...');

    const now = new Date().toISOString();

    // Find active boosts that have expired
    const expiredBoostsQuery = await db
      .collection('feedBoosts')
      .where('status', '==', 'ACTIVE')
      .where('endAt', '<', now)
      .limit(500)
      .get();

    if (expiredBoostsQuery.empty) {
      logger.info('No expired boosts found');
      return;
    }

    // Batch update expired boosts
    const batchSize = 500;
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let operationCount = 0;

    for (const doc of expiredBoostsQuery.docs) {
      currentBatch.update(doc.ref, {
        status: 'EXPIRED',
        updatedAt: new Date().toISOString(),
      });

      operationCount++;

      if (operationCount === batchSize) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      batches.push(currentBatch);
    }

    // Commit all batches
    for (const batch of batches) {
      await batch.commit();
    }

    logger.info(
      `Boost expiration completed: ${expiredBoostsQuery.size} boosts marked as expired`
    );
  }
);

/**
 * Get active boost for content (helper for feed ranking)
 */
export async function getActiveBoostForContent(
  contentId: string
): Promise<FeedBoost | null> {
  const now = new Date().toISOString();

  const boostQuery = await db
    .collection('feedBoosts')
    .where('contentId', '==', contentId)
    .where('status', '==', 'ACTIVE')
    .where('startAt', '<=', now)
    .where('endAt', '>', now)
    .limit(1)
    .get();

  if (boostQuery.empty) {
    return null;
  }

  const boostDoc = boostQuery.docs[0];
  return {
    id: boostDoc.id,
    ...boostDoc.data(),
  } as FeedBoost;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: any): number {
  if (!dateOfBirth) return 0;

  let dob: Date;
  if (dateOfBirth.toDate) {
    dob = dateOfBirth.toDate();
  } else if (typeof dateOfBirth === 'string') {
    dob = new Date(dateOfBirth);
  } else {
    return 0;
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

logger.info('✅ PACK 325 - Feed Monetization: Boosts & Promoted Posts loaded successfully');