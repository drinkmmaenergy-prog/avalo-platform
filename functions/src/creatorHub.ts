/**
 * ========================================================================
 * CREATOR HUB - COMPLETE DASHBOARD & PROGRESSION SYSTEM
 * ========================================================================
 * Comprehensive creator management and gamification
 *
 * Features:
 * - Live Creator Dashboard with real-time metrics
 * - VIP Room Control Center
 * - Smart Pricing Panel with AI recommendations
 * - Templates & AI Assistant
 * - Earnings & Withdrawals with AML flags
 * - Product Store Editor
 * - Fanbase Manager
 * - Daily Quests, Weekly Objectives, Seasonal Missions
 * - Creator Level System: Bronze → Silver → Gold → Platinum → Royal
 *
 * @version 1.0.0
 * @section CREATOR_ECONOMY
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum CreatorLevel {
  BRONZE = "bronze",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
  ROYAL = "royal",
}

export enum QuestType {
  DAILY = "daily",
  WEEKLY = "weekly",
  SEASONAL = "seasonal",
}

export enum QuestStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  CLAIMED = "claimed",
  EXPIRED = "expired",
}

export interface CreatorDashboard {
  creatorId: string;
  level: CreatorLevel;

  // Real-time metrics
  onlineStatus: boolean;
  activeChats: number;
  pendingMessages: number;
  liveViewers?: number;

  // Today's performance
  todayEarnings: number;
  todayMessages: number;
  todayNewFans: number;
  todayProductSales: number;

  // Week performance
  weekEarnings: number;
  weekMessages: number;
  weekNewFans: number;
  weekProductSales: number;

  // Month performance
  monthEarnings: number;
  monthMessages: number;
  monthNewFans: number;
  monthProductSales: number;

  // All-time stats
  totalEarnings: number;
  totalFans: number;
  totalProducts: number;
  totalMessages: number;

  // Engagement metrics
  responseRate: number; // percentage
  avgResponseTime: number; // seconds
  satisfactionScore: number; // 0-100
  retentionRate: number; // percentage

  // Rankings
  rankOverall?: number;
  rankByCategory?: { [key: string]: number };

  // Progress
  levelProgress: number; // 0-100
  nextLevelAt: number; // XP needed
  currentXP: number;

  // Active quests
  dailyQuests: Quest[];
  weeklyObjectives: Quest[];
  seasonalMissions: Quest[];

  // Recommendations
  pricingRecommendations?: PricingRecommendation[];
  contentSuggestions?: string[];

  updatedAt: Timestamp;
}

export interface Quest {
  questId: string;
  type: QuestType;
  title: string;
  description: string;
  requirement: number;
  progress: number;
  reward: {
    tokens?: number;
    xp?: number;
    badge?: string;
  };
  status: QuestStatus;
  expiresAt: Timestamp;
  claimedAt?: Timestamp;
}

export interface PricingRecommendation {
  productType: string;
  currentPrice?: number;
  recommendedPrice: number;
  reasoning: string;
  potentialIncrease: number; // percentage
  confidence: number; // 0-100
}

export interface CreatorWithdrawal {
  withdrawalId: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "rejected";
  method: "bank_transfer" | "crypto" | "paypal";
  destination: string;
  fees: number;
  netAmount: number;
  amlChecked: boolean;
  amlStatus?: "clear" | "review" | "flagged";
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  notes?: string;
}

export interface FanProfile {
  userId: string;
  name: string;
  avatar?: string;

  // Relationship
  firstInteraction: Timestamp;
  lastInteraction: Timestamp;
  totalSpent: number;
  messageCount: number;

  // Engagement
  responseRate: number;
  avgSessionLength: number; // minutes
  preferredTimes: string[]; // hour ranges

  // Purchase history
  productsOwned: number;
  calendarBookings: number;
  tips: number;

  // Status
  isVIP: boolean;
  tier: "casual" | "regular" | "vip" | "whale";

  // Tags
  tags: string[];
  notes?: string;
}

export interface MessageTemplate {
  templateId: string;
  creatorId: string;
  title: string;
  content: string;
  category: "greeting" | "goodbye" | "promo" | "custom";
  useCount: number;
  createdAt: Timestamp;
}

// ============================================================================
// LEVEL SYSTEM CONFIGURATION
// ============================================================================

const LEVEL_REQUIREMENTS = {
  [CreatorLevel.BRONZE]: { minXP: 0, minEarnings: 0 },
  [CreatorLevel.SILVER]: { minXP: 100, minEarnings: 1000 },
  [CreatorLevel.GOLD]: { minXP: 500, minEarnings: 10000 },
  [CreatorLevel.PLATINUM]: { minXP: 2000, minEarnings: 50000 },
  [CreatorLevel.ROYAL]: { minXP: 5000, minEarnings: 200000 },
};

const LEVEL_BENEFITS = {
  [CreatorLevel.BRONZE]: {
    wordRatio: 11,
    commissionRate: 0.65,
    maxProducts: 5,
    features: ["basic_analytics", "basic_templates"],
  },
  [CreatorLevel.SILVER]: {
    wordRatio: 11,
    commissionRate: 0.67,
    maxProducts: 15,
    features: ["advanced_analytics", "ai_assistant", "custom_templates"],
  },
  [CreatorLevel.GOLD]: {
    wordRatio: 9,
    commissionRate: 0.70,
    maxProducts: 50,
    features: ["premium_analytics", "ai_pricing", "vip_support", "priority_listing"],
  },
  [CreatorLevel.PLATINUM]: {
    wordRatio: 8,
    commissionRate: 0.72,
    maxProducts: 100,
    features: ["full_analytics", "dedicated_manager", "promotional_boost"],
  },
  [CreatorLevel.ROYAL]: {
    wordRatio: 7,
    commissionRate: 0.75,
    maxProducts: -1, // unlimited
    features: ["everything", "revenue_guarantee", "exclusive_events"],
  },
};

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Get live creator dashboard
 */
export const getCreatorDashboard = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check if user is a creator
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.verification?.status || userData.verification.status !== "approved") {
      throw new HttpsError("permission-denied", "Must be a verified creator");
    }

    // Get or create dashboard
    const dashboardRef = db.collection("creatorDashboards").doc(uid);
    let dashboardDoc = await dashboardRef.get();

    if (!dashboardDoc.exists) {
      // Create new dashboard
      const dashboard = await initializeCreatorDashboard(uid);
      return { success: true, dashboard };
    }

    // Update real-time metrics and return
    const dashboard = dashboardDoc.data() as CreatorDashboard;
    const updated = await updateDashboardMetrics(uid, dashboard);

    logger.info(`Dashboard retrieved for creator ${uid}`);

    return {
      success: true,
      dashboard: updated,
      levelBenefits: LEVEL_BENEFITS[updated.level],
    };
  }
);

/**
 * Get creator quests (daily/weekly/seasonal)
 */
export const getCreatorQuests = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { type } = request.data as { type?: QuestType };

    let query = db
      .collection("creatorQuests")
      .where("creatorId", "==", uid)
      .where("status", "in", [QuestStatus.ACTIVE, QuestStatus.COMPLETED]);

    if (type) {
      query = query.where("type", "==", type) as any;
    }

    const snapshot = await query.get();
    const quests = snapshot.docs.map((doc) => doc.data());

    // Generate new daily quests if none exist
    if (type === QuestType.DAILY && quests.length === 0) {
      const newQuests = await generateDailyQuests(uid);
      return { success: true, quests: newQuests };
    }

    logger.info(`Retrieved ${quests.length} quests for ${uid}`);

    return {
      success: true,
      quests,
    };
  }
);

/**
 * Claim quest reward
 */
export const claimQuestReward = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { questId } = request.data;

    if (!questId) {
      throw new HttpsError("invalid-argument", "Missing questId");
    }

    return await db.runTransaction(async (tx) => {
      const questRef = db.collection("creatorQuests").doc(questId);
      const questDoc = await tx.get(questRef);

      if (!questDoc.exists) {
        throw new HttpsError("not-found", "Quest not found");
      }

      const quest = questDoc.data() as Quest;

      if (quest.status !== QuestStatus.COMPLETED) {
        throw new HttpsError("failed-precondition", "Quest not completed");
      }

      // Give rewards
      const userRef = db.collection("users").doc(uid);
      const updates: any = {};

      if (quest.reward.tokens) {
        updates["wallet.balance"] = FieldValue.increment(quest.reward.tokens);
      }

      if (quest.reward.xp) {
        const dashboardRef = db.collection("creatorDashboards").doc(uid);
        tx.update(dashboardRef, {
          currentXP: FieldValue.increment(quest.reward.xp),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.update(userRef, {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Mark as claimed
      tx.update(questRef, {
        status: QuestStatus.CLAIMED,
        claimedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Quest ${questId} claimed by ${uid}`);

      return {
        success: true,
        reward: quest.reward,
      };
    });
  }
);

/**
 * Request withdrawal
 */
export const requestWithdrawal = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { amount, method, destination } = request.data;

    if (!amount || !method || !destination) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    // Minimum withdrawal: 100 tokens (20 PLN at settlement rate)
    if (amount < 100) {
      throw new HttpsError("invalid-argument", "Minimum withdrawal is 100 tokens");
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await tx.get(userRef);

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();
      const earned = userData?.wallet?.earned || 0;

      if (earned < amount) {
        throw new HttpsError("failed-precondition", "Insufficient earned balance");
      }

      // Calculate fees (2% for bank transfer, 1% for crypto)
      const feeRate = method === "crypto" ? 0.01 : 0.02;
      const fees = Math.ceil(amount * feeRate);
      const netAmount = amount - fees;

      // Create withdrawal request
      const withdrawalId = `wd_${Date.now()}_${uid.substring(0, 8)}`;

      const withdrawal: CreatorWithdrawal = {
        withdrawalId,
        creatorId: uid,
        amount,
        currency: "tokens",
        status: "pending",
        method,
        destination,
        fees,
        netAmount,
        amlChecked: false,
        requestedAt: Timestamp.now(),
      };

      const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
      tx.set(withdrawalRef, withdrawal);

      // Deduct from earned balance (move to pending)
      tx.update(userRef, {
        "wallet.earned": FieldValue.increment(-amount),
        "wallet.pendingWithdrawal": FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create transaction record
      const txRef = db.collection("transactions").doc(`tx_${withdrawalId}`);
      tx.set(txRef, {
        txId: `tx_${withdrawalId}`,
        type: "withdrawal_request",
        uid,
        amount: -amount,
        metadata: {
          withdrawalId,
          method,
          netAmount,
          fees,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Withdrawal requested: ${withdrawalId} for ${amount} tokens`);

      return {
        success: true,
        withdrawalId,
        netAmount,
        fees,
        message: "Withdrawal request submitted. Processing typically takes 2-5 business days.",
      };
    });
  }
);

/**
 * Get fanbase/fans list
 */
export const getCreatorFanbase = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { tierFilter, sortBy = "totalSpent", limit = 50 } = request.data;

    // Get all chats where creator is earning
    const chatsSnapshot = await db
      .collection("chats")
      .where("participants", "array-contains", uid)
      .get();

    const fans: FanProfile[] = [];

    for (const chatDoc of chatsSnapshot.docs) {
      const chat = chatDoc.data();
      const fanId = chat.participants.find((p: string) => p !== uid);

      if (!fanId) continue;

      // Get fan profile
      const fanDoc = await db.collection("users").doc(fanId).get();
      if (!fanDoc.exists) continue;

      const fanData = fanDoc.data();

      // Calculate metrics
      const messagesSnapshot = await db
        .collection(`chats/${chatDoc.id}/messages`)
        .where("senderId", "==", fanId)
        .get();

      const totalSpent = chat.billing?.totalSpent || 0;
      const messageCount = messagesSnapshot.size;

      // Determine tier
      let tier: "casual" | "regular" | "vip" | "whale" = "casual";
      if (totalSpent > 10000) tier = "whale";
      else if (totalSpent > 5000) tier = "vip";
      else if (totalSpent > 1000) tier = "regular";

      const fan: FanProfile = {
        userId: fanId,
        name: fanData?.profile?.name || "Anonymous",
        avatar: fanData?.profile?.photos?.[0],
        firstInteraction: chat.createdAt,
        lastInteraction: chat.lastMessageAt || chat.createdAt,
        totalSpent,
        messageCount,
        responseRate: 0, // TODO: calculate
        avgSessionLength: 0, // TODO: calculate
        preferredTimes: [],
        productsOwned: 0, // TODO: count from purchases
        calendarBookings: 0, // TODO: count from bookings
        tips: 0, // TODO: sum from tips
        isVIP: tier === "vip" || tier === "whale",
        tier,
        tags: [],
      };

      if (!tierFilter || fan.tier === tierFilter) {
        fans.push(fan);
      }
    }

    // Sort fans
    fans.sort((a, b) => {
      if (sortBy === "totalSpent") return b.totalSpent - a.totalSpent;
      if (sortBy === "messageCount") return b.messageCount - a.messageCount;
      if (sortBy === "lastInteraction") return b.lastInteraction.toMillis() - a.lastInteraction.toMillis();
      return 0;
    });

    logger.info(`Retrieved ${fans.length} fans for creator ${uid}`);

    return {
      success: true,
      fans: fans.slice(0, limit),
      total: fans.length,
      tierBreakdown: {
        casual: fans.filter((f) => f.tier === "casual").length,
        regular: fans.filter((f) => f.tier === "regular").length,
        vip: fans.filter((f) => f.tier === "vip").length,
        whale: fans.filter((f) => f.tier === "whale").length,
      },
    };
  }
);

/**
 * Get message templates
 */
export const getMessageTemplates = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const snapshot = await db
      .collection("messageTemplates")
      .where("creatorId", "==", uid)
      .orderBy("useCount", "desc")
      .get();

    const templates = snapshot.docs.map((doc) => doc.data());

    // Add default templates if none exist
    if (templates.length === 0) {
      const defaultTemplates = await createDefaultTemplates(uid);
      return { success: true, templates: defaultTemplates };
    }

    logger.info(`Retrieved ${templates.length} templates for ${uid}`);

    return {
      success: true,
      templates,
    };
  }
);

/**
 * Save message template
 */
export const saveMessageTemplate = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { title, content, category = "custom" } = request.data;

    if (!title || !content) {
      throw new HttpsError("invalid-argument", "Missing title or content");
    }

    const templateId = `tmpl_${Date.now()}_${uid.substring(0, 8)}`;

    const template: MessageTemplate = {
      templateId,
      creatorId: uid,
      title,
      content,
      category,
      useCount: 0,
      createdAt: Timestamp.now(),
    };

    await db.collection("messageTemplates").doc(templateId).set(template);

    logger.info(`Template saved: ${templateId}`);

    return {
      success: true,
      templateId,
      template,
    };
  }
);

/**
 * Get pricing recommendations (AI-powered)
 */
export const getPricingRecommendations = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Get creator's products
    const productsSnapshot = await db
      .collection("creatorProducts")
      .where("creatorId", "==", uid)
      .where("status", "==", "active")
      .get();

    const products = productsSnapshot.docs.map((doc) => doc.data());

    // Get market data for similar products
    const recommendations: PricingRecommendation[] = [];

    for (const product of products) {
      // Get similar products from other creators
      const similarSnapshot = await db
        .collection("creatorProducts")
        .where("type", "==", product.type)
        .where("status", "==", "active")
        .where("creatorId", "!=", uid)
        .limit(50)
        .get();

      const similarProducts = similarSnapshot.docs.map((doc) => doc.data());

      if (similarProducts.length > 0) {
        // Calculate market statistics
        const prices = similarProducts.map((p: any) => p.price);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];

        // Calculate sales performance
        const avgSales = similarProducts.reduce((sum, p: any) => sum + (p.purchaseCount || 0), 0) / similarProducts.length;
        const productSales = product.purchaseCount || 0;

        let recommendedPrice = product.price;
        let reasoning = "Current pricing is optimal";
        let potentialIncrease = 0;
        let confidence = 70;

        // If product is performing well, suggest price increase
        if (productSales > avgSales * 1.5 && product.price < medianPrice) {
          recommendedPrice = Math.min(product.price * 1.2, medianPrice);
          reasoning = "Strong demand indicates room for price increase";
          potentialIncrease = ((recommendedPrice - product.price) / product.price) * 100;
          confidence = 85;
        }
        // If product is underperforming, suggest price decrease
        else if (productSales < avgSales * 0.5 && product.price > medianPrice) {
          recommendedPrice = Math.max(product.price * 0.8, medianPrice * 0.9);
          reasoning = "Lower price may improve conversion rate";
          potentialIncrease = ((recommendedPrice - product.price) / product.price) * 100;
          confidence = 75;
        }

        recommendations.push({
          productType: product.type,
          currentPrice: product.price,
          recommendedPrice: Math.round(recommendedPrice),
          reasoning,
          potentialIncrease,
          confidence,
        });
      }
    }

    logger.info(`Generated ${recommendations.length} pricing recommendations for ${uid}`);

    return {
      success: true,
      recommendations,
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Initialize creator dashboard
 */
async function initializeCreatorDashboard(creatorId: string): Promise<CreatorDashboard> {
  const dashboard: CreatorDashboard = {
    creatorId,
    level: CreatorLevel.BRONZE,
    onlineStatus: false,
    activeChats: 0,
    pendingMessages: 0,
    todayEarnings: 0,
    todayMessages: 0,
    todayNewFans: 0,
    todayProductSales: 0,
    weekEarnings: 0,
    weekMessages: 0,
    weekNewFans: 0,
    weekProductSales: 0,
    monthEarnings: 0,
    monthMessages: 0,
    monthNewFans: 0,
    monthProductSales: 0,
    totalEarnings: 0,
    totalFans: 0,
    totalProducts: 0,
    totalMessages: 0,
    responseRate: 0,
    avgResponseTime: 0,
    satisfactionScore: 0,
    retentionRate: 0,
    levelProgress: 0,
    nextLevelAt: LEVEL_REQUIREMENTS[CreatorLevel.SILVER].minXP,
    currentXP: 0,
    dailyQuests: [],
    weeklyObjectives: [],
    seasonalMissions: [],
    updatedAt: Timestamp.now(),
  };

  await db.collection("creatorDashboards").doc(creatorId).set(dashboard);

  // Generate initial quests
  await generateDailyQuests(creatorId);

  return dashboard;
}

/**
 * Update dashboard metrics
 */
async function updateDashboardMetrics(
  creatorId: string,
  currentDashboard: CreatorDashboard
): Promise<CreatorDashboard> {
  // Get user data
  const userDoc = await db.collection("users").doc(creatorId).get();
  const userData = userDoc.data();

  const earned = userData?.wallet?.earned || 0;
  const xp = currentDashboard.currentXP || 0;

  // Determine level based on XP and earnings
  let newLevel = CreatorLevel.BRONZE;
  if (xp >= LEVEL_REQUIREMENTS[CreatorLevel.ROYAL].minXP && earned >= LEVEL_REQUIREMENTS[CreatorLevel.ROYAL].minEarnings) {
    newLevel = CreatorLevel.ROYAL;
  } else if (xp >= LEVEL_REQUIREMENTS[CreatorLevel.PLATINUM].minXP && earned >= LEVEL_REQUIREMENTS[CreatorLevel.PLATINUM].minEarnings) {
    newLevel = CreatorLevel.PLATINUM;
  } else if (xp >= LEVEL_REQUIREMENTS[CreatorLevel.GOLD].minXP && earned >= LEVEL_REQUIREMENTS[CreatorLevel.GOLD].minEarnings) {
    newLevel = CreatorLevel.GOLD;
  } else if (xp >= LEVEL_REQUIREMENTS[CreatorLevel.SILVER].minXP && earned >= LEVEL_REQUIREMENTS[CreatorLevel.SILVER].minEarnings) {
    newLevel = CreatorLevel.SILVER;
  }

  // Calculate progress to next level
  const nextLevel = getNextLevel(newLevel);
  const nextLevelReq = LEVEL_REQUIREMENTS[nextLevel];
  const levelProgress = nextLevelReq ? Math.min((xp / nextLevelReq.minXP) * 100, 100) : 100;

  const updateData = {
    level: newLevel,
    totalEarnings: earned,
    levelProgress,
    nextLevelAt: nextLevelReq?.minXP || 0,
    updatedAt: Timestamp.now(),
  };

  await db.collection("creatorDashboards").doc(creatorId).update(updateData);

  const updated: CreatorDashboard = {
    ...currentDashboard,
    ...updateData,
  };

  return updated;
}

/**
 * Get next level
 */
function getNextLevel(currentLevel: CreatorLevel): CreatorLevel {
  const levels = [
    CreatorLevel.BRONZE,
    CreatorLevel.SILVER,
    CreatorLevel.GOLD,
    CreatorLevel.PLATINUM,
    CreatorLevel.ROYAL,
  ];
  const currentIndex = levels.indexOf(currentLevel);
  return levels[currentIndex + 1] || CreatorLevel.ROYAL;
}

/**
 * Generate daily quests
 */
async function generateDailyQuests(creatorId: string): Promise<Quest[]> {
  const questTemplates = [
    {
      title: "Early Bird",
      description: "Send 50 messages before 12 PM",
      requirement: 50,
      reward: { tokens: 25, xp: 10 },
    },
    {
      title: "Chat Champion",
      description: "Have 10 active conversations",
      requirement: 10,
      reward: { tokens: 50, xp: 15 },
    },
    {
      title: "Quick Response",
      description: "Maintain <2 min response time for 20 messages",
      requirement: 20,
      reward: { tokens: 30, xp: 12 },
    },
    {
      title: "Product Promotion",
      description: "Get 5 product views",
      requirement: 5,
      reward: { tokens: 20, xp: 8 },
    },
  ];

  const quests: Quest[] = [];
  const expiresAt = Timestamp.fromMillis(
    new Date().setHours(23, 59, 59, 999) // End of day
  );

  // Generate 3 random quests
  const shuffled = questTemplates.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 3);

  for (const template of selected) {
    const questId = `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const quest: Quest = {
      questId,
      type: QuestType.DAILY,
      title: template.title,
      description: template.description,
      requirement: template.requirement,
      progress: 0,
      reward: template.reward,
      status: QuestStatus.ACTIVE,
      expiresAt,
    };

    await db.collection("creatorQuests").doc(questId).set({
      ...quest,
      creatorId,
    });

    quests.push(quest);
  }

  logger.info(`Generated ${quests.length} daily quests for ${creatorId}`);

  return quests;
}

/**
 * Create default message templates
 */
async function createDefaultTemplates(creatorId: string): Promise<MessageTemplate[]> {
  const defaultTemplates = [
    {
      title: "Welcome Message",
      content: "Hey! Thanks for reaching out! I'm excited to chat with you 💕",
      category: "greeting" as const,
    },
    {
      title: "Goodbye",
      content: "Thanks for chatting! Talk to you soon! 😊",
      category: "goodbye" as const,
    },
    {
      title: "Product Promo",
      content: "Check out my exclusive content in my shop! 🛍️ Special offers available!",
      category: "promo" as const,
    },
  ];

  const templates: MessageTemplate[] = [];

  for (const tmpl of defaultTemplates) {
    const templateId = `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const template: MessageTemplate = {
      templateId,
      creatorId,
      title: tmpl.title,
      content: tmpl.content,
      category: tmpl.category,
      useCount: 0,
      createdAt: Timestamp.now(),
    };

    await db.collection("messageTemplates").doc(templateId).set(template);
    templates.push(template);
  }

  return templates;
}

logger.info("✅ Creator Hub module loaded successfully");

