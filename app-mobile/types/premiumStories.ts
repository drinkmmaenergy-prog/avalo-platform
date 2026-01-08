/**
 * Premium Story Posts Types
 * Pay-to-unlock story content with 24h access and anti-screenshot protection
 */

import { Timestamp } from 'firebase/firestore';

export type PremiumStoryMediaType = 'image' | 'video';

export interface PremiumStory {
  id: string;
  authorId: string;
  mediaUrl: string;
  thumbnailUrl: string;
  mediaType: PremiumStoryMediaType;
  createdAt: Timestamp;
  durationHours: 24;
  priceTokens: number;
  viewCount: number;
  unlockCount: number;
  metadata?: {
    width: number;
    height: number;
    duration?: number; // seconds for video
    fileSize: number;
  };
}

export interface PremiumStoryUnlock {
  id: string;
  userId: string;
  storyId: string;
  unlockedAt: Timestamp;
  expiresAt: Timestamp;
  pricePaid: number;
  creatorEarnings: number;
  avaloFee: number;
}

export interface PremiumStoryUploadData {
  uri: string;
  type: PremiumStoryMediaType;
  price: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface UnlockAccessInfo {
  hasAccess: boolean;
  expiresAt?: Date;
  remainingSeconds?: number;
  unlockId?: string;
}

export interface PremiumStoryFeedItem extends PremiumStory {
  author: {
    id: string;
    displayName: string;
    photoURL?: string;
    verified?: boolean;
  };
  unlockStatus: UnlockAccessInfo;
}

export interface UploadProgress {
  progress: number; // 0-100
  stage: 'compressing' | 'uploading' | 'processing' | 'complete';
  message: string;
}