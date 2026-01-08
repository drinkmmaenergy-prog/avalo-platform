/**
 * ========================================================================
 * CHAT SECURITY & ANTI-ABUSE SYSTEM
 * ========================================================================
 * Advanced protection against spam, abuse, and fraud
 *
 * Features:
 * - Real-time spam detection
 * - Throttling and rate limiting
 * - Duplicate message blocking
 * - Copy-paste spam detection
 * - Anti-extortion monitoring
 * - Toxic content filtering
 * - Auto-ban pipeline
 * - Session fingerprinting
 * - Behavioral analysis
 *
 * @version 1.0.0
 * @section CHAT_SECURITY
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
;

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SecurityCheck {
  passed: boolean;
  blocked: boolean;
  warnings: string[];
  score: number; // 0-1, higher = more suspicious
  action: "allow" | "warn" | "throttle" | "block";
  reasons: string[];
}

export interface UserBehaviorProfile {
  userId: string;

  // Message patterns
  avgMessageLength: number;
  avgResponseTime: number; // seconds
  messageFrequency: number; // messages per hour
  duplicateRate: number; // 0-1
  copyPasteRate: number; // 0-1

  // Suspicious activity
  spamScore: number; // 0-1
  toxicityScore: number; // 0-1
  extortionFlags: number;
  reportCount: number;

  // Session data
  sessionCount: number;
  avgSessionDuration: number; // minutes
  lastActiveAt: Timestamp;

  // Trust signals
  verificationLevel: number; // 0-5
  accountAge: number; // days
  purchaseHistory: number; // total spent
  positiveRatings: number;

  // Risk factors
  riskLevel: "low" | "medium" | "high" | "critical";
  autobanTriggered: boolean;

  updatedAt: Timestamp;
}

export interface ChatSession {
  sessionId: string;
  chatId: string;
  userId: string;

  // Session metrics
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  messagesSent: number;
  tokensSpent: number;

  // Fingerprint
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  fingerprintHash?: string;

  // Flags
  suspicious: boolean;
  flagged: boolean;
}

export interface ExtortionAlert {
  alertId: string;
  chatId: string;
  suspectedUserId: string;
  victimUserId: string;

  // Detection
  confidence: number; // 0-1
  patterns: string[];
  messages: string[]; // Message IDs

  // Status
  status: "pending" | "investigating" | "confirmed" | "dismissed";
  action?: "warn" | "suspend" | "ban";

  // Investigation
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  notes?: string;

  createdAt: Timestamp;
}

export interface ThrottleRecord {
  userId: string;
  action: string; // "message" | "like" | "swipe"
  count: number;
  windowStart: Timestamp;
  blocked: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RATE_LIMITS = {
  MESSAGE: { max: 20, windowMinutes: 1 },
  IMAGE: { max: 10, windowMinutes: 5 },
  VOICE: { max: 5, windowMinutes: 5 },
  VIDEO: { max: 3, windowMinutes: 5 },
  GIFT: { max: 10, windowMinutes: 1 },
};

const SPAM_THRESHOLDS = {
  duplicateRate: 0.7, // 70% duplicate messages = spam
  copyPasteRate: 0.8, // 80% copy-paste = spam
  minMessageVariety: 0.3, // Need 30% message variety
};

const TOXICITY_KEYWORDS = [
  // Profanity
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy",
  // Threats
  "kill", "die", "hurt", "harm", "rape", "assault",
  // Hate speech
  "hate", "racist", "nazi", "nigger", "faggot", "retard",
  // Harassment
  "stalk", "doxx", "leak", "expose", "blackmail", "extort",
];

const EXTORTION_PATTERNS = [
  "pay me or",
  "send money or",
  "i'll leak",
  "i'll share",
  "i'll post",
  "unless you pay",
  "give me money",
  "transfer",
  "wire me",
  "send bitcoin",
  "your address",
  "your family",
  "i know where",
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate message fingerprint for duplicate detection
 */
function calculateMessageFingerprint(message: string): string {
  // Normalize message: lowercase, remove emojis, trim
  const normalized = message
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/\s+/g, ' ')
    .trim();

  return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Analyze user behavior for spam indicators
 */
async function analyzeUserBehavior(userId: string): Promise<UserBehaviorProfile> {
  const userRef = db.collection("userBehaviorProfiles").doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    return userDoc.data() as UserBehaviorProfile;
  }

  // Create new profile
  const profile: UserBehaviorProfile = {
    userId,
    avgMessageLength: 0,
    avgResponseTime: 0,
    messageFrequency: 0,
    duplicateRate: 0,
    copyPasteRate: 0,
    spamScore: 0,
    toxicityScore: 0,
    extortionFlags: 0,
    reportCount: 0,
    sessionCount: 0,
    avgSessionDuration: 0,
    lastActiveAt: Timestamp.now(),
    verificationLevel: 0,
    accountAge: 0,
    purchaseHistory: 0,
    positiveRatings: 0,
    riskLevel: "low",
    autobanTriggered: false,
    updatedAt: Timestamp.now(),
  };

  await userRef.set(profile);
  return profile;
}

/**
 * Check rate limit for user action
 */
async function checkActionRateLimit(
  userId: string,
  action: string
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = RATE_LIMITS[action as keyof typeof RATE_LIMITS] || { max: 100, windowMinutes: 60 };

  const now = Date.now();
  const windowStart = now - limit.windowMinutes * 60 * 1000;

  const throttleRef = db.collection("throttleRecords").doc(`${userId}_${action}`);
  const throttleDoc = await throttleRef.get();

  if (!throttleDoc.exists) {
    // First action in window
    await throttleRef.set({
      userId,
      action,
      count: 1,
      windowStart: Timestamp.fromMillis(now),
      blocked: false,
    });
    return { allowed: true, remaining: limit.max - 1 };
  }

  const throttle = throttleDoc.data() as ThrottleRecord;
  const windowAge = now - throttle.windowStart.toMillis();

  // Reset window if expired
  if (windowAge > limit.windowMinutes * 60 * 1000) {
    await throttleRef.update({
      count: 1,
      windowStart: Timestamp.fromMillis(now),
      blocked: false,
    });
    return { allowed: true, remaining: limit.max - 1 };
  }

  // Check if limit exceeded
  if (throttle.count >= limit.max) {
    await throttleRef.update({ blocked: true });
    return { allowed: false, remaining: 0 };
  }

  // Increment counter
  await throttleRef.update({
    count: FieldValue.increment(1),
  });

  return { allowed: true, remaining: limit.max - throttle.count - 1 };
}

/**
 * Detect extortion patterns
 */
function detectExtortion(message: string): { detected: boolean; patterns: string[] } {
  const lowerMessage = message.toLowerCase();
  const detectedPatterns: string[] = [];

  EXTORTION_PATTERNS.forEach(pattern => {
    if (lowerMessage.includes(pattern)) {
      detectedPatterns.push(pattern);
    }
  });

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}

/**
 * Calculate spam score based on multiple factors
 */
function calculateSpamScore(
  message: string,
  recentMessages: string[],
  behavior: UserBehaviorProfile
): number {
  let score = 0;

  // Duplicate detection
  const fingerprint = calculateMessageFingerprint(message);
  const recentFingerprints = recentMessages.map(calculateMessageFingerprint);
  const duplicateCount = recentFingerprints.filter(fp => fp === fingerprint).length;

  if (duplicateCount >= 2) score += 0.3;
  if (duplicateCount >= 5) score += 0.3;

  // Copy-paste detection (very short messages repeated)
  if (message.length < 20 && duplicateCount >= 3) {
    score += 0.2;
  }

  // URL spam
  const urlCount = (message.match(/https?:\/\//g) || []).length;
  if (urlCount > 1) score += 0.2;
  if (urlCount > 3) score += 0.3;

  // All caps
  const capsRatio = message.replace(/[^A-Z]/g, '').length / message.length;
  if (capsRatio > 0.7 && message.length > 10) {
    score += 0.15;
  }

  // Behavior profile score
  score += behavior.spamScore * 0.3;
  score += behavior.duplicateRate * 0.2;

  return Math.min(score, 1.0);
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Perform security check on message
 */
export const performMessageSecurityCheck = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { chatId, message, type } = request.data;

    if (!chatId || !message) {
      throw new HttpsError("invalid-argument", "Missing chatId or message");
    }

    const warnings: string[] = [];
    const reasons: string[] = [];
    let score = 0;

    // Get user behavior profile
    const behavior = await analyzeUserBehavior(uid);

    // Check rate limit
    const rateLimit = await checkActionRateLimit(uid, type || "MESSAGE");
    if (!rateLimit.allowed) {
      return {
        success: true,
        check: {
          passed: false,
          blocked: true,
          warnings: ["Rate limit exceeded"],
          score: 1.0,
          action: "block",
          reasons: ["Too many messages sent in short time"],
        },
      };
    }

    // Get recent messages
    const recentSnapshot = await db
      .collection(`chats/${chatId}/messages`)
      .where("senderId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const recentMessages = recentSnapshot.docs.map(d => d.data().content);

    // Spam detection
    const spamScore = calculateSpamScore(message, recentMessages, behavior);
    if (spamScore > 0.6) {
      warnings.push("Message appears to be spam");
      reasons.push("Duplicate or repetitive content detected");
      score = Math.max(score, spamScore);
    }

    // Toxicity detection
    const toxic = TOXICITY_KEYWORDS.some(keyword =>
      message.toLowerCase().includes(keyword)
    );
    if (toxic) {
      warnings.push("Inappropriate language detected");
      reasons.push("Contains prohibited words");
      score = Math.max(score, 0.8);
    }

    // Extortion detection
    const extortion = detectExtortion(message);
    if (extortion.detected) {
      warnings.push("Potential extortion detected");
      reasons.push(`Matched patterns: ${extortion.patterns.join(', ')}`);
      score = 1.0;

      // Create extortion alert
      await createExtortionAlert(chatId, uid, message, extortion.patterns);
    }

    // Determine action
    let action: "allow" | "warn" | "throttle" | "block" = "allow";
    if (score >= 0.9) action = "block";
    else if (score >= 0.7) action = "throttle";
    else if (score >= 0.5) action = "warn";

    // Update behavior profile
    if (score > 0.5) {
      await db.collection("userBehaviorProfiles").doc(uid).update({
        spamScore: FieldValue.increment(0.1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const check: SecurityCheck = {
      passed: action !== "block",
      blocked: action === "block",
      warnings,
      score,
      action,
      reasons,
    };

    logger.info(`Security check for user ${uid}: ${action} (score: ${score})`);

    return {
      success: true,
      check,
    };
  }
);

/**
 * Report user for abuse
 */
export const reportUserAbuse = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      reportedUserId,
      chatId,
      reason,
      messageIds,
      description,
    } = request.data;

    if (!reportedUserId || !reason) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const reportId = `report_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

    const report = {
      reportId,
      reporterId: uid,
      reportedUserId,
      chatId,
      reason,
      messageIds: messageIds || [],
      description: description || "",
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection("abuseReports").doc(reportId).set(report);

    // Update reported user's behavior profile
    await db.collection("userBehaviorProfiles").doc(reportedUserId).update({
      reportCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Auto-flag if multiple reports
    const reportsSnapshot = await db
      .collection("abuseReports")
      .where("reportedUserId", "==", reportedUserId)
      .where("status", "==", "pending")
      .get();

    if (reportsSnapshot.size >= 3) {
      // Auto-suspend after 3 reports
      await db.collection("users").doc(reportedUserId).update({
        "status.suspended": true,
        "status.suspendedReason": "Multiple abuse reports",
        "status.suspendedAt": FieldValue.serverTimestamp(),
      });

      logger.warn(`User ${reportedUserId} auto-suspended after ${reportsSnapshot.size} reports`);
    }

    logger.info(`Abuse report created: ${reportId}`);

    return {
      success: true,
      reportId,
      message: "Report submitted. Our team will review it shortly.",
    };
  }
);

/**
 * Block user
 */
export const blockUser = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { blockedUserId, reason } = request.data;

    if (!blockedUserId) {
      throw new HttpsError("invalid-argument", "Missing blockedUserId");
    }

    if (blockedUserId === uid) {
      throw new HttpsError("invalid-argument", "Cannot block yourself");
    }

    const blockId = `${uid}_${blockedUserId}`;

    await db.collection("users").doc(uid).collection("blocked").doc(blockId).set({
      blockedUserId,
      reason: reason || "User blocked",
      blockedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`User ${uid} blocked ${blockedUserId}`);

    return {
      success: true,
      message: "User blocked successfully",
    };
  }
);

/**
 * Unblock user
 */
export const unblockUser = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { blockedUserId } = request.data;

    if (!blockedUserId) {
      throw new HttpsError("invalid-argument", "Missing blockedUserId");
    }

    const blockId = `${uid}_${blockedUserId}`;

    await db.collection("users").doc(uid).collection("blocked").doc(blockId).delete();

    logger.info(`User ${uid} unblocked ${blockedUserId}`);

    return {
      success: true,
      message: "User unblocked successfully",
    };
  }
);

/**
 * Get blocked users list
 */
export const getBlockedUsers = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("blocked")
      .get();

    const blocked = snapshot.docs.map(doc => ({
      ...doc.data(),
      blockId: doc.id,
    }));

    return {
      success: true,
      blocked,
      total: blocked.length,
    };
  }
);

/**
 * Track chat session
 */
export const trackChatSession = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { chatId, action, deviceId, ipAddress, userAgent } = request.data;

    if (!chatId || !action) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const sessionRef = db.collection("chatSessions").doc(`${uid}_${chatId}`);

    if (action === "start") {
      // Create session fingerprint
      const fingerprintData = `${deviceId}:${ipAddress}:${userAgent}`;
      const fingerprintHash = crypto
        .createHash('sha256')
        .update(fingerprintData)
        .digest('hex');

      const session: ChatSession = {
        sessionId: `session_${Date.now()}`,
        chatId,
        userId: uid,
        startedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
        messagesSent: 0,
        tokensSpent: 0,
        deviceId,
        ipAddress,
        userAgent,
        fingerprintHash,
        suspicious: false,
        flagged: false,
      };

      await sessionRef.set(session);
    } else if (action === "activity") {
      await sessionRef.update({
        lastActivityAt: FieldValue.serverTimestamp(),
      });
    } else if (action === "end") {
      const sessionDoc = await sessionRef.get();
      if (sessionDoc.exists) {
        const session = sessionDoc.data() as ChatSession;
        const duration = (Date.now() - session.startedAt.toMillis()) / 1000 / 60; // minutes

        // Update behavior profile
        await db.collection("userBehaviorProfiles").doc(uid).update({
          sessionCount: FieldValue.increment(1),
          avgSessionDuration: duration,
          lastActiveAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await sessionRef.delete();
    }

    return {
      success: true,
    };
  }
);

/**
 * Create extortion alert
 */
async function createExtortionAlert(
  chatId: string,
  suspectedUserId: string,
  message: string,
  patterns: string[]
): Promise<void> {
  const chatDoc = await db.collection("chats").doc(chatId).get();
  if (!chatDoc.exists) return;

  const chat = chatDoc.data();
  const victimId = chat?.participants.find((p: string) => p !== suspectedUserId);

  if (!victimId) return;

  const alertId = `ext_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

  const alert: ExtortionAlert = {
    alertId,
    chatId,
    suspectedUserId,
    victimUserId: victimId,
    confidence: patterns.length > 2 ? 0.9 : 0.7,
    patterns,
    messages: [message],
    status: "pending",
    createdAt: Timestamp.now(),
  };

  await db.collection("extortionAlerts").doc(alertId).set(alert);

  // Flag for immediate review
  await db.collection("adminFlags").add({
    type: "extortion",
    severity: "critical",
    userId: suspectedUserId,
    chatId,
    alertId,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.error(`🚨 EXTORTION ALERT: ${alertId} in chat ${chatId}`);
}

logger.info("✅ Chat Security module loaded successfully");

