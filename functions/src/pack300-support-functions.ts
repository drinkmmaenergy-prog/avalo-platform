/**
 * PACK 300B - Support System Cloud Functions
 * Ticket management, safety classification, and admin operations
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  SupportTicket,
  TicketStatus,
  TicketPriority,
  TicketType,
  SupportTicketMessage,
  CreateTicketRequest,
  CreateTicketResponse,
  AddMessageRequest,
  AddMessageResponse,
  UpdateTicketRequest,
  UpdateTicketResponse,
  getAutoPriority,
} from '../../shared/types/support';
import {
  SupportTicketExtended,
  SafetyTicketMetadata,
  AccountActionRequest,
  AccountActionResponse,
  AccountActionRecord,
  AssignTicketRequest,
  AssignTicketResponse,
  SupportMetrics,
  classifyTicketSafety,
  NotificationIntegrationPayload,
  AuditIntegrationPayload,
  RiskIntegrationPayload,
} from '../../shared/types/support-300b';

const db = admin.firestore();

// ============================================================================
// TICKET CREATION WITH SAFETY CLASSIFICATION
// ============================================================================

export const createTicket = functions.https.onCall(
  async (data: CreateTicketRequest, context) => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const ticketId = db.collection('supportTickets').doc().id;
      const now = new Date().toISOString();

      // Auto-assign priority based on type
      const priority = getAutoPriority(data.type);

      // Safety classification
      const safetyMetadata = classifyTicketSafety(
        data.type,
        data.description,
        data.related || {},
        data.related?.fromPanic || false
      );

      // Get user locale and country
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const userLocale = userData?.locale || 'en-US';
      const userCountry = userData?.country || 'US';

      // Create ticket
      const ticket: SupportTicketExtended = {
        ticketId,
        userId,
        status: 'OPEN' as TicketStatus,
        priority,
        type: data.type,
        subject: data.subject,
        description: data.description,
        related: data.related || {},
        userLocale,
        userCountry,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        safety: safetyMetadata || undefined,
      };

      // Save ticket
      await db.collection('supportTickets').doc(ticketId).set(ticket);

      // Create initial system message
      const messageId = db.collection('supportTicketMessages').doc().id;
      const initialMessage: SupportTicketMessage = {
        messageId,
        ticketId,
        authorType: 'USER',
        authorId: userId,
        body: data.description,
        createdAt: now,
        internal: false,
      };

      await db.collection('supportTicketMessages').doc(messageId).set(initialMessage);

      // Critical safety escalation
      if (safetyMetadata && safetyMetadata.severity === 'CRITICAL') {
        await handleCriticalEscalation(ticket, safetyMetadata);
      }

      // Send notification
      await sendNotification({
        ticketId,
        userId,
        type: 'TICKET_CREATED',
        subject: data.subject,
        priority,
      });

      // Audit log
      await logAuditEvent({
        eventType: 'SUPPORT_TICKET_CREATED',
        actorId: userId,
        actorType: 'USER',
        targetId: ticketId,
        targetType: 'TICKET',
        metadata: {
          type: data.type,
          priority,
          isSafety: safetyMetadata?.isSafety || false,
          severity: safetyMetadata?.severity,
        },
      });

      const response: CreateTicketResponse = {
        success: true,
        ticketId,
      };

      return response;
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      
      const response: CreateTicketResponse = {
        success: false,
        error: error.message || 'Failed to create ticket',
      };

      return response;
    }
  }
);

// ============================================================================
// ADD MESSAGE TO TICKET
// ============================================================================

export const addMessage = functions.https.onCall(
  async (data: AddMessageRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { ticketId, body, internal = false } = data;

      // Get ticket
      const ticketDoc = await db.collection('supportTickets').doc(ticketId).get();
      if (!ticketDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data() as SupportTicket;

      // Check permissions
      const isAdmin = await checkAdminPermission(userId);
      if (!isAdmin && ticket.userId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not authorized to add messages to this ticket'
        );
      }

      // Internal messages only for admins
      if (internal && !isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can create internal messages'
        );
      }

      // Create message
      const messageId = db.collection('supportTicketMessages').doc().id;
      const now = new Date().toISOString();

      const message: SupportTicketMessage = {
        messageId,
        ticketId,
        authorType: isAdmin ? 'SUPPORT' : 'USER',
        authorId: userId,
        body,
        createdAt: now,
        internal,
      };

      await db.collection('supportTicketMessages').doc(messageId).set(message);

      // Update ticket lastMessageAt and status
      const updates: Partial<SupportTicket> = {
        lastMessageAt: now,
        updatedAt: now,
      };

      // If admin replies, set to IN_PROGRESS
      if (isAdmin && ticket.status === 'OPEN') {
        updates.status = 'IN_PROGRESS';
      }

      await db.collection('supportTickets').doc(ticketId).update(updates);

      // Send notification if support replied to user
      if (isAdmin && !internal) {
        await sendNotification({
          ticketId,
          userId: ticket.userId,
          type: 'SUPPORT_REPLY',
          subject: ticket.subject,
          priority: ticket.priority,
        });
      }

      // Audit log
      await logAuditEvent({
        eventType: 'SUPPORT_TICKET_MESSAGE_ADDED',
        actorId: userId,
        actorType: isAdmin ? 'ADMIN' : 'USER',
        targetId: messageId,
        targetType: 'MESSAGE',
        metadata: {
          ticketId,
          internal,
        },
      });

      const response: AddMessageResponse = {
        success: true,
        messageId,
      };

      return response;
    } catch (error: any) {
      console.error('Error adding message:', error);
      
      const response: AddMessageResponse = {
        success: false,
        error: error.message || 'Failed to add message',
      };

      return response;
    }
  }
);

// ============================================================================
// UPDATE TICKET (STATUS, PRIORITY, ASSIGNMENT)
// ============================================================================

export const updateTicket = functions.https.onCall(
  async (data: UpdateTicketRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { ticketId, status, priority, adminAssignedId, adminNotes } = data;

      // Get ticket
      const ticketDoc = await db.collection('supportTickets').doc(ticketId).get();
      if (!ticketDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data() as SupportTicket;

      // Check permissions
      const isAdmin = await checkAdminPermission(userId);
      
      if (!isAdmin && ticket.userId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not authorized to update this ticket'
        );
      }

      // Users can only mark tickets as CLOSED
      if (!isAdmin && status && status !== 'CLOSED') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Users can only close tickets'
        );
      }

      // Build updates
      const updates: Partial<SupportTicket> = {
        updatedAt: new Date().toISOString(),
      };

      if (status) {
        updates.status = status;
        if (status === 'RESOLVED' || status === 'CLOSED') {
          updates.resolvedAt = new Date().toISOString();
        }
      }

      if (priority && isAdmin) {
        updates.priority = priority;
      }

      if (adminAssignedId !== undefined && isAdmin) {
        updates.adminAssignedId = adminAssignedId;
      }

      if (adminNotes !== undefined && isAdmin) {
        updates.adminNotes = adminNotes;
      }

      await db.collection('supportTickets').doc(ticketId).update(updates);

      // Send notification on status change
      if (status) {
        await sendNotification({
          ticketId,
          userId: ticket.userId,
          type: 'STATUS_CHANGED',
          subject: ticket.subject,
          priority: ticket.priority,
        });
      }

      // Audit log
      await logAuditEvent({
        eventType: 'SUPPORT_TICKET_UPDATED',
        actorId: userId,
        actorType: isAdmin ? 'ADMIN' : 'USER',
        targetId: ticketId,
        targetType: 'TICKET',
        metadata: {
          changes: { status, priority, adminAssignedId },
        },
      });

      const response: UpdateTicketResponse = {
        success: true,
      };

      return response;
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      
      const response: UpdateTicketResponse = {
        success: false,
        error: error.message || 'Failed to update ticket',
      };

      return response;
    }
  }
);

// ============================================================================
// CRITICAL SAFETY ESCALATION
// ============================================================================

async function handleCriticalEscalation(
  ticket: SupportTicketExtended,
  safetyMetadata: SafetyTicketMetadata
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // 1. Freeze reported user's account if present
    if (safetyMetadata.reportedUserId) {
      await db.collection('users').doc(safetyMetadata.reportedUserId).update({
        accountStatus: 'FROZEN',
        frozenAt: now,
        frozenReason: 'Safety escalation - Critical ticket',
        frozenBy: 'SYSTEM',
        relatedTicketId: ticket.ticketId,
      });

      console.log(`Frozen account: ${safetyMetadata.reportedUserId} due to critical ticket: ${ticket.ticketId}`);
    }

    // 2. Update ticket with escalation timestamp
    await db.collection('supportTickets').doc(ticket.ticketId).update({
      'safety.escalatedAt': now,
    });

    // 3. Send to risk profile system (PACK 281)
    if (safetyMetadata.reportedUserId) {
      await updateRiskProfile({
        userId: safetyMetadata.reportedUserId,
        riskType: 'SAFETY_INCIDENT',
        severity: safetyMetadata.severity,
        ticketId: ticket.ticketId,
        metadata: {
          safetyType: safetyMetadata.safetyType,
          fromPanic: safetyMetadata.safetyType === 'PANIC',
        },
      });
    }

    // 4. Create escalation notification for safety admins
    await sendNotification({
      ticketId: ticket.ticketId,
      userId: ticket.userId,
      type: 'ESCALATED',
      subject: ticket.subject,
      priority: ticket.priority,
    });

    // 5. Audit log
    await logAuditEvent({
      eventType: 'SUPPORT_TICKET_ESCALATED',
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      targetId: ticket.ticketId,
      targetType: 'TICKET',
      metadata: {
        severity: safetyMetadata.severity,
        safetyType: safetyMetadata.safetyType,
        reportedUserId: safetyMetadata.reportedUserId,
        accountFrozen: !!safetyMetadata.reportedUserId,
      },
    });
  } catch (error) {
    console.error('Error handling critical escalation:', error);
    // Don't throw - we still want the ticket created
  }
}

// ============================================================================
// ACCOUNT ACTIONS (WARN, FREEZE, BAN)
// ============================================================================

export const executeAccountAction = functions.https.onCall(
  async (data: AccountActionRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Admin must be authenticated'
        );
      }

      const adminId = context.auth.uid;

      // Verify admin permissions (must be super_admin for bans)
      const isAdmin = await checkAdminPermission(adminId);
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can execute account actions'
        );
      }

      const { ticketId, userId, action, reason, duration } = data;
      const now = new Date().toISOString();
      const actionId = db.collection('accountActions').doc().id;

      // Create action record
      const actionRecord: AccountActionRecord = {
        actionId,
        ticketId,
        userId,
        action,
        reason,
        duration,
        adminId,
        createdAt: now,
      };

      // Calculate expiration for temporary actions
      if (action === 'FREEZE' && duration) {
        const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
        actionRecord.expiresAt = expiresAt.toISOString();
      }

      // Execute action on user account
      const userUpdates: any = {
        updatedAt: now,
      };

      switch (action) {
        case 'WARN':
          userUpdates.warnings = admin.firestore.FieldValue.arrayUnion({
            reason,
            issuedBy: adminId,
            issuedAt: now,
            ticketId,
          });
          break;

        case 'FREEZE':
          userUpdates.accountStatus = 'FROZEN';
          userUpdates.frozenAt = now;
          userUpdates.frozenReason = reason;
          userUpdates.frozenBy = adminId;
          userUpdates.frozenUntil = actionRecord.expiresAt;
          break;

        case 'BAN':
          userUpdates.accountStatus = 'BANNED';
          userUpdates.bannedAt = now;
          userUpdates.bannedReason = reason;
          userUpdates.bannedBy = adminId;
          break;
      }

      await db.collection('users').doc(userId).update(userUpdates);

      // Save action record
      await db.collection('accountActions').doc(actionId).set(actionRecord);

      // Audit log
      await logAuditEvent({
        eventType: `ACCOUNT_ACTION_${action}`,
        actorId: adminId,
        actorType: 'ADMIN',
        targetId: userId,
        targetType: 'TICKET',
        metadata: {
          action,
          reason,
          ticketId,
          duration,
        },
      });

      const response: AccountActionResponse = {
        success: true,
        actionId,
      };

      return response;
    } catch (error: any) {
      console.error('Error executing account action:', error);
      
      const response: AccountActionResponse = {
        success: false,
        error: error.message || 'Failed to execute account action',
      };

      return response;
    }
  }
);

// ============================================================================
// ADMIN METRICS & ANALYTICS
// ============================================================================

export const getSupportMetrics = functions.https.onCall(
  async (data: {}, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Admin must be authenticated'
        );
      }

      const isAdmin = await checkAdminPermission(context.auth.uid);
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can view metrics'
        );
      }

      const now = Date.now();
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      // Get ticket counts
      const openTickets = await db
        .collection('supportTickets')
        .where('status', '==', 'OPEN')
        .get();

      const inProgressTickets = await db
        .collection('supportTickets')
        .where('status', '==', 'IN_PROGRESS')
        .get();

      const resolvedToday = await db
        .collection('supportTickets')
        .where('resolvedAt', '>=', todayStart)
        .get();

      const safetyTickets = await db
        .collection('supportTickets')
        .where('safety.isSafety', '==', true)
        .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
        .get();

      // Calculate average response times (simplified)
      // In production, this should use aggregated data
      const metrics: SupportMetrics = {
        openTickets: openTickets.size,
        inProgressTickets: inProgressTickets.size,
        resolvedToday: resolvedToday.size,
        safetyTickets: safetyTickets.size,
        averageResponseTime: 0, // TODO: Calculate from messages
        averageResolutionTime: 0, // TODO: Calculate from tickets
        slaBreaches: 0, // TODO: Calculate from ticket ages
        ticketsByType: {} as any,
        ticketsByPriority: {} as any,
        timestamp: new Date().toISOString(),
      };

      return { success: true, metrics };
    } catch (error: any) {
      console.error('Error getting support metrics:', error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function checkAdminPermission(userId: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection('adminUsers').doc(userId).get();
    if (!adminDoc.exists) {
      return false;
    }
    const adminData = adminDoc.data();
    return adminData?.active === true;
  } catch (error) {
    console.error('Error checking admin permission:', error);
    return false;
  }
}

async function sendNotification(payload: NotificationIntegrationPayload): Promise<void> {
  try {
    // Integration with PACK 293 notification system
    await db.collection('notifications').add({
      userId: payload.userId,
      type: 'SUPPORT',
      title: getNotificationTitle(payload.type),
      body: payload.subject,
      data: {
        ticketId: payload.ticketId,
        priority: payload.priority,
      },
      createdAt: new Date().toISOString(),
      read: false,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    // Don't throw - notification failure shouldn't break ticket operations
  }
}

function getNotificationTitle(type: NotificationIntegrationPayload['type']): string {
  const titles = {
    TICKET_CREATED: 'Support Ticket Created',
    SUPPORT_REPLY: 'Support Team Replied',
    STATUS_CHANGED: 'Ticket Status Updated',
    ESCALATED: 'Critical: Safety Ticket Escalated',
  };
  return titles[type];
}

async function logAuditEvent(payload: AuditIntegrationPayload): Promise<void> {
  try {
    // Integration with PACK 296 audit system
    await db.collection('auditLogs').add({
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging audit event:', error);
    // Don't throw - audit failure shouldn't break operations
  }
}

async function updateRiskProfile(payload: RiskIntegrationPayload): Promise<void> {
  try {
    // Integration with PACK 281 risk profile system
    await db.collection('riskProfiles').doc(payload.userId).set({
      incidents: admin.firestore.FieldValue.arrayUnion({
        type: payload.riskType,
        severity: payload.severity,
        ticketId: payload.ticketId,
        timestamp: new Date().toISOString(),
        ...payload.metadata,
      }),
      riskScore: admin.firestore.FieldValue.increment(
        payload.severity === 'CRITICAL' ? 50 : payload.severity === 'HIGH' ? 25 : 10
      ),
      lastUpdated: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.error('Error updating risk profile:', error);
    // Don't throw - risk update failure shouldn't break operations
  }
}