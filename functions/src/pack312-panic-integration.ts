/**
 * PACK 312 — Customer Support Console & Case Management
 * Panic Button Integration - Auto-create critical support tickets
 * 
 * This integrates with the existing panic button system from PACK 274+
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { SupportTicket } from './pack312-support-types';

/**
 * Auto-create CRITICAL support ticket when panic button is triggered
 * Triggers on: meetings/{meetingId}/panic_alerts/{alertId}
 */
export const onPanicButtonTriggered = onDocumentCreated(
  {
    document: 'meetings/{meetingId}/panic_alerts/{alertId}',
    region: 'europe-west3',
  },
  async (event) => {
    const alertData = event.data?.data();
    const { meetingId, alertId } = event.params;

    if (!alertData) {
      logger.warn('[PanicIntegration] No alert data found');
      return;
    }

    try {
      logger.info(`[PanicIntegration] Creating support ticket for panic alert ${alertId}`);

      // Get meeting data for context
      const meetingDoc = await db.collection('meetings').doc(meetingId).get();
      const meeting = meetingDoc.data();

      // Create CRITICAL support ticket
      const ticketId = generateId();
      
      const ticket: SupportTicket = {
        ticketId,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: {
          type: 'SYSTEM',
        },
        status: 'OPEN',
        priority: 'CRITICAL',
        category: 'SAFETY_REPORT',
        userId: alertData.userId,
        otherUserId: alertData.matchedUserProfile?.userId || 
                     (alertData.userId === meeting?.creatorId ? meeting?.bookerId : meeting?.creatorId),
        meetingId,
        subject: `PANIC BUTTON TRIGGERED: ${alertData.alertType}`,
        description: `
CRITICAL SAFETY ALERT

Alert Type: ${alertData.alertType}
Meeting ID: ${meetingId}
Alert ID: ${alertId}
Triggered By: ${alertData.userId}
Timestamp: ${alertData.timestamp?.toDate?.()?.toISOString() || 'Unknown'}

Location: ${alertData.location?.lat ? `${alertData.location.lat}, ${alertData.location.lng}` : 'Unknown'}

${alertData.matchedUserProfile ? `
Other Party:
- User ID: ${alertData.matchedUserProfile.userId}
- Name: ${alertData.matchedUserProfile.name}
` : ''}

${alertData.trustedContactId ? `Trusted Contact Notified: ${alertData.trustedContactId}` : ''}
${alertData.emergencyContactNotified ? 'Emergency contact notified: YES' : ''}

This ticket requires IMMEDIATE attention from the Risk/Safety team.
        `.trim(),
        tags: [
          'PANIC_BUTTON',
          alertData.alertType,
          'AUTO_CREATED',
          'SAFETY_CRITICAL',
        ],
      };

      await db.collection('support_tickets').doc(ticketId).set(ticket);

      // Create initial message with action items
      const messageId = generateId();
      await db.collection('support_ticket_messages').doc(messageId).set({
        messageId,
        ticketId,
        createdAt: serverTimestamp(),
        authorType: 'SYSTEM',
        authorId: 'system',
        message: `
AUTOMATED SAFETY PROTOCOL ACTIVATED

Immediate Actions Required:
1. Review meeting context and user profiles
2. Assess safety risk level
3. Contact user if needed to confirm safety
4. Review location data (if shared)
5. Coordinate with local authorities if necessary
6. Document incident resolution

Meeting has been automatically cancelled.
${alertData.selfieUrl ? `Alert selfie available for review.` : ''}
        `.trim(),
        internalNote: true,
      });

      logger.info(`[PanicIntegration] Created critical ticket ${ticketId} for panic alert ${alertId}`);
    } catch (error: any) {
      logger.error('[PanicIntegration] Error creating support ticket for panic alert', {
        error: error.message,
        alertId,
        meetingId,
      });
    }
  }
);

/**
 * Auto-create support ticket for meeting identity mismatches
 * Triggers on: meeting_refunds/{refundId} where refundReason === 'IDENTITY_MISMATCH'
 */
export const onIdentityMismatchRefund = onDocumentCreated(
  {
    document: 'meeting_refunds/{refundId}',
    region: 'europe-west3',
  },
  async (event) => {
    const refundData = event.data?.data();
    const { refundId } = event.params;

    if (!refundData || refundData.refundReason !== 'IDENTITY_MISMATCH') {
      return; // Only process identity mismatch refunds
    }

    try {
      logger.info(`[PanicIntegration] Creating support ticket for identity mismatch ${refundId}`);

      const ticketId = generateId();
      
      const ticket: SupportTicket = {
        ticketId,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: {
          type: 'SYSTEM',
        },
        status: 'OPEN',
        priority: 'HIGH',
        category: 'MEETING_MISMATCH',
        userId: refundData.bookerId,
        otherUserId: refundData.creatorId,
        meetingId: refundData.meetingId,
        subject: 'Identity Mismatch Detected - Meeting Refunded',
        description: `
IDENTITY VERIFICATION FAILURE

Meeting ID: ${refundData.meetingId}
Refund ID: ${refundId}

Payer (Reporter): ${refundData.bookerId}
Earner (Reported): ${refundData.creatorId}

Refund Amount: ${refundData.refundAmount} tokens
Avalo Fee Refunded: ${refundData.avaloFeeRefunded ? 'YES (confirmed fraud)' : 'NO'}

${refundData.evidence?.complainantStatement || 'No complainant statement provided.'}

Action Required:
- Review meeting selfies vs profile photos
- Review verification history for reported user
- Assess if further action needed (trust score adjustment, account review)
- Check for pattern of similar reports

Automatic refund has been processed per policy.
        `.trim(),
        tags: [
          'IDENTITY_MISMATCH',
          'SELFIE_VERIFICATION',
          'AUTO_REFUND_PROCESSED',
          'TRUST_REVIEW_NEEDED',
        ],
      };

      await db.collection('support_tickets').doc(ticketId).set(ticket);

      logger.info(`[PanicIntegration] Created ticket ${ticketId} for identity mismatch ${refundId}`);
    } catch (error: any) {
      logger.error('[PanicIntegration] Error creating ticket for identity mismatch', {
        error: error.message,
        refundId,
      });
    }
  }
);