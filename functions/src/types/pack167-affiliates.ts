/**
 * PACK 167 - Avalo Influencer & Affiliate Attribution Network
 * Type definitions for ethical affiliate marketing system
 */

import { Timestamp } from 'firebase-admin/firestore';

// Allowed product categories
export type AffiliateCategory = 
  | 'digital_products'  // ebooks, presets, nutrition plans
  | 'courses'           // video programs, audio lessons
  | 'events'            // workshops, conferences, fitness camps
  | 'clubs'             // monthly communities
  | 'challenges'        // fitness journeys
  | 'brand_merch'       // clothing, gear, devices (SFW only)
  | 'coaching';         // educational mentorship

// Conversion status
export type ConversionStatus = 
  | 'pending'           // Purchase made, awaiting confirmation
  | 'confirmed'         // Valid purchase confirmed
  | 'rejected'          // Invalid or fraudulent
  | 'refunded';         // Purchase refunded

// Commission status
export type CommissionStatus = 
  | 'pending'           // Awaiting payout eligibility
  | 'available'         // Ready for withdrawal
  | 'processing'        // Withdrawal in progress
  | 'paid'              // Successfully paid out
  | 'cancelled';        // Commission cancelled

// Block reason for content moderation
export type BlockReason = 
  | 'romantic_manipulation'
  | 'sexual_content'
  | 'emotional_manipulation'
  | 'forbidden_platform_link'
  | 'nsfw_imagery'
  | 'seductive_content'
  | 'financial_grooming'
  | 'parasocial_exploitation';

// Affiliate Link interface
export interface AffiliateLink {
  id: string;
  creatorId: string;
  productId: string;
  productName: string;
  productDescription: string;
  category: AffiliateCategory;
  
  // Revenue split (must comply with rules)
  sellerPercentage: number;      // Must be >= 65%
  referralPercentage: number;    // Must be 0-20%
  platformFee: number;           // Must be >= 15%
  
  // Link details
  shortCode: string;
  fullUrl: string;
  
  // Metadata
  isActive: boolean;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  
  // Safety flags (must always be false)
  affectsRanking: false;
  affectsDiscovery: false;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt?: Timestamp;
}

// Affiliate Conversion interface
export interface AffiliateConversion {
  id: string;
  affiliateLinkId: string;
  
  // Parties involved
  referrerId: string;      // Creator who shared the link
  sellerId: string;        // Creator/brand selling the product
  buyerId: string;         // User who made the purchase
  
  // Purchase details
  productId: string;
  productName: string;
  purchaseAmount: number;  // Total purchase amount
  currency: string;
  
  // Revenue distribution
  sellerEarnings: number;
  referrerEarnings: number;
  platformFee: number;
  
  // Status
  status: ConversionStatus;
  
  // Tracking
  clickedAt: Timestamp;
  purchasedAt: Timestamp;
  confirmedAt?: Timestamp;
  
  // Safety
  ipAddress: string;
  userAgent: string;
  isFraudulent: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Affiliate Commission interface
export interface AffiliateCommission {
  id: string;
  creatorId: string;
  conversionId: string;
  affiliateLinkId: string;
  
  // Amount details
  amount: number;
  currency: string;
  
  // Status
  status: CommissionStatus;
  isPaid: boolean;
  
  // Payout details
  payoutMethod?: string;
  payoutReference?: string;
  paidAt?: Timestamp;
  
  // Eligibility
  eligibleForPayoutAt: Timestamp;  // Usually 30 days after conversion
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Affiliate Banner interface
export interface AffiliateBanner {
  id: string;
  creatorId: string;
  affiliateLinkId: string;
  
  // Banner content
  text: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  
  // Dimensions
  width: number;
  height: number;
  
  // Safety flags (must always be false)
  isNSFW: false;
  isSeductive: false;
  
  // Metadata
  isActive: boolean;
  clickCount: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Affiliate Analytics interface (aggregated per creator)
export interface AffiliateAnalytics {
  creatorId: string;
  
  // Performance metrics
  totalLinks: number;
  activeLinks: number;
  totalClicks: number;
  totalConversions: number;
  conversionRate: number;
  
  // Revenue metrics
  totalRevenue: number;
  totalCommissions: number;
  pendingCommissions: number;
  paidCommissions: number;
  
  // Top performing
  topProducts: Array<{
    productId: string;
    productName: string;
    conversions: number;
    revenue: number;
  }>;
  
  // Monthly breakdown
  monthlyStats: {
    [month: string]: {  // Format: YYYY-MM
      clicks: number;
      conversions: number;
      revenue: number;
      commissions: number;
    };
  };
  
  // Timestamps
  lastCalculatedAt: Timestamp;
  updatedAt: Timestamp;
}

// Blocked Content interface (for AI moderation results)
export interface BlockedAffiliateContent {
  id: string;
  creatorId: string;
  contentType: 'link' | 'banner' | 'description';
  contentId: string;
  
  // Content that was blocked
  blockedText: string;
  blockedImageUrl?: string;
  
  // Moderation details
  reason: BlockReason;
  detectionMethod: 'ai' | 'manual' | 'keyword';
  confidence: number;
  
  // Action taken
  actionTaken: 'blocked' | 'flagged' | 'removed';
  
  // Timestamps
  blockedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

// Request/Response types for Cloud Functions

export interface CreateAffiliateLinkRequest {
  productId: string;
  productName: string;
  productDescription: string;
  category: AffiliateCategory;
  referralPercentage: number;  // 0-20
  expiresInDays?: number;
}

export interface CreateAffiliateLinkResponse {
  success: boolean;
  linkId?: string;
  shortCode?: string;
  fullUrl?: string;
  error?: string;
}

export interface TrackAffiliateConversionRequest {
  affiliateLinkId: string;
  productId: string;
  purchaseAmount: number;
  currency: string;
  buyerId: string;
}

export interface TrackAffiliateConversionResponse {
  success: boolean;
  conversionId?: string;
  referrerEarnings?: number;
  error?: string;
}

export interface WithdrawAffiliateEarningsRequest {
  amount: number;
  payoutMethod: string;  // 'stripe' | 'bank_transfer' | 'crypto'
}

export interface WithdrawAffiliateEarningsResponse {
  success: boolean;
  withdrawalId?: string;
  processingTime?: string;
  error?: string;
}

export interface GenerateAffiliateBannerRequest {
  affiliateLinkId: string;
  text: string;
  imageUrl?: string;
  width: number;
  height: number;
  backgroundColor?: string;
  textColor?: string;
}

export interface GenerateAffiliateBannerResponse {
  success: boolean;
  bannerId?: string;
  bannerUrl?: string;
  error?: string;
}

// Safety validation results
export interface ContentSafetyCheck {
  isAllowed: boolean;
  blockedReasons: BlockReason[];
  confidence: number;
  flaggedPhrases: string[];
}

// Revenue split validation
export interface RevenueSplitValidation {
  isValid: boolean;
  errors: string[];
  sellerPercentage: number;
  referralPercentage: number;
  platformFee: number;
}