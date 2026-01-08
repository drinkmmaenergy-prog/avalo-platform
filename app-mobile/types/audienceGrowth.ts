/**
 * PACK 102 — Cross-Platform Audience Growth Types (Mobile)
 * 
 * TypeScript type definitions for mobile audience growth features.
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

export interface AudienceGrowthMetrics {
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

export interface CreatorSocialLinks {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  twitch?: string;
  snapchat?: string;
  x?: string;
  facebook?: string;
  publicProfileEnabled: boolean;
  bioVisible: boolean;
  followerCountVisible: boolean;
}

export interface SmartLinks {
  tiktok: string;
  instagram: string;
  youtube: string;
  twitch: string;
  snapchat: string;
  x: string;
  facebook: string;
  other: string;
}

export interface ShareData {
  smartLinks: SmartLinks;
  qrCodeUrl: string;
  shareText: string;
}

export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitch: 'Twitch',
  snapchat: 'Snapchat',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  other: 'Other',
};

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  tiktok: '#000000',
  instagram: '#E4405F',
  youtube: '#FF0000',
  twitch: '#9146FF',
  snapchat: '#FFFC00',
  x: '#000000',
  facebook: '#1877F2',
  other: '#6C757D',
};