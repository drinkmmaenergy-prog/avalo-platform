/**
 * PACK 120 — Multi-Sided Brand Partnerships & Sponsored Challenges
 * Backend Functions for Brand Campaign Operations
 * 
 * COMPLIANCE RULES:
 * - Zero token rewards or economic incentives
 * - No discovery ranking boost
 * - No monetization advantages
 * - Pure brand visibility collaboration only
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  BrandCampaign,
  CampaignSubmission,
  CreateBrandCampaignRequest,
  CreateBrandCampaignResponse,
  SubmitChallengeContentRequest,
  SubmitChallengeContentResponse,
  ListBrandCampaignsRequest,
  ListBrandCampaignsResponse,
  CampaignStatus,
  ApproveSubmissionRequest,
  ApproveSubmissionResponse,
  RejectSubmissionRequest,
  RejectSubmissionResponse,
  GetCampaignPerformanceRequest,
  GetCampaignPerformanceResponse,
  CampaignPerformanceStats,
} from './pack120-types';

const db = admin.firestore();

// ============================================================================
// BRAND ADMIN FUNCTIONS
// ============================================================================

/**
 * Create a new brand campaign
 * Admin/Brand Panel only
 */
export const createBrandCampaign = functions.https.onCall(
  async (
    data: CreateBrandCampaignRequest,
    context
  ): Promise<CreateBrandCampaignResponse> => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    try {
      // Validate required fields
      const {
        brandName,
        brandLogoRef,
        campaignTitle,
        campaignDescription,
        theme,
        startDate,
        endDate,
        contentRules,
        mediaType,
        moderationMode,
      } = data;

      if (!campaignTitle || !campaignDescription || !startDate || !endDate) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required fields'
        );
      }

      // Validate dates
      const start = admin.firestore.Timestamp.fromDate(new Date(startDate));
      const end = admin.firestore.Timestamp.fromDate(new Date(endDate));

      if (end.toMillis() <= start.toMillis()) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'End date must be after start date'
        );
      }

      // CRITICAL: NSFW always false
      const nsfwAllowed = false;

      // Create campaign document
      const campaignRef = db.collection('brand_campaigns').doc();
      const now = admin.firestore.Timestamp.now();

      const campaign: BrandCampaign = {
        campaignId: campaignRef.id,
        brandName: brandName || 'Unknown Brand',
        brandLogoRef: brandLogoRef || '',
        campaignTitle,
        campaignDescription,
        theme,
        startAt: start,
        endAt: end,
        contentRules: contentRules || [],
        mediaType: mediaType || 'STORY',
        nsfwAllowed, // Always false
        moderationMode: moderationMode || 'AUTO',
        status: 'SCHEDULED',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      };

      await campaignRef.set(campaign);

      console.log(`[PACK120] Campaign created: ${campaignRef.id}`);

      return {
        success: true,
        campaignId: campaignRef.id,
      };
    } catch (error: any) {
      console.error('[PACK120] Error creating campaign:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update an existing brand campaign
 * Admin/Brand Panel only
 */
export const updateBrandCampaign = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { campaignId, updates } = data;

    if (!campaignId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Campaign ID is required'
      );
    }

    try {
      const campaignRef = db.collection('brand_campaigns').doc(campaignId);
      const campaignDoc = await campaignRef.get();

      if (!campaignDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Campaign not found'
        );
      }

      // CRITICAL: Never allow nsfwAllowed to be set to true
      if (updates.nsfwAllowed === true) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'NSFW content not allowed in brand campaigns'
        );
      }

      // Prevent modification of economic fields (none should exist)
      const allowedFields = [
        'campaignTitle',
        'campaignDescription',
        'contentRules',
        'status',
        'moderationMode',
      ];

      const filteredUpdates: any = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }

      filteredUpdates.updatedAt = admin.firestore.Timestamp.now();

      await campaignRef.update(filteredUpdates);

      return { success: true };
    } catch (error: any) {
      console.error('[PACK120] Error updating campaign:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Cancel a brand campaign
 * Admin/Brand Panel only
 */
export const cancelBrandCampaign = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { campaignId } = data;

    if (!campaignId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Campaign ID is required'
      );
    }

    try {
      const campaignRef = db.collection('brand_campaigns').doc(campaignId);
      await campaignRef.update({
        status: 'CANCELLED',
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('[PACK120] Error cancelling campaign:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// PUBLIC USER FUNCTIONS
// ============================================================================

/**
 * List available brand campaigns
 * Public endpoint
 */
export const listBrandCampaigns = functions.https.onCall(
  async (
    data: ListBrandCampaignsRequest,
    context
  ): Promise<ListBrandCampaignsResponse> => {
    try {
      const { status, theme, limit = 20, offset = 0 } = data;

      let query: any = db.collection('brand_campaigns');

      // Filter by status (default to ACTIVE)
      const filterStatus: CampaignStatus = status || 'ACTIVE';
      query = query.where('status', '==', filterStatus);

      // Filter by theme if provided
      if (theme) {
        query = query.where('theme', '==', theme);
      }

      // Order by start date (newest first)
      query = query.orderBy('startAt', 'desc');

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const snapshot = await query.get();

      const campaigns: BrandCampaign[] = [];
      snapshot.forEach((doc: any) => {
        campaigns.push(doc.data() as BrandCampaign);
      });

      // Get total count for pagination
      const countQuery = db
        .collection('brand_campaigns')
        .where('status', '==', filterStatus);
      
      const countSnapshot = await countQuery.count().get();
      const total = countSnapshot.data().count;

      return {
        success: true,
        campaigns,
        total,
      };
    } catch (error: any) {
      console.error('[PACK120] Error listing campaigns:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SUBMISSION FUNCTIONS
// ============================================================================

/**
 * Submit content to a brand challenge
 * User endpoint
 */
export const submitChallengeContent = functions.https.onCall(
  async (
    data: SubmitChallengeContentRequest,
    context
  ): Promise<SubmitChallengeContentResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { campaignId, contentId } = data;

    if (!campaignId || !contentId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Campaign ID and content ID are required'
      );
    }

    try {
      // Verify campaign exists and is active
      const campaignDoc = await db
        .collection('brand_campaigns')
        .doc(campaignId)
        .get();

      if (!campaignDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Campaign not found'
        );
      }

      const campaign = campaignDoc.data() as BrandCampaign;

      if (campaign.status !== 'ACTIVE') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Campaign is not active'
        );
      }

      // Check if campaign is within date range
      const now = admin.firestore.Timestamp.now();
      if (now.toMillis() < campaign.startAt.toMillis()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Campaign has not started yet'
        );
      }
      if (now.toMillis() > campaign.endAt.toMillis()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Campaign has ended'
        );
      }

      // Verify content exists and belongs to user
      const contentDoc = await db.collection('stories').doc(contentId).get();

      if (!contentDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Content not found'
        );
      }

      const content = contentDoc.data();
      if (content?.userId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Content does not belong to user'
        );
      }

      // Check if already submitted
      const existingSubmission = await db
        .collection('brand_campaign_submissions')
        .where('campaignId', '==', campaignId)
        .where('contentId', '==', contentId)
        .limit(1)
        .get();

      if (!existingSubmission.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Content already submitted to this campaign'
        );
      }

      // Create submission
      const submissionRef = db.collection('brand_campaign_submissions').doc();

      const submission: CampaignSubmission = {
        submissionId: submissionRef.id,
        campaignId,
        userId,
        contentId,
        createdAt: now,
        status: campaign.moderationMode === 'AUTO' ? 'APPROVED' : 'PENDING',
      };

      await submissionRef.set(submission);

      console.log(
        `[PACK120] Submission created: ${submissionRef.id} for campaign ${campaignId}`
      );

      return {
        success: true,
        submissionId: submissionRef.id,
      };
    } catch (error: any) {
      console.error('[PACK120] Error submitting content:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Approve a campaign submission
 * Admin/Brand Panel only
 */
export const approveChallengeSubmission = functions.https.onCall(
  async (
    data: ApproveSubmissionRequest,
    context
  ): Promise<ApproveSubmissionResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { submissionId, isWinner, awardId } = data;

    if (!submissionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Submission ID is required'
      );
    }

    try {
      const submissionRef = db
        .collection('brand_campaign_submissions')
        .doc(submissionId);

      const updates: any = {
        status: isWinner ? 'WINNER' : 'APPROVED',
        moderatedAt: admin.firestore.Timestamp.now(),
        moderatedBy: context.auth.uid,
      };

      await submissionRef.update(updates);

      // If winner and awardId provided, create award winner record
      if (isWinner && awardId) {
        const submissionDoc = await submissionRef.get();
        const submission = submissionDoc.data() as CampaignSubmission;

        const winnerRef = db.collection('campaign_award_winners').doc();
        await winnerRef.set({
          winnerId: winnerRef.id,
          campaignId: submission.campaignId,
          awardId,
          userId: submission.userId,
          submissionId,
          selectedAt: admin.firestore.Timestamp.now(),
          selectedBy: context.auth.uid,
          deliveryStatus: 'PENDING',
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('[PACK120] Error approving submission:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Reject a campaign submission
 * Admin/Brand Panel only
 */
export const rejectChallengeSubmission = functions.https.onCall(
  async (
    data: RejectSubmissionRequest,
    context
  ): Promise<RejectSubmissionResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { submissionId, reason } = data;

    if (!submissionId || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Submission ID and reason are required'
      );
    }

    try {
      await db
        .collection('brand_campaign_submissions')
        .doc(submissionId)
        .update({
          status: 'REJECTED',
          rejectionReason: reason,
          moderatedAt: admin.firestore.Timestamp.now(),
          moderatedBy: context.auth.uid,
        });

      return { success: true };
    } catch (error: any) {
      console.error('[PACK120] Error rejecting submission:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Get campaign performance statistics
 * Admin/Brand Panel only
 */
export const getCampaignPerformance = functions.https.onCall(
  async (
    data: GetCampaignPerformanceRequest,
    context
  ): Promise<GetCampaignPerformanceResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { campaignId } = data;

    if (!campaignId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Campaign ID is required'
      );
    }

    try {
      // Get all submissions for this campaign
      const submissionsSnapshot = await db
        .collection('brand_campaign_submissions')
        .where('campaignId', '==', campaignId)
        .get();

      let totalSubmissions = 0;
      let approvedSubmissions = 0;
      let rejectedSubmissions = 0;
      let winnerCount = 0;
      const regionBreakdown: Record<string, number> = {};

      for (const doc of submissionsSnapshot.docs) {
        const submission = doc.data() as CampaignSubmission;
        totalSubmissions++;

        if (submission.status === 'APPROVED') approvedSubmissions++;
        if (submission.status === 'REJECTED') rejectedSubmissions++;
        if (submission.status === 'WINNER') winnerCount++;

        // Aggregate by region if available
        const region = submission.metadata?.userRegion || 'UNKNOWN';
        regionBreakdown[region] = (regionBreakdown[region] || 0) + 1;
      }

      // Calculate impressions (placeholder - would need actual view tracking)
      const totalImpressions = totalSubmissions * 100; // Estimate
      const totalReach = totalSubmissions * 50; // Estimate

      const stats: CampaignPerformanceStats = {
        campaignId,
        totalImpressions,
        totalReach,
        totalSubmissions,
        approvedSubmissions,
        rejectedSubmissions,
        winnerCount,
        regionBreakdown,
        participationRate: totalReach > 0 ? totalSubmissions / totalReach : 0,
        aggregatedAt: admin.firestore.Timestamp.now(),
      };

      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      console.error('[PACK120] Error getting campaign performance:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

console.log('✅ PACK 120 - Brand Campaigns Functions Loaded');