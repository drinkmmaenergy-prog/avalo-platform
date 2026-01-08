/**
 * PACK 151 - Sponsorship Marketplace Cloud Functions
 * Ethical brand-creator collaboration system
 */

import { db, admin, increment } from '../init';
import * as functions from 'firebase-functions';
import {
  SponsorshipOffer,
  SponsorshipContract,
  SponsorshipDeliverable,
  SponsorshipReview,
  SponsorshipApplication,
  SponsorshipAnalytics,
  CreateSponsorshipOfferInput,
  ApplyToSponsorshipInput,
  SubmitDeliverableInput,
  ReviewDeliverableInput,
  RateSponsorshipInput,
  SponsorshipModeration,
  SponsorshipStatus
} from './types';
import { SponsorshipSafetyGuard, createSafetyCheck } from './safety';

export const createSponsorship = functions.https.onCall(async (data: CreateSponsorshipOfferInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.brandId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only create sponsorships for own brand');
  }

  const safetyCheck = SponsorshipSafetyGuard.checkOfferDescription(data.description);
  if (!safetyCheck.passed) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Sponsorship offer contains prohibited content',
      { violations: safetyCheck.violations }
    );
  }

  const brandDoc = await db.collection('users').doc(data.brandId).get();
  if (!brandDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Brand profile not found');
  }

  const brandData = brandDoc.data()!;
  const brandName = brandData.displayName || brandData.username || 'Unknown Brand';

  const offerId = db.collection('sponsorship_offers').doc().id;

  const offer: SponsorshipOffer = {
    id: offerId,
    brandId: data.brandId,
    brandName,
    brandLogo: brandData.photoURL,
    title: data.title,
    description: data.description,
    dealType: data.dealType,
    status: 'open',
    requirements: data.requirements,
    compensation: {
      ...data.compensation,
      splitRatio: data.compensation.useTokens 
        ? { creator: 65, platform: 35 }
        : undefined
    },
    maxCreators: data.maxCreators,
    currentCreators: 0,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: data.expiresAt,
      isActive: true
    },
    safetyFlags: {
      hasRomanticContent: false,
      hasNSFWContent: false,
      hasExternalLinks: false,
      isVerified: true
    }
  };

  await db.collection('sponsorship_offers').doc(offerId).set(offer);

  await db.collection('users').doc(data.brandId).update({
    'stats.sponsorshipsCreated': increment(1)
  });

  return { success: true, offerId };
});

export const applyToSponsorship = functions.https.onCall(async (data: ApplyToSponsorshipInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.creatorId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only apply as yourself');
  }

  const offerDoc = await db.collection('sponsorship_offers').doc(data.offerId).get();
  if (!offerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Sponsorship offer not found');
  }

  const offer = offerDoc.data() as SponsorshipOffer;

  if (offer.status !== 'open') {
    throw new functions.https.HttpsError('failed-precondition', 'Sponsorship is not accepting applications');
  }

  if (offer.currentCreators >= offer.maxCreators) {
    throw new functions.https.HttpsError('failed-precondition', 'Sponsorship has reached max creators');
  }

  const existingApplication = await db.collection('sponsorship_applications')
    .where('offerId', '==', data.offerId)
    .where('creatorId', '==', data.creatorId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existingApplication.empty) {
    throw new functions.https.HttpsError('already-exists', 'Application already submitted');
  }

  const creatorDoc = await db.collection('users').doc(data.creatorId).get();
  const creatorData = creatorDoc.data()!;

  const applicationId = db.collection('sponsorship_applications').doc().id;

  const application: SponsorshipApplication = {
    id: applicationId,
    offerId: data.offerId,
    creatorId: data.creatorId,
    brandId: offer.brandId,
    status: 'pending',
    portfolio: {
      recentWork: data.portfolioItems,
      followerCount: creatorData.followers?.count || 0,
      engagementRate: creatorData.stats?.engagementRate || 0,
      categories: creatorData.profile?.categories || []
    },
    message: data.message,
    metadata: {
      appliedAt: new Date()
    }
  };

  await db.collection('sponsorship_applications').doc(applicationId).set(application);

  await db.collection('users').doc(data.creatorId).update({
    'stats.sponsorshipApplications': increment(1)
  });

  return { success: true, applicationId };
});

export const approveSponsorshipCreator = functions.https.onCall(async (data: {
  applicationId: string;
  approved: boolean;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const applicationDoc = await db.collection('sponsorship_applications').doc(data.applicationId).get();
  if (!applicationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }

  const application = applicationDoc.data() as SponsorshipApplication;

  if (application.brandId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Only brand can approve applications');
  }

  if (application.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Application already processed');
  }

  const offerDoc = await db.collection('sponsorship_offers').doc(application.offerId).get();
  const offer = offerDoc.data() as SponsorshipOffer;

  if (!data.approved) {
    await db.collection('sponsorship_applications').doc(data.applicationId).update({
      status: 'rejected',
      'metadata.reviewedAt': new Date(),
      'metadata.reviewedBy': userId
    });

    return { success: true, approved: false };
  }

  if (offer.currentCreators >= offer.maxCreators) {
    throw new functions.https.HttpsError('failed-precondition', 'Sponsorship has reached max creators');
  }

  const contractId = db.collection('sponsorship_contracts').doc().id;

  const deliverables = Array.from({ length: offer.requirements.deliverableCount }, (_, i) => ({
    type: offer.requirements.deliverableTypes[i % offer.requirements.deliverableTypes.length],
    description: `Deliverable ${i + 1} for ${offer.title}`,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'pending' as const
  }));

  const contract: SponsorshipContract = {
    id: contractId,
    offerId: application.offerId,
    brandId: application.brandId,
    creatorId: application.creatorId,
    status: 'in_progress',
    deliverables,
    compensation: offer.compensation,
    agreement: {
      acceptedAt: new Date(),
      termsVersion: '1.0',
      deliverableCount: offer.requirements.deliverableCount,
      timeline: offer.requirements.timeline
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: new Date()
    }
  };

  await db.collection('sponsorship_contracts').doc(contractId).set(contract);

  if (offer.compensation.useTokens) {
    const escrowData = {
      contractId,
      amount: offer.compensation.amount,
      currency: offer.compensation.currency,
      brandId: offer.brandId,
      creatorId: application.creatorId,
      status: 'held',
      createdAt: new Date()
    };

    const escrowRef = await db.collection('token_escrow').add(escrowData);
    
    await db.collection('sponsorship_contracts').doc(contractId).update({
      'compensation.escrowId': escrowRef.id
    });
  }

  await db.collection('sponsorship_applications').doc(data.applicationId).update({
    status: 'approved',
    'metadata.reviewedAt': new Date(),
    'metadata.reviewedBy': userId
  });

  await db.collection('sponsorship_offers').doc(application.offerId).update({
    currentCreators: increment(1),
    'metadata.updatedAt': new Date()
  });

  return { success: true, approved: true, contractId };
});

export const submitDeliverable = functions.https.onCall(async (data: SubmitDeliverableInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const contractDoc = await db.collection('sponsorship_contracts').doc(data.contractId).get();
  if (!contractDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contract not found');
  }

  const contract = contractDoc.data() as SponsorshipContract;

  if (contract.creatorId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Only creator can submit deliverables');
  }

  const contentDoc = await db.collection('posts').doc(data.content.contentId).get();
  if (!contentDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Content not found');
  }

  const contentData = contentDoc.data()!;

  const safetyValidation = SponsorshipSafetyGuard.validateDeliverableContent({
    caption: contentData.caption,
    description: contentData.description
  });

  if (!safetyValidation.passed) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Content contains prohibited material for sponsored content',
      { violations: safetyValidation.violations }
    );
  }

  const deliverableId = db.collection('sponsorship_deliverables').doc().id;

  const deliverable: SponsorshipDeliverable = {
    id: deliverableId,
    contractId: data.contractId,
    offerId: contract.offerId,
    creatorId: contract.creatorId,
    brandId: contract.brandId,
    type: data.content.contentType as any,
    description: `Deliverable for contract ${data.contractId}`,
    content: {
      contentId: data.content.contentId,
      contentType: data.content.contentType,
      caption: data.content.caption,
      url: contentData.mediaUrl || contentData.url
    },
    status: 'submitted',
    review: {
      submittedAt: new Date()
    },
    safetyCheck: {
      ...safetyValidation.flags,
      passed: safetyValidation.passed,
      checkedAt: new Date()
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  };

  await db.collection('sponsorship_deliverables').doc(deliverableId).set(deliverable);

  await db.collection('posts').doc(data.content.contentId).update({
    isSponsored: true,
    sponsorshipId: contract.offerId,
    'metadata.sponsoredLabel': true
  });

  const deliverableIndex = contract.deliverables.findIndex(d => d.status === 'pending');
  if (deliverableIndex !== -1) {
    contract.deliverables[deliverableIndex].status = 'submitted';
    await db.collection('sponsorship_contracts').doc(data.contractId).update({
      deliverables: contract.deliverables,
      status: 'awaiting_approval',
      'metadata.updatedAt': new Date()
    });
  }

  return { success: true, deliverableId };
});

export const approveDeliverable = functions.https.onCall(async (data: ReviewDeliverableInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const deliverableDoc = await db.collection('sponsorship_deliverables').doc(data.deliverableId).get();
  if (!deliverableDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Deliverable not found');
  }

  const deliverable = deliverableDoc.data() as SponsorshipDeliverable;

  if (deliverable.brandId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Only brand can approve deliverables');
  }

  if (deliverable.status !== 'submitted') {
    throw new functions.https.HttpsError('failed-precondition', 'Deliverable not in submitted state');
  }

  const updateData: any = {
    status: data.approved ? 'approved' : 'rejected',
    'review.reviewedAt': new Date(),
    'review.approvedBy': userId,
    'metadata.updatedAt': new Date()
  };

  if (!data.approved) {
    updateData['review.rejectionReason'] = data.rejectionReason;
    updateData['review.revisionRequested'] = data.revisionRequested;
  }

  await db.collection('sponsorship_deliverables').doc(data.deliverableId).update(updateData);

  const contractDoc = await db.collection('sponsorship_contracts').doc(deliverable.contractId).get();
  const contract = contractDoc.data() as SponsorshipContract;

  if (data.approved) {
    const deliverablesSnapshot = await db.collection('sponsorship_deliverables')
      .where('contractId', '==', deliverable.contractId)
      .get();

    const allApproved = deliverablesSnapshot.docs.every(doc => {
      const d = doc.data() as SponsorshipDeliverable;
      return d.status === 'approved' || doc.id === data.deliverableId;
    });

    if (allApproved && deliverablesSnapshot.size === contract.deliverables.length) {
      await releaseEscrowForContract(deliverable.contractId);
    }
  }

  return { success: true, approved: data.approved };
});

async function releaseEscrowForContract(contractId: string): Promise<void> {
  const contractDoc = await db.collection('sponsorship_contracts').doc(contractId).get();
  const contract = contractDoc.data() as SponsorshipContract;

  if (contract.compensation.useTokens && contract.compensation.escrowId) {
    const escrowDoc = await db.collection('token_escrow').doc(contract.compensation.escrowId).get();
    
    if (escrowDoc.exists) {
      const escrowData = escrowDoc.data()!;
      const creatorAmount = escrowData.amount * 0.65;
      const platformAmount = escrowData.amount * 0.35;

      await db.collection('users').doc(contract.creatorId).update({
        'wallet.tokenBalance': admin.firestore.FieldValue.increment(creatorAmount)
      });

      await db.collection('token_escrow').doc(contract.compensation.escrowId).update({
        status: 'released',
        releasedAt: new Date(),
        creatorAmount,
        platformAmount
      });
    }
  }

  await db.collection('sponsorship_contracts').doc(contractId).update({
    status: 'completed',
    'compensation.paidAt': new Date(),
    'metadata.completedAt': new Date(),
    'metadata.updatedAt': new Date()
  });
}

export const releaseEscrowForSponsorship = functions.https.onCall(async (data: {
  contractId: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const contractDoc = await db.collection('sponsorship_contracts').doc(data.contractId).get();
  if (!contractDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contract not found');
  }

  const contract = contractDoc.data() as SponsorshipContract;

  if (contract.brandId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Only brand can release escrow');
  }

  const deliverablesSnapshot = await db.collection('sponsorship_deliverables')
    .where('contractId', '==', data.contractId)
    .get();

  const allApproved = deliverablesSnapshot.docs.every(doc => {
    const d = doc.data() as SponsorshipDeliverable;
    return d.status === 'approved';
  });

  if (!allApproved) {
    throw new functions.https.HttpsError('failed-precondition', 'Not all deliverables are approved');
  }

  await releaseEscrowForContract(data.contractId);

  return { success: true };
});

export const rateSponsorship = functions.https.onCall(async (data: RateSponsorshipInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.reviewerId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only submit reviews as yourself');
  }

  const contractDoc = await db.collection('sponsorship_contracts').doc(data.contractId).get();
  if (!contractDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contract not found');
  }

  const contract = contractDoc.data() as SponsorshipContract;

  if (contract.status !== 'completed') {
    throw new functions.https.HttpsError('failed-precondition', 'Contract must be completed to review');
  }

  if (data.reviewerType === 'brand' && contract.brandId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not the brand for this contract');
  }

  if (data.reviewerType === 'creator' && contract.creatorId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not the creator for this contract');
  }

  const revieweeId = data.reviewerType === 'brand' ? contract.creatorId : contract.brandId;

  const existingReview = await db.collection('sponsorship_reviews')
    .where('contractId', '==', data.contractId)
    .where('reviewerId', '==', data.reviewerId)
    .where('reviewerType', '==', data.reviewerType)
    .limit(1)
    .get();

  if (!existingReview.empty) {
    throw new functions.https.HttpsError('already-exists', 'Review already submitted');
  }

  const reviewId = db.collection('sponsorship_reviews').doc().id;

  const review: SponsorshipReview = {
    id: reviewId,
    contractId: data.contractId,
    offerId: contract.offerId,
    reviewerId: data.reviewerId,
    revieweeId,
    reviewerType: data.reviewerType,
    rating: data.rating,
    criteria: data.criteria,
    comment: data.comment,
    metadata: {
      createdAt: new Date(),
      isPublic: true
    }
  };

  await db.collection('sponsorship_reviews').doc(reviewId).set(review);

  const averageRating = (
    data.criteria.timeliness +
    data.criteria.quality +
    data.criteria.professionalism +
    data.criteria.communication
  ) / 4;

  await db.collection('users').doc(revieweeId).update({
    'sponsorship.reviewCount': increment(1),
    'sponsorship.averageRating': averageRating
  });

  return { success: true, reviewId };
});

export const getSponsorshipAnalytics = functions.https.onCall(async (data: {
  contractId: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const contractDoc = await db.collection('sponsorship_contracts').doc(data.contractId).get();
  if (!contractDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contract not found');
  }

  const contract = contractDoc.data() as SponsorshipContract;

  if (contract.brandId !== userId && contract.creatorId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized to view analytics');
  }

  const deliverablesSnapshot = await db.collection('sponsorship_deliverables')
    .where('contractId', '==', data.contractId)
    .where('status', '==', 'approved')
    .get();

  let totalViews = 0;
  let totalClicks = 0;
  let totalEngagement = 0;
  const regionBreakdown: Record<string, number> = {};

  for (const deliverableDoc of deliverablesSnapshot.docs) {
    const deliverable = deliverableDoc.data() as SponsorshipDeliverable;
    
    if (deliverable.content.contentId) {
      const contentDoc = await db.collection('posts').doc(deliverable.content.contentId).get();
      if (contentDoc.exists) {
        const contentData = contentDoc.data()!;
        totalViews += contentData.stats?.views || 0;
        totalClicks += contentData.stats?.clicks || 0;
        totalEngagement += contentData.stats?.likes || 0;
      }
    }
  }

  const analytics: SponsorshipAnalytics = {
    contractId: data.contractId,
    offerId: contract.offerId,
    creatorId: contract.creatorId,
    period: {
      start: contract.metadata.startedAt || contract.metadata.createdAt,
      end: contract.metadata.completedAt || new Date()
    },
    performance: {
      viewCount: totalViews,
      clickThrough: totalClicks,
      salesAttributed: 0,
      revenue: 0,
      engagement: totalEngagement
    },
    demographics: {
      regionBreakdown,
      ageBreakdown: {},
      retentionImpact: 0
    },
    metadata: {
      lastUpdated: new Date()
    }
  };

  return analytics;
});

export const moderateSponsorship = functions.https.onCall(async (data: {
  targetId: string;
  targetType: 'offer' | 'contract' | 'deliverable' | 'review';
  action: string;
  reason?: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.roles?.moderator && !userData?.roles?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator access required');
  }

  const collectionMap = {
    offer: 'sponsorship_offers',
    contract: 'sponsorship_contracts',
    deliverable: 'sponsorship_deliverables',
    review: 'sponsorship_reviews'
  };

  const collection = collectionMap[data.targetType];
  const targetDoc = await db.collection(collection).doc(data.targetId).get();

  if (!targetDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Target not found');
  }

  const moderation: SponsorshipModeration = {
    targetId: data.targetId,
    targetType: data.targetType,
    moderatorId: context.auth.uid,
    action: data.action as any,
    reason: data.reason,
    escalationLevel: 1,
    metadata: {
      reviewedAt: new Date(),
      notes: `Moderation action: ${data.action}`
    }
  };

  await db.collection('sponsorship_moderations').add(moderation);

  if (data.action === 'rejected' || data.action === 'banned') {
    await db.collection(collection).doc(data.targetId).update({
      status: 'rejected',
      'metadata.moderationAction': data.action,
      'metadata.moderatedAt': new Date(),
      'metadata.moderatedBy': context.auth.uid
    });
  }

  return { success: true };
});