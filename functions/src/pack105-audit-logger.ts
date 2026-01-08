/**
 * PACK 105 — Immutable Business Audit Logger
 * 
 * Append-only audit log for regulatory compliance
 * NO UPDATE OR DELETE operations allowed
 * 
 * Business Rules:
 * - All finance-related events must be logged
 * - Logs are immutable (append-only)
 * - No PII stored directly (encrypted references only)
 * - Exportable for compliance audits
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { 
  BusinessAuditLog, 
  BusinessAuditEventType 
} from './pack105-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CORE AUDIT LOGGING
// ============================================================================

/**
 * Log a business audit event (immutable)
 * This is the ONLY way to write to business_audit_log
 */
export async function logBusinessAudit(params: {
  eventType: BusinessAuditEventType;
  userId?: string;
  relatedId?: string;
  context: Record<string, any>;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<string> {
  const id = generateId();
  
  const auditLog: Omit<BusinessAuditLog, 'createdAt'> & { createdAt: any } = {
    id,
    eventType: params.eventType,
    userId: params.userId,
    relatedId: params.relatedId,
    context: params.context || {},
    source: params.source,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    createdAt: serverTimestamp(),
  };

  try {
    await db.collection('business_audit_log').doc(id).set(auditLog);
    
    logger.info(`[BusinessAudit] ${params.eventType}`, {
      id,
      userId: params.userId,
      relatedId: params.relatedId,
      source: params.source,
    });

    return id;
  } catch (error: any) {
    logger.error('[BusinessAudit] Failed to log event', {
      error: error.message,
      eventType: params.eventType,
    });
    throw error;
  }
}

// ============================================================================
// SPECIFIC AUDIT LOG HELPERS
// ============================================================================

/**
 * Log payment intent creation
 */
export async function logPaymentIntent(params: {
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  metadata?: Record<string, any>;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYMENT_INTENT',
    userId: params.userId,
    context: {
      amount: params.amount,
      currency: params.currency,
      paymentMethod: params.paymentMethod,
      ...params.metadata,
    },
    source: 'payment_system',
  });
}

/**
 * Log payment completion
 */
export async function logPaymentCompleted(params: {
  userId: string;
  transactionId: string;
  amountTokens: number;
  amountPaid: number;
  currency: string;
  provider: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYMENT_COMPLETED',
    userId: params.userId,
    relatedId: params.transactionId,
    context: {
      amountTokens: params.amountTokens,
      amountPaid: params.amountPaid,
      currency: params.currency,
      provider: params.provider,
    },
    source: 'payment_system',
  });
}

/**
 * Log token purchase
 */
export async function logTokenPurchase(params: {
  userId: string;
  tokens: number;
  paymentId: string;
  source: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'TOKEN_PURCHASE',
    userId: params.userId,
    relatedId: params.paymentId,
    context: {
      tokens: params.tokens,
      purchaseSource: params.source,
    },
    source: 'token_system',
  });
}

/**
 * Log earning recorded
 */
export async function logEarningRecorded(params: {
  creatorId: string;
  sourceType: string;
  sourceId: string;
  grossTokens: number;
  netTokens: number;
  commission: number;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'EARNING_RECORDED',
    userId: params.creatorId,
    relatedId: params.sourceId,
    context: {
      sourceType: params.sourceType,
      grossTokens: params.grossTokens,
      netTokens: params.netTokens,
      commission: params.commission,
    },
    source: 'earnings_system',
  });
}

/**
 * Log KYC submission
 */
export async function logKycSubmitted(params: {
  userId: string;
  documentId: string;
  documentType: string;
  country: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'KYC_SUBMITTED',
    userId: params.userId,
    relatedId: params.documentId,
    context: {
      documentType: params.documentType,
      country: params.country,
    },
    source: 'kyc_system',
  });
}

/**
 * Log KYC approval
 */
export async function logKycApproved(params: {
  userId: string;
  documentId: string;
  reviewerId: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'KYC_APPROVED',
    userId: params.userId,
    relatedId: params.documentId,
    context: {
      reviewerId: params.reviewerId,
      approvalTimestamp: new Date().toISOString(),
    },
    source: 'kyc_system',
  });
}

/**
 * Log KYC rejection
 */
export async function logKycRejected(params: {
  userId: string;
  documentId: string;
  reviewerId: string;
  reason: string;
  reasonCodes: string[];
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'KYC_REJECTED',
    userId: params.userId,
    relatedId: params.documentId,
    context: {
      reviewerId: params.reviewerId,
      reason: params.reason,
      reasonCodes: params.reasonCodes,
    },
    source: 'kyc_system',
  });
}

/**
 * Log KYC block
 */
export async function logKycBlocked(params: {
  userId: string;
  reviewerId: string;
  reason: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'KYC_BLOCKED',
    userId: params.userId,
    context: {
      reviewerId: params.reviewerId,
      reason: params.reason,
    },
    source: 'kyc_system',
  });
}

/**
 * Log payout request
 */
export async function logPayoutRequested(params: {
  userId: string;
  payoutId: string;
  amountTokens: number;
  amountPLN: number;
  method: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYOUT_REQUESTED',
    userId: params.userId,
    relatedId: params.payoutId,
    context: {
      amountTokens: params.amountTokens,
      amountPLN: params.amountPLN,
      method: params.method,
    },
    source: 'payout_system',
  });
}

/**
 * Log payout processing
 */
export async function logPayoutProcessing(params: {
  userId: string;
  payoutId: string;
  processor: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYOUT_PROCESSING',
    userId: params.userId,
    relatedId: params.payoutId,
    context: {
      processor: params.processor,
    },
    source: 'payout_system',
  });
}

/**
 * Log payout completion
 */
export async function logPayoutCompleted(params: {
  userId: string;
  payoutId: string;
  externalReference?: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYOUT_COMPLETED',
    userId: params.userId,
    relatedId: params.payoutId,
    context: {
      externalReference: params.externalReference,
      completedAt: new Date().toISOString(),
    },
    source: 'payout_system',
  });
}

/**
 * Log payout failure
 */
export async function logPayoutFailed(params: {
  userId: string;
  payoutId: string;
  reason: string;
  errorCode?: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'PAYOUT_FAILED',
    userId: params.userId,
    relatedId: params.payoutId,
    context: {
      reason: params.reason,
      errorCode: params.errorCode,
    },
    source: 'payout_system',
  });
}

/**
 * Log reconciliation mismatch
 */
export async function logReconciliationMismatch(params: {
  payoutId: string;
  userId?: string;
  internalValue: any;
  externalValue: any;
  provider: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'RECONCILIATION_MISMATCH',
    userId: params.userId,
    relatedId: params.payoutId,
    context: {
      internalValue: params.internalValue,
      externalValue: params.externalValue,
      provider: params.provider,
    },
    source: 'reconciliation_engine',
  });
}

/**
 * Log VAT invoice generation
 */
export async function logVatInvoiceGenerated(params: {
  userId: string;
  invoiceId: string;
  amount: number;
  vatAmount: number;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'VAT_INVOICE_GENERATED',
    userId: params.userId,
    relatedId: params.invoiceId,
    context: {
      amount: params.amount,
      vatAmount: params.vatAmount,
    },
    source: 'vat_system',
  });
}

/**
 * Log revenue export request
 */
export async function logRevenueExportRequested(params: {
  userId: string;
  year: number;
  requestedFormat: string;
}): Promise<string> {
  return logBusinessAudit({
    eventType: 'REVENUE_EXPORT_REQUESTED',
    userId: params.userId,
    context: {
      year: params.year,
      format: params.requestedFormat,
    },
    source: 'tax_export_system',
  });
}

// ============================================================================
// QUERY AUDIT LOGS (READ-ONLY)
// ============================================================================

/**
 * Query audit logs for a specific user
 */
export async function queryUserAuditLogs(
  userId: string,
  options?: {
    eventType?: BusinessAuditEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<BusinessAuditLog[]> {
  try {
    let query: FirebaseFirestore.Query = db
      .collection('business_audit_log')
      .where('userId', '==', userId);

    if (options?.eventType) {
      query = query.where('eventType', '==', options.eventType);
    }

    if (options?.startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(options.startDate));
    }

    if (options?.endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(options.endDate));
    }

    query = query.orderBy('createdAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as BusinessAuditLog);
  } catch (error: any) {
    logger.error('[BusinessAudit] Failed to query user logs', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Query audit logs by event type
 */
export async function queryAuditLogsByEventType(
  eventType: BusinessAuditEventType,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<BusinessAuditLog[]> {
  try {
    let query: FirebaseFirestore.Query = db
      .collection('business_audit_log')
      .where('eventType', '==', eventType);

    if (options?.startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(options.startDate));
    }

    if (options?.endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(options.endDate));
    }

    query = query.orderBy('createdAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as BusinessAuditLog);
  } catch (error: any) {
    logger.error('[BusinessAudit] Failed to query by event type', {
      error: error.message,
      eventType,
    });
    throw error;
  }
}

/**
 * Export audit logs for compliance
 */
export async function exportAuditLogs(params: {
  startDate: Date;
  endDate: Date;
  eventTypes?: BusinessAuditEventType[];
}): Promise<BusinessAuditLog[]> {
  try {
    let query: FirebaseFirestore.Query = db
      .collection('business_audit_log')
      .where('createdAt', '>=', Timestamp.fromDate(params.startDate))
      .where('createdAt', '<=', Timestamp.fromDate(params.endDate))
      .orderBy('createdAt', 'asc');

    const snapshot = await query.get();
    let logs = snapshot.docs.map(doc => doc.data() as BusinessAuditLog);

    if (params.eventTypes && params.eventTypes.length > 0) {
      logs = logs.filter(log => params.eventTypes!.includes(log.eventType));
    }

    logger.info('[BusinessAudit] Exported audit logs', {
      count: logs.length,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    return logs;
  } catch (error: any) {
    logger.error('[BusinessAudit] Failed to export logs', {
      error: error.message,
    });
    throw error;
  }
}