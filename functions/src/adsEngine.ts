/**
 * Ads Engine - Phase 18
 * Sponsored Ads & Brand Placements (S4 Hybrid Model)
 * 
 * Features:
 * - Campaign management (create, update, insights)
 * - Ad placement logic (tier-based frequency)
 * - Impression & click tracking
 * - CPC/CPM billing models
 * - Token-based budgets
 * - Targeting filters
 * - Fraud detection
 */

import { db, serverTimestamp, increment, generateId, timestamp as Timestamp } from './init';

const FieldValue = db.constructor.FieldValue;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CampaignType = 'CPC' | 'CPM';
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'expired';
export type AdPlacement = 'feed' | 'swipe' | 'live';
export type UserTier = 'standard' | 'vip' | 'royal';

export interface AdCampaign {
  campaignId: string;
  brandId: string;
  brandName: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  
  // Ad content
  title: string;
  description: string;
  imageUrl: string;
  targetUrl?: string;
  callToAction: string;
  
  // Budget & billing
  budgetTokens: number;
  spentTokens: number;
  costPerClick?: number; // For CPC
  costPerImpression?: number; // For CPM (per 1000 impressions)
  
  // Targeting
  targeting: {
    countries?: string[];
    languages?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: ('male' | 'female' | 'other')[];
    tiers?: UserTier[];
    interests?: string[];
  };
  
  // Placements
  placements: AdPlacement[];
  
  // Stats
  impressions: number;
  clicks: number;
  ctr: number; // Click-through rate
  
  // Timestamps
  createdAt: any;
  updatedAt: any;
  startDate?: any;
  endDate?: any;
}

export interface AdImpression {
  impressionId: string;
  campaignId: string;
  userId: string;
  deviceId?: string;
  placement: AdPlacement;
  userTier: UserTier;
  timestamp: any;
  ipHash?: string;
}

export interface AdClick {
  clickId: string;
  campaignId: string;
  impressionId: string;
  userId: string;
  deviceId?: string;
  timestamp: any;
  ipHash?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ADS_CONFIG = {
  // Placement frequency (how often ads appear)
  FEED_FREQUENCY: {
    standard: 7, // Every 7th post
    vip: 15, // Every 15th post
    royal: 20, // Every 20th post (luxury experience)
  },
  SWIPE_FREQUENCY: {
    standard: 12, // Every 12th profile
    vip: 15, // Every 15th profile
    royal: 15, // Every 15th profile
  },
  
  // Default costs (in tokens)
  DEFAULT_CPC: 5, // 5 tokens per click
  DEFAULT_CPM: 50, // 50 tokens per 1000 impressions
  
  // Fraud detection
  MAX_IMPRESSIONS_PER_USER_PER_DAY: 100,
  MAX_CLICKS_PER_USER_PER_HOUR: 10,
  MIN_TIME_BETWEEN_CLICKS_MS: 2000, // 2 seconds
  
  // Campaign limits
  MIN_BUDGET_TOKENS: 100,
  MAX_BUDGET_TOKENS: 1000000,
};

// ============================================================================
// CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * Create a new ad campaign
 */
export async function createCampaign(
  brandId: string,
  campaignData: Partial<AdCampaign>
): Promise<AdCampaign> {
  // Validate required fields
  if (!campaignData.title || !campaignData.description || !campaignData.imageUrl) {
    throw new Error('Missing required campaign fields');
  }
  
  if (!campaignData.budgetTokens || campaignData.budgetTokens < ADS_CONFIG.MIN_BUDGET_TOKENS) {
    throw new Error(`Minimum budget is ${ADS_CONFIG.MIN_BUDGET_TOKENS} tokens`);
  }
  
  if (campaignData.budgetTokens > ADS_CONFIG.MAX_BUDGET_TOKENS) {
    throw new Error(`Maximum budget is ${ADS_CONFIG.MAX_BUDGET_TOKENS} tokens`);
  }
  
  // Validate campaign type and costs
  const campaignType = campaignData.campaignType || 'CPM';
  if (campaignType === 'CPC' && !campaignData.costPerClick) {
    campaignData.costPerClick = ADS_CONFIG.DEFAULT_CPC;
  }
  if (campaignType === 'CPM' && !campaignData.costPerImpression) {
    campaignData.costPerImpression = ADS_CONFIG.DEFAULT_CPM;
  }
  
  const campaignId = generateId();
  const now = Timestamp.now();
  
  const campaign: AdCampaign = {
    campaignId,
    brandId,
    brandName: campaignData.brandName || 'Brand',
    campaignType,
    status: 'active',
    title: campaignData.title,
    description: campaignData.description,
    imageUrl: campaignData.imageUrl,
    targetUrl: campaignData.targetUrl,
    callToAction: campaignData.callToAction || 'Learn More',
    budgetTokens: campaignData.budgetTokens,
    spentTokens: 0,
    costPerClick: campaignData.costPerClick,
    costPerImpression: campaignData.costPerImpression,
    targeting: campaignData.targeting || {},
    placements: campaignData.placements || ['feed', 'swipe', 'live'],
    impressions: 0,
    clicks: 0,
    ctr: 0,
    createdAt: now,
    updatedAt: now,
    startDate: campaignData.startDate,
    endDate: campaignData.endDate,
  };
  
  // Save to Firestore
  await db.collection('adsCampaigns').doc(campaignId).set(campaign);
  
  // Record in brand's budget
  await recordBudgetAllocation(brandId, campaignId, campaign.budgetTokens);
  
  return campaign;
}

/**
 * Update an existing campaign
 */
export async function updateCampaign(
  campaignId: string,
  brandId: string,
  updates: Partial<AdCampaign>
): Promise<void> {
  const campaignRef = db.collection('adsCampaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();
  
  if (!campaignSnap.exists) {
    throw new Error('Campaign not found');
  }
  
  const campaign = campaignSnap.data() as AdCampaign;
  
  // Verify ownership
  if (campaign.brandId !== brandId) {
    throw new Error('Unauthorized: Not your campaign');
  }
  
  // Prevent certain updates
  delete updates.campaignId;
  delete updates.brandId;
  delete updates.spentTokens;
  delete updates.impressions;
  delete updates.clicks;
  delete updates.createdAt;
  
  // Update
  await campaignRef.update({
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get campaign insights
 */
export async function getCampaignInsights(
  campaignId: string,
  brandId: string
): Promise<any> {
  const campaignRef = db.collection('adsCampaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();
  
  if (!campaignSnap.exists) {
    throw new Error('Campaign not found');
  }
  
  const campaign = campaignSnap.data() as AdCampaign;
  
  // Verify ownership
  if (campaign.brandId !== brandId) {
    throw new Error('Unauthorized: Not your campaign');
  }
  
  // Get recent impressions and clicks
  const impressionsSnap = await db.collection('adsImpressions')
    .where('campaignId', '==', campaignId)
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .get();
  
  const clicksSnap = await db.collection('adsClicks')
    .where('campaignId', '==', campaignId)
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .get();
  
  // Calculate metrics
  const impressionsByPlacement: Record<string, number> = {};
  const impressionsByTier: Record<string, number> = {};
  
  impressionsSnap.forEach(doc => {
    const imp = doc.data() as AdImpression;
    impressionsByPlacement[imp.placement] = (impressionsByPlacement[imp.placement] || 0) + 1;
    impressionsByTier[imp.userTier] = (impressionsByTier[imp.userTier] || 0) + 1;
  });
  
  const insights = {
    campaign,
    totalImpressions: campaign.impressions,
    totalClicks: campaign.clicks,
    ctr: campaign.impressions > 0 ? (campaign.clicks / campaign.impressions * 100).toFixed(2) : 0,
    spentTokens: campaign.spentTokens,
    remainingBudget: campaign.budgetTokens - campaign.spentTokens,
    budgetUtilization: ((campaign.spentTokens / campaign.budgetTokens) * 100).toFixed(2),
    impressionsByPlacement,
    impressionsByTier,
    avgCostPerClick: campaign.clicks > 0 ? (campaign.spentTokens / campaign.clicks).toFixed(2) : 0,
    avgCostPerImpression: campaign.impressions > 0 ? (campaign.spentTokens / campaign.impressions * 1000).toFixed(2) : 0,
    status: campaign.status,
  };
  
  return insights;
}

// ============================================================================
// AD PLACEMENT & DELIVERY
// ============================================================================

/**
 * Get ad placements for a user
 * Returns prioritized ads based on targeting and budget
 */
export async function getAdPlacements(
  userId: string,
  placement: AdPlacement,
  userProfile: {
    tier: UserTier;
    country?: string;
    language?: string;
    age?: number;
    gender?: string;
    interests?: string[];
  }
): Promise<AdCampaign[]> {
  // Query active campaigns for this placement
  let query = db.collection('adsCampaigns')
    .where('status', '==', 'active')
    .where('placements', 'array-contains', placement);
  
  const campaignsSnap = await query.get();
  
  if (campaignsSnap.empty) {
    return [];
  }
  
  // Filter campaigns by targeting and budget
  const eligibleCampaigns: AdCampaign[] = [];
  
  for (const doc of campaignsSnap.docs) {
    const campaign = doc.data() as AdCampaign;
    
    // Check if budget is exhausted
    if (campaign.spentTokens >= campaign.budgetTokens) {
      // Auto-pause campaign
      await doc.ref.update({ status: 'expired' });
      continue;
    }
    
    // Check targeting filters
    if (!matchesTargeting(campaign.targeting, userProfile)) {
      continue;
    }
    
    eligibleCampaigns.push(campaign);
  }
  
  // Sort by priority (higher budgets get priority)
  eligibleCampaigns.sort((a, b) => {
    const remainingA = a.budgetTokens - a.spentTokens;
    const remainingB = b.budgetTokens - b.spentTokens;
    return remainingB - remainingA;
  });
  
  // Return top 3 ads
  return eligibleCampaigns.slice(0, 3);
}

/**
 * Check if campaign targeting matches user profile
 */
function matchesTargeting(
  targeting: AdCampaign['targeting'],
  userProfile: any
): boolean {
  // Country filter
  if (targeting.countries && targeting.countries.length > 0) {
    if (!userProfile.country || !targeting.countries.includes(userProfile.country)) {
      return false;
    }
  }
  
  // Language filter
  if (targeting.languages && targeting.languages.length > 0) {
    if (!userProfile.language || !targeting.languages.includes(userProfile.language)) {
      return false;
    }
  }
  
  // Age filter
  if (targeting.ageMin && userProfile.age && userProfile.age < targeting.ageMin) {
    return false;
  }
  if (targeting.ageMax && userProfile.age && userProfile.age > targeting.ageMax) {
    return false;
  }
  
  // Gender filter
  if (targeting.genders && targeting.genders.length > 0) {
    if (!userProfile.gender || !targeting.genders.includes(userProfile.gender)) {
      return false;
    }
  }
  
  // Tier filter
  if (targeting.tiers && targeting.tiers.length > 0) {
    if (!targeting.tiers.includes(userProfile.tier)) {
      return false;
    }
  }
  
  // Interest filter (at least one match)
  if (targeting.interests && targeting.interests.length > 0) {
    if (!userProfile.interests || userProfile.interests.length === 0) {
      return false;
    }
    const hasMatch = targeting.interests.some(interest => 
      userProfile.interests.includes(interest)
    );
    if (!hasMatch) {
      return false;
    }
  }
  
  return true;
}

// ============================================================================
// IMPRESSION & CLICK TRACKING
// ============================================================================

/**
 * Register an ad impression
 */
export async function registerImpression(
  campaignId: string,
  userId: string,
  placement: AdPlacement,
  userTier: UserTier,
  deviceId?: string,
  ipHash?: string
): Promise<{ success: boolean; cost?: number }> {
  // Fraud check: Max impressions per user per day
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  
  const userImpressionsSnap = await db.collection('adsImpressions')
    .where('userId', '==', userId)
    .where('timestamp', '>=', Timestamp.fromDate(todayStart))
    .count()
    .get();
  
  if (userImpressionsSnap.data().count >= ADS_CONFIG.MAX_IMPRESSIONS_PER_USER_PER_DAY) {
    console.warn(`User ${userId} exceeded daily impression limit`);
    return { success: false };
  }
  
  // Get campaign
  const campaignRef = db.collection('adsCampaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();
  
  if (!campaignSnap.exists) {
    throw new Error('Campaign not found');
  }
  
  const campaign = campaignSnap.data() as AdCampaign;
  
  // Check if campaign is active and has budget
  if (campaign.status !== 'active' || campaign.spentTokens >= campaign.budgetTokens) {
    return { success: false };
  }
  
  // Calculate cost for CPM campaigns
  let cost = 0;
  if (campaign.campaignType === 'CPM') {
    cost = (campaign.costPerImpression || ADS_CONFIG.DEFAULT_CPM) / 1000;
  }
  
  // Record impression
  const impressionId = generateId();
  const impression: AdImpression = {
    impressionId,
    campaignId,
    userId,
    deviceId,
    placement,
    userTier,
    timestamp: Timestamp.now(),
    ipHash,
  };
  
  await db.collection('adsImpressions').doc(impressionId).set(impression);
  
  // Update campaign stats
  const updates: any = {
    impressions: increment(1),
    updatedAt: serverTimestamp(),
  };
  
  if (cost > 0) {
    updates.spentTokens = increment(cost);
  }
  
  await campaignRef.update(updates);
  
  // Update placement stats
  await updatePlacementStats(campaignId, placement, 'impression');
  
  return { success: true, cost };
}

/**
 * Register an ad click
 */
export async function registerClick(
  campaignId: string,
  impressionId: string,
  userId: string,
  deviceId?: string,
  ipHash?: string
): Promise<{ success: boolean; cost?: number }> {
  // Fraud check: Max clicks per user per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const userClicksSnap = await db.collection('adsClicks')
    .where('userId', '==', userId)
    .where('timestamp', '>=', Timestamp.fromDate(oneHourAgo))
    .count()
    .get();
  
  if (userClicksSnap.data().count >= ADS_CONFIG.MAX_CLICKS_PER_USER_PER_HOUR) {
    console.warn(`User ${userId} exceeded hourly click limit`);
    return { success: false };
  }
  
  // Check for duplicate click (same impression)
  const existingClickSnap = await db.collection('adsClicks')
    .where('impressionId', '==', impressionId)
    .limit(1)
    .get();
  
  if (!existingClickSnap.empty) {
    console.warn(`Duplicate click detected for impression ${impressionId}`);
    return { success: false };
  }
  
  // Get campaign
  const campaignRef = db.collection('adsCampaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();
  
  if (!campaignSnap.exists) {
    throw new Error('Campaign not found');
  }
  
  const campaign = campaignSnap.data() as AdCampaign;
  
  // Check if campaign is active and has budget
  if (campaign.status !== 'active' || campaign.spentTokens >= campaign.budgetTokens) {
    return { success: false };
  }
  
  // Calculate cost for CPC campaigns
  let cost = 0;
  if (campaign.campaignType === 'CPC') {
    cost = campaign.costPerClick || ADS_CONFIG.DEFAULT_CPC;
  }
  
  // Record click
  const clickId = generateId();
  const click: AdClick = {
    clickId,
    campaignId,
    impressionId,
    userId,
    deviceId,
    timestamp: Timestamp.now(),
    ipHash,
  };
  
  await db.collection('adsClicks').doc(clickId).set(click);
  
  // Update campaign stats
  const updates: any = {
    clicks: increment(1),
    updatedAt: serverTimestamp(),
  };
  
  if (cost > 0) {
    updates.spentTokens = increment(cost);
  }
  
  await campaignRef.update(updates);
  
  // Update CTR
  const newClicks = campaign.clicks + 1;
  const newCTR = campaign.impressions > 0 ? (newClicks / campaign.impressions) * 100 : 0;
  await campaignRef.update({ ctr: newCTR });
  
  return { success: true, cost };
}

// ============================================================================
// BUDGET MANAGEMENT
// ============================================================================

/**
 * Record budget allocation for a brand
 */
async function recordBudgetAllocation(
  brandId: string,
  campaignId: string,
  tokens: number
): Promise<void> {
  const budgetRef = db.collection('adsBudgets').doc(brandId);
  const budgetSnap = await budgetRef.get();
  
  if (!budgetSnap.exists) {
    // Create new budget record
    await budgetRef.set({
      brandId,
      totalAllocated: tokens,
      totalSpent: 0,
      campaigns: [campaignId],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    // Update existing budget
    await budgetRef.update({
      totalAllocated: increment(tokens),
      campaigns: FieldValue.arrayUnion(campaignId),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Update placement stats
 */
async function updatePlacementStats(
  campaignId: string,
  placement: AdPlacement,
  eventType: 'impression' | 'click'
): Promise<void> {
  const statsRef = db.collection('adsPlacementStats').doc(`${campaignId}_${placement}`);
  const statsSnap = await statsRef.get();
  
  if (!statsSnap.exists) {
    await statsRef.set({
      campaignId,
      placement,
      impressions: eventType === 'impression' ? 1 : 0,
      clicks: eventType === 'click' ? 1 : 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const updates: any = {
      updatedAt: serverTimestamp(),
    };
    if (eventType === 'impression') {
      updates.impressions = increment(1);
    } else {
      updates.clicks = increment(1);
    }
    await statsRef.update(updates);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createCampaign,
  updateCampaign,
  getCampaignInsights,
  getAdPlacements,
  registerImpression,
  registerClick,
  ADS_CONFIG,
};