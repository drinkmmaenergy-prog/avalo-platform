/**
 * PACK 102 — Cross-Platform Audience Growth Engine Types
 * 
 * TypeScript type definitions for organic audience growth tracking.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero free tokens, zero bonuses, zero discounts, zero incentives
 * - No changes to token price or revenue split (65/35)
 * - Tracking is read-only analytics ONLY
 * - No rewards or earnings adjustments based on referrals
 * - All users follow identical monetization rules
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Social platforms supported for tracking
 */
export type SocialPlatform = 
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'twitch'
  | 'snapchat'
  | 'x'
  | 'facebook'
  | 'other';

/**
 * External audience attribution record
 * Tracks visit → signup → follow → paid interaction funnel
 */
export interface ExternalAudienceAttribution {
  id: string;
  creatorId: string;
  platform: SocialPlatform;
  timestamp: Timestamp;
  completedSignup: boolean;
  becameFollower: boolean;
  becamePayer: boolean;
  
  // Optional: user who completed signup (if applicable)
  userId?: string;
  
  // UTM tracking
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  
  // Visit metadata (no PII)
  visitMetadata?: {
    referrer?: string;
    userAgent?: string;
    country?: string;
  };
}

/**
 * Aggregated audience growth metrics (read-only analytics)
 */
export interface AudienceGrowthMetrics {
  creatorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  
  // Funnel metrics
  visits: number;
  signups: number;
  follows: number;
  firstMessages: number;
  firstPaidInteractions: number;
  
  // Conversion rates
  visitToSignupRate: number;
  signupToFollowRate: number;
  followToPayerRate: number;
  
  // Platform breakdown
  platformBreakdown: Partial<Record<SocialPlatform, {
    visits: number;
    signups: number;
    follows: number;
  }>>;
  
  updatedAt: Timestamp;
}

/**
 * Creator social links configuration
 */
export interface CreatorSocialLinks {
  creatorId: string;
  
  // Social platform handles/usernames
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  twitch?: string;
  snapchat?: string;
  x?: string;
  facebook?: string;
  
  // Public profile settings
  publicProfileEnabled: boolean;
  bioVisible: boolean;
  followerCountVisible: boolean;
  
  updatedAt: Timestamp;
}

/**
 * Public creator preview (for web landing page)
 * Sanitized data safe for unauthenticated viewing
 */
export interface PublicCreatorPreview {
  username: string;
  displayName: string;
  profilePhoto?: string;
  bio?: string;
  followerCount?: number; // Rounded for privacy
  isVerified: boolean;
  
  // Preview content (strictly non-monetized)
  previewMedia?: {
    thumbnails: string[]; // Blurred thumbnails only
    count: number;
  };
  
  // Call to action
  ctaText: string; // "Join Avalo to follow and message me"
  deepLink: string; // App deep link
}

/**
 * Request/Response types for callable functions
 */

export interface LogExternalVisitRequest {
  creatorId: string;
  platform: SocialPlatform;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  visitMetadata?: {
    referrer?: string;
    userAgent?: string;
    country?: string;
  };
}

export interface LogExternalVisitResponse {
  success: boolean;
  attributionId: string;
}

export interface GetCreatorAudienceGrowthRequest {
  userId: string; // Must match auth.uid
  fromDate?: string; // YYYY-MM-DD, defaults to 30 days ago
  toDate?: string; // YYYY-MM-DD, defaults to today
}

export interface GetCreatorAudienceGrowthResponse {
  visits: number;
  signups: number;
  follows: number;
  firstMessages: number;
  firstPaidInteractions: number;
  platformBreakdown: Partial<Record<SocialPlatform, {
    visits: number;
    signups: number;
    follows: number;
  }>>;
}

export interface GetPublicCreatorPageRequest {
  username?: string;
  userId?: string;
}

export interface GetPublicCreatorPageResponse {
  success: boolean;
  creator?: PublicCreatorPreview;
  error?: string;
}

export interface UpdateSocialLinksRequest {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  twitch?: string;
  snapchat?: string;
  x?: string;
  facebook?: string;
  publicProfileEnabled?: boolean;
  bioVisible?: boolean;
  followerCountVisible?: boolean;
}

export interface UpdateSocialLinksResponse {
  success: boolean;
  socialLinks: CreatorSocialLinks;
}

export interface GenerateSmartLinksResponse {
  success: boolean;
  smartLinks: Partial<Record<SocialPlatform, string>>;
  qrCodeUrl: string;
  shareText: string;
}

/**
 * Error codes for audience growth operations
 */
export enum AudienceGrowthErrorCode {
  CREATOR_NOT_FOUND = 'audience_growth/creator-not-found',
  PUBLIC_PROFILE_DISABLED = 'audience_growth/public-profile-disabled',
  INVALID_PLATFORM = 'audience_growth/invalid-platform',
  INVALID_DATE_RANGE = 'audience_growth/invalid-date-range',
  UNAUTHORIZED = 'audience_growth/unauthorized',
  SPAM_DETECTED = 'audience_growth/spam-detected',
}

/**
 * Custom error class for audience growth operations
 */
export class AudienceGrowthError extends Error {
  constructor(
    public code: AudienceGrowthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AudienceGrowthError';
  }
}