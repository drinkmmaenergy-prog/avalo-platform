/**
 * Payout System Types
 * Defines interfaces for Avalo's withdrawal/payout system
 */

export type PayoutMethod = 'paypal' | 'bank' | 'revolut' | 'crypto';

export type FeeType = 'percent' | 'flat';

export interface PayoutFee {
  type: FeeType;
  value: number;
}

export interface PayoutFees {
  paypal: PayoutFee;
  bank: PayoutFee;
  revolut: PayoutFee;
  crypto: PayoutFee;
}

export interface TokenPrice {
  eurValue: number;
}

export interface PayoutCalculation {
  tokensRequested: number;
  amountCurrency: number;
  method: PayoutMethod;
  feeAmount: number;
  finalAmount: number;
}

export interface WithdrawalRequest {
  id?: string;
  uid: string;
  tokensRequested: number;
  amountCurrency: number;
  method: PayoutMethod;
  feeAmount: number;
  finalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface PayoutDetails {
  paypalEmail?: string;
  bankIBAN?: string;
  revolutUsername?: string;
  cryptoWallet?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  age?: number;
  profileComplete?: boolean;
  payoutDetails?: PayoutDetails;
}