/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Mobile TypeScript types for payout system
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// PAYOUT METHOD TYPES
// ============================================================================

export type PayoutMethodType = 'BANK_TRANSFER' | 'WISE' | 'STRIPE_CONNECT';
export type PayoutStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';
export type PayoutCurrency = 'EUR' | 'USD' | 'GBP' | 'PLN';

export interface BankTransferDetails {
  iban: string;
  accountHolderName: string;
  bankName: string;
  country: string;
  bic?: string;
}

export interface WiseDetails {
  wiseProfileId: string;
  email: string;
  recipientId?: string;
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
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
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
  tokenToFiatRate: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  reviewedAt?: Timestamp | Date;
  reviewerId?: string;
  rejectionReason?: string;
  notes?: string;
}

// ============================================================================
// UI FORM TYPES
// ============================================================================

export interface PayoutMethodFormData {
  type: PayoutMethodType;
  displayName: string;
  currency: PayoutCurrency;
  details: PayoutMethodDetails;
  isDefault: boolean;
}

export interface PayoutRequestFormData {
  methodId: string;
  requestedTokens: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PayoutConfig {
  minPayoutTokens: number;
  tokenToEurRate: number;
  supportedMethods: string[];
  supportedCurrencies: string[];
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

// ============================================================================
// UI DISPLAY HELPERS
// ============================================================================

export const PAYOUT_METHOD_LABELS: Record<PayoutMethodType, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  WISE: 'Wise',
  STRIPE_CONNECT: 'Stripe Connect',
};

export const PAYOUT_METHOD_ICONS: Record<PayoutMethodType, string> = {
  BANK_TRANSFER: '🏦',
  WISE: '💳',
  STRIPE_CONNECT: '⚡',
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: 'Pending Review',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
};

export const PAYOUT_STATUS_COLORS: Record<PayoutStatus, { bg: string; text: string; border: string }> = {
  PENDING: {
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
  },
  UNDER_REVIEW: {
    bg: '#DBEAFE',
    text: '#1E40AF',
    border: '#93C5FD',
  },
  APPROVED: {
    bg: '#D1FAE5',
    text: '#065F46',
    border: '#6EE7B7',
  },
  REJECTED: {
    bg: '#FEE2E2',
    text: '#991B1B',
    border: '#FCA5A5',
  },
  PAID: {
    bg: '#E0E7FF',
    text: '#3730A3',
    border: '#A5B4FC',
  },
};

export const CURRENCY_SYMBOLS: Record<PayoutCurrency, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  PLN: 'zł',
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateIBAN(iban: string): boolean {
  // Basic IBAN validation (remove spaces, check length)
  const cleanIban = iban.replace(/\s/g, '');
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban) && cleanIban.length >= 15 && cleanIban.length <= 34;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function formatCurrency(amount: number, currency: PayoutCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString('en-US');
}

export function getMaskedMethodDetails(method: PayoutMethod): string {
  switch (method.type) {
    case 'BANK_TRANSFER':
      const bankDetails = method.details as BankTransferDetails;
      return `${bankDetails.bankName} ****${bankDetails.iban.slice(-4)}`;
    case 'WISE':
      const wiseDetails = method.details as WiseDetails;
      return wiseDetails.email;
    case 'STRIPE_CONNECT':
      const stripeDetails = method.details as StripeConnectDetails;
      return `Stripe ****${stripeDetails.stripeAccountId.slice(-4)}`;
    default:
      return method.displayName;
  }
}