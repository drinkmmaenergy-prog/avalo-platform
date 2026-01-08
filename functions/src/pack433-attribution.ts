/**
 * PACK 433 — Influencer Marketplace & Creator Deal Automation Engine
 * Part 3: Tracking & Attribution System
 * 
 * Features:
 * - Creator → Install tracking
 * - Install → Chat → Wallet Spend tracking
 * - One creator per user lifetime rule
 * - One attribution path only (no re-attribution)
 * - Anti-double-attribution lock
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreatorAttribution {
  id: string;
  userId: string;
  creatorId: string;
  dealId: string;
  
  // Traffic source
  fingerprint: string;
  source: string;
  medium: string;
  campaign?: string;
  
  // Geo & device
  country: string;
  ipAddress: string;
  deviceId?: string;
  userAgent: string;
  
  // Conversion funnel
  installedAt: Timestamp;
  firstChatAt?: Timestamp;
  firstPurchaseAt?: Timestamp;
  
  // Monetization
  isPaidUser: boolean;
  lifetimeRevenue: number;
  lifetimePayout: number; // To creator
  
  // Status
  locked: boolean; // Once locked, cannot be changed
  verified: boolean; // Passed fraud checks
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttributionEvent {
  id: string;
  userId: string;
  attributionId: string;
  eventType: 'INSTALL' | 'FIRST_CHAT' | 'FIRST_PURCHASE' | 'REVENUE';
  amount?: number; // For revenue events
  metadata?: Record<string, any>;
  timestamp: Timestamp;
}

export interface UserAttributionLock {
  userId: string;
  attributionId: string;
  creatorId: string;
  lockedAt: Timestamp;
  permanent: boolean;
}

// ============================================================================
// ATTRIBUTION CREATION
// ============================================================================

/**
 * Create attribution when user installs from creator link
 * This is the entry point for all creator tracking
 */
export const createAttribution = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ attributionId: string; locked: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      fingerprint,
      source,
      medium,
      campaign,
      country,
      deviceId,
    } = request.data;

    if (!fingerprint || !source) {
      throw new HttpsError('invalid-argument', 'Missing required fields: fingerprint, source');
    }

    try {
      const userId = request.auth.uid;

      // CRITICAL: Check if user already has an attribution (one creator per lifetime)
      const existingAttribution = await db
        .collection('creator_attributions')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!existingAttribution.empty) {
        const existing = existingAttribution.docs[0].data() as CreatorAttribution;
        
        logger.warn(`User ${userId} already attributed to creator ${existing.creatorId}`);
        
        return {
          attributionId: existingAttribution.docs[0].id,
          locked: true,
        };
      }

      // Look up traffic source to find creator and deal
      const trafficSourceQuery = await db
        .collection('traffic_sources')
        .where('fingerprint', '==', fingerprint)
        .limit(1)
        .get();

      if (trafficSourceQuery.empty) {
        throw new HttpsError('not-found', 'Traffic source not found');
      }

      const trafficSource = trafficSourceQuery.docs[0].data();
      const creatorId = trafficSource.creatorId;

      // Find active deal for this creator
      const activeDealQuery = await db
        .collection('creator_deals')
        .where('creatorId', '==', creatorId)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      if (activeDealQuery.empty) {
        throw new HttpsError('not-found', 'No active deal found for this creator');
      }

      const deal = activeDealQuery.docs[0].data();
      const dealId = activeDealQuery.docs[0].id;

      // Validate geo-targeting
      if (deal.terms.targetCountries && deal.terms.targetCountries.length > 0) {
        if (!deal.terms.targetCountries.includes(country)) {
          throw new HttpsError(
            'failed-precondition',
            'User country not in deal target countries'
          );
        }
      }

      if (deal.terms.excludedCountries && deal.terms.excludedCountries.includes(country)) {
        throw new HttpsError('failed-precondition', 'User country is excluded from deal');
      }

      // Check daily cap
      if (deal.terms.dailyCap) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayInstalls = await db
          .collection('creator_attributions')
          .where('dealId', '==', dealId)
          .where('installedAt', '>=', Timestamp.fromDate(today))
          .count()
          .get();

        if (todayInstalls.data().count >= deal.terms.dailyCap) {
          throw new HttpsError('resource-exhausted', 'Daily installation cap reached for this deal');
        }
      }

      // Check max installs cap
      if (deal.terms.maxInstalls && deal.stats.totalInstalls >= deal.terms.maxInstalls) {
        throw new HttpsError('resource-exhausted', 'Maximum installs reached for this deal');
      }

      // Create attribution
      const attribution: Omit<CreatorAttribution, 'id'> = {
        userId,
        creatorId,
        dealId,
        fingerprint,
        source,
        medium,
        campaign,
        country,
        ipAddress: request.rawRequest?.ip || 'unknown',
        deviceId,
        userAgent: request.rawRequest?.headers['user-agent'] || 'unknown',
        installedAt: Timestamp.now(),
        isPaidUser: false,
        lifetimeRevenue: 0,
        lifetimePayout: 0,
        locked: true, // Immediately lock to prevent changes
        verified: false, // Will be verified by fraud system
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const attributionRef = await db.collection('creator_attributions').add(attribution);

      // Create attribution lock
      const lock: UserAttributionLock = {
        userId,
        attributionId: attributionRef.id,
        creatorId,
        lockedAt: Timestamp.now(),
        permanent: true,
      };

      await db.collection('user_attribution_locks').doc(userId).set(lock);

      // Create install event
      await recordAttributionEvent({
        userId,
        attributionId: attributionRef.id,
        eventType: 'INSTALL',
        metadata: { source, medium, campaign },
      });

      // Update deal stats
      await db.collection('creator_deals').doc(dealId).update({
        'stats.totalInstalls': increment(1),
        updatedAt: Timestamp.now(),
      });

      // Update creator stats
      await db.collection('creator_profiles').doc(creatorId).update({
        'stats.totalInstalls': increment(1),
        updatedAt: Timestamp.now(),
      });

      logger.info(`Attribution created: ${attributionRef.id}`, {
        userId,
        creatorId,
        dealId,
        source,
      });

      return {
        attributionId: attributionRef.id,
        locked: true,
      };
    } catch (error: any) {
      logger.error('Error creating attribution', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to create attribution: ${error.message}`);
    }
  }
);

// ============================================================================
// CONVERSION TRACKING
// ============================================================================

/**
 * Track first chat event
 * Automatically called when user sends first message
 */
export const trackFirstChat = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { chatId } = request.data;

    try {
      // Find user's attribution
      const attributionQuery = await db
        .collection('creator_attributions')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (attributionQuery.empty) {
        // No attribution for this user
        return { success: false };
      }

      const attributionRef = attributionQuery.docs[0].ref;
      const attribution = attributionQuery.docs[0].data() as CreatorAttribution;

      // Only track if this is the first chat
      if (attribution.firstChatAt) {
        return { success: false };
      }

      // Update attribution
      await attributionRef.update({
        firstChatAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Record event
      await recordAttributionEvent({
        userId,
        attributionId: attributionQuery.docs[0].id,
        eventType: 'FIRST_CHAT',
        metadata: { chatId },
      });

      logger.info(`First chat tracked for attribution: ${attributionQuery.docs[0].id}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Error tracking first chat', error);
      throw new HttpsError('internal', `Failed to track first chat: ${error.message}`);
    }
  }
);

/**
 * Track first purchase event
 * Automatically called when user makes first token purchase
 */
export const trackFirstPurchase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { amount, transactionId } = request.data;

    if (!amount) {
      throw new HttpsError('invalid-argument', 'Missing amount');
    }

    try {
      // Find user's attribution
      const attributionQuery = await db
        .collection('creator_attributions')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (attributionQuery.empty) {
        // No attribution for this user
        return { success: false };
      }

      const attributionRef = attributionQuery.docs[0].ref;
      const attribution = attributionQuery.docs[0].data() as CreatorAttribution;

      // Check if this is the first purchase
      const isFirstPurchase = !attribution.firstPurchaseAt;

      // Update attribution
      const updates: any = {
        isPaidUser: true,
        lifetimeRevenue: increment(amount),
        updatedAt: Timestamp.now(),
      };

      if (isFirstPurchase) {
        updates.firstPurchaseAt = Timestamp.now();
      }

      await attributionRef.update(updates);

      // Record event
      await recordAttributionEvent({
        userId,
        attributionId: attributionQuery.docs[0].id,
        eventType: isFirstPurchase ? 'FIRST_PURCHASE' : 'REVENUE',
        amount,
        metadata: { transactionId },
      });

      // Update deal stats
      const dealRef = db.collection('creator_deals').doc(attribution.dealId);
      const dealUpdates: any = {
        'stats.totalRevenue': increment(amount),
        updatedAt: Timestamp.now(),
      };

      if (isFirstPurchase) {
        dealUpdates['stats.paidUsers'] = increment(1);
      }

      await dealRef.update(dealUpdates);

      // Update creator stats
      if (isFirstPurchase) {
        await db.collection('creator_profiles').doc(attribution.creatorId).update({
          'stats.totalRevenue': increment(amount),
          updatedAt: Timestamp.now(),
        });
      }

      logger.info(`Purchase tracked for attribution: ${attributionQuery.docs[0].id}`, {
        amount,
        isFirstPurchase,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error tracking purchase', error);
      throw new HttpsError('internal', `Failed to track purchase: ${error.message}`);
    }
  }
);

// ============================================================================
// ATTRIBUTION QUERIES
// ============================================================================

/**
 * Get user's attribution (if any)
 */
export const getUserAttribution = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorAttribution | null> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own attribution (unless admin)
    if (userId !== request.auth.uid) {
      // TODO: Check admin role
      throw new HttpsError('permission-denied', 'Cannot access another user\'s attribution');
    }

    try {
      const attributionQuery = await db
        .collection('creator_attributions')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (attributionQuery.empty) {
        return null;
      }

      return {
        id: attributionQuery.docs[0].id,
        ...attributionQuery.docs[0].data(),
      } as CreatorAttribution;
    } catch (error: any) {
      logger.error('Error fetching user attribution', error);
      throw new HttpsError('internal', `Failed to fetch attribution: ${error.message}`);
    }
  }
);

/**
 * Get attributions for a deal
 */
export const getDealAttributions = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorAttribution[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { dealId, limit } = request.data;

    if (!dealId) {
      throw new HttpsError('invalid-argument', 'Missing dealId');
    }

    try {
      let query: FirebaseFirestore.Query = db
        .collection('creator_attributions')
        .where('dealId', '==', dealId)
        .orderBy('createdAt', 'desc');

      if (limit) {
        query = query.limit(Math.min(limit, 100));
      } else {
        query = query.limit(50);
      }

      const snapshot = await query.get();

      const attributions: CreatorAttribution[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as CreatorAttribution));

      return attributions;
    } catch (error: any) {
      logger.error('Error fetching deal attributions', error);
      throw new HttpsError('internal', `Failed to fetch attributions: ${error.message}`);
    }
  }
);

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Record an attribution event
 */
async function recordAttributionEvent(params: {
  userId: string;
  attributionId: string;
  eventType: 'INSTALL' | 'FIRST_CHAT' | 'FIRST_PURCHASE' | 'REVENUE';
  amount?: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  const event: Omit<AttributionEvent, 'id'> = {
    userId: params.userId,
    attributionId: params.attributionId,
    eventType: params.eventType,
    amount: params.amount,
    metadata: params.metadata || {},
    timestamp: Timestamp.now(),
  };

  const eventRef = await db.collection('attribution_events').add(event);

  return eventRef.id;
}

/**
 * Check if user has attribution lock
 */
export const checkAttributionLock = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ locked: boolean; creatorId?: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const lockDoc = await db
        .collection('user_attribution_locks')
        .doc(userId)
        .get();

      if (!lockDoc.exists) {
        return { locked: false };
      }

      const lock = lockDoc.data() as UserAttributionLock;

      return {
        locked: true,
        creatorId: lock.creatorId,
      };
    } catch (error: any) {
      logger.error('Error checking attribution lock', error);
      throw new HttpsError('internal', `Failed to check lock: ${error.message}`);
    }
  }
);

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Auto-track purchases from wallet transactions
 * Triggered when a wallet transaction is created
 */
export const onWalletTransactionCreated = onDocumentCreated(
  'wallet_transactions/{transactionId}',
  async (event) => {
    try {
      const transaction = event.data?.data();

      if (!transaction) {
        return;
      }

      // Only track purchases (not withdrawals, refunds, etc.)
      if (transaction.type !== 'PURCHASE') {
        return;
      }

      const userId = transaction.userId;
      const amount = transaction.amount;

      // Find user's attribution
      const attributionQuery = await db
        .collection('creator_attributions')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (attributionQuery.empty) {
        // No attribution for this user
        return;
      }

      const attributionRef = attributionQuery.docs[0].ref;
      const attribution = attributionQuery.docs[0].data() as CreatorAttribution;

      // Check if this is the first purchase
      const isFirstPurchase = !attribution.firstPurchaseAt;

      // Update attribution
      const updates: any = {
        isPaidUser: true,
        lifetimeRevenue: increment(amount),
        updatedAt: Timestamp.now(),
      };

      if (isFirstPurchase) {
        updates.firstPurchaseAt = Timestamp.now();
      }

      await attributionRef.update(updates);

      // Record event
      await recordAttributionEvent({
        userId,
        attributionId: attributionQuery.docs[0].id,
        eventType: isFirstPurchase ? 'FIRST_PURCHASE' : 'REVENUE',
        amount,
        metadata: { transactionId: event.params.transactionId },
      });

      // Update deal stats
      const dealRef = db.collection('creator_deals').doc(attribution.dealId);
      const dealUpdates: any = {
        'stats.totalRevenue': increment(amount),
        updatedAt: Timestamp.now(),
      };

      if (isFirstPurchase) {
        dealUpdates['stats.paidUsers'] = increment(1);
      }

      await dealRef.update(dealUpdates);

      logger.info(`Auto-tracked purchase for attribution: ${attributionQuery.docs[0].id}`, {
        amount,
        isFirstPurchase,
      });
    } catch (error: any) {
      logger.error('Error in wallet transaction trigger', error);
    }
  }
);
