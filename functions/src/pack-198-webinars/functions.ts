/**
 * PACK 198 — Event Management Functions
 * Professional livestream conference operations
 */

import * as admin from 'firebase-admin';
import { https } from 'firebase-functions';
import {
  Event,
  EventTicket,
  EventSession,
  EventMaterial,
  EventQuestion,
  EventPoll,
  EventChatMessage,
  EventModerationFlag,
  EventCertificate,
  EventStatus,
  AttendeeRole,
  QuestionStatus,
  ModerationAction,
  CreateEventInput,
  UpdateEventInput,
  PurchaseTicketInput,
  JoinEventInput,
  SubmitQuestionInput,
  CreatePollInput,
  VotePollInput,
  SendMessageInput,
  UploadMaterialInput,
  ModerateContentInput,
  GenerateCertificateInput,
} from './types';
import {
  validateEventTitle,
  validateEventDescription,
  validateEventCategory,
  validateChatMessage,
  validatePollQuestion,
  validateMaterialContent,
  calculateToxicityScore,
  shouldAutoModerate,
  validateRevenueShare,
  canEnableCertificate,
} from './validation';

const db = admin.firestore();

export const createEvent = https.onCall(async (data: CreateEventInput, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const titleValidation = validateEventTitle(data.title);
  if (!titleValidation.isValid) {
    throw new https.HttpsError(
      'invalid-argument',
      titleValidation.reason || 'Invalid event title',
      { blockedContent: titleValidation.blockedContent }
    );
  }

  const descValidation = validateEventDescription(data.description);
  if (!descValidation.isValid) {
    throw new https.HttpsError(
      'invalid-argument',
      descValidation.reason || 'Invalid event description',
      { blockedContent: descValidation.blockedContent }
    );
  }

  const categoryValidation = validateEventCategory(
    data.category,
    data.title,
    data.description
  );
  if (!categoryValidation.isValid) {
    throw new https.HttpsError(
      'invalid-argument',
      categoryValidation.reason || 'Invalid category for this content',
      { blockedContent: categoryValidation.blockedContent }
    );
  }

  if (data.price < 0) {
    throw new https.HttpsError('invalid-argument', 'Price cannot be negative');
  }

  if (data.supportedLanguages.length === 0) {
    data.supportedLanguages = [data.primaryLanguage];
  }

  const eventRef = db.collection('events').doc();
  const event: Event = {
    id: eventRef.id,
    organizerId: userId,
    title: data.title,
    description: data.description,
    category: data.category,
    status: EventStatus.DRAFT,
    
    scheduledStartTime: admin.firestore.Timestamp.fromDate(data.scheduledStartTime),
    scheduledEndTime: admin.firestore.Timestamp.fromDate(data.scheduledEndTime),
    timezone: data.timezone,
    
    ticketType: data.ticketType,
    price: data.price,
    currency: data.currency,
    maxAttendees: data.maxAttendees,
    soldTickets: 0,
    
    enableChat: data.enableChat,
    enableQA: data.enableQA,
    enablePolls: data.enablePolls,
    enableBreakoutRooms: data.enableBreakoutRooms,
    enableDownloadables: data.enableDownloadables,
    enableCertificate: data.enableCertificate,
    
    primaryLanguage: data.primaryLanguage,
    enableTranslation: data.enableTranslation,
    supportedLanguages: data.supportedLanguages,
    
    allowReplay: data.allowReplay,
    
    toxicityThreshold: 0.3,
    autoModeration: true,
    
    tags: data.tags || [],
    presenters: data.presenters || [userId],
    
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    
    totalViews: 0,
    peakConcurrentViewers: 0,
    averageWatchTime: 0,
    
    totalRevenue: 0,
    creatorShare: 0,
    platformShare: 0,
  };

  await eventRef.set(event);

  return { eventId: event.id, event };
});

export const updateEvent = https.onCall(
  async (data: { eventId: string; updates: UpdateEventInput }, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventRef = db.collection('events').doc(data.eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new https.HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as Event;

    if (event.organizerId !== userId) {
      throw new https.HttpsError('permission-denied', 'Only event organizer can update');
    }

    if (event.status === EventStatus.LIVE || event.status === EventStatus.ENDED) {
      throw new https.HttpsError('failed-precondition', 'Cannot update live or ended events');
    }

    const updates: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.updates.title) updates.title = data.updates.title;
    if (data.updates.description) updates.description = data.updates.description;
    if (data.updates.category) updates.category = data.updates.category;
    if (data.updates.scheduledStartTime) {
      updates.scheduledStartTime = admin.firestore.Timestamp.fromDate(data.updates.scheduledStartTime);
    }
    if (data.updates.scheduledEndTime) {
      updates.scheduledEndTime = admin.firestore.Timestamp.fromDate(data.updates.scheduledEndTime);
    }
    if (data.updates.timezone) updates.timezone = data.updates.timezone;
    if (data.updates.price !== undefined) updates.price = data.updates.price;
    if (data.updates.maxAttendees) updates.maxAttendees = data.updates.maxAttendees;
    if (data.updates.enableChat !== undefined) updates.enableChat = data.updates.enableChat;
    if (data.updates.enableQA !== undefined) updates.enableQA = data.updates.enableQA;
    if (data.updates.enablePolls !== undefined) updates.enablePolls = data.updates.enablePolls;
    if (data.updates.enableBreakoutRooms !== undefined) updates.enableBreakoutRooms = data.updates.enableBreakoutRooms;
    if (data.updates.enableDownloadables !== undefined) updates.enableDownloadables = data.updates.enableDownloadables;
    if (data.updates.enableCertificate !== undefined) updates.enableCertificate = data.updates.enableCertificate;
    if (data.updates.supportedLanguages) updates.supportedLanguages = data.updates.supportedLanguages;
    if (data.updates.allowReplay !== undefined) updates.allowReplay = data.updates.allowReplay;
    if (data.updates.tags) updates.tags = data.updates.tags;
    if (data.updates.presenters) updates.presenters = data.updates.presenters;
    if (data.updates.status) updates.status = data.updates.status;

    if (data.updates.title) {
      const validation = validateEventTitle(data.updates.title);
      if (!validation.isValid) {
        throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid title');
      }
    }

    if (data.updates.description) {
      const validation = validateEventDescription(data.updates.description);
      if (!validation.isValid) {
        throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid description');
      }
    }

    await eventRef.update(updates);

    return { success: true };
  }
);

export const publishEvent = https.onCall(async (data: { eventId: string }, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const eventRef = db.collection('events').doc(data.eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    throw new https.HttpsError('not-found', 'Event not found');
  }

  const event = eventDoc.data() as Event;

  if (event.organizerId !== userId) {
    throw new https.HttpsError('permission-denied', 'Only event organizer can publish');
  }

  if (event.status !== EventStatus.DRAFT) {
    throw new https.HttpsError('failed-precondition', 'Event is already published');
  }

  await eventRef.update({
    status: EventStatus.PUBLISHED,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

export const purchaseEventTicket = https.onCall(
  async (data: PurchaseTicketInput, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventRef = db.collection('events').doc(data.eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new https.HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as Event;

    if (event.status !== EventStatus.PUBLISHED) {
      throw new https.HttpsError('failed-precondition', 'Event is not available for purchase');
    }

    if (event.maxAttendees && event.soldTickets >= event.maxAttendees) {
      throw new https.HttpsError('resource-exhausted', 'Event is sold out');
    }

    const existingTicket = await db
      .collection('event_tickets')
      .where('eventId', '==', data.eventId)
      .where('userId', '==', userId)
      .where('paymentStatus', '==', 'completed')
      .limit(1)
      .get();

    if (!existingTicket.empty) {
      throw new https.HttpsError('already-exists', 'User already purchased ticket');
    }

    const ticketRef = db.collection('event_tickets').doc();
    const accessCode = `${event.id.substring(0, 4)}-${Date.now().toString(36).toUpperCase()}`;

    const ticket: EventTicket = {
      id: ticketRef.id,
      eventId: data.eventId,
      userId,
      ticketType: data.ticketType,
      price: event.price,
      currency: event.currency,
      paymentIntentId: 'placeholder',
      paymentStatus: 'pending',
      purchasedAt: admin.firestore.Timestamp.now(),
      accessGranted: false,
      accessCode,
      eventsIncluded: data.eventsIncluded,
      eventsAttended: [],
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await ticketRef.set(ticket);

    return { ticketId: ticket.id, accessCode, requiresPayment: event.price > 0 };
  }
);

export const joinEvent = https.onCall(async (data: JoinEventInput, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const eventRef = db.collection('events').doc(data.eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    throw new https.HttpsError('not-found', 'Event not found');
  }

  const event = eventDoc.data() as Event;

  if (event.status !== EventStatus.LIVE) {
    throw new https.HttpsError('failed-precondition', 'Event is not live');
  }

  const ticketQuery = await db
    .collection('event_tickets')
    .where('eventId', '==', data.eventId)
    .where('userId', '==', userId)
    .where('accessCode', '==', data.accessCode)
    .where('accessGranted', '==', true)
    .limit(1)
    .get();

  const isOrganizer = event.organizerId === userId;
  const isPresenter = event.presenters.includes(userId);

  if (ticketQuery.empty && !isOrganizer && !isPresenter) {
    throw new https.HttpsError('permission-denied', 'Invalid access code or no ticket found');
  }

  const sessionRef = db.collection('event_sessions').doc();
  const session: EventSession = {
    id: sessionRef.id,
    eventId: data.eventId,
    userId,
    joinedAt: admin.firestore.Timestamp.now(),
    duration: 0,
    role: isOrganizer
      ? AttendeeRole.HOST
      : isPresenter
      ? AttendeeRole.PRESENTER
      : AttendeeRole.ATTENDEE,
    messagesPosted: 0,
    questionsAsked: 0,
    pollsAnswered: 0,
    connectionQuality: 'good',
    buffering: 0,
    warnings: 0,
    muted: false,
    blocked: false,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await sessionRef.set(session);

  const currentViewers = (
    await db
      .collection('event_sessions')
      .where('eventId', '==', data.eventId)
      .where('leftAt', '==', null)
      .count()
      .get()
  ).data().count;

  if (currentViewers > event.peakConcurrentViewers) {
    await eventRef.update({
      peakConcurrentViewers: currentViewers,
    });
  }

  return { sessionId: session.id, streamUrl: 'placeholder-stream-url' };
});

export const submitQuestion = https.onCall(async (data: SubmitQuestionInput, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const validation = validateChatMessage(data.question);
  if (!validation.isValid) {
    throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid question');
  }

  const sessionQuery = await db
    .collection('event_sessions')
    .where('eventId', '==', data.eventId)
    .where('userId', '==', userId)
    .where('leftAt', '==', null)
    .limit(1)
    .get();

  if (sessionQuery.empty) {
    throw new https.HttpsError('permission-denied', 'User not in event session');
  }

  const session = sessionQuery.docs[0].data() as EventSession;

  if (session.blocked) {
    throw new https.HttpsError('permission-denied', 'User is blocked from participation');
  }

  const questionRef = db.collection('event_questions').doc();
  const question: EventQuestion = {
    id: questionRef.id,
    eventId: data.eventId,
    userId,
    sessionId: session.id,
    question: data.question,
    status: QuestionStatus.PENDING,
    upvotes: 0,
    upvotedBy: [],
    isPaid: data.isPaid || false,
    paidAmount: data.paidAmount,
    priority: data.isPaid ? 100 : 0,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await questionRef.set(question);

  await db
    .collection('event_sessions')
    .doc(session.id)
    .update({
      questionsAsked: admin.firestore.FieldValue.increment(1),
    });

  return { questionId: question.id };
});

export const createPoll = https.onCall(async (data: CreatePollInput, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const eventRef = db.collection('events').doc(data.eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    throw new https.HttpsError('not-found', 'Event not found');
  }

  const event = eventDoc.data() as Event;

  if (event.organizerId !== userId && !event.presenters.includes(userId)) {
    throw new https.HttpsError('permission-denied', 'Only organizers and presenters can create polls');
  }

  const validation = validatePollQuestion(data.question, data.options);
  if (!validation.isValid) {
    throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid poll');
  }

  const pollRef = db.collection('event_polls').doc();
  const poll: EventPoll = {
    id: pollRef.id,
    eventId: data.eventId,
    createdBy: userId,
    question: data.question,
    options: data.options,
    votes: {},
    voterIds: [],
    allowMultiple: data.allowMultiple,
    anonymous: data.anonymous,
    startTime: admin.firestore.Timestamp.now(),
    active: true,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  data.options.forEach((_, index) => {
    poll.votes[index.toString()] = 0;
  });

  await pollRef.set(poll);

  return { pollId: poll.id };
});

export const sendEventMessage = https.onCall(async (data: SendMessageInput, context) => {
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const validation = validateChatMessage(data.content);
  if (!validation.isValid) {
    throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid message');
  }

  const sessionQuery = await db
    .collection('event_sessions')
    .where('eventId', '==', data.eventId)
    .where('userId', '==', userId)
    .where('leftAt', '==', null)
    .limit(1)
    .get();

  if (sessionQuery.empty) {
    throw new https.HttpsError('permission-denied', 'User not in event session');
  }

  const session = sessionQuery.docs[0].data() as EventSession;

  if (session.blocked || session.muted) {
    throw new https.HttpsError('permission-denied', 'User is blocked or muted');
  }

  const toxicityScore = calculateToxicityScore(data.content);
  const eventDoc = await db.collection('events').doc(data.eventId).get();
  const event = eventDoc.data() as Event;

  const moderation = shouldAutoModerate(toxicityScore, event.toxicityThreshold, {
    warnings: session.warnings,
    previousFlags: 0,
  });

  const messageRef = db.collection('event_chat_logs').doc();
  const message: EventChatMessage = {
    id: messageRef.id,
    eventId: data.eventId,
    userId,
    sessionId: session.id,
    content: data.content,
    type: 'text',
    toxicityScore,
    flagged: moderation.shouldModerate,
    hidden: moderation.action === 'shadow_mute' || moderation.action === 'block',
    replyToId: data.replyToId,
    timestamp: admin.firestore.Timestamp.now(),
  };

  await messageRef.set(message);

  if (moderation.shouldModerate) {
    const flagRef = db.collection('event_moderation_flags').doc();
    const flag: EventModerationFlag = {
      id: flagRef.id,
      eventId: data.eventId,
      targetType: 'message',
      targetId: message.id,
      userId,
      flagType: 'toxicity',
      severity: toxicityScore > 0.7 ? 'critical' : toxicityScore > 0.5 ? 'high' : 'medium',
      autoDetected: true,
      detectionScore: toxicityScore,
      detectionReasons: ['High toxicity score detected'],
      action: moderation.action as ModerationAction,
      actionAt: admin.firestore.Timestamp.now(),
      reviewed: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await flagRef.set(flag);

    if (moderation.action === 'warning') {
      await db
        .collection('event_sessions')
        .doc(session.id)
        .update({
          warnings: admin.firestore.FieldValue.increment(1),
        });
    } else if (moderation.action === 'shadow_mute') {
      await db
        .collection('event_sessions')
        .doc(session.id)
        .update({ muted: true });
    } else if (moderation.action === 'block') {
      await db
        .collection('event_sessions')
        .doc(session.id)
        .update({ blocked: true });
    }
  }

  await db
    .collection('event_sessions')
    .doc(session.id)
    .update({
      messagesPosted: admin.firestore.FieldValue.increment(1),
    });

  return { messageId: message.id, hidden: message.hidden };
});

export const uploadEventMaterial = https.onCall(
  async (data: UploadMaterialInput, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventDoc = await db.collection('events').doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new https.HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as Event;

    if (event.organizerId !== userId && !event.presenters.includes(userId)) {
      throw new https.HttpsError(
        'permission-denied',
        'Only organizers and presenters can upload materials'
      );
    }

    const validation = validateMaterialContent(data.type, data.fileName, data.description);
    if (!validation.isValid) {
      throw new https.HttpsError('invalid-argument', validation.reason || 'Invalid material');
    }

    const materialRef = db.collection('event_materials').doc();
    const material: EventMaterial = {
      id: materialRef.id,
      eventId: data.eventId,
      uploaderId: userId,
      type: data.type,
      fileName: data.fileName,
      fileUrl: 'placeholder-url',
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      availableAt: data.availableAt
        ? admin.firestore.Timestamp.fromDate(data.availableAt)
        : undefined,
      availableAfterFunding: data.availableAfterFunding,
      downloadable: data.downloadable,
      copyrightChecked: false,
      copyrightStatus: 'reviewing',
      description: data.description,
      order: 0,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await materialRef.set(material);

    return { materialId: material.id };
  }
);

export const generateEventCertificate = https.onCall(
  async (data: GenerateCertificateInput, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const eventDoc = await db.collection('events').doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new https.HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as Event;

    if (!event.enableCertificate) {
      throw new https.HttpsError('failed-precondition', 'Event does not offer certificates');
    }

    if (event.status !== EventStatus.ENDED) {
      throw new https.HttpsError('failed-precondition', 'Event must be ended to issue certificates');
    }

    const sessionQuery = await db
      .collection('event_sessions')
      .where('eventId', '==', data.eventId)
      .where('userId', '==', data.userId)
      .get();

    if (sessionQuery.empty) {
      throw new https.HttpsError('not-found', 'User did not attend event');
    }

    const session = sessionQuery.docs[0].data() as EventSession;
    const eventDuration =
      event.actualEndTime!.toMillis() - event.actualStartTime!.toMillis();
    const attendancePercentage = (session.duration / eventDuration) * 100;

    if (attendancePercentage < 80) {
      throw new https.HttpsError(
        'failed-precondition',
        'Attendance requirement not met (80% required)'
      );
    }

    const certificateRef = db.collection('event_certificates').doc();
    const certificateCode = `CERT-${event.id.substring(0, 4)}-${Date.now().toString(36).toUpperCase()}`;

    const certificate: EventCertificate = {
      id: certificateRef.id,
      eventId: data.eventId,
      userId: data.userId,
      certificateUrl: 'placeholder-certificate-url',
      certificateCode,
      verified: true,
      verificationUrl: `https://avalo.app/verify/${certificateCode}`,
      attendancePercentage,
      completedActivities: [],
      issuedAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await certificateRef.set(certificate);

    return { certificateId: certificate.id, certificateCode, certificateUrl: certificate.certificateUrl };
  }
);

export const moderateEventContent = https.onCall(
  async (data: ModerateContentInput, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventDoc = await db.collection('events').doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new https.HttpsError('not-found', 'Event not found');
    }

    const event = eventDoc.data() as Event;

    if (event.organizerId !== userId) {
      throw new https.HttpsError('permission-denied', 'Only event organizer can moderate');
    }

    if (data.targetType === 'message') {
      await db
        .collection('event_chat_logs')
        .doc(data.targetId)
        .update({
          flagged: true,
          hidden: data.action === 'shadow_mute' || data.action === 'block',
          moderatedBy: userId,
          moderationReason: data.reason,
        });
    }

    if (data.targetType === 'user') {
      const sessions = await db
        .collection('event_sessions')
        .where('eventId', '==', data.eventId)
        .where('userId', '==', data.targetId)
        .get();

      for (const sessionDoc of sessions.docs) {
        const updates: Partial<EventSession> = {};
        if (data.action === 'warning') {
          updates.warnings = admin.firestore.FieldValue.increment(1) as any;
        } else if (data.action === 'shadow_mute') {
          updates.muted = true;
        } else if (data.action === 'block') {
          updates.blocked = true;
        }
        await sessionDoc.ref.update(updates);
      }
    }

    const flagRef = db.collection('event_moderation_flags').doc();
    const flag: EventModerationFlag = {
      id: flagRef.id,
      eventId: data.eventId,
      targetType: data.targetType,
      targetId: data.targetId,
      userId: data.targetId,
      flagType: 'inappropriate',
      severity: 'high',
      autoDetected: false,
      detectionScore: 0,
      detectionReasons: [data.reason],
      action: data.action,
      actionBy: userId,
      actionAt: admin.firestore.Timestamp.now(),
      reviewed: true,
      reviewedBy: userId,
      reviewedAt: admin.firestore.Timestamp.now(),
      reviewNotes: data.reason,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await flagRef.set(flag);

    return { success: true };
  }
);

export const completeEventTicketPayment = https.onCall(
  async (data: { ticketId: string; paymentIntentId: string }, context) => {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const ticketRef = db.collection('event_tickets').doc(data.ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new https.HttpsError('not-found', 'Ticket not found');
    }

    const ticket = ticketDoc.data() as EventTicket;

    if (ticket.userId !== userId) {
      throw new https.HttpsError('permission-denied', 'Not your ticket');
    }

    await ticketRef.update({
      paymentIntentId: data.paymentIntentId,
      paymentStatus: 'completed',
      accessGranted: true,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    const eventRef = db.collection('events').doc(ticket.eventId);
    await eventRef.update({
      soldTickets: admin.firestore.FieldValue.increment(1),
      totalRevenue: admin.firestore.FieldValue.increment(ticket.price),
    });

    const eventDoc = await eventRef.get();
    const event = eventDoc.data() as Event;
    const revenue = validateRevenueShare(event.totalRevenue + ticket.price);

    await eventRef.update({
      creatorShare: revenue.creatorShare,
      platformShare: revenue.platformShare,
    });

    return { success: true, accessGranted: true };
  }
);