/**
 * PACK 131: Global Affiliate / Influencer Referral Engine
 * Types and interfaces for affiliate system
 * 
 * RULES:
 * - No token rewards for referrals
 * - No visibility/ranking boosts
 * - Fiat payouts only (CPA/CPL)
 * - No MLM/pyramid structures
 * - Strict fraud prevention
 */

export interface AffiliateProfile {
  affiliateId: string;
  affiliateCode: string; // Unique code for sharing links
  userId: string; // Associated user account
  status: 'pending' | 'active' | 'suspended' | 'banned';
  
  // Business info
  businessName?: string;
  taxId?: string;
  taxCountry?: string;
  
  // Contact
  email: string;
  phone?: string;
  
  // Payout info
  payoutMethod: 'bank_transfer' | 'paypal' | 'stripe';
  payoutDetails: Record<string, any>; // Encrypted
  
  // Analytics permissions
  canViewAnalytics: boolean;
  
  // Landing page
  landingPageEnabled: boolean;
  landingPageTemplate?: string;
  landingPagePhoto?: string;
  landingPageSocialLinks?: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
  };
  
  // Compliance
  agreementSigned: boolean;
  agreementSignedAt?: Date;
  identityVerified: boolean;
  identityVerifiedAt?: Date;
  antiMLMAccepted: boolean;
  antiSpamAccepted: boolean;
  
  // Violation tracking
  violations: {
    count: number;
    history: AffiliateViolation[];
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  suspendedAt?: Date;
  bannedAt?: Date;
}

export interface AffiliateViolation {
  violationId: string;
  type: 'spam' | 'mlm_promotion' | 'false_advertising' | 'nsfw_promise' | 'monetization_promise' | 'fraud';
  description: string;
  severity: 1 | 2 | 3; // 1=warning, 2=suspension, 3=ban
  actionTaken: 'warning' | 'suspension' | 'termination';
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface AffiliateReferral {
  referralId: string;
  affiliateId: string;
  affiliateCode: string;
  
  // Referred user info (minimal)
  userId: string;
  
  // Tracking
  signupTimestamp: Date;
  signupIP?: string;
  signupDeviceId?: string;
  signupUserAgent?: string;
  verificationCompleted: boolean;
  verificationCompletedAt?: Date;
  
  // Fraud detection
  fraudScore: number; // 0-100
  fraudFlags: FraudFlag[];
  fraudStatus: 'clean' | 'suspicious' | 'confirmed_fraud';
  
  // Retention tracking (coarse bands only)
  retentionDay1: boolean;
  retentionDay7?: boolean;
  retentionDay30?: boolean;
  
  // Payout tracking
  payoutEligible: boolean;
  payoutProcessed: boolean;
  payoutId?: string;
  payoutAmount?: number; // In cents/smallest currency unit
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface FraudFlag {
  type: 'duplicate_device' | 'duplicate_ip' | 'vpn_detected' | 'emulator_detected' | 'velocity_anomaly' | 'pattern_match';
  severity: 'low' | 'medium' | 'high';
  details: string;
  detectedAt: Date;
}

export interface AffiliatePayout {
  payoutId: string;
  affiliateId: string;
  
  // Payout details
  amount: number; // In cents/smallest currency unit
  currency: string;
  payoutMethod: string;
  
  // Included referrals
  referralIds: string[];
  referralCount: number;
  
  // Processing
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  requestedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  
  // Payment provider details
  externalTransactionId?: string;
  failureReason?: string;
  
  // Audit
  approvedBy?: string;
  notes?: string;
}

export interface AffiliateAnalytics {
  affiliateId: string;
  period: 'day' | 'week' | 'month' | 'all_time';
  periodStart: Date;
  periodEnd: Date;
  
  // Aggregated metrics only
  totalReferrals: number;
  verifiedReferrals: number;
  pendingVerifications: number;
  
  // Retention metrics (coarse bands)
  retentionDay1Count: number;
  retentionDay7Count: number;
  retentionDay30Count: number;
  
  // Payout metrics
  totalEarnings: number; // In cents
  pendingPayouts: number;
  completedPayouts: number;
  
  // Fraud metrics
  flaggedReferrals: number;
  fraudulentReferrals: number;
  
  // Updated
  lastUpdated: Date;
}

export interface AffiliateLandingPage {
  affiliateCode: string;
  affiliateId: string;
  
  // Content
  templateId: 'default' | 'influencer' | 'minimal';
  customPhoto?: string;
  customDescription?: string; // From pre-approved templates only
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
  };
  
  // Restrictions
  approved: boolean;
  approvedAt?: Date;
  rejectionReason?: string;
  
  // Analytics
  viewCount: number;
  clickCount: number;
  conversionCount: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAffiliateProfileRequest {
  userId: string;
  email: string;
  businessName?: string;
  taxId?: string;
  taxCountry?: string;
  payoutMethod: 'bank_transfer' | 'paypal' | 'stripe';
  payoutDetails: Record<string, any>;
}

export interface GenerateAffiliateLinkRequest {
  affiliateId: string;
}

export interface RecordReferralRequest {
  affiliateCode: string;
  userId: string;
  signupIP?: string;
  signupDeviceId?: string;
  signupUserAgent?: string;
}

export interface GetAffiliateAnalyticsRequest {
  affiliateId: string;
  period: 'day' | 'week' | 'month' | 'all_time';
}

export interface RequestAffiliatePayoutRequest {
  affiliateId: string;
  requestedAmount?: number; // Optional, defaults to all eligible
}

export interface ProcessAffiliatePayoutRequest {
  payoutId: string;
  approvedBy: string;
  notes?: string;
}

export interface SuspendAffiliateRequest {
  affiliateId: string;
  reason: string;
  violationType: 'spam' | 'mlm_promotion' | 'false_advertising' | 'nsfw_promise' | 'monetization_promise' | 'fraud';
  severity: 1 | 2 | 3;
}

export interface AffiliateComplianceStatus {
  agreementSigned: boolean;
  identityVerified: boolean;
  antiMLMAccepted: boolean;
  antiSpamAccepted: boolean;
  taxInfoComplete: boolean;
  payoutMethodConfigured: boolean;
  violationCount: number;
  canCreateLandingPage: boolean;
  canReceivePayouts: boolean;
}

// Payout calculation models
export interface PayoutModel {
  type: 'cpa' | 'cpl';
  description: string;
}

export interface CPAModel extends PayoutModel {
  type: 'cpa';
  amountPerVerifiedUser: number; // In cents
  minimumRetentionDays?: number; // e.g., must be active for 7 days
}

export interface CPLModel extends PayoutModel {
  type: 'cpl';
  amountPerLead: number; // In cents
  requiresVerification: boolean;
}

// Pre-approved landing page templates
export const LANDING_PAGE_TEMPLATES = {
  default: {
    title: 'Join Avalo',
    description: 'Connect with amazing people on Avalo',
  },
  influencer: {
    title: 'Join me on Avalo',
    description: 'I\'m on Avalo and you should join too!',
  },
  minimal: {
    title: 'Avalo',
    description: 'Social connection platform',
  },
};

// Fraud detection thresholds
export const FRAUD_DETECTION_CONFIG = {
  maxSignupsPerIPPerDay: 3,
  maxSignupsPerDevicePerDay: 2,
  maxSignupsPerAffiliatePerHour: 10,
  vpnDetectionEnabled: true,
  emulatorDetectionEnabled: true,
  suspiciousScoreThreshold: 60,
  fraudScoreThreshold: 80,
};

// Payout configuration
export const PAYOUT_CONFIG = {
  minimumPayoutAmount: 5000, // 50.00 in currency (cents)
  payoutProcessingDays: 30, // Days after referral verification
  batchPayoutSchedule: 'weekly', // When payouts are processed
};