/**
 * PACK 85 — Trust & Risk Engine v1
 *
 * Backend layer for user risk scoring, flags, and enforcement hooks.
 * Assigns risk scores based on behavior patterns and provides enforcement decisions.
 *
 * CRITICAL CONSTRAINTS:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No token price changes
 * - No revenue split changes (65% creator / 35% Avalo)
 * - Risk engine does NOT reverse transactions or issue refunds
 * - Only controls access/throttling of future actions
 * - All decisions must be explainable through structured flags
 */

import { db, serverTimestamp, generateId } from "./init";
import {
  UserTrustProfile,
  UserTrustEvent,
  UserTrustAudit,
  LogTrustEventInput,
  GetTrustProfileOutput,
  EnforcementCheckResult,
  EnforcementLevel,
  RiskFlag,
  TrustEventType,
  DEFAULT_TRUST_ENGINE_CONFIG,
  TrustRiskError,
  TRUST_RISK_ERROR_CODES,
} from "./types/trustRisk.types";

// PACK 87 Integration - Import enforcement recalculation
import { recalculateEnforcementState } from "./enforcementEngine";

// Simple logger
const logger = {
  info: (...args: any[]) => console.log("[TrustRisk]", ...args),
  warn: (...args: any[]) => console.warn("[TrustRisk]", ...args),
  error: (...args: any[]) => console.error("[TrustRisk]", ...args),
};

// Use default config (can be extended to load from Firestore)
const CONFIG = DEFAULT_TRUST_ENGINE_CONFIG;

// ============================================================================
// CORE FUNCTIONS - EVENT LOGGING
// ============================================================================

/**
 * Log a trust event for a user
 * This is the main entry point for all risk-related events
 */
export async function logTrustEvent(input: LogTrustEventInput): Promise<void> {
  const { userId, type, weightOverride, meta = {} } = input;

  // Generate event ID
  const eventId = generateId();

  // Determine weight (use override or default from config)
  const weight = weightOverride ?? CONFIG.eventWeights[type];

  // Create event document
  const event: UserTrustEvent = {
    id: eventId,
    userId,
    type,
    weight,
    meta,
    createdAt: serverTimestamp() as any,
  };

  // Write event to Firestore
  await db.collection("user_trust_events").doc(eventId).set(event);

  logger.info(`Event logged: ${type} for user ${userId} (weight: ${weight})`);

  // Trigger recalculation for this user
  await recalculateUserRisk(userId);
}

// ============================================================================
// CORE FUNCTIONS - RISK CALCULATION
// ============================================================================

/**
 * Recalculate risk score and enforcement level for a user
 * Reads recent events, applies scoring logic, updates flags
 */
export async function recalculateUserRisk(userId: string): Promise<UserTrustProfile> {
  const profileRef = db.collection("user_trust_profile").doc(userId);
  const profileSnap = await profileRef.get();

  // Get existing profile or create new one
  let currentProfile: UserTrustProfile;
  
  if (!profileSnap.exists) {
    currentProfile = await initializeTrustProfile(userId);
  } else {
    currentProfile = profileSnap.data() as UserTrustProfile;
  }

  // Store previous values for audit
  const previousScore = currentProfile.riskScore;
  const previousEnforcement = currentProfile.enforcementLevel;

  // Query recent events (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const eventsSnap = await db
    .collection("user_trust_events")
    .where("userId", "==", userId)
    .where("createdAt", ">=", ninetyDaysAgo)
    .get();

  // Calculate new score
  let newScore = CONFIG.baseScore;

  eventsSnap.forEach((doc) => {
    const event = doc.data() as UserTrustEvent;
    newScore += event.weight;
  });

  // Apply manual override if exists
  if (currentProfile.manualOverride?.overrideScore !== undefined) {
    newScore = currentProfile.manualOverride.overrideScore;
  }

  // Clamp score to 0-100
  newScore = Math.max(0, Math.min(100, newScore));

  // Determine enforcement level from score
  let newEnforcement: EnforcementLevel;
  
  if (currentProfile.manualOverride?.overrideEnforcement) {
    newEnforcement = currentProfile.manualOverride.overrideEnforcement;
  } else if (newScore >= CONFIG.thresholds.hardLimit) {
    newEnforcement = "HARD_LIMIT";
  } else if (newScore >= CONFIG.thresholds.softLimit) {
    newEnforcement = "SOFT_LIMIT";
  } else {
    newEnforcement = "NONE";
  }

  // Detect flags based on recent events
  const newFlags = await detectRiskFlags(userId, eventsSnap.docs);

  // Update profile
  const updatedProfile: UserTrustProfile = {
    userId,
    riskScore: newScore,
    enforcementLevel: newEnforcement,
    flags: newFlags,
    lastUpdatedAt: serverTimestamp() as any,
    version: CONFIG.version,
    manualOverride: currentProfile.manualOverride,
  };

  await profileRef.set(updatedProfile);

  // Create audit entry if score or enforcement changed
  if (newScore !== previousScore || newEnforcement !== previousEnforcement) {
    await createAuditEntry({
      userId,
      action: "SCORE_CHANGE",
      previousScore,
      newScore,
      previousEnforcement,
      newEnforcement,
      flags: newFlags,
      triggeredBy: "SYSTEM",
      reason: "Risk recalculation based on recent events",
    });
  }

  logger.info(
    `Risk recalculated for user ${userId}: score=${newScore}, enforcement=${newEnforcement}, flags=[${newFlags.join(", ")}]`
  );

  // PACK 87 Integration - Trigger enforcement state recalculation
  try {
    await recalculateEnforcementState(userId);
  } catch (error) {
    logger.error(`Failed to recalculate enforcement state for user ${userId}:`, error);
    // Don't throw - enforcement failure shouldn't block trust calculation
  }

  return updatedProfile;
}

/**
 * Initialize a new trust profile for a user
 */
async function initializeTrustProfile(userId: string): Promise<UserTrustProfile> {
  const profile: UserTrustProfile = {
    userId,
    riskScore: CONFIG.baseScore,
    enforcementLevel: "NONE",
    flags: [],
    lastUpdatedAt: serverTimestamp() as any,
    version: CONFIG.version,
  };

  await db.collection("user_trust_profile").doc(userId).set(profile);

  logger.info(`Trust profile initialized for user ${userId}`);

  return profile;
}

/**
 * Detect risk flags based on recent events
 */
async function detectRiskFlags(
  userId: string,
  recentEventDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<RiskFlag[]> {
  const flags: RiskFlag[] = [];

  // Count events by type in recent period
  const eventCounts: Partial<Record<TrustEventType, number>> = {};
  const eventsByType: Partial<Record<TrustEventType, UserTrustEvent[]>> = {};

  recentEventDocs.forEach((doc) => {
    const event = doc.data() as UserTrustEvent;
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    
    if (!eventsByType[event.type]) {
      eventsByType[event.type] = [];
    }
    eventsByType[event.type]!.push(event);
  });

  // Check for POTENTIAL_SPAMMER
  const blockCount = eventCounts.BLOCK_RECEIVED || 0;
  const reportCount = eventCounts.REPORT_RECEIVED || 0;
  
  if (
    blockCount >= CONFIG.flagTriggers.potentialSpammer.blocksReceivedThreshold ||
    reportCount >= CONFIG.flagTriggers.potentialSpammer.reportsReceivedThreshold
  ) {
    flags.push("POTENTIAL_SPAMMER");
  }

  // Check for POTENTIAL_SCAMMER (financial harm reports)
  const scamReports = (eventsByType.REPORT_RECEIVED || []).filter(
    (e) => e.meta.reason === "scam" || e.meta.reason === "financial_harm"
  );
  
  if (scamReports.length >= CONFIG.flagTriggers.potentialScammer.financialReportsThreshold) {
    flags.push("POTENTIAL_SCAMMER");
  }

  // Check for HIGH_REPORT_RATE
  if (reportCount >= CONFIG.flagTriggers.highReportRate.reportsThreshold) {
    flags.push("HIGH_REPORT_RATE");
  }

  // Check for KYC_FRAUD_RISK
  if (eventCounts.KYC_BLOCKED || eventCounts.KYC_REJECTED) {
    flags.push("KYC_FRAUD_RISK");
  }

  // Check for PAYMENT_FRAUD_RISK
  if (eventCounts.CHARGEBACK_FILED || eventCounts.PAYOUT_FRAUD_ATTEMPT) {
    flags.push("PAYMENT_FRAUD_RISK");
  }

  // Check for AGGRESSIVE_SENDER
  if (eventCounts.MASS_MESSAGING || eventCounts.MASS_GIFTING) {
    flags.push("AGGRESSIVE_SENDER");
  }

  // HIGH_CHURN_PAYER and MULTI_ACCOUNT_SUSPECT are placeholders
  // Would require more complex analysis (IP/device tracking, payment patterns)
  
  return flags;
}

// ============================================================================
// CORE FUNCTIONS - ENFORCEMENT HOOKS
// ============================================================================

/**
 * Check if user can send messages
 * Used by chat module before allowing message sending
 */
export async function canSendMessage(userId: string): Promise<EnforcementCheckResult> {
  const profile = await getTrustProfile(userId);

  if (profile.enforcementLevel === "HARD_LIMIT") {
    return {
      allowed: false,
      reason: "Your account is currently restricted. Please contact support if you believe this is a mistake.",
      errorCode: TRUST_RISK_ERROR_CODES.ACCOUNT_RESTRICTED,
    };
  }

  // SOFT_LIMIT could implement throttling (not blocking entirely)
  // For v1, we allow but could add cooldown logic later
  
  return { allowed: true };
}

/**
 * Check if user can send gifts or paid media
 * Used by monetized features before processing
 */
export async function canSendMonetizedContent(userId: string): Promise<EnforcementCheckResult> {
  const profile = await getTrustProfile(userId);

  if (profile.enforcementLevel === "HARD_LIMIT") {
    return {
      allowed: false,
      reason: "Your account is currently restricted from sending monetized content.",
      errorCode: TRUST_RISK_ERROR_CODES.FEATURE_RESTRICTED,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can request payout
 * Used by payout module in addition to KYC checks
 */
export async function canRequestPayout(userId: string): Promise<EnforcementCheckResult> {
  const profile = await getTrustProfile(userId);

  // Block payouts for HARD_LIMIT with fraud-related flags
  if (profile.enforcementLevel === "HARD_LIMIT") {
    const fraudFlags: RiskFlag[] = [
      "POTENTIAL_SCAMMER",
      "KYC_FRAUD_RISK",
      "PAYMENT_FRAUD_RISK",
    ];
    
    const hasFraudFlag = profile.flags.some((f) => fraudFlags.includes(f));
    
    if (hasFraudFlag) {
      return {
        allowed: false,
        reason: "Your account is currently restricted from payouts due to fraud risk. Please contact support.",
        errorCode: TRUST_RISK_ERROR_CODES.FEATURE_RESTRICTED,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if user can use paid features (general check)
 */
export async function canUsePaidFeatures(userId: string): Promise<EnforcementCheckResult> {
  const profile = await getTrustProfile(userId);

  // Allow receiving payments even with restrictions
  // Only block sending/spending
  
  return { allowed: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user trust profile (create if doesn't exist)
 */
export async function getTrustProfile(userId: string): Promise<UserTrustProfile> {
  const profileRef = db.collection("user_trust_profile").doc(userId);
  const profileSnap = await profileRef.get();

  if (!profileSnap.exists) {
    return await initializeTrustProfile(userId);
  }

  return profileSnap.data() as UserTrustProfile;
}

/**
 * Get sanitized trust profile for client/API output
 */
export async function getTrustProfileForClient(userId: string): Promise<GetTrustProfileOutput> {
  const profile = await getTrustProfile(userId);

  // Check enforcement for various actions
  const canSendMsg = await canSendMessage(userId);
  const canSendGift = await canSendMonetizedContent(userId);
  const canPayout = await canRequestPayout(userId);
  const canPaid = await canUsePaidFeatures(userId);

  return {
    userId: profile.userId,
    riskScore: profile.riskScore,
    enforcementLevel: profile.enforcementLevel,
    flags: profile.flags,
    canSendMessages: canSendMsg.allowed,
    canSendGifts: canSendGift.allowed,
    canRequestPayout: canPayout.allowed,
    canUsePaidFeatures: canPaid.allowed,
    lastUpdatedAt: profile.lastUpdatedAt.toDate().toISOString(),
  };
}

/**
 * Create audit entry for tracking changes
 */
async function createAuditEntry(entry: Omit<UserTrustAudit, "id" | "createdAt">): Promise<void> {
  const auditId = generateId();
  
  const auditEntry: UserTrustAudit = {
    id: auditId,
    ...entry,
    createdAt: serverTimestamp() as any,
  };

  await db.collection("user_trust_audit").doc(auditId).set(auditEntry);
}

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Apply good behavior decay to all users
 * Should be called periodically (e.g., daily) via Cloud Scheduler
 */
export async function applyGoodBehaviorDecay(batchSize: number = 100): Promise<number> {
  if (!CONFIG.decay.enabled) {
    logger.info("Good behavior decay is disabled");
    return 0;
  }

  const decayIntervalMs = CONFIG.decay.daysInterval * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(Date.now() - decayIntervalMs);

  // Query profiles that haven't been updated in decay interval
  const profilesSnap = await db
    .collection("user_trust_profile")
    .where("lastUpdatedAt", "<=", cutoffDate)
    .limit(batchSize)
    .get();

  let decayedCount = 0;

  for (const doc of profilesSnap.docs) {
    const profile = doc.data() as UserTrustProfile;

    // Skip if manual override exists
    if (profile.manualOverride) {
      continue;
    }

    // Skip if already at minimum
    if (profile.riskScore <= CONFIG.decay.minimumScore) {
      continue;
    }

    // Apply decay
    const userId = profile.userId;
    
    await logTrustEvent({
      userId,
      type: "GOOD_BEHAVIOR_DECAY",
      meta: {
        automatic: true,
        decayAmount: CONFIG.decay.decreaseAmount,
      },
    });

    decayedCount++;
  }

  logger.info(`Applied good behavior decay to ${decayedCount} users`);

  return decayedCount;
}

/**
 * Rebuild all risk scores from scratch
 * Use sparingly - for fixing inconsistencies or config changes
 */
export async function rebuildAllRiskScores(batchSize: number = 50): Promise<number> {
  // Get all users with trust profiles
  const profilesSnap = await db
    .collection("user_trust_profile")
    .limit(batchSize)
    .get();

  let rebuiltCount = 0;

  for (const doc of profilesSnap.docs) {
    const profile = doc.data() as UserTrustProfile;
    
    try {
      await recalculateUserRisk(profile.userId);
      rebuiltCount++;
    } catch (error) {
      logger.error(`Failed to rebuild risk score for user ${profile.userId}:`, error);
    }
  }

  logger.info(`Rebuilt risk scores for ${rebuiltCount} users`);

  return rebuiltCount;
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Apply manual override to user's risk score/enforcement
 * Admin only - for handling false positives
 */
export async function applyManualOverride(
  userId: string,
  adminId: string,
  reason: string,
  overrideScore?: number,
  overrideEnforcement?: EnforcementLevel
): Promise<void> {
  const profileRef = db.collection("user_trust_profile").doc(userId);
  const profileSnap = await profileRef.get();

  if (!profileSnap.exists) {
    throw new TrustRiskError(
      TRUST_RISK_ERROR_CODES.USER_NOT_FOUND,
      "User trust profile not found"
    );
  }

  const profile = profileSnap.data() as UserTrustProfile;

  // Update with manual override
  await profileRef.update({
    "manualOverride": {
      appliedBy: adminId,
      appliedAt: serverTimestamp(),
      reason,
      overrideScore,
      overrideEnforcement,
    },
    lastUpdatedAt: serverTimestamp(),
  });

  // Create audit entry
  await createAuditEntry({
    userId,
    action: "MANUAL_OVERRIDE",
    previousScore: profile.riskScore,
    newScore: overrideScore,
    previousEnforcement: profile.enforcementLevel,
    newEnforcement: overrideEnforcement,
    triggeredBy: adminId,
    reason,
  });

  // Recalculate to apply override
  await recalculateUserRisk(userId);

  logger.warn(`Manual override applied to user ${userId} by admin ${adminId}: ${reason}`);
}

/**
 * Remove manual override
 * Returns user to system-calculated risk score
 */
export async function removeManualOverride(userId: string, adminId: string): Promise<void> {
  const profileRef = db.collection("user_trust_profile").doc(userId);
  const profileSnap = await profileRef.get();

  if (!profileSnap.exists) {
    throw new TrustRiskError(
      TRUST_RISK_ERROR_CODES.USER_NOT_FOUND,
      "User trust profile not found"
    );
  }

  // Remove override
  await profileRef.update({
    "manualOverride": null,
    lastUpdatedAt: serverTimestamp(),
  });

  // Recalculate with system logic
  await recalculateUserRisk(userId);

  logger.info(`Manual override removed from user ${userId} by admin ${adminId}`);
}