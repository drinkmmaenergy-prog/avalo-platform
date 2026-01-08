/**
 * ========================================================================
 * AVALO MATCHMAKING ENGINE
 * ========================================================================
 *
 * Production-grade matchmaking and discovery system
 *
 * Core Logic:
 * - Likes immediately unlock chat if mutual
 * - First 4 messages free per chat
 * - Anti-spam detection and low-effort blocking
 * - Profile ranking system for visibility
 * - Integration with loyalty system
 * - Dynamic pricing based on demand
 *
 * Features:
 * - Smart matching algorithm
 * - Geographic proximity
 * - Preference matching
 * - Quality score filtering
 * - Royal Club priority
 * - Engagement optimization
 *
 * @version 3.0.0
 * @module matchingEngine
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
;

const db = getFirestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const FREE_MESSAGES_PER_CHAT = 4;
const MAX_LIKES_PER_DAY = 100;
const MAX_DAILY_MATCHES = 50;

// Ranking weights
const RANKING_WEIGHTS = {
  photoQuality: 0.25,
  profileCompleteness: 0.20,
  responseRate: 0.20,
  loyaltyTier: 0.15,
  lastActive: 0.10,
  reportCount: -0.10, // Negative weight
};

// Anti-spam thresholds
const SPAM_THRESHOLDS = {
  minMessageLength: 3,
  maxRepeatedMessages: 3,
  minTimeBetwenMessages: 1000, // 1 second
  genericMessagePatterns: ["hi", "hey", "hello", "sup", "yo"],
};

// ============================================================================
// TYPES
// ============================================================================

export interface Like {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: Timestamp;
  mutual: boolean;
  chatUnlocked: boolean;
  chatId?: string;
}

export interface Match {
  id: string;
  userId1: string;
  userId2: string;
  matchedAt: Timestamp;
  chatId: string;
  matchScore: number;
  freeMessagesRemaining: number;
  lastActivityAt: Timestamp;
}

export interface ProfileRanking {
  userId: string;
  score: number;
  components: {
    photoQuality: number;
    profileCompleteness: number;
    responseRate: number;
    loyaltyTier: number;
    lastActive: number;
    reportPenalty: number;
  };
  rank: number;
  lastUpdated: Timestamp;
}

// ============================================================================
// LIKE SYSTEM
// ============================================================================

/**
 * Send like to user - automatically creates chat if mutual
 */
export const likeUserV1 = onCall(
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
      targetUserId: z.string(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { targetUserId } = validation.data;

    // Can't like yourself
    if (uid === targetUserId) {
      throw new HttpsError("invalid-argument", "Cannot like yourself");
    }

    try {
      // Check daily limit
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayLikesCount = await db
        .collection("likes")
        .where("fromUserId", "==", uid)
        .where("createdAt", ">=", Timestamp.fromDate(todayStart))
        .count()
        .get();

      if (todayLikesCount.data().count >= MAX_LIKES_PER_DAY) {
        throw new HttpsError(
          "resource-exhausted",
          "Daily like limit reached. Try again tomorrow!"
        );
      }

      // Check if already liked
      const existingLike = await db
        .collection("likes")
        .where("fromUserId", "==", uid)
        .where("toUserId", "==", targetUserId)
        .limit(1)
        .get();

      if (!existingLike.empty) {
        throw new HttpsError("already-exists", "Already liked this user");
      }

      // Check if target user liked back (mutual like)
      const reverseLike = await db
        .collection("likes")
        .where("fromUserId", "==", targetUserId)
        .where("toUserId", "==", uid)
        .limit(1)
        .get();

      const isMutual = !reverseLike.empty;
      let chatId: string | undefined;
      let matchCreated = false;

      if (isMutual) {
        // Create chat immediately for mutual like
        const chatRef = db.collection("chats").doc();
        chatId = chatRef.id;

        await db.runTransaction(async (transaction) => {
          // Create chat
          transaction.set(chatRef, {
            chatId: chatRef.id,
            participants: [uid, targetUserId],
            status: "active",
            freeMessagesRemaining: FREE_MESSAGES_PER_CHAT,
            matchedAt: FieldValue.serverTimestamp(),
            lastActivityAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            metadata: {
              matchType: "mutual_like",
            },
          });

          // Create match record
          const matchRef = db.collection("matches").doc();
          transaction.set(matchRef, {
            id: matchRef.id,
            userId1: uid,
            userId2: targetUserId,
            matchedAt: FieldValue.serverTimestamp(),
            chatId: chatRef.id,
            matchScore: 0, // Calculate in background
            freeMessagesRemaining: FREE_MESSAGES_PER_CHAT,
            lastActivityAt: FieldValue.serverTimestamp(),
          });

          // Create like with mutual flag
          const likeRef = db.collection("likes").doc();
          transaction.set(likeRef, {
            id: likeRef.id,
            fromUserId: uid,
            toUserId: targetUserId,
            createdAt: FieldValue.serverTimestamp(),
            mutual: true,
            chatUnlocked: true,
            chatId: chatRef.id,
          });

          // Update reverse like
          if (!reverseLike.empty) {
            transaction.update(reverseLike.docs[0].ref, {
              mutual: true,
              chatUnlocked: true,
              chatId: chatRef.id,
            });
          }
        });

        matchCreated = true;
        logger.info(`Mutual match created: ${uid} ↔ ${targetUserId}, chat: ${chatId}`);
      } else {
        // One-way like
        const likeRef = db.collection("likes").doc();
        await likeRef.set({
          id: likeRef.id,
          fromUserId: uid,
          toUserId: targetUserId,
          createdAt: FieldValue.serverTimestamp(),
          mutual: false,
          chatUnlocked: false,
        });

        logger.info(`Like sent: ${uid} → ${targetUserId}`);
      }

      return {
        success: true,
        mutual: isMutual,
        matchCreated,
        chatId,
        freeMessagesRemaining: isMutual ? FREE_MESSAGES_PER_CHAT : undefined,
      };
    } catch (error: any) {
      logger.error("Like failed:", error);
      throw new HttpsError("internal", "Failed to process like");
    }
  }
);

// ============================================================================
// ANTI-SPAM DETECTION
// ============================================================================

/**
 * Check if message is spam/low-effort
 */
export function detectSpam(
  message: string,
  recentMessages: string[]
): { isSpam: boolean; reason?: string } {
  // Check message length
  if (message.trim().length < SPAM_THRESHOLDS.minMessageLength) {
    return { isSpam: true, reason: "Message too short" };
  }

  // Check for repeated identical messages
  const identicalCount = recentMessages.filter((m) => m === message).length;
  if (identicalCount >= SPAM_THRESHOLDS.maxRepeatedMessages) {
    return { isSpam: true, reason: "Repeated message detected" };
  }

  // Check for generic low-effort messages
  const lowerMessage = message.toLowerCase().trim();
  if (SPAM_THRESHOLDS.genericMessagePatterns.includes(lowerMessage)) {
    return { isSpam: true, reason: "Low-effort generic message" };
  }

  // Check for excessive emojis only
  const emojiOnly = /^[\u{1F300}-\u{1F9FF}\s]+$/u.test(message);
  if (emojiOnly && message.length < 10) {
    return { isSpam: true, reason: "Emoji-only message" };
  }

  return { isSpam: false };
}

/**
 * Track message sending rate
 */
async function checkMessageVelocity(
  userId: string,
  chatId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get last message timestamp
    const lastMessageDoc = await db
      .collection("message_velocity")
      .doc(`${userId}_${chatId}`)
      .get();

    if (lastMessageDoc.exists) {
      const lastMessageTime = lastMessageDoc.data()?.lastMessageAt?.toMillis() || 0;
      const timeSinceLastMessage = Date.now() - lastMessageTime;

      if (timeSinceLastMessage < SPAM_THRESHOLDS.minTimeBetwenMessages) {
        return {
          allowed: false,
          reason: "Sending messages too quickly. Please wait a moment.",
        };
      }
    }

    // Update velocity tracker
    await db
      .collection("message_velocity")
      .doc(`${userId}_${chatId}`)
      .set({
        lastMessageAt: FieldValue.serverTimestamp(),
      });

    return { allowed: true };
  } catch (error: any) {
    logger.error("Message velocity check failed:", error);
    return { allowed: true }; // Fail open
  }
}

// ============================================================================
// PROFILE RANKING SYSTEM
// ============================================================================

/**
 * Calculate profile quality score
 */
export async function calculateProfileRanking(userId: string): Promise<ProfileRanking> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new Error("User not found");
    }

    const components = {
      photoQuality: 0,
      profileCompleteness: 0,
      responseRate: 0,
      loyaltyTier: 0,
      lastActive: 0,
      reportPenalty: 0,
    };

    // 1. Photo Quality (0-1)
    const photoCount = userData.photos?.length || 0;
    const hasVideoIntro = !!userData.videoIntro;
    components.photoQuality = Math.min(1, (photoCount / 6) + (hasVideoIntro ? 0.2 : 0));

    // 2. Profile Completeness (0-1)
    const requiredFields = ["bio", "age", "gender", "location", "interests"];
    const completedFields = requiredFields.filter((field) => userData[field]).length;
    components.profileCompleteness = completedFields / requiredFields.length;

    // 3. Response Rate (0-1)
    const responseStats = userData.chatStats?.responseRate || 0.5;
    components.responseRate = responseStats;

    // 4. Loyalty Tier (0-1)
    const loyaltyLevel = userData.loyalty?.level || 1;
    const isRoyal = userData.roles?.royal || false;
    components.loyaltyTier = isRoyal ? 1.0 : Math.min(1, loyaltyLevel / 10);

    // 5. Last Active (0-1, decays over time)
    const lastActiveAt = userData.lastActiveAt?.toMillis() || Date.now();
    const hoursSinceActive = (Date.now() - lastActiveAt) / (1000 * 60 * 60);
    components.lastActive = Math.max(0, 1 - hoursSinceActive / 168); // Decays over 7 days

    // 6. Report Penalty (-0.5 to 0)
    const reportCount = userData.moderation?.reportCount || 0;
    components.reportPenalty = -Math.min(0.5, reportCount * 0.1);

    // Calculate weighted score
    let score = 0;
    score += components.photoQuality * RANKING_WEIGHTS.photoQuality;
    score += components.profileCompleteness * RANKING_WEIGHTS.profileCompleteness;
    score += components.responseRate * RANKING_WEIGHTS.responseRate;
    score += components.loyaltyTier * RANKING_WEIGHTS.loyaltyTier;
    score += components.lastActive * RANKING_WEIGHTS.lastActive;
    score += components.reportPenalty * Math.abs(RANKING_WEIGHTS.reportCount);

    // Normalize to 0-100
    const normalizedScore = Math.max(0, Math.min(100, score * 100));

    const ranking: ProfileRanking = {
      userId,
      score: normalizedScore,
      components,
      rank: 0, // Set during batch ranking
      lastUpdated: Timestamp.now(),
    };

    // Store ranking
    await db.collection("profile_rankings").doc(userId).set(ranking);

    return ranking;
  } catch (error: any) {
    logger.error(`Failed to calculate ranking for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get discovery feed with ranking
 */
export const getDiscoveryFeedV1 = onCall(
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
      limit: z.number().min(1).max(50).default(20),
      filters: z.object({
        minAge: z.number().optional(),
        maxAge: z.number().optional(),
        gender: z.string().optional(),
        maxDistance: z.number().optional(), // km
      }).optional(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { limit, filters } = validation.data;

    try {
      // Get user profile for matching
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData) {
        throw new HttpsError("not-found", "User profile not found");
      }

      // Get users already liked/matched
      const likedUsers = await db
        .collection("likes")
        .where("fromUserId", "==", uid)
        .get();

      const likedUserIds = new Set(likedUsers.docs.map((doc) => doc.data().toUserId));
      likedUserIds.add(uid); // Exclude self

      // Build query for discovery
      let query = db
        .collection("users")
        .where("isActive", "==", true)
        .where("verification.status", "==", "approved");

      // Apply filters
      if (filters?.gender && filters.gender !== "any") {
        query = query.where("gender", "==", filters.gender) as any;
      }

      if (filters?.minAge) {
        const maxBirthYear = new Date().getFullYear() - filters.minAge;
        query = query.where("birthYear", "<=", maxBirthYear) as any;
      }

      if (filters?.maxAge) {
        const minBirthYear = new Date().getFullYear() - filters.maxAge;
        query = query.where("birthYear", ">=", minBirthYear) as any;
      }

      // Get candidate profiles
      const candidatesSnapshot = await query.limit(limit * 3).get();

      // Filter and rank candidates
      const candidates = candidatesSnapshot.docs
        .map((doc) => ({
          userId: doc.id,
          ...doc.data(),
        }))
        .filter((user: any) => {
          // Exclude already liked
          if (likedUserIds.has(user.userId)) return false;

          // Distance filter (if applicable)
          if (filters?.maxDistance && userData.location && user.location) {
            const distance = calculateDistance(
              userData.location.latitude,
              userData.location.longitude,
              user.location.latitude,
              user.location.longitude
            );
            if (distance > filters.maxDistance) return false;
          }

          return true;
        });

      // Get rankings for candidates
      const rankedCandidates = await Promise.all(
        candidates.map(async (user: any) => {
          const rankingDoc = await db
            .collection("profile_rankings")
            .doc(user.userId)
            .get();

          const ranking = rankingDoc.data() as ProfileRanking;

          return {
            ...user,
            rankingScore: ranking?.score || 50,
          };
        })
      );

      // Sort by ranking score (highest first)
      rankedCandidates.sort((a, b) => b.rankingScore - a.rankingScore);

      // Royal Club members get priority
      rankedCandidates.sort((a, b) => {
        const aRoyal = a.roles?.royal ? 1 : 0;
        const bRoyal = b.roles?.royal ? 1 : 0;
        return bRoyal - aRoyal;
      });

      // Limit results
      const profiles = rankedCandidates.slice(0, limit);

      logger.info(`Discovery feed for ${uid}: ${profiles.length} profiles`);

      return {
        success: true,
        profiles: profiles.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          age: p.age,
          photos: p.photos || [],
          bio: p.bio,
          verified: p.verification?.status === "approved",
          isRoyal: p.roles?.royal || false,
          rankingScore: p.rankingScore,
          distance: userData.location && p.location
            ? calculateDistance(
                userData.location.latitude,
                userData.location.longitude,
                p.location.latitude,
                p.location.longitude
              )
            : undefined,
        })),
        hasMore: rankedCandidates.length > limit,
      };
    } catch (error: any) {
      logger.error("Discovery feed failed:", error);
      throw new HttpsError("internal", "Failed to get discovery feed");
    }
  }
);

// ============================================================================
// MATCH MANAGEMENT
// ============================================================================

/**
 * Get matches for user
 */
export const getMatchesV1 = onCall(
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
      const matchesSnapshot = await db
        .collection("matches")
        .where("userId1", "==", uid)
        .orderBy("lastActivityAt", "desc")
        .limit(50)
        .get();

      const matches2Snapshot = await db
        .collection("matches")
        .where("userId2", "==", uid)
        .orderBy("lastActivityAt", "desc")
        .limit(50)
        .get();

      const allMatches = [
        ...matchesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ...matches2Snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ];

      // Sort by last activity
      allMatches.sort((a: any, b: any) => {
        const aTime = a.lastActivityAt?.toMillis() || 0;
        const bTime = b.lastActivityAt?.toMillis() || 0;
        return bTime - aTime;
      });

      // Get match user details
      const enrichedMatches = await Promise.all(
        allMatches.slice(0, 20).map(async (match: any) => {
          const matchUserId = match.userId1 === uid ? match.userId2 : match.userId1;
          const matchUserDoc = await db.collection("users").doc(matchUserId).get();
          const matchUser = matchUserDoc.data();

          return {
            matchId: match.id,
            userId: matchUserId,
            displayName: matchUser?.displayName,
            photo: matchUser?.photos?.[0],
            chatId: match.chatId,
            matchedAt: match.matchedAt,
            lastActivityAt: match.lastActivityAt,
            freeMessagesRemaining: match.freeMessagesRemaining || 0,
          };
        })
      );

      return {
        success: true,
        matches: enrichedMatches,
        total: allMatches.length,
      };
    } catch (error: any) {
      logger.error("Get matches failed:", error);
      throw new HttpsError("internal", "Failed to get matches");
    }
  }
);

// ============================================================================
// ENHANCED MESSAGING WITH SPAM DETECTION
// ============================================================================

/**
 * Send message with spam detection
 */
export async function sendMessageWithSpamCheck(
  chatId: string,
  senderId: string,
  message: string
): Promise<{ allowed: boolean; reason?: string; tokensCharged?: number }> {
  try {
    // Get recent messages from sender in this chat
    const recentMessages = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .where("senderId", "==", senderId)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const recentMessageTexts = recentMessages.docs.map((doc) => doc.data().text || "");

    // Check spam
    const spamCheck = detectSpam(message, recentMessageTexts);
    if (spamCheck.isSpam) {
      logger.warn(`Spam detected from ${senderId}: ${spamCheck.reason}`);

      // Log spam attempt
      await db.collection("spam_logs").add({
        userId: senderId,
        chatId,
        message,
        reason: spamCheck.reason,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { allowed: false, reason: spamCheck.reason };
    }

    // Check velocity
    const velocityCheck = await checkMessageVelocity(senderId, chatId);
    if (!velocityCheck.allowed) {
      return { allowed: false, reason: velocityCheck.reason };
    }

    return { allowed: true };
  } catch (error: any) {
    logger.error("Spam check failed:", error);
    return { allowed: true }; // Fail open
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Update user's last active timestamp
 */
export async function updateLastActive(userId: string): Promise<void> {
  try {
    await db.collection("users").doc(userId).update({
      lastActiveAt: FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    logger.error("Failed to update last active:", error);
  }
}

/**
 * Get match statistics for user
 */
export async function getMatchStats(userId: string): Promise<{
  totalLikes: number;
  totalMatches: number;
  likeBackRate: number;
  avgResponseTime: number;
}> {
  try {
    const [likesSnapshot, matchesSnapshot, receivedLikesSnapshot] = await Promise.all([
      db.collection("likes").where("fromUserId", "==", userId).count().get(),
      db.collection("matches")
        .where("userId1", "==", userId)
        .count()
        .get(),
      db.collection("likes").where("toUserId", "==", userId).count().get(),
    ]);

    const totalLikes = likesSnapshot.data().count;
    const totalMatches = matchesSnapshot.data().count;
    const receivedLikes = receivedLikesSnapshot.data().count;

    const likeBackRate = receivedLikes > 0 ? (totalMatches / receivedLikes) * 100 : 0;

    return {
      totalLikes,
      totalMatches,
      likeBackRate: Math.round(likeBackRate * 10) / 10,
      avgResponseTime: 0, // Calculate from chat messages
    };
  } catch (error: any) {
    logger.error("Failed to get match stats:", error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  likeUserV1,
  getDiscoveryFeedV1,
  getMatchesV1,
  calculateProfileRanking,
  detectSpam,
  sendMessageWithSpamCheck,
  getMatchStats,
  updateLastActive,
};

