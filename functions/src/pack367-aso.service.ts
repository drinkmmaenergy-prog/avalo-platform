/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * ASO Service
 * 
 * Handles app store optimization, review prompts, and in-app feedback routing.
 */

import * as admin from "firebase-admin";
import {
  StoreListingConfig,
  StoreRatingSnapshot,
  InAppFeedback,
  ReviewPromptTracker,
  StoreListingHistory,
  StorePlatform,
} from "./pack367-aso.types";

const db = admin.firestore();

/**
 * ASO Service for managing store listings and review flows
 */
export class ASOService {
  
  /**
   * Get store listing configuration
   */
  async getStoreListing(
    platform: StorePlatform,
    country: string
  ): Promise<StoreListingConfig | null> {
    const docId = `${platform}_${country}`;
    const doc = await db.collection("ops").doc("storeListings").collection("listings").doc(docId).get();
    
    return doc.exists ? doc.data() as StoreListingConfig : null;
  }

  /**
   * Update store listing configuration
   */
  async updateStoreListing(
    platform: StorePlatform,
    country: string,
    config: Partial<StoreListingConfig>,
    adminId: string
  ): Promise<void> {
    const docId = `${platform}_${country}`;
    const docRef = db.collection("ops").doc("storeListings").collection("listings").doc(docId);
    
    // Get previous config for history
    const previousDoc = await docRef.get();
    const previousConfig = previousDoc.exists ? previousDoc.data() as StoreListingConfig : undefined;
    
    const updatedConfig: StoreListingConfig = {
      ...config,
      platform,
      country,
      lastUpdatedAt: Date.now(),
      lastUpdatedBy: adminId,
    } as StoreListingConfig;
    
    // Save updated config
    await docRef.set(updatedConfig, { merge: true });
    
    // Log history
    await this.logListingHistory({
      platform,
      country,
      changedBy: adminId,
      changeType: previousDoc.exists ? "update" : "create",
      previousConfig,
      newConfig: updatedConfig,
    });
  }

  /**
   * Log store listing change to history
   */
  private async logListingHistory(params: {
    platform: StorePlatform;
    country: string;
    changedBy: string;
    changeType: "create" | "update" | "activate" | "archive";
    previousConfig?: StoreListingConfig;
    newConfig: StoreListingConfig;
    reason?: string;
  }): Promise<void> {
    const historyEntry: StoreListingHistory = {
      id: `${params.platform}_${params.country}_${Date.now()}`,
      platform: params.platform,
      country: params.country,
      changedAt: Date.now(),
      changedBy: params.changedBy,
      changeType: params.changeType,
      previousConfig: params.previousConfig,
      newConfig: params.newConfig,
      reason: params.reason,
    };
    
    await db
      .collection("ops")
      .doc("storeListings")
      .collection("history")
      .doc(historyEntry.id)
      .set(historyEntry);
  }

  /**
   * Save rating snapshot for analytics
   */
  async saveRatingSnapshot(snapshot: StoreRatingSnapshot): Promise<void> {
    const docId = `${snapshot.platform}_${snapshot.country}_${snapshot.capturedAt}`;
    
    await db
      .collection("analytics")
      .doc("storeRatings")
      .collection("snapshots")
      .doc(docId)
      .set(snapshot);
  }

  /**
   * Get latest rating snapshot for platform/country
   */
  async getLatestRatingSnapshot(
    platform: StorePlatform,
    country: string
  ): Promise<StoreRatingSnapshot | null> {
    const snapshot = await db
      .collection("analytics")
      .doc("storeRatings")
      .collection("snapshots")
      .where("platform", "==", platform)
      .where("country", "==", country)
      .orderBy("capturedAt", "desc")
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    return snapshot.docs[0].data() as StoreRatingSnapshot;
  }

  /**
   * Check if user should be shown review prompt
   */
  async shouldShowReviewPrompt(userId: string): Promise<{
    shouldShow: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    
    // Get user data
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { shouldShow: false, reasons: ["User not found"] };
    }
    const userData = userDoc.data();
    
    // Check review prompt tracker
    const trackerDoc = await db
      .collection("users")
      .doc(userId)
      .collection("private")
      .doc("reviewPromptTracker")
      .get();
    
    const tracker = trackerDoc.exists ? trackerDoc.data() as ReviewPromptTracker : null;
    
    // Already left review
    if (tracker?.hasLeftReview) {
      return { shouldShow: false, reasons: ["User already left review"] };
    }
    
    // Too many prompts shown
    if (tracker && tracker.totalPromptsShown >= 3) {
      return { shouldShow: false, reasons: ["Max prompts reached (3)"] };
    }
    
    // Recently shown
    if (tracker?.lastPromptShownAt) {
      const daysSinceLastPrompt = (Date.now() - tracker.lastPromptShownAt) / (1000 * 60 * 60 * 24);
      if (daysSinceLastPrompt < 30) {
        return { shouldShow: false, reasons: [`Last shown ${Math.round(daysSinceLastPrompt)} days ago`] };
      }
    }
    
    // Check account age (min 3 days)
    const accountAgeDays = (Date.now() - (userData?.createdAt || Date.now())) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
      return { shouldShow: false, reasons: [`Account too new (${Math.round(accountAgeDays)} days)`] };
    }
    reasons.push("✓ Account age OK");
    
    // Check app opens (min 5)
    const appOpens = userData?.analytics?.appOpens || 0;
    if (appOpens < 5) {
      return { shouldShow: false, reasons: [`Not enough app opens (${appOpens}/5)`] };
    }
    reasons.push("✓ App opens OK");
    
    // Check for positive interactions (paid chat, successful meeting, token purchase)
    const hasPositiveInteraction = 
      (userData?.stats?.totalSpent || 0) > 0 ||
      (userData?.stats?.completedMeetings || 0) > 0 ||
      (userData?.stats?.successfulChats || 0) > 3;
    
    if (!hasPositiveInteraction) {
      return { shouldShow: false, reasons: ["No positive interactions yet"] };
    }
    reasons.push("✓ Positive interactions OK");
    
    // Check for active safety issues (PACK 300/300A)
    const activeSafetyTickets = await db
      .collection("support")
      .doc("tickets")
      .collection("list")
      .where("userId", "==", userId)
      .where("category", "in", ["safety_violation", "abuse_report", "harassment"])
      .where("status", "in", ["open", "investigating"])
      .limit(1)
      .get();
    
    if (!activeSafetyTickets.empty) {
      return { shouldShow: false, reasons: ["Active safety issues"] };
    }
    reasons.push("✓ No safety issues");
    
    return { shouldShow: true, reasons };
  }

  /**
   * Mark review prompt as shown to user
   */
  async markReviewPromptShown(userId: string): Promise<void> {
    const trackerRef = db
      .collection("users")
      .doc(userId)
      .collection("private")
      .doc("reviewPromptTracker");
    
    const doc = await trackerRef.get();
    const current = doc.exists ? doc.data() as ReviewPromptTracker : {
      userId,
      totalPromptsShown: 0,
      hasLeftReview: false,
      eligibilityScore: 0,
      eligibilityReasons: [],
    };
    
    await trackerRef.set({
      ...current,
      lastPromptShownAt: Date.now(),
      totalPromptsShown: (current.totalPromptsShown || 0) + 1,
    }, { merge: true });
  }

  /**
   * Record in-app feedback (before store review)
   */
  async recordInAppFeedback(
    userId: string,
    feedback: Omit<InAppFeedback, "userId" | "createdAt">
  ): Promise<string> {
    const feedbackDoc = db
      .collection("users")
      .doc(userId)
      .collection("inAppFeedback")
      .doc();
    
    const fullFeedback: InAppFeedback = {
      ...feedback,
      userId,
      createdAt: Date.now(),
    };
    
    await feedbackDoc.set(fullFeedback);
    
    // If negative (rating <= 3 or frustration/bug type), route to support
    if (
      (fullFeedback.rating !== undefined && fullFeedback.rating <= 3) ||
      fullFeedback.type === "frustration" ||
      fullFeedback.type === "bug"
    ) {
      await this.routeToSupport(userId, fullFeedback);
    }
    
    return feedbackDoc.id;
  }

  /**
   * Route negative feedback to support system (PACK 300/300A)
   */
  private async routeToSupport(userId: string, feedback: InAppFeedback): Promise<void> {
    // Create support ticket
    const ticketRef = db.collection("support").doc("tickets").collection("list").doc();
    
    await ticketRef.set({
      id: ticketRef.id,
      userId,
      category: feedback.type === "bug" ? "bug" : "app_experience",
      subcategory: feedback.type,
      status: "open",
      priority: feedback.rating === 1 ? "high" : "medium",
      subject: `In-app feedback: ${feedback.type}`,
      description: feedback.message || `User rating: ${feedback.rating}/5`,
      metadata: {
        feedbackType: feedback.type,
        rating: feedback.rating,
        platform: feedback.platform,
        appVersion: feedback.appVersion,
        deviceInfo: feedback.deviceInfo,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Update feedback with ticket reference
    await db
      .collection("users")
      .doc(userId)
      .collection("inAppFeedback")
      .doc(feedback.userId) // assuming we have the doc ID
      .update({
        handledBySupport: true,
        supportTicketId: ticketRef.id,
      });
  }

  /**
   * Get rating trends for a platform/country
   */
  async getRatingTrends(
    platform: StorePlatform,
    country: string,
    daysBack: number = 30
  ): Promise<StoreRatingSnapshot[]> {
    const cutoffTime = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    
    const snapshots = await db
      .collection("analytics")
      .doc("storeRatings")
      .collection("snapshots")
      .where("platform", "==", platform)
      .where("country", "==", country)
      .where("capturedAt", ">", cutoffTime)
      .orderBy("capturedAt", "asc")
      .get();
    
    return snapshots.docs.map(doc => doc.data() as StoreRatingSnapshot);
  }
}

export const asoService = new ASOService();
