/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Adaptive Growth Throttle Module
 * 
 * Dynamic limits for invites/day, rewards/user, and referral payouts.
 * Limits increase with source's trust score.
 */

import { Firestore, FieldValue } from 'firebase-admin/firestore';
import {
  GrowthThrottleConfig,
  GrowthThrottleEvent,
  Pack441Config,
} from './types';

export class AdaptiveGrowthThrottle {
  private db: Firestore;
  private config: Pack441Config;

  constructor(db: Firestore, config: Pack441Config) {
    this.db = db;
    this.config = config;
  }

  /**
   * Check if user can send an invite
   */
  async canSendInvite(userId: string): Promise<{ allowed: boolean; reason?: string; limit?: number; current?: number }> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCounts = await this.getInviteCounts(userId);

    const dailyAllowed = currentCounts.daily < throttleConfig.limits.invitesPerDay;
    const weeklyAllowed = currentCounts.weekly < throttleConfig.limits.invitesPerWeek;

    if (!dailyAllowed) {
      return {
        allowed: false,
        reason: 'Daily invite limit reached',
        limit: throttleConfig.limits.invitesPerDay,
        current: currentCounts.daily,
      };
    }

    if (!weeklyAllowed) {
      return {
        allowed: false,
        reason: 'Weekly invite limit reached',
        limit: throttleConfig.limits.invitesPerWeek,
        current: currentCounts.weekly,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can claim a reward
   */
  async canClaimReward(userId: string): Promise<{ allowed: boolean; reason?: string; limit?: number; current?: number }> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCount = await this.getRewardCount(userId);

    const allowed = currentCount < throttleConfig.limits.rewardsPerDay;

    if (!allowed) {
      return {
        allowed: false,
        reason: 'Daily reward limit reached',
        limit: throttleConfig.limits.rewardsPerDay,
        current: currentCount,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if referral payout can be processed
   */
  async canProcessPayout(userId: string): Promise<{ allowed: boolean; reason?: string; limit?: number; current?: number }> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCount = await this.getPayoutCount(userId);

    const allowed = currentCount < throttleConfig.limits.referralPayoutsPerMonth;

    if (!allowed) {
      return {
        allowed: false,
        reason: 'Monthly payout limit reached',
        limit: throttleConfig.limits.referralPayoutsPerMonth,
        current: currentCount,
      };
    }

    return { allowed: true };
  }

  /**
   * Record an invite event
   */
  async recordInviteEvent(userId: string, blocked: boolean = false, reason?: string): Promise<void> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCounts = await this.getInviteCounts(userId);

    const event: GrowthThrottleEvent = {
      userId,
      eventType: 'invite_sent',
      blocked,
      reason,
      currentCount: currentCounts.daily,
      limit: throttleConfig.limits.invitesPerDay,
      timestamp: new Date(),
      windowStart: this.getDayStart(),
      windowEnd: this.getDayEnd(),
    };

    await this.storeThrottleEvent(event);

    if (!blocked) {
      await this.incrementInviteCount(userId);
    }
  }

  /**
   * Record a reward claim event
   */
  async recordRewardEvent(userId: string, blocked: boolean = false, reason?: string): Promise<void> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCount = await this.getRewardCount(userId);

    const event: GrowthThrottleEvent = {
      userId,
      eventType: 'reward_claimed',
      blocked,
      reason,
      currentCount,
      limit: throttleConfig.limits.rewardsPerDay,
      timestamp: new Date(),
      windowStart: this.getDayStart(),
      windowEnd: this.getDayEnd(),
    };

    await this.storeThrottleEvent(event);

    if (!blocked) {
      await this.incrementRewardCount(userId);
    }
  }

  /**
   * Record a payout event
   */
  async recordPayoutEvent(userId: string, blocked: boolean = false, reason?: string): Promise<void> {
    const throttleConfig = await this.getOrCreateThrottleConfig(userId);
    const currentCount = await this.getPayoutCount(userId);

    const event: GrowthThrottleEvent = {
      userId,
      eventType: 'referral_payout',
      blocked,
      reason,
      currentCount,
      limit: throttleConfig.limits.referralPayoutsPerMonth,
      timestamp: new Date(),
      windowStart: this.getMonthStart(),
      windowEnd: this.getMonthEnd(),
    };

    await this.storeThrottleEvent(event);

    if (!blocked) {
      await this.incrementPayoutCount(userId);
    }
  }

  /**
   * Get or create throttle configuration for user
   */
  private async getOrCreateThrottleConfig(userId: string): Promise<GrowthThrottleConfig> {
    const doc = await this.db.collection('pack441_throttle_configs').doc(userId).get();

    if (doc.exists) {
      return doc.data() as GrowthThrottleConfig;
    }

    // Create default config
    const trustScore = await this.getTrustScore(userId);
    const config = this.calculateLimitsFromTrustScore(userId, trustScore);

    await this.db.collection('pack441_throttle_configs').doc(userId).set(config);

    return config;
  }

  /**
   * Calculate limits based on trust score
   */
  private calculateLimitsFromTrustScore(userId: string, trustScore: number): GrowthThrottleConfig {
    const { defaultLimits, trustScoreScaling } = this.config.throttling;

    if (!trustScoreScaling) {
      return {
        userId,
        trustScore,
        limits: { ...defaultLimits },
        dynamic: false,
        lastUpdated: new Date(),
      };
    }

    // Scale limits based on trust score (0-100)
    // Trust score of 100 = 2x limits
    // Trust score of 50 = 1x limits (default)
    // Trust score of 0 = 0.5x limits
    const scaleFactor = 0.5 + (trustScore / 100);

    return {
      userId,
      trustScore,
      limits: {
        invitesPerDay: Math.floor(defaultLimits.invitesPerDay * scaleFactor),
        invitesPerWeek: Math.floor(defaultLimits.invitesPerWeek * scaleFactor),
        rewardsPerDay: Math.floor(defaultLimits.rewardsPerDay * scaleFactor),
        referralPayoutsPerMonth: Math.floor(defaultLimits.referralPayoutsPerMonth * scaleFactor),
      },
      dynamic: true,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get user's trust score
   */
  private async getTrustScore(userId: string): Promise<number> {
    const doc = await this.db.collection('pack441_trust_scores').doc(userId).get();
    return doc.exists ? doc.data()?.currentScore || 100 : 100;
  }

  /**
   * Get invite counts for user
   */
  private async getInviteCounts(userId: string): Promise<{ daily: number; weekly: number }> {
    const doc = await this.db.collection('pack441_throttle_counters').doc(userId).get();

    if (!doc.exists) {
      return { daily: 0, weekly: 0 };
    }

    const data = doc.data();
    const now = new Date();

    // Check if counters need reset
    const dailyReset = this.needsDailyReset(data?.dailyResetAt?.toDate());
    const weeklyReset = this.needsWeeklyReset(data?.weeklyResetAt?.toDate());

    if (dailyReset || weeklyReset) {
      await this.resetCounters(userId, dailyReset, weeklyReset);
      return {
        daily: dailyReset ? 0 : data?.dailyInvites || 0,
        weekly: weeklyReset ? 0 : data?.weeklyInvites || 0,
      };
    }

    return {
      daily: data?.dailyInvites || 0,
      weekly: data?.weeklyInvites || 0,
    };
  }

  /**
   * Get reward count for user
   */
  private async getRewardCount(userId: string): Promise<number> {
    const doc = await this.db.collection('pack441_throttle_counters').doc(userId).get();

    if (!doc.exists) {
      return 0;
    }

    const data = doc.data();

    // Check if counter needs reset
    if (this.needsDailyReset(data?.dailyResetAt?.toDate())) {
      await this.resetCounters(userId, true, false);
      return 0;
    }

    return data?.dailyRewards || 0;
  }

  /**
   * Get payout count for user
   */
  private async getPayoutCount(userId: string): Promise<number> {
    const doc = await this.db.collection('pack441_throttle_counters').doc(userId).get();

    if (!doc.exists) {
      return 0;
    }

    const data = doc.data();

    // Check if counter needs reset
    if (this.needsMonthlyReset(data?.monthlyResetAt?.toDate())) {
      await this.resetCounters(userId, false, false, true);
      return 0;
    }

    return data?.monthlyPayouts || 0;
  }

  /**
   * Increment invite count
   */
  private async incrementInviteCount(userId: string): Promise<void> {
    const docRef = this.db.collection('pack441_throttle_counters').doc(userId);
    
    await docRef.set({
      userId,
      dailyInvites: FieldValue.increment(1),
      weeklyInvites: FieldValue.increment(1),
      dailyResetAt: this.getDayEnd(),
      weeklyResetAt: this.getWeekEnd(),
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  /**
   * Increment reward count
   */
  private async incrementRewardCount(userId: string): Promise<void> {
    const docRef = this.db.collection('pack441_throttle_counters').doc(userId);
    
    await docRef.set({
      userId,
      dailyRewards: FieldValue.increment(1),
      dailyResetAt: this.getDayEnd(),
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  /**
   * Increment payout count
   */
  private async incrementPayoutCount(userId: string): Promise<void> {
    const docRef = this.db.collection('pack441_throttle_counters').doc(userId);
    
    await docRef.set({
      userId,
      monthlyPayouts: FieldValue.increment(1),
      monthlyResetAt: this.getMonthEnd(),
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  /**
   * Reset counters
   */
  private async resetCounters(
    userId: string,
    resetDaily: boolean,
    resetWeekly: boolean,
    resetMonthly: boolean = false
  ): Promise<void> {
    const updates: any = {
      lastUpdated: FieldValue.serverTimestamp(),
    };

    if (resetDaily) {
      updates.dailyInvites = 0;
      updates.dailyRewards = 0;
      updates.dailyResetAt = this.getDayEnd();
    }

    if (resetWeekly) {
      updates.weeklyInvites = 0;
      updates.weeklyResetAt = this.getWeekEnd();
    }

    if (resetMonthly) {
      updates.monthlyPayouts = 0;
      updates.monthlyResetAt = this.getMonthEnd();
    }

    await this.db.collection('pack441_throttle_counters').doc(userId).set(updates, { merge: true });
  }

  /**
   * Check if daily reset is needed
   */
  private needsDailyReset(resetAt?: Date): boolean {
    if (!resetAt) return true;
    return new Date() >= resetAt;
  }

  /**
   * Check if weekly reset is needed
   */
  private needsWeeklyReset(resetAt?: Date): boolean {
    if (!resetAt) return true;
    return new Date() >= resetAt;
  }

  /**
   * Check if monthly reset is needed
   */
  private needsMonthlyReset(resetAt?: Date): boolean {
    if (!resetAt) return true;
    return new Date() >= resetAt;
  }

  /**
   * Get day start timestamp
   */
  private getDayStart(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  /**
   * Get day end timestamp
   */
  private getDayEnd(): Date {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now;
  }

  /**
   * Get week end timestamp
   */
  private getWeekEnd(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = 7 - dayOfWeek;
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + daysUntilSunday);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  }

  /**
   * Get month start timestamp
   */
  private getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Get month end timestamp
   */
  private getMonthEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  /**
   * Store throttle event
   */
  private async storeThrottleEvent(event: GrowthThrottleEvent): Promise<void> {
    await this.db.collection('pack441_throttle_events').add({
      ...event,
      timestamp: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Update throttle configuration (manual or triggered by trust score change)
   */
  async updateThrottleConfig(userId: string): Promise<GrowthThrottleConfig> {
    const trustScore = await this.getTrustScore(userId);
    const newConfig = this.calculateLimitsFromTrustScore(userId, trustScore);

    await this.db.collection('pack441_throttle_configs').doc(userId).set(newConfig);

    return newConfig;
  }

  /**
   * Get user's throttle configuration
   */
  async getThrottleConfig(userId: string): Promise<GrowthThrottleConfig | null> {
    const doc = await this.db.collection('pack441_throttle_configs').doc(userId).get();
    return doc.exists ? (doc.data() as GrowthThrottleConfig) : null;
  }

  /**
   * Get user's throttle events
   */
  async getThrottleEvents(
    userId: string,
    eventType?: 'invite_sent' | 'reward_claimed' | 'referral_payout',
    limit: number = 100
  ): Promise<GrowthThrottleEvent[]> {
    let query: any = this.db
      .collection('pack441_throttle_events')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (eventType) {
      query = query.where('eventType', '==', eventType);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as GrowthThrottleEvent);
  }

  /**
   * Get blocked events count (for monitoring)
   */
  async getBlockedEventsCount(
    userId: string,
    since?: Date
  ): Promise<{ total: number; byType: Record<string, number> }> {
    let query: any = this.db
      .collection('pack441_throttle_events')
      .where('userId', '==', userId)
      .where('blocked', '==', true);

    if (since) {
      query = query.where('timestamp', '>=', since);
    }

    const snapshot = await query.get();

    const byType: Record<string, number> = {};
    snapshot.forEach((doc) => {
      const eventType = doc.data().eventType;
      byType[eventType] = (byType[eventType] || 0) + 1;
    });

    return {
      total: snapshot.size,
      byType,
    };
  }
}
