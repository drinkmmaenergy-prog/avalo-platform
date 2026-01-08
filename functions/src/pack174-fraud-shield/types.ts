/**
 * PACK 174 - Type Definitions
 */

export type FraudType = 
  | 'payment_fraud'
  | 'token_laundering'
  | 'crypto_trap'
  | 'phishing'
  | 'impersonation'
  | 'financial_blackmail'
  | 'advance_fee_scam'
  | 'romance_fraud'
  | 'chargeback_abuse'
  | 'stolen_card'
  | 'friendly_fraud';

export type ScamType =
  | 'crypto_investment'
  | 'get_rich_quick'
  | 'pyramid_scheme'
  | 'high_yield_investment'
  | 'trading_signals'
  | 'forex_scam'
  | 'nft_scam'
  | 'token_promotion';

export type ImpersonationType =
  | 'fake_brand'
  | 'fake_celebrity'
  | 'deepfake'
  | 'stolen_photos'
  | 'identity_theft';

export type ManipulationType =
  | 'guilt_for_not_buying'
  | 'conditional_affection'
  | 'loyalty_through_spending'
  | 'transactional_love'
  | 'continuous_spending_pressure';

export type DisputeType =
  | 'item_not_received'
  | 'item_not_as_described'
  | 'unauthorized_transaction'
  | 'service_not_rendered'
  | 'quality_issue'
  | 'delivery_issue';

export interface FraudCase {
  id: string;
  userId: string;
  targetUserId?: string;
  fraudType: FraudType;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  evidence: FraudEvidence[];
  description: string;
  mitigation?: FraudMitigation;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
}

export interface FraudEvidence {
  type: 'message' | 'transaction' | 'profile' | 'pattern' | 'report';
  id: string;
  data: any;
  timestamp: Date;
}

export interface FraudMitigation {
  action: 'warning' | 'account_freeze' | 'transaction_block' | 'permanent_ban';
  reason: string;
  appliedAt: Date;
  expiresAt?: Date;
}

export interface ImpersonationReport {
  id: string;
  reportedUserId: string;
  claimantUserId: string;
  impersonationType: ImpersonationType;
  status: 'pending' | 'under_review' | 'verified' | 'rejected' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  evidence: {
    type: 'id_document' | 'trademark' | 'copyright' | 'public_record';
    url?: string;
    description: string;
  }[];
  verificationNotes?: string;
  createdAt: Date;
  reviewedAt?: Date;
  resolvedAt?: Date;
}

export interface PaymentDispute {
  id: string;
  buyerId: string;
  sellerId: string;
  transactionId: string;
  disputeType: DisputeType;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  amount: number;
  currency: string;
  description: string;
  evidence: {
    providedBy: 'buyer' | 'seller';
    type: 'photo' | 'document' | 'tracking' | 'communication';
    url?: string;
    description: string;
    uploadedAt: Date;
  }[];
  resolution?: {
    outcome: 'refund_buyer' | 'release_to_seller' | 'partial_refund' | 'no_action';
    amount?: number;
    reason: string;
    decidedAt: Date;
  };
  autoResolveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CryptoScamLog {
  id: string;
  userId: string;
  targetUserId?: string;
  scamType: ScamType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  context: {
    messageId?: string;
    postId?: string;
    profileSection?: string;
  };
  blocked: boolean;
  actionTaken: string;
  createdAt: Date;
}

export interface EmotionalManipulationLog {
  id: string;
  senderId: string;
  victimUserId: string;
  manipulationType: ManipulationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  messageId?: string;
  blocked: boolean;
  warningIssued: boolean;
  createdAt: Date;
}

export interface FraudPatternScan {
  id: string;
  userId: string;
  scanType: 'payment_patterns' | 'message_patterns' | 'behavioral_patterns';
  suspiciousActivity: boolean;
  riskScore: number;
  patterns: {
    type: string;
    frequency: number;
    severity: string;
  }[];
  createdAt: Date;
}

export interface PaymentFraudAttempt {
  id: string;
  userId: string;
  fraudType: FraudType;
  paymentMethodId?: string;
  amount?: number;
  currency?: string;
  riskScore: number;
  blocked: boolean;
  reason: string;
  createdAt: Date;
}

export interface BlacklistedCard {
  id: string;
  cardFingerprint: string;
  reason: string;
  reportedBy: string;
  status: 'active' | 'expired';
  addedAt: Date;
  expiresAt?: Date;
}

export interface BlacklistedWallet {
  id: string;
  walletAddress: string;
  blockchain: string;
  reason: string;
  reportedBy: string;
  status: 'active' | 'expired';
  addedAt: Date;
  expiresAt?: Date;
}

export interface BlacklistedDevice {
  id: string;
  deviceFingerprint: string;
  reason: string;
  reportedBy: string;
  status: 'active' | 'expired';
  addedAt: Date;
  expiresAt?: Date;
}

export interface UserFraudRiskProfile {
  userId: string;
  overallRiskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  paymentRiskScore: number;
  behaviorRiskScore: number;
  identityRiskScore: number;
  flags: string[];
  lastScanAt: Date;
  updatedAt: Date;
}

export interface SpendingSafetySettings {
  userId: string;
  enabled: boolean;
  dailySpendingLimit?: number;
  requireConfirmationOver?: number;
  blockSuspiciousRequests: boolean;
  alertOnUnusualActivity: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FraudMitigationAction {
  id: string;
  userId: string;
  caseId: string;
  actionType: 'warning' | 'temp_restriction' | 'payment_block' | 'account_freeze' | 'permanent_ban';
  reason: string;
  duration?: number;
  appliedAt: Date;
  expiresAt?: Date;
  reversedAt?: Date;
  reversalReason?: string;
}

export interface MessageFilterResult {
  blocked: boolean;
  reason?: string;
  fraudType?: FraudType | ScamType | ManipulationType;
  severity?: string;
  warningMessage?: string;
}