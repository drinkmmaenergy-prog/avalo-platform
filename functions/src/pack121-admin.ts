/**
 * PACK 121 — Avalo Global Ads Network
 * Admin Functions for Ad Campaign Management
 * 
 * Handles:
 * - Campaign creation and management
 * - Advertiser verification
 * - Safety enforcement
 * - Budget management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  AdCampaign,
  Advertiser,
  AdSafetyViolation,
  CreateAdCampaignRequest,
  CreateAdCampaignResponse,
  UpdateAdCampaignRequest,
  UpdateAdCampaignResponse,
  ListAdCampaignsRequest,
  ListAdCampaignsResponse,
  AdCampaignStatus,
  ForbiddenCategory,
} from './pack121-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user is an admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  const adminDoc = await db.collection('admins').doc(userId).get();
  return adminDoc.exists;
}

/**
 * Check if user is verified advertiser
 */
async function isVerifiedAdvertiser(userId: string, advertiserId: string): Promise<boolean> {
  const advertiserDoc = await db.collection('advertisers').doc(advertiserId).get();
  
  if (!advertiserDoc.exists) {
    return false;
  }
  
  const advertiser = advertiserDoc.data() as Advertiser;
  return advertiser.kycStatus === 'VERIFIED' && advertiser.active;
}

/**
 * Validate ad content against forbidden categories
 */
async function validateAdContent(
  title: string,
  description: string,
  mediaRef: string
): Promise<{ valid: boolean; violations: string[] }> {
  const violations: string[] = [];
  
  // Text-based checks (simple keyword matching)
  const forbiddenKeywords = {
    NSFW: ['sex', 'adult', 'xxx', 'porn', 'nude', 'naked'],
    DATING: ['hookup', 'dating', 'match', 'singles', 'romance'],
    GAMBLING: ['casino', 'bet', 'gambling', 'poker', 'lottery', 'jackpot'],
    CRYPTO_TRADING: ['crypto', 'bitcoin', 'trading', 'forex', 'investment'],
    PAYDAY_LOANS: ['payday', 'loan', 'cash advance', 'quick money'],
    DRUGS: ['weed', 'cannabis', 'marijuana', 'drugs', 'prescription'],
  };
  
  const combinedText = `${title} ${description}`.toLowerCase();
  
  for (const [category, keywords] of Object.entries(forbiddenKeywords)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) {
        violations.push(category);
        break;
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations: Array.from(new Set(violations)),
  };
}

/**
 * Calculate CPM cost for an impression
 */
function calculateImpressionCost(cpmBidTokens: number): number {
  // CPM = cost per 1000 impressions
  // Cost per impression = CPM / 1000
  return cpmBidTokens / 1000;
}

// ============================================================================
// Campaign Management Functions
// ============================================================================

/**
 * Create a new ad campaign
 * Admin or verified advertiser only
 */
export const createAdCampaign = onCall<CreateAdCampaignRequest, Promise<CreateAdCampaignResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const data = request.data;
    
    // Verify user is admin or verified advertiser
    const isAdminUser = await isAdmin(userId);
    const isVerifiedAdv = await isVerifiedAdvertiser(userId, data.advertiserId);
    
    if (!isAdminUser && !isVerifiedAdv) {
      throw new HttpsError(
        'permission-denied',
        'Only admins or verified advertisers can create campaigns'
      );
    }
    
    // Validate required fields
    if (!data.title || !data.description || !data.mediaRef || !data.ctaText) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (!data.targeting || !data.placements || data.placements.length === 0) {
      throw new HttpsError('invalid-argument', 'Targeting and placements are required');
    }
    
    if (data.budgetTokens <= 0 || data.cpmBidTokens <= 0) {
      throw new HttpsError('invalid-argument', 'Budget and CPM bid must be positive');
    }
    
    // Validate dates
    const startAt = Timestamp.fromDate(new Date(data.startAt));
    const endAt = Timestamp.fromDate(new Date(data.endAt));
    
    if (endAt.toMillis() <= startAt.toMillis()) {
      throw new HttpsError('invalid-argument', 'End date must be after start date');
    }
    
    // Validate ad content
    const contentValidation = await validateAdContent(
      data.title,
      data.description,
      data.mediaRef
    );
    
    if (!contentValidation.valid) {
      throw new HttpsError(
        'failed-precondition',
        `Ad violates policies: ${contentValidation.violations.join(', ')}`
      );
    }
    
    // Check advertiser has sufficient token balance
    const advertiserDoc = await db.collection('advertisers').doc(data.advertiserId).get();
    const advertiser = advertiserDoc.data() as Advertiser;
    
    if (advertiser.tokenBalance < data.budgetTokens) {
      throw new HttpsError(
        'failed-precondition',
        'Insufficient token balance for campaign budget'
      );
    }
    
    // Create campaign
    const adId = `ad_${generateId()}`;
    const now = Timestamp.now();
    
    const campaign: AdCampaign = {
      adId,
      advertiserId: data.advertiserId,
      title: data.title,
      description: data.description,
      format: data.format,
      mediaRef: data.mediaRef,
      thumbnailRef: data.thumbnailRef,
      destination: data.destination,
      destinationUrl: data.destinationUrl,
      destinationInAppRef: data.destinationInAppRef,
      ctaText: data.ctaText,
      targeting: data.targeting,
      placements: data.placements,
      budgetTokens: data.budgetTokens,
      spentTokens: 0,
      cpmBidTokens: data.cpmBidTokens,
      startAt,
      endAt,
      status: 'SCHEDULED' as AdCampaignStatus,
      safetyStatus: 'APPROVED', // Auto-approved if passes validation
      safetyReviewedBy: userId,
      safetyReviewedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };
    
    // Save campaign
    await db.collection('ad_campaigns').doc(adId).set(campaign);
    
    // Reserve tokens from advertiser balance
    await db.collection('advertisers').doc(data.advertiserId).update({
      tokenBalance: increment(-data.budgetTokens),
      updatedAt: serverTimestamp(),
    });
    
    // Log action
    await db.collection('business_audit_log').add({
      targetType: 'AD_CAMPAIGN',
      targetId: adId,
      action: 'CREATE',
      performedBy: userId,
      performedAt: serverTimestamp(),
      details: {
        title: data.title,
        budgetTokens: data.budgetTokens,
        advertiserId: data.advertiserId,
      },
    });
    
    return { success: true, adId };
  }
);

/**
 * Update ad campaign
 * Admin or campaign owner only
 */
export const updateAdCampaign = onCall<UpdateAdCampaignRequest, Promise<UpdateAdCampaignResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { adId, advertiserId, updates } = request.data;
    
    // Verify user is admin or campaign owner
    const isAdminUser = await isAdmin(userId);
    const isVerifiedAdv = await isVerifiedAdvertiser(userId, advertiserId);
    
    if (!isAdminUser && !isVerifiedAdv) {
      throw new HttpsError('permission-denied', 'Not authorized to update this campaign');
    }
    
    // Get existing campaign
    const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
    
    if (!campaignDoc.exists) {
      throw new HttpsError('not-found', 'Campaign not found');
    }
    
    const campaign = campaignDoc.data() as AdCampaign;
    
    // Verify ownership
    if (campaign.advertiserId !== advertiserId && !isAdminUser) {
      throw new HttpsError('permission-denied', 'Not authorized to update this campaign');
    }
    
    // Build update object
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.targeting) updateData.targeting = updates.targeting;
    if (updates.placements) updateData.placements = updates.placements;
    if (updates.status) updateData.status = updates.status;
    
    // Handle budget increase
    if (updates.budgetTokens && updates.budgetTokens > campaign.budgetTokens) {
      const additionalTokens = updates.budgetTokens - campaign.budgetTokens;
      
      // Check advertiser balance
      const advertiserDoc = await db.collection('advertisers').doc(advertiserId).get();
      const advertiser = advertiserDoc.data() as Advertiser;
      
      if (advertiser.tokenBalance < additionalTokens) {
        throw new HttpsError(
          'failed-precondition',
          'Insufficient token balance for budget increase'
        );
      }
      
      updateData.budgetTokens = updates.budgetTokens;
      
      // Reserve additional tokens
      await db.collection('advertisers').doc(advertiserId).update({
        tokenBalance: increment(-additionalTokens),
        updatedAt: serverTimestamp(),
      });
    }
    
    // Handle CPM bid update
    if (updates.cpmBidTokens) {
      updateData.cpmBidTokens = updates.cpmBidTokens;
    }
    
    // Update campaign
    await db.collection('ad_campaigns').doc(adId).update(updateData);
    
    // Log action
    await db.collection('business_audit_log').add({
      targetType: 'AD_CAMPAIGN',
      targetId: adId,
      action: 'UPDATE',
      performedBy: userId,
      performedAt: serverTimestamp(),
      details: { updates },
    });
    
    return { success: true };
  }
);

/**
 * Pause ad campaign
 */
export const pauseAdCampaign = onCall<{ adId: string; advertiserId: string }, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { adId, advertiserId } = request.data;
    
    // Verify authorization
    const isAdminUser = await isAdmin(userId);
    const isVerifiedAdv = await isVerifiedAdvertiser(userId, advertiserId);
    
    if (!isAdminUser && !isVerifiedAdv) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }
    
    await db.collection('ad_campaigns').doc(adId).update({
      status: 'PAUSED',
      updatedAt: serverTimestamp(),
    });
    
    return { success: true };
  }
);

/**
 * List ad campaigns
 */
export const listAdCampaigns = onCall<ListAdCampaignsRequest, Promise<ListAdCampaignsResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { advertiserId, status, limit = 20, offset = 0 } = request.data;
    
    // Verify authorization
    const isAdminUser = await isAdmin(userId);
    const isVerifiedAdv = await isVerifiedAdvertiser(userId, advertiserId);
    
    if (!isAdminUser && !isVerifiedAdv) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }
    
    // Build query
    let query = db.collection('ad_campaigns')
      .where('advertiserId', '==', advertiserId);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // Get total count
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;
    
    // Get paginated results
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();
    
    const campaigns = snapshot.docs.map(doc => doc.data() as AdCampaign);
    
    return {
      success: true,
      campaigns,
      total,
    };
  }
);

// ============================================================================
// Advertiser Management Functions
// ============================================================================

/**
 * Create advertiser account
 * Admin only
 */
export const createAdvertiser = onCall<{
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone?: string;
  brandCategory: string;
  websiteUrl: string;
}, Promise<{ success: boolean; advertiserId?: string }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isAdmin(userId))) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const data = request.data;
    const advertiserId = `adv_${generateId()}`;
    const now = Timestamp.now();
    
    const advertiser: Advertiser = {
      advertiserId,
      businessName: data.businessName,
      legalName: data.legalName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      kycStatus: 'PENDING',
      brandCategory: data.brandCategory,
      websiteUrl: data.websiteUrl,
      tokenBalance: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection('advertisers').doc(advertiserId).set(advertiser);
    
    return { success: true, advertiserId };
  }
);

/**
 * Verify advertiser KYC
 * Admin only
 */
export const verifyAdvertiser = onCall<{
  advertiserId: string;
  approved: boolean;
}, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isAdmin(userId))) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { advertiserId, approved } = request.data;
    
    await db.collection('advertisers').doc(advertiserId).update({
      kycStatus: approved ? 'VERIFIED' : 'REJECTED',
      verifiedBy: userId,
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    return { success: true };
  }
);

/**
 * Add tokens to advertiser account
 * Admin only - tokens are purchased separately
 */
export const addAdvertiserTokens = onCall<{
  advertiserId: string;
  tokens: number;
}, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isAdmin(userId))) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { advertiserId, tokens } = request.data;
    
    if (tokens <= 0) {
      throw new HttpsError('invalid-argument', 'Tokens must be positive');
    }
    
    await db.collection('advertisers').doc(advertiserId).update({
      tokenBalance: increment(tokens),
      updatedAt: serverTimestamp(),
    });
    
    // Log transaction
    await db.collection('business_audit_log').add({
      targetType: 'ADVERTISER',
      targetId: advertiserId,
      action: 'ADD_TOKENS',
      performedBy: userId,
      performedAt: serverTimestamp(),
      details: { tokens },
    });
    
    return { success: true };
  }
);