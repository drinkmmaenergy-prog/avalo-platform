/**
 * PACK 61: Promotion APIs
 * Campaign management, fetching, and event logging
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  PromotionCampaign,
  PromotionOrder,
  PromotionEvent,
  PromotionConfig,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  AddBudgetRequest,
  LogImpressionRequest,
  LogClickRequest,
  FetchPromotionsResponse,
  PromotionCandidate,
  ViewerContext,
  PromotionPlacement
} from './types/promotion';
import {
  filterEligiblePromotions,
  selectPromotions,
  checkCampaignOwnerEligibility
} from './promotionEngine';
import { createAmlEvent } from './amlMonitoring';

const db = admin.firestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get promotion config (global settings)
 */
async function getPromotionConfig(): Promise<PromotionConfig> {
  const configDoc = await db.collection('promotion_config').doc('global').get();
  
  if (!configDoc.exists) {
    // Default config
    return {
      tokensPerImpression: 1,
      maxPromotionsPerFeedPage: 2,
      maxPromotionsPerMarketplacePage: 2,
      maxPromotionsPerHomeView: 1
    };
  }
  
  return configDoc.data() as PromotionConfig;
}

/**
 * Build viewer context from user data
 */
async function buildViewerContext(userId: string): Promise<ViewerContext> {
  // Get profile
  const profileDoc = await db.collection('profiles').doc(userId).get();
  const profile = profileDoc.data();
  
  // Get age verification
  const ageVerifDoc = await db.collection('age_verification').doc(userId).get();
  const ageVerif = ageVerifDoc.data();
  
  // Get control preferences
  const controlDoc = await db.collection('user_control_profiles').doc(userId).get();
  const control = controlDoc.data();
  
  const marketingAllowed = control?.marketing?.allowInAppPromotions ?? false;
  const ageVerified = ageVerif?.verified === true;
  
  return {
    userId,
    age: profile?.age ?? null,
    country: profile?.country ?? null,
    gender: profile?.gender ?? null,
    marketingAllowed,
    ageVerified
  };
}

/**
 * Convert Firestore campaign to candidate for filtering
 */
function campaignToCandidate(
  campaign: PromotionCampaign,
  placement: PromotionPlacement
): PromotionCandidate | null {
  // Check if campaign supports this placement
  if (!campaign.placementTypes.includes(placement)) {
    return null;
  }
  
  return {
    campaignId: campaign.campaignId,
    placement,
    nsfw: campaign.nsfw,
    targeting: campaign.targeting,
    requiresMarketingConsent: campaign.requiresMarketingConsent,
    status: campaign.status,
    startAt: campaign.startAt.toDate(),
    endAt: campaign.endAt.toDate(),
    budgetTokensTotal: campaign.budgetTokensTotal,
    budgetTokensSpent: campaign.budgetTokensSpent,
    maxDailyImpressions: campaign.maxDailyImpressions,
    maxTotalImpressions: campaign.maxTotalImpressions,
    impressions: campaign.impressions
  };
}

// ============================================================================
// API: GET MY CAMPAIGNS
// ============================================================================

export const getMyCampaigns = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Query campaigns owned by this creator
    const campaignsSnap = await db.collection('promotion_campaigns')
      .where('ownerType', '==', 'CREATOR')
      .where('ownerUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const campaigns = campaignsSnap.docs.map(doc => doc.data());
    
    res.json({ campaigns });
  } catch (error: any) {
    console.error('Error in getMyCampaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: CREATE CAMPAIGN
// ============================================================================

export const createCampaign = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as CreateCampaignRequest;
    const {
      ownerUserId,
      name,
      placementTypes,
      title,
      subtitle,
      imageUrl,
      deepLink,
      targeting,
      nsfw,
      startAt,
      endAt,
      initialBudgetTokens
    } = body;

    // Validate required fields
    if (!ownerUserId || !name || !placementTypes || !title || !startAt || !endAt) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!initialBudgetTokens || initialBudgetTokens <= 0) {
      res.status(400).json({ error: 'initialBudgetTokens must be > 0' });
      return;
    }

    // Get owner profile and enforcement
    const [profileDoc, enforcementDoc, ageVerifDoc] = await Promise.all([
      db.collection('profiles').doc(ownerUserId).get(),
      db.collection('enforcement_state').doc(ownerUserId).get(),
      db.collection('age_verification').doc(ownerUserId).get()
    ]);

    const profile = profileDoc.data();
    const enforcement = enforcementDoc.data();
    const ageVerif = ageVerifDoc.data();

    // Check eligibility
    const eligibility = checkCampaignOwnerEligibility(
      profile?.age,
      enforcement?.accountStatus,
      enforcement?.earningStatus,
      profile?.isCreator === true
    );

    if (!eligibility.eligible) {
      res.status(403).json({ error: eligibility.reason });
      return;
    }

    // Check age verification for NSFW campaigns
    if (nsfw && ageVerif?.verified !== true) {
      res.status(403).json({ error: 'Age verification required for NSFW campaigns' });
      return;
    }

    // Check token balance
    const walletDoc = await db.collection('token_wallets').doc(ownerUserId).get();
    const wallet = walletDoc.data();
    const availableTokens = wallet?.balance ?? 0;

    if (availableTokens < initialBudgetTokens) {
      res.status(400).json({ 
        error: 'Insufficient token balance',
        available: availableTokens,
        required: initialBudgetTokens
      });
      return;
    }

    // Parse dates
    const startDate = admin.firestore.Timestamp.fromDate(new Date(startAt));
    const endDate = admin.firestore.Timestamp.fromDate(new Date(endAt));
    const now = admin.firestore.Timestamp.now();

    // Determine initial status
    const initialStatus = startDate.toMillis() > now.toMillis() ? 'DRAFT' : 'ACTIVE';

    // Create campaign
    const campaignId = db.collection('promotion_campaigns').doc().id;
    const campaign: PromotionCampaign = {
      campaignId,
      ownerType: 'CREATOR',
      ownerUserId,
      name,
      status: initialStatus,
      placementTypes,
      title,
      subtitle: subtitle ?? null,
      imageUrl: imageUrl ?? null,
      deepLink: deepLink ?? null,
      targeting: targeting ?? {},
      nsfw: nsfw ?? false,
      requiresMarketingConsent: true, // Always true for CREATOR campaigns
      startAt: startDate,
      endAt: endDate,
      budgetTokensTotal: initialBudgetTokens,
      budgetTokensSpent: 0,
      maxDailyImpressions: null,
      maxTotalImpressions: null,
      impressions: 0,
      clicks: 0,
      createdAt: now,
      updatedAt: now
    };

    // Create order
    const orderId = db.collection('promotion_orders').doc().id;
    const order: PromotionOrder = {
      orderId,
      campaignId,
      ownerUserId,
      tokensCommitted: initialBudgetTokens,
      tokensConsumed: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    // Deduct tokens from wallet
    await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('token_wallets').doc(ownerUserId);
      const walletSnapshot = await transaction.get(walletRef);
      const currentBalance = walletSnapshot.data()?.balance ?? 0;

      if (currentBalance < initialBudgetTokens) {
        throw new Error('Insufficient balance');
      }

      transaction.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(-initialBudgetTokens),
        updatedAt: now
      });

      // Create token transaction record
      const txRef = db.collection('token_transactions').doc();
      transaction.set(txRef, {
        userId: ownerUserId,
        type: 'SPEND',
        amount: initialBudgetTokens,
        reason: 'PROMOTION_CAMPAIGN',
        metadata: { campaignId, orderId },
        createdAt: now
      });

      // Create campaign and order
      transaction.set(db.collection('promotion_campaigns').doc(campaignId), campaign);
      transaction.set(db.collection('promotion_orders').doc(orderId), order);
    });

    // PACK 63: AML Event Logging for high promotion spending
    try {
      // Check if this is a very large initial budget
      if (initialBudgetTokens >= 50000) { // 50k tokens threshold
        await createAmlEvent({
          userId: ownerUserId,
          kind: 'PROMOTION_SPEND_SPIKE',
          severity: 'HIGH',
          description: `Large promotion campaign created: ${initialBudgetTokens} tokens committed`,
          details: { campaignId, initialBudgetTokens, campaignName: name },
          source: 'PROMOTIONS'
        });
      }
      
      // Check total promotion spend in last 30 days
      const date30dAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentCampaignsSnapshot = await db.collection('promotion_campaigns')
        .where('ownerUserId', '==', ownerUserId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
        .get();
      
      let totalSpend30d = initialBudgetTokens;
      for (const doc of recentCampaignsSnapshot.docs) {
        const campaign = doc.data() as PromotionCampaign;
        totalSpend30d += campaign.budgetTokensTotal || 0;
      }
      
      // Alert if total spend exceeds threshold (100k tokens in 30 days)
      if (totalSpend30d >= 100000) {
        await createAmlEvent({
          userId: ownerUserId,
          kind: 'PROMOTION_SPEND_SPIKE',
          severity: 'WARN',
          description: `High promotion spend pattern: ${totalSpend30d} tokens committed in 30 days`,
          details: { totalSpend30d, latestCampaignId: campaignId },
          source: 'PROMOTIONS'
        });
      }
    } catch (amlError: any) {
      console.error('[AML Hook] Error in promotion AML logging:', amlError);
      // Non-blocking
    }

    res.json({
      success: true,
      campaignId,
      campaign
    });
  } catch (error: any) {
    console.error('Error in createCampaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: UPDATE CAMPAIGN
// ============================================================================

export const updateCampaign = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as UpdateCampaignRequest;
    const {
      ownerUserId,
      campaignId,
      status,
      name,
      title,
      subtitle,
      imageUrl,
      deepLink
    } = body;

    if (!ownerUserId || !campaignId) {
      res.status(400).json({ error: 'ownerUserId and campaignId are required' });
      return;
    }

    // Get campaign
    const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
    if (!campaignDoc.exists) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaign = campaignDoc.data() as PromotionCampaign;

    // Verify ownership
    if (campaign.ownerUserId !== ownerUserId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Cannot update ended campaigns
    if (campaign.status === 'ENDED') {
      res.status(400).json({ error: 'Cannot update ended campaign' });
      return;
    }

    // Build update object
    const updates: any = {
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (status !== undefined) {
      // Only allow ACTIVE <-> PAUSED transitions
      if ((status === 'ACTIVE' || status === 'PAUSED') && 
          (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED' || campaign.status === 'DRAFT')) {
        updates.status = status;
      }
    }

    if (name !== undefined) updates.name = name;
    if (title !== undefined) updates.title = title;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (deepLink !== undefined) updates.deepLink = deepLink;

    await db.collection('promotion_campaigns').doc(campaignId).update(updates);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in updateCampaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: ADD BUDGET
// ============================================================================

export const addBudget = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as AddBudgetRequest;
    const { ownerUserId, campaignId, additionalTokens } = body;

    if (!ownerUserId || !campaignId || !additionalTokens) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (additionalTokens <= 0) {
      res.status(400).json({ error: 'additionalTokens must be > 0' });
      return;
    }

    // Get campaign
    const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
    if (!campaignDoc.exists) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaign = campaignDoc.data() as PromotionCampaign;

    // Verify ownership
    if (campaign.ownerUserId !== ownerUserId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Check wallet balance
    const walletDoc = await db.collection('token_wallets').doc(ownerUserId).get();
    const wallet = walletDoc.data();
    const availableTokens = wallet?.balance ?? 0;

    if (availableTokens < additionalTokens) {
      res.status(400).json({ 
        error: 'Insufficient token balance',
        available: availableTokens,
        required: additionalTokens
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();

    // Create new order and update campaign
    const orderId = db.collection('promotion_orders').doc().id;
    const order: PromotionOrder = {
      orderId,
      campaignId,
      ownerUserId,
      tokensCommitted: additionalTokens,
      tokensConsumed: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('token_wallets').doc(ownerUserId);
      const walletSnapshot = await transaction.get(walletRef);
      const currentBalance = walletSnapshot.data()?.balance ?? 0;

      if (currentBalance < additionalTokens) {
        throw new Error('Insufficient balance');
      }

      transaction.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(-additionalTokens),
        updatedAt: now
      });

      // Token transaction
      const txRef = db.collection('token_transactions').doc();
      transaction.set(txRef, {
        userId: ownerUserId,
        type: 'SPEND',
        amount: additionalTokens,
        reason: 'PROMOTION_BUDGET_ADD',
        metadata: { campaignId, orderId },
        createdAt: now
      });

      // Update campaign budget
      transaction.update(db.collection('promotion_campaigns').doc(campaignId), {
        budgetTokensTotal: admin.firestore.FieldValue.increment(additionalTokens),
        updatedAt: now
      });

      // Create order
      transaction.set(db.collection('promotion_orders').doc(orderId), order);
    });

    res.json({ success: true, orderId });
  } catch (error: any) {
    console.error('Error in addBudget:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: FETCH PROMOTIONS FOR PLACEMENT
// ============================================================================

export const fetchPromotionsForPlacement = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const userId = req.query.userId as string;
    const placement = req.query.placement as PromotionPlacement;

    if (!userId || !placement) {
      res.status(400).json({ error: 'userId and placement are required' });
      return;
    }

    // Build viewer context
    const viewer = await buildViewerContext(userId);

    // Get config
    const config = await getPromotionConfig();

    // Determine max count
    let maxCount = 2;
    if (placement === 'DISCOVERY') {
      maxCount = config.maxPromotionsPerFeedPage;
    } else if (placement === 'MARKETPLACE') {
      maxCount = config.maxPromotionsPerMarketplacePage;
    } else if (placement === 'HOME_CARD') {
      maxCount = config.maxPromotionsPerHomeView;
    }

    // Query active campaigns that include this placement
    const campaignsSnap = await db.collection('promotion_campaigns')
      .where('status', '==', 'ACTIVE')
      .where('placementTypes', 'array-contains', placement)
      .get();

    // Convert to candidates
    const candidates: PromotionCandidate[] = [];
    const now = new Date();
    
    for (const doc of campaignsSnap.docs) {
      const campaign = doc.data() as PromotionCampaign;
      
      // Check if owner is blocked
      if (campaign.ownerType === 'CREATOR' && campaign.ownerUserId) {
        const enforcementDoc = await db.collection('enforcement_state')
          .doc(campaign.ownerUserId).get();
        const enforcement = enforcementDoc.data();
        
        if (enforcement?.accountStatus === 'SUSPENDED' || 
            enforcement?.accountStatus === 'BANNED' ||
            enforcement?.earningStatus === 'EARN_DISABLED') {
          continue; // Skip this campaign
        }
      }
      
      const candidate = campaignToCandidate(campaign, placement);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    // Filter eligible
    const eligible = filterEligiblePromotions(viewer, candidates, now);

    // Select promotions
    const selected = selectPromotions(eligible, maxCount);

    // Build response
    const items: FetchPromotionsResponse['items'] = [];
    
    for (const candidate of selected) {
      // Get full campaign data for response
      const campaignDoc = await db.collection('promotion_campaigns')
        .doc(candidate.campaignId).get();
      const campaign = campaignDoc.data() as PromotionCampaign;
      
      items.push({
        campaignId: campaign.campaignId,
        placement,
        title: campaign.title,
        subtitle: campaign.subtitle ?? undefined,
        imageUrl: campaign.imageUrl ?? undefined,
        deepLink: campaign.deepLink ?? undefined
      });
    }

    res.json({ items });
  } catch (error: any) {
    console.error('Error in fetchPromotionsForPlacement:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: LOG IMPRESSION
// ============================================================================

export const logPromotionImpression = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as LogImpressionRequest;
    const { userId, campaignId, placement } = body;

    if (!userId || !campaignId || !placement) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const now = admin.firestore.Timestamp.now();

    // Get campaign
    const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
    if (!campaignDoc.exists) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaign = campaignDoc.data() as PromotionCampaign;

    // Get config
    const config = await getPromotionConfig();

    // Log event
    const eventId = db.collection('promotion_events').doc().id;
    const event: PromotionEvent = {
      eventId,
      campaignId,
      viewerUserId: userId,
      type: 'IMPRESSION',
      placement,
      createdAt: now
    };

    await db.runTransaction(async (transaction) => {
      // Create event
      transaction.set(db.collection('promotion_events').doc(eventId), event);

      // Update campaign counters
      const updates: any = {
        impressions: admin.firestore.FieldValue.increment(1),
        updatedAt: now
      };

      // For CREATOR campaigns, consume tokens
      if (campaign.ownerType === 'CREATOR' && campaign.budgetTokensTotal > 0) {
        const tokensToConsume = config.tokensPerImpression;
        const newSpent = campaign.budgetTokensSpent + tokensToConsume;

        updates.budgetTokensSpent = admin.firestore.FieldValue.increment(tokensToConsume);

        // If budget exceeded, mark as ENDED
        if (newSpent >= campaign.budgetTokensTotal) {
          updates.status = 'ENDED';
        }
      }

      transaction.update(db.collection('promotion_campaigns').doc(campaignId), updates);
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in logPromotionImpression:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: LOG CLICK
// ============================================================================

export const logPromotionClick = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as LogClickRequest;
    const { userId, campaignId, placement } = body;

    if (!userId || !campaignId || !placement) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const now = admin.firestore.Timestamp.now();

    // Get campaign
    const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
    if (!campaignDoc.exists) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Log event
    const eventId = db.collection('promotion_events').doc().id;
    const event: PromotionEvent = {
      eventId,
      campaignId,
      viewerUserId: userId,
      type: 'CLICK',
      placement,
      createdAt: now
    };

    await db.runTransaction(async (transaction) => {
      // Create event
      transaction.set(db.collection('promotion_events').doc(eventId), event);

      // Update campaign clicks (no token consumption on click in this pack)
      transaction.update(db.collection('promotion_campaigns').doc(campaignId), {
        clicks: admin.firestore.FieldValue.increment(1),
        updatedAt: now
      });
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in logPromotionClick:', error);
    res.status(500).json({ error: error.message });
  }
});