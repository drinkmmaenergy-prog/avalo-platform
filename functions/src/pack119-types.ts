/**
 * PACK 119 — Creator Agencies SaaS Panel
 * Type Definitions
 * 
 * ZERO INFLUENCE ON TOKENOMICS:
 * - No access to private messages or buyer data
 * - No token transfer or payout control
 * - No ranking manipulation or visibility boosts
 * - Agency splits handled by PACK 114 (inside creator's 65%)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// AGENCY ROLES & PERMISSIONS
// ============================================================================

export type AgencyRole = 'OWNER' | 'MANAGER' | 'EDITOR' | 'VIEWER';

export interface AgencyRolePermissions {
  canModifyProfile: boolean;
  canLinkCreators: boolean;
  canUploadAssets: boolean;
  canSchedulePosts: boolean;
  canViewAnalytics: boolean;
  canManageRevenue: boolean;
  canAccessPrivateData: boolean; // Always false
  canSendDMs: boolean; // Always false
}

export const AGENCY_ROLE_PERMISSIONS: Record<AgencyRole, AgencyRolePermissions> = {
  OWNER: {
    canModifyProfile: true,
    canLinkCreators: true,
    canUploadAssets: true,
    canSchedulePosts: true,
    canViewAnalytics: true,
    canManageRevenue: true,
    canAccessPrivateData: false,
    canSendDMs: false,
  },
  MANAGER: {
    canModifyProfile: true,
    canLinkCreators: true,
    canUploadAssets: true,
    canSchedulePosts: true,
    canViewAnalytics: true,
    canManageRevenue: false,
    canAccessPrivateData: false,
    canSendDMs: false,
  },
  EDITOR: {
    canModifyProfile: false,
    canLinkCreators: false,
    canUploadAssets: true,
    canSchedulePosts: true,
    canViewAnalytics: true,
    canManageRevenue: false,
    canAccessPrivateData: false,
    canSendDMs: false,
  },
  VIEWER: {
    canModifyProfile: false,
    canLinkCreators: false,
    canUploadAssets: false,
    canSchedulePosts: false,
    canViewAnalytics: true,
    canManageRevenue: false,
    canAccessPrivateData: false,
    canSendDMs: false,
  },
};

// ============================================================================
// AGENCY TEAM MEMBER
// ============================================================================

export interface AgencyTeamMember {
  memberId: string;
  agencyId: string;
  userId: string;
  email: string;
  role: AgencyRole;
  invitedBy: string;
  invitedAt: Timestamp;
  acceptedAt?: Timestamp;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  lastActiveAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// ASSET LIBRARY
// ============================================================================

export type AssetType = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
export type AssetStatus = 'PENDING_SCAN' | 'APPROVED' | 'REJECTED' | 'DELETED';

export interface AgencyAsset {
  assetId: string;
  agencyId: string;
  creatorUserId?: string; // Optional: specific creator this asset is for
  uploadedBy: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  assetType: AssetType;
  fileRef: string; // Storage path
  thumbnailRef?: string;
  tags: string[];
  description?: string;
  status: AssetStatus;
  scanResult?: {
    scannedAt: Timestamp;
    hasNSFW: boolean;
    hasIllegal: boolean;
    confidence: number;
    flags: string[];
  };
  usageCount: number;
  lastUsedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SOCIAL SCHEDULING
// ============================================================================

export type SchedulePlatform = 
  | 'AVALO_FEED'
  | 'AVALO_STORY'
  | 'INSTAGRAM_FEED'
  | 'INSTAGRAM_STORY'
  | 'INSTAGRAM_REEL'
  | 'TIKTOK'
  | 'YOUTUBE_SHORT'
  | 'TWITTER';

export type ScheduleStatus = 
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export interface AgencySchedulerTask {
  taskId: string;
  agencyId: string;
  creatorUserId: string;
  scheduledBy: string;
  platform: SchedulePlatform;
  assetId: string;
  caption?: string;
  publishAt: Timestamp;
  status: ScheduleStatus;
  attempt: number;
  lastAttemptAt?: Timestamp;
  publishedAt?: Timestamp;
  externalPostId?: string;
  error?: {
    code: string;
    message: string;
    timestamp: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PORTFOLIO BUILDER
// ============================================================================

export interface CreatorPortfolio {
  portfolioId: string;
  creatorUserId: string;
  agencyId?: string;
  handle: string; // URL: portfolio.avalo.app/{handle}
  displayName: string;
  bio?: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  socialLinks: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    website?: string;
  };
  featuredAssets: string[]; // Asset IDs (max 12)
  customSections: {
    id: string;
    title: string;
    content: string;
    order: number;
  }[];
  contactEmail?: string;
  isPublic: boolean;
  themeColor?: string;
  views: number;
  lastViewedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// ANALYTICS (AGGREGATED ONLY)
// ============================================================================

export interface AgencyDashboardAnalytics {
  agencyId: string;
  creatorUserId: string;
  period: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LIFETIME';
  
  // Follower metrics (numeric only, no identities)
  followerCount: number;
  followerGrowth: number;
  
  // Reach & engagement (aggregated only)
  reach: number;
  impressions: number;
  engagementRate: number;
  
  // Earnings (totals only, no buyer details)
  totalEarnings: number;
  earningGrowth: number;
  avgEarningsPerDay: number;
  
  // Content performance (aggregated)
  postsPublished: number;
  avgEngagementPerPost: number;
  topPerformingContentType?: string;
  
  // Portfolio metrics
  portfolioViews: number;
  portfolioClicks: number;
  
  calculatedAt: Timestamp;
}

// ============================================================================
// OAUTH TOKENS (FOR EXTERNAL PLATFORMS)
// ============================================================================

export interface CreatorOAuthToken {
  tokenId: string;
  creatorUserId: string;
  platform: SchedulePlatform;
  accessToken: string; // Encrypted
  refreshToken?: string; // Encrypted
  expiresAt: Timestamp;
  scope: string[];
  grantedAt: Timestamp;
  lastRefreshedAt?: Timestamp;
  revokedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY & COMPLIANCE
// ============================================================================

export type SafetyViolationType = 
  | 'NSFW_CONTENT'
  | 'ILLEGAL_CONTENT'
  | 'SOLICITATION'
  | 'WATERMARK_REMOVAL'
  | 'COPYRIGHT_VIOLATION';

export interface AgencySafetyViolation {
  violationId: string;
  agencyId: string;
  violationType: SafetyViolationType;
  relatedAssetId?: string;
  relatedTaskId?: string;
  detectedBy: 'AI_SCAN' | 'MANUAL_REVIEW' | 'USER_REPORT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  actorId: string;
  evidence?: {
    screenshots?: string[];
    logs?: string[];
    metadata?: Record<string, any>;
  };
  status: 'OPEN' | 'UNDER_REVIEW' | 'ACTIONED' | 'DISMISSED';
  actionTaken?: {
    type: 'WARNING' | 'ASSET_DELETED' | 'TASK_CANCELLED' | 'AGENCY_SUSPENDED';
    appliedBy: string;
    appliedAt: Timestamp;
    notes?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export type AgencySaaSAuditEvent =
  | 'TEAM_MEMBER_INVITED'
  | 'TEAM_MEMBER_ROLE_CHANGED'
  | 'TEAM_MEMBER_REMOVED'
  | 'ASSET_UPLOADED'
  | 'ASSET_DELETED'
  | 'TASK_SCHEDULED'
  | 'TASK_CANCELLED'
  | 'PORTFOLIO_CREATED'
  | 'PORTFOLIO_UPDATED'
  | 'ANALYTICS_ACCESSED'
  | 'SAFETY_VIOLATION_DETECTED'
  | 'OAUTH_TOKEN_GRANTED'
  | 'OAUTH_TOKEN_REVOKED';

export interface AgencySaaSAuditLog {
  logId: string;
  agencyId: string;
  creatorUserId?: string;
  eventType: AgencySaaSAuditEvent;
  actorId: string;
  actorRole: AgencyRole;
  targetId?: string; // Asset ID, Task ID, etc.
  previousValue?: any;
  newValue?: any;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Timestamp;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum AgencySaaSErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CREATOR_NOT_LINKED = 'CREATOR_NOT_LINKED',
  ASSET_SCAN_FAILED = 'ASSET_SCAN_FAILED',
  NSFW_CONTENT_BLOCKED = 'NSFW_CONTENT_BLOCKED',
  ILLEGAL_CONTENT_BLOCKED = 'ILLEGAL_CONTENT_BLOCKED',
  OAUTH_ERROR = 'OAUTH_ERROR',
  PUBLISH_FAILED = 'PUBLISH_FAILED',
  PORTFOLIO_HANDLE_TAKEN = 'PORTFOLIO_HANDLE_TAKEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  AGENCY_SUSPENDED = 'AGENCY_SUSPENDED',
}

export class AgencySaaSError extends Error {
  constructor(
    public code: AgencySaaSErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AgencySaaSError';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if role has permission
 */
export function hasPermission(role: AgencyRole, permission: keyof AgencyRolePermissions): boolean {
  return AGENCY_ROLE_PERMISSIONS[role][permission];
}

/**
 * Validate asset for safety
 */
export function isAssetSafe(asset: AgencyAsset): boolean {
  if (!asset.scanResult) return false;
  return !asset.scanResult.hasNSFW && !asset.scanResult.hasIllegal;
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: SchedulePlatform): string {
  const names: Record<SchedulePlatform, string> = {
    AVALO_FEED: 'Avalo Feed',
    AVALO_STORY: 'Avalo Story',
    INSTAGRAM_FEED: 'Instagram Feed',
    INSTAGRAM_STORY: 'Instagram Story',
    INSTAGRAM_REEL: 'Instagram Reel',
    TIKTOK: 'TikTok',
    YOUTUBE_SHORT: 'YouTube Short',
    TWITTER: 'Twitter/X',
  };
  return names[platform];
}