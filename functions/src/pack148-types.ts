/**
 * PACK 148 - Avalo Blockchain Token Ledger
 * Type definitions for transparent, immutable transaction recording
 * 
 * Non-negotiable rules:
 * - Token remains internal currency (no crypto speculation)
 * - No NFTs, no blockchain assets, no Web3 login
 * - 65/35 split enforced mechanically
 * - Ledger only registers, doesn't modify rules
 * - No ranking or visibility changes
 */

import { Timestamp } from 'firebase-admin/firestore';

// ===========================
// Transaction Types
// ===========================

export type TransactionProductType =
  | 'chat'           // Paid chat messages
  | 'call'           // Paid voice/video calls
  | 'product'        // Digital products
  | 'event'          // Event tickets
  | 'club'           // Gated club access
  | 'challenge'      // Challenge participation
  | 'mentorship'     // Mentorship sessions
  | 'ads'            // Advertising spend
  | 'subscription'   // Subscription payments
  | 'gift'           // In-chat paid gifts
  | 'post'           // Paid posts/stories
  | 'media_unlock';  // Media paywall unlock

export type TransactionStatus =
  | 'pending'        // Transaction initiated
  | 'escrowed'       // Held in escrow
  | 'completed'      // Released to recipient
  | 'refunded'       // Refunded to payer
  | 'disputed'       // Under dispute
  | 'cancelled';     // Cancelled

export type LedgerEventType =
  | 'transaction_created'
  | 'escrow_created'
  | 'escrow_released'
  | 'payment_completed'
  | 'refund_issued'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'transaction_cancelled';

// ===========================
// Ledger Transaction Record
// ===========================

export interface LedgerTransaction {
  // Core identifiers
  id: string;
  transactionId: string;            // Original transaction ID from app
  blockchainHash: string;            // Immutable blockchain hash
  
  // Participants (hashed for privacy)
  senderHash: string;                // SHA256(senderId)
  receiverHash: string;              // SHA256(receiverId) or 'AVALO_SYSTEM'
  
  // Transaction details
  productType: TransactionProductType;
  tokenAmount: number;               // Token amount
  conversionRate: number;            // USD conversion rate at time
  usdEquivalent: number;             // USD value for regulatory compliance
  
  // Escrow info (from PACK 147)
  escrowId?: string;
  escrowLogicOutcome?: string;       // 'released' | 'held' | 'refunded'
  payoutEligible: boolean;           // Can recipient withdraw?
  
  // Compliance & metadata
  regionTag: string;                 // User region for regulatory compliance
  timestamp: Timestamp;
  status: TransactionStatus;
  
  // Revenue split (recorded, not modified)
  platformShare: number;             // 35% (recorded for audit)
  creatorShare: number;              // 65% (recorded for audit)
  
  // Blockchain proof
  blockchainTimestamp: Timestamp;
  blockchainVerified: boolean;
  
  // Audit trail
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: number;                   // For versioning
}

// ===========================
// Blockchain Entry
// ===========================

export interface BlockchainEntry {
  id: string;
  transactionId: string;
  blockHash: string;                 // SHA256 hash of entry
  previousHash: string;              // Previous block hash (chain link)
  
  // Hashed transaction data
  data: {
    senderHash: string;
    receiverHash: string;
    productType: TransactionProductType;
    tokenAmount: number;
    timestamp: string;                // ISO 8601 UTC
    escrowOutcome?: string;
    payoutEligible: boolean;
    regionTag: string;
  };
  
  // Blockchain metadata
  nonce: number;                      // For hash validation
  timestamp: Timestamp;
  verified: boolean;
}

// ===========================
// Export Records
// ===========================

export type ExportFormat = 'pdf' | 'csv' | 'json';
export type ExportType = 'transaction_history' | 'dispute_history' | 'payout_report' | 'tax_summary';

export interface LedgerExport {
  id: string;
  userId: string;
  userHash: string;                   // SHA256(userId)
  
  // Export configuration
  exportType: ExportType;
  format: ExportFormat;
  dateRange: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  
  // Filters
  filters?: {
    productTypes?: TransactionProductType[];
    status?: TransactionStatus[];
    minAmount?: number;
    maxAmount?: number;
  };
  
  // Export results
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recordCount?: number;
  fileUrl?: string;                   // Download URL
  fileSize?: number;                  // Bytes
  
  // Security
  downloadToken: string;              // One-time download token
  expiresAt: Timestamp;               // 24 hour expiry
  downloadCount: number;              // Track downloads
  maxDownloads: number;               // Default: 3
  
  // Metadata
  createdAt: Timestamp;
  completedAt?: Timestamp;
  errorMessage?: string;
}

// ===========================
// Verification & Audit
// ===========================

export interface BlockchainVerification {
  transactionId: string;
  blockchainHash: string;
  isValid: boolean;
  verifiedAt: Timestamp;
  verificationMethod: 'hash_match' | 'chain_integrity' | 'timestamp_check';
  details?: string;
}

export interface LedgerAuditLog {
  id: string;
  eventType: LedgerEventType;
  transactionId: string;
  userId?: string;
  
  // Event data
  data: Record<string, any>;
  
  // Blockchain reference
  blockchainHash?: string;
  
  // Metadata
  timestamp: Timestamp;
  ipHash?: string;                    // SHA256(ip) for security
  userAgent?: string;
}

// ===========================
// Payout Ledger
// ===========================

export interface PayoutLedgerSummary {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Timestamp;
  endDate: Timestamp;
  
  // Earnings breakdown
  totalEarned: number;                // Total tokens earned (65% share)
  platformFees: number;               // Platform share (35%)
  
  // By product type
  earningsByType: {
    [key in TransactionProductType]?: number;
  };
  
  // Payout status
  totalPaidOut: number;
  pendingPayout: number;
  inEscrow: number;
  refunded: number;
  
  // Transaction counts
  totalTransactions: number;
  completedTransactions: number;
  disputedTransactions: number;
  
  // Blockchain verification
  allTransactionsVerified: boolean;
  verificationRate: number;           // Percentage
  
  // Metadata
  generatedAt: Timestamp;
  blockchainHashes: string[];         // All tx hashes in period
}

// ===========================
// Tax Summary
// ===========================

export interface TaxSummary {
  userId: string;
  taxYear: number;
  region: string;
  
  // Income summary
  totalIncome: number;                // Total USD equivalent
  totalTokens: number;
  
  // Breakdown by type
  incomeByType: {
    [key in TransactionProductType]?: {
      tokens: number;
      usd: number;
      transactionCount: number;
    };
  };
  
  // Deductions (if applicable)
  platformFees: number;               // Can be deductible
  refundsIssued: number;
  chargebackLosses: number;
  
  // Monthly breakdown
  monthlyBreakdown: {
    month: number;                    // 1-12
    tokens: number;
    usd: number;
    transactions: number;
  }[];
  
  // Compliance
  allTransactionsRecorded: boolean;
  blockchainVerified: boolean;
  
  // Metadata
  generatedAt: Timestamp;
  exportUrl?: string;
}

// ===========================
// Ledger Statistics
// ===========================

export interface LedgerStats {
  userId: string;
  role: 'creator' | 'user' | 'both';
  
  // As creator (receiver)
  asCreator?: {
    totalEarned: number;
    totalTransactions: number;
    averageTransaction: number;
    topProductType: TransactionProductType;
    verificationRate: number;
  };
  
  // As user (sender)
  asUser?: {
    totalSpent: number;
    totalTransactions: number;
    averageTransaction: number;
    topProductType: TransactionProductType;
    refundRate: number;
  };
  
  // Overall
  lastTransactionAt?: Timestamp;
  firstTransactionAt?: Timestamp;
  accountAge: number;                 // Days
  
  // Compliance
  allVerified: boolean;
  canExport: boolean;
  
  // Metadata
  lastUpdated: Timestamp;
}

// ===========================
// API Request/Response Types
// ===========================

export interface RecordLedgerTransactionRequest {
  transactionId: string;
  senderId: string;
  receiverId: string;
  productType: TransactionProductType;
  tokenAmount: number;
  conversionRate: number;
  escrowId?: string;
  regionTag: string;
}

export interface RecordLedgerTransactionResponse {
  success: boolean;
  ledgerId: string;
  blockchainHash: string;
  message: string;
}

export interface ValidateLedgerEscrowRequest {
  escrowId: string;
  expectedStatus: string;
}

export interface ValidateLedgerEscrowResponse {
  success: boolean;
  isValid: boolean;
  ledgerEntry?: LedgerTransaction;
  message: string;
}

export interface ExportLedgerHistoryRequest {
  exportType: ExportType;
  format: ExportFormat;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  filters?: {
    productTypes?: TransactionProductType[];
    status?: TransactionStatus[];
  };
}

export interface ExportLedgerHistoryResponse {
  success: boolean;
  exportId: string;
  estimatedTime: number;              // Seconds
  message: string;
}

export interface DownloadLedgerReportRequest {
  exportId: string;
  downloadToken: string;
}

export interface DownloadLedgerReportResponse {
  success: boolean;
  downloadUrl: string;
  expiresAt: Date;
  fileSize: number;
  format: ExportFormat;
}

export interface VerifyBlockchainHashRequest {
  transactionId: string;
  blockchainHash: string;
}

export interface VerifyBlockchainHashResponse {
  success: boolean;
  isValid: boolean;
  verificationDetails: BlockchainVerification;
  message: string;
}

export interface GetLedgerOverviewRequest {
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
}

export interface GetLedgerOverviewResponse {
  success: boolean;
  stats: LedgerStats;
  recentTransactions: LedgerTransaction[];
  payoutSummary: PayoutLedgerSummary;
}

// ===========================
// Validation Helpers
// ===========================

export function isValidProductType(type: string): type is TransactionProductType {
  const validTypes: TransactionProductType[] = [
    'chat', 'call', 'product', 'event', 'club', 
    'challenge', 'mentorship', 'ads', 'subscription',
    'gift', 'post', 'media_unlock'
  ];
  return validTypes.includes(type as TransactionProductType);
}

export function isValidExportFormat(format: string): format is ExportFormat {
  return ['pdf', 'csv', 'json'].includes(format);
}

export function isValidExportType(type: string): type is ExportType {
  return ['transaction_history', 'dispute_history', 'payout_report', 'tax_summary'].includes(type);
}

// ===========================
// Constants
// ===========================

export const PLATFORM_FEE_PERCENTAGE = 0.35;  // 35%
export const CREATOR_SHARE_PERCENTAGE = 0.65; // 65%

export const EXPORT_EXPIRY_HOURS = 24;
export const MAX_EXPORT_DOWNLOADS = 3;
export const MAX_EXPORT_RECORDS = 10000;      // Safety limit

export const BLOCKCHAIN_HASH_ALGORITHM = 'SHA256';
export const PRIVACY_HASH_ALGORITHM = 'SHA256';

// ===========================
// Error Types
// ===========================

export class LedgerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class BlockchainVerificationError extends Error {
  constructor(
    message: string,
    public transactionId: string,
    public expectedHash: string,
    public actualHash: string
  ) {
    super(message);
    this.name = 'BlockchainVerificationError';
  }
}

export class ExportError extends Error {
  constructor(
    message: string,
    public exportId: string,
    public reason: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}