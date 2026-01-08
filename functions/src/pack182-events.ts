/**
 * PACK 182: Avalo Pro Event Host Suite
 * Backend implementation for professional event hosting system
 * 
 * CRITICAL SAFETY RULES:
 * - Educational, lifestyle, career, fitness, or creative events ONLY
 * - Zero tolerance for romantic/NSFW/escort events
 * - Token-only payments (65% creator / 35% Avalo)
 * - Location privacy until ticket purchase
 * - No algorithm boosts or visibility manipulation
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  ProEvent,
  EventTicket,
  EventWaitlist,
  EventFeedback,
  EventCertificate,
  EventScheduleBlock,
  EventMaterial,
  EventCoHost,
  EventCategory,
  EventFormat,
  EventStatus,
  AttendeeStatus,
  validateEventData,
  containsBlockedKeywords,
  generateCheckInCode,
  calculateRevenueSplit,
  EVENT_CONFIG,
} from './pack182-events-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Check if user is event host or co-host
 */
async function canManageEvent(userId: string, eventId: string): Promise<boolean> {
  const eventDoc = await db.collection('pro_events').doc(eventId).get();
  if (!eventDoc.exists) {
    return false;
  }
  
  const event = eventDoc.data() as ProEvent;
  if (event.hostUserId === userId) {
    return true;
  }
  
  // Check co-hosts
  if (event.coHosts) {
    return event.coHosts.some(coHost => coHost.userId === userId);
  }
  
  return false;
}

/**
 * Get user's risk profile for event participation
 */
async function getUserRiskProfile(userId: string): Promise<{
  riskScore: number;
  flags: string[];
  enforcementLevel: string;
}> {
  const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
  if (!trustDoc.exists) {
    return { riskScore: 0, flags: [], enforcementLevel: 'ACTIVE' };
  }
  
  const trustData = trustDoc.data() as any;
  return {
    riskScore: trustData.riskScore || 0,
    flags: trustData.flags || [],
    enforcementLevel: trustData.enforcementLevel || 'ACTIVE',
  };
}

/**
 * Perform risk screening for event attendance
 */
async function performAttendeeRiskScreening(userId: string): Promise<{
  passed: boolean;
  reasons: string[];
}> {
  const profile = await getUserRiskProfile(userId);
  const reasons: string[] = [];
  let passed = true;
  
  // Check risk score
  if (profile.riskScore >= 80) {
    passed = false;
    reasons.push('HIGH_RISK_SCORE');
  }
  
  // Check for dangerous flags
  const dangerousFlags = [
    'KYC_BLOCKED',
    'STALKING_DETECTED',
    'HARASSMENT_HISTORY',
    'PAYMENT_FRAUD',
  ];
  
  for (const flag of profile.flags) {
    if (dangerousFlags.includes(flag)) {
      passed = false;
      reasons.push(`FLAG_${flag}`);
    }
  }
  
  // Check enforcement level
  if (['HARD_RESTRICTED', 'SUSPENDED'].includes(profile.enforcementLevel)) {
    passed = false;
    reasons.push('ACCOUNT_RESTRICTED');
  }
  
  return { passed, reasons };
}

// ============================================================================
// EVENT CREATION & MANAGEMENT
// ============================================================================

/**
 * Create professional event with full features
 */
export const createProEvent = onCall<{
  title: string;
  description: string;
  category: EventCategory;
  format: EventFormat;
  startTime: string;
  endTime: string;
  timezone: string;
  ticketTypes: Array<{
    name: string;
    description?: string;
    priceTokens: number;
    capacity?: number;
    perks?: string[];
  }>;
  capacity: number;
  region: string;
  locationDetails?: any;
  onlineDetails?: any;
  schedule?: Array<{
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    isBreak: boolean;
  }>;
  safetyRules?: string[];
  ageRestriction?: number;
  requiresApproval?: boolean;
  tags?: string[];
  featuredImage?: string;
}>({ region: 'us-central1' }, async (request) => {
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
  
  // Validate event data
  const validation = validateEventData({
    title: data.title,
    description: data.description,
    category: data.category,
    capacity: data.capacity,
  } as Partial<ProEvent>);
  
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.errors.join(', '));
  }
  
  // Safety check for NSFW/romantic content
  if (containsBlockedKeywords(data.title) || containsBlockedKeywords(data.description)) {
    throw new HttpsError(
      'invalid-argument',
      'Event contains inappropriate content. Only educational, fitness, creative, lifestyle, or business events allowed.'
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
    throw new HttpsError('invalid-argument', 'Event duration cannot exceed 8 hours');
  }
  
  const advanceNotice = startTime.getTime() - now.getTime();
  if (advanceNotice < EVENT_CONFIG.minAdvanceNotice) {
    throw new HttpsError('invalid-argument', 'Event must be created at least 24 hours in advance');
  }
  
  // Process ticket types
  const ticketTypes = data.ticketTypes.map((ticket, index) => {
    if (ticket.priceTokens < 0 || ticket.priceTokens > EVENT_CONFIG.maxPriceTokens) {
      throw new HttpsError('invalid-argument', `Invalid price for ticket type ${index + 1}`);
    }
    
    return {
      ticketTypeId: generateId(),
      name: ticket.name,
      description: ticket.description || '',
      priceTokens: ticket.priceTokens,
      capacity: ticket.capacity,
      soldCount: 0,
      perks: ticket.perks || [],
      isAvailable: true,
    };
  });
  
  // Process schedule if provided
  const schedule: EventScheduleBlock[] = [];
  if (data.schedule && data.schedule.length > 0) {
    for (const block of data.schedule) {
      schedule.push({
        blockId: generateId(),
        title: block.title,
        description: block.description,
        startTime: Timestamp.fromDate(new Date(block.startTime)),
        endTime: Timestamp.fromDate(new Date(block.endTime)),
        hostUserId: userId,
        materials: [],
        isBreak: block.isBreak,
      });
    }
  }
  
  // Set address reveal time (24-72h before event)
  let addressRevealTime: Timestamp | undefined;
  if (data.locationDetails && data.format !== 'ONLINE') {
    const hoursBeforeEvent = EVENT_CONFIG.addressRevealMinHours;
    addressRevealTime = Timestamp.fromMillis(
      startTime.getTime() - (hoursBeforeEvent * 60 * 60 * 1000)
    );
  }
  
  // Create event document
  const eventId = generateId();
  const event: ProEvent = {
    eventId,
    hostUserId: userId,
    hostName: userData?.displayName || 'Unknown Host',
    hostAvatar: userData?.profilePictureUrl,
    coHosts: [],
    
    title: data.title,
    description: data.description,
    category: data.category,
    format: data.format,
    
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    timezone: data.timezone,
    schedule,
    
    ticketTypes,
    capacity: data.capacity,
    attendeeCount: 0,
    waitlistCount: 0,
    
    region: data.region,
    locationDetails: data.locationDetails ? {
      ...data.locationDetails,
      addressRevealTime,
    } : undefined,
    onlineDetails: data.onlineDetails,
    
    materials: [],
    
    requiresApproval: data.requiresApproval || false,
    ageRestriction: data.ageRestriction,
    safetyRules: data.safetyRules || [
      'Respectful behavior required',
      'No harassment or discrimination',
      'Follow venue rules and local laws',
    ],
    
    status: EventStatus.SCHEDULED,
    isActive: true,
    featuredImage: data.featuredImage,
    tags: data.tags || [],
    
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    publishedAt: serverTimestamp() as Timestamp,
  };
  
  // Save to Firestore
  await db.collection('pro_events').doc(eventId).set(event);
  
  console.log(`[PACK182] Pro event created: ${eventId} by ${userId}`);
  
  return {
    success: true,
    eventId,
    message: 'Professional event created successfully',
  };
});

/**
 * Add co-host to event
 */
export const addEventCoHost = onCall<{
  eventId: string;
  coHostUserId: string;
  role: 'CO_HOST' | 'ASSISTANT';
  permissions: {
    canEditSchedule: boolean;
    canManageAttendees: boolean;
    canCheckIn: boolean;
    canPostAnnouncements: boolean;
  };
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, coHostUserId, role, permissions } = request.data;
  
  // Get event
  const eventRef = db.collection('pro_events').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as ProEvent;
  
  // Only host can add co-hosts
  if (event.hostUserId !== userId) {
    throw new HttpsError('permission-denied', 'Only the event host can add co-hosts');
  }
  
  // Get co-host user data
  const coHostDoc = await db.collection('users').doc(coHostUserId).get();
  if (!coHostDoc.exists) {
    throw new HttpsError('not-found', 'Co-host user not found');
  }
  
  const coHostData = coHostDoc.data();
  
  // Create co-host entry
  const coHost: EventCoHost = {
    userId: coHostUserId,
    userName: coHostData?.displayName || 'Unknown User',
    userAvatar: coHostData?.profilePictureUrl,
    role,
    permissions,
    addedAt: serverTimestamp() as Timestamp,
  };
  
  // Add to co-hosts array
  await eventRef.update({
    coHosts: [...(event.coHosts || []), coHost],
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    message: 'Co-host added successfully',
  };
});

/**
 * Add material/resource to event
 */
export const addEventMaterial = onCall<{
  eventId: string;
  title: string;
  description?: string;
  type: 'PDF' | 'VIDEO' | 'AUDIO' | 'LINK' | 'FILE';
  fileUrl: string;
  fileSize?: number;
  availableAt: 'BEFORE' | 'DURING' | 'AFTER';
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Check permissions
  const canManage = await canManageEvent(userId, data.eventId);
  if (!canManage) {
    throw new HttpsError(
      'permission-denied',
      'Only event host or co-hosts can add materials'
    );
  }
  
  // Get event
  const eventRef = db.collection('pro_events').doc(data.eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as ProEvent;
  
  // Create material entry
  const material: EventMaterial = {
    materialId: generateId(),
    title: data.title,
    description: data.description,
    type: data.type,
    fileUrl: data.fileUrl,
    fileSize: data.fileSize,
    isPreviewable: data.type === 'PDF',
    availableAt: data.availableAt,
    uploadedAt: serverTimestamp() as Timestamp,
  };
  
  // Add to materials array
  await eventRef.update({
    materials: [...(event.materials || []), material],
    updatedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    materialId: material.materialId,
    message: 'Material added successfully',
  };
});

// ============================================================================
// TICKET PURCHASE & WAITLIST
// ============================================================================

/**
 * Purchase event ticket with risk screening
 */
export const purchaseEventTicket = onCall<{
  eventId: string;
  ticketTypeId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, ticketTypeId } = request.data;
  
  // Get event
  const eventDoc = await db.collection('pro_events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as ProEvent;
  
  // Check event status
  if (!event.isActive || event.status !== EventStatus.SCHEDULED) {
    throw new HttpsError('failed-precondition', 'Event is not available for registration');
  }
  
  // Cannot purchase own event
  if (event.hostUserId === userId) {
    throw new HttpsError('failed-precondition', 'Cannot purchase ticket to your own event');
  }
  
  // Check if already has ticket
  const existingTicket = await db.collection('event_tickets')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();
  
  if (!existingTicket.empty) {
    throw new HttpsError('already-exists', 'You already have a ticket for this event');
  }
  
  // Get ticket type
  const ticketType = event.ticketTypes.find(t => t.ticketTypeId === ticketTypeId);
  if (!ticketType || !ticketType.isAvailable) {
    throw new HttpsError('not-found', 'Ticket type not available');
  }
  
  // Check capacity
  if (ticketType.capacity && ticketType.soldCount >= ticketType.capacity) {
    throw new HttpsError('failed-precondition', 'This ticket type is sold out');
  }
  
  if (event.attendeeCount >= event.capacity) {
    throw new HttpsError('failed-precondition', 'Event is at full capacity');
  }
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Perform risk screening
  const riskCheck = await performAttendeeRiskScreening(userId);
  
  if (!riskCheck.passed) {
    // Log denial
    await db.collection('event_safety_logs').add({
      logId: generateId(),
      eventId,
      logType: 'ATTENDEE_DENIED',
      severity: 'MEDIUM',
      description: `User ${userId} denied ticket purchase: ${riskCheck.reasons.join(', ')}`,
      userId,
      createdAt: serverTimestamp(),
    });
    
    throw new HttpsError(
      'permission-denied',
      'Your account is currently restricted from purchasing event tickets. Please contact support.'
    );
  }
  
  // Handle payment if ticket is paid
  let transactionId: string | undefined;
  const { platformFee, hostEarnings } = calculateRevenueSplit(ticketType.priceTokens);
  
  if (ticketType.priceTokens > 0) {
    // Check user balance
    const walletDoc = await db.collection('users').doc(userId)
      .collection('wallet').doc('main').get();
    const walletData = walletDoc.data();
    const currentBalance = walletData?.tokenBalance || 0;
    
    if (currentBalance < ticketType.priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${ticketType.priceTokens}, Available: ${currentBalance}`
      );
    }
    
    // Process payment transaction
    await db.runTransaction(async (transaction) => {
      const buyerWalletRef = db.collection('users').doc(userId)
        .collection('wallet').doc('main');
      const hostWalletRef = db.collection('users').doc(event.hostUserId)
        .collection('wallet').doc('main');
      
      // Deduct from buyer
      transaction.update(buyerWalletRef, {
        tokenBalance: increment(-ticketType.priceTokens),
      });
      
      // Add to host
      transaction.update(hostWalletRef, {
        tokenBalance: increment(hostEarnings),
      });
      
      // Create transaction record
      transactionId = generateId();
      transaction.set(db.collection('transactions').doc(transactionId), {
        transactionId,
        userId,
        type: 'EVENT_TICKET_PURCHASE',
        amount: -ticketType.priceTokens,
        description: `Event ticket: ${event.title}`,
        eventId,
        ticketTypeId,
        hostId: event.hostUserId,
        platformFee,
        hostEarnings,
        createdAt: serverTimestamp(),
      });
    });
  }
  
  // Create ticket
  const ticketId = generateId();
  const checkInCode = generateCheckInCode();
  
  const ticket: EventTicket = {
    ticketId,
    eventId,
    eventTitle: event.title,
    userId,
    userName: userData?.displayName || 'Unknown User',
    userEmail: userData?.email,
    ticketTypeId,
    ticketTypeName: ticketType.name,
    priceTokens: ticketType.priceTokens,
    platformFee,
    hostEarnings,
    status: AttendeeStatus.REGISTERED,
    checkInCode,
    hasLocationAccess: true,
    hasOnlineAccess: event.format === 'ONLINE' || event.format === 'HYBRID',
    purchaseTransactionId: transactionId || '',
    purchasedAt: serverTimestamp() as Timestamp,
  };
  
  await db.collection('event_tickets').doc(ticketId).set(ticket);
  
  // Update event counts and ticket type sold count
  await db.collection('pro_events').doc(eventId).update({
    attendeeCount: increment(1),
    [`ticketTypes.${event.ticketTypes.findIndex(t => t.ticketTypeId === ticketTypeId)}.soldCount`]: increment(1),
  });
  
  console.log(`[PACK182] Ticket purchased: ${ticketId} for event ${eventId}`);
  
  return {
    success: true,
    ticketId,
    checkInCode,
    message: 'Ticket purchased successfully',
  };
});

/**
 * Join event waitlist
 */
export const joinEventWaitlist = onCall<{
  eventId: string;
  ticketTypeId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, ticketTypeId } = request.data;
  
  // Get event
  const eventDoc = await db.collection('pro_events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  
  const event = eventDoc.data() as ProEvent;
  
  // Check if already on waitlist
  const existingWaitlist = await db.collection('event_waitlist')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('ticketTypeId', '==', ticketTypeId)
    .get();
  
  if (!existingWaitlist.empty) {
    throw new HttpsError('already-exists', 'You are already on the waitlist');
  }
  
  // Get current waitlist position
  const waitlistSnapshot = await db.collection('event_waitlist')
    .where('eventId', '==', eventId)
    .where('ticketTypeId', '==', ticketTypeId)
    .orderBy('position', 'desc')
    .limit(1)
    .get();
  
  const nextPosition = waitlistSnapshot.empty 
    ? 1 
    : (waitlistSnapshot.docs[0].data().position + 1);
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Create waitlist entry
  const waitlistId = generateId();
  const waitlistEntry: EventWaitlist = {
    waitlistId,
    eventId,
    userId,
    userName: userData?.displayName || 'Unknown User',
    ticketTypeId,
    position: nextPosition,
    notified: false,
    joinedAt: serverTimestamp() as Timestamp,
  };
  
  await db.collection('event_waitlist').doc(waitlistId).set(waitlistEntry);
  
  // Update event waitlist count
  await db.collection('pro_events').doc(eventId).update({
    waitlistCount: increment(1),
  });
  
  return {
    success: true,
    waitlistId,
    position: nextPosition,
    message: 'Added to waitlist successfully',
  };
});

// ============================================================================
// CHECK-IN & ATTENDANCE
// ============================================================================

/**
 * Check-in attendee with QR code
 */
export const checkInAttendee = onCall<{
  eventId: string;
  checkInCode: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const { eventId, checkInCode } = request.data;
  
  // Check if user can check in attendees
  const canManage = await canManageEvent(userId, eventId);
  if (!canManage) {
    throw new HttpsError(
      'permission-denied',
      'Only event host or co-hosts can check in attendees'
    );
  }
  
  // Find ticket
  const ticketSnapshot = await db.collection('event_tickets')
    .where('eventId', '==', eventId)
    .where('checkInCode', '==', checkInCode)
    .where('status', '==', AttendeeStatus.REGISTERED)
    .get();
  
  if (ticketSnapshot.empty) {
    throw new HttpsError('not-found', 'Invalid check-in code or ticket already used');
  }
  
  const ticketDoc = ticketSnapshot.docs[0];
  
  // Update ticket status
  await ticketDoc.ref.update({
    status: AttendeeStatus.CHECKED_IN,
    checkedInAt: serverTimestamp(),
    checkedInBy: userId,
  });
  
  return {
    success: true,
    attendeeName: ticketDoc.data().userName,
    message: 'Check-in successful',
  };
});

// ============================================================================
// POST-EVENT FEATURES
// ============================================================================

/**
 * Submit event feedback
 */
export const submitEventFeedback = onCall<{
  eventId: string;
  overallRating: number;
  contentQuality: number;
  hostPerformance: number;
  venueRating?: number;
  feltSafe: boolean;
  matchedDescription: boolean;
  wouldRecommend: boolean;
  positiveComments?: string;
  improvementSuggestions?: string;
  reportConcern: boolean;
  concernDetails?: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Verify user attended the event
  const ticketSnapshot = await db.collection('event_tickets')
    .where('eventId', '==', data.eventId)
    .where('userId', '==', userId)
    .where('status', '==', AttendeeStatus.CHECKED_IN)
    .get();
  
  if (ticketSnapshot.empty) {
    throw new HttpsError('permission-denied', 'You must have attended the event to submit feedback');
  }
  
  // Validate ratings
  if (data.overallRating < 1 || data.overallRating > 5 ||
      data.contentQuality < 1 || data.contentQuality > 5 ||
      data.hostPerformance < 1 || data.hostPerformance > 5) {
    throw new HttpsError('invalid-argument', 'Ratings must be between 1 and 5');
  }
  
  // Create feedback
  const feedbackId = generateId();
  const feedback: EventFeedback = {
    feedbackId,
    eventId: data.eventId,
    userId,
    overallRating: data.overallRating,
    contentQuality: data.contentQuality,
    hostPerformance: data.hostPerformance,
    venueRating: data.venueRating,
    feltSafe: data.feltSafe,
    matchedDescription: data.matchedDescription,
    wouldRecommend: data.wouldRecommend,
    positiveComments: data.positiveComments,
    improvementSuggestions: data.improvementSuggestions,
    reportConcern: data.reportConcern,
    concernDetails: data.concernDetails,
    submittedAt: serverTimestamp() as Timestamp,
  };
  
  await db.collection('event_feedback').doc(feedbackId).set(feedback);
  
  // If concern reported, create moderation case
  if (data.reportConcern && data.concernDetails) {
    const eventDoc = await db.collection('pro_events').doc(data.eventId).get();
    const event = eventDoc.data() as ProEvent;
    
    const caseId = generateId();
    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      type: 'EVENT_SAFETY_CONCERN',
      reporterId: userId,
      reportedUserId: event.hostUserId,
      eventId: data.eventId,
      feedbackId,
      concerns: data.concernDetails,
      status: 'OPEN',
      priority: 'HIGH',
      createdAt: serverTimestamp(),
    });
  }
  
  return {
    success: true,
    message: 'Feedback submitted successfully',
  };
});

/**
 * Issue certificate of completion
 */
export const issueEventCertificate = onCall<{
  eventId: string;
  userId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const issuerId = request.auth.uid;
  const { eventId, userId } = request.data;
  
  // Check permissions
  const canManage = await canManageEvent(issuerId, eventId);
  if (!canManage) {
    throw new HttpsError(
      'permission-denied',
      'Only event host or co-hosts can issue certificates'
    );
  }
  
  // Verify attendance
  const ticketSnapshot = await db.collection('event_tickets')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('status', '==', AttendeeStatus.CHECKED_IN)
    .get();
  
  if (ticketSnapshot.empty) {
    throw new HttpsError('failed-precondition', 'User must have attended the event');
  }
  
  // Get event and user data
  const eventDoc = await db.collection('pro_events').doc(eventId).get();
  const event = eventDoc.data() as ProEvent;
  
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  // Check if certificate already issued
  const existingCert = await db.collection('event_certificates')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();
  
  if (!existingCert.empty) {
    throw new HttpsError('already-exists', 'Certificate already issued');
  }
  
  // Generate certificate
  const certificateId = generateId();
  const verificationCode = generateId().substring(0, 12).toUpperCase();
  
  const certificate: EventCertificate = {
    certificateId,
    eventId,
    eventTitle: event.title,
    userId,
    userName: userData?.displayName || 'Unknown User',
    completionDate: event.endTime,
    certificateUrl: `https://avalo.app/certificates/${certificateId}`, // Placeholder
    verificationCode,
    issuedAt: serverTimestamp() as Timestamp,
  };
  
  await db.collection('event_certificates').doc(certificateId).set(certificate);
  
  return {
    success: true,
    certificateId,
    verificationCode,
    certificateUrl: certificate.certificateUrl,
    message: 'Certificate issued successfully',
  };
});

console.log('✅ PACK 182 - Professional Event Host Suite Functions Loaded');