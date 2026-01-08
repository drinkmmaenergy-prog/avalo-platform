/**
 * PACK 316 - Review Mode Types
 * 
 * Type definitions for App Store / Play Store review mode
 */

/**
 * Review mode session context
 */
export interface ReviewModeContext {
  env: "dev" | "staging" | "prod";
  userId?: string;
  deviceId?: string;
  country?: string;
}

/**
 * Demo wallet transaction for review mode
 */
export interface DemoWalletTransaction {
  id: string;
  userId: string;
  type: "PURCHASE" | "SPEND" | "EARN" | "REFUND";
  amount: number;
  currency: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Demo wallet balance
 */
export interface DemoWallet {
  userId: string;
  balance: number;
  currency: string;
  transactions: DemoWalletTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Review mode filter options for content
 */
export interface ReviewModeContentFilter {
  hideNSFW: boolean;
  hideExplicit: boolean;
  hideBorderline: boolean;
  prioritizeDemoProfiles: boolean;
}

/**
 * Review mode limits for discovery
 */
export interface ReviewModeLimits {
  maxSwipePerSession: number;
  maxDiscoveryRadiusKm: number;
  maxProfileViewsPerDay: number;
  maxMessagesPerDay: number;
}