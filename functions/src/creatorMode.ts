/**
 * ========================================================================
 * AVALO CREATOR MODE & MONETIZATION
 * ========================================================================
 *
 * Complete creator monetization system
 *
 * Features:
 * - Creator dashboard with analytics
 * - Gated posts (paid unlock)
 * - Paid stories
 * - Pay-per-message pricing
 * - Referral system with rewards
 * - Withdrawal management
 * - Revenue tracking
 * - Fan management
 *
 * Revenue Streams:
 * - Chat earnings (word-based)
 * - Gated content unlocks
 * - Story unlocks
 * - Tips/gifts
 * - Subscriptions (future)
 * - Referral bonuses
 *
 * @version 3.0.0
 * @module creatorMode
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
;

const db = getFirestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

// Revenue splits
const REVENUE_SPLITS = {
  chatMessages: { creator: 0.65, platform: 0.35 },
  gatedContent: { creator: 0.80, platform: 0.20 },
  tips: { creator: 0.90, platform: 0.10 },
  subscriptions: { creator: 0.70, platform: 0.30 },
};

// Creator minimums
const CREATOR_REQUIREMENTS = {
  minFollowers: 100,
  minVerificationScore: 70,
  minAge: 18,
};

// Withdrawal settings
const WITHDRAWAL_SETTINGS = {
  minAmount: 500, // tokens (minimum to cash out)
  maxAmount: 50000, // tokens per transaction
  processingTime: "2-5 business days",
  feePercent: 0.02, // 2% processing fee
};

// Referral rewards
const REFERRAL_REWARDS = {
  referrer: 100, // tokens when referee makes first purchase
  referee: 50, // tokens welcome bonus
};

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorStats {
  userId: string;
  totalRevenue: number; // All-time tokens earned
  monthlyRevenue: number;
  weeklyRevenue: number;
  todayRevenue: number;

  fanCount: number;
  topFans: Array<{ userId: string; spent: number }>;

  contentStats: {
    totalPosts: number;
    gatedPosts: number;
    totalUnlocks: number;
    avgUnlockPrice: number;
  };

  chatStats: {
    activeChats: number;
    totalMessages: number;
    avgResponseTime: number; // minutes
    satisfactionScore: number; // 0-100
  };

  withdrawalStats: {
    totalWithdrawn: number;
    pendingWithdrawal: number;
    availableBalance: number;
  };

  referralStats: {
    totalReferrals: number;
    activeReferrals: number;
    referralRevenue: number;
  };

  lastUpdated: Timestamp;
}

export interface GatedPost {
  postId: string;
  creatorId: string;
  unlockPrice: number;
  unlockedBy: string[]; // User IDs who unlocked
  unlockCount: number;
  revenue: number;
  createdAt: Timestamp;
}

export interface CreatorWithdrawal {
  id: string;
  creatorId: string;
  amount: number; // tokens
  feeAmount: number;
  netAmount: number;
  method: "bank_transfer" | "crypto" | "paypal";
  status: "pending" | "processing" | "completed" | "rejected";
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  transactionId?: string;
  notes?: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  refereeId: string;
  referralCode: string;
  status: "pending" | "activated" | "rewarded";
  rewardPaid: boolean;
  refereeFirstPurchase?: Timestamp;
  rewardedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// CREATOR ENABLEMENT
// ============================================================================

/**
 * Enable creator mode for user
 */
export const enableCreatorModeV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      // Get user profile
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData) {
        throw new HttpsError("not-found", "User profile not found");
      }

      // Check requirements
      const followerCount = userData.socialStats?.followers || 0;
      const verificationScore = userData.verification?.score || 0;
      const age = userData.age || 0;

      const errors: string[] = [];

      if (followerCount < CREATOR_REQUIREMENTS.minFollowers) {
        errors.push(`Need ${CREATOR_REQUIREMENTS.minFollowers} followers (have ${followerCount})`);
      }

      if (verificationScore < CREATOR_REQUIREMENTS.minVerificationScore) {
        errors.push(`Verification score must be ${CREATOR_REQUIREMENTS.minVerificationScore}+ (have ${verificationScore})`);
      }

      if (age < CREATOR_REQUIREMENTS.minAge) {
        errors.push(`Must be ${CREATOR_REQUIREMENTS.minAge}+ years old`);
      }

      if (errors.length > 0) {
        throw new HttpsError(
          "failed-precondition",
          `Creator requirements not met: ${errors.join(", ")}`
        );
      }

      // Enable creator mode
      await userDoc.ref.update({
        "roles.creator": true,
        "creatorMode.enabled": true,
        "creatorMode.enabledAt": FieldValue.serverTimestamp(),
      });

      // Initialize creator stats
      await db.collection("creator_stats").doc(uid).set({
        userId: uid,
        totalRevenue: 0,
        monthlyRevenue: 0,
        weeklyRevenue: 0,
        todayRevenue: 0,
        fanCount: 0,
        topFans: [],
        contentStats: {
          totalPosts: 0,
          gatedPosts: 0,
          totalUnlocks: 0,
          avgUnlockPrice: 0,
        },
        chatStats: {
          activeChats: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          satisfactionScore: 100,
        },
        withdrawalStats: {
          totalWithdrawn: 0,
          pendingWithdrawal: 0,
          availableBalance: 0,
        },
        referralStats: {
          totalReferrals: 0,
          activeReferrals: 0,
          referralRevenue: 0,
        },
        lastUpdated: FieldValue.serverTimestamp(),
      } as CreatorStats);

      logger.info(`Creator mode enabled for ${uid}`);

      return {
        success: true,
        message: "Creator mode activated!",
      };
    } catch (error: any) {
      logger.error("Failed to enable creator mode:", error);
      throw new HttpsError("internal", "Failed to enable creator mode");
    }
  }
);

// ============================================================================
// CREATOR DASHBOARD
// ============================================================================

/**
 * Get creator dashboard analytics
 */
export const getCreatorDashboardV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      // Verify creator status
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.data()?.roles?.creator) {
        throw new HttpsError("failed-precondition", "Creator mode not enabled");
      }

      // Get creator stats
      const statsDoc = await db.collection("creator_stats").doc(uid).get();
      const stats = statsDoc.data() as CreatorStats;

      if (!stats) {
        throw new HttpsError("not-found", "Creator stats not found");
      }

      // Get recent revenue data (last 30 days)
      const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const revenueSnapshot = await db
        .collection("transactions")
        .where("creatorId", "==", uid)
        .where("createdAt", ">=", thirtyDaysAgo)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const revenueByDay: Record<string, number> = {};
      revenueSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const date = new Date(data.createdAt?.toMillis()).toISOString().split("T")[0];
        revenueByDay[date] = (revenueByDay[date] || 0) + (data.creatorShare || 0);
      });

      // Get top posts
      const topPosts = await db
        .collection("posts")
        .where("userId", "==", uid)
        .orderBy("unlockCount", "desc")
        .limit(10)
        .get();

      return {
        success: true,
        stats,
        revenueByDay,
        topPosts: topPosts.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })),
      };
    } catch (error: any) {
      logger.error("Failed to get creator dashboard:", error);
      throw new HttpsError("internal", "Failed to get dashboard");
    }
  }
);

// ============================================================================
// GATED CONTENT
// ============================================================================

/**
 * Create gated post
 */
export const createGatedPostV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const schema = z.object({
      content: z.string().min(1).max(2000),
      mediaUrls: z.array(z.string()).max(5).optional(),
      unlockPrice: z.number().min(5).max(1000),
      isGated: z.boolean().default(true),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { content, mediaUrls, unlockPrice, isGated } = validation.data;

    try {
      // Verify creator status
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.data()?.roles?.creator) {
        throw new HttpsError("failed-precondition", "Creator mode required");
      }

      // Create post
      const postRef = db.collection("posts").doc();
      await postRef.set({
        postId: postRef.id,
        userId: uid,
        content,
        mediaUrls: mediaUrls || [],
        isGated,
        unlockPrice: isGated ? unlockPrice : undefined,
        unlockedBy: [],
        unlockCount: 0,
        revenue: 0,
        likes: 0,
        comments: 0,
        views: 0,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Update creator stats
      await db.collection("creator_stats").doc(uid).update({
        "contentStats.totalPosts": FieldValue.increment(1),
        "contentStats.gatedPosts": isGated ? FieldValue.increment(1) : FieldValue.increment(0),
      });

      logger.info(`Gated post created by ${uid}: ${postRef.id}`);

      return {
        success: true,
        postId: postRef.id,
      };
    } catch (error: any) {
      logger.error("Failed to create gated post:", error);
      throw new HttpsError("internal", "Failed to create post");
    }
  }
);

/**
 * Unlock gated post
 */
export const unlockGatedPostV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { postId } = request.data;

    if (!postId) {
      throw new HttpsError("invalid-argument", "Post ID required");
    }

    try {
      const postDoc = await db.collection("posts").doc(postId).get();

      if (!postDoc.exists) {
        throw new HttpsError("not-found", "Post not found");
      }

      const post = postDoc.data();

      // Check if already unlocked
      if (post?.unlockedBy?.includes(uid)) {
        return {
          success: true,
          alreadyUnlocked: true,
          content: post.content,
          mediaUrls: post.mediaUrls,
        };
      }

      // Verify it's gated
      if (!post?.isGated) {
        return {
          success: true,
          alreadyUnlocked: true,
          content: post.content,
          mediaUrls: post.mediaUrls,
        };
      }

      const unlockPrice = post.unlockPrice || 10;
      const creatorId = post.userId;

      // Check token balance
      const userDoc = await db.collection("users").doc(uid).get();
      const userTokens = userDoc.data()?.tokens || 0;

      if (userTokens < unlockPrice) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient balance. Need ${unlockPrice} tokens.`
        );
      }

      // Process unlock
      await db.runTransaction(async (transaction) => {
        const creatorShare = Math.floor(unlockPrice * REVENUE_SPLITS.gatedContent.creator);
        const platformFee = unlockPrice - creatorShare;

        // Deduct from user
        transaction.update(db.collection("users").doc(uid), {
          tokens: FieldValue.increment(-unlockPrice),
        });

        // Credit creator
        transaction.update(db.collection("users").doc(creatorId), {
          tokens: FieldValue.increment(creatorShare),
        });

        // Update post
        transaction.update(postDoc.ref, {
          unlockedBy: FieldValue.arrayUnion(uid),
          unlockCount: FieldValue.increment(1),
          revenue: FieldValue.increment(creatorShare),
        });

        // Record transaction
        transaction.set(db.collection("transactions").doc(), {
          type: "gated_content_unlock",
          userId: uid,
          creatorId,
          amount: unlockPrice,
          creatorShare,
          platformFee,
          metadata: { postId },
          createdAt: FieldValue.serverTimestamp(),
        });

        // Update creator stats
        transaction.update(db.collection("creator_stats").doc(creatorId), {
          totalRevenue: FieldValue.increment(creatorShare),
          todayRevenue: FieldValue.increment(creatorShare),
          "contentStats.totalUnlocks": FieldValue.increment(1),
        });

        // Track fan
        transaction.set(
          db.collection("creator_fans").doc(`${creatorId}_${uid}`),
          {
            creatorId,
            fanId: uid,
            totalSpent: FieldValue.increment(unlockPrice),
            lastPurchase: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      logger.info(`User ${uid} unlocked post ${postId} for ${unlockPrice} tokens`);

      return {
        success: true,
        alreadyUnlocked: false,
        tokensCharged: unlockPrice,
        content: post.content,
        mediaUrls: post.mediaUrls,
      };
    } catch (error: any) {
      logger.error("Failed to unlock gated post:", error);
      throw new HttpsError("internal", "Failed to unlock post");
    }
  }
);

// ============================================================================
// PAY-PER-MESSAGE PRICING
// ============================================================================

/**
 * Set custom message pricing for creator
 */
export const setMessagePricingV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const schema = z.object({
      wordsPerToken: z.number().min(5).max(20).default(11),
      customPricing: z.boolean().default(false),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { wordsPerToken, customPricing } = validation.data;

    try {
      await db.collection("users").doc(uid).update({
        "creatorMode.messagePricing": {
          wordsPerToken,
          customPricing,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });

      logger.info(`Creator ${uid} set message pricing: ${wordsPerToken} words/token`);

      return {
        success: true,
        wordsPerToken,
      };
    } catch (error: any) {
      logger.error("Failed to set message pricing:", error);
      throw new HttpsError("internal", "Failed to set pricing");
    }
  }
);

// ============================================================================
// REFERRAL SYSTEM
// ============================================================================

/**
 * Generate referral code for creator
 */
export const generateReferralCodeV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      // Check if code already exists
      const existingCodeDoc = await db
        .collection("referral_codes")
        .where("creatorId", "==", uid)
        .limit(1)
        .get();

      if (!existingCodeDoc.empty) {
        const code = existingCodeDoc.docs[0].data().code;
        return {
          success: true,
          referralCode: code,
          referralLink: `https://avalo.app/r/${code}`,
        };
      }

      // Generate unique code
      const code = `AVALO${uid.substring(0, 6).toUpperCase()}`;

      await db.collection("referral_codes").doc(code).set({
        code,
        creatorId: uid,
        uses: 0,
        revenue: 0,
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Referral code generated for ${uid}: ${code}`);

      return {
        success: true,
        referralCode: code,
        referralLink: `https://avalo.app/r/${code}`,
      };
    } catch (error: any) {
      logger.error("Failed to generate referral code:", error);
      throw new HttpsError("internal", "Failed to generate code");
    }
  }
);

/**
 * Apply referral code (on signup)
 */
export const applyReferralCodeV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { referralCode } = request.data;

    if (!referralCode) {
      throw new HttpsError("invalid-argument", "Referral code required");
    }

    try {
      // Get referral code
      const codeDoc = await db.collection("referral_codes").doc(referralCode).get();

      if (!codeDoc.exists) {
        throw new HttpsError("not-found", "Invalid referral code");
      }

      const codeData = codeDoc.data();
      const referrerId = codeData?.creatorId;

      // Can't refer yourself
      if (referrerId === uid) {
        throw new HttpsError("invalid-argument", "Cannot use your own referral code");
      }

      // Create referral record
      const referralRef = db.collection("referrals").doc();
      await referralRef.set({
        id: referralRef.id,
        referrerId,
        refereeId: uid,
        referralCode,
        status: "pending",
        rewardPaid: false,
        createdAt: FieldValue.serverTimestamp(),
      } as Referral);

      // Give welcome bonus to referee
      await db.collection("users").doc(uid).update({
        tokens: FieldValue.increment(REFERRAL_REWARDS.referee),
        referredBy: referrerId,
      });

      // Update referral code stats
      await codeDoc.ref.update({
        uses: FieldValue.increment(1),
      });

      logger.info(`Referral applied: ${referrerId} referred ${uid}`);

      return {
        success: true,
        welcomeBonus: REFERRAL_REWARDS.referee,
      };
    } catch (error: any) {
      logger.error("Failed to apply referral code:", error);
      throw new HttpsError("internal", "Failed to apply referral");
    }
  }
);

/**
 * Process referral reward (triggered on first purchase)
 */
export async function processReferralReward(
  userId: string,
  purchaseAmount: number
): Promise<void> {
  try {
    // Check if user was referred
    const userDoc = await db.collection("users").doc(userId).get();
    const referrerId = userDoc.data()?.referredBy;

    if (!referrerId) return;

    // Find referral record
    const referralSnapshot = await db
      .collection("referrals")
      .where("refereeId", "==", userId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (referralSnapshot.empty) return;

    const referralDoc = referralSnapshot.docs[0];

    // Update referral and pay reward
    await db.runTransaction(async (transaction) => {
      // Mark referral as activated and rewarded
      transaction.update(referralDoc.ref, {
        status: "rewarded",
        rewardPaid: true,
        refereeFirstPurchase: FieldValue.serverTimestamp(),
        rewardedAt: FieldValue.serverTimestamp(),
      });

      // Pay referrer
      transaction.update(db.collection("users").doc(referrerId), {
        tokens: FieldValue.increment(REFERRAL_REWARDS.referrer),
      });

      // Update referral stats
      transaction.update(db.collection("creator_stats").doc(referrerId), {
        "referralStats.activeReferrals": FieldValue.increment(1),
        "referralStats.referralRevenue": FieldValue.increment(REFERRAL_REWARDS.referrer),
      });

      // Record transaction
      transaction.set(db.collection("transactions").doc(), {
        type: "referral_bonus",
        userId: referrerId,
        amount: REFERRAL_REWARDS.referrer,
        metadata: {
          refereeId: userId,
          refereePurchase: purchaseAmount,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info(`Referral reward paid: ${referrerId} received ${REFERRAL_REWARDS.referrer} tokens`);
  } catch (error: any) {
    logger.error("Failed to process referral reward:", error);
  }
}

// ============================================================================
// WITHDRAWAL SYSTEM
// ============================================================================

/**
 * Request withdrawal
 */
export const requestWithdrawalV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const schema = z.object({
      amount: z.number().min(WITHDRAWAL_SETTINGS.minAmount).max(WITHDRAWAL_SETTINGS.maxAmount),
      method: z.enum(["bank_transfer", "crypto", "paypal"]),
      accountDetails: z.record(z.string()),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { amount, method, accountDetails } = validation.data;

    try {
      // Check balance
      const userDoc = await db.collection("users").doc(uid).get();
      const userTokens = userDoc.data()?.tokens || 0;

      if (userTokens < amount) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient balance. Have ${userTokens}, need ${amount}`
        );
      }

      const feeAmount = Math.ceil(amount * WITHDRAWAL_SETTINGS.feePercent);
      const netAmount = amount - feeAmount;

      // Create withdrawal request
      const withdrawalRef = db.collection("creator_withdrawals").doc();
      const withdrawal: CreatorWithdrawal = {
        id: withdrawalRef.id,
        creatorId: uid,
        amount,
        feeAmount,
        netAmount,
        method,
        status: "pending",
        requestedAt: Timestamp.now(),
      };

      await withdrawalRef.set(withdrawal);

      // Deduct tokens immediately (lock them)
      await db.collection("users").doc(uid).update({
        tokens: FieldValue.increment(-amount),
        "creatorMode.pendingWithdrawal": FieldValue.increment(amount),
      });

      logger.info(`Withdrawal requested by ${uid}: ${amount} tokens via ${method}`);

      return {
        success: true,
        withdrawalId: withdrawalRef.id,
        netAmount,
        feeAmount,
        estimatedTime: WITHDRAWAL_SETTINGS.processingTime,
      };
    } catch (error: any) {
      logger.error("Withdrawal request failed:", error);
      throw new HttpsError("internal", "Failed to request withdrawal");
    }
  }
);

/**
 * Get withdrawal history
 */
export const getWithdrawalHistoryV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      const withdrawalsSnapshot = await db
        .collection("creator_withdrawals")
        .where("creatorId", "==", uid)
        .orderBy("requestedAt", "desc")
        .limit(50)
        .get();

      const withdrawals = withdrawalsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        withdrawals,
      };
    } catch (error: any) {
      logger.error("Failed to get withdrawal history:", error);
      throw new HttpsError("internal", "Failed to get history");
    }
  }
);

// ============================================================================
// FAN ANALYTICS
// ============================================================================

/**
 * Get top fans
 */
export const getTopFansV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      const fansSnapshot = await db
        .collection("creator_fans")
        .where("creatorId", "==", uid)
        .orderBy("totalSpent", "desc")
        .limit(20)
        .get();

      const fans = await Promise.all(
        fansSnapshot.docs.map(async (doc) => {
          const fanData = doc.data();
          const fanDoc = await db.collection("users").doc(fanData.fanId).get();
          const fanProfile = fanDoc.data();

          return {
            userId: fanData.fanId,
            displayName: fanProfile?.displayName,
            photo: fanProfile?.photos?.[0],
            totalSpent: fanData.totalSpent,
            lastPurchase: fanData.lastPurchase,
          };
        })
      );

      return {
        success: true,
        fans,
      };
    } catch (error: any) {
      logger.error("Failed to get top fans:", error);
      throw new HttpsError("internal", "Failed to get fans");
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  enableCreatorModeV1,
  getCreatorDashboardV1,
  createGatedPostV1,
  unlockGatedPostV1,
  setMessagePricingV1,
  generateReferralCodeV1,
  applyReferralCodeV1,
  requestWithdrawalV1,
  getWithdrawalHistoryV1,
  getTopFansV1,
  processReferralReward,
};

