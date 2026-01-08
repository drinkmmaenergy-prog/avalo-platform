/**
 * PACK 79 — In-Chat Paid Gifts
 * Analytics tracking for gift interactions
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  GiftAnalyticsEvent,
  GiftOpenCatalogEvent,
  GiftPreviewEvent,
  GiftSendEvent,
  GiftAnimationViewedEvent,
} from '../types/gifts';

/**
 * Log analytics event to Firestore
 */
async function logAnalyticsEvent(
  eventType: GiftAnalyticsEvent,
  data: any,
  userId: string
): Promise<void> {
  try {
    const analyticsRef = collection(db, 'analytics', 'gifts', 'events');
    
    await addDoc(analyticsRef, {
      eventType,
      userId,
      timestamp: serverTimestamp(),
      ...data,
    });
  } catch (error) {
    console.error('Error logging gift analytics:', error);
    // Don't throw - analytics failures shouldn't break the app
  }
}

/**
 * Track when user opens gift catalog
 */
export async function trackGiftCatalogOpened(
  userId: string,
  chatId: string,
  receiverId: string
): Promise<void> {
  const data: GiftOpenCatalogEvent = {
    chatId,
    receiverId,
    timestamp: Date.now(),
  };

  await logAnalyticsEvent(GiftAnalyticsEvent.OPEN_CATALOG, data, userId);
}

/**
 * Track when user previews a gift animation
 */
export async function trackGiftPreview(
  userId: string,
  giftId: string,
  giftName: string,
  priceTokens: number
): Promise<void> {
  const data: GiftPreviewEvent = {
    giftId,
    giftName,
    priceTokens,
    timestamp: Date.now(),
  };

  await logAnalyticsEvent(GiftAnalyticsEvent.PREVIEW, data, userId);
}

/**
 * Track when user successfully sends a gift
 */
export async function trackGiftSend(
  userId: string,
  giftId: string,
  giftName: string,
  priceTokens: number,
  receiverId: string,
  chatId: string
): Promise<void> {
  const data: GiftSendEvent = {
    giftId,
    giftName,
    priceTokens,
    receiverId,
    chatId,
    timestamp: Date.now(),
  };

  await logAnalyticsEvent(GiftAnalyticsEvent.SEND, data, userId);
}

/**
 * Track when user views gift animation
 */
export async function trackGiftAnimationViewed(
  userId: string,
  giftTransactionId: string,
  viewerRole: 'sender' | 'receiver'
): Promise<void> {
  const data: GiftAnimationViewedEvent = {
    giftTransactionId,
    viewerId: userId,
    viewerRole,
    timestamp: Date.now(),
  };

  await logAnalyticsEvent(GiftAnalyticsEvent.ANIMATION_VIEWED, data, userId);
}

/**
 * Track when user views earnings from gifts
 */
export async function trackGiftEarningsViewed(
  userId: string,
  tokensEarned: number,
  giftTransactionId: string
): Promise<void> {
  const data = {
    tokensEarned,
    giftTransactionId,
    timestamp: Date.now(),
  };

  await logAnalyticsEvent(GiftAnalyticsEvent.EARNINGS_VIEWED, data, userId);
}

/**
 * Batch analytics helper for multiple events
 * Useful when sending gifts in quick succession
 */
export class GiftAnalyticsBatch {
  private events: Array<{ type: GiftAnalyticsEvent; data: any }> = [];
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  addEvent(eventType: GiftAnalyticsEvent, data: any): void {
    this.events.push({ type: eventType, data });
  }

  async flush(): Promise<void> {
    const promises = this.events.map((event) =>
      logAnalyticsEvent(event.type, event.data, this.userId)
    );

    await Promise.allSettled(promises);
    this.events = [];
  }
}

/**
 * Calculate gift analytics metrics for a user
 * (For display in profile/stats)
 */
export interface GiftAnalyticsMetrics {
  totalGiftsSent: number;
  totalGiftsReceived: number;
  totalTokensSpent: number;
  totalTokensEarned: number;
  mostSentGift?: string;
  mostReceivedGift?: string;
  averageGiftValue: number;
  conversionRate: number; // catalog opens to sends
}

/**
 * Get user-specific gift metrics
 * Note: This would typically be computed server-side or cached
 */
export async function getUserGiftMetrics(userId: string): Promise<GiftAnalyticsMetrics | null> {
  try {
    // This is a placeholder - actual implementation would query aggregated data
    // from a dedicated collection updated by Cloud Functions
    const metricsRef = collection(db, 'users', userId, 'analytics');
    // Implementation depends on backend data structure
    
    return null; // Return null for now - implement based on backend structure
  } catch (error) {
    console.error('Error fetching gift metrics:', error);
    return null;
  }
}