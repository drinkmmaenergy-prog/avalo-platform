/**
 * PACK 250 - Paid Media Unlock 2.0
 * Token-Gated Albums, Bundles & Story Drops
 * 
 * Type definitions for the paid media monetization system
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// Media Product Types
// ============================================================================

export type MediaProductType = 
  | 'SINGLE_PHOTO'    // Single paid photo
  | 'SINGLE_VIDEO'    // Single video clip (15-90 sec)
  | 'ALBUM'           // Album of 5-30 photos
  | 'VIDEO_SERIES'    // Series of 3-10 video clips
  | 'STORY_DROP'      // 24h exclusive story
  | 'BUNDLE';         // Combination of photo + video + story

export type MediaProductStatus = 
  | 'DRAFT'           // Not yet published
  | 'PUBLISHED'       // Live and available for purchase
  | 'ARCHIVED'        // No longer available
  | 'UNDER_REVIEW';   // Flagged for moderation

export interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  url: string;                    // Firebase Storage URL
  thumbnailUrl?: string;          // Thumbnail for videos
  blurredPreviewUrl?: string;     // Blurred preview
  durationSeconds?: number;       // For videos
  width?: number;
  height?: number;
  fileSize: number;
  uploadedAt: Timestamp;
}

export interface PaidMediaProduct {
  productId: string;
  creatorId: string;
  productType: MediaProductType;
  
  // Content
  title: string;
  description?: string;
  items: MediaItem[];              // 1+ items depending on type
  thumbnailUrl: string;            // Preview image
  previewUrls?: string[];          // Blurred previews
  
  // Pricing
  priceTokens: number;             // 80-1000 tokens
  
  // Stats
  salesCount: number;              // Total sales
  uniqueBuyersCount: number;       // Unique buyers
  totalRevenue: number;            // Total tokens earned
  impressions: number;             // Views
  
  // Status
  status: MediaProductStatus;
  
  // Metadata
  tags?: string[];
  isNSFW: boolean;
  isFeatured?: boolean;
  
  // Story-specific (for STORY_DROP type)
  expiresAt?: Timestamp;           // 24h expiry
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

// ============================================================================
// Purchase Transaction
// ============================================================================

export interface MediaPurchase {
  purchaseId: string;
  productId: string;
  buyerId: string;
  creatorId: string;
  
  // Transaction details
  priceTokens: number;
  creatorEarnings: number;         // 65% of price
  platformFee: number;             // 35% of price
  
  // Product snapshot (in case product is deleted later)
  productSnapshot: {
    title: string;
    productType: MediaProductType;
    itemCount: number;
  };
  
  // Status
  status: 'COMPLETED' | 'REFUNDED';
  refundReason?: string;
  
  // Timestamps
  purchasedAt: Timestamp;
  refundedAt?: Timestamp;
}

// ============================================================================
// Lifetime Access
// ============================================================================

export interface PurchasedMediaAccess {
  accessId: string;                // Format: {userId}_{productId}
  userId: string;
  productId: string;
  creatorId: string;
  purchaseId: string;
  
  // Access details
  productType: MediaProductType;
  itemUrls: string[];              // Direct access URLs
  
  // Metadata
  purchasedAt: Timestamp;
  lastAccessedAt?: Timestamp;
  accessCount: number;
}

// ============================================================================
// Content Validation (Perceptual Hash)
// ============================================================================

export interface MediaContentHash {
  hashId: string;
  creatorId: string;
  productId: string;
  itemId: string;
  
  // Hash data
  perceptualHash: string;          // pHash for duplicate detection
  dhash?: string;                  // dHash for additional validation
  phashBits?: string;              // Binary representation
  
  // Moderation
  isDuplicate: boolean;
  originalProductId?: string;      // If duplicate detected
  
  // NSFW detection
  nsfwScore?: number;              // 0-1 score
  nsfwLabels?: string[];
  
  // Timestamps
  createdAt: Timestamp;
  flaggedAt?: Timestamp;
}

// ============================================================================
// Sales Analytics
// ============================================================================

export interface MediaSalesAnalytics {
  analyticsId: string;
  creatorId: string;
  date: string;                    // YYYY-MM-DD format
  
  // Daily metrics
  totalSales: number;
  totalRevenue: number;
  uniqueBuyers: number;
  impressions: number;
  clickThroughRate: number;        // clicks / impressions
  conversionRate: number;          // purchases / clicks
  
  // Product breakdown
  salesByProductType: {
    [key in MediaProductType]?: number;
  };
  
  // Top products
  topProducts: Array<{
    productId: string;
    sales: number;
    revenue: number;
  }>;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Creator Earnings
// ============================================================================

export interface CreatorMediaEarning {
  earningId: string;
  creatorId: string;
  purchaseId: string;
  productId: string;
  
  // Earnings
  tokensEarned: number;            // 65% of sale
  
  // Status
  status: 'PENDING' | 'SETTLED' | 'REFUNDED';
  settlementId?: string;           // Reference to monthly settlement
  
  // Timestamps
  earnedAt: Timestamp;
  settledAt?: Timestamp;
}

// ============================================================================
// Discovery Score (for algorithm)
// ============================================================================

export interface UserMediaDiscoveryScore {
  userId: string;
  
  // Scoring components
  totalSales: number;
  uniqueBuyers: number;
  averageRating?: number;
  repeatPurchaseRate: number;      // % of buyers who buy again
  
  // Recent performance (last 7 days)
  recentSales: number;
  recentRevenue: number;
  
  // Quality metrics
  refundRate: number;              // Lower is better
  complaintCount: number;
  
  // Anti-farming protection
  suspiciousBuyerCount: number;    // Buyers with multiple purchases from same seller
  farmingScore: number;            // 0-100, higher = more suspicious
  
  // Computed score
  discoveryScore: number;          // 0-1000, used for ranking
  
  // Timestamps
  lastCalculatedAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Story Drop (24h content)
// ============================================================================

export interface StoryDrop {
  storyId: string;
  productId: string;               // References paid_media_products
  creatorId: string;
  
  // Content
  items: MediaItem[];
  
  // Access
  buyerIds: string[];              // All buyers who purchased
  viewCount: number;
  
  // Status
  status: 'ACTIVE' | 'EXPIRED';
  expiresAt: Timestamp;            // 24h from creation
  
  // Timestamps
  createdAt: Timestamp;
  expiredAt?: Timestamp;
}

// ============================================================================
// UI Models
// ============================================================================

export interface MediaProductCard {
  productId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  
  productType: MediaProductType;
  title: string;
  thumbnailUrl: string;
  priceTokens: number;
  
  salesCount: number;
  isLocked: boolean;               // Has user purchased?
  isPurchased: boolean;
  
  // For bundles
  itemCount?: number;
  
  // For stories
  expiresAt?: number;              // Timestamp in milliseconds
  isExpiringSoon?: boolean;        // < 2 hours remaining
}

export interface PurchaseResult {
  success: boolean;
  purchaseId?: string;
  accessUrls?: string[];
  creatorId?: string;              // For "Say Something Now" CTA
  error?: string;
  errorCode?: 'INSUFFICIENT_TOKENS' | 'ALREADY_PURCHASED' | 'PRODUCT_UNAVAILABLE' | 'UNKNOWN';
}

export interface MediaDashboardStats {
  // Revenue
  totalEarnings: number;
  earningsToday: number;
  earningsThisWeek: number;
  earningsThisMonth: number;
  
  // Sales
  totalSales: number;
  salesToday: number;
  uniqueBuyers: number;
  
  // Products
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  
  // Performance
  averageSalePrice: number;
  conversionRate: number;
  repeatPurchaseRate: number;
  
  // Top products
  topSellingProducts: Array<{
    productId: string;
    title: string;
    sales: number;
    revenue: number;
  }>;
}

// ============================================================================
// Configuration
// ============================================================================

export const PAID_MEDIA_CONFIG = {
  // Price limits
  MIN_PRICE_TOKENS: 80,
  MAX_PRICE_TOKENS: 1000,
  
  // Revenue split
  CREATOR_CUT_PERCENT: 65,
  AVALO_CUT_PERCENT: 35,
  
  // Item limits by type
  ITEM_LIMITS: {
    SINGLE_PHOTO: { min: 1, max: 1 },
    SINGLE_VIDEO: { min: 1, max: 1 },
    ALBUM: { min: 5, max: 30 },
    VIDEO_SERIES: { min: 3, max: 10 },
    STORY_DROP: { min: 1, max: 10 },
    BUNDLE: { min: 2, max: 20 },
  },
  
  // Video limits
  VIDEO_MIN_DURATION_SEC: 15,
  VIDEO_MAX_DURATION_SEC: 90,
  
  // Story expiry
  STORY_EXPIRY_HOURS: 24,
  
  // Anti-farming
  FARMING_THRESHOLD_PURCHASES: 5,  // Same buyer buying from same creator
  MAX_PURCHASES_PER_DAY: 50,       // Per buyer
  
  // Discovery algorithm weights
  DISCOVERY_WEIGHTS: {
    SALES_COUNT: 0.3,
    UNIQUE_BUYERS: 0.25,
    RECENT_ACTIVITY: 0.2,
    QUALITY_SCORE: 0.15,
    ANTI_FARMING: 0.1,
  },
} as const;

// ============================================================================
// Helper Types
// ============================================================================

export type MediaPurchaseFilter = {
  creatorId?: string;
  buyerId?: string;
  productType?: MediaProductType;
  startDate?: Date;
  endDate?: Date;
  status?: 'COMPLETED' | 'REFUNDED';
};

export type MediaProductFilter = {
  creatorId?: string;
  productType?: MediaProductType;
  status?: MediaProductStatus;
  minPrice?: number;
  maxPrice?: number;
  isNSFW?: boolean;
  tags?: string[];
};