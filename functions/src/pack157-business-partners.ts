/**
 * PACK 157 — Avalo Offline Business Verification & Physical Venue Partnerships
 * Cloud Functions for business partner verification flow
 * 
 * CRITICAL SAFETY RULES:
 * - ZERO tolerance for romantic/dating venues
 * - ZERO tolerance for NSFW/adult entertainment
 * - NO visibility boosts in feed
 * - NO external payment links
 * - Strictly SFW professional venues only
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  BusinessPartner,
  BusinessCategory,
  PartnershipStatus,
  DocumentType,
  VenueError,
  VENUE_ERROR_CODES,
  validateBusinessPartnerData,
  containsBlockedVenueContent,
  isAllowedBusinessCategory,
  VENUE_CONFIG,
} from './types/pack157-business-partners.types';
import { Timestamp } from 'firebase-admin/firestore';

// Import AI moderation
import { moderateText, moderateImage } from './aiModeration';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user can apply for business partnership
 */
async function canApplyForPartnership(userId: string): Promise<{
  canApply: boolean;
  reason?: string;
}> {
  // Check if user is 18+
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { canApply: false, reason: 'User not found' };
  }
  
  const userData = userDoc.data();
  if (!userData?.ageVerified || userData.age < 18) {
    return { canApply: false, reason: 'Must be 18+ and age verified' };
  }
  
  // Check account status
  const enforcementDoc = await db.collection('enforcement_state').doc(userId).get();
  if (enforcementDoc.exists) {
    const enforcement = enforcementDoc.data();
    if (enforcement?.accountStatus === 'BANNED' || enforcement?.accountStatus === 'SUSPENDED') {
      return { canApply: false, reason: 'Account is restricted' };
    }
  }
  
  // Check existing applications
  const existingPartner = await db.collection('business_partners')
    .where('ownerUserId', '==', userId)
    .limit(1)
    .get();
  
  if (!existingPartner.empty) {
    const partner = existingPartner.docs[0].data() as BusinessPartner;
    if (partner.status === 'PENDING') {
      return { canApply: false, reason: 'Application already pending' };
    }
    if (partner.status === 'APPROVED') {
      return { canApply: false, reason: 'Already have an approved partnership' };
    }
    // Can reapply if REJECTED
  }
  
  return { canApply: true };
}

/**
 * Perform safety screening on business application
 */
async function screenBusinessApplication(
  businessName: string,
  description: string,
  category: BusinessCategory
): Promise<{
  passed: boolean;
  reasons: string[];
  nsfwScore: number;
  romanticScore: number;
}> {
  const reasons: string[] = [];
  let passed = true;
  
  // Check for blocked content
  if (containsBlockedVenueContent(businessName)) {
    passed = false;
    reasons.push('Business name contains inappropriate romantic/NSFW content');
  }
  
  if (containsBlockedVenueContent(description)) {
    passed = false;
    reasons.push('Business description contains inappropriate romantic/NSFW content');
  }
  
  // Run AI moderation on text
  const moderationResult = await moderateText(`${businessName} ${description}`);
  
  const nsfwScore = moderationResult.scores.nsfw;
  const romanticScore = moderationResult.scores.sexual;
  
  if (nsfwScore >= VENUE_CONFIG.nsfwThreshold) {
    passed = false;
    reasons.push('Content detected as NSFW/adult');
  }
  
  if (romanticScore >= VENUE_CONFIG.romanticThreshold) {
    passed = false;
    reasons.push('Content detected as romantic/dating oriented');
  }
  
  if (moderationResult.action === 'block') {
    passed = false;
    reasons.push(...moderationResult.reasons);
  }
  
  return {
    passed,
    reasons,
    nsfwScore,
    romanticScore,
  };
}

// ============================================================================
// BUSINESS PARTNER APPLICATION
// ============================================================================

/**
 * Apply for business partnership
 */
export const applyForBusinessPartner = onCall<{
  businessName: string;
  legalName: string;
  category: BusinessCategory;
  description: string;
  email: string;
  phone: string;
  website?: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude?: number;
    longitude?: number;
  };
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Check if user can apply
  const canApply = await canApplyForPartnership(userId);
  if (!canApply.canApply) {
    throw new HttpsError('permission-denied', canApply.reason || 'Cannot apply for partnership');
  }
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Validate business category
  if (!isAllowedBusinessCategory(data.category)) {
    throw new VenueError(
      VENUE_ERROR_CODES.INVALID_CATEGORY,
      'Invalid business category. Only SFW professional venues are allowed.'
    );
  }
  
  // Validate business data
  const validation = validateBusinessPartnerData({
    businessName: data.businessName,
    legalName: data.legalName,
    category: data.category,
    description: data.description,
    email: data.email,
    phone: data.phone,
    address: data.address,
  } as Partial<BusinessPartner>);
  
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.errors.join(', '));
  }
  
  // Perform safety screening
  const screening = await screenBusinessApplication(
    data.businessName,
    data.description,
    data.category
  );
  
  if (!screening.passed) {
    throw new VenueError(
      VENUE_ERROR_CODES.BLOCKED_CONTENT,
      'Business application contains inappropriate content: ' + screening.reasons.join(', ')
    );
  }
  
  // Create business partner record
  const partnerId = generateId();
  const now = serverTimestamp() as Timestamp;
  
  const businessPartner: BusinessPartner = {
    partnerId,
    
    businessName: data.businessName,
    legalName: data.legalName,
    category: data.category,
    description: data.description,
    
    email: data.email,
    phone: data.phone,
    website: data.website,
    
    address: data.address,
    
    ownerUserId: userId,
    ownerName: userData?.displayName || 'Unknown',
    ownerEmail: userData?.email || data.email,
    
    status: PartnershipStatus.PENDING,
    verificationLevel: 'NONE',
    
    uploadedDocuments: [],
    
    safetyScore: 100 - (screening.nsfwScore + screening.romanticScore) * 50,
    violationCount: 0,
    
    createdAt: now,
    updatedAt: now,
    
    canHostEvents: false,
    canSellTickets: false,
    maxEventsPerMonth: 0,
    
    totalEventsHosted: 0,
    totalAttendees: 0,
    totalRevenue: 0,
  };
  
  await db.collection('business_partners').doc(partnerId).set(businessPartner);
  
  // Create notification for admin review
  await db.collection('admin_notifications').add({
    type: 'BUSINESS_PARTNER_APPLICATION',
    partnerId,
    businessName: data.businessName,
    category: data.category,
    ownerUserId: userId,
    createdAt: now,
    read: false,
    priority: 'MEDIUM',
  });
  
  return {
    success: true,
    partnerId,
    status: PartnershipStatus.PENDING,
    message: 'Business partnership application submitted. You will be notified once reviewed.',
  };
});

/**
 * Upload document for business verification
 */
export const uploadBusinessDocument = onCall<{
  partnerId: string;
  documentType: DocumentType;
  documentUrl: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { partnerId, documentType, documentUrl } = request.data;
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Check ownership
  if (partner.ownerUserId !== userId) {
    throw new HttpsError('permission-denied', 'Only the business owner can upload documents');
  }
  
  // Can only upload if pending
  if (partner.status !== PartnershipStatus.PENDING) {
    throw new HttpsError(
      'failed-precondition',
      'Documents can only be uploaded while application is pending'
    );
  }
  
  // Validate document type
  if (!Object.values(DocumentType).includes(documentType)) {
    throw new HttpsError('invalid-argument', 'Invalid document type');
  }
  
  // Check if document type already uploaded
  const existingDoc = partner.uploadedDocuments.find(d => d.type === documentType);
  if (existingDoc) {
    throw new HttpsError('already-exists', 'Document of this type already uploaded');
  }
  
  // Moderate document image
  const moderation = await moderateImage(documentUrl);
  if (moderation.action === 'block') {
    throw new HttpsError(
      'invalid-argument',
      'Document image contains inappropriate content: ' + moderation.reasons.join(', ')
    );
  }
  
  // Add document to partner record
  await db.collection('business_partners').doc(partnerId).update({
    uploadedDocuments: [
      ...partner.uploadedDocuments,
      {
        type: documentType,
        url: documentUrl,
        uploadedAt: serverTimestamp(),
      },
    ],
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    message: 'Document uploaded successfully',
  };
});

/**
 * Get business partner application status
 */
export const getBusinessPartnerStatus = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  
  // Find user's business partnership
  const partnerSnapshot = await db.collection('business_partners')
    .where('ownerUserId', '==', userId)
    .limit(1)
    .get();
  
  if (partnerSnapshot.empty) {
    return {
      hasPartnership: false,
      status: null,
    };
  }
  
  const partner = partnerSnapshot.docs[0].data() as BusinessPartner;
  
  return {
    hasPartnership: true,
    partnerId: partner.partnerId,
    status: partner.status,
    verificationLevel: partner.verificationLevel,
    businessName: partner.businessName,
    category: partner.category,
    canHostEvents: partner.canHostEvents,
    canSellTickets: partner.canSellTickets,
    uploadedDocuments: partner.uploadedDocuments.map(d => ({
      type: d.type,
      uploadedAt: d.uploadedAt.toMillis(),
    })),
    rejectionReason: partner.rejectionReason,
    suspensionReason: partner.suspensionReason,
    safetyScore: partner.safetyScore,
    violationCount: partner.violationCount,
    totalEventsHosted: partner.totalEventsHosted,
    totalAttendees: partner.totalAttendees,
    totalRevenue: partner.totalRevenue,
    createdAt: partner.createdAt.toMillis(),
    approvedAt: partner.approvedAt?.toMillis(),
  };
});

// ============================================================================
// ADMIN FUNCTIONS - BUSINESS PARTNER REVIEW
// ============================================================================

/**
 * Approve business partner application (ADMIN)
 */
export const approveBusinessPartner = onCall<{
  partnerId: string;
  maxEventsPerMonth?: number;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  // TODO: Add proper admin role check
  const reviewerId = request.auth.uid;
  const { partnerId, maxEventsPerMonth = VENUE_CONFIG.maxEventsPerMonth } = request.data;
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Can only approve pending applications
  if (partner.status !== PartnershipStatus.PENDING) {
    throw new HttpsError(
      'failed-precondition',
      `Cannot approve application with status: ${partner.status}`
    );
  }
  
  // Check that required documents are uploaded
  const requiredDocs = [
    DocumentType.BUSINESS_LICENSE,
    DocumentType.OWNER_ID,
  ];
  
  const uploadedTypes = partner.uploadedDocuments.map(d => d.type);
  const missingDocs = requiredDocs.filter(type => !uploadedTypes.includes(type));
  
  if (missingDocs.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Missing required documents: ${missingDocs.join(', ')}`
    );
  }
  
  // Update partner status
  const now = serverTimestamp() as Timestamp;
  
  await db.collection('business_partners').doc(partnerId).update({
    status: PartnershipStatus.APPROVED,
    verificationLevel: 'VERIFIED',
    reviewedBy: reviewerId,
    reviewedAt: now,
    approvedAt: now,
    canHostEvents: true,
    canSellTickets: true,
    maxEventsPerMonth,
    updatedAt: now,
  });
  
  // Send notification to business owner
  await db.collection('notifications').add({
    userId: partner.ownerUserId,
    type: 'BUSINESS_PARTNER',
    title: 'Partnership Approved',
    body: `Your business partnership application for "${partner.businessName}" has been approved! You can now host events.`,
    data: {
      partnerId,
      action: 'APPROVED',
    },
    read: false,
    createdAt: now,
  });
  
  return {
    success: true,
    message: 'Business partnership approved',
  };
});

/**
 * Reject business partner application (ADMIN)
 */
export const rejectBusinessPartner = onCall<{
  partnerId: string;
  reason: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const reviewerId = request.auth.uid;
  const { partnerId, reason } = request.data;
  
  if (!reason || reason.trim().length < 10) {
    throw new HttpsError('invalid-argument', 'Rejection reason must be at least 10 characters');
  }
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Can only reject pending applications
  if (partner.status !== PartnershipStatus.PENDING) {
    throw new HttpsError(
      'failed-precondition',
      `Cannot reject application with status: ${partner.status}`
    );
  }
  
  // Update partner status
  const now = serverTimestamp() as Timestamp;
  
  await db.collection('business_partners').doc(partnerId).update({
    status: PartnershipStatus.REJECTED,
    reviewedBy: reviewerId,
    reviewedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  });
  
  // Send notification to business owner
  await db.collection('notifications').add({
    userId: partner.ownerUserId,
    type: 'BUSINESS_PARTNER',
    title: 'Partnership Application Rejected',
    body: `Your business partnership application for "${partner.businessName}" has been rejected. Reason: ${reason}`,
    data: {
      partnerId,
      action: 'REJECTED',
      reason,
    },
    read: false,
    createdAt: now,
  });
  
  return {
    success: true,
    message: 'Business partnership rejected',
  };
});

/**
 * Suspend business partner (ADMIN)
 */
export const suspendBusinessPartner = onCall<{
  partnerId: string;
  reason: string;
  duration?: number; // days, or undefined for indefinite
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const reviewerId = request.auth.uid;
  const { partnerId, reason, duration } = request.data;
  
  if (!reason || reason.trim().length < 10) {
    throw new HttpsError('invalid-argument', 'Suspension reason must be at least 10 characters');
  }
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Can only suspend approved partners
  if (partner.status !== PartnershipStatus.APPROVED) {
    throw new HttpsError(
      'failed-precondition',
      'Can only suspend approved partnerships'
    );
  }
  
  const now = serverTimestamp() as Timestamp;
  
  // Update partner status
  await db.collection('business_partners').doc(partnerId).update({
    status: PartnershipStatus.SUSPENDED,
    suspensionReason: reason,
    canHostEvents: false,
    canSellTickets: false,
    reviewedBy: reviewerId,
    reviewedAt: now,
    updatedAt: now,
  });
  
  // Cancel all upcoming events for this partner
  const upcomingEvents = await db.collection('venue_events')
    .where('partnerId', '==', partnerId)
    .where('status', '==', 'UPCOMING')
    .get();
  
  const batch = db.batch();
  
  for (const eventDoc of upcomingEvents.docs) {
    batch.update(eventDoc.ref, {
      status: 'CANCELLED',
      isActive: false,
      cancellationReason: 'Partner suspended',
      updatedAt: now,
    });
  }
  
  await batch.commit();
  
  // Send notification to business owner
  await db.collection('notifications').add({
    userId: partner.ownerUserId,
    type: 'BUSINESS_PARTNER',
    title: 'Partnership Suspended',
    body: `Your business partnership for "${partner.businessName}" has been suspended. Reason: ${reason}`,
    data: {
      partnerId,
      action: 'SUSPENDED',
      reason,
      duration,
    },
    read: false,
    createdAt: now,
  });
  
  return {
    success: true,
    cancelledEvents: upcomingEvents.size,
    message: 'Business partnership suspended',
  };
});

/**
 * Revoke business partner permanently (ADMIN)
 */
export const revokeBusinessPartner = onCall<{
  partnerId: string;
  reason: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const reviewerId = request.auth.uid;
  const { partnerId, reason } = request.data;
  
  if (!reason || reason.trim().length < 10) {
    throw new HttpsError('invalid-argument', 'Revocation reason must be at least 10 characters');
  }
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  const now = serverTimestamp() as Timestamp;
  
  // Update partner status
  await db.collection('business_partners').doc(partnerId).update({
    status: PartnershipStatus.REVOKED,
    suspensionReason: reason,
    canHostEvents: false,
    canSellTickets: false,
    reviewedBy: reviewerId,
    reviewedAt: now,
    updatedAt: now,
  });
  
  // Cancel ALL events (past and future)
  const allEvents = await db.collection('venue_events')
    .where('partnerId', '==', partnerId)
    .get();
  
  const batch = db.batch();
  
  for (const eventDoc of allEvents.docs) {
    batch.update(eventDoc.ref, {
      status: 'CANCELLED',
      isActive: false,
      cancellationReason: 'Partner permanently revoked',
      updatedAt: now,
    });
  }
  
  await batch.commit();
  
  // Send notification to business owner
  await db.collection('notifications').add({
    userId: partner.ownerUserId,
    type: 'BUSINESS_PARTNER',
    title: 'Partnership Revoked',
    body: `Your business partnership for "${partner.businessName}" has been permanently revoked. Reason: ${reason}`,
    data: {
      partnerId,
      action: 'REVOKED',
      reason,
    },
    read: false,
    createdAt: now,
  });
  
  return {
    success: true,
    cancelledEvents: allEvents.size,
    message: 'Business partnership permanently revoked',
  };
});

/**
 * Get pending business partner applications (ADMIN)
 */
export const getPendingBusinessPartners = onCall<{
  limit?: number;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  // TODO: Add proper admin role check
  
  const { limit = 20 } = request.data;
  
  const snapshot = await db.collection('business_partners')
    .where('status', '==', PartnershipStatus.PENDING)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const partners = snapshot.docs.map(doc => {
    const data = doc.data() as BusinessPartner;
    return {
      partnerId: data.partnerId,
      businessName: data.businessName,
      legalName: data.legalName,
      category: data.category,
      description: data.description,
      ownerName: data.ownerName,
      ownerEmail: data.ownerEmail,
      address: data.address,
      uploadedDocuments: data.uploadedDocuments.map(d => ({
        type: d.type,
        uploadedAt: d.uploadedAt.toMillis(),
      })),
      safetyScore: data.safetyScore,
      createdAt: data.createdAt.toMillis(),
    };
  });
  
  return {
    success: true,
    partners,
    total: partners.length,
  };
});