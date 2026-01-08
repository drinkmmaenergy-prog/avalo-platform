/**
 * Token Economy Types
 * Defines interfaces for Avalo's monetized messaging system
 *
 * @deprecated Hard-coded values moved to config/monetization.ts
 * This file now only contains type definitions.
 */

export interface TokenWallet {
  tokens: number;
  lastUpdated?: Date;
}

export interface TokenTransaction {
  id?: string;
  senderUid: string;
  receiverUid: string;
  tokensAmount: number;
  avaloFee: number;
  messageId?: string;
  chatId: string;
  createdAt: Date;
  transactionType: 'message' | 'purchase' | 'refund' | 'superlike';
}

export interface MessageCostInfo {
  shouldCharge: boolean;
  cost: number;
  messageNumber: number;
  isFreeMessage: boolean;
}

// Re-export TokenPack from config for backward compatibility
export type { TokenPack } from '../config/monetization';