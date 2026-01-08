/**
 * PACK 68 — Support Center & Ticketing (Admin APIs)
 * 
 * Admin-only endpoints for managing support tickets.
 * Requires admin authentication and appropriate permissions.
 * All actions are logged via audit_logs (PACK 65).
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

type SupportCategory =
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

type SupportSeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

type AssignedTeam =
  | 'SUPPORT'
  | 'COMPLIANCE'
  | 'MODERATION'
  | 'TECH'
  | 'FINANCE';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin with appropriate permissions
 * TODO: Integrate with PACK 65 admin permissions
 */
async function requireAdmin(context: functions.https.CallableContext): Promise<string> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminId = context.auth.uid;

  // Check if user is admin
  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const adminData = adminDoc.data()!;
  if (adminData.role !== 'admin' && adminData.role !== 'moderator') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin privileges required'
    );
  }

  return adminId;
}

/**
 * Write audit log entry
 */
async function writeAuditLog(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: any
): Promise<void> {
  try {
    const auditLogId = generateId();
    await db.collection('audit_logs').doc(auditLogId).set({
      auditLogId,
      adminId,
      action,
      targetType,
      targetId,
      metadata,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('[AdminSupport] Error writing audit log:', error);
    // Don't throw - audit log failure shouldn't block the operation
  }
}

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Search/list tickets with filters (Admin)
 */
export const searchTickets = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);

  const {
    status,
    category,
    assignedTeam,
    assignedAdminId,
    userId,
    severityMin,
    limit = 50,
    cursor,
  } = data;

  try {
    let query: FirebaseFirestore.Query = db.collection('support_tickets');

    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    if (category) {
      query = query.where('category', '==', category);
    }
    if (assignedTeam) {
      query = query.where('assignedTeam', '==', assignedTeam);
    }
    if (assignedAdminId) {
      query = query.where('assignedAdminId', '==', assignedAdminId);
    }
    if (userId) {
      query = query.where('userId', '==', userId);
    }

    // Order by updated time (most recent first)
    query = query.orderBy('updatedAt', 'desc').limit(Math.min(limit, 100));

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
        userId: data.userId,
        category: data.category,
        subject: data.subject,
        status: data.status,
        severity: data.severity,
        assignedTeam: data.assignedTeam || null,
        assignedAdminId: data.assignedAdminId || null,
        isEscalated: data.isEscalated || false,
        createdAt: data.createdAt.toMillis(),
        updatedAt: data.updatedAt.toMillis(),
      };
    });

    // Apply client-side severity filter if needed
    let filteredTickets = tickets;
    if (severityMin) {
      const severityOrder: { [key: string]: number } = {
        LOW: 0,
        NORMAL: 1,
        HIGH: 2,
        CRITICAL: 3,
      };
      const minLevel = severityOrder[severityMin] || 0;
      filteredTickets = tickets.filter(
        (t) => severityOrder[t.severity] >= minLevel
      );
    }

    const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return {
      success: true,
      tickets: filteredTickets,
      nextCursor,
    };
  } catch (error: any) {
    console.error('[AdminSupport] Error searching tickets:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get ticket detail with full context (Admin)
 */
export const getTicketDetail = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);

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

    // Get user summary
    const userDoc = await db.collection('users').doc(ticketData.userId).get();
    const userSummary = userDoc.exists
      ? {
          userId: ticketData.userId,
          displayName: userDoc.data()!.displayName || 'Unknown',
          email: userDoc.data()!.email || null,
        }
      : null;

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
      userId: ticketData.userId,
      category: ticketData.category,
      subcategory: ticketData.subcategory || null,
      subject: ticketData.subject,
      description: ticketData.description,
      status: ticketData.status,
      severity: ticketData.severity,
      assignedTeam: ticketData.assignedTeam || null,
      assignedAdminId: ticketData.assignedAdminId || null,
      isEscalated: ticketData.isEscalated || false,
      escalationReason: ticketData.escalationReason || null,
      createdAt: ticketData.createdAt.toMillis(),
      updatedAt: ticketData.updatedAt.toMillis(),
      relatedDisputeId: ticketData.relatedDisputeId || null,
      relatedReservationId: ticketData.relatedReservationId || null,
      relatedPayoutRequestId: ticketData.relatedPayoutRequestId || null,
      relatedDeletionJobId: ticketData.relatedDeletionJobId || null,
      appVersion: ticketData.appVersion || null,
      platform: ticketData.platform || null,
      locale: ticketData.locale || null,
      countryIso: ticketData.countryIso || null,
    };

    return {
      success: true,
      ticket,
      userSummary,
      messages,
    };
  } catch (error: any) {
    console.error('[AdminSupport] Error getting ticket detail:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Admin reply and update ticket (Admin)
 */
export const replyAndUpdate = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);

  const {
    ticketId,
    message,
    newStatus,
    assignToAdminId,
    assignToTeam,
    escalate,
    escalationReason,
  } = data;

  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId is required');
  }

  try {
    // Get ticket
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Ticket not found');
    }

    const now = serverTimestamp();
    const updates: any = {
      updatedAt: now,
      lastAdminReplyAt: now,
    };

    // Add admin message if provided
    let messageId: string | null = null;
    if (message) {
      messageId = generateId();
      const messageData: any = {
        messageId,
        ticketId,
        senderType: 'ADMIN',
        senderId: adminId,
        createdAt: now,
        body: message,
        attachments: null,
      };

      await db.collection('support_ticket_messages').doc(messageId).set(messageData);
    }

    // Update status
    if (newStatus) {
      updates.status = newStatus;
    }

    // Update assignment
    if (assignToAdminId !== undefined) {
      updates.assignedAdminId = assignToAdminId;
    }
    if (assignToTeam) {
      updates.assignedTeam = assignToTeam;
    }

    // Handle escalation
    if (escalate !== undefined) {
      updates.isEscalated = escalate;
      if (escalate && escalationReason) {
        updates.escalationReason = escalationReason;
      }
    }

    // Update ticket
    await ticketRef.update(updates);

    // Write audit log
    await writeAuditLog(adminId, 'TICKET_UPDATE', 'SUPPORT_TICKET', ticketId, {
      newStatus,
      assignToAdminId,
      assignToTeam,
      escalate,
      hasMessage: !!message,
    });

    console.log(`[AdminSupport] Ticket ${ticketId} updated by admin ${adminId}`);

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    console.error('[AdminSupport] Error updating ticket:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Link ticket to related entity (dispute, payout, etc.) (Admin)
 */
export const linkTicket = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);

  const {
    ticketId,
    relatedDisputeId,
    relatedReservationId,
    relatedPayoutRequestId,
    relatedDeletionJobId,
  } = data;

  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId is required');
  }

  try {
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Ticket not found');
    }

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (relatedDisputeId !== undefined) {
      updates.relatedDisputeId = relatedDisputeId;
    }
    if (relatedReservationId !== undefined) {
      updates.relatedReservationId = relatedReservationId;
    }
    if (relatedPayoutRequestId !== undefined) {
      updates.relatedPayoutRequestId = relatedPayoutRequestId;
    }
    if (relatedDeletionJobId !== undefined) {
      updates.relatedDeletionJobId = relatedDeletionJobId;
    }

    await ticketRef.update(updates);

    // Write audit log
    await writeAuditLog(adminId, 'TICKET_LINK', 'SUPPORT_TICKET', ticketId, {
      relatedDisputeId,
      relatedReservationId,
      relatedPayoutRequestId,
      relatedDeletionJobId,
    });

    console.log(`[AdminSupport] Ticket ${ticketId} linked by admin ${adminId}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('[AdminSupport] Error linking ticket:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get ticket statistics (Admin dashboard)
 */
export const getTicketStats = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    // Get counts by status
    const openSnapshot = await db
      .collection('support_tickets')
      .where('status', '==', 'OPEN')
      .count()
      .get();

    const inProgressSnapshot = await db
      .collection('support_tickets')
      .where('status', '==', 'IN_PROGRESS')
      .count()
      .get();

    const waitingSnapshot = await db
      .collection('support_tickets')
      .where('status', '==', 'WAITING_FOR_USER')
      .count()
      .get();

    const escalatedSnapshot = await db
      .collection('support_tickets')
      .where('isEscalated', '==', true)
      .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
      .count()
      .get();

    return {
      success: true,
      stats: {
        open: openSnapshot.data().count,
        inProgress: inProgressSnapshot.data().count,
        waitingForUser: waitingSnapshot.data().count,
        escalated: escalatedSnapshot.data().count,
      },
    };
  } catch (error: any) {
    console.error('[AdminSupport] Error getting ticket stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});