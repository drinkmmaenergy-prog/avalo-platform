/**
 * PACK 383 - Payout Provider Abstraction Layer
 * Unified interface for multiple payout providers
 */

export interface PayoutProvider {
  name: string;
  type: 'stripe' | 'wise' | 'sepa' | 'ach' | 'local' | 'crypto';
  initialize(config: any): Promise<void>;
  executePayout(payload: PayoutPayload): Promise<PayoutResult>;
  getStatus(transactionId: string): Promise<PayoutStatus>;
  cancelPayout(transactionId: string): Promise<boolean>;
}

export interface PayoutPayload {
  payoutId: string;
  userId: string;
  amount: number;
  currency: string;
  recipientDetails: {
    accountNumber?: string;
    routingNumber?: string;
    iban?: string;
    swiftCode?: string;
    accountHolderName: string;
    email?: string;
    phone?: string;
    address?: {
      line1: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  };
  metadata?: Record<string, any>;
}

export interface PayoutResult {
  success: boolean;
  transactionId: string;
  providerTransactionId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedArrival?: Date;
  error?: string;
  fees?: number;
}

export interface PayoutStatus {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  lastUpdated: Date;
  details?: Record<string, any>;
}

// Export provider implementations
export { StripeProvider } from './stripe';
export { WiseProvider } from './wise';
export { SEPAProvider } from './sepa';
export { ACHProvider } from './ach';
export { LocalProvider } from './local';
