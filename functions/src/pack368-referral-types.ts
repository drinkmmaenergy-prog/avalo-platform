/**
 * PACK 368 — Viral Referral & Invite Engine
 * Type definitions for referral system
 */

export interface ReferralProfile {
  inviteCode: string;
  inviteLink: string;
  qrInvitePayload: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  referralPrivilegesRevoked: boolean;
  referralPrivilegesRevokedReason?: string;
  lastInviteSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Referral {
  id: string;
  inviterId: string;
  invitedUserId: string;
  attributionSource: 'direct_link' | 'qr_code' | 'contact' | 'social_share';
  status: 'pending' | 'verified' | 'rejected' | 'rewarded';
  fraudRiskScore: number;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country?: string;
    city?: string;
  };
  firstActionType?: 'swipe' | 'chat' | 'purchase' | 'profile_complete';
  firstActionAt?: Date;
  verifiedAt?: Date;
  rewardedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralReward {
  id: string;
  userId: string;
  referralId: string;
  rewardType: 'tokens' | 'boost' | 'discovery_exposure' | 'visibility_multiplier';
  amount: number;
  duration?: number; // for time-based rewards (minutes)
  multiplier?: number; // for visibility multipliers
  status: 'pending' | 'granted' | 'revoked';
  grantedAt?: Date;
  revokedAt?: Date;
  revocationReason?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ReferralFraudSignal {
  id: string;
  userId: string;
  referralId?: string;
  signalType: 
    | 'multi_account'
    | 'proxy_vpn'
    | 'invite_loop'
    | 'self_invite'
    | 'rotating_identity'
    | 'emulator'
    | 'rapid_invites'
    | 'suspicious_device';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  details: Record<string, any>;
  deviceFingerprint?: string;
  ipAddress?: string;
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: 'false_positive' | 'confirmed_fraud' | 'warning_issued';
}

export interface ReferralStats {
  userId: string;
  totalInvitesSent: number;
  totalReferralsCompleted: number;
  totalRewardsEarned: number;
  totalTokensEarned: number;
  conversionRate: number;
  fraudRejectionCount: number;
  lastReferralAt?: Date;
  averageFraudScore: number;
  referralStreak: number; // consecutive successful referrals
  viralCoefficient: number; // K-factor
  lifetimeValue: number; // LTV of referred users
  updatedAt: Date;
}

export interface ReferralConfig {
  id: string;
  enabled: boolean;
  rewardsEnabled: boolean;
  
  // Reward amounts
  tokenRewardAmount: number;
  boostDurationMinutes: number;
  discoveryExposureBoost: number;
  visibilityMultiplier: number;
  
  // Limits
  dailyInviteLimit: number;
  dailyRewardLimit: number;
  maxPendingReferrals: number;
  
  // Fraud thresholds
  fraudScoreThreshold: number; // 0-100
  requireSelfieVerification: boolean;
  requireFirstAction: boolean;
  minimumAge: number;
  
  // Country-specific multipliers
  countryMultipliers: Record<string, number>;
  
  // Validation requirements
  minDaysSinceRegistration: number;
  minProfileCompleteness: number; // 0-100
  
  updatedAt: Date;
  updatedBy: string;
}

export interface GenerateInviteCodeRequest {
  userId: string;
}

export interface ProcessReferralRequest {
  inviteCode: string;
  newUserId: string;
  attributionSource: Referral['attributionSource'];
  deviceData: {
    fingerprint: string;
    ipAddress: string;
    userAgent: string;
    location?: {
      country?: string;
      city?: string;
    };
  };
}

export interface ValidateReferralRewardRequest {
  referralId: string;
}

export interface DistributeRewardRequest {
  referralId: string;
  rewardType: ReferralReward['rewardType'];
}

export interface RevokeReferralPrivilegesRequest {
  userId: string;
  reason: string;
}

export interface GetReferralStatsRequest {
  userId: string;
}

export interface UpdateReferralConfigRequest {
  config: Partial<ReferralConfig>;
}

export interface ReferralAnalytics {
  period: 'day' | 'week' | 'month';
  totalReferrals: number;
  successfulReferrals: number;
  conversionRate: number;
  fraudRejectionRate: number;
  topInviters: Array<{
    userId: string;
    referralCount: number;
    conversionRate: number;
  }>;
  revenuePerReferredUser: number;
  viralCoefficient: number;
  ltv7d: number;
  ltv30d: number;
  attributionBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
}
