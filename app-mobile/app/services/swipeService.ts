/**
 * PACK 272 — Swipe Engine Service
 * 
 * Handles:
 * - Daily limit tracking (50 swipes/day)
 * - Hourly refills (+10 per hour, on-demand only)
 * - Swipe history and cooldowns
 * - Return-to-swipe logic (48h cooldown)
 */

import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  increment,
  serverTimestamp,
} from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

export const SWIPE_LIMITS = {
  DAILY_BASE: 50,              // Base daily swipe limit
  HOURLY_REFILL: 10,           // Extra swipes per refill
  REFILL_COOLDOWN_MS: 3600000, // 1 hour in milliseconds
  COOLDOWN_REPEAT_DAYS: 30,    // Don't show same profile for 30 days
  RETURN_COOLDOWN_MS: 172800000, // 48 hours for return-to-swipe
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface SwipeLimitStatus {
  userId: string;
  swipesUsedToday: number;
  swipesRemaining: number;
  dailyResetAt: Date;
  lastRefillAt: Date | null;
  canRefillNow: boolean;
  nextRefillAt: Date | null;
}

export interface SwipeAction {
  userId: string;
  targetUserId: string;
  action: 'like' | 'pass' | 'super_like';
  timestamp: Date;
  isSuperLike?: boolean;
  tokensCost?: number;
}

export interface SwipeHistoryEntry {
  targetUserId: string;
  action: 'like' | 'pass' | 'super_like';
  swipedAt: Date;
  canShowAgainAt: Date;
}

// ============================================================================
// SWIPE SERVICE
// ============================================================================

class SwipeService {
  /**
   * Get current swipe limit status for user
   */
  async getSwipeLimitStatus(userId: string): Promise<SwipeLimitStatus> {
    try {
      const limitsRef = doc(db, 'users', userId, 'swipe', 'limits');
      const limitsDoc = await getDoc(limitsRef);

      const now = new Date();
      const localMidnight = this.getNextLocalMidnight(now);

      if (!limitsDoc.exists()) {
        // Initialize limits for new user
        const initialData = {
          swipesUsedToday: 0,
          dailyResetAt: Timestamp.fromDate(localMidnight),
          lastRefillAt: null,
          createdAt: serverTimestamp(),
        };
        await setDoc(limitsRef, initialData);

        return {
          userId,
          swipesUsedToday: 0,
          swipesRemaining: SWIPE_LIMITS.DAILY_BASE,
          dailyResetAt: localMidnight,
          lastRefillAt: null,
          canRefillNow: true,
          nextRefillAt: null,
        };
      }

      const data = limitsDoc.data();
      const resetAt = data.dailyResetAt.toDate();
      const lastRefill = data.lastRefillAt?.toDate() || null;

      // Check if we need to reset daily counter
      if (now >= resetAt) {
        const newResetAt = this.getNextLocalMidnight(now);
        await updateDoc(limitsRef, {
          swipesUsedToday: 0,
          dailyResetAt: Timestamp.fromDate(newResetAt),
        });

        return {
          userId,
          swipesUsedToday: 0,
          swipesRemaining: SWIPE_LIMITS.DAILY_BASE,
          dailyResetAt: newResetAt,
          lastRefillAt: lastRefill,
          canRefillNow: true,
          nextRefillAt: null,
        };
      }

      // Calculate refill eligibility
      const canRefill = !lastRefill || 
        (now.getTime() - lastRefill.getTime()) >= SWIPE_LIMITS.REFILL_COOLDOWN_MS;
      
      const nextRefillAt = lastRefill 
        ? new Date(lastRefill.getTime() + SWIPE_LIMITS.REFILL_COOLDOWN_MS)
        : null;

      const swipesUsed = data.swipesUsedToday || 0;
      const remaining = Math.max(0, SWIPE_LIMITS.DAILY_BASE - swipesUsed);

      return {
        userId,
        swipesUsedToday: swipesUsed,
        swipesRemaining: remaining,
        dailyResetAt: resetAt,
        lastRefillAt: lastRefill,
        canRefillNow: canRefill,
        nextRefillAt,
      };
    } catch (error) {
      console.error('[SwipeService] getSwipeLimitStatus error:', error);
      throw error;
    }
  }

  /**
   * Request hourly refill (+10 swipes)
   * Only works if 1 hour has passed since last refill
   */
  async requestRefill(userId: string): Promise<{
    success: boolean;
    newLimit: number;
    message: string;
  }> {
    try {
      const status = await this.getSwipeLimitStatus(userId);

      if (!status.canRefillNow) {
        const minutesLeft = status.nextRefillAt 
          ? Math.ceil((status.nextRefillAt.getTime() - Date.now()) / 60000)
          : 0;
        
        return {
          success: false,
          newLimit: status.swipesRemaining,
          message: `Refill available in ${minutesLeft} minutes`,
        };
      }

      // Grant refill
      const limitsRef = doc(db, 'users', userId, 'swipe', 'limits');
      await updateDoc(limitsRef, {
        lastRefillAt: serverTimestamp(),
      });

      const newLimit = status.swipesRemaining + SWIPE_LIMITS.HOURLY_REFILL;

      return {
        success: true,
        newLimit,
        message: `+${SWIPE_LIMITS.HOURLY_REFILL} swipes added!`,
      };
    } catch (error) {
      console.error('[SwipeService] requestRefill error:', error);
      throw error;
    }
  }

  /**
   * Record a swipe action
   */
  async recordSwipe(swipeAction: SwipeAction): Promise<{
    success: boolean;
    swipesRemaining: number;
    isMatch?: boolean;
  }> {
    try {
      const { userId, targetUserId, action, isSuperLike } = swipeAction;

      // Check if user has swipes remaining
      const status = await this.getSwipeLimitStatus(userId);
      if (status.swipesRemaining <= 0) {
        throw new Error('No swipes remaining. Try refreshing or wait for daily reset.');
      }

      // Record swipe in history
      const historyRef = doc(
        collection(db, 'users', userId, 'swipe', 'history', 'swipes'),
        targetUserId
      );

      const now = new Date();
      const canShowAgainAt = new Date(now.getTime() + (SWIPE_LIMITS.COOLDOWN_REPEAT_DAYS * 86400000));

      await setDoc(historyRef, {
        targetUserId,
        action,
        swipedAt: Timestamp.fromDate(now),
        canShowAgainAt: Timestamp.fromDate(canShowAgainAt),
        isSuperLike: isSuperLike || false,
      });

      // Update swipe count
      const limitsRef = doc(db, 'users', userId, 'swipe', 'limits');
      await updateDoc(limitsRef, {
        swipesUsedToday: increment(1),
        lastSwipeAt: serverTimestamp(),
      });

      // Check for match if action was 'like' or 'super_like'
      let isMatch = false;
      if (action === 'like' || action === 'super_like') {
        isMatch = await this.checkForMatch(userId, targetUserId);
      }

      return {
        success: true,
        swipesRemaining: status.swipesRemaining - 1,
        isMatch,
      };
    } catch (error) {
      console.error('[SwipeService] recordSwipe error:', error);
      throw error;
    }
  }

  /**
   * Check if two users have matched
   */
  private async checkForMatch(userId: string, targetUserId: string): Promise<boolean> {
    try {
      // Check if target user also liked current user
      const targetSwipeRef = doc(
        db,
        'users',
        targetUserId,
        'swipe',
        'history',
        'swipes',
        userId
      );

      const targetSwipeDoc = await getDoc(targetSwipeRef);
      
      if (targetSwipeDoc.exists()) {
        const data = targetSwipeDoc.data();
        if (data.action === 'like' || data.action === 'super_like') {
          // It's a match! Create match record
          await this.createMatch(userId, targetUserId);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[SwipeService] checkForMatch error:', error);
      return false;
    }
  }

  /**
   * Create a match record
   */
  private async createMatch(userId1: string, userId2: string): Promise<void> {
    try {
      const matchId = [userId1, userId2].sort().join('_');
      const matchRef = doc(db, 'matches', matchId);

      const matchData = {
        users: [userId1, userId2],
        createdAt: serverTimestamp(),
        status: 'active',
        freeMessagesRemaining: 6, // PACK 271 logic
        chatExpired: false,
      };

      await setDoc(matchRef, matchData);

      // Update both users' match lists
      await Promise.all([
        this.addToUserMatches(userId1, userId2, matchId),
        this.addToUserMatches(userId2, userId1, matchId),
      ]);
    } catch (error) {
      console.error('[SwipeService] createMatch error:', error);
      throw error;
    }
  }

  /**
   * Add match to user's match list
   */
  private async addToUserMatches(
    userId: string,
    matchedUserId: string,
    matchId: string
  ): Promise<void> {
    const userMatchRef = doc(db, 'users', userId, 'matches', matchedUserId);
    await setDoc(userMatchRef, {
      matchId,
      matchedUserId,
      matchedAt: serverTimestamp(),
      unread: true,
      lastMessageAt: null,
    });
  }

  /**
   * Get swipe history for user
   */
  async getSwipeHistory(
    userId: string,
    limit: number = 50
  ): Promise<SwipeHistoryEntry[]> {
    try {
      const historyQuery = query(
        collection(db, 'users', userId, 'swipe', 'history', 'swipes'),
        where('swipedAt', '>', Timestamp.fromDate(new Date(Date.now() - 30 * 86400000)))
      );

      const snapshot = await getDocs(historyQuery);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          targetUserId: data.targetUserId,
          action: data.action,
          swipedAt: data.swipedAt.toDate(),
          canShowAgainAt: data.canShowAgainAt.toDate(),
        };
      });
    } catch (error) {
      console.error('[SwipeService] getSwipeHistory error:', error);
      return [];
    }
  }

  /**
   * Check if profile should be hidden due to previous swipe
   */
  async shouldHideProfile(userId: string, targetUserId: string): Promise<boolean> {
    try {
      const historyRef = doc(
        db,
        'users',
        userId,
        'swipe',
        'history',
        'swipes',
        targetUserId
      );

      const historyDoc = await getDoc(historyRef);
      
      if (!historyDoc.exists()) {
        return false;
      }

      const data = historyDoc.data();
      const canShowAgainAt = data.canShowAgainAt.toDate();
      
      return new Date() < canShowAgainAt;
    } catch (error) {
      console.error('[SwipeService] shouldHideProfile error:', error);
      return false;
    }
  }

  /**
   * Schedule profile for return-to-swipe after 48h
   */
  async scheduleReturnToSwipe(
    userId: string,
    targetUserId: string,
    reason: 'chat_expired' | 'messages_refused'
  ): Promise<void> {
    try {
      const returnRef = doc(
        db,
        'users',
        userId,
        'swipe',
        'return_queue',
        targetUserId
      );

      const returnAt = new Date(Date.now() + SWIPE_LIMITS.RETURN_COOLDOWN_MS);

      await setDoc(returnRef, {
        targetUserId,
        scheduledAt: serverTimestamp(),
        returnAt: Timestamp.fromDate(returnAt),
        reason,
        processed: false,
      });
    } catch (error) {
      console.error('[SwipeService] scheduleReturnToSwipe error:', error);
      throw error;
    }
  }

  /**
   * Calculate next local midnight for reset
   */
  private getNextLocalMidnight(now: Date): Date {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}

// Export singleton instance
export const swipeService = new SwipeService();
