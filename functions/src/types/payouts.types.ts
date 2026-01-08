/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * TypeScript type definitions for payout system
 */

import { Timestamp } from 'firebase-admin/firestore';
import { PayoutMethodType, PayoutStatus, PayoutCurrency } from '../config/payouts.config';

// ============================================================================
// PAYOUT METHOD TYPES
// ============================================================================

export interface BankTransferDetails {
  iban: string;
  accountHolderName: string;
  bankName: string;
  country: string;
  bic?: string; // Optional SWIFT/BIC code
}

export interface WiseDetails {
  wiseProfileId: string;
  email: string;
  recipientId?: string; // Wise recipient ID for faster transfers
}

export interface StripeConnectDetails {
  stripeAccountId: string;
  email?: string;
}

export type PayoutMethodDetails = BankTransferDetails | WiseDetails | StripeConnectDetails;

export interface PayoutMethod {
  id: string;
  userId: string;
  type: PayoutMethodType;
  displayName: string;
  currency: PayoutCurrency;
  details: PayoutMethodDetails;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PAYOUT REQUEST TYPES
// ============================================================================

export interface PayoutRequest {
  id: string;
  userId: string;
  methodId: string;
  status: PayoutStatus;
  requestedTokens: number;
  requestedFiat: number;
  currency: PayoutCurrency;
  tokenToFiatRate: number; // Rate at time of request (for audit trail)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewerId?: string;
  rejectionReason?: string;
  notes?: string; // Internal notes for admin
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    balanceBeforeRequest?: number;
    balanceAfterRequest?: number;
  };
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreatePayoutMethodRequest {
  userId: string;
  type: PayoutMethodType;
  displayName: string;
  currency: PayoutCurrency;
  details: PayoutMethodDetails;
  isDefault?: boolean;
}

export interface UpdatePayoutMethodRequest {
  methodId: string;
  displayName?: string;
  details?: Partial<PayoutMethodDetails>;
  isDefault?: boolean;
}

export interface CreatePayoutRequestParams {
  userId: string;
  methodId: string;
  requestedTokens: number;
}

export interface SetPayoutStatusParams {
  requestId: string;
  newStatus: PayoutStatus;
  reviewerId: string;
  rejectionReason?: string;
  notes?: string;
}

export interface GetPayoutMethodsResponse {
  methods: PayoutMethod[];
}

export interface GetPayoutRequestsResponse {
  requests: PayoutRequest[];
  total: number;
  hasMore: boolean;
  nextPageToken?: string;
}

export interface PayoutConfigResponse {
  minPayoutTokens: number;
  tokenToEurRate: number;
  supportedMethods: readonly string[];
  supportedCurrencies: readonly string[];
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isBankTransferDetails(details: any): details is BankTransferDetails {
  return (
    typeof details === 'object' &&
    typeof details.iban === 'string' &&
    typeof details.accountHolderName === 'string' &&
    typeof details.bankName === 'string' &&
    typeof details.country === 'string'
  );
}

export function isWiseDetails(details: any): details is WiseDetails {
  return (
    typeof details === 'object' &&
    typeof details.wiseProfileId === 'string' &&
    typeof details.email === 'string'
  );
}

export function isStripeConnectDetails(details: any): details is StripeConnectDetails {
  return (
    typeof details === 'object' &&
    typeof details.stripeAccountId === 'string'
  );
}

export function validatePayoutMethodDetails(
  type: PayoutMethodType,
  details: any
): details is PayoutMethodDetails {
  switch (type) {
    case 'BANK_TRANSFER':
      return isBankTransferDetails(details);
    case 'WISE':
      return isWiseDetails(details);
    case 'STRIPE_CONNECT':
      return isStripeConnectDetails(details);
    default:
      return false;
  }
}