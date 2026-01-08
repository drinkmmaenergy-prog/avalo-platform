/**
 * PACK 259: Fan Clubs / Support Circles
 * Turning Creators Into Micro-Communities
 * 
 * FEATURES:
 * - 4 membership tiers: Silver, Gold, Diamond, Royal Elite
 * - Monthly recurring billing with 65/35 split
 * - Exclusive content, group chat, fan-only live streams
 * - Member badges (visible only in DMs)
 * - Member-only events (Diamond+)
 * - Creator tools and analytics
 * 
 * SAFETY:
 * - No romantic pressure or transactional dating
 * - No psychological obligation
 * - Members can leave anytime
 * - No partial refunds (clearly stated upfront)
 * - Platform fee non-refundable
 */

import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const db = getFirestore();

// ============================================================================
// CONSTANTS
// ============================================================================

export const FAN_CLUB_TIERS = {
  SILVER: {
    slug: "silver",
    name: "Silver",
    priceTokens: 250,
    features: [
      "Exclusive stories & media",
      "Basic access to exclusive content",
    ],
  },
  GOLD: {
    slug: "gold",
    name: "Gold",
    priceTokens: 750,
    features: [
      "All Silver benefits",
      "Group chat access",
      "Fan-only live streams",
      "Priority placement in inbox",
      "Member badge in DMs",
    ],
  },
  DIAMOND: {
    slug: "diamond",
    name: "Diamond",
    priceTokens: 1500,
    features: [
      "All Gold benefits",
      "Member events access",
      "1-on-1 boosted visibility",
      "Priority replies",
    ],
  },
  ROYAL_ELITE: {
    slug: "royal_elite",
    name: "Royal Elite",
    priceTokens: 2500,
    features: [
      "All Diamond benefits",
      "VIP live sessions",
      "Full access to all content",
      "Highest priority support",
    ],
  },
} as const;

export const AVALO_FAN_CLUB_FEE_PERCENT = 35; // 35% to Avalo
export const CREATOR_FAN_CLUB_SHARE_PERCENT = 65; // 65% to creator

type TierSlug = "silver" | "gold" | "diamond" | "royal_elite";

// ============================================================================
// INTERFACES
// ============================================================================

interface FanClubSettings {
  creatorId: string;
  enabled: boolean;
  availableTiers: TierSlug[];
  welcomeMessage?: string;
  groupChatEnabled: boolean;
  liveStreamsEnabled: boolean;
  eventsEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface FanClubMembership {
  membershipId: string;
  creatorId: string;
  memberId: string;
  tier: TierSlug;
  status: "pending_payment" | "active" | "cancelled" | "expired";
  billingType: "monthly" | "one_time";
  priceTokens: number;
  joinedAt: Timestamp;
  nextBillingDate?: Timestamp;
  lastBillingDate?: Timestamp;
  cancelledAt?: Timestamp;
  expiresAt?: Timestamp;
  autoRenew: boolean;
  totalPaid: number;
  billingHistory: string[]; // transaction IDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface FanClubTransaction {
  transactionId: string;
  membershipId: string;
  creatorId: string;
  memberId: string;
  type: "subscription" | "renewal" | "cancellation_refund";
  amount: number;
  avaloFee: number;
  creatorEarnings: number;
  status: "pending" | "completed" | "failed" | "refunded";
  billingCycle?: string; // e.g., "2025-12"
  createdAt: Timestamp;
  processedAt?: Timestamp;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has Earn ON enabled
 */
async function hasEarnOn(userId: string): Promise<boolean> {
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User not found");
  }
  return userDoc.data()?.earnOnChat === true;
}

/**
 * Get user's token balance
 */
async function getUserBalance(userId: string): Promise<number> {
  const walletDoc = await db.collection("wallets").doc(userId).get();
  if (!walletDoc.exists) {
    return 0;
  }
  return walletDoc.data()?.balance || 0;
}

/**
 * Deduct tokens from user wallet (atomic)
 */
async function deductTokens(
  userId: string,
  amount: number,
  transactionId: string,
  description: string
): Promise<void> {
  const walletRef = db.collection("wallets").doc(userId);

  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists) {
      throw new HttpsError("not-found", "Wallet not found");
    }

    const currentBalance = walletDoc.data()?.balance || 0;
    if (currentBalance < amount) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient balance. Required: ${amount}, Available: ${currentBalance}`
      );
    }

    transaction.update(walletRef, {
      balance: FieldValue.increment(-amount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Record transaction
    const transactionRef = db.collection("transactions").doc(transactionId);
    transaction.set(transactionRef, {
      userId,
      type: "fan_club_subscription",
      amount: -amount,
      description,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Credit tokens to user wallet (atomic)
 */
async function creditTokens(
  userId: string,
  amount: number,
  transactionId: string,
  description: string
): Promise<void> {
  const walletRef = db.collection("wallets").doc(userId);

  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists) {
      throw new HttpsError("not-found", "Wallet not found");
    }

    transaction.update(walletRef, {
      balance: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Record transaction
    const transactionRef = db.collection("transactions").doc(transactionId);
    transaction.set(transactionRef, {
      userId,
      type: "fan_club_earning",
      amount,
      description,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Generate membership ID
 */
function generateMembershipId(creatorId: string, memberId: string): string {
  return `${creatorId}_${memberId}`;
}

/**
 * Calculate next billing date (30 days from now)
 */
function calculateNextBillingDate(): Timestamp {
  const now = new Date();
  const next = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Timestamp.fromDate(next);
}

// ============================================================================
// FAN CLUB SETTINGS MANAGEMENT
// ============================================================================

/**
 * Enable Fan Club (Creators only with Earn ON)
 */
export const enableFanClub = onCall<{
  availableTiers: TierSlug[];
  welcomeMessage?: string;
  groupChatEnabled?: boolean;
  liveStreamsEnabled?: boolean;
  eventsEnabled?: boolean;
}>(async (request: CallableRequest) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Check Earn ON status
  const earnOn = await hasEarnOn(userId);
  if (!earnOn) {
    throw new HttpsError(
      "failed-precondition",
      "Fan Clubs require Earn ON to be enabled"
    );
  }

  const { availableTiers, welcomeMessage, groupChatEnabled, liveStreamsEnabled, eventsEnabled } =
    request.data;

  // Validate tiers
  if (!availableTiers || availableTiers.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one tier must be enabled"
    );
  }

  const validTiers = Object.values(FAN_CLUB_TIERS).map((t) => t.slug);
  for (const tier of availableTiers) {
    if (!validTiers.includes(tier)) {
      throw new HttpsError("invalid-argument", `Invalid tier: ${tier}`);
    }
  }

  // Create or update settings
  const settingsRef = db.collection("fanClubSettings").doc(userId);
  const settingsDoc = await settingsRef.get();

  const settings: FanClubSettings = {
    creatorId: userId,
    enabled: true,
    availableTiers,
    welcomeMessage: welcomeMessage || "",
    groupChatEnabled: groupChatEnabled !== false,
    liveStreamsEnabled: liveStreamsEnabled !== false,
    eventsEnabled: eventsEnabled !== false,
    createdAt: settingsDoc.exists
      ? settingsDoc.data()!.createdAt
      : Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await settingsRef.set(settings);

  // Create group chat if enabled
  if (settings.groupChatEnabled) {
    const groupChatRef = db.collection("fanClubGroupChats").doc(userId);
    const groupChatDoc = await groupChatRef.get();
    if (!groupChatDoc.exists) {
      await groupChatRef.set({
        creatorId: userId,
        name: "Fan Club Group Chat",
        memberCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  logger.info(`Fan Club enabled for creator ${userId}`);

  return {
    success: true,
    settings,
  };
});

/**
 * Update Fan Club settings
 */
export const updateFanClubSettings = onCall<Partial<FanClubSettings>>(
  async (request: CallableRequest) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const settingsRef = db.collection("fanClubSettings").doc(userId);
    const settingsDoc = await settingsRef.get();

    if (!settingsDoc.exists) {
      throw new HttpsError("not-found", "Fan Club not enabled");
    }

    const updates = request.data;
    await settingsRef.update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Fan Club settings updated for creator ${userId}`);

    return { success: true };
  }
);

/**
 * Disable Fan Club
 */
export const disableFanClub = onCall(async (request: CallableRequest) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const settingsRef = db.collection("fanClubSettings").doc(userId);
  await settingsRef.update({
    enabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Note: Existing memberships remain active until expiration
  logger.info(`Fan Club disabled for creator ${userId}`);

  return { success: true };
});

// ============================================================================
// MEMBERSHIP MANAGEMENT
// ============================================================================

/**
 * Join Fan Club (Subscribe)
 */
export const joinFanClub = onCall<{
  creatorId: string;
  tier: TierSlug;
  billingType?: "monthly" | "one_time";
}>(async (request: CallableRequest) => {
  const memberId = request.auth?.uid;
  if (!memberId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const { creatorId, tier, billingType = "monthly" } = request.data;

  // Validate creator has Fan Club enabled
  const settingsDoc = await db
    .collection("fanClubSettings")
    .doc(creatorId)
    .get();
  if (!settingsDoc.exists || !settingsDoc.data()?.enabled) {
    throw new HttpsError("not-found", "Creator has no active Fan Club");
  }

  const settings = settingsDoc.data() as FanClubSettings;
  if (!settings.availableTiers.includes(tier)) {
    throw new HttpsError("invalid-argument", "Tier not available");
  }

  // Check if already a member
  const membershipId = generateMembershipId(creatorId, memberId);
  const existingMembership = await db
    .collection("fanClubMemberships")
    .doc(membershipId)
    .get();

  if (existingMembership.exists) {
    const data = existingMembership.data();
    if (data?.status === "active") {
      throw new HttpsError(
        "already-exists",
        "Already a member of this Fan Club"
      );
    }
  }

  // Get tier price
  const tierConfig = Object.values(FAN_CLUB_TIERS).find(
    (t) => t.slug === tier
  );
  if (!tierConfig) {
    throw new HttpsError("invalid-argument", "Invalid tier");
  }

  const priceTokens = tierConfig.priceTokens;

  // Check balance
  const balance = await getUserBalance(memberId);
  if (balance < priceTokens) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient tokens. Required: ${priceTokens}, Available: ${balance}`
    );
  }

  // Process payment
  const transactionId = `fc_sub_${membershipId}_${Date.now()}`;
  const avaloFee = Math.round(priceTokens * (AVALO_FAN_CLUB_FEE_PERCENT / 100));
  const creatorEarnings = priceTokens - avaloFee;

  await db.runTransaction(async (transaction) => {
    // Deduct from member
    await deductTokens(
      memberId,
      priceTokens,
      transactionId,
      `Fan Club subscription - ${tierConfig.name}`
    );

    // Credit to creator (65%)
    await creditTokens(
      creatorId,
      creatorEarnings,
      `${transactionId}_creator`,
      `Fan Club earnings from ${memberId}`
    );

    // Create or update membership
    const membershipRef = db
      .collection("fanClubMemberships")
      .doc(membershipId);
    const membership: FanClubMembership = {
      membershipId,
      creatorId,
      memberId,
      tier,
      status: "active",
      billingType,
      priceTokens,
      joinedAt: Timestamp.now(),
      nextBillingDate:
        billingType === "monthly" ? calculateNextBillingDate() : undefined,
      lastBillingDate: Timestamp.now(),
      autoRenew: billingType === "monthly",
      totalPaid: priceTokens,
      billingHistory: [transactionId],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    transaction.set(membershipRef, membership);

    // Record transaction
    const fanClubTransactionRef = db
      .collection("fanClubTransactions")
      .doc(transactionId);
    const fanClubTransaction: FanClubTransaction = {
      transactionId,
      membershipId,
      creatorId,
      memberId,
      type: "subscription",
      amount: priceTokens,
      avaloFee,
      creatorEarnings,
      status: "completed",
      billingCycle: new Date().toISOString().slice(0, 7), // YYYY-MM
      createdAt: Timestamp.now(),
      processedAt: Timestamp.now(),
    };
    transaction.set(fanClubTransactionRef, fanClubTransaction);

    // Update member badge
    const badgeRef = db.collection("fanClubMemberBadges").doc(memberId);
    transaction.set(
      badgeRef,
      {
        [creatorId]: {
          tier,
          joinedAt: Timestamp.now(),
        },
      },
      { merge: true }
    );
  });

  // Send notification to creator
  await db.collection("fanClubNotifications").add({
    recipientId: creatorId,
    type: "new_member",
    memberId,
    tier,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(`Member ${memberId} joined Fan Club of ${creatorId} at ${tier} tier`);

  return {
    success: true,
    membershipId,
    tier,
    nextBillingDate:
      billingType === "monthly" ? calculateNextBillingDate().toMillis() : null,
  };
});

/**
 * Leave Fan Club (Cancel Subscription)
 */
export const leaveFanClub = onCall<{ creatorId: string }>(
  async (request: CallableRequest) => {
    const memberId = request.auth?.uid;
    if (!memberId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { creatorId } = request.data;
    const membershipId = generateMembershipId(creatorId, memberId);

    const membershipRef = db
      .collection("fanClubMemberships")
      .doc(membershipId);
    const membershipDoc = await membershipRef.get();

    if (!membershipDoc.exists) {
      throw new HttpsError("not-found", "Membership not found");
    }

    const membership = membershipDoc.data() as FanClubMembership;
    if (membership.status !== "active") {
      throw new HttpsError("failed-precondition", "Membership not active");
    }

    // Cancel membership (no refund as per spec)
    await membershipRef.update({
      status: "cancelled",
      autoRenew: false,
      cancelledAt: FieldValue.serverTimestamp(),
      expiresAt: membership.nextBillingDate || Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Remove badge
    const badgeRef = db.collection("fanClubMemberBadges").doc(memberId);
    await badgeRef.update({
      [creatorId]: FieldValue.delete(),
    });

    // Notify creator
    await db.collection("fanClubNotifications").add({
      recipientId: creatorId,
      type: "member_left",
      memberId,
      tier: membership.tier,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Member ${memberId} left Fan Club of ${creatorId}`);

    return {
      success: true,
      message: "Membership cancelled. Access until end of billing cycle.",
      expiresAt: membership.nextBillingDate
        ? membership.nextBillingDate.toMillis()
        : Date.now(),
    };
  }
);

/**
 * Upgrade/Downgrade membership tier
 */
export const changeFanClubTier = onCall<{
  creatorId: string;
  newTier: TierSlug;
}>(async (request: CallableRequest) => {
  const memberId = request.auth?.uid;
  if (!memberId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const { creatorId, newTier } = request.data;
  const membershipId = generateMembershipId(creatorId, memberId);

  const membershipRef = db.collection("fanClubMemberships").doc(membershipId);
  const membershipDoc = await membershipRef.get();

  if (!membershipDoc.exists) {
    throw new HttpsError("not-found", "Membership not found");
  }

  const membership = membershipDoc.data() as FanClubMembership;
  if (membership.status !== "active") {
    throw new HttpsError("failed-precondition", "Membership not active");
  }

  if (membership.tier === newTier) {
    throw new HttpsError("invalid-argument", "Already at this tier");
  }

  // Get new tier price
  const newTierConfig = Object.values(FAN_CLUB_TIERS).find(
    (t) => t.slug === newTier
  );
  if (!newTierConfig) {
    throw new HttpsError("invalid-argument", "Invalid tier");
  }

  // Update immediately, charge difference on next billing
  await membershipRef.update({
    tier: newTier,
    priceTokens: newTierConfig.priceTokens,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Update badge
  const badgeRef = db.collection("fanClubMemberBadges").doc(memberId);
  await badgeRef.update({
    [creatorId]: {
      tier: newTier,
      joinedAt: membership.joinedAt,
    },
  });

  logger.info(`Member ${memberId} changed tier to ${newTier} in Fan Club of ${creatorId}`);

  return {
    success: true,
    newTier,
    message: "Tier updated. New price takes effect on next billing.",
  };
});

// ============================================================================
// RECURRING BILLING (SCHEDULED)
// ============================================================================

/**
 * Process recurring Fan Club billing
 * Runs daily to check for due subscriptions
 */
export const processFanClubBilling = onSchedule(
  { schedule: "0 0 * * *" }, // Daily at midnight
  async () => {
    const now = Timestamp.now();
    const membershipsSnapshot = await db
      .collection("fanClubMemberships")
      .where("status", "==", "active")
      .where("billingType", "==", "monthly")
      .where("autoRenew", "==", true)
      .where("nextBillingDate", "<=", now)
      .get();

    logger.info(`Processing ${membershipsSnapshot.size} Fan Club renewals`);

    let successCount = 0;
    let failureCount = 0;

    for (const doc of membershipsSnapshot.docs) {
      const membership = doc.data() as FanClubMembership;

      try {
        // Check balance
        const balance = await getUserBalance(membership.memberId);
        if (balance < membership.priceTokens) {
          // Insufficient balance - cancel membership
          await doc.ref.update({
            status: "expired",
            autoRenew: false,
            expiresAt: Timestamp.now(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Notify member
          await db.collection("fanClubNotifications").add({
            recipientId: membership.memberId,
            type: "renewal_failed",
            creatorId: membership.creatorId,
            reason: "insufficient_balance",
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });

          failureCount++;
          continue;
        }

        // Process renewal
        const transactionId = `fc_renew_${membership.membershipId}_${Date.now()}`;
        const avaloFee = Math.round(
          membership.priceTokens * (AVALO_FAN_CLUB_FEE_PERCENT / 100)
        );
        const creatorEarnings = membership.priceTokens - avaloFee;

        await deductTokens(
          membership.memberId,
          membership.priceTokens,
          transactionId,
          `Fan Club renewal - ${membership.tier}`
        );

        await creditTokens(
          membership.creatorId,
          creatorEarnings,
          `${transactionId}_creator`,
          `Fan Club renewal earnings from ${membership.memberId}`
        );

        // Update membership
        await doc.ref.update({
          lastBillingDate: Timestamp.now(),
          nextBillingDate: calculateNextBillingDate(),
          totalPaid: FieldValue.increment(membership.priceTokens),
          billingHistory: FieldValue.arrayUnion(transactionId),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Record transaction
        await db
          .collection("fanClubTransactions")
          .doc(transactionId)
          .set({
            transactionId,
            membershipId: membership.membershipId,
            creatorId: membership.creatorId,
            memberId: membership.memberId,
            type: "renewal",
            amount: membership.priceTokens,
            avaloFee,
            creatorEarnings,
            status: "completed",
            billingCycle: new Date().toISOString().slice(0, 7),
            createdAt: Timestamp.now(),
            processedAt: Timestamp.now(),
          });

        successCount++;
      } catch (error) {
        logger.error(
          `Failed to renew membership ${membership.membershipId}:`,
          error
        );
        failureCount++;
      }
    }

    logger.info(
      `Fan Club billing complete: ${successCount} success, ${failureCount} failed`
    );
  }
);

// ============================================================================
// CREATOR TOOLS
// ============================================================================

/**
 * Send exclusive content drop to Fan Club
 */
export const sendExclusiveDrop = onCall<{
  contentId: string;
  minimumTier: TierSlug;
}>(async (request: CallableRequest) => {
  const creatorId = request.auth?.uid;
  if (!creatorId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const { contentId, minimumTier } = request.data;

  // Get all active members at minimum tier or higher
  const tierOrder: TierSlug[] = ["silver", "gold", "diamond", "royal_elite"];
  const minTierIndex = tierOrder.indexOf(minimumTier);

  const membershipsSnapshot = await db
    .collection("fanClubMemberships")
    .where("creatorId", "==", creatorId)
    .where("status", "==", "active")
    .get();

  const notifications: Promise<any>[] = [];
  membershipsSnapshot.forEach((doc) => {
    const membership = doc.data() as FanClubMembership;
    const memberTierIndex = tierOrder.indexOf(membership.tier);
    if (memberTierIndex >= minTierIndex) {
      notifications.push(
        db.collection("fanClubNotifications").add({
          recipientId: membership.memberId,
          type: "exclusive_drop",
          creatorId,
          contentId,
          tier: membership.tier,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }
  });

  await Promise.all(notifications);

  logger.info(`Exclusive drop sent to ${notifications.length} members`);

  return {
    success: true,
    notifiedCount: notifications.length,
  };
});

/**
 * Send announcement to all Fan Club members
 */
export const sendFanClubAnnouncement = onCall<{ message: string }>(
  async (request: CallableRequest) => {
    const creatorId = request.auth?.uid;
    if (!creatorId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { message } = request.data;
    if (!message || message.length === 0) {
      throw new HttpsError("invalid-argument", "Message cannot be empty");
    }

    // Get all active members
    const membershipsSnapshot = await db
      .collection("fanClubMemberships")
      .where("creatorId", "==", creatorId)
      .where("status", "==", "active")
      .get();

    const notifications: Promise<any>[] = [];
    membershipsSnapshot.forEach((doc) => {
      const membership = doc.data() as FanClubMembership;
      notifications.push(
        db.collection("fanClubNotifications").add({
          recipientId: membership.memberId,
          type: "announcement",
          creatorId,
          message,
          tier: membership.tier,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    });

    await Promise.all(notifications);

    logger.info(`Announcement sent to ${notifications.length} members`);

    return {
      success: true,
      notifiedCount: notifications.length,
    };
  }
);

/**
 * Get Fan Club analytics for creator
 */
export const getFanClubAnalytics = onCall(async (request: CallableRequest) => {
  const creatorId = request.auth?.uid;
  if (!creatorId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Get all memberships
  const membershipsSnapshot = await db
    .collection("fanClubMemberships")
    .where("creatorId", "==", creatorId)
    .get();

  const analytics = {
    totalMembers: 0,
    activeMembers: 0,
    membersByTier: {
      silver: 0,
      gold: 0,
      diamond: 0,
      royal_elite: 0,
    },
    monthlyRecurringRevenue: 0,
    lifetimeRevenue: 0,
    averageLifetimeValue: 0,
    cancellationRate: 0,
  };

  let totalLifetimeValue = 0;
  let activeMembersCount = 0;
  let cancelledCount = 0;

  membershipsSnapshot.forEach((doc) => {
    const membership = doc.data() as FanClubMembership;
    analytics.totalMembers++;
    totalLifetimeValue += membership.totalPaid;

    if (membership.status === "active") {
      analytics.activeMembers++;
      activeMembersCount++;
      analytics.membersByTier[membership.tier]++;
      if (membership.billingType === "monthly") {
        analytics.monthlyRecurringRevenue += membership.priceTokens;
      }
    }

    if (membership.status === "cancelled") {
      cancelledCount++;
    }
  });

  // Calculate creator's share (65%)
  analytics.lifetimeRevenue = Math.round(
    totalLifetimeValue * (CREATOR_FAN_CLUB_SHARE_PERCENT / 100)
  );
  analytics.monthlyRecurringRevenue = Math.round(
    analytics.monthlyRecurringRevenue * (CREATOR_FAN_CLUB_SHARE_PERCENT / 100)
  );
  analytics.averageLifetimeValue =
    activeMembersCount > 0
      ? Math.round(totalLifetimeValue / activeMembersCount)
      : 0;
  analytics.cancellationRate =
    analytics.totalMembers > 0
      ? Math.round((cancelledCount / analytics.totalMembers) * 100)
      : 0;

  return analytics;
});

/**
 * Get top supporters (private leaderboard for creator only)
 */
export const getTopSupporters = onCall<{ limit?: number }>(
  async (request: CallableRequest) => {
    const creatorId = request.auth?.uid;
    if (!creatorId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const limit = request.data?.limit || 10;

    const membershipsSnapshot = await db
      .collection("fanClubMemberships")
      .where("creatorId", "==", creatorId)
      .where("status", "==", "active")
      .get();

    const supporters = membershipsSnapshot.docs
      .map((doc) => {
        const membership = doc.data() as FanClubMembership;
        return {
          memberId: membership.memberId,
          tier: membership.tier,
          totalPaid: membership.totalPaid,
          joinedAt: membership.joinedAt.toMillis(),
        };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, limit);

    return { supporters };
  }
);

logger.info("Fan Club functions loaded");