/**
 * Wallet Bridge Type Definitions
 * Enhanced security types for cryptographic operations
 */

import { Timestamp } from "firebase-admin/firestore";

export enum Blockchain {
  ETHEREUM = "ethereum",
  POLYGON = "polygon",
  BINANCE_SMART_CHAIN = "bsc",
}

export interface WalletConnection {
  address: string;
  connectedAt: Timestamp;
  verified: boolean;
  lastVerifiedAt?: Timestamp;
}

export interface CryptoDeposit {
  depositId: string;
  userId: string;
  blockchain: Blockchain;
  amountUSDC: number;
  tokensToCredit: number;
  escrowAddress: string;
  status: "pending" | "completed" | "failed" | "expired";
  txHash?: string;
  verificationData?: OnChainVerification;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt: Timestamp;
}

export interface OnChainVerification {
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  value: string;
  status: number;
  verifiedAt: Timestamp;
  confirmations: number;
}

export interface SignatureVerificationRequest {
  walletAddress: string;
  blockchain: Blockchain;
  signedMessage: string;
}

export interface DepositConfirmationRequest {
  depositId: string;
  txHash: string;
}

export interface WalletSecurityError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
}

/**
 * Security error codes
 */
export enum WalletSecurityErrorCode {
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  WALLET_MISMATCH = "WALLET_MISMATCH",
  TX_NOT_FOUND = "TX_NOT_FOUND",
  TX_FAILED = "TX_FAILED",
  SENDER_MISMATCH = "SENDER_MISMATCH",
  ESCROW_MISMATCH = "ESCROW_MISMATCH",
  AMOUNT_MISMATCH = "AMOUNT_MISMATCH",
  BLOCKCHAIN_ERROR = "BLOCKCHAIN_ERROR",
  EXPIRED_DEPOSIT = "EXPIRED_DEPOSIT",
  INSUFFICIENT_CONFIRMATIONS = "INSUFFICIENT_CONFIRMATIONS",
}

