/**
 * PACK 282 — Feed Engine Types
 * TypeScript type definitions for Instagram-style feed system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// FEED POST TYPES
// ============================================================================

export type PostType = 'photo' | 'video' | 'carousel';
export type PostVisibility = 'public' | 'followers' | 'subscribers';
export type NSFWFlag = 'safe' | 'soft' | 'erotic' | 'blocked';
export type NSFWOverride = 'none' | 'author' | 'moderator';

export interface MediaItem {
  url: string;
  thumbUrl?: string;
  aspectRatio: number;
  width?: number;
  height?: number;
  duration?: number; // for videos
  order?: number; // for carousels
}

export interface PostLocation {
  city?: string;
  country?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface PostNSFW {
  flag: NSFWFlag;
  autoDetected: boolean;
  manualOverride: NSFWOverride;
  scores?: {
    adult?: number;
    racy?: number;
    violence?: number;
  };
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

export interface PostStats {
  likes: number;
  comments: number;
  views: number;
  saves: number;
  shares?: number;
}

export interface FeedPost {
  postId: string;
  authorId: string;
  type: PostType;
  media: MediaItem[];
  caption: string;
  tags: string[];
  location?: PostLocation;
  visibility: PostVisibility;
  nsfw: PostNSFW;
  stats: PostStats;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  isSponsored?: boolean;
  sponsorTag?: string;
}

export interface CreatePostInput {
  type: PostType;
  media: MediaItem[];
  caption: string;
  tags?: string[];
  location?: PostLocation;
  visibility: PostVisibility;
}

export interface UpdatePostInput {
  caption?: string;
  tags?: string[];
  location?: PostLocation;
  visibility?: PostVisibility;
}

// ============================================================================
// FEED LIKE TYPES
// ============================================================================

export interface FeedLike {
  postId: string;
  userId: string;
  createdAt: Timestamp;
}

// ============================================================================
// FEED COMMENT TYPES
// ============================================================================

export interface FeedComment {
  commentId: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  reportedCount: number;
  parentCommentId?: string; // for replies
}

export interface CreateCommentInput {
  postId: string;
  text: string;
  parentCommentId?: string;
}

export interface UpdateCommentInput {
  text: string;
}

// ============================================================================
// FEED SAVE TYPES
// ============================================================================

export interface FeedSave {
  postId: string;
  userId: string;
  createdAt: Timestamp;
  collections?: string[]; // future: organize saves into collections
}

// ============================================================================
// FEED REPORT TYPES
// ============================================================================

export type ReportReason = 
  | 'hate' 
  | 'spam' 
  | 'illegal' 
  | 'violence' 
  | 'sexual_minor' 
  | 'harassment'
  | 'misinformation'
  | 'copyright'
  | 'other';

export type ReportTargetType = 'post' | 'comment' | 'user';
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export interface FeedReport {
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  resolution?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

// ============================================================================
// FEED VIEW TYPES
// ============================================================================

export interface FeedView {
  postId: string;
  userId: string;
  timestamp: Timestamp;
  durationMs?: number;
  scrollDepth?: number; // percentage of post viewed
}

// ============================================================================
// FEED RETRIEVAL TYPES
// ============================================================================

export interface FeedQuery {
  limit?: number;
  cursor?: string;
  authorId?: string;
  tags?: string[];
  location?: string;
  visibility?: PostVisibility[];
  nsfwFilter?: NSFWFlag[];
  excludeNSFW?: boolean;
  includeFollowing?: boolean;
  onlyFollowing?: boolean;
}

export interface FeedResponse {
  posts: FeedPostWithAuthor[];
  nextCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

export interface FeedPostWithAuthor extends FeedPost {
  author: {
    userId: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
    verified?: boolean;
    profileScore?: number;
  };
  userInteractions?: {
    liked: boolean;
    saved: boolean;
    following: boolean;
  };
}

// ============================================================================
// RANKING TYPES
// ============================================================================

export interface RankingFactors {
  recency: number;         // 0-1, newer = higher
  relationship: number;    // 0-1, closer relationship = higher
  engagement: number;      // 0-1, more engagement = higher
  quality: number;         // 0-1, higher quality = higher
  safety: number;          // 0-1, safer = higher
  diversity: number;       // 0-1, for content diversity
}

export interface PostRankingScore {
  postId: string;
  score: number;
  factors: RankingFactors;
  timestamp: Timestamp;
}

export interface RankingConfig {
  weights: {
    recency: number;
    relationship: number;
    engagement: number;
    quality: number;
    safety: number;
    diversity: number;
  };
  decayHalfLife: number; // hours
  minSafetyScore: number;
  nsfwPenalty: number;
}

// Default ranking weights
export const DEFAULT_RANKING_WEIGHTS: RankingConfig['weights'] = {
  recency: 0.30,
  relationship: 0.25,
  engagement: 0.20,
  quality: 0.15,
  safety: 0.07,
  diversity: 0.03,
};

// ============================================================================
// FEED ALGORITHM TYPES
// ============================================================================

export interface UserFeedPreferences {
  userId: string;
  nsfwFilter: NSFWFlag[]; // which levels to allow
  hideSoftNSFW: boolean;
  hideEroticNSFW: boolean;
  mutedUsers: string[];
  mutedTags: string[];
  preferredTags: string[];
  preferredLocations: string[];
  updatedAt: Timestamp;
}

export interface FeedContext {
  userId: string;
  verified18Plus: boolean;
  safetyScore?: number;
  profileScore?: number;
  following: string[];
  recentInteractions: string[]; // recent user IDs interacted with
  preferences?: UserFeedPreferences;
}

// ============================================================================
// MODERATION INTEGRATION
// ============================================================================

export interface ModerationResult {
  safe: boolean;
  action: 'allow' | 'review' | 'block';
  nsfwFlag: NSFWFlag;
  scores: {
    nsfw: number;
    toxicity: number;
    sexual: number;
    violence: number;
    hate: number;
    harassment: number;
  };
  flags: string[];
  reasons: string[];
  confidence: number;
  extractedText?: string;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface FeedAnalytics {
  postId: string;
  impressions: number;
  uniqueViews: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  avgViewDuration: number;
  engagementRate: number;
  reach: number;
  period: 'hour' | 'day' | 'week' | 'month';
  timestamp: Timestamp;
}

export interface UserFeedAnalytics {
  userId: string;
  totalPosts: number;
  totalImpressions: number;
  totalEngagements: number;
  avgEngagementRate: number;
  followerGrowth: number;
  topPosts: string[];
  period: 'day' | 'week' | 'month';
  timestamp: Timestamp;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class FeedError extends Error {
  constructor(
    public code: FeedErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

export enum FeedErrorCode {
  NOT_VERIFIED_18_PLUS = 'NOT_VERIFIED_18_PLUS',
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  COMMENT_NOT_FOUND = 'COMMENT_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NSFW_BLOCKED = 'NSFW_BLOCKED',
  INVALID_MEDIA = 'INVALID_MEDIA',
  INVALID_CAPTION = 'INVALID_CAPTION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  MODERATION_FAILED = 'MODERATION_FAILED',
  VISIBILITY_RESTRICTED = 'VISIBILITY_RESTRICTED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
}

// ============================================================================
// BATCH OPERATION TYPES
// ============================================================================

export interface BatchLikeOperation {
  postIds: string[];
  userId: string;
}

export interface BatchDeleteOperation {
  postIds: string[];
  userId: string;
  hardDelete?: boolean;
}

export interface BulkModerationOperation {
  postIds: string[];
  action: 'approve' | 'hide' | 'block';
  reason?: string;
  performedBy: string;
}