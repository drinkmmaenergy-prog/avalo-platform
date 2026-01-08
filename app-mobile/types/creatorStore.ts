/**
 * Creator Store Types
 * Phase 4: Web-connected features (actual payments on web)
 */

import { Timestamp } from 'firebase/firestore';

export interface CreatorSubscriptionTier {
  id?: string;
  creatorUid: string;
  name: string;
  priceUSD: number;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  benefits: string[];
  isActive: boolean;
  createdAt: Timestamp;
}

export interface CreatorPPVContent {
  id?: string;
  creatorUid: string;
  title: string;
  description: string;
  priceUSD: number;
  contentType: 'photo' | 'video' | 'photoset' | 'bundle';
  thumbnailUrl?: string;
  isPurchased?: boolean; // for current user
  purchaseCount: number;
  createdAt: Timestamp;
}

export interface CreatorCustomRequest {
  id?: string;
  creatorUid: string;
  priceRangeMin: number;
  priceRangeMax: number;
  description: string;
  turnAroundDays: number;
  isAcceptingRequests: boolean;
  createdAt: Timestamp;
}

export interface CreatorStoreSettings {
  creatorUid: string;
  storeEnabled: boolean;
  storeName?: string;
  storeDescription?: string;
  webStoreUrl?: string; // URL to web-based store
  subscriptionsEnabled: boolean;
  ppvEnabled: boolean;
  customRequestsEnabled: boolean;
  updatedAt: Timestamp;
}