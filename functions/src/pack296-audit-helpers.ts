/**
 * PACK 296 — Compliance & Audit Layer
 * Core audit logging helpers and utilities
 */

import { db, generateId, serverTimestamp } from './init';
import { createHash } from 'crypto';
import type {
  AuditLogParams,
  AuditLogDocument,
  ActionType,
  ActorType,
  ResourceType,
  AuditLogMetadata,
} from './types/audit.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DATA_RETENTION = {
  auditLogsYears: 5,
  safetyReportsYears: 5,
  financialRecordsYears: 10,
};

const AUDIT_SALT = process.env.AUDIT_IP_SALT || 'avalo-audit-salt-2025';

// ============================================================================
// CORE AUDIT LOGGING FUNCTION
// ============================================================================

/**
 * Write an audit log entry
 * This is the central function that all services must use for audit logging
 */
export async function writeAuditLog(params: AuditLogParams): Promise<string> {
  try {
    const logId = generateId();
    const now = serverTimestamp();

    const auditLog: AuditLogDocument = {
      logId,
      timestamp: now as any,
      actorType: params.actorType,
      actorId: params.actorId || null,
      actionType: params.actionType,
      resourceType: params.resourceType || 'SYSTEM',
      resourceId: params.resourceId || null,
      metadata: params.metadata || {},
      sensitive: params.sensitive || false,
      createdAt: now as any,
    };

    await db.collection('auditLogs').doc(logId).set(auditLog);

    console.log(`[AUDIT] ${params.actionType} by ${params.actorType}:${params.actorId || 'system'}`);

    return logId;
  } catch (error) {
    console.error('[AUDIT] Failed to write audit log:', error);
    // Don't throw - audit logging should not break main flow
    return '';
  }
}

// ============================================================================
// SPECIALIZED AUDIT LOGGING FUNCTIONS
// ============================================================================

/**
 * Log user registration
 */
export async function logUserRegistration(
  userId: string,
  metadata: {
    ipCountry?: string;
    ipAddress?: string;
    deviceId?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'SYSTEM',
    actorId: null,
    actionType: 'USER_REGISTRATION',
    resourceType: 'USER',
    resourceId: userId,
    metadata: {
      ipCountry: metadata.ipCountry,
      ipHash: metadata.ipAddress ? hashIpAddress(metadata.ipAddress) : undefined,
      deviceId: metadata.deviceId,
    },
  });
}

/**
 * Log login events
 */
export async function logLogin(
  userId: string,
  success: boolean,
  metadata: {
    ipAddress?: string;
    ipCountry?: string;
    deviceId?: string;
    failureReason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
    resourceType: 'USER',
    resourceId: userId,
    metadata: {
      ipHash: metadata.ipAddress ? hashIpAddress(metadata.ipAddress) : undefined,
      ipCountry: metadata.ipCountry,
      deviceId: metadata.deviceId,
      reason: metadata.failureReason,
    },
  });
}

/**
 * Log KYC events
 */
export async function logKycEvent(
  userId: string,
  actionType: 'KYC_SUBMITTED' | 'KYC_VERIFIED' | 'KYC_REJECTED',
  metadata: {
    documentId?: string;
    reviewerId?: string;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: actionType === 'KYC_SUBMITTED' ? 'USER' : 'ADMIN',
    actorId: actionType === 'KYC_SUBMITTED' ? userId : metadata.reviewerId || null,
    actionType,
    resourceType: 'USER',
    resourceId: userId,
    metadata: {
      documentId: metadata.documentId,
      reason: metadata.reason,
    },
    sensitive: true,
  });
}

/**
 * Log token purchase
 */
export async function logTokenPurchase(
  userId: string,
  metadata: {
    amountTokens: number;
    amountFiat: number;
    currency: string;
    provider: string;
    transactionId?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType: 'TOKEN_PURCHASE',
    resourceType: 'PAYMENT',
    resourceId: metadata.transactionId || null,
    metadata,
  });
}

/**
 * Log payout events
 */
export async function logPayoutEvent(
  userId: string,
  actionType: 'PAYOUT_REQUESTED' | 'PAYOUT_APPROVED' | 'PAYOUT_REJECTED' | 'PAYOUT_PAID',
  metadata: {
    requestId: string;
    amountTokens: number;
    amountFiat?: number;
    currency?: string;
    reviewerId?: string;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: actionType === 'PAYOUT_REQUESTED' ? 'USER' : 'ADMIN',
    actorId: actionType === 'PAYOUT_REQUESTED' ? userId : metadata.reviewerId || null,
    actionType,
    resourceType: 'PAYMENT',
    resourceId: metadata.requestId,
    metadata,
  });
}

/**
 * Log chat events
 */
export async function logChatEvent(
  userId: string,
  actionType: 'CHAT_STARTED' | 'CHAT_PAID_SEGMENT_STARTED' | 'CHAT_REFUND_APPLIED',
  metadata: {
    chatId: string;
    otherUserId?: string;
    amountTokens?: number;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType,
    resourceType: 'CHAT',
    resourceId: metadata.chatId,
    metadata,
  });
}

/**
 * Log call events
 */
export async function logCallEvent(
  userId: string,
  actionType: 'CALL_STARTED' | 'CALL_ENDED',
  metadata: {
    callId: string;
    otherUserId?: string;
    duration?: number;
    amountTokens?: number;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType,
    resourceType: 'CALL',
    resourceId: metadata.callId,
    metadata,
  });
}

/**
 * Log calendar booking events
 */
export async function logBookingEvent(
  userId: string,
  actionType: 'CALENDAR_BOOKING_CREATED' | 'CALENDAR_BOOKING_CANCELLED' | 'CALENDAR_REFUND_APPLIED',
  metadata: {
    bookingId: string;
    creatorId?: string;
    meetingTime?: string;
    amountTokens?: number;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType,
    resourceType: 'BOOKING',
    resourceId: metadata.bookingId,
    metadata,
  });
}

/**
 * Log event (group meeting) actions
 */
export async function logEventAction(
  userId: string,
  actionType: 'EVENT_CREATED' | 'EVENT_CANCELLED' | 'EVENT_REFUND_APPLIED',
  metadata: {
    eventId: string;
    eventTime?: string;
    amountTokens?: number;
    attendeeCount?: number;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType,
    resourceType: 'EVENT',
    resourceId: metadata.eventId,
    metadata,
  });
}

/**
 * Log panic button trigger
 */
export async function logPanicButton(
  userId: string,
  metadata: {
    location?: { lat: number; lng: number };
    meetingId?: string;
    eventId?: string;
    reason?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType: 'PANIC_BUTTON_TRIGGERED',
    resourceType: 'SYSTEM',
    resourceId: metadata.meetingId || metadata.eventId || null,
    metadata: {
      locationSnapshot: metadata.location ? `${metadata.location.lat},${metadata.location.lng}` : undefined,
      meetingId: metadata.meetingId,
      eventId: metadata.eventId,
      reason: metadata.reason,
    },
    sensitive: true,
  });
}

/**
 * Log safety report submission
 */
export async function logSafetyReport(
  reporterId: string,
  metadata: {
    reportId: string;
    targetUserId?: string;
    reportType: string;
    contentId?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: reporterId,
    actionType: 'SAFETY_REPORT_SUBMITTED',
    resourceType: 'CONTENT',
    resourceId: metadata.contentId || null,
    metadata: {
      reportId: metadata.reportId,
      targetUserId: metadata.targetUserId,
      reportType: metadata.reportType,
    },
    sensitive: true,
  });
}

/**
 * Log account enforcement actions
 */
export async function logAccountEnforcement(
  userId: string,
  actionType: 'ACCOUNT_SUSPENDED' | 'ACCOUNT_BANNED' | 'ACCOUNT_RESTORED',
  metadata: {
    adminId: string;
    reason: string;
    riskScoreBefore?: number;
    riskScoreAfter?: number;
    until?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'ADMIN',
    actorId: metadata.adminId,
    actionType,
    resourceType: 'USER',
    resourceId: userId,
    metadata,
    sensitive: true,
  });
}

/**
 * Log content removal
 */
export async function logContentRemoval(
  userId: string,
  metadata: {
    contentId: string;
    contentType: string;
    adminId?: string;
    reason: string;
    riskScore?: number;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: metadata.adminId ? 'ADMIN' : 'SYSTEM',
    actorId: metadata.adminId || null,
    actionType: 'CONTENT_REMOVED',
    resourceType: 'CONTENT',
    resourceId: metadata.contentId,
    metadata: {
      contentType: metadata.contentType,
      reason: metadata.reason,
      riskScore: metadata.riskScore,
    },
  });
}

/**
 * Log policy acceptance
 */
export async function logPolicyAcceptance(
  userId: string,
  metadata: {
    docId: string;
    version: string;
    docType: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'USER',
    actorId: userId,
    actionType: 'POLICY_ACCEPTED',
    resourceType: 'LEGAL',
    resourceId: metadata.docId,
    metadata,
  });
}

/**
 * Log legal document updates
 */
export async function logLegalDocUpdate(
  metadata: {
    docId: string;
    version: string;
    docType: string;
    adminId?: string;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'ADMIN',
    actorId: metadata.adminId || null,
    actionType: 'LEGAL_DOC_UPDATED',
    resourceType: 'LEGAL',
    resourceId: metadata.docId,
    metadata,
  });
}

/**
 * Log admin actions
 */
export async function logAdminAction(
  adminId: string,
  actionType: 'ADMIN_NOTE_ADDED' | 'ADMIN_RISK_OVERRIDE' | 'ADMIN_AUDIT_VIEW' | 'ADMIN_EXPORT_CREATED',
  metadata: {
    targetUserId?: string;
    resourceType?: ResourceType;
    resourceId?: string;
    details?: any;
  }
): Promise<void> {
  await writeAuditLog({
    actorType: 'ADMIN',
    actorId: adminId,
    actionType,
    resourceType: metadata.resourceType || 'SYSTEM',
    resourceId: metadata.resourceId || metadata.targetUserId || null,
    metadata: metadata.details || {},
    sensitive: true,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Hash IP address for privacy (one-way hash with salt)
 */
export function hashIpAddress(ipAddress: string): string {
  return createHash('sha256')
    .update(ipAddress + AUDIT_SALT)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Check if admin has permission to view audit logs
 */
export async function canViewAuditLogs(adminId: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection('adminUsers').doc(adminId).get();
    
    if (!adminDoc.exists) {
      return false;
    }

    const admin = adminDoc.data();
    return admin?.role === 'RISK' || admin?.role === 'SUPERADMIN';
  } catch (error) {
    console.error('Error checking admin permissions:', error);
    return false;
  }
}

/**
 * Check if admin has SUPERADMIN role
 */
export async function isSuperAdmin(adminId: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection('adminUsers').doc(adminId).get();
    
    if (!adminDoc.exists) {
      return false;
    }

    const admin = adminDoc.data();
    return admin?.role === 'SUPERADMIN';
  } catch (error) {
    console.error('Error checking admin role:', error);
    return false;
  }
}