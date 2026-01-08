/**
 * ========================================================================
 * AVALO 3.0 — PHASE 44: AI EXPLAINABILITY LAYER
 * ========================================================================
 *
 * Transparent algorithm disclosure system that explains to users why they
 * see specific profiles, content recommendations, and AI decisions.
 *
 * Key Features:
 * - Profile ranking explanation (why this profile was shown)
 * - Content recommendation reasoning
 * - Trust score breakdown transparency
 * - AI decision logging and appeals
 * - Algorithm factor weights disclosure
 * - Personalized algorithm controls
 *
 * Ranking Factors (weighted):
 * - Trust Score (25%): User's trust and verification level
 * - Compatibility (20%): Shared interests and profile similarity
 * - Activity Level (15%): Recent activity and responsiveness
 * - Geographic Proximity (15%): Physical distance
 * - Profile Quality (10%): Completeness and photo quality
 * - Responsiveness (10%): Message response rate
 * - Popularity (5%): Platform-wide engagement
 *
 * Transparency Goals:
 * - Build user trust through algorithm disclosure
 * - Enable informed consent for AI recommendations
 * - Provide appeal mechanism for AI decisions
 * - Support regulatory compliance (GDPR Article 22)
 * - Reduce algorithmic bias through transparency
 *
 * @module aiExplainability
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

interface RankingFactor {
  name: string;
  displayName: string;
  weight: number;              // % contribution to overall score
  score: number;               // 0-100 score for this factor
  explanation: string;         // Human-readable explanation
  category: "trust" | "compatibility" | "activity" | "quality";
}

interface RankingExplanation {
  profileId: string;
  profileName: string;
  totalScore: number;          // 0-100 overall match score
  factors: RankingFactor[];
  humanReadableSummary: string;
  topFactors: string[];        // Top 3 contributing factors
  improvementSuggestions: string[];
  generatedAt: Timestamp;
}

interface AIDecisionLog {
  decisionId: string;
  userId: string;
  decisionType: string;        // e.g., "profile_ranking", "content_moderation", "trust_score"
  decision: string;            // The actual decision made
  reasoning: string;           // Why this decision was made
  factors: Record<string, any>;
  model: string;               // AI model used
  canAppeal: boolean;
  timestamp: Timestamp;
  appealStatus?: "not_appealed" | "pending" | "approved" | "rejected";
}

interface Appeal {
  appealId: string;
  userId: string;
  decisionId: string;
  reason: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  outcome?: {
    decision: string;
    notes: string;
    timestamp: Timestamp;
  };
}

interface AlgorithmPreferences {
  userId: string;
  discoveryWeights: {
    trustScore: number;          // Default: 25
    compatibility: number;       // Default: 20
    activityLevel: number;       // Default: 15
    proximity: number;           // Default: 15
    profileQuality: number;      // Default: 10
    responsiveness: number;      // Default: 10
    popularity: number;          // Default: 5
  };
  filters: {
    minTrustScore?: number;
    maxDistance?: number;
    ageRange?: { min: number; max: number };
    verifiedOnly?: boolean;
  };
  updatedAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_WEIGHTS = {
  trustScore: 25,
  compatibility: 20,
  activityLevel: 15,
  proximity: 15,
  profileQuality: 10,
  responsiveness: 10,
  popularity: 5,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate compatibility between two users
 */
async function calculateCompatibility(viewerId: string, profileId: string): Promise<number> {
  const db = getFirestore();

  const [viewerDoc, profileDoc] = await Promise.all([
    db.collection("users").doc(viewerId).get(),
    db.collection("users").doc(profileId).get(),
  ]);

  const viewerData = viewerDoc.data();
  const profileData = profileDoc.data();

  if (!viewerData || !profileData) return 0;

  let compatibilityScore = 0;

  // Shared interests (0-40 points)
  const viewerInterests = new Set(viewerData.interests || []);
  const profileInterests = new Set(profileData.interests || []);
  const sharedInterests = [...viewerInterests].filter((i) => profileInterests.has(i));
  compatibilityScore += Math.min(40, sharedInterests.length * 8);

  // Age compatibility (0-20 points)
  if (viewerData.dateOfBirth && profileData.dateOfBirth) {
    const viewerAge = calculateAge(viewerData.dateOfBirth);
    const profileAge = calculateAge(profileData.dateOfBirth);
    const ageDiff = Math.abs(viewerAge - profileAge);

    if (ageDiff <= 3) compatibilityScore += 20;
    else if (ageDiff <= 5) compatibilityScore += 15;
    else if (ageDiff <= 10) compatibilityScore += 10;
  }

  // Shared values/looking for (0-20 points)
  const viewerLookingFor = viewerData.lookingFor || [];
  const profileLookingFor = profileData.lookingFor || [];
  const sharedValues = viewerLookingFor.filter((v: string) => profileLookingFor.includes(v));
  compatibilityScore += Math.min(20, sharedValues.length * 7);

  // Language compatibility (0-10 points)
  const viewerLanguages = new Set(viewerData.languages || []);
  const profileLanguages = new Set(profileData.languages || []);
  const sharedLanguages = [...viewerLanguages].filter((l) => profileLanguages.has(l));
  compatibilityScore += Math.min(10, sharedLanguages.length * 5);

  // Education level compatibility (0-10 points)
  if (viewerData.education && profileData.education) {
    if (viewerData.education === profileData.education) compatibilityScore += 10;
    else compatibilityScore += 5;
  }

  return Math.min(100, compatibilityScore);
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: any): number {
  const dob = dateOfBirth.toDate ? dateOfBirth.toDate() : new Date(dateOfBirth);
  const ageDiff = Date.now() - dob.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

/**
 * Calculate activity score
 */
function calculateActivityScore(lastActiveAt: Timestamp): number {
  const hoursSinceActive = (Date.now() - lastActiveAt.toMillis()) / (1000 * 60 * 60);

  if (hoursSinceActive < 1) return 100;
  if (hoursSinceActive < 4) return 90;
  if (hoursSinceActive < 12) return 75;
  if (hoursSinceActive < 24) return 60;
  if (hoursSinceActive < 72) return 40;
  if (hoursSinceActive < 168) return 20; // 1 week
  return 10;
}

/**
 * Calculate distance between two locations
 */
function calculateDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  if (!loc1 || !loc2) return 10000; // Unknown = far

  const R = 6371; // Earth radius in km
  const dLat = deg2rad(loc2.lat - loc1.lat);
  const dLng = deg2rad(loc2.lng - loc1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(loc1.lat)) * Math.cos(deg2rad(loc2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance);
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate profile completeness score
 */
function calculateCompleteness(profileData: any): number {
  let score = 0;

  if (profileData.photoURL) score += 25;
  if (profileData.bio && profileData.bio.length > 50) score += 20;
  if (profileData.interests && profileData.interests.length > 3) score += 15;
  if (profileData.occupation) score += 10;
  if (profileData.education) score += 10;
  if (profileData.languages && profileData.languages.length > 0) score += 10;
  if (profileData.looking_for && profileData.looking_for.length > 0) score += 10;

  return Math.min(100, score);
}

/**
 * Get user's response rate
 */
async function getResponseRate(userId: string): Promise<number> {
  const db = getFirestore();

  const statsDoc = await db.collection("messageStats").doc(userId).get();
  if (!statsDoc.exists) return 50; // Default: average

  const stats = statsDoc.data()!;
  if (stats.messagesReceived === 0) return 50;

  return Math.round((stats.messagesReplied / stats.messagesReceived) * 100);
}

/**
 * Get popularity score
 */
async function getPopularityScore(profileId: string): Promise<number> {
  const db = getFirestore();

  // Count profile views in last 7 days
  const oneWeekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const viewsSnapshot = await db
    .collection("profile_views")
    .where("viewedUserId", "==", profileId)
    .where("viewedAt", ">=", oneWeekAgo)
    .get();

  const viewCount = viewsSnapshot.size;

  // Count likes received
  const likesSnapshot = await db
    .collection("likes")
    .where("likedUserId", "==", profileId)
    .where("createdAt", ">=", oneWeekAgo)
    .get();

  const likeCount = likesSnapshot.size;

  // Calculate score (0-100)
  const score = Math.min(100, viewCount * 2 + likeCount * 5);
  return score;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Explain why a profile was shown/ranked
 *
 * @endpoint explainProfileRankingV1
 * @auth required
 */
export const explainProfileRankingV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{ profileId: string }>
  ): Promise<RankingExplanation> => {
    const viewerId = request.auth?.uid;
    if (!viewerId) {
      throw new Error("Authentication required");
    }

    const { profileId } = request.data;
    if (!profileId) {
      throw new Error("profileId required");
    }

    logger.info(`Generating ranking explanation for ${viewerId} viewing ${profileId}`);

    const db = getFirestore();
    const [viewerDoc, profileDoc, trustDoc] = await Promise.all([
      db.collection("users").doc(viewerId).get(),
      db.collection("users").doc(profileId).get(),
      db.collection("trust_profiles").doc(profileId).get(),
    ]);

    if (!profileDoc.exists) {
      throw new Error("Profile not found");
    }

    const viewerData = viewerDoc.data()!;
    const profileData = profileDoc.data()!;
    const trustData = trustDoc.data();

    // Get user's custom weights or use defaults
    const prefsDoc = await db.collection("algorithm_preferences").doc(viewerId).get();
    const weights = prefsDoc.exists
      ? prefsDoc.data()!.discoveryWeights
      : DEFAULT_WEIGHTS;

    const factors: RankingFactor[] = [];

    // 1. TRUST SCORE (25% weight)
    const trustScore = trustData?.breakdown.total || 0;
    const trustTier = trustData?.trustTier || "bronze";
    factors.push({
      name: "trustScore",
      displayName: "Trust & Verification",
      weight: weights.trustScore,
      score: Math.min(100, trustScore / 10),
      explanation: `This user has a ${trustTier} trust level (${trustScore}/1000). ${
        trustScore > 700 ? "Highly verified and trusted." :
        trustScore > 400 ? "Established and verified." :
        "Building trust through platform activity."
      }`,
      category: "trust",
    });

    // 2. COMPATIBILITY (20% weight)
    const compatibility = await calculateCompatibility(viewerId, profileId);
    const compatPercent = Math.round(compatibility);
    factors.push({
      name: "compatibility",
      displayName: "Profile Match",
      weight: weights.compatibility,
      score: compatibility,
      explanation: `You share ${compatPercent}% compatibility based on interests, values, and preferences. ${
        compatPercent > 75 ? "Excellent match!" :
        compatPercent > 50 ? "Good potential for connection." :
        "Some shared interests."
      }`,
      category: "compatibility",
    });

    // 3. ACTIVITY LEVEL (15% weight)
    const lastActive = profileData.lastActiveAt || Timestamp.now();
    const activityScore = calculateActivityScore(lastActive);
    const hoursAgo = Math.round((Date.now() - lastActive.toMillis()) / (1000 * 60 * 60));
    factors.push({
      name: "activityLevel",
      displayName: "Activity & Responsiveness",
      weight: weights.activityLevel,
      score: activityScore,
      explanation: `Last active ${
        hoursAgo < 1 ? "less than an hour ago" :
        hoursAgo < 24 ? `${hoursAgo} hours ago` :
        `${Math.floor(hoursAgo / 24)} days ago`
      }. ${activityScore > 80 ? "Very active user." : "Moderately active."}`,
      category: "activity",
    });

    // 4. GEOGRAPHIC PROXIMITY (15% weight)
    const distance = viewerData.location && profileData.location
      ? calculateDistance(viewerData.location, profileData.location)
      : 10000;
    const proximityScore = Math.max(0, 100 - Math.min(100, distance / 10));
    factors.push({
      name: "proximity",
      displayName: "Distance",
      weight: weights.proximity,
      score: proximityScore,
      explanation: distance < 10000
        ? `Located ${distance} km away. ${
            distance < 10 ? "Very close to you!" :
            distance < 50 ? "Within your area." :
            distance < 200 ? "Nearby region." :
            "Different region."
          }`
        : "Location not specified.",
      category: "compatibility",
    });

    // 5. PROFILE QUALITY (10% weight)
    const completeness = calculateCompleteness(profileData);
    factors.push({
      name: "profileQuality",
      displayName: "Profile Completeness",
      weight: weights.profileQuality,
      score: completeness,
      explanation: `Profile is ${completeness}% complete with ${
        profileData.photoURL ? "photos, " : ""
      }${
        profileData.bio ? "bio, " : ""
      }${
        profileData.interests?.length > 0 ? "interests, " : ""
      }and other details.`,
      category: "quality",
    });

    // 6. RESPONSIVENESS (10% weight)
    const responseRate = await getResponseRate(profileId);
    factors.push({
      name: "responsiveness",
      displayName: "Message Response Rate",
      weight: weights.responsiveness,
      score: responseRate,
      explanation: `Responds to ${responseRate}% of messages. ${
        responseRate > 80 ? "Very responsive!" :
        responseRate > 50 ? "Usually responds." :
        "Response time may vary."
      }`,
      category: "activity",
    });

    // 7. POPULARITY (5% weight)
    const popularity = await getPopularityScore(profileId);
    factors.push({
      name: "popularity",
      displayName: "Platform Popularity",
      weight: weights.popularity,
      score: popularity,
      explanation: `Receives ${
        popularity > 75 ? "high" :
        popularity > 50 ? "above-average" :
        popularity > 25 ? "average" :
        "modest"
      } interest from other users.`,
      category: "activity",
    });

    // Calculate weighted total score
    const totalScore = Math.round(
      factors.reduce((sum, factor) => sum + (factor.score * factor.weight / 100), 0)
    );

    // Generate human-readable summary
    const topFactors = factors
      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
      .slice(0, 3)
      .map((f) => f.displayName);

    const summary = `This profile was recommended primarily based on ${topFactors.join(", ")}. ` +
      `Overall match score: ${totalScore}%. ` +
      (totalScore > 75 ? "Excellent potential match!" :
       totalScore > 50 ? "Good compatibility potential." :
       "Consider messaging to learn more.");

    // Generate improvement suggestions
    const improvementSuggestions: string[] = [];
    const lowFactors = factors.filter((f) => f.score < 50).sort((a, b) => a.score - b.score);

    if (lowFactors.length > 0) {
      lowFactors.slice(0, 2).forEach((factor) => {
        if (factor.name === "profileQuality") {
          improvementSuggestions.push("Complete your profile to see better matches");
        } else if (factor.name === "compatibility") {
          improvementSuggestions.push("Add more interests to find compatible profiles");
        } else if (factor.name === "trustScore") {
          improvementSuggestions.push("Complete verification to boost your trust score");
        }
      });
    }

    const explanation: RankingExplanation = {
      profileId,
      profileName: profileData.displayName || "User",
      totalScore,
      factors,
      humanReadableSummary: summary,
      topFactors,
      improvementSuggestions,
      generatedAt: Timestamp.now(),
    };

    // Log the explanation request
    await db.collection("explainability_logs").add({
      viewerId,
      profileId,
      totalScore,
      timestamp: FieldValue.serverTimestamp(),
    });

    return explanation;
  }
);

/**
 * Get all AI decisions affecting a user
 *
 * @endpoint getAIDecisionLogsV1
 * @auth required
 */
export const getAIDecisionLogsV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{ limit?: number }>
  ): Promise<{ decisions: AIDecisionLog[] }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const limit = request.data.limit || 50;
    const db = getFirestore();

    const decisionsSnapshot = await db
      .collection("ai_decision_logs")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const decisions = decisionsSnapshot.docs.map((doc) => ({
      decisionId: doc.id,
      ...doc.data(),
    })) as AIDecisionLog[];

    return { decisions };
  }
);

/**
 * Appeal an AI decision
 *
 * @endpoint appealAIDecisionV1
 * @auth required
 */
export const appealAIDecisionV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{
      decisionId: string;
      reason: string;
    }>
  ): Promise<{ appealId: string; estimatedReviewTime: string }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { decisionId, reason } = request.data;

    if (!reason || reason.length < 10) {
      throw new Error("Please provide a detailed reason for your appeal (minimum 10 characters)");
    }

    const db = getFirestore();

    // Verify decision exists and belongs to user
    const decisionDoc = await db.collection("ai_decision_logs").doc(decisionId).get();
    if (!decisionDoc.exists) {
      throw new Error("Decision not found");
    }

    const decision = decisionDoc.data() as AIDecisionLog;
    if (decision.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (!decision.canAppeal) {
      throw new Error("This decision cannot be appealed");
    }

    // Check for existing appeal
    const existingAppeals = await db
      .collection("appeals")
      .where("decisionId", "==", decisionId)
      .where("status", "in", ["pending", "under_review"])
      .get();

    if (!existingAppeals.empty) {
      throw new Error("An appeal for this decision is already pending");
    }

    const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const appeal: Appeal = {
      appealId,
      userId,
      decisionId,
      reason,
      status: "pending",
      submittedAt: Timestamp.now(),
    };

    await db.collection("appeals").doc(appealId).set(appeal);

    // Update decision log
    await decisionDoc.ref.update({
      appealStatus: "pending",
    });

    logger.info(`User ${userId} appealed decision ${decisionId}`);

    return {
      appealId,
      estimatedReviewTime: "We'll review your appeal within 48 hours",
    };
  }
);

/**
 * Get/update algorithm preferences
 *
 * @endpoint updateAlgorithmPreferencesV1
 * @auth required
 */
export const updateAlgorithmPreferencesV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
  },
  async (
    request: CallableRequest<{
      weights?: Partial<AlgorithmPreferences["discoveryWeights"]>;
      filters?: Partial<AlgorithmPreferences["filters"]>;
    }>
  ): Promise<{ success: boolean; preferences: AlgorithmPreferences }> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const db = getFirestore();
    const prefsRef = db.collection("algorithm_preferences").doc(userId);
    const prefsDoc = await prefsRef.get();

    let preferences: AlgorithmPreferences;

    if (prefsDoc.exists) {
      // Update existing preferences
      const updates: any = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (request.data.weights) {
        // Validate weights sum to 100
        const currentWeights = prefsDoc.data()!.discoveryWeights;
        const newWeights = { ...currentWeights, ...request.data.weights };
        const numericValues = Object.values(newWeights).map((v) => Number(v));
const sum = numericValues.reduce((a, b) => a + b, 0);

        if (Math.abs(sum - 100) > 1) {
          throw new Error("Weights must sum to 100%");
        }

        updates.discoveryWeights = newWeights;
      }

      if (request.data.filters) {
        updates.filters = { ...prefsDoc.data()!.filters, ...request.data.filters };
      }

      await prefsRef.update(updates);
      preferences = (await prefsRef.get()).data() as AlgorithmPreferences;
    } else {
      // Create new preferences
      preferences = {
        userId,
        discoveryWeights: { ...DEFAULT_WEIGHTS, ...(request.data.weights || {}) },
        filters: request.data.filters || {},
        updatedAt: Timestamp.now(),
      };

      await prefsRef.set(preferences);
    }

    logger.info(`Updated algorithm preferences for user ${userId}`);

    return { success: true, preferences };
  }
);

/**
 * Get algorithm transparency report
 *
 * @endpoint getAlgorithmTransparencyV1
 */
export const getAlgorithmTransparencyV1 = onCall(
  {
    region: "europe-west3",
    cors: true,
  },
  async (): Promise<{
    version: string;
    lastUpdated: string;
    defaultWeights: typeof DEFAULT_WEIGHTS;
    factorDescriptions: Record<string, string>;
    ethicsStatement: string;
  }> => {
    return {
      version: "3.0.0",
      lastUpdated: "2025-10-29",
      defaultWeights: DEFAULT_WEIGHTS,
      factorDescriptions: {
        trustScore: "Your trust and verification level based on identity verification, behavior, and community standing",
        compatibility: "Shared interests, values, and profile similarity",
        activityLevel: "How recently and frequently the user is active on the platform",
        proximity: "Geographic distance between you and the profile",
        profileQuality: "Profile completeness including photos, bio, and details",
        responsiveness: "How quickly and consistently the user responds to messages",
        popularity: "Overall platform engagement and interest from other users",
      },
      ethicsStatement: `Avalo is committed to transparent, fair, and ethical AI. Our ranking algorithm:

• Prioritizes safety through trust scores and verification
• Does not discriminate based on protected characteristics
• Is customizable - you control your matching preferences
• Is auditable - you can see exactly why you see each profile
• Continuously learns from your feedback to improve matches
• Complies with GDPR Article 22 (right to explanation)

We believe in empowering users with knowledge about how our platform works, enabling informed choices and building trust through transparency.`,
    };
  }
);

/**
 * Log AI decision for transparency
 *
 * @internal Use this to log all AI decisions
 */
export async function logAIDecision(
  userId: string,
  decisionType: string,
  decision: string,
  reasoning: string,
  factors: Record<string, any>,
  model: string,
  canAppeal: boolean = true
): Promise<string> {
  const db = getFirestore();

  const decisionLog: AIDecisionLog = {
    decisionId: `decision_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    userId,
    decisionType,
    decision,
    reasoning,
    factors,
    model,
    canAppeal,
    timestamp: Timestamp.now(),
    appealStatus: "not_appealed",
  };

  await db.collection("ai_decision_logs").add(decisionLog);

  logger.info(`Logged AI decision for user ${userId}: ${decisionType}`);

  return decisionLog.decisionId;
}

