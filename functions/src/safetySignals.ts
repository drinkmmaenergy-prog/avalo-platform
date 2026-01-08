/**
 * PACK 73 — Safety Signals Aggregation
 * Read-only façade over Trust/AML/Fraud/Moderation engines
 * Provides discrete safety hint levels for UX purposes
 */

import { db } from "./init";

export type SafetyHintLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface SafetyHintResult {
  level: SafetyHintLevel;
  reasons: string[];
}

/**
 * Generic reason codes mapped to user-facing localized text on mobile
 */
export type SafetyReasonCode =
  | "NEW_ACCOUNT"
  | "FREQUENT_REPORTS"
  | "RISKY_BEHAVIOR_FLAG"
  | "MODERATION_HISTORY"
  | "FINANCIAL_RISK_FLAG";

/**
 * Get safety hint for a counterpart user from the viewer's perspective
 * This is read-only and does not modify any state
 */
export async function getSafetyHintForPair(
  viewerUserId: string,
  counterpartUserId: string
): Promise<SafetyHintResult> {
  const reasons: SafetyReasonCode[] = [];
  let level: SafetyHintLevel = "NONE";

  try {
    // 1. Check Trust Engine state (PACK 46) - blocklist
    const trustDoc = await db.collection("trust_engine").doc(counterpartUserId).get();
    const trustData = trustDoc.exists ? trustDoc.data() : null;

    // If blocked/suspended, chat should already be inaccessible, but double-check
    if (trustData?.status === "SUSPENDED" || trustData?.status === "BLOCKED") {
      // This shouldn't reach here in normal flow
      return { level: "NONE", reasons: [] };
    }

    // 2. Check Enforcement flags (PACK 54)
    const enforcementDoc = await db.collection("enforcement").doc(counterpartUserId).get();
    const enforcementData = enforcementDoc.exists ? enforcementDoc.data() : null;

    if (enforcementData?.status === "LIMITED" || enforcementData?.status === "RESTRICTED") {
      reasons.push("RISKY_BEHAVIOR_FLAG");
      level = "MEDIUM";
    }

    // Check violation history
    const violationCount = enforcementData?.violationCount || 0;
    if (violationCount >= 3) {
      reasons.push("MODERATION_HISTORY");
      if (level === "NONE") level = "MEDIUM";
      else if (level === "MEDIUM") level = "HIGH";
    }

    // 3. Check AML/Fraud (PACK 63, 71)
    const amlDoc = await db.collection("aml_hub").doc(counterpartUserId).get();
    const amlData = amlDoc.exists ? amlDoc.data() : null;

    if (amlData?.riskLevel === "HIGH" || amlData?.riskLevel === "CRITICAL") {
      reasons.push("FINANCIAL_RISK_FLAG");
      if (level === "NONE") {
        level = "MEDIUM";
      } else if (level === "MEDIUM") {
        level = "HIGH";
      }
      // If already HIGH, keep HIGH
    }

    // 4. Check recent moderation violations (PACK 54, 72)
    const moderationSnap = await db
      .collection("moderation_cases")
      .where("userId", "==", counterpartUserId)
      .where("status", "==", "UPHELD")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const recentViolations = moderationSnap.docs.filter((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate();
      if (!createdAt) return false;
      const daysAgo = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30; // Last 30 days
    });

    if (recentViolations.length >= 2) {
      reasons.push("FREQUENT_REPORTS");
      if (level === "NONE") level = "MEDIUM";
      else if (level === "MEDIUM") level = "HIGH";
    }

    // 5. New account check (low activity)
    const userDoc = await db.collection("users").doc(counterpartUserId).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    if (userData?.createdAt) {
      const createdAt = userData.createdAt.toDate();
      const accountAgeDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      // Account less than 7 days old
      if (accountAgeDays < 7) {
        reasons.push("NEW_ACCOUNT");
        if (level === "NONE") level = "LOW";
      }
    }

    // Deduplicate reasons
    const uniqueReasons = Array.from(new Set(reasons));

    return {
      level,
      reasons: uniqueReasons,
    };
  } catch (error) {
    console.error("Error getting safety hint:", error);
    // Return safe default on error
    return { level: "NONE", reasons: [] };
  }
}

/**
 * Helper to check if a user should see any safety warnings
 */
export async function shouldShowSafetyWarning(
  viewerUserId: string,
  counterpartUserId: string
): Promise<boolean> {
  const hint = await getSafetyHintForPair(viewerUserId, counterpartUserId);
  return hint.level !== "NONE";
}