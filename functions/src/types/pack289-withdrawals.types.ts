/**
 * PACK 289 — Payouts & Withdrawals Types
 * Complete system for withdrawals/cashout of earnings from Avalo
 * 
 * IMPORTANT RULES:
 * - Only earned tokens can be withdrawn (NOT purchased tokens)
 * - Fixed rate: 1 token = 0.20 PLN (or local equivalent)
 * - KYC + AML required for all withdrawals
 * - Limits enforced: min/max per withdrawal, monthly caps
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// WALLET EXTENSIONS (for PACK 289)
// ============================================================================

/**
 * Extended wallet data with withdrawal tracking
 * Extends WalletData from PACK 277
 */
export interface WalletDataExtended {
  userId: string;
  balanceTokens: number;
  
  // Existing from PACK 277
  lifetimePurchasedTokens: number;
  lifetimeEarnedTokens: number;
  lifetimeSpentTokens: number;
  
  // NEW for PACK 289
  totalWithdrawnTokens: number;  // Lifetime tokens already cashed out
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Calculate withdrawable tokens (earned only, minus already withdrawn)
 */
export interface WithdrawableTokensCalculation {
  currentBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  maxEarnedAvailable: number;  // totalEarned - totalWithdrawn
  withdrawableTokens: number;  // min(currentBalance, maxEarnedAvailable)
}

// ============================================================================
// KYC DATA TYPES
// ============================================================================

export type KYCStatus = 
  | 'NOT_STARTED'
  | 'PENDING' 
  | 'VERIFIED' 
  | 'REJECTED';

export type IDDocumentType = 
  | 'ID_CARD' 
  | 'PASSPORT' 
  | 'DRIVING_LICENSE';

export interface IDDocument {
  type: IDDocumentType;
  country: string;
  number: string;  // Hashed or tokenized, never plaintext
  expiresAt: string;  // YYYY-MM-DD
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

export type PayoutMethodType = 
  | 'WISE' 
  | 'BANK_TRANSFER';

export interface PayoutMethod {
  type: PayoutMethodType;
  currency: string;  // PLN, EUR, USD, etc.
  iban?: string;
  wiseRecipientId?: string;
}

export interface KYCProfile {
  userId: string;
  status: KYCStatus;
  
  // Personal information
  fullName: string;
  dateOfBirth: string;  // YYYY-MM-DD
  country: string;
  taxResidence: string;
  
  // ID document
  idDocument: IDDocument;
  
  // Address
  address: Address;
  
  // Payout method
  payoutMethod: PayoutMethod;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReviewAt?: Timestamp;
  rejectionReason?: string;
}

// ============================================================================
// WITHDRAWAL REQUEST TYPES
// ============================================================================

export type WithdrawalStatus = 
  | 'PENDING_USER'      // User initiated, needs completion
  | 'PENDING_REVIEW'    // Waiting for admin review
  | 'APPROVED'          // Admin approved
  | 'PROCESSING'        // Payment being processed
  | 'PAID'              // Successfully paid out
  | 'REJECTED'          // Admin rejected
  | 'CANCELLED';        // User cancelled

export type WithdrawalProvider = 
  | 'WISE' 
  | 'BANK_TRANSFER' 
  | 'MANUAL';

export interface KYCSnapshot {
  kycStatus: KYCStatus;
  country: string;
  payoutMethod?: PayoutMethodType;
}

export interface WithdrawalRequest {
  withdrawalId: string;
  userId: string;
  
  // Token amounts
  requestedTokens: number;
  approvedTokens: number;  // Final tokens that will be burned
  
  // Payout details
  payoutCurrency: string;
  payoutAmount: number;  // Amount in payoutCurrency
  
  // Exchange rates (for audit)
  ratePerTokenPLN: number;  // Snapshot, should be 0.20
  fxRateToPayoutCurrency: number;  // FX rate if not PLN
  
  // Status tracking
  status: WithdrawalStatus;
  
  // KYC snapshot (for audit)
  kycSnapshot: KYCSnapshot;
  
  // Provider details
  provider: WithdrawalProvider;
  providerPayoutId?: string;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paidAt?: Timestamp;
  
  // Admin notes
  rejectionReason?: string;
  adminNotes?: string;
}

// ============================================================================
// WITHDRAWAL LIMITS
// ============================================================================

export interface WithdrawalLimitsConfig {
  minTokensPerWithdrawal: number;    // e.g., 500 tokens = 100 PLN
  maxTokensPerWithdrawal: number;    // Safety cap
  maxPLNPerMonth: number;            // Soft AML limit
  maxWithdrawalsPerMonth: number;    // Anti-abuse
}

export const DEFAULT_WITHDRAWAL_LIMITS: WithdrawalLimitsConfig = {
  minTokensPerWithdrawal: 500,      // 100 PLN minimum
  maxTokensPerWithdrawal: 50000,    // 10,000 PLN maximum per withdrawal
  maxPLNPerMonth: 20000,            // 20,000 PLN monthly limit
  maxWithdrawalsPerMonth: 10,       // Max 10 withdrawals per month
};

// ============================================================================
// MONTHLY WITHDRAWAL TRACKING
// ============================================================================

export interface MonthlyWithdrawalStats {
  userId: string;
  month: string;  // YYYY-MM
  totalTokensWithdrawn: number;
  totalPLNWithdrawn: number;
  withdrawalCount: number;
  lastWithdrawalAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateWithdrawalRequest {
  userId: string;
  requestedTokens: number;
}

export interface CreateWithdrawalResponse {
  success: boolean;
  withdrawalId?: string;
  requestedTokens?: number;
  payoutAmount?: number;
  payoutCurrency?: string;
  estimatedPayoutDate?: string;
  error?: string;
  errorCode?: WithdrawalErrorCode;
}

export interface ApproveWithdrawalRequest {
  withdrawalId: string;
  approvedTokens?: number;  // Optional override
  adminNotes?: string;
}

export interface ApproveWithdrawalResponse {
  success: boolean;
  withdrawalId?: string;
  approvedTokens?: number;
  error?: string;
}

export interface RejectWithdrawalRequest {
  withdrawalId: string;
  rejectionReason: string;
  adminNotes?: string;
}

export interface RejectWithdrawalResponse {
  success: boolean;
  withdrawalId?: string;
  error?: string;
}

export interface GetWithdrawableTokensRequest {
  userId: string;
}

export interface GetWithdrawableTokensResponse {
  success: boolean;
  withdrawableTokens?: number;
  calculation?: WithdrawableTokensCalculation;
  canWithdraw?: boolean;
  reasons?: string[];
  error?: string;
}

export interface GetWithdrawalHistoryRequest {
  userId: string;
  limit?: number;
  startAfter?: string;  // withdrawalId for pagination
}

export interface GetWithdrawalHistoryResponse {
  success: boolean;
  withdrawals?: WithdrawalRequest[];
  hasMore?: boolean;
  error?: string;
}

export interface GetMonthlyLimitsRequest {
  userId: string;
}

export interface GetMonthlyLimitsResponse {
  success: boolean;
  stats?: MonthlyWithdrawalStats;
  limits?: WithdrawalLimitsConfig;
  remainingPLN?: number;
  remainingWithdrawals?: number;
  canWithdraw?: boolean;
  error?: string;
}

// ============================================================================
// KYC REQUEST/RESPONSE TYPES
// ============================================================================

export interface SubmitKYCRequest {
  userId: string;
  fullName: string;
  dateOfBirth: string;  // YYYY-MM-DD
  country: string;
  taxResidence: string;
  idDocument: IDDocument;
  address: Address;
  payoutMethod: PayoutMethod;
}

export interface SubmitKYCResponse {
  success: boolean;
  status?: KYCStatus;
  error?: string;
  errorCode?: string;
}

export interface GetKYCStatusRequest {
  userId: string;
}

export interface GetKYCStatusResponse {
  success: boolean;
  kycProfile?: KYCProfile;
  status?: KYCStatus;
  canWithdraw?: boolean;
  error?: string;
}

export interface ReviewKYCRequest {
  userId: string;
  approved: boolean;
  rejectionReason?: string;
  adminNotes?: string;
}

export interface ReviewKYCResponse {
  success: boolean;
  userId?: string;
  newStatus?: KYCStatus;
  error?: string;
}

// ============================================================================
// PAYOUT PROVIDER TYPES
// ============================================================================

export interface StartPayoutRequest {
  userId: string;
  withdrawalId: string;
  currency: string;
  amount: number;
  payoutMethod: PayoutMethod;
}

export interface StartPayoutResponse {
  success: boolean;
  providerPayoutId?: string;
  provider?: WithdrawalProvider;
  estimatedDelivery?: string;
  error?: string;
}

export interface PayoutWebhookData {
  providerPayoutId: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING';
  completedAt?: Date;
  failureReason?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum WithdrawalErrorCode {
  // KYC errors
  KYC_NOT_VERIFIED = 'KYC_NOT_VERIFIED',
  KYC_PENDING = 'KYC_PENDING',
  KYC_REJECTED = 'KYC_REJECTED',
  
  // Balance errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_EARNED_TOKENS = 'INSUFFICIENT_EARNED_TOKENS',
  NO_WITHDRAWABLE_TOKENS = 'NO_WITHDRAWABLE_TOKENS',
  
  // Limit errors
  BELOW_MINIMUM = 'BELOW_MINIMUM',
  ABOVE_MAXIMUM = 'ABOVE_MAXIMUM',
  MONTHLY_LIMIT_EXCEEDED = 'MONTHLY_LIMIT_EXCEEDED',
  TOO_MANY_WITHDRAWALS = 'TOO_MANY_WITHDRAWALS',
  
  // User errors
  UNDER_AGE = 'UNDER_AGE',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED',
  
  // System errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  WITHDRAWAL_NOT_FOUND = 'WITHDRAWAL_NOT_FOUND',
  ALREADY_PROCESSED = 'ALREADY_PROCESSED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface WithdrawalAuditLog {
  logId: string;
  withdrawalId: string;
  userId: string;
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'FAILED' | 'CANCELLED';
  performedBy: string;  // userId or 'SYSTEM'
  previousStatus?: WithdrawalStatus;
  newStatus: WithdrawalStatus;
  notes?: string;
  metadata?: Record<string, any>;
  timestamp: Timestamp;
}

// ============================================================================
// WALLET TRANSACTION EXTENSION
// ============================================================================

export interface WithdrawalTransaction {
  txId: string;
  userId: string;
  type: 'WITHDRAWAL';
  source: 'PAYOUT';
  amountTokens: number;
  beforeBalance: number;
  afterBalance: number;
  metadata: {
    withdrawalId: string;
    payoutAmount: number;
    payoutCurrency: string;
    provider: WithdrawalProvider;
    providerPayoutId?: string;
    ratePerTokenPLN: number;
  };
  timestamp: Timestamp;
}

// ============================================================================
// ADMIN PANEL TYPES
// ============================================================================

export interface AdminWithdrawalListRequest {
  status?: WithdrawalStatus;
  limit?: number;
  startAfter?: string;
}

export interface AdminWithdrawalListResponse {
  success: boolean;
  withdrawals?: Array<WithdrawalRequest & {
    userEmail?: string;
    userDisplayName?: string;
    kycStatus?: KYCStatus;
    monthlyStats?: MonthlyWithdrawalStats;
  }>;
  hasMore?: boolean;
  error?: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidKYCStatus(status: string): status is KYCStatus {
  return ['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(status);
}

export function isValidWithdrawalStatus(status: string): status is WithdrawalStatus {
  return [
    'PENDING_USER',
    'PENDING_REVIEW',
    'APPROVED',
    'PROCESSING',
    'PAID',
    'REJECTED',
    'CANCELLED',
  ].includes(status);
}

export function canWithdraw(kycStatus: KYCStatus): boolean {
  return kycStatus === 'VERIFIED';
}

export function isWithdrawalEditable(status: WithdrawalStatus): boolean {
  return ['PENDING_USER', 'PENDING_REVIEW'].includes(status);
}

export function isWithdrawalFinal(status: WithdrawalStatus): boolean {
  return ['PAID', 'REJECTED', 'CANCELLED'].includes(status);
}