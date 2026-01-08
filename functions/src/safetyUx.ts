/**
 * PACK 73 — Safety UX API
 * Manages user safety onboarding and contextual messaging state
 */

import { db } from "./init";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { getSafetyHintForPair } from "./safetySignals";

export interface SafetyProfile {
  userId: string;
  safetyOnboardingCompleted: boolean;
  safetyOnboardingCompletedAt: FirebaseFirestore.Timestamp | null;
  seenFirstMeetingTip: boolean;
  seenOffPlatformWarning: boolean;
  seenPaymentSafetyTip: boolean;
  highRiskPartnerWarningsShown: number;
  supportSafetyClicks: number;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export type SafetyUxEvent =
  | "ONBOARDING_COMPLETED"
  | "FIRST_MEETING_TIP_SHOWN"
  | "OFF_PLATFORM_WARNING_SHOWN"
  | "PAYMENT_SAFETY_TIP_SHOWN"
  | "HIGH_RISK_PARTNER_WARNING_SHOWN"
  | "SUPPORT_SAFETY_CLICK";

/**
 * Get user safety UX state
 * GET /safety/ux-state?userId=...
 */
export async function getSafetyUxState(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "Missing userId parameter" });
      return;
    }

    const docRef = db.collection("safety_profiles").doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      // Return default state for new users
      res.json({
        safetyOnboardingCompleted: false,
        seenFirstMeetingTip: false,
        seenOffPlatformWarning: false,
        seenPaymentSafetyTip: false,
      });
      return;
    }

    const data = doc.data() as SafetyProfile;
    res.json({
      safetyOnboardingCompleted: data.safetyOnboardingCompleted || false,
      seenFirstMeetingTip: data.seenFirstMeetingTip || false,
      seenOffPlatformWarning: data.seenOffPlatformWarning || false,
      seenPaymentSafetyTip: data.seenPaymentSafetyTip || false,
    });
  } catch (error) {
    console.error("Error getting safety UX state:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Mark safety UX event
 * POST /safety/ux-event
 * Body: { userId: string, event: SafetyUxEvent }
 */
export async function markSafetyUxEvent(req: Request, res: Response): Promise<void> {
  try {
    const { userId, event } = req.body;

    if (!userId || !event) {
      res.status(400).json({ error: "Missing userId or event" });
      return;
    }

    const validEvents: SafetyUxEvent[] = [
      "ONBOARDING_COMPLETED",
      "FIRST_MEETING_TIP_SHOWN",
      "OFF_PLATFORM_WARNING_SHOWN",
      "PAYMENT_SAFETY_TIP_SHOWN",
      "HIGH_RISK_PARTNER_WARNING_SHOWN",
      "SUPPORT_SAFETY_CLICK",
    ];

    if (!validEvents.includes(event)) {
      res.status(400).json({ error: "Invalid event type" });
      return;
    }

    const docRef = db.collection("safety_profiles").doc(userId);
    const now = FieldValue.serverTimestamp();

    // Build update object based on event type
    const updateData: any = {
      userId,
      lastUpdatedAt: now,
    };

    switch (event) {
      case "ONBOARDING_COMPLETED":
        updateData.safetyOnboardingCompleted = true;
        updateData.safetyOnboardingCompletedAt = now;
        break;
      case "FIRST_MEETING_TIP_SHOWN":
        updateData.seenFirstMeetingTip = true;
        break;
      case "OFF_PLATFORM_WARNING_SHOWN":
        updateData.seenOffPlatformWarning = true;
        break;
      case "PAYMENT_SAFETY_TIP_SHOWN":
        updateData.seenPaymentSafetyTip = true;
        break;
      case "HIGH_RISK_PARTNER_WARNING_SHOWN":
        updateData.highRiskPartnerWarningsShown = FieldValue.increment(1);
        break;
      case "SUPPORT_SAFETY_CLICK":
        updateData.supportSafetyClicks = FieldValue.increment(1);
        break;
    }

    // Check if document exists
    const doc = await docRef.get();
    if (!doc.exists) {
      // Create new document with defaults
      await docRef.set({
        userId,
        safetyOnboardingCompleted: event === "ONBOARDING_COMPLETED",
        safetyOnboardingCompletedAt: event === "ONBOARDING_COMPLETED" ? now : null,
        seenFirstMeetingTip: event === "FIRST_MEETING_TIP_SHOWN",
        seenOffPlatformWarning: event === "OFF_PLATFORM_WARNING_SHOWN",
        seenPaymentSafetyTip: event === "PAYMENT_SAFETY_TIP_SHOWN",
        highRiskPartnerWarningsShown: event === "HIGH_RISK_PARTNER_WARNING_SHOWN" ? 1 : 0,
        supportSafetyClicks: event === "SUPPORT_SAFETY_CLICK" ? 1 : 0,
        createdAt: now,
        lastUpdatedAt: now,
      });
    } else {
      // Update existing document
      await docRef.update(updateData);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking safety UX event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get safety hint for chat/reservation
 * GET /safety/hint?viewerUserId=...&counterpartUserId=...
 */
export async function getSafetyHint(req: Request, res: Response): Promise<void> {
  try {
    const viewerUserId = req.query.viewerUserId as string;
    const counterpartUserId = req.query.counterpartUserId as string;

    if (!viewerUserId || !counterpartUserId) {
      res.status(400).json({ error: "Missing viewerUserId or counterpartUserId" });
      return;
    }

    const hint = await getSafetyHintForPair(viewerUserId, counterpartUserId);

    res.json({
      level: hint.level,
      reasons: hint.reasons,
    });
  } catch (error) {
    console.error("Error getting safety hint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}