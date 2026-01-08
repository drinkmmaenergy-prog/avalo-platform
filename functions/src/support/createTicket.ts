/**
 * PACK 300 - Create Support Ticket
 * Cloud Function to create a new support ticket
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import {
  SupportTicket,
  CreateTicketRequest,
  CreateTicketResponse,
  getAutoPriority,
  isSafetyTicket,
  containsSensitiveData,
} from '../../../shared/types/support';

const db = admin.firestore();

export const createTicket = functions.https.onCall(
  async (data: CreateTicketRequest, context): Promise<CreateTicketResponse> => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to create a ticket'
        );
      }

      const userId = context.auth.uid;
      const { type, subject, description, related } = data;

      // Validation
      if (!type || !subject || !description) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required fields: type, subject, description'
        );
      }

      if (subject.length === 0 || subject.length > 200) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Subject must be between 1 and 200 characters'
        );
      }

      if (description.length === 0 || description.length > 5000) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Description must be between 1 and 5000 characters'
        );
      }

      // Check for sensitive data in description
      if (containsSensitiveData(description)) {
        functions.logger.warn('Sensitive data detected in ticket description', {
          userId,
          ticketType: type,
        });
        // We still create the ticket but flag it for admin review
      }

      // Get user locale and country from user profile
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const userLocale = userData?.locale || 'en-US';
      const userCountry = userData?.country || 'US';

      // Generate ticket ID
      const ticketId = uuidv4();
      const now = new Date().toISOString();

      // Determine priority based on ticket type
      const priority = getAutoPriority(type);

      // Create ticket object
      const ticket: SupportTicket = {
        ticketId,
        userId,
        status: 'OPEN',
        priority,
        type,
        subject,
        description,
        related: related || {},
        userLocale,
        userCountry,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      };

      // Save ticket to Firestore
      await db.collection('supportTickets').doc(ticketId).set(ticket);

      // Log audit event (PACK 296 integration)
      await db.collection('auditLogs').add({
        eventType: 'SUPPORT_TICKET_CREATED',
        actorId: userId,
        actorType: 'USER',
        targetId: ticketId,
        targetType: 'TICKET',
        metadata: {
          ticketType: type,
          priority,
          subject,
        },
        timestamp: now,
      });

      // Send notification to user (confirmation)
      await db.collection('notifications').add({
        userId,
        type: 'SYSTEM_ALERT',
        title: 'Support Ticket Created',
        message: `Your support ticket #${ticketId.split('-')[0]} has been created. We'll respond soon.`,
        data: {
          ticketId,
          notificationType: 'TICKET_CREATED',
        },
        read: false,
        createdAt: now,
      });

      // If safety ticket, notify safety admins
      if (isSafetyTicket(type)) {
        functions.logger.info('Safety ticket created, notifying admins', {
          ticketId,
          type,
          priority,
        });

        // Get all safety admins
        const adminSnapshot = await db
          .collection('adminUsers')
          .where('role', 'in', ['safety_admin', 'super_admin'])
          .where('active', '==', true)
          .get();

        // Notify each admin
        const adminNotifications = adminSnapshot.docs.map((doc) => {
          return db.collection('notifications').add({
            userId: doc.id,
            type: 'SYSTEM_ALERT',
            title: 'Critical Safety Ticket',
            message: `New safety ticket: ${subject}`,
            data: {
              ticketId,
              notificationType: 'SAFETY_TICKET_CREATED',
            },
            priority: 'HIGH',
            read: false,
            createdAt: now,
          });
        });

        await Promise.all(adminNotifications);
      }

      // If high priority (payment/payout), notify support admins
      if (priority === 'HIGH' || priority === 'CRITICAL') {
        const adminSnapshot = await db
          .collection('adminUsers')
          .where('role', 'in', ['support_agent', 'support_manager', 'super_admin'])
          .where('active', '==', true)
          .limit(5) // Notify first 5 available agents
          .get();

        const adminNotifications = adminSnapshot.docs.map((doc) => {
          return db.collection('notifications').add({
            userId: doc.id,
            type: 'SYSTEM_ALERT',
            title: `${priority} Priority Ticket`,
            message: `New ticket: ${subject}`,
            data: {
              ticketId,
              notificationType: 'HIGH_PRIORITY_TICKET',
            },
            priority: priority === 'CRITICAL' ? 'HIGH' : 'NORMAL',
            read: false,
            createdAt: now,
          });
        });

        await Promise.all(adminNotifications);
      }

      functions.logger.info('Support ticket created successfully', {
        ticketId,
        userId,
        type,
        priority,
      });

      return {
        success: true,
        ticketId,
      };
    } catch (error: any) {
      functions.logger.error('Error creating support ticket', {
        error: error.message,
        userId: context.auth?.uid,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to create support ticket',
        error.message
      );
    }
  }
);