"use client";

/**
 * Creator Dashboard Service
 * Handles earnings, analytics, and fan conversion metrics
 *
 * NOTE: earnerService.ts is now the canonical service for earn_on architecture.
 * This file retains all existing functions for backward compatibility AND
 * re-exports earnerService types/functions for consumers that import from here.
 */

// ── Re-export canonical earnerService for backward compatibility ──
export {
  type EarnSurfaces,
  type EarnProfile,
  type EarnerSettings,
  type EarnSurfaceKey,
  EARN_SURFACE_META,
  getEarnerSettings,
  setEarnOn,
  setEarnSurface,
  setEarnProfile,
  isEarner,
  setEarnOnWithSurfaces,
} from './earnerService';

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CreatorEarnings, CreatorAnalytics } from '../types';

// ============================================================================
// EARNINGS
// ============================================================================

/**
 * Get creator earnings breakdown
 */
export async function getCreatorEarnings(userId: string): Promise<CreatorEarnings | null> {
  try {
    const earningsRef = doc(requireDb(), 'creator_earnings', userId);
    const earningsSnap = await getDoc(earningsRef);

    if (!earningsSnap.exists()) {
      return null;
    }

    return {
      userId,
      ...earningsSnap.data(),
    } as CreatorEarnings;
  } catch (error) {
    console.error('Error getting creator earnings:', error);
    throw error;
  }
}

/**
 * Get earnings history
 */
export async function getEarningsHistory(userId: string, limitCount: number = 50) {
  try {
    const q = query(
      collection(requireDb(), 'transactions'),
      where('userId', '==', userId),
      where('type', 'in', ['call_earning', 'chat_earning', 'content_unlock', 'event_earning']),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting earnings history:', error);
    throw error;
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get creator analytics
 */
export async function getCreatorAnalytics(
  userId: string,
  period: 'day' | 'week' | 'month' = 'week'
): Promise<CreatorAnalytics | null> {
  try {
    const analyticsRef = doc(requireDb(), 'creator_analytics', `${userId}_${period}`);
    const analyticsSnap = await getDoc(analyticsRef);

    if (!analyticsSnap.exists()) {
      return null;
    }

    return {
      userId,
      period,
      ...analyticsSnap.data(),
    } as CreatorAnalytics;
  } catch (error) {
    console.error('Error getting creator analytics:', error);
    throw error;
  }
}

/**
 * Get popular content performance
 */
export async function getPopularContent(userId: string, limitCount: number = 10) {
  try {
    const q = query(
      collection(requireDb(), 'posts'),
      where('userId', '==', userId),
      orderBy('views', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting popular content:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUTS
// ============================================================================

/**
 * Request payout
 */
export async function requestPayout(params: {
  userId: string;
  amount: number;
  method: 'bank' | 'paypal' | 'stripe';
  details: Record<string, any>;
}): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  try {
    const request = httpsCallable<typeof params, {
      success: boolean;
      payoutId: string;
    }>(requireFunctions(), 'requestPayout');
    
    const result = await request(params);
    return result.data;
  } catch (error: any) {
    console.error('Error requesting payout:', error);
    return {
      success: false,
      error: error.message || 'Failed to request payout',
    };
  }
}

/**
 * Get payout history
 */
export async function getPayoutHistory(userId: string, limitCount: number = 20) {
  try {
    const q = query(
      collection(requireDb(), 'payouts'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting payout history:', error);
    throw error;
  }
}

// ============================================================================
// FAN CONVERSION METRICS
// ============================================================================

/**
 * Get fan conversion metrics
 */
export async function getFanConversionMetrics(userId: string): Promise<{
  freeToPaid: number;
  repeating: number;
  avgSpend: number;
  topSpenders: any[];
}> {
  try {
    const metrics = httpsCallable<{ userId: string }, any>(requireFunctions(),
      'getFanConversionMetrics'
    );
    
    const result = await metrics({ userId });
    return result.data;
  } catch (error) {
    console.error('Error getting fan conversion metrics:', error);
    return {
      freeToPaid: 0,
      repeating: 0,
      avgSpend: 0,
      topSpenders: [],
    };
  }
}

// ============================================================================
// CREATOR SETTINGS (Firestore users/{uid})
// ============================================================================

export interface CreatorSettings {
  earnOn: boolean;
  chatPricePerToken: number;
}

/**
 * Read creator settings from users/{uid}.
 * Returns earnOn and chatPricePerToken.
 */
export async function getCreatorSettings(userId: string): Promise<CreatorSettings> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { earnOn: false, chatPricePerToken: 5 };
    }

    const data = userSnap.data();
    return {
      earnOn: data.earnOn ?? false,
      chatPricePerToken: data.chatPricePerToken ?? 5,
    };
  } catch (error) {
    console.error('Error getting creator settings:', error);
    throw error;
  }
}

/**
 * Toggle earn_on mode for creator.
 * Writes earnOn: boolean to users/{uid}.
 */
export async function setCreatorEarnOn(userId: string, earnOn: boolean): Promise<void> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    await setDoc(userRef, { earnOn, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Error setting earnOn:', error);
    throw error;
  }
}

/**
 * Set chat message price per token.
 * Writes chatPricePerToken: number to users/{uid}.
 * Enforced range: min 1, max 50.
 */
export async function setCreatorChatPrice(userId: string, price: number): Promise<void> {
  if (price < 1 || price > 50) {
    throw new Error('Chat price must be between 1 and 50 tokens');
  }

  try {
    const userRef = doc(requireDb(), 'users', userId);
    await setDoc(
      userRef,
      { chatPricePerToken: price, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    console.error('Error setting chat price:', error);
    throw error;
  }
}

// ============================================================================
// CREATOR STATS (Firestore creator_stats/{uid})
// ============================================================================

export interface CreatorStatsData {
  dailyEarnings: Array<{ date: string; tokens: number }>;
  messageCount: number;
  topPayers: Array<{ uid: string; displayName: string; totalSpent: number }>;
  totalEarnings: number;
  pendingBalance: number;
}

/**
 * Read creator stats from creator_stats/{uid}.
 * Contains daily earnings, message count, top payers.
 */
export async function getCreatorStatsData(userId: string): Promise<CreatorStatsData | null> {
  try {
    const statsRef = doc(requireDb(), 'creator_stats', userId);
    const statsSnap = await getDoc(statsRef);

    if (!statsSnap.exists()) {
      return null;
    }

    const data = statsSnap.data();
    return {
      dailyEarnings: data.dailyEarnings ?? [],
      messageCount: data.messageCount ?? 0,
      topPayers: data.topPayers ?? [],
      totalEarnings: data.totalEarnings ?? 0,
      pendingBalance: data.pendingBalance ?? 0,
    };
  } catch (error) {
    console.error('Error getting creator stats:', error);
    throw error;
  }
}

// ============================================================================
// WALLET (Firestore wallets/{uid})
// ============================================================================

export interface WalletData {
  balance: number;
  earned: number;
  pending: number;
  spent: number;
  updatedAt: Date;
}

/**
 * Read wallet data from wallets/{uid}.
 */
export async function getWalletData(userId: string): Promise<WalletData | null> {
  try {
    const walletRef = doc(requireDb(), 'wallets', userId);
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      return null;
    }

    const data = walletSnap.data();
    return {
      balance: data.balance ?? 0,
      earned: data.earned ?? 0,
      pending: data.pending ?? 0,
      spent: data.spent ?? 0,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUT REQUESTS (Firestore payout_requests)
// ============================================================================

/**
 * Submit a payout request to payout_requests collection.
 * Backend processes asynchronously.
 */
export async function submitPayoutRequest(
  userId: string,
  tokensRequested: number
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  if (tokensRequested < 1000) {
    return { success: false, error: 'Minimum payout is 1,000 tokens' };
  }

  try {
    const payoutRef = await addDoc(collection(requireDb(), 'payout_requests'), {
      userId,
      tokensRequested,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { success: true, requestId: payoutRef.id };
  } catch (error) {
    console.error('Error submitting payout request:', error);
    return { success: false, error: 'Failed to submit payout request' };
  }
}

/**
 * Get payout requests for a creator from payout_requests collection.
 */
export async function getPayoutRequests(
  userId: string,
  limitCount: number = 20
): Promise<Array<{
  id: string;
  tokensRequested: number;
  status: string;
  createdAt: Date;
}>> {
  try {
    const q = query(
      collection(requireDb(), 'payout_requests'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        tokensRequested: data.tokensRequested ?? 0,
        status: data.status ?? 'PENDING',
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      };
    });
  } catch (error) {
    console.error('Error getting payout requests:', error);
    throw error;
  }
}

/**
 * Get message count for creator (messages received, i.e. paid messages).
 * Reads from creator_stats/{uid} messageCount field.
 */
export async function getCreatorMessageCount(userId: string): Promise<number> {
  try {
    const statsRef = doc(requireDb(), 'creator_stats', userId);
    const statsSnap = await getDoc(statsRef);

    if (!statsSnap.exists()) {
      return 0;
    }

    return statsSnap.data().messageCount ?? 0;
  } catch (error) {
    console.error('Error getting creator message count:', error);
    return 0;
  }
}
