/**
 * PACK 337: Public Launch Operations & Geo Rollout Engine
 * Type definitions
 */

export type CountryStatus = 'DISABLED' | 'BETA' | 'OPEN' | 'LOCKED';

export type AdSource = 'GOOGLE' | 'META' | 'TIKTOK' | 'ORGANIC' | 'REFERRAL';

export interface GeoRolloutCountry {
  countryCode: string;
  countryName: string;
  status: CountryStatus;
  maxActiveUsers: number;
  maxNewRegistrationsPerDay: number;
  paymentsEnabled: boolean;
  withdrawalsEnabled: boolean;
  kycRequired: boolean;
  ageVerificationRequired: boolean;
  marketingEnabled: boolean;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

export interface MarketingBudget {
  countryCode: string;
  dailyBudgetPLN: number;
  monthlyBudgetPLN: number;
  spentTodayPLN: number;
  spentThisMonthPLN: number;
  lastResetAt: FirebaseFirestore.Timestamp;
}

export interface AdAttributionEvent {
  id: string;
  userId: string;
  source: AdSource;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  countryCode: string;
  firstOpenAt: FirebaseFirestore.Timestamp;
  firstPaymentAt?: FirebaseFirestore.Timestamp;
  totalRevenuePLN: number;
  isPayingUser: boolean;
}

export interface SystemLoadGuards {
  id: string;
  maxConcurrentChats: number;
  maxConcurrentCalls: number;
  maxConcurrentVideoSessions: number;
  maxTokenTransactionsPerMinute: number;
  maxRegistrationsPerMinute: number;
  emergencyMode: boolean;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

export interface LoadMetric {
  id: string;
  metricType: 'CHATS' | 'CALLS' | 'VIDEO' | 'TRANSACTIONS' | 'REGISTRATIONS';
  currentCount: number;
  timestamp: FirebaseFirestore.Timestamp;
  windowStartAt: FirebaseFirestore.Timestamp;
}

export interface CountryRegistrationQuota {
  countryCode: string;
  date: string; // YYYY-MM-DD
  registrationsToday: number;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

export interface MarketingSpendLog {
  id: string;
  countryCode: string;
  amountPLN: number;
  source: AdSource;
  campaignId?: string;
  timestamp: FirebaseFirestore.Timestamp;
  reason: string;
}

export interface EmergencyModeLog {
  id: string;
  enabled: boolean;
  triggeredBy: 'ADMIN' | 'SYSTEM';
  adminId?: string;
  reason: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface CountryResolutionResult {
  countryCode: string;
  countryName: string;
  confidence: number; // 0-1
  method: 'SIM' | 'IP' | 'APP_STORE' | 'USER_SETTING';
}

export interface CountryAccessCheck {
  allowed: boolean;
  status: CountryStatus;
  reason?: string;
  requiresKYC: boolean;
  requiresAgeVerification: boolean;
  paymentsEnabled: boolean;
  withdrawalsEnabled: boolean;
}

export interface LoadCheckResult {
  allowed: boolean;
  reason?: string;
  currentLoad?: number;
  maxLoad?: number;
  emergencyMode: boolean;
}

export interface MarketingBudgetCheck {
  allowed: boolean;
  reason?: string;
  spentToday: number;
  dailyLimit: number;
  spentThisMonth: number;
  monthlyLimit: number;
}
