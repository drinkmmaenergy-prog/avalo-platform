import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * TypeScript type definitions for payout system
 */

import { Timestamp } from 'firebase-admin/firestore';
import { PayoutMethodType, PayoutStatus, PayoutCurrency } from '../config/payouts.config';
import { admin } from '../runtime';

// ============================================================================
// PAYOUT METHOD TYPES
// ============================================================================





export interface StripeConnectDetails {
  stripeAccountId: string;
  email?: string;
}

export type PayoutMethodDetails = StripeConnectDetails

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
  tokenToUSDRate: number;
  supportedMethods: readonly string[];
  supportedCurrencies: readonly string[];
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================





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
      return REMOVED(details);
    case 'WISE':
      return REMOVED(details);
    case 'STRIPE_CONNECT':
      return isStripeConnectDetails(details);
    default:
      return false;
  }
}
































