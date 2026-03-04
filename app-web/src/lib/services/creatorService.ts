"use client";

/**
 * Creator Dashboard Service
 * Handles earnings, analytics, and fan conversion metrics
 */

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
