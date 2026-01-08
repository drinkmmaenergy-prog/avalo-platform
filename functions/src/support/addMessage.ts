/**
 * PACK 300 - Add Message to Support Ticket
 * Cloud Function to add a message to an existing ticket
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import {
  SupportTicketMessage,
  AddMessageRequest,
  AddMessageResponse,
  containsSensitiveData,
} from '../../../shared/types/support';

const db = admin.firestore();

export const addMessage = functions.https.onCall(
  async (data: AddMessageRequest, context): Promise<AddMessageResponse> => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to add a message'
        );
      }

      const userId = context.auth.uid;
      const { ticketId, body, internal } = data;

      // Validation
      if (!ticketId || !body) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required fields: ticketId, body'
        );
      }

      if (body.length === 0 || body.length > 5000) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Message body must be between 1 and 5000 characters'
        );
      }

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

      // Check if user owns the ticket or is an admin
      const isOwner = ticket?.userId === userId;
      const adminDoc = await db.collection('adminUsers').doc(userId).get();
      const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;

      if (!isOwner && !isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You do not have permission to add messages to this ticket'
        );
      }

      // Only admins can create internal messages
      if (internal && !isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can create internal messages'
        );
      }

      // Check if ticket is closed
      if (ticket?.status === 'CLOSED' && !isAdmin) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Cannot add messages to a closed ticket'
        );
      }

      // Check for sensitive data
      const hasSensitiveData = containsSensitiveData(body);
      if (hasSensitiveData) {
        functions.logger.warn('Sensitive data detected in ticket message', {
          userId,
          ticketId,
        });
      }

      // Generate message ID
      const messageId = uuidv4();
      const now = new Date().toISOString();

      // Determine author type
      const authorType = isAdmin ? 'SUPPORT' : 'USER';

      // Create message object
      const message: SupportTicketMessage = {
        messageId,
        ticketId,
        authorType,
        authorId: userId,
        body,
        createdAt: now,
        internal: internal || false,
        redacted: hasSensitiveData,
      };

      // Save message to Firestore
      await db.collection('supportTicketMessages').doc(messageId).set(message);

      // Update ticket's lastMessageAt
      await ticketRef.update({
        lastMessageAt: now,
        updatedAt: now,
        // If ticket is RESOLVED and user replies, reopen it
        ...(ticket?.status === 'RESOLVED' && isOwner ? { status: 'IN_PROGRESS' } : {}),
      });

      // Log audit event
      await db.collection('auditLogs').add({
        eventType: 'SUPPORT_TICKET_MESSAGE_ADDED',
        actorId: userId,
        actorType: isAdmin ? 'ADMIN' : 'USER',
        targetId: ticketId,
        targetType: 'TICKET',
        metadata: {
          messageId,
          authorType,
          internal: internal || false,
          hasSensitiveData,
        },
        timestamp: now,
      });

      // Send notification
      if (authorType === 'SUPPORT' && !internal) {
        // Support replied to user - notify ticket owner
        await db.collection('notifications').add({
          userId: ticket.userId,
          type: 'SUPPORT_REPLY',
          title: 'Support Replied',
          message: 'Support has replied to your ticket',
          data: {
            ticketId,
            messageId,
            notificationType: 'SUPPORT_REPLY',
          },
          priority: 'NORMAL',
          read: false,
          createdAt: now,
        });
      } else if (authorType === 'USER') {
        // User replied to ticket - notify assigned admin if any
        if (ticket.adminAssignedId) {
          await db.collection('notifications').add({
            userId: ticket.adminAssignedId,
            type: 'SYSTEM_ALERT',
            title: 'User Replied to Ticket',
            message: `User replied to ticket #${ticketId.split('-')[0]}`,
            data: {
              ticketId,
              messageId,
              notificationType: 'USER_REPLY',
            },
            priority: ticket.priority === 'CRITICAL' ? 'HIGH' : 'NORMAL',
            read: false,
            createdAt: now,
          });
        }
      }

      functions.logger.info('Message added to ticket successfully', {
        messageId,
        ticketId,
        authorType,
      });

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      functions.logger.error('Error adding message to ticket', {
        error: error.message,
        userId: context.auth?.uid,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to add message to ticket',
        error.message
      );
    }
  }
);