/**
 * PACK 312 — Customer Support Console & Case Management
 * Cloud Functions for Support Operations
 * 
 * RULES:
 * - No changes to token packages, prices, or payout rates (0.20 PLN/token)
 * - No changes to revenue splits (65/35, 80/20)
 * - No free tokens, discounts, or economic promotions
 * - All monetary actions must use existing, approved business rules
 * - Full audit logging required for all operations
 * - Privacy boundaries must be respected
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  SupportTicket,
  TicketMessage,
  AdminRole,
  CreateTicketPayload,
  UpdateTicketStatusPayload,
  AssignTicketPayload,
  AddTicketMessagePayload,
  ResolveTicketPayload,
  SupportAuditEventType,
  UserContextSummary,
  MeetingContextSummary,
  TransactionContextSummary,
  SafetyContextSummary,
} from './pack312-support-types';
import { logBusinessAudit } from './pack105-audit-logger';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  SUPPORT_TICKETS: 'support_tickets',
  SUPPORT_TICKET_MESSAGES: 'support_ticket_messages',
  ADMIN_USERS: 'admin_users',
  SUPPORT_AUDIT_LOG: 'support_audit_log',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin with specified role
 */
async function isAdminWithRole(
  adminId: string,
  allowedRoles: AdminRole[]
): Promise<{ isAdmin: boolean; role?: AdminRole }> {
  try {
    const adminDoc = await db.collection(COLLECTIONS.ADMIN_USERS).doc(adminId).get();
    
    if (!adminDoc.exists) {
      return { isAdmin: false };
    }
    
    const adminData = adminDoc.data();
    const role = adminData?.role as AdminRole;
    
    if (allowedRoles.includes(role)) {
      return { isAdmin: true, role };
    }
    
    return { isAdmin: false, role };
  } catch (error: any) {
    logger.error('[Support] Error checking admin role', { adminId, error: error.message });
    return { isAdmin: false };
  }
}

/**
 * Create support audit log
 */
async function createSupportAuditLog(
  eventType: SupportAuditEventType,
  adminId: string,
  adminRole: AdminRole,
  data: {
    ticketId?: string;
    userId?: string;
    oldState?: Record<string, any>;
    newState?: Record<string, any>;
    actionData?: Record<string, any>;
  }
): Promise<void> {
  try {
    const auditId = generateId();
    await db.collection(COLLECTIONS.SUPPORT_AUDIT_LOG).doc(auditId).set({
      auditId,
      eventType,
      timestamp: serverTimestamp(),
      adminId,
      adminRole,
      ...data,
    });
    
    // Also log to business audit system
    await logBusinessAudit({
      eventType: 'SUPPORT_ACTION' as any,
      userId: data.userId,
      relatedId: data.ticketId,
      context: {
        eventType,
        adminId,
        adminRole,
        ...data.actionData,
      },
      source: 'support_console',
    });
  } catch (error: any) {
    logger.error('[Support] Error creating audit log', { error: error.message });
  }
}

// ============================================================================
// TICKET MANAGEMENT
// ============================================================================

/**
 * Create a new support ticket
 */
export const support_createTicket = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ ticketId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const payload: CreateTicketPayload = request.data;

    // Validate payload
    if (!payload.category || !payload.subject || !payload.description) {
      throw new HttpsError('invalid-argument', 'category, subject, and description are required');
    }

    try {
      const ticketId = generateId();
      
      const ticket: SupportTicket = {
        ticketId,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
        createdBy: {
          type: 'USER',
          userId,
        },
        status: 'OPEN',
        priority: payload.priority || 'MEDIUM',
        category: payload.category,
        userId,
        otherUserId: payload.otherUserId,
        meetingId: payload.meetingId,
        eventId: payload.eventId,
        transactionId: payload.transactionId,
        subject: payload.subject,
        description: payload.description,
        tags: payload.tags || [],
      };

      await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId).set(ticket);

      logger.info(`[Support] Ticket created: ${ticketId} by user ${userId}`);

      return { ticketId };
    } catch (error: any) {
      logger.error('[Support] Error creating ticket', { error: error.message, userId });
      throw new HttpsError('internal', `Failed to create ticket: ${error.message}`);
    }
  }
);

/**
 * List support tickets with filtering (admin only)
 */
export const support_listTickets = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ tickets: SupportTicket[]; total: number; hasMore: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin, role } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const {
        status,
        priority,
        category,
        userId,
        assignedToAdminId,
        limit = 50,
        startAfter,
      } = request.data;

      let query = db.collection(COLLECTIONS.SUPPORT_TICKETS) as any;

      // Apply filters
      if (status) query = query.where('status', '==', status);
      if (priority) query = query.where('priority', '==', priority);
      if (category) query = query.where('category', '==', category);
      if (userId) query = query.where('userId', '==', userId);
      if (assignedToAdminId) query = query.where('assignedToAdminId', '==', assignedToAdminId);

      // Order by creation date
      query = query.orderBy('createdAt', 'desc');

      // Pagination
      if (startAfter) {
        const startDoc = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      query = query.limit(limit + 1);

      const snapshot = await query.get();
      const tickets: SupportTicket[] = [];
      let hasMore = false;

      snapshot.docs.forEach((doc: any, index: number) => {
        if (index < limit) {
          tickets.push({ ...doc.data(), ticketId: doc.id } as SupportTicket);
        } else {
          hasMore = true;
        }
      });

      // Get total count
      let countQuery = db.collection(COLLECTIONS.SUPPORT_TICKETS) as any;
      if (status) countQuery = countQuery.where('status', '==', status);
      if (category) countQuery = countQuery.where('category', '==', category);
      const countSnapshot = await countQuery.count().get();
      const total = countSnapshot.data().count;

      logger.info(`[Support] Admin ${adminId} listed ${tickets.length} tickets`);

      return { tickets, total, hasMore };
    } catch (error: any) {
      logger.error('[Support] Error listing tickets', { error: error.message });
      throw new HttpsError('internal', `Failed to list tickets: ${error.message}`);
    }
  }
);

/**
 * Get ticket details (user can see own, admin can see all)
 */
export const support_getTicketDetails = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ ticket: SupportTicket; messages: TicketMessage[] }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const requesterId = request.auth.uid;
    const { ticketId } = request.data;

    if (!ticketId) {
      throw new HttpsError('invalid-argument', 'ticketId is required');
    }

    try {
      const ticketDoc = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId).get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticket = { ...ticketDoc.data(), ticketId: ticketDoc.id } as SupportTicket;

      // Check permissions
      const { isAdmin } = await isAdminWithRole(requesterId, [
        'SUPPORT',
        'MODERATOR',
        'RISK',
        'FINANCE',
        'LEGAL',
        'SUPERADMIN',
      ]);

      if (!isAdmin && ticket.userId !== requesterId) {
        throw new HttpsError('permission-denied', 'Access denied');
      }

      // Get messages
      let messagesQuery = db
        .collection(COLLECTIONS.SUPPORT_TICKET_MESSAGES)
        .where('ticketId', '==', ticketId)
        .orderBy('createdAt', 'asc') as any;

      // Filter out internal notes for non-admins
      if (!isAdmin) {
        messagesQuery = messagesQuery.where('internalNote', '==', false);
      }

      const messagesSnapshot = await messagesQuery.get();
      const messages: TicketMessage[] = messagesSnapshot.docs.map((doc: any) => ({
        ...doc.data(),
        messageId: doc.id,
      }));

      return { ticket, messages };
    } catch (error: any) {
      logger.error('[Support] Error getting ticket details', { error: error.message, ticketId });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get ticket details: ${error.message}`);
    }
  }
);

/**
 * Update ticket status (admin only)
 */
export const support_updateTicketStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin, role } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin || !role) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: UpdateTicketStatusPayload = request.data;

    if (!payload.ticketId || !payload.newStatus) {
      throw new HttpsError('invalid-argument', 'ticketId and newStatus are required');
    }

    try {
      const ticketRef = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(payload.ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const oldTicket = ticketDoc.data() as SupportTicket;

      await ticketRef.update({
        status: payload.newStatus,
        updatedAt: serverTimestamp(),
      });

      // Create audit log
      await createSupportAuditLog(
        'SUPPORT_TICKET_UPDATED_STATUS',
        adminId,
        role,
        {
          ticketId: payload.ticketId,
          userId: oldTicket.userId,
          oldState: { status: oldTicket.status },
          newState: { status: payload.newStatus },
        }
      );

      // Add message if note provided
      if (payload.note) {
        const messageId = generateId();
        await db.collection(COLLECTIONS.SUPPORT_TICKET_MESSAGES).doc(messageId).set({
          messageId,
          ticketId: payload.ticketId,
          createdAt: serverTimestamp(),
          authorType: 'ADMIN',
          authorId: adminId,
          message: `Status changed to ${payload.newStatus}. ${payload.note}`,
          internalNote: true,
        });
      }

      logger.info(`[Support] Ticket ${payload.ticketId} status updated to ${payload.newStatus} by ${adminId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[Support] Error updating ticket status', { error: error.message });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update ticket status: ${error.message}`);
    }
  }
);

/**
 * Assign ticket to admin (admin only)
 */
export const support_assignTicket = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const assignerId = request.auth.uid;
    const { isAdmin, role } = await isAdminWithRole(assignerId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin || !role) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: AssignTicketPayload = request.data;

    if (!payload.ticketId || !payload.adminId) {
      throw new HttpsError('invalid-argument', 'ticketId and adminId are required');
    }

    try {
      // Verify target is admin
      const { isAdmin: targetIsAdmin } = await isAdminWithRole(payload.adminId, [
        'SUPPORT',
        'MODERATOR',
        'RISK',
        'FINANCE',
        'LEGAL',
        'SUPERADMIN',
      ]);

      if (!targetIsAdmin) {
        throw new HttpsError('invalid-argument', 'Target user is not an admin');
      }

      const ticketRef = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(payload.ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data() as SupportTicket;

      await ticketRef.update({
        assignedToAdminId: payload.adminId,
        status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
        updatedAt: serverTimestamp(),
      });

      // Create audit log
      await createSupportAuditLog(
        'SUPPORT_TICKET_ASSIGNED',
        assignerId,
        role,
        {
          ticketId: payload.ticketId,
          userId: ticket.userId,
          actionData: { assignedTo: payload.adminId },
        }
      );

      logger.info(`[Support] Ticket ${payload.ticketId} assigned to ${payload.adminId} by ${assignerId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[Support] Error assigning ticket', { error: error.message });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to assign ticket: ${error.message}`);
    }
  }
);

/**
 * Add message to ticket
 */
export const support_addMessage = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ messageId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const authorId = request.auth.uid;
    const payload: AddTicketMessagePayload = request.data;

    if (!payload.ticketId || !payload.message) {
      throw new HttpsError('invalid-argument', 'ticketId and message are required');
    }

    try {
      // Get ticket
      const ticketDoc = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(payload.ticketId).get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data() as SupportTicket;

      // Check permissions
      const { isAdmin } = await isAdminWithRole(authorId, [
        'SUPPORT',
        'MODERATOR',
        'RISK',
        'FINANCE',
        'LEGAL',
        'SUPERADMIN',
      ]);

      if (!isAdmin && ticket.userId !== authorId) {
        throw new HttpsError('permission-denied', 'Access denied');
      }

      // Internal notes only allowed for admins
      if (payload.internalNote && !isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can add internal notes');
      }

      const messageId = generateId();
      const message: TicketMessage = {
        messageId,
        ticketId: payload.ticketId,
        createdAt: serverTimestamp() as Timestamp,
        authorType: isAdmin ? 'ADMIN' : 'USER',
        authorId,
        message: payload.message,
        attachments: payload.attachments,
        internalNote: payload.internalNote || false,
      };

      await db.collection(COLLECTIONS.SUPPORT_TICKET_MESSAGES).doc(messageId).set(message);

      // Update ticket
      await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(payload.ticketId).update({
        updatedAt: serverTimestamp(),
        status: isAdmin ? ticket.status : 'WAITING_USER',
      });

      logger.info(`[Support] Message added to ticket ${payload.ticketId} by ${authorId}`);

      return { messageId };
    } catch (error: any) {
      logger.error('[Support] Error adding message', { error: error.message });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to add message: ${error.message}`);
    }
  }
);

/**
 * Resolve ticket (admin only)
 */
export const support_resolveTicket = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin, role } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin || !role) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: ResolveTicketPayload = request.data;

    if (!payload.ticketId || !payload.resolutionType) {
      throw new HttpsError('invalid-argument', 'ticketId and resolutionType are required');
    }

    try {
      const ticketRef = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(payload.ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data() as SupportTicket;

      await ticketRef.update({
        status: 'RESOLVED',
        resolution: {
          resolvedByAdminId: adminId,
          resolvedAt: serverTimestamp(),
          resolutionType: payload.resolutionType,
          resolutionNote: payload.resolutionNote,
        },
        updatedAt: serverTimestamp(),
      });

      // Create audit log
      await createSupportAuditLog(
        'SUPPORT_TICKET_RESOLVED',
        adminId,
        role,
        {
          ticketId: payload.ticketId,
          userId: ticket.userId,
          actionData: {
            resolutionType: payload.resolutionType,
            resolutionNote: payload.resolutionNote,
          },
        }
      );

      logger.info(`[Support] Ticket ${payload.ticketId} resolved by ${adminId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[Support] Error resolving ticket', { error: error.message });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to resolve ticket: ${error.message}`);
    }
  }
);

/**
 * Get user tickets (for user-facing interface)
 */
export const support_getUserTickets = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ tickets: SupportTicket[] }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;

    try {
      const snapshot = await db
        .collection(COLLECTIONS.SUPPORT_TICKETS)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const tickets: SupportTicket[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        ticketId: doc.id,
      })) as SupportTicket[];

      return { tickets };
    } catch (error: any) {
      logger.error('[Support] Error getting user tickets', { error: error.message, userId });
      throw new HttpsError('internal', `Failed to get tickets: ${error.message}`);
    }
  }
);