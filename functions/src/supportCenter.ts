/**
 * PACK 68 — Support Center & Ticketing (User-Facing APIs)
 * 
 * User-facing endpoints for creating and managing support tickets.
 * All endpoints require authentication and restrict access to ticket owner.
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type SupportCategory =
  | 'ACCOUNT'
  | 'PAYMENTS_PAYOUTS'
  | 'TOKENS_BILLING'
  | 'SAFETY_ABUSE'
  | 'CONTENT_MODERATION'
  | 'TECHNICAL_ISSUE'
  | 'RESERVATIONS'
  | 'DISPUTES'
  | 'GDPR_PRIVACY'
  | 'OTHER';

export type SupportSeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

export type AssignedTeam =
  | 'SUPPORT'
  | 'COMPLIANCE'
  | 'MODERATION'
  | 'TECH'
  | 'FINANCE';

interface SupportTicket {
  ticketId: string;
  userId: string;
  createdAt: FirebaseFirestore.Timestamp;
  category: SupportCategory;
  subcategory?: string | null;
  subject: string;
  description: string;
  appVersion?: string | null;
  platform?: 'android' | 'ios' | 'web' | null;
  locale?: string | null;
  countryIso?: string | null;
  severity: SupportSeverity;
  status: TicketStatus;
  relatedDisputeId?: string | null;
  relatedReservationId?: string | null;
  relatedPayoutRequestId?: string | null;
  relatedDeletionJobId?: string | null;
  assignedAdminId?: string | null;
  assignedTeam?: AssignedTeam | null;
  updatedAt: FirebaseFirestore.Timestamp;
  lastUserReplyAt?: FirebaseFirestore.Timestamp | null;
  lastAdminReplyAt?: FirebaseFirestore.Timestamp | null;
  isEscalated?: boolean;
  escalationReason?: string | null;
}

interface SupportTicketMessage {
  messageId: string;
  ticketId: string;
  senderType: 'USER' | 'ADMIN';
  senderId: string;
  createdAt: FirebaseFirestore.Timestamp;
  body: string;
  attachments?: Array<{
    type: 'IMAGE' | 'FILE' | 'OTHER';
    url: string;
    mimeType?: string | null;
  }> | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Auto-assign team based on category
 */
function getAssignedTeam(category: SupportCategory): AssignedTeam {
  switch (category) {
    case 'PAYMENTS_PAYOUTS':
    case 'TOKENS_BILLING':
      return 'FINANCE';
    case 'SAFETY_ABUSE':
    case 'CONTENT_MODERATION':
      return 'MODERATION';
    case 'GDPR_PRIVACY':
      return 'COMPLIANCE';
    case 'TECHNICAL_ISSUE':
      return 'TECH';
    default:
      return 'SUPPORT';
  }
}

/**
 * Validate category
 */
function isValidCategory(category: string): category is SupportCategory {
  const validCategories: SupportCategory[] = [
    'ACCOUNT',
    'PAYMENTS_PAYOUTS',
    'TOKENS_BILLING',
    'SAFETY_ABUSE',
    'CONTENT_MODERATION',
    'TECHNICAL_ISSUE',
    'RESERVATIONS',
    'DISPUTES',
    'GDPR_PRIVACY',
    'OTHER',
  ];
  return validCategories.includes(category as SupportCategory);
}

/**
 * Validate severity
 */
function isValidSeverity(severity: string): severity is SupportSeverity {
  const validSeverities: SupportSeverity[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
  return validSeverities.includes(severity as SupportSeverity);
}

// ============================================================================
// USER-FACING ENDPOINTS
// ============================================================================

/**
 * Create a new support ticket
 */
export const createTicket = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    category,
    subcategory,
    subject,
    description,
    severity,
    appVersion,
    platform,
    locale,
    countryIso,
    relatedDisputeId,
    relatedReservationId,
    relatedPayoutRequestId,
    relatedDeletionJobId,
  } = data;

  // Validation
  if (!category || !subject || !description) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'category, subject, and description are required'
    );
  }

  if (!isValidCategory(category)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid category');
  }

  const finalSeverity: SupportSeverity =
    severity && isValidSeverity(severity) ? severity : 'NORMAL';

  try {
    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    // Generate ticket ID
    const ticketId = generateId();
    const now = serverTimestamp();

    // Determine assigned team
    const assignedTeam = getAssignedTeam(category);

    // Create ticket document
    const ticketData: any = {
      ticketId,
      userId,
      createdAt: now,
      category,
      subcategory: subcategory || null,
      subject,
      description,
      appVersion: appVersion || null,
      platform: platform || null,
      locale: locale || null,
      countryIso: countryIso || null,
      severity: finalSeverity,
      status: 'OPEN',
      relatedDisputeId: relatedDisputeId || null,
      relatedReservationId: relatedReservationId || null,
      relatedPayoutRequestId: relatedPayoutRequestId || null,
      relatedDeletionJobId: relatedDeletionJobId || null,
      assignedAdminId: null,
      assignedTeam,
      updatedAt: now,
      lastUserReplyAt: now,
      lastAdminReplyAt: null,
      isEscalated: false,
      escalationReason: null,
    };

    await db.collection('support_tickets').doc(ticketId).set(ticketData);

    // Create initial message
    const messageId = generateId();
    const messageData: any = {
      messageId,
      ticketId,
      senderType: 'USER',
      senderId: userId,
      createdAt: now,
      body: description,
      attachments: null,
    };

    await db.collection('support_ticket_messages').doc(messageId).set(messageData);

    console.log(`[Support] Ticket created: ${ticketId} by user ${userId}`);

    return {
      success: true,
      ticketId,
      status: 'OPEN',
    };
  } catch (error: any) {
    console.error('[Support] Error creating ticket:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * List user's tickets
 */
export const listMyTickets = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { limit = 20, cursor } = data;

  try {
    let query = db
      .collection('support_tickets')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('support_tickets').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const tickets = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ticketId: data.ticketId,
        category: data.category,
        subject: data.subject,
        status: data.status,
        severity: data.severity,
        createdAt: data.createdAt.toMillis(),
        updatedAt: data.updatedAt.toMillis(),
      };
    });

    const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return {
      success: true,
      tickets,
      nextCursor,
    };
  } catch (error: any) {
    console.error('[Support] Error listing tickets:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get ticket detail with messages
 */
export const getTicketDetail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { ticketId } = data;

  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId is required');
  }

  try {
    // Get ticket
    const ticketDoc = await db.collection('support_tickets').doc(ticketId).get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Ticket not found');
    }

    const ticketData = ticketDoc.data()!;

    // Verify ownership
    if (ticketData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your ticket');
    }

    // Get messages
    const messagesSnapshot = await db
      .collection('support_ticket_messages')
      .where('ticketId', '==', ticketId)
      .orderBy('createdAt', 'asc')
      .get();

    const messages = messagesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        messageId: data.messageId,
        senderType: data.senderType,
        senderId: data.senderId,
        body: data.body,
        createdAt: data.createdAt.toMillis(),
        attachments: data.attachments || null,
      };
    });

    // Format ticket
    const ticket = {
      ticketId: ticketData.ticketId,
      category: ticketData.category,
      subcategory: ticketData.subcategory || null,
      subject: ticketData.subject,
      description: ticketData.description,
      status: ticketData.status,
      severity: ticketData.severity,
      createdAt: ticketData.createdAt.toMillis(),
      updatedAt: ticketData.updatedAt.toMillis(),
      relatedDisputeId: ticketData.relatedDisputeId || null,
      relatedReservationId: ticketData.relatedReservationId || null,
      relatedPayoutRequestId: ticketData.relatedPayoutRequestId || null,
      relatedDeletionJobId: ticketData.relatedDeletionJobId || null,
    };

    return {
      success: true,
      ticket,
      messages,
    };
  } catch (error: any) {
    console.error('[Support] Error getting ticket detail:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Add user reply to ticket
 */
export const replyToTicket = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { ticketId, message } = data;

  if (!ticketId || !message) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId and message are required');
  }

  try {
    // Get ticket
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Ticket not found');
    }

    const ticketData = ticketDoc.data()!;

    // Verify ownership
    if (ticketData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your ticket');
    }

    // Check if ticket is closed
    if (ticketData.status === 'CLOSED') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot reply to closed ticket'
      );
    }

    const now = serverTimestamp();

    // Create message
    const messageId = generateId();
    const messageData: any = {
      messageId,
      ticketId,
      senderType: 'USER',
      senderId: userId,
      createdAt: now,
      body: message,
      attachments: null,
    };

    await db.collection('support_ticket_messages').doc(messageId).set(messageData);

    // Update ticket
    const updates: any = {
      updatedAt: now,
      lastUserReplyAt: now,
    };

    // If ticket was waiting for user, move to in progress
    if (ticketData.status === 'WAITING_FOR_USER') {
      updates.status = 'IN_PROGRESS';
    }

    await ticketRef.update(updates);

    console.log(`[Support] User reply added to ticket ${ticketId}`);

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    console.error('[Support] Error replying to ticket:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// HELP ARTICLES (OPTIONAL)
// ============================================================================

/**
 * Get help articles for a category
 */
export const getHelpArticles = functions.https.onCall(async (data, context) => {
  const { locale = 'en', category } = data;

  try {
    let query = db
      .collection('help_articles')
      .where('isActive', '==', true)
      .where('locale', '==', locale);

    if (category) {
      query = query.where('category', '==', category);
    }

    const snapshot = await query.limit(10).get();

    const articles = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        articleId: data.articleId,
        category: data.category,
        title: data.title,
        body: data.body,
        locale: data.locale,
      };
    });

    return {
      success: true,
      articles,
    };
  } catch (error: any) {
    console.error('[Support] Error getting help articles:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});