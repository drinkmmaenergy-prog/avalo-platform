/**
 * PACK 300 - Update Support Ticket
 * Cloud Function to update ticket status, priority, assignment, etc. (Admin only)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  UpdateTicketRequest,
  UpdateTicketResponse,
  TicketStatus,
  TicketPriority,
} from '../../../shared/types/support';

const db = admin.firestore();

export const updateTicket = functions.https.onCall(
  async (data: UpdateTicketRequest, context): Promise<UpdateTicketResponse> => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to update tickets'
        );
      }

      const userId = context.auth.uid;
      const { ticketId, status, priority, adminAssignedId, adminNotes } = data;

      // Validation
      if (!ticketId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required field: ticketId'
        );
      }

      // Check if user is an admin
      const adminDoc = await db.collection('adminUsers').doc(userId).get();
      if (!adminDoc.exists || !adminDoc.data()?.active) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can update tickets'
        );
      }

      const adminData = adminDoc.data();
      const adminRole = adminData?.role;

      // Get ticket
      const ticketRef = db.collection('supportTickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Ticket not found'
        );
      }

      const ticket = ticketDoc.data();

      // Check if admin has permission to access this ticket
      const isSafetyTicket = ['SAFETY_REPORT_FOLLOWUP', 'CONTENT_TAKEDOWN'].includes(
        ticket?.type
      );

      if (adminRole === 'safety_admin' && !isSafetyTicket) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Safety admins can only access safety tickets'
        );
      }

      if (adminRole === 'support_agent' && isSafetyTicket) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Support agents cannot access safety tickets'
        );
      }

      // Prepare update object
      const updates: any = {
        updatedAt: new Date().toISOString(),
      };

      let statusChanged = false;
      let resolvedNow = false;

      if (status && status !== ticket?.status) {
        // Validate status transition
        const validStatuses: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
        if (!validStatuses.includes(status)) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid status value'
          );
        }
        updates.status = status;
        statusChanged = true;

        // If resolving, set resolvedAt
        if (status === 'RESOLVED' && ticket?.status !== 'RESOLVED') {
          updates.resolvedAt = new Date().toISOString();
          resolvedNow = true;
        }
      }

      if (priority && priority !== ticket?.priority) {
        const validPriorities: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
        if (!validPriorities.includes(priority)) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid priority value'
          );
        }
        updates.priority = priority;
      }

      if (adminAssignedId !== undefined) {
        // Validate admin exists
        if (adminAssignedId) {
          const assignedAdminDoc = await db.collection('adminUsers').doc(adminAssignedId).get();
          if (!assignedAdminDoc.exists || !assignedAdminDoc.data()?.active) {
            throw new functions.https.HttpsError(
              'invalid-argument',
              'Invalid admin ID for assignment'
            );
          }
        }
        updates.adminAssignedId = adminAssignedId || null;
      }

      if (adminNotes !== undefined) {
        updates.adminNotes = adminNotes;
      }

      // Update ticket
      await ticketRef.update(updates);

      const now = new Date().toISOString();

      // Log audit event
      await db.collection('auditLogs').add({
        eventType: adminAssignedId !== undefined ? 'SUPPORT_TICKET_ASSIGNED' : 
                   statusChanged && resolvedNow ? 'SUPPORT_TICKET_RESOLVED' :
                   'SUPPORT_TICKET_UPDATED',
        actorId: userId,
        actorType: 'ADMIN',
        targetId: ticketId,
        targetType: 'TICKET',
        metadata: {
          updates,
          adminRole,
        },
        timestamp: now,
      });

      // Send notification to ticket owner if status changed
      if (statusChanged && ticket?.userId) {
        let notificationMessage = '';
        
        if (status === 'IN_PROGRESS') {
          notificationMessage = 'Your support ticket is now being reviewed';
        } else if (status === 'RESOLVED') {
          notificationMessage = 'Your support ticket has been resolved';
        } else if (status === 'CLOSED') {
          notificationMessage = 'Your support ticket has been closed';
        }

        if (notificationMessage) {
          await db.collection('notifications').add({
            userId: ticket.userId,
            type: 'SYSTEM_ALERT',
            title: 'Ticket Status Updated',
            message: notificationMessage,
            data: {
              ticketId,
              newStatus: status,
              notificationType: 'TICKET_RESOLVED',
            },
            priority: 'NORMAL',
            read: false,
            createdAt: now,
          });
        }
      }

      // If ticket was assigned, notify the assigned admin
      if (adminAssignedId && adminAssignedId !== ticket?.adminAssignedId) {
        await db.collection('notifications').add({
          userId: adminAssignedId,
          type: 'SYSTEM_ALERT',
          title: 'Ticket Assigned to You',
          message: `Ticket #${ticketId.split('-')[0]} has been assigned to you`,
          data: {
            ticketId,
            notificationType: 'TICKET_ASSIGNED',
          },
          priority: ticket?.priority === 'CRITICAL' ? 'HIGH' : 'NORMAL',
          read: false,
          createdAt: now,
        });
      }

      functions.logger.info('Ticket updated successfully', {
        ticketId,
        updates,
        adminId: userId,
      });

      return {
        success: true,
      };
    } catch (error: any) {
      functions.logger.error('Error updating ticket', {
        error: error.message,
        userId: context.auth?.uid,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to update ticket',
        error.message
      );
    }
  }
);