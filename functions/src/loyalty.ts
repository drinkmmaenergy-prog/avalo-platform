/**
 * Loyalty & Ranking System (Phase 10)
 *
 * Features:
 * - Points accumulation based on transactions
 * - User levels (Bronze, Silver, Gold, Platinum, Diamond)
 * - Badges for achievements
 * - Rankings (daily, weekly, monthly, all-time)
 *
 * Callable functions:
 * - claimReward: User claims a loyalty reward
 * - getUserLoyalty: Get user's loyalty stats
 *
 * Triggered functions:
 * - awardPointsOnTx: Trigger on transaction creation
 *
 * Scheduled functions:
 * - rebuildRankingsScheduler: Rebuild rankings every 24h
 *
 * Firestore collections:
 * - users/{uid}/loyalty/{docId} - User loyalty data
 * - rankings/{period} - Rankings by period
 */

import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
;
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
const logAnalyticsEvent = (eventName: string, properties: any) => {
  return logServerEvent(eventName, properties, properties.userId || "system");
};

const db = getFirestore();

/**
 * User levels
 */
export enum UserLevel {
  BRONZE = "bronze",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
  DIAMOND = "diamond",
}

/**
 * Badge types
 */
export enum BadgeType {
  EARLY_ADOPTER = "early_adopter",
  VERIFIED = "verified",
  TOP_EARNER = "top_earner",
  TOP_SPENDER = "top_spender",
  SOCIAL_BUTTERFLY = "social_butterfly", // Many matches
  GENEROUS = "generous", // Many tips sent
  POPULAR = "popular", // Many profile views
  STREAMER = "streamer", // Live stream hours
}

/**
 * Loyalty document
 */
export interface UserLoyalty {
  userId: string;
  points: number; // Total points accumulated
  level: UserLevel;
  badges: BadgeType[];

  // Stats for ranking
  tokensSpent: number;
  tokensEarned: number;
  messagesCount: number;
  tipsGiven: number;
  tipsReceived: number;
  liveMinutes: number; // Minutes streamed/watched

  // Rewards
  rewardsClaimedCount: number;
  lastRewardClaim?: Timestamp | FieldValue;

  updatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

/**
 * Ranking period
 */
export enum RankingPeriod {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  ALL_TIME = "all_time",
}

/**
 * Ranking entry
 */
export interface RankingEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  score: number; // Points or tokens
  rank: number;
  level: UserLevel;
  badges: BadgeType[];
}

/**
 * Ranking document (one per period)
 */
export interface Ranking {
  period: RankingPeriod;
  periodKey: string; // e.g., "2025-01-20" for daily, "2025-W04" for weekly
  topEarners: RankingEntry[];
  topSpenders: RankingEntry[];
  topSocializers: RankingEntry[];
  lastUpdated: Timestamp | FieldValue;
}

/**
 * Points configuration
 */
const POINTS_CONFIG = {
  TOKEN_SPENT: 1, // 1 point per token spent
  TOKEN_EARNED: 2, // 2 points per token earned (incentivize earning)
  MESSAGE_SENT: 5, // 5 points per message
  TIP_SENT: 10, // 10 points per tip
  TIP_RECEIVED: 15, // 15 points per tip received
  LIVE_MINUTE: 20, // 20 points per minute live
  MATCH: 50, // 50 points per new match
  PROFILE_COMPLETE: 100, // One-time bonus
};

/**
 * Level thresholds
 */
const LEVEL_THRESHOLDS = {
  [UserLevel.BRONZE]: 0,
  [UserLevel.SILVER]: 1000,
  [UserLevel.GOLD]: 5000,
  [UserLevel.PLATINUM]: 25000,
  [UserLevel.DIAMOND]: 100000,
};

/**
 * Rewards by level
 */
const LEVEL_REWARDS = {
  [UserLevel.BRONZE]: 0,
  [UserLevel.SILVER]: 100, // 100 tokens
  [UserLevel.GOLD]: 500,
  [UserLevel.PLATINUM]: 2000,
  [UserLevel.DIAMOND]: 10000,
};

/**
 * Trigger: Award points when transaction is created
 */
export const awardPointsOnTx = onDocumentCreated(
  {
    document: "transactions/{txId}",
    region: "europe-west3",
  },
  async (event) => {
    const tx = event.data?.data();
    if (!tx) return;

    const userId = tx.uid;
    const type = tx.type;
    const amount = Math.abs(tx.amount || 0);

    let pointsToAward = 0;

    // Calculate points based on transaction type
    if (type === "chat_message" || type === "ai_message") {
      pointsToAward = POINTS_CONFIG.MESSAGE_SENT;
    } else if (type === "tip_sent" || type === "live_tip") {
      pointsToAward = POINTS_CONFIG.TIP_SENT + (amount * POINTS_CONFIG.TOKEN_SPENT);
    } else if (type === "tip_received" || type === "live_tip_received") {
      pointsToAward = POINTS_CONFIG.TIP_RECEIVED + (amount * POINTS_CONFIG.TOKEN_EARNED);
    } else if (type === "chat_payment") {
      pointsToAward = amount * POINTS_CONFIG.TOKEN_SPENT;
    } else if (type === "chat_earned") {
      pointsToAward = amount * POINTS_CONFIG.TOKEN_EARNED;
    } else if (type === "live_1on1_tick") {
      pointsToAward = Math.floor(amount * POINTS_CONFIG.TOKEN_SPENT);
    }

    if (pointsToAward > 0) {
      await awardPoints(userId, pointsToAward, type);
    }
  }
);

/**
 * Helper: Award points to a user
 */
async function awardPoints(userId: string, points: number, reason: string): Promise<void> {
  const loyaltyRef = db.collection("users").doc(userId).collection("loyalty").doc("stats");

  await db.runTransaction(async (tx) => {
    const loyaltyDoc = await tx.get(loyaltyRef);
    const loyalty = loyaltyDoc.data() as UserLoyalty || {
      userId,
      points: 0,
      level: UserLevel.BRONZE,
      badges: [],
      tokensSpent: 0,
      tokensEarned: 0,
      messagesCount: 0,
      tipsGiven: 0,
      tipsReceived: 0,
      liveMinutes: 0,
      rewardsClaimedCount: 0,
    };

    const newPoints = (loyalty.points || 0) + points;
    const newLevel = calculateLevel(newPoints);

    // Update stats based on reason
    const updates: any = {
      userId,
      points: newPoints,
      level: newLevel,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!loyaltyDoc.exists) {
      updates.createdAt = FieldValue.serverTimestamp();
      updates.badges = [];
      updates.rewardsClaimedCount = 0;
    }

    // Increment specific stats
    if (reason.includes("message")) {
      updates.messagesCount = FieldValue.increment(1);
    }
    if (reason.includes("tip_sent") || reason.includes("live_tip")) {
      updates.tipsGiven = FieldValue.increment(1);
    }
    if (reason.includes("tip_received")) {
      updates.tipsReceived = FieldValue.increment(1);
    }
    if (reason.includes("spent") || reason.includes("payment")) {
      updates.tokensSpent = FieldValue.increment(points / POINTS_CONFIG.TOKEN_SPENT);
    }
    if (reason.includes("earned")) {
      updates.tokensEarned = FieldValue.increment(points / POINTS_CONFIG.TOKEN_EARNED);
    }

    tx.set(loyaltyRef, updates, { merge: true });
  });

  console.log(`Awarded ${points} points to user ${userId} for ${reason}`);
}

/**
 * Helper: Calculate user level based on points
 */
function calculateLevel(points: number): UserLevel {
  if (points >= LEVEL_THRESHOLDS[UserLevel.DIAMOND]) return UserLevel.DIAMOND;
  if (points >= LEVEL_THRESHOLDS[UserLevel.PLATINUM]) return UserLevel.PLATINUM;
  if (points >= LEVEL_THRESHOLDS[UserLevel.GOLD]) return UserLevel.GOLD;
  if (points >= LEVEL_THRESHOLDS[UserLevel.SILVER]) return UserLevel.SILVER;
  return UserLevel.BRONZE;
}

/**
 * Claim a loyalty reward (level-up bonus)
 */
export const claimRewardCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const loyaltyRef = db.collection("users").doc(uid).collection("loyalty").doc("stats");
      const loyaltyDoc = await loyaltyRef.get();

      if (!loyaltyDoc.exists) {
        throw new HttpsError("not-found", "No loyalty data found");
      }

      const loyalty = loyaltyDoc.data() as UserLoyalty;
      const level = loyalty.level;
      const rewardAmount = LEVEL_REWARDS[level];

      // Check if already claimed for this level
      const lastClaim = loyalty.lastRewardClaim as Timestamp | undefined;
      const rewardsClaimedCount = loyalty.rewardsClaimedCount || 0;

      // Simple check: Only allow claiming once per level
      // More sophisticated: Track which levels have been claimed
      if (rewardsClaimedCount >= Object.keys(UserLevel).indexOf(level) + 1) {
        throw new HttpsError("failed-precondition", "Reward already claimed for this level");
      }

      // Credit user wallet
      const userRef = db.collection("users").doc(uid);
      await db.runTransaction(async (tx) => {
        tx.update(userRef, {
          "wallet.balance": FieldValue.increment(rewardAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.update(loyaltyRef, {
          rewardsClaimedCount: FieldValue.increment(1),
          lastRewardClaim: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create transaction record
        const txId = `tx_reward_${Date.now()}_${uid.substring(0, 8)}`;
        tx.set(db.collection("transactions").doc(txId), {
          txId,
          type: "loyalty_reward",
          uid,
          amount: rewardAmount,
          level,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      logAnalyticsEvent("loyalty_reward_claimed", {
        userId: uid,
        level,
        rewardAmount,
      });

      return {
        success: true,
        rewardAmount,
        level,
      };
    } catch (error: any) {
      console.error("Error claiming reward:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to claim reward");
    }
  }
);

/**
 * Get user loyalty stats
 */
export const getUserLoyaltyCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { targetUserId } = request.data as { targetUserId?: string };
    const userId = targetUserId || uid; // Allow checking other users

    try {
      const loyaltyRef = db.collection("users").doc(userId).collection("loyalty").doc("stats");
      const loyaltyDoc = await loyaltyRef.get();

      if (!loyaltyDoc.exists) {
        // Return default loyalty data
        return {
          userId,
          points: 0,
          level: UserLevel.BRONZE,
          badges: [],
          tokensSpent: 0,
          tokensEarned: 0,
          messagesCount: 0,
          tipsGiven: 0,
          tipsReceived: 0,
          liveMinutes: 0,
          rewardsClaimedCount: 0,
        };
      }

      return loyaltyDoc.data();
    } catch (error: any) {
      console.error("Error getting loyalty:", error);
      throw new HttpsError("internal", "Failed to get loyalty data");
    }
  }
);

/**
 * Scheduled: Rebuild rankings every 24 hours
 */
export const rebuildRankingsScheduler = onSchedule(
  {
    schedule: "0 2 * * *", // Every day at 2 AM UTC
    region: "europe-west3",
    timeoutSeconds: 540, // 9 minutes
  },
  async (event) => {
    console.log("Rebuilding rankings...");

    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0]; // "2025-01-20"
      const weekNum = getWeekNumber(now);
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Build rankings for each period
      await buildRankingForPeriod(RankingPeriod.DAILY, today);
      await buildRankingForPeriod(RankingPeriod.WEEKLY, `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`);
      await buildRankingForPeriod(RankingPeriod.MONTHLY, month);
      await buildRankingForPeriod(RankingPeriod.ALL_TIME, "all");

      console.log("Rankings rebuilt successfully");
    } catch (error) {
      console.error("Error rebuilding rankings:", error);
    }
  }
);

/**
 * Helper: Build ranking for a specific period
 */
async function buildRankingForPeriod(period: RankingPeriod, periodKey: string): Promise<void> {
  // Get all users with loyalty data
  const usersSnapshot = await db.collectionGroup("loyalty").get();

  const users: any[] = [];
  for (const doc of usersSnapshot.docs) {
    const loyalty = doc.data() as UserLoyalty;
    const userId = loyalty.userId;

    // Get user profile
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData) {
      users.push({
        userId,
        userName: userData.name || "Anonymous",
        userAvatar: userData.photos?.[0],
        loyalty,
      });
    }
  }

  // Sort by tokensEarned (top earners)
  const topEarners = users
    .sort((a, b) => b.loyalty.tokensEarned - a.loyalty.tokensEarned)
    .slice(0, 100)
    .map((user, index) => ({
      userId: user.userId,
      userName: user.userName,
      userAvatar: user.userAvatar,
      score: user.loyalty.tokensEarned,
      rank: index + 1,
      level: user.loyalty.level,
      badges: user.loyalty.badges || [],
    }));

  // Sort by tokensSpent (top spenders)
  const topSpenders = users
    .sort((a, b) => b.loyalty.tokensSpent - a.loyalty.tokensSpent)
    .slice(0, 100)
    .map((user, index) => ({
      userId: user.userId,
      userName: user.userName,
      userAvatar: user.userAvatar,
      score: user.loyalty.tokensSpent,
      rank: index + 1,
      level: user.loyalty.level,
      badges: user.loyalty.badges || [],
    }));

  // Sort by points (top socializers)
  const topSocializers = users
    .sort((a, b) => b.loyalty.points - a.loyalty.points)
    .slice(0, 100)
    .map((user, index) => ({
      userId: user.userId,
      userName: user.userName,
      userAvatar: user.userAvatar,
      score: user.loyalty.points,
      rank: index + 1,
      level: user.loyalty.level,
      badges: user.loyalty.badges || [],
    }));

  // Save ranking
  const rankingRef = db.collection("rankings").doc(`${period}_${periodKey}`);
  const ranking: Ranking = {
    period,
    periodKey,
    topEarners,
    topSpenders,
    topSocializers,
    lastUpdated: FieldValue.serverTimestamp(),
  };

  await rankingRef.set(ranking);

  console.log(`Ranking built for ${period} (${periodKey})`);
}

/**
 * Helper: Get week number of the year
 */
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Get rankings for a period
 */
export const getRankingsCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { period, periodKey } = request.data as {
      period: RankingPeriod;
      periodKey?: string;
    };

    if (!period) {
      throw new HttpsError("invalid-argument", "Missing period");
    }

    try {
      // If no periodKey, use current period
      let key = periodKey;
      if (!key) {
        const now = new Date();
        if (period === RankingPeriod.DAILY) {
          key = now.toISOString().split("T")[0];
        } else if (period === RankingPeriod.WEEKLY) {
          const weekNum = getWeekNumber(now);
          key = `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        } else if (period === RankingPeriod.MONTHLY) {
          key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        } else {
          key = "all";
        }
      }

      const rankingDoc = await db.collection("rankings").doc(`${period}_${key}`).get();

      if (!rankingDoc.exists) {
        return {
          period,
          periodKey: key,
          topEarners: [],
          topSpenders: [],
          topSocializers: [],
          lastUpdated: null,
        };
      }

      return rankingDoc.data();
    } catch (error: any) {
      console.error("Error getting rankings:", error);
      throw new HttpsError("internal", "Failed to get rankings");
    }
  }
);


