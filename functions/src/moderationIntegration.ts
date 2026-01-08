/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * Integration Helper for Upload Flows
 */

import { moderateContent, getModerationStatus } from './aiModerationEngine';
import {
  ModerationContext,
  ModeratedContentType,
  ModerationDecision,
} from '../../shared/types/contentModeration';
import { getFirestore } from 'firebase-admin/firestore';
import { logEvent } from './observability';

const db = getFirestore();

/**
 * Hook to call after any media upload but before publishing
 * Returns moderation result which determines if content can be published
 */
export async function moderateUploadedContent(params: {
  contentId: string;
  userId: string;
  mediaUrl: string;
  contentType: ModeratedContentType;
  associatedId?: string;
  metadata?: Record<string, any>;
}): Promise<{
  allowed: boolean;
  decision: ModerationDecision;
  reason: string;
  requiresReview: boolean;
}> {
  try {
    // Get user's adult verification status
    const userDoc = await db.collection('users').doc(params.userId).get();
    const userData = userDoc.data();
    const isAdultVerified = userData?.verification?.ageVerified === true || false;

    // Build moderation context
    const context: ModerationContext = {
      contentType: params.contentType,
      userId: params.userId,
      isAdultVerified,
      associatedId: params.associatedId,
      metadata: params.metadata,
    };

    // Run moderation
    const result = await moderateContent(
      params.contentId,
      params.userId,
      params.mediaUrl,
      context
    );

    // Determine if content is allowed
    const allowed = result.decision === 'ALLOW';
    const requiresReview = result.decision === 'REVIEW_REQUIRED';

    await logEvent({
      level: 'INFO',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'INTEGRATION',
      message: 'Content moderated in upload flow',
      details: {
        extra: {
          contentId: params.contentId,
          contentType: params.contentType,
          decision: result.decision,
          allowed,
          requiresReview,
        },
      },
    });

    return {
      allowed,
      decision: result.decision,
      reason: result.reason,
      requiresReview,
    };
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'INTEGRATION',
      message: 'Moderation integration failed',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
          contentId: params.contentId,
        },
      },
    });

    // On error, default to requiring review
    return {
      allowed: false,
      decision: 'REVIEW_REQUIRED',
      reason: 'Moderation system error - content pending review',
      requiresReview: true,
    };
  }
}

/**
 * Check if content has been moderated and approved
 * Used to verify content before displaying
 */
export async function isContentApproved(contentId: string): Promise<boolean> {
  try {
    const status = await getModerationStatus(contentId);
    
    if (!status) {
      // No moderation record = not yet processed
      return false;
    }

    return status.decision === 'ALLOW';
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'INTEGRATION',
      message: 'Failed to check content approval status',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
          contentId,
        },
      },
    });

    // On error, assume not approved (safe default)
    return false;
  }
}

/**
 * Get moderation status for display in UI
 */
export async function getModerationStatusForUI(contentId: string): Promise<{
  status: 'pending' | 'approved' | 'blocked' | 'review';
  reason?: string;
}> {
  try {
    const moderationStatus = await getModerationStatus(contentId);
    
    if (!moderationStatus) {
      return { status: 'pending' };
    }

    switch (moderationStatus.decision) {
      case 'ALLOW':
        return { status: 'approved' };
      case 'AUTO_BLOCK':
        return { 
          status: 'blocked',
          reason: moderationStatus.reason,
        };
      case 'REVIEW_REQUIRED':
        return { 
          status: 'review',
          reason: moderationStatus.reason,
        };
      case 'RESTRICT':
        return {
          status: 'approved', // Still approved but with limited visibility
          reason: 'Content has limited visibility',
        };
      default:
        return { status: 'pending' };
    }
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'INTEGRATION',
      message: 'Failed to get moderation status for UI',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
          contentId,
        },
      },
    });

    return { status: 'pending' };
  }
}

/**
 * Batch moderate multiple content items
 * Useful for galleries/carousels
 */
export async function moderateBatchContent(items: Array<{
  contentId: string;
  userId: string;
  mediaUrl: string;
  contentType: ModeratedContentType;
  associatedId?: string;
  metadata?: Record<string, any>;
}>): Promise<Array<{
  contentId: string;
  allowed: boolean;
  decision: ModerationDecision;
  reason: string;
  requiresReview: boolean;
}>> {
  const results = await Promise.all(
    items.map(item => moderateUploadedContent(item))
  );

  return items.map((item, index) => ({
    contentId: item.contentId,
    ...results[index],
  }));
}