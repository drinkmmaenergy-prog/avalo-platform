/**
 * PACK 157 — Venue Events Management
 * Cloud Functions for venue event scheduling, attendance, and check-in
 * 
 * CRITICAL SAFETY RULES:
 * - ALL events must be SAFE and professional
 * - ZERO tolerance for romantic/dating themes
 * - QR check-in for attendance tracking
 * - Token-based payments only (65% creator / 35% Avalo)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  VenueProfile,
  VenueEvent,
  VenueAttendance,
  BusinessPartner,
  PartnershipStatus,
  VenueError,
  VENUE_ERROR_CODES,
  VENUE_CONFIG,
  validateVenueEventData,
  containsBlockedVenueContent,
  calculateRomanticScore,
} from './types/pack157-business-partners.types';
import { Timestamp } from 'firebase-admin/firestore';
import { moderateText } from './aiModeration';
import * as crypto from 'crypto';

// ============================================================================
// RISK SCREENING (copied from events.ts for venue events)
// ============================================================================

interface TrustProfile {
  riskScore: number;
  enforcementLevel: string;
  flags: string[];
}

async function getUserTrustProfile(userId: string): Promise<TrustProfile | null> {
  const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
  if (!trustDoc.exists) {
    return null;
  }
  return trustDoc.data() as TrustProfile;
}

async function performRiskScreening(userId: string): Promise<{
  passed: boolean;
  reasons: string[];
  riskScore: number;
}> {
  const trustProfile = await getUserTrustProfile(userId);
  
  const reasons: string[] = [];
  let passed = true;
  const riskScore = trustProfile?.riskScore || 0;
  
  // Check risk score threshold (80)
  if (riskScore >= 80) {
    passed = false;
    reasons.push('RISK_SCORE_TOO_HIGH');
  }
  
  // Check for dangerous flags
  const dangerousFlags = [
    'KYC_BLOCKED',
    'POTENTIAL_SCAMMER',
    'PAYMENT_FRAUD_RISK',
    'AGGRESSIVE_SENDER',
  ];
  
  if (trustProfile?.flags) {
    for (const flag of trustProfile.flags) {
      if (dangerousFlags.includes(flag)) {
        passed = false;
        reasons.push(`FLAG_${flag}`);
      }
    }
  }
  
  // Check enforcement level
  if (trustProfile?.enforcementLevel === 'HARD_RESTRICTED' ||
      trustProfile?.enforcementLevel === 'SUSPENDED') {
    passed = false;
    reasons.push('ACCOUNT_RESTRICTED');
  }
  
  return { passed, reasons, riskScore };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate QR check-in code
 */
function generateCheckInQR(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Check if partner can host events
 */
async function canPartnerHostEvents(partnerId: string): Promise<{
  canHost: boolean;
  reason?: string;
  partner?: BusinessPartner;
}> {
  const partnerDoc = await db.collection('business_partners').doc(partnerId).get();
  
  if (!partnerDoc.exists) {
    return { canHost: false, reason: 'Business partner not found' };
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  if (partner.status !== PartnershipStatus.APPROVED) {
    return { canHost: false, reason: 'Partnership not approved', partner };
  }
  
  if (!partner.canHostEvents) {
    return { canHost: false, reason: 'Not authorized to host events', partner };
  }
  
  // Check monthly event limit
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const eventsThisMonth = await db.collection('venue_events')
    .where('partnerId', '==', partnerId)
    .where('createdAt', '>=', Timestamp.fromDate(monthStart))
    .count()
    .get();
  
  if (eventsThisMonth.data().count >= partner.maxEventsPerMonth) {
    return {
      canHost: false,
      reason: `Monthly event limit reached (${partner.maxEventsPerMonth})`,
      partner,
    };
  }
  
  return { canHost: true, partner };
}

/**
 * Screen venue event for safety
 */
async function screenVenueEvent(
  title: string,
  description: string
): Promise<{
  passed: boolean;
  reasons: string[];
  nsfwScore: number;
  romanticScore: number;
}> {
  const reasons: string[] = [];
  let passed = true;
  
  // Check for blocked content
  if (containsBlockedVenueContent(title)) {
    passed = false;
    reasons.push('Event title contains blocked romantic/NSFW content');
  }
  
  if (containsBlockedVenueContent(description)) {
    passed = false;
    reasons.push('Event description contains blocked romantic/NSFW content');
  }
  
  // Calculate romantic score
  const romanticScore = calculateRomanticScore(`${title} ${description}`);
  if (romanticScore >= VENUE_CONFIG.romanticThreshold) {
    passed = false;
    reasons.push(`Event has romantic/dating theme (score: ${romanticScore.toFixed(2)})`);
  }
  
  // AI moderation
  const moderation = await moderateText(`${title} ${description}`);
  const nsfwScore = moderation.scores.nsfw;
  
  if (nsfwScore >= VENUE_CONFIG.nsfwThreshold) {
    passed = false;
    reasons.push('Event detected as NSFW/adult content');
  }
  
  if (moderation.action === 'block') {
    passed = false;
    reasons.push(...moderation.reasons);
  }
  
  return {
    passed,
    reasons,
    nsfwScore,
    romanticScore,
  };
}

// ============================================================================
// VENUE PROFILE MANAGEMENT
// ============================================================================

/**
 * Create venue profile
 */
export const createVenueProfile = onCall<{
  partnerId: string;
  venueName: string;
  description: string;
  capacity: number;
  amenities: string[];
  photos?: string[];
  operatingHours: {
    [day: string]: {
      open: string;
      close: string;
      closed?: boolean;
    };
  };
  address?: {
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
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(data.partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Check ownership
  if (partner.ownerUserId !== userId) {
    throw new HttpsError('permission-denied', 'Only the business owner can create venue profiles');
  }
  
  // Check if partner can host events
  const canHost = await canPartnerHostEvents(data.partnerId);
  if (!canHost.canHost) {
    throw new VenueError(
      VENUE_ERROR_CODES.PARTNER_NOT_VERIFIED,
      canHost.reason || 'Cannot create venue profile'
    );
  }
  
  // Screen venue description
  const screening = await screenVenueEvent(data.venueName, data.description);
  if (!screening.passed) {
    throw new VenueError(
      VENUE_ERROR_CODES.BLOCKED_CONTENT,
      'Venue content inappropriate: ' + screening.reasons.join(', ')
    );
  }
  
  // Create venue profile
  const venueId = generateId();
  const now = serverTimestamp() as Timestamp;
  
  const venue: VenueProfile = {
    venueId,
    partnerId: data.partnerId,
    
    venueName: data.venueName,
    category: partner.category,
    description: data.description,
    
    address: data.address || partner.address,
    
    capacity: data.capacity,
    amenities: data.amenities,
    photos: data.photos || [],
    
    operatingHours: data.operatingHours,
    
    cancellationPolicy: 'Standard cancellation policy applies',
    
    isActive: true,
    isVerified: true, // Auto-verified since partner is verified
    
    safetyRating: 5.0,
    
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('venue_profiles').doc(venueId).set(venue);
  
  return {
    success: true,
    venueId,
    message: 'Venue profile created successfully',
  };
});

/**
 * Get venue profile
 */
export const getVenueProfile = onCall<{
  venueId: string;
}>({ region: 'us-central1' }, async (request) => {
  const { venueId } = request.data;
  
  const venueDoc = await db.collection('venue_profiles').doc(venueId).get();
  
  if (!venueDoc.exists) {
    throw new HttpsError('not-found', 'Venue not found');
  }
  
  const venue = venueDoc.data() as VenueProfile;
  
  return {
    success: true,
    venue: {
      ...venue,
      createdAt: venue.createdAt.toMillis(),
      updatedAt: venue.updatedAt.toMillis(),
      lastSafetyCheck: venue.lastSafetyCheck?.toMillis(),
    },
  };
});

// ============================================================================
// VENUE EVENT SCHEDULING
// ============================================================================

/**
 * Schedule venue event
 */
export const scheduleVenueEvent = onCall<{
  venueId: string;
  title: string;
  description: string;
  eventType: 'WORKSHOP' | 'CLASS' | 'TRAINING' | 'MEETUP' | 'CHALLENGE' | 'SEMINAR';
  priceTokens: number;
  capacity: number;
  startTime: string; // ISO timestamp
  endTime: string;
  requiresApproval?: boolean;
  tags?: string[];
  hostedBy?: string; // Creator userId (optional)
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Get venue
  const venueDoc = await db.collection('venue_profiles').doc(data.venueId).get();
  if (!venueDoc.exists) {
    throw new HttpsError('not-found', 'Venue not found');
  }
  
  const venue = venueDoc.data() as VenueProfile;
  
  if (!venue.isActive) {
    throw new VenueError(
      VENUE_ERROR_CODES.VENUE_NOT_ACTIVE,
      'Venue is not active'
    );
  }
  
  // Get business partner
  const partnerDoc = await db.collection('business_partners').doc(venue.partnerId).get();
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Check if user is owner or authorized creator
  const isOwner = partner.ownerUserId === userId;
  const isAuthorizedCreator = data.hostedBy === userId;
  
  if (!isOwner && !isAuthorizedCreator) {
    throw new HttpsError('permission-denied', 'Not authorized to schedule events at this venue');
  }
  
  // Check if partner can host events
  const canHost = await canPartnerHostEvents(venue.partnerId);
  if (!canHost.canHost) {
    throw new VenueError(
      VENUE_ERROR_CODES.PARTNER_NOT_VERIFIED,
      canHost.reason || 'Partner cannot host events'
    );
  }
  
  // Validate event data
  const validation = validateVenueEventData({
    title: data.title,
    description: data.description,
    priceTokens: data.priceTokens,
    capacity: data.capacity,
  } as Partial<VenueEvent>);
  
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.errors.join(', '));
  }
  
  // Screen event for safety
  const screening = await screenVenueEvent(data.title, data.description);
  if (!screening.passed) {
    throw new VenueError(
      VENUE_ERROR_CODES.BLOCKED_CONTENT,
      'Event content inappropriate: ' + screening.reasons.join(', ')
    );
  }
  
  // Validate timing
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  const now = new Date();
  
  if (startTime < now) {
    throw new HttpsError('invalid-argument', 'Event start time must be in the future');
  }
  
  if (endTime <= startTime) {
    throw new HttpsError('invalid-argument', 'Event end time must be after start time');
  }
  
  const duration = (endTime.getTime() - startTime.getTime()) / 1000 / 60; // minutes
  if (duration < VENUE_CONFIG.minEventDuration) {
    throw new HttpsError('invalid-argument', `Event must be at least ${VENUE_CONFIG.minEventDuration} minutes`);
  }
  
  if (duration > VENUE_CONFIG.maxEventDuration) {
    throw new HttpsError('invalid-argument', `Event cannot exceed ${VENUE_CONFIG.maxEventDuration} minutes`);
  }
  
  const advanceNotice = startTime.getTime() - now.getTime();
  if (advanceNotice < VENUE_CONFIG.minAdvanceNotice) {
    throw new HttpsError('invalid-argument', 'Event must be scheduled at least 24 hours in advance');
  }
  
  // Check capacity
  if (data.capacity > venue.capacity) {
    throw new VenueError(
      VENUE_ERROR_CODES.CAPACITY_EXCEEDED,
      `Event capacity (${data.capacity}) exceeds venue capacity (${venue.capacity})`
    );
  }
  
  // Get host info
  let hostName = partner.businessName;
  let hostAvatar: string | undefined;
  
  if (data.hostedBy) {
    const hostDoc = await db.collection('users').doc(data.hostedBy).get();
    if (hostDoc.exists) {
      const hostData = hostDoc.data();
      hostName = hostData?.displayName || hostName;
      hostAvatar = hostData?.profilePictureUrl;
    }
  }
  
  // Determine risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' = 'LOW';
  if (screening.nsfwScore > 0.5 || screening.romanticScore > 0.5) {
    riskLevel = 'BLOCKED';
  } else if (screening.nsfwScore > 0.2 || screening.romanticScore > 0.2) {
    riskLevel = 'MEDIUM';
  }
  
  // Create venue event
  const eventId = generateId();
  const checkInCode = generateCheckInQR();
  const nowTimestamp = serverTimestamp() as Timestamp;
  
  const event: VenueEvent = {
    eventId,
    venueId: data.venueId,
    partnerId: venue.partnerId,
    
    title: data.title,
    description: data.description,
    eventType: data.eventType,
    
    hostedBy: data.hostedBy,
    hostName,
    hostAvatar,
    
    priceTokens: data.priceTokens,
    capacity: data.capacity,
    attendeesCount: 0,
    
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    duration,
    
    venueName: venue.venueName,
    venueAddress: `${venue.address.street}, ${venue.address.city}`,
    
    status: 'UPCOMING',
    isActive: true,
    requiresApproval: data.requiresApproval || false,
    
    riskLevel,
    contentModerated: true,
    nsfwScore: screening.nsfwScore,
    romanticScore: screening.romanticScore,
    
    checkInEnabled: true,
    checkInCode,
    
    platformFeePercentage: VENUE_CONFIG.platformFeePercentage,
    venueCommission: 0, // Can be set later
    
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
    createdBy: userId,
    
    tags: data.tags || [],
    region: venue.address.country,
  };
  
  await db.collection('venue_events').doc(eventId).set(event);
  
  // Update partner stats
  await db.collection('business_partners').doc(venue.partnerId).update({
    totalEventsHosted: increment(1),
    updatedAt: nowTimestamp,
  });
  
  return {
    success: true,
    eventId,
    checkInCode,
    riskLevel,
    message: 'Venue event scheduled successfully',
  };
});

/**
 * Get venue events
 */
export const getVenueEvents = onCall<{
  venueId?: string;
  partnerId?: string;
  status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  limit?: number;
}>({ region: 'us-central1' }, async (request) => {
  const { venueId, partnerId, status = 'UPCOMING', limit = 20 } = request.data;
  
  let query = db.collection('venue_events')
    .where('isActive', '==', true)
    .where('status', '==', status);
  
  if (venueId) {
    query = query.where('venueId', '==', venueId);
  } else if (partnerId) {
    query = query.where('partnerId', '==', partnerId);
  }
  
  const snapshot = await query
    .orderBy('startTime', 'asc')
    .limit(limit)
    .get();
  
  const events = snapshot.docs.map(doc => {
    const event = doc.data() as VenueEvent;
    return {
      ...event,
      startTime: event.startTime.toMillis(),
      endTime: event.endTime.toMillis(),
      createdAt: event.createdAt.toMillis(),
      updatedAt: event.updatedAt.toMillis(),
      checkInStartTime: event.checkInStartTime?.toMillis(),
      checkInCode: undefined, // Hide from public listing
    };
  });
  
  return {
    success: true,
    events,
    total: events.length,
  };
});

// ============================================================================
// VENUE ATTENDANCE & CHECK-IN
// ============================================================================

/**
 * Register for venue event
 */
export const registerForVenueEvent = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId } = request.data;
  
  // Get event
  const eventDoc = await db.collection('venue_events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as VenueEvent;
  
  // Check event status
  if (event.status !== 'UPCOMING') {
    throw new HttpsError('failed-precondition', 'Event is not available for registration');
  }
  
  // Check capacity
  if (event.attendeesCount >= event.capacity) {
    throw new VenueError(
      VENUE_ERROR_CODES.CAPACITY_EXCEEDED,
      'Event is at full capacity'
    );
  }
  
  // Check if already registered
  const existingAttendance = await db.collection('venue_attendance')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  
  if (!existingAttendance.empty) {
    throw new HttpsError('already-exists', 'Already registered for this event');
  }
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Perform risk screening
  const riskCheck = await performRiskScreening(userId);
  
  if (!riskCheck.passed) {
    throw new HttpsError(
      'permission-denied',
      'Your account is currently restricted from joining events'
    );
  }
  
  // Handle payment if event is paid
  let transactionId: string | undefined;
  const platformFee = Math.floor(event.priceTokens * event.platformFeePercentage);
  const creatorEarnings = event.priceTokens - platformFee;
  const venueCommission = Math.floor(creatorEarnings * event.venueCommission);
  
  if (event.priceTokens > 0) {
    // Check balance
    const walletDoc = await db.collection('users').doc(userId)
      .collection('wallet').doc('main').get();
    const currentBalance = walletDoc.data()?.tokenBalance || 0;
    
    if (currentBalance < event.priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${event.priceTokens}, Available: ${currentBalance}`
      );
    }
    
    // Process payment
    await db.runTransaction(async (transaction) => {
      const buyerWalletRef = db.collection('users').doc(userId)
        .collection('wallet').doc('main');
      
      // Deduct from buyer
      transaction.update(buyerWalletRef, {
        tokenBalance: increment(-event.priceTokens),
      });
      
      // Add to creator (if event has a host)
      if (event.hostedBy) {
        const creatorWalletRef = db.collection('users').doc(event.hostedBy)
          .collection('wallet').doc('main');
        transaction.update(creatorWalletRef, {
          tokenBalance: increment(creatorEarnings - venueCommission),
        });
      }
      
      // Create transaction record
      transactionId = generateId();
      transaction.set(db.collection('transactions').doc(transactionId), {
        transactionId,
        userId,
        type: 'VENUE_EVENT_PURCHASE',
        amount: -event.priceTokens,
        description: `Venue event: ${event.title}`,
        eventId,
        venueId: event.venueId,
        partnerId: event.partnerId,
        platformFee,
        creatorEarnings: creatorEarnings - venueCommission,
        venueCommission,
        createdAt: serverTimestamp(),
      });
    });
  }
  
  // Create attendance record
  const attendanceId = generateId();
  const qrCodeData = generateCheckInQR();
  const now = serverTimestamp() as Timestamp;
  
  const attendance: VenueAttendance = {
    attendanceId,
    eventId,
    venueId: event.venueId,
    
    userId,
    userName: userData?.displayName || 'Unknown User',
    userAvatar: userData?.profilePictureUrl,
    
    registeredAt: now,
    registrationStatus: 'CONFIRMED',
    
    tokensAmount: event.priceTokens,
    platformFee,
    creatorEarnings: creatorEarnings - venueCommission,
    venueCommission,
    transactionId,
    
    checkedIn: false,
    qrCodeData,
    
    riskCheckPassed: true,
    riskScore: riskCheck.riskScore,
    
    feedbackSubmitted: false,
    
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('venue_attendance').doc(attendanceId).set(attendance);
  
  // Increment attendee count
  await db.collection('venue_events').doc(eventId).update({
    attendeesCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  
  // Update partner stats
  await db.collection('business_partners').doc(event.partnerId).update({
    totalAttendees: increment(1),
    totalRevenue: increment(event.priceTokens),
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    attendanceId,
    qrCodeData,
    message: 'Successfully registered for venue event',
  };
});

/**
 * Scan QR code for venue check-in
 */
export const scanVenueAttendance = onCall<{
  eventId: string;
  qrCodeData: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { eventId, qrCodeData } = request.data;
  
  // Find attendance record
  const attendanceSnapshot = await db.collection('venue_attendance')
    .where('eventId', '==', eventId)
    .where('qrCodeData', '==', qrCodeData)
    .where('registrationStatus', '==', 'CONFIRMED')
    .limit(1)
    .get();
  
  if (attendanceSnapshot.empty) {
    throw new HttpsError('not-found', 'Invalid QR code or not registered for this event');
  }
  
  const attendanceDoc = attendanceSnapshot.docs[0];
  const attendance = attendanceDoc.data() as VenueAttendance;
  
  // Check if already checked in
  if (attendance.checkedIn) {
    return {
      success: true,
      alreadyCheckedIn: true,
      checkInTime: attendance.checkInTime?.toMillis(),
      message: 'Already checked in',
    };
  }
  
  // Update check-in status
  await attendanceDoc.ref.update({
    checkedIn: true,
    checkInTime: serverTimestamp(),
    checkInMethod: 'QR_CODE',
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    alreadyCheckedIn: false,
    userName: attendance.userName,
    message: 'Check-in successful',
  };
});

/**
 * Get user's venue event registrations
 */
export const getMyVenueEvents = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  
  const attendanceSnapshot = await db.collection('venue_attendance')
    .where('userId', '==', userId)
    .where('registrationStatus', '==', 'CONFIRMED')
    .orderBy('registeredAt', 'desc')
    .limit(50)
    .get();
  
  const attendances = attendanceSnapshot.docs.map(doc => doc.data() as VenueAttendance);
  
  // Fetch event details
  const eventIds = Array.from(new Set(attendances.map(a => a.eventId)));
  const events: VenueEvent[] = [];
  
  for (const eventId of eventIds) {
    const eventDoc = await db.collection('venue_events').doc(eventId).get();
    if (eventDoc.exists) {
      events.push(eventDoc.data() as VenueEvent);
    }
  }
  
  return {
    success: true,
    attendances: attendances.map(a => ({
      ...a,
      registeredAt: a.registeredAt.toMillis(),
      updatedAt: a.updatedAt.toMillis(),
      checkInTime: a.checkInTime?.toMillis(),
    })),
    events: events.map(e => ({
      ...e,
      startTime: e.startTime.toMillis(),
      endTime: e.endTime.toMillis(),
      createdAt: e.createdAt.toMillis(),
      updatedAt: e.updatedAt.toMillis(),
    })),
  };
});