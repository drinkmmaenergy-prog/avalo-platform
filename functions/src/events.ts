/**
 * PACK 117: Events, Meetups & Real-World Experiences
 * Backend implementation for safe in-person events system
 * 
 * CRITICAL SAFETY RULES:
 * - SAFE events only (zero NSFW tolerance)
 * - No dating/escort/romantic services
 * - Token-only payments (65% creator / 35% Avalo)
 * - Background risk screening (PACK 85 integration)
 * - Location privacy until confirmed attendance
 * - No discovery/ranking boosts from events
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  Event,
  EventAttendee,
  EventSafetySurvey,
  EventType,
  EventStatus,
  RiskLevel,
  AttendeeStatus,
  EVENT_CONFIG,
  validateEventData,
  calculateEventRiskLevel,
  generateCheckInCode,
  containsBlockedKeywords,
} from './types/events.types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Import from Trust & Risk Engine (PACK 85)
interface TrustProfile {
  riskScore: number;
  enforcementLevel: string;
  flags: string[];
}

/**
 * Get user's trust profile for risk screening
 */
async function getUserTrustProfile(userId: string): Promise<TrustProfile | null> {
  const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
  if (!trustDoc.exists) {
    return null;
  }
  return trustDoc.data() as TrustProfile;
}

/**
 * Check if user can create events (must be verified creator)
 */
async function canCreateEvent(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return false;
  }
  const userData = userDoc.data();
  return userData?.earnFromChat === true || userData?.isCreator === true;
}

/**
 * Perform risk screening before event enrollment
 */
async function performRiskScreening(userId: string): Promise<{
  passed: boolean;
  reasons: string[];
  riskScore: number;
}> {
  const trustProfile = await getUserTrustProfile(userId);
  
  const reasons: string[] = [];
  let passed = true;
  const riskScore = trustProfile?.riskScore || 0;
  
  // Check risk score threshold
  if (riskScore >= EVENT_CONFIG.riskScoreHighThreshold) {
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
// EVENT MANAGEMENT
// ============================================================================

/**
 * Create a new event
 */
export const createEvent = onCall<{
  title: string;
  description: string;
  type: EventType;
  priceTokens: number;
  region: string;
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  capacity?: number;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  tags?: string[];
  requiresApproval?: boolean;
}>({ region: 'us-central1' }, async (request) => {
  // Authentication check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Check if user can create events
  const canCreate = await canCreateEvent(userId);
  if (!canCreate) {
    throw new HttpsError(
      'permission-denied',
      'Only verified creators can create events'
    );
  }
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Validate event data (convert to Event-like structure for validation)
  const validation = validateEventData({
    title: data.title,
    description: data.description,
    priceTokens: data.priceTokens,
    capacity: data.capacity,
  } as Partial<Event>);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.errors.join(', '));
  }
  
  // Check for NSFW content
  if (containsBlockedKeywords(data.title) || containsBlockedKeywords(data.description)) {
    throw new HttpsError(
      'invalid-argument',
      'Event contains inappropriate content. Events must be SAFE and non-explicit.'
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
  
  const duration = endTime.getTime() - startTime.getTime();
  if (duration < EVENT_CONFIG.minDuration) {
    throw new HttpsError('invalid-argument', 'Event duration must be at least 30 minutes');
  }
  if (duration > EVENT_CONFIG.maxDuration) {
    throw new HttpsError('invalid-argument', 'Event duration must be at most 8 hours');
  }
  
  const advanceNotice = startTime.getTime() - now.getTime();
  if (advanceNotice < EVENT_CONFIG.minAdvanceNotice) {
    throw new HttpsError('invalid-argument', 'Event must be created at least 24 hours in advance');
  }
  
  // Get host risk level
  const hostTrust = await getUserTrustProfile(userId);
  const hostRiskScore = hostTrust?.riskScore || 0;
  
  // Calculate event risk level
  const eventRiskLevel = calculateEventRiskLevel({
    title: data.title,
    description: data.description,
    priceTokens: data.priceTokens,
    capacity: data.capacity,
  } as Partial<Event>, hostRiskScore);
  
  if (eventRiskLevel === RiskLevel.BLOCKED) {
    throw new HttpsError(
      'permission-denied',
      'Event cannot be created due to safety concerns'
    );
  }
  
  // Create event document
  const eventId = generateId();
  const event: Event = {
    eventId,
    hostUserId: userId,
    hostName: userData?.displayName || 'Unknown Host',
    hostAvatar: userData?.profilePictureUrl,
    
    title: data.title,
    description: data.description,
    type: data.type,
    
    priceTokens: data.priceTokens,
    
    region: data.region,
    locationDetails: data.locationDetails,
    
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    
    capacity: data.capacity,
    attendeesCount: 0,
    
    riskLevel: eventRiskLevel,
    requiresApproval: data.requiresApproval || false,
    
    status: EventStatus.UPCOMING,
    isActive: true,
    
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    
    tags: data.tags || [],
  };
  
  // Save to Firestore
  await db.collection('events').doc(eventId).set(event);
  
  return {
    success: true,
    eventId,
    riskLevel: eventRiskLevel,
    message: 'Event created successfully',
  };
});

/**
 * Update an existing event
 */
export const updateEvent = onCall<{
  eventId: string;
  title?: string;
  description?: string;
  priceTokens?: number;
  capacity?: number;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  tags?: string[];
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, ...updates } = request.data;
  
  // Get event
  const eventRef = db.collection('events').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as Event;
  
  // Check ownership
  if (event.hostUserId !== userId) {
    throw new HttpsError('permission-denied', 'Only the event host can update this event');
  }
  
  // Cannot update completed or cancelled events
  if (event.status === EventStatus.COMPLETED || event.status === EventStatus.CANCELLED) {
    throw new HttpsError('failed-precondition', 'Cannot update completed or cancelled events');
  }
  
  // Validate updates
  if (updates.title || updates.description) {
    const validation = validateEventData({
      title: updates.title || event.title,
      description: updates.description || event.description,
      priceTokens: updates.priceTokens || event.priceTokens,
      capacity: updates.capacity || event.capacity,
    });
    
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.errors.join(', '));
    }
  }
  
  // Check for NSFW in updates
  if (updates.title && containsBlockedKeywords(updates.title)) {
    throw new HttpsError('invalid-argument', 'Event title contains inappropriate content');
  }
  if (updates.description && containsBlockedKeywords(updates.description)) {
    throw new HttpsError('invalid-argument', 'Event description contains inappropriate content');
  }
  
  // Update event
  const updateData: any = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  
  await eventRef.update(updateData);
  
  return {
    success: true,
    message: 'Event updated successfully',
  };
});

/**
 * Cancel an event
 */
export const cancelEvent = onCall<{
  eventId: string;
  reason: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, reason } = request.data;
  
  // Get event
  const eventRef = db.collection('events').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as Event;
  
  // Check ownership
  if (event.hostUserId !== userId) {
    throw new HttpsError('permission-denied', 'Only the event host can cancel this event');
  }
  
  // Cannot cancel completed events
  if (event.status === EventStatus.COMPLETED) {
    throw new HttpsError('failed-precondition', 'Cannot cancel completed events');
  }
  
  // Update event status
  await eventRef.update({
    status: EventStatus.CANCELLED,
    isActive: false,
    updatedAt: serverTimestamp(),
  });
  
  // Process refunds for all confirmed attendees
  const attendeesSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .where('status', '==', AttendeeStatus.CONFIRMED)
    .get();
  
  const batch = db.batch();
  
  for (const attendeeDoc of attendeesSnapshot.docs) {
    const attendee = attendeeDoc.data() as EventAttendee;
    
    // Only refund paid events
    if (attendee.tokensAmount > 0) {
      // Refund tokens to buyer
      const buyerWalletRef = db.collection('users').doc(attendee.userId)
        .collection('wallet').doc('main');
      batch.update(buyerWalletRef, {
        tokenBalance: increment(attendee.tokensAmount),
      });
      
      // Deduct from creator (return their earnings)
      if (attendee.creatorEarnings > 0) {
        const creatorWalletRef = db.collection('users').doc(attendee.hostUserId)
          .collection('wallet').doc('main');
        batch.update(creatorWalletRef, {
          tokenBalance: increment(-attendee.creatorEarnings),
        });
      }
      
      // Create refund transaction
      const refundTxId = generateId();
      const refundTx = {
        transactionId: refundTxId,
        userId: attendee.userId,
        type: 'EVENT_REFUND',
        amount: attendee.tokensAmount,
        description: `Refund for cancelled event: ${event.title}`,
        eventId,
        attendeeId: attendee.attendeeId,
        createdAt: serverTimestamp(),
      };
      batch.set(db.collection('transactions').doc(refundTxId), refundTx);
      
      // Update attendee status
      batch.update(attendeeDoc.ref, {
        status: AttendeeStatus.REFUNDED,
        refundTransactionId: refundTxId,
      });
    } else {
      // Free event - just update status
      batch.update(attendeeDoc.ref, {
        status: AttendeeStatus.REFUNDED,
      });
    }
  }
  
  await batch.commit();
  
  return {
    success: true,
    refundedAttendees: attendeesSnapshot.size,
    message: 'Event cancelled and refunds processed',
  };
});

/**
 * List events by region
 */
export const listEventsByRegion = onCall<{
  region: string;
  limit?: number;
}>({ region: 'us-central1' }, async (request) => {
  const { region, limit = 20 } = request.data;
  
  const eventsSnapshot = await db.collection('events')
    .where('region', '==', region)
    .where('isActive', '==', true)
    .where('status', '==', EventStatus.UPCOMING)
    .orderBy('startTime', 'asc')
    .limit(limit)
    .get();
  
  const events = eventsSnapshot.docs.map(doc => {
    const event = doc.data() as Event;
    // Hide location details for public listing
    return {
      ...event,
      locationDetails: undefined, // Hidden until enrollment
    };
  });
  
  return {
    success: true,
    events,
  };
});

/**
 * Get event details (with view tracking)
 */
export const getEventDetails = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  const { eventId } = request.data;
  
  const eventDoc = await db.collection('events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as Event;
  
  // Check if user is enrolled (to determine location access)
  let hasLocationAccess = false;
  let userAttendee: EventAttendee | null = null;
  
  if (request.auth) {
    const userId = request.auth.uid;
    const attendeeSnapshot = await db.collection('event_attendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', AttendeeStatus.CONFIRMED)
      .get();
    
    if (!attendeeSnapshot.empty) {
      hasLocationAccess = true;
      userAttendee = attendeeSnapshot.docs[0].data() as EventAttendee;
    }
  }
  
  // Return event with conditional location access
  return {
    success: true,
    event: {
      ...event,
      locationDetails: hasLocationAccess ? event.locationDetails : undefined,
    },
    userAttendee,
    hasLocationAccess,
  };
});

// ============================================================================
// EVENT ENROLLMENT
// ============================================================================

/**
 * Join an event (with risk screening and payment)
 */
export const joinEvent = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId } = request.data;
  
  // Get event
  const eventDoc = await db.collection('events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as Event;
  
  // Check event status
  if (!event.isActive || event.status !== EventStatus.UPCOMING) {
    throw new HttpsError('failed-precondition', 'Event is not available for enrollment');
  }
  
  // Cannot join own event
  if (event.hostUserId === userId) {
    throw new HttpsError('failed-precondition', 'Cannot join your own event');
  }
  
  // Check if already enrolled
  const existingAttendee = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();
  
  if (!existingAttendee.empty) {
    throw new HttpsError('already-exists', 'You are already enrolled in this event');
  }
  
  // Check capacity
  if (event.capacity && event.attendeesCount >= event.capacity) {
    throw new HttpsError('failed-precondition', 'Event is at full capacity');
  }
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Perform risk screening
  const riskCheck = await performRiskScreening(userId);
  
  if (!riskCheck.passed) {
    // Create denied attendee record (for audit)
    const attendeeId = generateId();
    await db.collection('event_attendees').doc(attendeeId).set({
      attendeeId,
      eventId,
      eventTitle: event.title,
      userId,
      userName: userData?.displayName || 'Unknown User',
      hostUserId: event.hostUserId,
      tokensAmount: 0,
      platformFee: 0,
      creatorEarnings: 0,
      status: AttendeeStatus.DENIED,
      riskCheckPassed: false,
      riskCheckReasons: riskCheck.reasons,
      riskScoreSnapshot: riskCheck.riskScore,
      checkedIn: false,
      hasLocationAccess: false,
      enrolledAt: serverTimestamp(),
    });
    
    throw new HttpsError(
      'permission-denied',
      'Your account is currently restricted from joining events. Please contact support if you believe this is a mistake.'
    );
  }
  
  // Handle payment if event is paid
  let transactionId: string | undefined;
  
  if (event.priceTokens > 0) {
    // Check user balance
    const walletDoc = await db.collection('users').doc(userId)
      .collection('wallet').doc('main').get();
    const walletData = walletDoc.data();
    const currentBalance = walletData?.tokenBalance || 0;
    
    if (currentBalance < event.priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${event.priceTokens}, Available: ${currentBalance}`
      );
    }
    
    // Calculate split
    const platformFee = Math.floor(event.priceTokens * EVENT_CONFIG.platformFeePercentage);
    const creatorEarnings = event.priceTokens - platformFee;
    
    // Process payment transaction
    await db.runTransaction(async (transaction) => {
      const buyerWalletRef = db.collection('users').doc(userId)
        .collection('wallet').doc('main');
      const creatorWalletRef = db.collection('users').doc(event.hostUserId)
        .collection('wallet').doc('main');
      
      // Deduct from buyer
      transaction.update(buyerWalletRef, {
        tokenBalance: increment(-event.priceTokens),
      });
      
      // Add to creator
      transaction.update(creatorWalletRef, {
        tokenBalance: increment(creatorEarnings),
      });
      
      // Create transaction record for buyer
      transactionId = generateId();
      transaction.set(db.collection('transactions').doc(transactionId), {
        transactionId,
        userId,
        type: 'EVENT_PURCHASE',
        amount: -event.priceTokens,
        description: `Event enrollment: ${event.title}`,
        eventId,
        creatorId: event.hostUserId,
        platformFee,
        creatorEarnings,
        createdAt: serverTimestamp(),
      });
      
      // Create transaction record for creator
      const creatorTxId = generateId();
      transaction.set(db.collection('transactions').doc(creatorTxId), {
        transactionId: creatorTxId,
        userId: event.hostUserId,
        type: 'EVENT_EARNINGS',
        amount: creatorEarnings,
        description: `Event enrollment from ${userData?.displayName || 'Unknown User'}: ${event.title}`,
        eventId,
        buyerId: userId,
        platformFee,
        createdAt: serverTimestamp(),
      });
    });
  }
  
  // Create attendee record
  const attendeeId = generateId();
  const checkInCode = generateCheckInCode();
  
  const platformFee = event.priceTokens > 0 
    ? Math.floor(event.priceTokens * EVENT_CONFIG.platformFeePercentage) 
    : 0;
  const creatorEarnings = event.priceTokens - platformFee;
  
  const attendee: EventAttendee = {
    attendeeId,
    eventId,
    eventTitle: event.title,
    userId,
    userName: userData?.displayName || 'Unknown User',
    userAvatar: userData?.profilePictureUrl,
    hostUserId: event.hostUserId,
    tokensAmount: event.priceTokens,
    platformFee,
    creatorEarnings,
    status: AttendeeStatus.CONFIRMED,
    riskCheckPassed: true,
    riskScoreSnapshot: riskCheck.riskScore,
    checkedIn: false,
    checkInCode,
    hasLocationAccess: true,
    enrolledAt: serverTimestamp() as Timestamp,
    confirmedAt: serverTimestamp() as Timestamp,
    transactionId,
  };
  
  await db.collection('event_attendees').doc(attendeeId).set(attendee);
  
  // Increment attendee count
  await db.collection('events').doc(eventId).update({
    attendeesCount: increment(1),
  });
  
  return {
    success: true,
    attendeeId,
    checkInCode,
    locationDetails: event.locationDetails,
    message: 'Successfully enrolled in event',
  };
});

/**
 * Leave an event (before it starts)
 */
export const leaveEvent = onCall<{
  eventId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId } = request.data;
  
  // Find attendee record
  const attendeeSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('status', '==', AttendeeStatus.CONFIRMED)
    .get();
  
  if (attendeeSnapshot.empty) {
    throw new HttpsError('not-found', 'You are not enrolled in this event');
  }
  
  const attendeeDoc = attendeeSnapshot.docs[0];
  const attendee = attendeeDoc.data() as EventAttendee;
  
  // Get event to check if it has started
  const eventDoc = await db.collection('events').doc(eventId).get();
  const event = eventDoc.data() as Event;
  
  const now = new Date();
  const eventStart = event.startTime.toDate();
  
  if (now >= eventStart) {
    throw new HttpsError('failed-precondition', 'Cannot leave an event that has already started');
  }
  
  // Update attendee status (NO REFUND per policy)
  await attendeeDoc.ref.update({
    status: AttendeeStatus.CANCELLED_BY_USER,
    hasLocationAccess: false,
  });
  
  // Decrement attendee count
  await db.collection('events').doc(eventId).update({
    attendeesCount: increment(-1),
  });
  
  return {
    success: true,
    message: 'You have left the event. Note: No refunds are provided for user cancellations.',
  };
});

/**
 * Check in to an event
 */
export const checkInToEvent = onCall<{
  eventId: string;
  checkInCode: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, checkInCode } = request.data;
  
  // Find attendee record
  const attendeeSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('checkInCode', '==', checkInCode)
    .where('status', '==', AttendeeStatus.CONFIRMED)
    .get();
  
  if (attendeeSnapshot.empty) {
    throw new HttpsError('not-found', 'Invalid check-in code or you are not enrolled');
  }
  
  const attendeeDoc = attendeeSnapshot.docs[0];
  const attendee = attendeeDoc.data() as EventAttendee;
  
  // Check if already checked in
  if (attendee.checkedIn) {
    throw new HttpsError('already-exists', 'You have already checked in');
  }
  
  // Update check-in status
  await attendeeDoc.ref.update({
    checkedIn: true,
    checkInTime: serverTimestamp(),
  });
  
  return {
    success: true,
    message: 'Successfully checked in to event',
  };
});

/**
 * Get user's enrolled events
 */
export const getMyEvents = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  
  const attendeesSnapshot = await db.collection('event_attendees')
    .where('userId', '==', userId)
    .where('status', 'in', [AttendeeStatus.CONFIRMED, AttendeeStatus.PENDING])
    .orderBy('enrolledAt', 'desc')
    .get();
  
  const attendees = attendeesSnapshot.docs.map(doc => doc.data() as EventAttendee);
  
  // Fetch full event details
  const eventIds = Array.from(new Set(attendees.map(a => a.eventId)));
  const events: Event[] = [];
  
  for (const eventId of eventIds) {
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (eventDoc.exists) {
      events.push(eventDoc.data() as Event);
    }
  }
  
  return {
    success: true,
    attendees,
    events,
  };
});

// ============================================================================
// SAFETY SURVEY
// ============================================================================

/**
 * Submit post-event safety survey
 */
export const submitEventSafetySurvey = onCall<{
  eventId: string;
  feltSafe: boolean;
  matchedDescription: boolean;
  wouldAttendAgain: boolean;
  concerns?: string;
  positiveExperience?: string;
  reportThreat: boolean;
  reportMisrepresentation: boolean;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Verify user attended the event
  const attendeeSnapshot = await db.collection('event_attendees')
    .where('eventId', '==', data.eventId)
    .where('userId', '==', userId)
    .where('status', '==', AttendeeStatus.CONFIRMED)
    .get();
  
  if (attendeeSnapshot.empty) {
    throw new HttpsError('permission-denied', 'You did not attend this event');
  }
  
  // Create survey
  const surveyId = generateId();
  const survey: EventSafetySurvey = {
    surveyId,
    eventId: data.eventId,
    userId,
    feltSafe: data.feltSafe,
    matchedDescription: data.matchedDescription,
    wouldAttendAgain: data.wouldAttendAgain,
    concerns: data.concerns,
    positiveExperience: data.positiveExperience,
    reportThreat: data.reportThreat,
    reportMisrepresentation: data.reportMisrepresentation,
    submittedAt: serverTimestamp() as Timestamp,
  };
  
  await db.collection('event_safety_surveys').doc(surveyId).set(survey);
  
  // If threat or major issues reported, create moderation case
  if (data.reportThreat || (!data.feltSafe && data.concerns)) {
    const eventDoc = await db.collection('events').doc(data.eventId).get();
    const event = eventDoc.data() as Event;
    
    const caseId = generateId();
    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      type: 'EVENT_SAFETY_CONCERN',
      reporterId: userId,
      reportedUserId: event.hostUserId,
      eventId: data.eventId,
      surveyId,
      concerns: data.concerns,
      reportThreat: data.reportThreat,
      status: 'OPEN',
      priority: data.reportThreat ? 'HIGH' : 'MEDIUM',
      createdAt: serverTimestamp(),
    });
  }
  
  return {
    success: true,
    message: 'Thank you for your feedback',
  };
});