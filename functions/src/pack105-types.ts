/**
 * PACK 105 — Business Audit & Financial Compliance Types
 * 
 * Type definitions for:
 * - Business audit log (immutable)
 * - KYC audit records
 * - Finance cases (reconciliation)
 * - VAT/tax exports
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BUSINESS AUDIT LOG (IMMUTABLE)
// ============================================================================

export type BusinessAuditEventType =
  | 'PAYMENT_INTENT'
  | 'PAYMENT_COMPLETED'
  | 'TOKEN_PURCHASE'
  | 'EARNING_RECORDED'
  | 'KYC_SUBMITTED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_BLOCKED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_FAILED'
  | 'PAYOUT_CANCELLED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED'
  | 'MODERATION_ACTION'
  | 'ENFORCEMENT_APPLIED'
  | 'BALANCE_ADJUSTMENT'
  | 'RECONCILIATION_MISMATCH'
  | 'VAT_INVOICE_GENERATED'
  | 'REVENUE_EXPORT_REQUESTED'
  | 'CURRENCY_CONVERSION_FOR_PURCHASE'
  | 'REPUTATION_SCORE_UPDATE';

export interface BusinessAuditLog {
  id: string;
  eventType: BusinessAuditEventType;
  userId?: string;
  relatedId?: string;
  context: Record<string, any>;
  createdAt: Timestamp;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// KYC AUDIT RECORDS
// ============================================================================

export type KycAuditStatus = 
  | 'PENDING'
  | 'APPROVED' 
  | 'REJECTED'
  | 'BLOCKED'
  | 'RESUBMISSION_REQUIRED';

export interface KycAuditRecord {
  id: string;
  userId: string;
  documentId: string;
  status: KycAuditStatus;
  reviewerId?: string;
  documentSetId: string;
  reasonCodes: string[];
  reviewNotes?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
  metadata?: {
    documentType?: string;
    country?: string;
    riskScore?: number;
    complianceChecks?: string[];
  };
}

export type KycReasonCode =
  | 'ID_MISMATCH'
  | 'BLURRY_IMAGE'
  | 'EXPIRED_DOCUMENT'
  | 'MINOR_SUSPECT'
  | 'FRAUDULENT_DOCUMENT'
  | 'INCOMPLETE_INFORMATION'
  | 'DUPLICATE_SUBMISSION'
  | 'HIGH_RISK_JURISDICTION'
  | 'PEP_MATCH'
  | 'SANCTIONS_HIT'
  | 'DOCUMENT_VERIFICATION_FAILED'
  | 'SELFIE_MISMATCH'
  | 'OTHER';

// ============================================================================
// FINANCE CASES (RECONCILIATION)
// ============================================================================

export type FinanceCaseType =
  | 'PAYOUT_RECONCILIATION'
  | 'BALANCE_DISCREPANCY'
  | 'STRIPE_MISMATCH'
  | 'WISE_MISMATCH'
  | 'PSP_WEBHOOK_FAILURE'
  | 'DUPLICATE_TRANSACTION'
  | 'MISSING_EARNING_RECORD'
  | 'LEDGER_CORRUPTION'
  | 'VAT_CALCULATION_ERROR';

export type FinanceCaseStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'AWAITING_PSP'
  | 'AWAITING_USER'
  | 'RESOLVED'
  | 'CLOSED_NO_ACTION'
  | 'ESCALATED';

export interface FinanceCase {
  caseId: string;
  type: FinanceCaseType;
  status: FinanceCaseStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  subjectUserId?: string;
  evidenceRefs: string[];
  discrepancy?: {
    internal: number;
    external: number;
    difference: number;
    currency?: string;
  };
  resolution?: {
    action: string;
    resolvedBy: string;
    resolvedAt: Timestamp;
    notes: string;
  };
  assignedTo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  closedAt?: Timestamp;
  metadata?: Record<string, any>;
}

// ============================================================================
// PAYOUT RECONCILIATION
// ============================================================================

export interface PayoutReconciliationResult {
  payoutId: string;
  status: 'MATCHED' | 'MISMATCH' | 'MISSING_EXTERNAL' | 'MISSING_INTERNAL';
  internal: {
    amountTokens: number;
    amountPLN: number;
    status: string;
  };
  external?: {
    amount: number;
    currency: string;
    status: string;
    provider: 'STRIPE' | 'WISE' | 'OTHER';
  };
  mismatch?: {
    field: string;
    internalValue: any;
    externalValue: any;
  }[];
}

// ============================================================================
// VAT & TAX EXPORT
// ============================================================================

export interface CreatorRevenueExport {
  userId: string;
  year: number;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEarningsTokens: number;
    totalEarningsPLN: number;
    paidInteractions: number;
    payoutsTotal: number;
    payoutsCount: number;
  };
  breakdown: {
    gifts: number;
    premiumStories: number;
    paidMedia: number;
    paidCalls: number;
    aiCompanion: number;
    other: number;
  };
  vatInfo?: {
    applicable: boolean;
    jurisdiction?: string;
    vatNumber?: string;
    notes: string;
  };
  payouts: Array<{
    payoutId: string;
    date: string;
    amountPLN: number;
    method: string;
    status: string;
  }>;
  generatedAt: Timestamp;
  fileUrl?: string;
}

export interface VATInvoiceData {
  invoiceId: string;
  invoiceNumber: string;
  userId: string;
  transactionId: string;
  issueDate: string;
  dueDate?: string;
  amount: {
    net: number;
    vatRate: number;
    vatAmount: number;
    gross: number;
    currency: string;
  };
  seller: {
    name: string;
    taxId: string;
    address: string;
  };
  buyer: {
    name: string;
    taxId?: string;
    address: string;
    country: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  vatApplied: boolean;
  vatReverseCharge: boolean;
  notes?: string;
  createdAt: Timestamp;
}

// ============================================================================
// ADMIN FINANCE DASHBOARD
// ============================================================================

export interface PayoutListItem {
  payoutId: string;
  userId: string;
  userName: string;
  method: string;
  amountTokens: number;
  amountPLN: number;
  status: string;
  kycStatus: string;
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface PayoutDetails extends PayoutListItem {
  userEmail?: string;
  userPhone?: string;
  details: Record<string, any>;
  history: Array<{
    status: string;
    timestamp: string;
    actor?: string;
    notes?: string;
  }>;
}

export interface FinanceDashboardMetrics {
  date: string;
  payouts: {
    requested: number;
    processing: number;
    completed: number;
    failed: number;
    totalAmountPLN: number;
  };
  kyc: {
    pending: number;
    approved: number;
    rejected: number;
    backlogDays: number;
  };
  reconciliation: {
    openCases: number;
    criticalCases: number;
    resolvedToday: number;
  };
  revenue: {
    totalTokensSold: number;
    totalEarningsGenerated: number;
    platformRevenue: number;
  };
}