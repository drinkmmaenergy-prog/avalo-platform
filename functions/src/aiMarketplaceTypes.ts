/**
 * PACK 311 — AI Companions Marketplace, Ranking & Owner Analytics
 * Backend TypeScript types
 */

export type TrustLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AvatarStatus = 'ACTIVE' | 'PAUSED' | 'BANNED';

export interface AIAvatarIndexStats {
  views7d: number;
  views30d: number;
  starts7d: number;           // AI chat sessions started
  starts30d: number;
  tokensEarned7d: number;
  tokensEarned30d: number;
  retentionScore: number;     // ratio: returning users / all users
}

export interface AIAvatarIndexTrust {
  ownerVerified: boolean;
  ownerTrustLevel: TrustLevel;
  riskLevel: RiskLevel;
}

export interface AIAvatarIndex {
  avatarId: string;
  ownerId: string;
  
  status: AvatarStatus;
  
  displayName: string;
  shortTagline: string;
  primaryPhotoUrl: string;
  
  languages: string[];
  primaryLanguage: string;
  
  categoryTags: string[];     // ["romantic", "chatty", "coach"]
  
  country: string;             // "PL" - derived from owner
  region?: string;             // "EU_EAST" - optional clustering
  
  trust: AIAvatarIndexTrust;
  stats: AIAvatarIndexStats;
  
  rankingScore: number;        // precomputed for listing
  lastRankingUpdatedAt: string; // ISO_DATETIME
}

export interface RankingCalculation {
  avatarId: string;
  rawScore: number;
  normalizedScore: number;
  breakdown: {
    viewsScore: number;
    startsScore: number;
    earningsScore: number;
    retentionScore: number;
    trustBonus: number;
    riskPenalty: number;
  };
}

export interface MarketplaceQueryParams {
  lang?: string;
  country?: string;
  page?: number;
  pageSize?: number;
  categoryTag?: string;
}

export interface MarketplaceResponse {
  items: Array<{
    avatarId: string;
    displayName: string;
    shortTagline: string;
    primaryPhotoUrl: string;
    languages: string[];
    country: string;
    rankingScore: number;
    trustBadge: {
      ownerVerified: boolean;
      ownerTrustLevel: TrustLevel;
    };
  }>;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface OwnerAvatarsResponse {
  avatars: Array<{
    avatarId: string;
    displayName: string;
    status: AvatarStatus;
    primaryPhotoUrl: string;
    stats: {
      views7d: number;
      views30d: number;
      chatStarts7d: number;
      chatStarts30d: number;
      tokensEarned7d: number;
      tokensEarned30d: number;
      retentionScore: number;
    };
  }>;
}

export interface AnalyticsAggregationResult {
  avatarId: string;
  views7d: number;
  views30d: number;
  chatStarts7d: number;
  chatStarts30d: number;
  uniqueUsers7d: number;
  returningUsers7d: number;
  tokensEarned7d: number;
  tokensEarned30d: number;
  retentionScore: number;
}