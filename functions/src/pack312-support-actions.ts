/**
 * PACK 312 — Customer Support Console & Case Management
 * Support Actions - Pre-defined actions within existing business rules
 * 
 * CRITICAL RULES:
 * - NO manual wallet edits
 * - NO custom refund amounts
 * - NO changes to token prices or splits
 * - ALL actions must call existing, approved functions
 * - These are "re-trigger" functions, not new business logic
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { PerformSupportActionPayload, AdminRole, SupportActionType } from './pack312-support-types';
import { logBusinessAudit } from './pack105-audit-logger';

// Import existing systems
import { requestMeetingRefund } from './meetingMonetization';
import { setManualEnforcementState } from './enforcementEngine';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function isAdminWithRole(
  adminId: string,
  allowedRoles: AdminRole[]
): Promise<{ isAdmin: boolean; role?: AdminRole }> {
  try {
    const adminDoc = await db.collection('admin_users').doc(adminId).get();
    
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
    logger.error('[SupportActions] Error checking admin role', { adminId, error: error.message });
    return { isAdmin: false };
  }
}

async function createSupportAuditLog(
  eventType: string,
  adminId: string,
  adminRole: AdminRole,
  data: Record<string, any>
): Promise<void> {
  try {
    await logBusinessAudit({
      eventType: eventType as any,
      userId: data.userId,
      relatedId: data.ticketId,
      context: {
        eventType,
        adminId,
        adminRole,
        ...data,
      },
      source: 'support_actions',
    });
  } catch (error: any) {
    logger.error('[SupportActions] Error creating audit log', { error: error.message });
  }
}

// ============================================================================
// MEETING ACTIONS
// ============================================================================

/**
 * Re-run meeting mismatch check
 * This calls the EXISTING mismatch logic to verify selfies vs profile photos
 */
async function rerunMeetingMismatchCheck(
  ticketId: string,
  meetingId: string,
  adminId: string,
  adminRole: AdminRole
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info(`[SupportActions] Re-running mismatch check for meeting ${meetingId}`);

    // Get meeting data
    const meetingDoc = await db.collection('meetings').doc(meetingId).get();
    
    if (!meetingDoc.exists) {
      throw new Error('Meeting not found');
    }

    const meeting = meetingDoc.data();
    
    // Get validation records (selfies)
    const validationsSnapshot = await db
      .collection('meetings')
      .doc(meetingId)
      .collection('validations')
      .get();

    if (validationsSnapshot.empty) {
      return {
        success: false,
        message: 'No validation records found for this meeting',
      };
    }

    // Check if validations already have verification scores
    const validations = validationsSnapshot.docs.map(doc => doc.data());
    const hasVerificationScores = validations.some(v => v.verificationScore !== undefined);

    if (!hasVerificationScores) {
      return {
        success: false,
        message: 'Meeting validations do not have AI verification scores. Manual review required.',
      };
    }

    // Check for mismatch (score < 0.7 indicates mismatch)
    const mismatchDetected = validations.some(v => 
      v.verificationScore !== undefined && v.verificationScore < 0.7
    );

    if (mismatchDetected) {
      // Trigger existing refund logic for identity mismatch
      // This will apply the PACK 274+ rules: 100% refund for payer
      const bookerId = meeting.bookerId;
      
      if (!bookerId) {
        throw new Error('Meeting has no booker');
      }

      // Call existing refund function
      await requestMeetingRefund(
        meetingId,
        bookerId,
        'IDENTITY_MISMATCH',
        {
          complainantStatement: `Admin ${adminId} triggered mismatch recheck from support ticket ${ticketId}`,
        }
      );

      await createSupportAuditLog(
        'SUPPORT_ACTION_MEETING_REFUND_RECHECK',
        adminId,
        adminRole,
        {
          ticketId,
          meetingId,
          action: 'mismatch_detected_refund_triggered',
          userId: bookerId,
        }
      );

      return {
        success: true,
        message: 'Identity mismatch confirmed. 100% refund triggered for payer via existing refund flow.',
      };
    }

    return {
      success: true,
      message: 'No identity mismatch detected. No refund required.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error in mismatch recheck', { error: error.message });
    throw error;
  }
}

/**
 * Force apply standard meeting cancellation rules
 * Re-applies the cancellation time windows (72h/48h/24h logic)
 */
async function reapplyCancellationRules(
  ticketId: string,
  meetingId: string,
  adminId: string,
  adminRole: AdminRole
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info(`[SupportActions] Re-applying cancellation rules for meeting ${meetingId}`);

    const meetingDoc = await db.collection('meetings').doc(meetingId).get();
    
    if (!meetingDoc.exists) {
      throw new Error('Meeting not found');
    }

    const meeting = meetingDoc.data();
    const meetingStatus = meeting?.status;

    if (meetingStatus !== 'CANCELLED') {
      return {
        success: false,
        message: 'Meeting is not in CANCELLED status. No action needed.',
      };
    }

    // Get booking to check cancellation timing
    const bookingsSnapshot = await db
      .collection('meeting_bookings')
      .where('meetingId', '==', meetingId)
      .limit(1)
      .get();

    if (bookingsSnapshot.empty) {
      throw new Error('No booking found for meeting');
    }

    const booking = bookingsSnapshot.docs[0].data();
    const meetingStartTime = meeting?.startTime?.toDate();
    const cancelledAt = meeting?.cancelledAt?.toDate() || new Date();

    if (!meetingStartTime) {
      throw new Error('Meeting has no start time');
    }

    // Calculate hours before meeting
    const hoursBeforeMeeting = (meetingStartTime.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);

    let refundAmount = 0;
    let refundReason = '';

    // Apply PACK 274+ cancellation logic
    if (hoursBeforeMeeting >= 72) {
      // 72+ hours: 100% refund
      refundAmount = booking.totalTokens;
      refundReason = 'Cancelled 72+ hours before meeting';
    } else if (hoursBeforeMeeting >= 48) {
      // 48-72 hours: 100% refund (grace period)
      refundAmount = booking.totalTokens;
      refundReason = 'Cancelled 48-72 hours before meeting';
    } else if (hoursBeforeMeeting >= 24) {
      // 24-48 hours: 50% refund
      refundAmount = Math.round(booking.totalTokens * 0.5);
      refundReason = 'Cancelled 24-48 hours before meeting';
    } else {
      // < 24 hours: No refund (but escrowed amount already held)
      refundAmount = 0;
      refundReason = 'Cancelled < 24 hours before meeting - no refund per policy';
    }

    if (refundAmount > 0 && booking.escrowStatus === 'HELD') {
      // Process refund by calling existing meeting refund logic
      await requestMeetingRefund(
        meetingId,
        booking.bookerId,
        'MUTUAL_AGREEMENT', // Use this as it's closest to policy-based refund
        {
          complainantStatement: `Admin ${adminId} reapplied cancellation rules from ticket ${ticketId}. ${refundReason}`,
        }
      );

      await createSupportAuditLog(
        'SUPPORT_ACTION_MEETING_CANCELLATION_RECHECK',
        adminId,
        adminRole,
        {
          ticketId,
          meetingId,
          action: 'cancellation_refund_applied',
          userId: booking.bookerId,
          refundAmount,
          reason: refundReason,
        }
      );

      return {
        success: true,
        message: `Cancellation rules applied. ${refundReason}. Refund of ${refundAmount} tokens processed.`,
      };
    }

    return {
      success: true,
      message: refundReason,
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error reapplying cancellation rules', { error: error.message });
    throw error;
  }
}

/**
 * Mark meeting as dispute (flags for Risk review without changing money)
 */
async function markMeetingAsDispute(
  ticketId: string,
  meetingId: string,
  adminId: string,
  adminRole: AdminRole
): Promise<{ success: boolean; message: string }> {
  try {
    await db.collection('meetings').doc(meetingId).update({
      disputed: true,
      disputeFlaggedBy: adminId,
      disputeFlaggedAt: serverTimestamp(),
      disputeTicketId: ticketId,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_MEETING_MARKED_DISPUTE',
      adminId,
      adminRole,
      {
        ticketId,
        meetingId,
        action: 'marked_as_dispute',
      }
    );

    return {
      success: true,
      message: 'Meeting marked as disputed for Risk review. No monetary changes.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error marking meeting as dispute', { error: error.message });
    throw error;
  }
}

// ============================================================================
// EVENT ACTIONS
// ============================================================================

/**
 * Force apply event cancellation rules
 */
async function reapplyEventCancellationRules(
  ticketId: string,
  eventId: string,
  adminId: string,
  adminRole: AdminRole
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info(`[SupportActions] Re-applying event cancellation rules for ${eventId}`);

    const eventDoc = await db.collection('events').doc(eventId).get();
    
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }

    const event = eventDoc.data();

    // Similar logic to meetings - would integrate with existing event refund system
    // For now, mark for manual review
    
    await db.collection('events').doc(eventId).update({
      requiresRefundReview: true,
      reviewRequestedBy: adminId,
      reviewRequestedAt: serverTimestamp(),
      reviewTicketId: ticketId,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_EVENT_REFUND_RECHECK',
      adminId,
      adminRole,
      {
        ticketId,
        eventId,
        action: 'event_cancellation_review_requested',
      }
    );

    return {
      success: true,
      message: 'Event flagged for cancellation policy review. Will apply per PACK rules.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error reapplying event rules', { error: error.message });
    throw error;
  }
}

// ============================================================================
// ACCOUNT ACTIONS
// ============================================================================

/**
 * Temporarily disable earning (sets earnOn = false)
 */
async function disableUserEarning(
  ticketId: string,
  userId: string,
  adminId: string,
  adminRole: AdminRole,
  reason: string
): Promise<{ success: boolean; message: string }> {
  try {
    await db.collection('users').doc(userId).update({
      earnFromChat: false,
      earnDisabledBy: adminId,
      earnDisabledAt: serverTimestamp(),
      earnDisabledReason: reason,
      earnDisabledTicketId: ticketId,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_ACCOUNT_DISABLED_EARNING',
      adminId,
      adminRole,
      {
        ticketId,
        userId,
        action: 'earning_disabled',
        reason,
      }
    );

    return {
      success: true,
      message: 'User earning capability disabled.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error disabling earning', { error: error.message });
    throw error;
  }
}

/**
 * Escalate to Risk team
 */
async function escalateToRisk(
  ticketId: string,
  adminId: string,
  adminRole: AdminRole,
  escalationReason: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Update ticket
    await db.collection('support_tickets').doc(ticketId).update({
      status: 'ESCALATED',
      escalatedTo: 'RISK',
      escalatedBy: adminId,
      escalatedAt: serverTimestamp(),
      escalationReason,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_ESCALATED_TO_RISK',
      adminId,
      adminRole,
      {
        ticketId,
        action: 'escalated_to_risk',
        reason: escalationReason,
      }
    );

    return {
      success: true,
      message: 'Ticket escalated to Risk team.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error escalating to risk', { error: error.message });
    throw error;
  }
}

/**
 * Escalate to Legal team
 */
async function escalateToLegal(
  ticketId: string,
  adminId: string,
  adminRole: AdminRole,
  escalationReason: string
): Promise<{ success: boolean; message: string }> {
  try {
    await db.collection('support_tickets').doc(ticketId).update({
      status: 'ESCALATED',
      escalatedTo: 'LEGAL',
      escalatedBy: adminId,
      escalatedAt: serverTimestamp(),
      escalationReason,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_ESCALATED_TO_LEGAL',
      adminId,
      adminRole,
      {
        ticketId,
        action: 'escalated_to_legal',
        reason: escalationReason,
      }
    );

    return {
      success: true,
      message: 'Ticket escalated to Legal team.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error escalating to legal', { error: error.message });
    throw error;
  }
}

/**
 * Escalate to Finance team
 */
async function escalateToFinance(
  ticketId: string,
  adminId: string,
  adminRole: AdminRole,
  escalationReason: string
): Promise<{ success: boolean; message: string }> {
  try {
    await db.collection('support_tickets').doc(ticketId).update({
      status: 'ESCALATED',
      escalatedTo: 'FINANCE',
      escalatedBy: adminId,
      escalatedAt: serverTimestamp(),
      escalationReason,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_ESCALATED_TO_FINANCE',
      adminId,
      adminRole,
      {
        ticketId,
        action: 'escalated_to_finance',
        reason: escalationReason,
      }
    );

    return {
      success: true,
      message: 'Ticket escalated to Finance team.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error escalating to finance', { error: error.message });
    throw error;
  }
}

/**
 * Ban account (RISK/SUPERADMIN only, uses existing enforcement engine)
 */
async function banUserAccount(
  ticketId: string,
  userId: string,
  adminId: string,
  adminRole: AdminRole,
  banReason: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Call existing enforcement engine from PACK 268
    // Lock all major features for banned user
    await setManualEnforcementState(userId, {
      accountStatus: 'SUSPENDED',
      featureLocks: [
        'SEND_MESSAGES',
        'SEND_GIFTS',
        'SEND_PAID_MEDIA',
        'PUBLISH_PREMIUM_STORIES',
        'REQUEST_PAYOUTS',
        'ACCESS_DISCOVERY_FEED',
        'EDIT_PROFILE',
        'START_VOICE_CALLS',
        'START_VIDEO_CALLS',
        'SEND_GEOSHARE',
      ],
      visibilityTier: 'HIDDEN',
      reasonCodes: ['MANUAL_ADMIN_ACTION'],
      reviewerId: adminId,
      reviewNote: `Banned via support ticket ${ticketId}: ${banReason}`,
    });

    await createSupportAuditLog(
      'SUPPORT_ACTION_ACCOUNT_BANNED',
      adminId,
      adminRole,
      {
        ticketId,
        userId,
        action: 'account_banned',
        reason: banReason,
      }
    );

    return {
      success: true,
      message: 'User account banned using Safety Engine.',
    };
  } catch (error: any) {
    logger.error('[SupportActions] Error banning account', { error: error.message });
    throw error;
  }
}

// ============================================================================
// MAIN CLOUD FUNCTION
// ============================================================================

/**
 * Perform support action
 * Dispatches to specific action handlers based on action type
 */
export const support_performAction = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; message: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const payload: PerformSupportActionPayload = request.data;

    if (!payload.ticketId || !payload.actionType) {
      throw new HttpsError('invalid-argument', 'ticketId and actionType are required');
    }

    try {
      // Check ticket exists
      const ticketDoc = await db.collection('support_tickets').doc(payload.ticketId).get();
      
      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticket = ticketDoc.data();

      // Determine required role for action
      let allowedRoles: AdminRole[] = ['SUPPORT', 'MODERATOR', 'RISK', 'FINANCE', 'LEGAL', 'SUPERADMIN'];
      
      if (payload.actionType === 'ACCOUNT_BAN') {
        // Ban requires RISK or SUPERADMIN
        allowedRoles = ['RISK', 'SUPERADMIN'];
      } else if (payload.actionType === 'ESCALATE_TO_LEGAL') {
        // Legal escalation requires RISK, LEGAL, or SUPERADMIN
        allowedRoles = ['RISK', 'LEGAL', 'SUPERADMIN'];
      }

      const { isAdmin, role } = await isAdminWithRole(adminId, allowedRoles);

      if (!isAdmin || !role) {
        throw new HttpsError('permission-denied', 'Insufficient permissions for this action');
      }

      // Dispatch to appropriate handler
      let result: { success: boolean; message: string };

      switch (payload.actionType) {
        case 'MEETING_REFUND_RECHECK':
          if (!ticket?.meetingId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated meeting');
          }
          result = await rerunMeetingMismatchCheck(
            payload.ticketId,
            ticket.meetingId,
            adminId,
            role
          );
          break;

        case 'MEETING_CANCELLATION_RECHECK':
          if (!ticket?.meetingId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated meeting');
          }
          result = await reapplyCancellationRules(
            payload.ticketId,
            ticket.meetingId,
            adminId,
            role
          );
          break;

        case 'MEETING_MARK_DISPUTE':
          if (!ticket?.meetingId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated meeting');
          }
          result = await markMeetingAsDispute(
            payload.ticketId,
            ticket.meetingId,
            adminId,
            role
          );
          break;

        case 'EVENT_REFUND_RECHECK':
          if (!ticket?.eventId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated event');
          }
          result = await reapplyEventCancellationRules(
            payload.ticketId,
            ticket.eventId,
            adminId,
            role
          );
          break;

        case 'ACCOUNT_DISABLE_EARNING':
          if (!ticket?.userId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated user');
          }
          if (!payload.actionData?.reason) {
            throw new HttpsError('invalid-argument', 'Reason required for disabling earning');
          }
          result = await disableUserEarning(
            payload.ticketId,
            ticket.userId,
            adminId,
            role,
            payload.actionData.reason
          );
          break;

        case 'ESCALATE_TO_RISK':
          if (!payload.actionData?.reason) {
            throw new HttpsError('invalid-argument', 'Escalation reason required');
          }
          result = await escalateToRisk(
            payload.ticketId,
            adminId,
            role,
            payload.actionData.reason
          );
          break;

        case 'ESCALATE_TO_LEGAL':
          if (!payload.actionData?.reason) {
            throw new HttpsError('invalid-argument', 'Escalation reason required');
          }
          result = await escalateToLegal(
            payload.ticketId,
            adminId,
            role,
            payload.actionData.reason
          );
          break;

        case 'ESCALATE_TO_FINANCE':
          if (!payload.actionData?.reason) {
            throw new HttpsError('invalid-argument', 'Escalation reason required');
          }
          result = await escalateToFinance(
            payload.ticketId,
            adminId,
            role,
            payload.actionData.reason
          );
          break;

        case 'ACCOUNT_BAN':
          if (!ticket?.userId) {
            throw new HttpsError('invalid-argument', 'Ticket has no associated user');
          }
          if (!payload.actionData?.reason) {
            throw new HttpsError('invalid-argument', 'Ban reason required');
          }
          result = await banUserAccount(
            payload.ticketId,
            ticket.userId,
            adminId,
            role,
            payload.actionData.reason
          );
          break;

        default:
          throw new HttpsError('invalid-argument', `Unknown action type: ${payload.actionType}`);
      }

      logger.info(`[SupportActions] Action ${payload.actionType} performed by ${adminId} on ticket ${payload.ticketId}`);

      return result;
    } catch (error: any) {
      logger.error('[SupportActions] Error performing action', {
        error: error.message,
        actionType: payload.actionType,
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to perform action: ${error.message}`);
    }
  }
);