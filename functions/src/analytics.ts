/**
 * PACK 62 — Creator & User Analytics Hub
 *
 * Provides read-only analytics for:
 * - Creator earnings (by channel, time period, KPIs)
 * - User spending (by category, purchases)
 * - Promotion performance
 *
 * All changes are additive and backward compatible.
 * No token prices, splits, or billing flows are modified.
 */

import * as functions from 'firebase-functions';
import { db, auth } from './init';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface CreatorAnalytics {
  userId: string;
  last7dTokens: number;
  last30dTokens: number;
  last90dTokens: number;
  allTimeTokens: number;
  channels30d: {
    chatTokens: number;
    aiCompanionsTokens: number;
    ppmMediaTokens: number;
    reservationsTokens: number;
    boostsTokens: number;
    promotionsTokens: number;
    otherTokens: number;
  };
  kpis30d: {
    uniquePayers: number;
    totalPaidConversations: number;
    totalPaidMessages: number;
    totalBookings: number;
    totalNewFans: number;
  };
  payouts: {
    lastPayoutAt?: number;
    lastPayoutAmountTokens?: number;
    totalPayoutsCount: number;
    totalPayoutTokens: number;
  };
  updatedAt: number;
}

interface UserSpendingAnalytics {
  userId: string;
  last7dTokensSpent: number;
  last30dTokensSpent: number;
  last90dTokensSpent: number;
  allTimeTokensSpent: number;
  channels30d: {
    chatTokens: number;
    aiCompanionsTokens: number;
    ppmMediaTokens: number;
    reservationsTokens: number;
    boostsTokens: number;
    giftsTokens: number;
    promotionsTokens: number;
    storeTokens: number;
    otherTokens: number;
  };
  purchases: {
    lastPurchaseAt?: number;
    lastPurchaseAmountTokens?: number;
    totalPurchasesCount: number;
    totalPurchasedTokens: number;
  };
  updatedAt: number;
}

interface PromotionAnalytics {
  campaignId: string;
  ownerUserId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  budgetTokensTotal: number;
  budgetTokensSpent: number;
  remainingTokens: number;
  updatedAt: number;
}

// ============================================================================
// CHANNEL MAPPING HELPERS
// ============================================================================

/**
 * Map event type to channel category
 */
function getChannelFromEventType(eventType: string): string {
  const type = eventType.toUpperCase();
  
  if (type.includes('CHAT')) return 'chatTokens';
  if (type.includes('AI_COMPANION') || type.includes('AI_')) return 'aiCompanionsTokens';
  if (type.includes('PPM_MEDIA') || type.includes('PPM_')) return 'ppmMediaTokens';
  if (type.includes('RESERVATION')) return 'reservationsTokens';
  if (type.includes('BOOST')) return 'boostsTokens';
  if (type.includes('GIFT')) return 'giftsTokens';
  if (type.includes('PROMOTION')) return 'promotionsTokens';
  if (type.includes('STORE')) return 'storeTokens';
  
  return 'otherTokens';
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Aggregate creator earnings from token_earn_events
 */
async function aggregateCreatorEarnings(userId: string): Promise<CreatorAnalytics> {
  const now = Date.now();
  const day7ago = now - 7 * 24 * 60 * 60 * 1000;
  const day30ago = now - 30 * 24 * 60 * 60 * 1000;
  const day90ago = now - 90 * 24 * 60 * 60 * 1000;

  // Initialize analytics object
  const analytics: CreatorAnalytics = {
    userId,
    last7dTokens: 0,
    last30dTokens: 0,
    last90dTokens: 0,
    allTimeTokens: 0,
    channels30d: {
      chatTokens: 0,
      aiCompanionsTokens: 0,
      ppmMediaTokens: 0,
      reservationsTokens: 0,
      boostsTokens: 0,
      promotionsTokens: 0,
      otherTokens: 0,
    },
    kpis30d: {
      uniquePayers: 0,
      totalPaidConversations: 0,
      totalPaidMessages: 0,
      totalBookings: 0,
      totalNewFans: 0,
    },
    payouts: {
      totalPayoutsCount: 0,
      totalPayoutTokens: 0,
    },
    updatedAt: now,
  };

  // Fetch token earn events
  const earnEventsSnapshot = await db
    .collection('token_earn_events')
    .where('earnerUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(10000) // reasonable limit for aggregation
    .get();

  const uniquePayers = new Set<string>();
  const paidConversations = new Set<string>();

  earnEventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const createdAt = event.createdAt?.toMillis() || 0;
    const tokens = event.tokensEarned || 0;
    const eventType = event.eventType || event.type || 'OTHER';

    // All-time
    analytics.allTimeTokens += tokens;

    // Rolling windows
    if (createdAt >= day7ago) {
      analytics.last7dTokens += tokens;
    }
    if (createdAt >= day30ago) {
      analytics.last30dTokens += tokens;
      
      // Channel breakdown (30d only)
      const channel = getChannelFromEventType(eventType);
      if (channel in analytics.channels30d) {
        (analytics.channels30d as any)[channel] += tokens;
      }

      // KPIs tracking
      if (event.spenderUserId) {
        uniquePayers.add(event.spenderUserId);
      }
      if (event.conversationId) {
        paidConversations.add(event.conversationId);
      }
      if (eventType.includes('MESSAGE')) {
        analytics.kpis30d.totalPaidMessages++;
      }
      if (eventType.includes('RESERVATION')) {
        analytics.kpis30d.totalBookings++;
      }
    }
    if (createdAt >= day90ago) {
      analytics.last90dTokens += tokens;
    }
  });

  analytics.kpis30d.uniquePayers = uniquePayers.size;
  analytics.kpis30d.totalPaidConversations = paidConversations.size;

  // Fetch fan count (30d new fans)
  try {
    const fansSnapshot = await db
      .collection('user_fans')
      .where('creatorUserId', '==', userId)
      .where('createdAt', '>=', new Date(day30ago))
      .get();
    analytics.kpis30d.totalNewFans = fansSnapshot.size;
  } catch (error) {
    // fans collection may not exist, skip
    console.warn('Could not fetch fan count:', error);
  }

  // Fetch payout summary
  const payoutsSnapshot = await db
    .collection('payout_requests')
    .where('userId', '==', userId)
    .where('status', '==', 'COMPLETED')
    .orderBy('completedAt', 'desc')
    .get();

  payoutsSnapshot.forEach((doc) => {
    const payout = doc.data();
    analytics.payouts.totalPayoutsCount++;
    
    // Estimate tokens (if amountCents provided, convert back to tokens at $0.10 = 1 token)
    const tokensEstimate = payout.tokensRequested || (payout.amountCents ? payout.amountCents / 10 : 0);
    analytics.payouts.totalPayoutTokens += tokensEstimate;

    // Track last payout
    if (!analytics.payouts.lastPayoutAt) {
      analytics.payouts.lastPayoutAt = payout.completedAt?.toMillis() || payout.createdAt?.toMillis();
      analytics.payouts.lastPayoutAmountTokens = tokensEstimate;
    }
  });

  return analytics;
}

/**
 * Aggregate user spending from token spend events and purchases
 */
async function aggregateUserSpending(userId: string): Promise<UserSpendingAnalytics> {
  const now = Date.now();
  const day7ago = now - 7 * 24 * 60 * 60 * 1000;
  const day30ago = now - 30 * 24 * 60 * 60 * 1000;
  const day90ago = now - 90 * 24 * 60 * 60 * 1000;

  const analytics: UserSpendingAnalytics = {
    userId,
    last7dTokensSpent: 0,
    last30dTokensSpent: 0,
    last90dTokensSpent: 0,
    allTimeTokensSpent: 0,
    channels30d: {
      chatTokens: 0,
      aiCompanionsTokens: 0,
      ppmMediaTokens: 0,
      reservationsTokens: 0,
      boostsTokens: 0,
      giftsTokens: 0,
      promotionsTokens: 0,
      storeTokens: 0,
      otherTokens: 0,
    },
    purchases: {
      totalPurchasesCount: 0,
      totalPurchasedTokens: 0,
    },
    updatedAt: now,
  };

  // Fetch token spend events (if collection exists)
  try {
    const spendEventsSnapshot = await db
      .collection('token_spend_events')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(10000)
      .get();

    spendEventsSnapshot.forEach((doc) => {
      const event = doc.data();
      const createdAt = event.createdAt?.toMillis() || 0;
      const tokens = event.tokensSpent || 0;
      const eventType = event.eventType || event.type || 'OTHER';

      analytics.allTimeTokensSpent += tokens;

      if (createdAt >= day7ago) {
        analytics.last7dTokensSpent += tokens;
      }
      if (createdAt >= day30ago) {
        analytics.last30dTokensSpent += tokens;
        
        const channel = getChannelFromEventType(eventType);
        if (channel in analytics.channels30d) {
          (analytics.channels30d as any)[channel] += tokens;
        }
      }
      if (createdAt >= day90ago) {
        analytics.last90dTokensSpent += tokens;
      }
    });
  } catch (error) {
    console.warn('token_spend_events collection not found or error:', error);
    // If collection doesn't exist, we can try to infer from user balance history
  }

  // Fetch purchase history from user_balances or purchase logs
  try {
    const userBalanceDoc = await db.collection('user_balances').doc(userId).get();
    if (userBalanceDoc.exists) {
      const balanceData = userBalanceDoc.data();
      analytics.purchases.totalPurchasedTokens = balanceData?.lifetimePurchasedTokens || 0;
      analytics.purchases.totalPurchasesCount = balanceData?.purchaseCount || 0;
      analytics.purchases.lastPurchaseAt = balanceData?.lastPurchaseAt?.toMillis();
      analytics.purchases.lastPurchaseAmountTokens = balanceData?.lastPurchaseAmount || 0;
    }
  } catch (error) {
    console.warn('Could not fetch purchase history:', error);
  }

  return analytics;
}

/**
 * Aggregate promotion analytics for a specific campaign
 */
async function aggregatePromotionAnalytics(
  campaignId: string,
  ownerUserId: string
): Promise<PromotionAnalytics | null> {
  const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
  
  if (!campaignDoc.exists) {
    return null;
  }

  const campaign = campaignDoc.data()!;
  
  // Verify ownership
  if (campaign.creatorUserId !== ownerUserId) {
    return null;
  }

  const impressions = campaign.impressions || 0;
  const clicks = campaign.clicks || 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return {
    campaignId,
    ownerUserId,
    impressions,
    clicks,
    ctr,
    budgetTokensTotal: campaign.budgetTokensTotal || 0,
    budgetTokensSpent: campaign.budgetTokensSpent || 0,
    remainingTokens: (campaign.budgetTokensTotal || 0) - (campaign.budgetTokensSpent || 0),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// SCHEDULED AGGREGATORS (Cloud Functions)
// ============================================================================

/**
 * Scheduled function to aggregate creator earnings analytics
 * Runs hourly to update analytics_creator_earnings collection
 */
export const aggregateCreatorEarningsAnalytics = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Starting creator earnings analytics aggregation...');

    // Get all users with recent token earn events (last 90 days)
    const now = Date.now();
    const day90ago = now - 90 * 24 * 60 * 60 * 1000;

    const recentEarnersSnapshot = await db
      .collection('token_earn_events')
      .where('createdAt', '>=', new Date(day90ago))
      .select('earnerUserId')
      .get();

    const userIds = new Set<string>();
    recentEarnersSnapshot.forEach((doc) => {
      const earnerUserId = doc.data().earnerUserId;
      if (earnerUserId) {
        userIds.add(earnerUserId);
      }
    });

    console.log(`Aggregating analytics for ${userIds.size} creators...`);

    // Batch write to analytics collection
    const batch = db.batch();
    let count = 0;

    for (const userId of Array.from(userIds)) {
      const analytics = await aggregateCreatorEarnings(userId);
      const docRef = db.collection('analytics_creator_earnings').doc(userId);
      batch.set(docRef, analytics, { merge: true });
      
      count++;
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`Committed batch of ${count} analytics docs`);
      }
    }

    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Creator analytics aggregation complete: ${count} users`);
    return null;
  });

/**
 * Scheduled function to aggregate user spending analytics
 * Runs hourly to update analytics_user_spending collection
 */
export const aggregateUserSpendingAnalytics = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Starting user spending analytics aggregation...');

    const now = Date.now();
    const day90ago = now - 90 * 24 * 60 * 60 * 1000;

    // Get all users with recent spending (last 90 days)
    let userIds = new Set<string>();

    try {
      const recentSpendersSnapshot = await db
        .collection('token_spend_events')
        .where('createdAt', '>=', new Date(day90ago))
        .select('userId')
        .get();

      recentSpendersSnapshot.forEach((doc) => {
        const userId = doc.data().userId;
        if (userId) {
          userIds.add(userId);
        }
      });
    } catch (error) {
      console.warn('Could not fetch from token_spend_events:', error);
      
      // Fallback: get users with balances
      const balancesSnapshot = await db.collection('user_balances').limit(10000).get();
      balancesSnapshot.forEach((doc) => {
        userIds.add(doc.id);
      });
    }

    console.log(`Aggregating spending analytics for ${userIds.size} users...`);

    const batch = db.batch();
    let count = 0;

    for (const userId of Array.from(userIds)) {
      const analytics = await aggregateUserSpending(userId);
      const docRef = db.collection('analytics_user_spending').doc(userId);
      batch.set(docRef, analytics, { merge: true });
      
      count++;
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`Committed batch of ${count} spending analytics docs`);
      }
    }

    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`User spending analytics aggregation complete: ${count} users`);
    return null;
  });

// ============================================================================
// HTTP API ENDPOINTS
// ============================================================================

/**
 * GET /analytics/creator?userId=xxx
 * Returns creator earnings analytics
 * Security: Only accessible by the creator themselves
 */
export const getCreatorAnalytics = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const requestingUserId = decodedToken.uid;

    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    // Security: Only owner can view their analytics
    if (requestingUserId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if precomputed analytics exist
    const analyticsDoc = await db.collection('analytics_creator_earnings').doc(userId).get();
    
    let analytics: CreatorAnalytics;
    
    if (analyticsDoc.exists && (Date.now() - (analyticsDoc.data()?.updatedAt || 0) < 24 * 60 * 60 * 1000)) {
      // Use cached if less than 24h old
      analytics = analyticsDoc.data() as CreatorAnalytics;
    } else {
      // Compute on-demand
      analytics = await aggregateCreatorEarnings(userId);
      
      // Save for future use
      await db.collection('analytics_creator_earnings').doc(userId).set(analytics, { merge: true });
    }

    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error fetching creator analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /analytics/user-spending?userId=xxx
 * Returns user spending analytics
 * Security: Only accessible by the user themselves
 */
export const getUserSpendingAnalytics = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const requestingUserId = decodedToken.uid;

    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    // Security: Only owner can view their spending
    if (requestingUserId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const analyticsDoc = await db.collection('analytics_user_spending').doc(userId).get();
    
    let analytics: UserSpendingAnalytics;
    
    if (analyticsDoc.exists && (Date.now() - (analyticsDoc.data()?.updatedAt || 0) < 24 * 60 * 60 * 1000)) {
      analytics = analyticsDoc.data() as UserSpendingAnalytics;
    } else {
      analytics = await aggregateUserSpending(userId);
      await db.collection('analytics_user_spending').doc(userId).set(analytics, { merge: true });
    }

    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error fetching user spending analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /analytics/promotion?userId=xxx&campaignId=xxx
 * Returns promotion campaign analytics
 * Security: Only accessible by campaign owner
 */
export const getPromotionAnalytics = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const requestingUserId = decodedToken.uid;

    const userId = req.query.userId as string;
    const campaignId = req.query.campaignId as string;

    if (!userId || !campaignId) {
      res.status(400).json({ error: 'userId and campaignId required' });
      return;
    }

    // Security: Only owner can view their promotion analytics
    if (requestingUserId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const analytics = await aggregatePromotionAnalytics(campaignId, userId);
    
    if (!analytics) {
      res.status(404).json({ error: 'Campaign not found or access denied' });
      return;
    }

    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error fetching promotion analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
