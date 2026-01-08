/**
 * ========================================================================
 * AVALO 3.0 — PHASE 39: GAMIFIED SAFETY SYSTEM
 * ========================================================================
 *
 * Gamification layer that incentivizes users to adopt security best practices
 * through missions, badges, achievements, and tangible rewards.
 *
 * Key Features:
 * - Safety Quest System: Multi-step missions for security adoption
 * - Badge & Achievement System: Visual recognition for safety behaviors
 * - Reward Mechanics: Token rewards, trust tier boosts, profile badges
 * - Progressive Difficulty: Beginner → Advanced → Expert quests
 * - Leaderboards: Top safety-conscious users
 *
 * Quest Categories:
 * - Identity Verification: Complete KYC, phone/email verification, liveness check
 * - Account Security: Enable 2FA, set strong password, security questions
 * - Privacy Control: Review permissions, configure visibility, data export
 * - Community Safety: Report violations, review safety training, submit feedback
 * - Advanced Security: Audit login history, setup recovery methods, device trust
 *
 * Rewards:
 * - Tokens: 50-500 tokens per quest completion
 * - Trust Score Boost: +5 to +50 points
 * - Exclusive Badges: Displayed on profile
 * - Profile Verification Badges: Visual trust indicators
 * - Feature Unlocks: Early access to premium features
 *
 * @module safetyGamification
 * @version 3.0.0
 * @license Proprietary - Avalo Inc.
 */

;
;
;
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
import type { CallableRequest } from "firebase-functions/v2/https";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Quest difficulty levels
 */
export enum QuestDifficulty {
  BEGINNER = "beginner",     // 1-2 steps, 5-10 minutes
  INTERMEDIATE = "intermediate", // 3-5 steps, 15-30 minutes
  ADVANCED = "advanced",     // 6+ steps, 30+ minutes
  EXPERT = "expert",         // Complex multi-day quests
}

/**
 * Quest categories
 */
export enum QuestCategory {
  IDENTITY = "identity",
  SECURITY = "security",
  PRIVACY = "privacy",
  COMMUNITY = "community",
  ADVANCED = "advanced",
}

/**
 * Quest status
 */
export enum QuestStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CLAIMED = "claimed",         // Reward claimed
}

/**
 * Badge rarity tiers
 */
export enum BadgeRarity {
  COMMON = "common",
  RARE = "rare",
  EPIC = "epic",
  LEGENDARY = "legendary",
}

/**
 * Quest step definition
 */
interface QuestStep {
  stepId: string;
  title: string;
  description: string;
  actionType: string;          // e.g., "verify_email", "enable_2fa"
  completed: boolean;
  completedAt?: Timestamp;
}

/**
 * Quest definition
 */
interface SafetyQuest {
  questId: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  steps: QuestStep[];
  rewards: {
    tokens: number;
    trustScoreBoost: number;
    badges: string[];           // Badge IDs earned
    xp: number;
  };
  requirements?: {
    minAccountAge?: number;     // Days
    minTrustScore?: number;
    prerequisiteQuests?: string[];
  };
  isActive: boolean;
  createdAt: Timestamp;
  expiresAt?: Timestamp;        // Optional time-limited quests
}

/**
 * User quest progress
 */
interface UserQuestProgress {
  userId: string;
  questId: string;
  status: QuestStatus;
  steps: QuestStep[];
  progress: number;             // 0-100
  startedAt: Timestamp;
  completedAt?: Timestamp;
  claimedAt?: Timestamp;
}

/**
 * Badge definition
 */
interface SafetyBadge {
  badgeId: string;
  name: string;
  description: string;
  icon: string;                 // Emoji or icon name
  rarity: BadgeRarity;
  criteria: string;
  category: QuestCategory;
  createdAt: Timestamp;
}

/**
 * User badge
 */
interface UserBadge {
  userId: string;
  badgeId: string;
  earnedAt: Timestamp;
  displayed: boolean;           // Show on profile?
}

/**
 * User safety profile
 */
interface UserSafetyProfile {
  userId: string;
  level: number;                // Safety level (1-100)
  xp: number;                   // Safety XP
  totalQuestsCompleted: number;
  badges: UserBadge[];
  activeQuests: string[];       // Quest IDs in progress
  completedQuests: string[];    // Quest IDs completed
  lastQuestCompletedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// QUEST DEFINITIONS
// ============================================================================

/**
 * Pre-defined safety quests
 */
const QUEST_DEFINITIONS: SafetyQuest[] = [
  // ========== BEGINNER QUESTS ==========
  {
    questId: "verify_identity_basics",
    title: "Verify Your Identity",
    description: "Complete basic identity verification to build trust with the community",
    category: QuestCategory.IDENTITY,
    difficulty: QuestDifficulty.BEGINNER,
    steps: [
      {
        stepId: "verify_email",
        title: "Verify Email",
        description: "Verify your email address",
        actionType: "verify_email",
        completed: false,
      },
      {
        stepId: "verify_phone",
        title: "Verify Phone",
        description: "Verify your phone number",
        actionType: "verify_phone",
        completed: false,
      },
      {
        stepId: "upload_photo",
        title: "Upload Profile Photo",
        description: "Add a profile photo",
        actionType: "upload_photo",
        completed: false,
      },
    ],
    rewards: {
      tokens: 50,
      trustScoreBoost: 10,
      badges: ["verified_beginner"],
      xp: 100,
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },
  {
    questId: "secure_your_account",
    title: "Secure Your Account",
    description: "Enable essential security features to protect your account",
    category: QuestCategory.SECURITY,
    difficulty: QuestDifficulty.BEGINNER,
    steps: [
      {
        stepId: "enable_2fa",
        title: "Enable Two-Factor Authentication",
        description: "Add an extra layer of security with 2FA",
        actionType: "enable_2fa",
        completed: false,
      },
      {
        stepId: "set_strong_password",
        title: "Set Strong Password",
        description: "Create a password with at least 12 characters",
        actionType: "set_strong_password",
        completed: false,
      },
      {
        stepId: "review_sessions",
        title: "Review Active Sessions",
        description: "Check your active login sessions",
        actionType: "review_sessions",
        completed: false,
      },
    ],
    rewards: {
      tokens: 75,
      trustScoreBoost: 15,
      badges: ["security_conscious"],
      xp: 150,
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },

  // ========== INTERMEDIATE QUESTS ==========
  {
    questId: "full_kyc_verification",
    title: "Complete Full KYC Verification",
    description: "Complete identity verification to unlock premium features and boost trust",
    category: QuestCategory.IDENTITY,
    difficulty: QuestDifficulty.INTERMEDIATE,
    steps: [
      {
        stepId: "submit_id_document",
        title: "Submit ID Document",
        description: "Upload government-issued ID",
        actionType: "submit_id_document",
        completed: false,
      },
      {
        stepId: "liveness_check",
        title: "Complete Liveness Check",
        description: "Verify you're a real person with selfie video",
        actionType: "liveness_check",
        completed: false,
      },
      {
        stepId: "address_verification",
        title: "Verify Address",
        description: "Provide proof of address",
        actionType: "address_verification",
        completed: false,
      },
      {
        stepId: "wait_for_approval",
        title: "Wait for Approval",
        description: "Our team will review your submission",
        actionType: "wait_for_approval",
        completed: false,
      },
    ],
    rewards: {
      tokens: 200,
      trustScoreBoost: 50,
      badges: ["fully_verified", "trusted_member"],
      xp: 500,
    },
    requirements: {
      minAccountAge: 7,
      minTrustScore: 300,
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },
  {
    questId: "privacy_master",
    title: "Privacy Master",
    description: "Take control of your privacy settings and data",
    category: QuestCategory.PRIVACY,
    difficulty: QuestDifficulty.INTERMEDIATE,
    steps: [
      {
        stepId: "review_permissions",
        title: "Review App Permissions",
        description: "Check what data the app can access",
        actionType: "review_permissions",
        completed: false,
      },
      {
        stepId: "configure_visibility",
        title: "Configure Profile Visibility",
        description: "Choose who can see your profile",
        actionType: "configure_visibility",
        completed: false,
      },
      {
        stepId: "data_export",
        title: "Request Data Export",
        description: "Download a copy of your data",
        actionType: "data_export",
        completed: false,
      },
      {
        stepId: "manage_cookies",
        title: "Manage Cookie Preferences",
        description: "Control tracking and analytics",
        actionType: "manage_cookies",
        completed: false,
      },
    ],
    rewards: {
      tokens: 150,
      trustScoreBoost: 20,
      badges: ["privacy_advocate"],
      xp: 300,
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },

  // ========== ADVANCED QUESTS ==========
  {
    questId: "community_guardian",
    title: "Community Guardian",
    description: "Help keep the community safe by reporting violations and completing safety training",
    category: QuestCategory.COMMUNITY,
    difficulty: QuestDifficulty.ADVANCED,
    steps: [
      {
        stepId: "complete_safety_training",
        title: "Complete Safety Training",
        description: "Learn how to spot scams and report violations",
        actionType: "complete_safety_training",
        completed: false,
      },
      {
        stepId: "report_violations",
        title: "Report Violations",
        description: "Report 3 legitimate violations (verified by moderators)",
        actionType: "report_violations",
        completed: false,
      },
      {
        stepId: "help_new_users",
        title: "Help New Users",
        description: "Answer 5 safety questions in community forum",
        actionType: "help_new_users",
        completed: false,
      },
      {
        stepId: "review_guidelines",
        title: "Review Community Guidelines",
        description: "Read and acknowledge community standards",
        actionType: "review_guidelines",
        completed: false,
      },
    ],
    rewards: {
      tokens: 300,
      trustScoreBoost: 30,
      badges: ["community_guardian", "safety_hero"],
      xp: 750,
    },
    requirements: {
      minAccountAge: 30,
      minTrustScore: 600,
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },
  {
    questId: "security_expert",
    title: "Security Expert",
    description: "Master advanced security features and become a trusted member",
    category: QuestCategory.ADVANCED,
    difficulty: QuestDifficulty.EXPERT,
    steps: [
      {
        stepId: "setup_recovery_methods",
        title: "Setup Account Recovery",
        description: "Configure backup email and recovery codes",
        actionType: "setup_recovery_methods",
        completed: false,
      },
      {
        stepId: "audit_login_history",
        title: "Audit Login History",
        description: "Review 90 days of login activity",
        actionType: "audit_login_history",
        completed: false,
      },
      {
        stepId: "device_trust_setup",
        title: "Setup Device Trust",
        description: "Register trusted devices for enhanced security",
        actionType: "device_trust_setup",
        completed: false,
      },
      {
        stepId: "security_audit",
        title: "Complete Security Audit",
        description: "Review all security settings and optimize",
        actionType: "security_audit",
        completed: false,
      },
      {
        stepId: "maintain_high_trust",
        title: "Maintain High Trust Score",
        description: "Keep trust score above 800 for 30 days",
        actionType: "maintain_high_trust",
        completed: false,
      },
    ],
    rewards: {
      tokens: 500,
      trustScoreBoost: 50,
      badges: ["security_expert", "elite_guardian", "diamond_verified"],
      xp: 1500,
    },
    requirements: {
      minAccountAge: 90,
      minTrustScore: 800,
      prerequisiteQuests: ["full_kyc_verification", "secure_your_account"],
    },
    isActive: true,
    createdAt: Timestamp.now(),
  },
];

/**
 * Badge definitions
 */
const BADGE_DEFINITIONS: SafetyBadge[] = [
  {
    badgeId: "verified_beginner",
    name: "Verified Beginner",
    description: "Completed basic identity verification",
    icon: "✓",
    rarity: BadgeRarity.COMMON,
    criteria: "Complete 'Verify Your Identity' quest",
    category: QuestCategory.IDENTITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "security_conscious",
    name: "Security Conscious",
    description: "Enabled essential security features",
    icon: "🔒",
    rarity: BadgeRarity.COMMON,
    criteria: "Complete 'Secure Your Account' quest",
    category: QuestCategory.SECURITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "fully_verified",
    name: "Fully Verified",
    description: "Completed full KYC verification",
    icon: "🛡️",
    rarity: BadgeRarity.RARE,
    criteria: "Complete KYC process with government ID",
    category: QuestCategory.IDENTITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "trusted_member",
    name: "Trusted Member",
    description: "Recognized as a trusted community member",
    icon: "⭐",
    rarity: BadgeRarity.RARE,
    criteria: "Complete full KYC and maintain high trust score",
    category: QuestCategory.IDENTITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "privacy_advocate",
    name: "Privacy Advocate",
    description: "Mastered privacy settings",
    icon: "👁️",
    rarity: BadgeRarity.RARE,
    criteria: "Complete 'Privacy Master' quest",
    category: QuestCategory.PRIVACY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "community_guardian",
    name: "Community Guardian",
    description: "Actively helps keep the community safe",
    icon: "🛡️",
    rarity: BadgeRarity.EPIC,
    criteria: "Complete 'Community Guardian' quest",
    category: QuestCategory.COMMUNITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "safety_hero",
    name: "Safety Hero",
    description: "Exceptional contribution to community safety",
    icon: "🦸",
    rarity: BadgeRarity.EPIC,
    criteria: "Report 3+ verified violations",
    category: QuestCategory.COMMUNITY,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "security_expert",
    name: "Security Expert",
    description: "Mastered all security features",
    icon: "🏆",
    rarity: BadgeRarity.LEGENDARY,
    criteria: "Complete 'Security Expert' quest",
    category: QuestCategory.ADVANCED,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "elite_guardian",
    name: "Elite Guardian",
    description: "Top-tier trusted member",
    icon: "💎",
    rarity: BadgeRarity.LEGENDARY,
    criteria: "Maintain Diamond trust tier for 30+ days",
    category: QuestCategory.ADVANCED,
    createdAt: Timestamp.now(),
  },
  {
    badgeId: "diamond_verified",
    name: "Diamond Verified",
    description: "Highest level of verification and trust",
    icon: "💠",
    rarity: BadgeRarity.LEGENDARY,
    criteria: "Complete all quests and maintain perfect record",
    category: QuestCategory.ADVANCED,
    createdAt: Timestamp.now(),
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Initialize user safety profile
 */
async function initializeUserSafetyProfile(userId: string): Promise<UserSafetyProfile> {
  const db = getFirestore();

  const profile: UserSafetyProfile = {
    userId,
    level: 1,
    xp: 0,
    totalQuestsCompleted: 0,
    badges: [],
    activeQuests: [],
    completedQuests: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection("safety_profiles").doc(userId).set(profile);

  return profile;
}

/**
 * Get or create user safety profile
 */
async function getUserSafetyProfile(userId: string): Promise<UserSafetyProfile> {
  const db = getFirestore();
  const profileDoc = await db.collection("safety_profiles").doc(userId).get();

  if (profileDoc.exists) {
    return profileDoc.data() as UserSafetyProfile;
  }

  return initializeUserSafetyProfile(userId);
}

/**
 * Check if user meets quest requirements
 */
async function meetsQuestRequirements(
  userId: string,
  quest: SafetyQuest
): Promise<{ meets: boolean; reason?: string }> {
  if (!quest.requirements) {
    return { meets: true };
  }

  const db = getFirestore();

  // Check account age
  if (quest.requirements.minAccountAge) {
    const userDoc = await db.collection("users").doc(userId).get();
    const accountAge = Math.floor(
      (Date.now() - userDoc.data()!.createdAt.toMillis()) / (1000 * 60 * 60 * 24)
    );

    if (accountAge < quest.requirements.minAccountAge) {
      return {
        meets: false,
        reason: `Account must be at least ${quest.requirements.minAccountAge} days old`,
      };
    }
  }

  // Check trust score
  if (quest.requirements.minTrustScore) {
    const trustDoc = await db.collection("trust_profiles").doc(userId).get();
    const trustScore = trustDoc.exists ? trustDoc.data()!.breakdown.total : 0;

    if (trustScore < quest.requirements.minTrustScore) {
      return {
        meets: false,
        reason: `Requires trust score of ${quest.requirements.minTrustScore} or higher`,
      };
    }
  }

  // Check prerequisite quests
  if (quest.requirements.prerequisiteQuests && quest.requirements.prerequisiteQuests.length > 0) {
    const profile = await getUserSafetyProfile(userId);

    for (const prereqQuestId of quest.requirements.prerequisiteQuests) {
      if (!profile.completedQuests.includes(prereqQuestId)) {
        return {
          meets: false,
          reason: `Must complete prerequisite quest: ${prereqQuestId}`,
        };
      }
    }
  }

  return { meets: true };
}

/**
 * Calculate safety level from XP
 */
function calculateLevel(xp: number): number {
  // Level 1-100 progression
  // Level = floor(sqrt(XP / 100))
  return Math.min(100, Math.floor(Math.sqrt(xp / 100)) + 1);
}

/**
 * Award badge to user
 */
async function awardBadge(userId: string, badgeId: string): Promise<void> {
  const db = getFirestore();

  const userBadge: UserBadge = {
    userId,
    badgeId,
    earnedAt: Timestamp.now(),
    displayed: true,
  };

  await db
    .collection("safety_profiles")
    .doc(userId)
    .update({
      badges: FieldValue.arrayUnion(userBadge),
      updatedAt: FieldValue.serverTimestamp(),
    });

  logger.info(`Awarded badge ${badgeId} to user ${userId}`);
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Get all available safety quests for user
 *
 * @endpoint getAvailableQuestsV1
 * @auth required
 */
export const getAvailableQuestsV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest): Promise<{ quests: SafetyQuest[]; progress: Record<string, number> }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const db = getFirestore();
    const profile = await getUserSafetyProfile(userId);

    // Filter quests based on requirements
    const availableQuests: SafetyQuest[] = [];
    const progress: Record<string, number> = {};

    for (const quest of QUEST_DEFINITIONS) {
      if (!quest.isActive) continue;

      // Check if already completed
      if (profile.completedQuests.includes(quest.questId)) {
        progress[quest.questId] = 100;
        continue;
      }

      // Check requirements
      const requirementCheck = await meetsQuestRequirements(userId, quest);
      if (!requirementCheck.meets) {
        continue;
      }

      // Get progress if in progress
      const progressDoc = await db
        .collection("quest_progress")
        .doc(`${userId}_${quest.questId}`)
        .get();

      if (progressDoc.exists) {
        const progressData = progressDoc.data() as UserQuestProgress;
        progress[quest.questId] = progressData.progress;
      } else {
        progress[quest.questId] = 0;
      }

      availableQuests.push(quest);
    }

    return { quests: availableQuests, progress };
  }
);

/**
 * Start a safety quest
 *
 * @endpoint startQuestV1
 * @auth required
 */
export const startQuestV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest<{ questId: string }>): Promise<{ success: boolean; progress: UserQuestProgress }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { questId } = request.data;
    if (!questId) {
      throw new Error("questId required");
    }

    // Find quest
    const quest = QUEST_DEFINITIONS.find((q) => q.questId === questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    // Check requirements
    const requirementCheck = await meetsQuestRequirements(userId, quest);
    if (!requirementCheck.meets) {
      throw new Error(requirementCheck.reason || "Requirements not met");
    }

    const db = getFirestore();

    // Check if already started
    const progressId = `${userId}_${questId}`;
    const existingProgress = await db.collection("quest_progress").doc(progressId).get();

    if (existingProgress.exists) {
      return { success: true, progress: existingProgress.data() as UserQuestProgress };
    }

    // Create progress record
    const progress: UserQuestProgress = {
      userId,
      questId,
      status: QuestStatus.IN_PROGRESS,
      steps: quest.steps.map((step) => ({ ...step, completed: false })),
      progress: 0,
      startedAt: Timestamp.now(),
    };

    await db.collection("quest_progress").doc(progressId).set(progress);

    // Update profile
    await db
      .collection("safety_profiles")
      .doc(userId)
      .update({
        activeQuests: FieldValue.arrayUnion(questId),
        updatedAt: FieldValue.serverTimestamp(),
      });

    logger.info(`User ${userId} started quest ${questId}`);

    return { success: true, progress };
  }
);

/**
 * Complete a quest step
 *
 * @endpoint completeQuestStepV1
 * @auth required
 */
export const completeQuestStepV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{ questId: string; stepId: string }>
  ): Promise<{ success: boolean; questCompleted: boolean; rewards?: any }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { questId, stepId } = request.data;
    if (!questId || !stepId) {
      throw new Error("questId and stepId required");
    }

    const db = getFirestore();
    const progressId = `${userId}_${questId}`;
    const progressDoc = await db.collection("quest_progress").doc(progressId).get();

    if (!progressDoc.exists) {
      throw new Error("Quest not started");
    }

    const progress = progressDoc.data() as UserQuestProgress;

    // Find step
    const stepIndex = progress.steps.findIndex((s) => s.stepId === stepId);
    if (stepIndex === -1) {
      throw new Error("Step not found");
    }

    // Mark step complete
    progress.steps[stepIndex].completed = true;
    progress.steps[stepIndex].completedAt = Timestamp.now();

    // Calculate progress
    const completedSteps = progress.steps.filter((s) => s.completed).length;
    progress.progress = Math.round((completedSteps / progress.steps.length) * 100);

    // Check if quest complete
    const questCompleted = completedSteps === progress.steps.length;
    let rewards = null;

    if (questCompleted) {
      progress.status = QuestStatus.COMPLETED;
      progress.completedAt = Timestamp.now();

      // Find quest definition
      const quest = QUEST_DEFINITIONS.find((q) => q.questId === questId);
      if (quest) {
        rewards = quest.rewards;

        // Award tokens
        await db
          .collection("users")
          .doc(userId)
          .update({
            tokens: FieldValue.increment(rewards.tokens),
            updatedAt: FieldValue.serverTimestamp(),
          });

        // Boost trust score
        await db
          .collection("trust_profiles")
          .doc(userId)
          .update({
            "breakdown.communityStanding": FieldValue.increment(rewards.trustScoreBoost),
            "breakdown.total": FieldValue.increment(rewards.trustScoreBoost),
            lastUpdated: FieldValue.serverTimestamp(),
          });

        // Award badges
        for (const badgeId of rewards.badges) {
          await awardBadge(userId, badgeId);
        }

        // Update safety profile
        const profile = await getUserSafetyProfile(userId);
        const newXP = profile.xp + rewards.xp;
        const newLevel = calculateLevel(newXP);

        await db
          .collection("safety_profiles")
          .doc(userId)
          .update({
            xp: newXP,
            level: newLevel,
            totalQuestsCompleted: FieldValue.increment(1),
            activeQuests: FieldValue.arrayRemove(questId),
            completedQuests: FieldValue.arrayUnion(questId),
            lastQuestCompletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

        logger.info(`User ${userId} completed quest ${questId}, earned ${rewards.tokens} tokens`);
      }
    }

    // Update progress
    await db.collection("quest_progress").doc(progressId).update({
      steps: progress.steps,
      progress: progress.progress,
      status: progress.status,
      completedAt: progress.completedAt,
    });

    return { success: true, questCompleted, rewards };
  }
);

/**
 * Claim quest rewards (manual claim for completed quests)
 *
 * @endpoint claimQuestRewardsV1
 * @auth required
 */
export const claimQuestRewardsV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest<{ questId: string }>): Promise<{ success: boolean; rewards: any }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { questId } = request.data;

    const db = getFirestore();
    const progressId = `${userId}_${questId}`;
    const progressDoc = await db.collection("quest_progress").doc(progressId).get();

    if (!progressDoc.exists) {
      throw new Error("Quest not found");
    }

    const progress = progressDoc.data() as UserQuestProgress;

    if (progress.status !== QuestStatus.COMPLETED) {
      throw new Error("Quest not completed");
    }

    if (progress.claimedAt) {
      throw new Error("Rewards already claimed");
    }

    // Find quest
    const quest = QUEST_DEFINITIONS.find((q) => q.questId === questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    // Mark as claimed
    await db.collection("quest_progress").doc(progressId).update({
      status: QuestStatus.CLAIMED,
      claimedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, rewards: quest.rewards };
  }
);

/**
 * Get user's safety profile and statistics
 *
 * @endpoint getSafetyProfileV1
 * @auth required
 */
export const getSafetyProfileV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest<{ userId?: string }>): Promise<{ profile: UserSafetyProfile; badges: SafetyBadge[] }> => {
    const callerId = request.auth?.uid;
    if (!callerId) {
      throw new Error("Authentication required");
    }

    const targetUserId = request.data.userId || callerId;
    const profile = await getUserSafetyProfile(targetUserId);

    // Fetch badge details
    const badgeIds = profile.badges.map((b) => b.badgeId);
    const badges = BADGE_DEFINITIONS.filter((b) => badgeIds.includes(b.badgeId));

    return { profile, badges };
  }
);

/**
 * Get safety leaderboard
 *
 * @endpoint getSafetyLeaderboardV1
 * @auth required
 */
export const getSafetyLeaderboardV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{ limit?: number }>
  ): Promise<{
    leaderboard: Array<{ userId: string; level: number; xp: number; badges: number; rank: number }>;
  }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const limit = request.data.limit || 100;

    const db = getFirestore();
    const topProfiles = await db
      .collection("safety_profiles")
      .orderBy("xp", "desc")
      .limit(limit)
      .get();

    const leaderboard = topProfiles.docs.map((doc, index) => {
      const data = doc.data() as UserSafetyProfile;
      return {
        userId: doc.id,
        level: data.level,
        xp: data.xp,
        badges: data.badges.length,
        rank: index + 1,
      };
    });

    return { leaderboard };
  }
);

/**
 * Initialize quest definitions in Firestore (admin only)
 *
 * @endpoint seedQuestDefinitions
 * @auth admin
 */
export const seedQuestDefinitions = onCall(
  {
    region: "europe-west3",
    cors: true,
  },
  async (request: CallableRequest): Promise<{ success: boolean; seeded: number }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();
    const isAdmin = userDoc.data()?.role === "admin";

    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Seed quests
    for (const quest of QUEST_DEFINITIONS) {
      await db.collection("quest_definitions").doc(quest.questId).set(quest);
    }

    // Seed badges
    for (const badge of BADGE_DEFINITIONS) {
      await db.collection("badge_definitions").doc(badge.badgeId).set(badge);
    }

    logger.info(`Seeded ${QUEST_DEFINITIONS.length} quests and ${BADGE_DEFINITIONS.length} badges`);

    return { success: true, seeded: QUEST_DEFINITIONS.length + BADGE_DEFINITIONS.length };
  }
);


