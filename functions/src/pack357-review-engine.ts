/**
 * PACK 357 — Review Engine
 * 
 * Manages app store review requests with fraud protection
 * Integrates with PACK 302 (Fraud) for anti-review fraud
 * 
 * Rules:
 * - Only verified users can be asked for review
 * - Max 1 request every 30 days
 * - Never trigger after refund
 * - Negative sentiment users are excluded
 */

import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";

export type ReviewTrigger =
  | "FIRST_SUCCESSFUL_CHAT"
  | "FIRST_PAYOUT"
  | "FIRST_MEETING_COMPLETED"
  | "VIP_ACTIVATED";

export interface ReviewRequest {
  requestId: string;
  userId: string;
  trigger: ReviewTrigger;
  
  // Status
  status: "PENDING" | "SHOWN" | "SUBMITTED" | "DECLINED" | "CANCELLED";
  
  // Review outcome
  reviewSubmitted: boolean;
  rating?: number; // 1-5 stars
  reviewText?: string;
  
  // Timestamps
  requestedAt: Timestamp;
  shownAt?: Timestamp;
  submittedAt?: Timestamp;
  
  // Context
  platform: "IOS" | "ANDROID";
  appVersion: string;
}

export interface ReviewEligibility {
  eligible: boolean;
  reason?: string;
  nextEligibleDate?: Date;
}

export interface UserReviewHistory {
  userId: string;
  lastReviewRequestDate?: Timestamp;
  lastReviewSubmittedDate?: Timestamp;
  totalRequestsSent: number;
  totalReviewsSubmitted: number;
  hasDeclinedRecently: boolean;
}

/**
 * Check if a user is eligible for a review request
 */
export async function checkReviewEligibility(
  userId: string
): Promise<ReviewEligibility> {
  // Check if user is verified
  const userDoc = await db.collection("users").doc(userId).get();
  
  if (!userDoc.exists) {
    return {
      eligible: false,
      reason: "User not found",
    };
  }
  
  const userData = userDoc.data()!;
  
  // Rule 1: Only verified users
  if (!userData.verified || userData.verificationStatus !== "VERIFIED") {
    return {
      eligible: false,
      reason: "User not verified",
    };
  }
  
  // Rule 2: Check if user has negative sentiment
  if (userData.sentiment && userData.sentiment < 0.3) {
    return {
      eligible: false,
      reason: "User has negative sentiment",
    };
  }
  
  // Rule 3: Check for recent refunds
  const recentRefundSnapshot = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .where("type", "==", "REFUND")
    .where("createdAt", ">", Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .limit(1)
    .get();
  
  if (!recentRefundSnapshot.empty) {
    return {
      eligible: false,
      reason: "Recent refund detected",
    };
  }
  
  // Rule 4: Check review history (max 1 request per 30 days)
  const historyDoc = await db
    .collection("user_review_history")
    .doc(userId)
    .get();
  
  if (historyDoc.exists) {
    const history = historyDoc.data() as UserReviewHistory;
    
    if (history.lastReviewRequestDate) {
      const daysSinceLastRequest =
        (Date.now() - history.lastReviewRequestDate.toMillis()) /
        (24 * 60 * 60 * 1000);
      
      if (daysSinceLastRequest < 30) {
        const nextEligibleDate = new Date(
          history.lastReviewRequestDate.toMillis() + 30 * 24 * 60 * 60 * 1000
        );
        
        return {
          eligible: false,
          reason: "Too soon since last request",
          nextEligibleDate,
        };
      }
    }
    
    // Check if user has declined recently (within 7 days)
    if (history.hasDeclinedRecently) {
      return {
        eligible: false,
        reason: "User declined review recently",
      };
    }
  }
  
  // Rule 5: Check fraud indicators (PACK 302 integration)
  const fraudScore = await getFraudScore(userId);
  if (fraudScore > 0.7) {
    return {
      eligible: false,
      reason: "High fraud score detected",
    };
  }
  
  // All checks passed
  return {
    eligible: true,
  };
}

/**
 * Request a review from a user
 */
export async function requestReview(
  userId: string,
  trigger: ReviewTrigger,
  platform: "IOS" | "ANDROID",
  appVersion: string
): Promise<ReviewRequest | null> {
  // Check eligibility first
  const eligibility = await checkReviewEligibility(userId);
  
  if (!eligibility.eligible) {
    logger.info(`User ${userId} not eligible for review: ${eligibility.reason}`);
    return null;
  }
  
  const requestId = db.collection("review_requests").doc().id;
  const now = Timestamp.now();
  
  const request: ReviewRequest = {
    requestId,
    userId,
    trigger,
    status: "PENDING",
    reviewSubmitted: false,
    requestedAt: now,
    platform,
    appVersion,
  };
  
  // Create review request
  await db.collection("review_requests").doc(requestId).set(request);
  
  // Update user review history
  await updateReviewHistory(userId, now);
  
  logger.info(`Review requested for user ${userId}`, {
    trigger,
    platform,
  });
  
  return request;
}

/**
 * Mark review request as shown to user
 */
export async function markReviewShown(requestId: string): Promise<void> {
  const now = Timestamp.now();
  
  await db.collection("review_requests").doc(requestId).update({
    status: "SHOWN",
    shownAt: now,
  });
  
  logger.info(`Review shown: ${requestId}`);
}

/**
 * Record user's review submission
 */
export async function submitReview(
  requestId: string,
  rating: number,
  reviewText?: string
): Promise<void> {
  const now = Timestamp.now();
  
  const requestDoc = await db.collection("review_requests").doc(requestId).get();
  
  if (!requestDoc.exists) {
    throw new Error(`Review request not found: ${requestId}`);
  }
  
  const request = requestDoc.data() as ReviewRequest;
  
  // Update review request
  await db.collection("review_requests").doc(requestId).update({
    status: "SUBMITTED",
    reviewSubmitted: true,
    rating,
    reviewText: reviewText || "",
    submittedAt: now,
  });
  
  // Update user history
  await db
    .collection("user_review_history")
    .doc(request.userId)
    .set(
      {
        lastReviewSubmittedDate: now,
        totalReviewsSubmitted: FieldValue.increment(1),
      },
      { merge: true }
    );
  
  // Track review sentiment
  await trackReviewSentiment(request.userId, rating, reviewText);
  
  logger.info(`Review submitted: ${requestId}`, {
    rating,
    hasText: !!reviewText,
  });
}

/**
 * Record that user declined to review
 */
export async function declineReview(requestId: string): Promise<void> {
  const requestDoc = await db.collection("review_requests").doc(requestId).get();
  
  if (!requestDoc.exists) {
    throw new Error(`Review request not found: ${requestId}`);
  }
  
  const request = requestDoc.data() as ReviewRequest;
  
  // Update review request
  await db.collection("review_requests").doc(requestId).update({
    status: "DECLINED",
  });
  
  // Mark user as having declined recently
  await db
    .collection("user_review_history")
    .doc(request.userId)
    .set(
      {
        hasDeclinedRecently: true,
      },
      { merge: true }
    );
  
  // Reset the "declined recently" flag after 7 days
  setTimeout(async () => {
    await  db
      .collection("user_review_history")
      .doc(request.userId)
      .update({
        hasDeclinedRecently: false,
      });
  }, 7 * 24 * 60 * 60 * 1000);
  
  logger.info(`Review declined: ${requestId}`);
}

/**
 * Update user review history
 */
async function updateReviewHistory(
  userId: string,
  requestedAt: Timestamp
): Promise<void> {
  await db
    .collection("user_review_history")
    .doc(userId)
    .set(
      {
        userId,
        lastReviewRequestDate: requestedAt,
        totalRequestsSent: FieldValue.increment(1),
      },
      { merge: true }
    );
}

/**
 * Get fraud score for user (integrates with PACK 302)
 */
async function getFraudScore(userId: string): Promise<number> {
  try {
    const fraudDoc = await db
      .collection("fraud_scores")
      .doc(userId)
      .get();
    
    if (!fraudDoc.exists) {
      return 0; // No fraud data, assume safe
    }
    
    const fraudData = fraudDoc.data()!;
    return fraudData.score || 0;
  } catch (error) {
    logger.error(`Failed to get fraud score for ${userId}`, error);
    return 0; // Fail open: if we can't check, don't block
  }
}

/**
 * Track review sentiment for analytics
 */
async function trackReviewSentiment(
  userId: string,
  rating: number,
  reviewText?: string
): Promise<void> {
  const sentiment = rating >= 4 ? "POSITIVE" : rating === 3 ? "NEUTRAL" : "NEGATIVE";
  
  await db.collection("review_sentiment").add({
    userId,
    rating,
    reviewText: reviewText || "",
    sentiment,
    createdAt: Timestamp.now(),
  });
  
  // Update user sentiment score
  const sentimentScore = rating / 5; // Normalize to 0-1
  await db
    .collection("users")
    .doc(userId)
    .set(
      {
        sentiment: sentimentScore,
        lastReviewRating: rating,
      },
      { merge: true }
    );
}

/**
 * Get review statistics
 */
export async function getReviewStats(
  startDate: string,
  endDate: string
): Promise<{
  totalRequests: number;
  totalShown: number;
  totalSubmitted: number;
  totalDeclined: number;
  averageRating: number;
  conversionRate: number;
}> {
  const start = Timestamp.fromDate(new Date(startDate));
  const end = Timestamp.fromDate(new Date(endDate));
  
  const snapshot = await db
    .collection("review_requests")
    .where("requestedAt", ">=", start)
    .where("requestedAt", "<=", end)
    .get();
  
  const requests = snapshot.docs.map(doc => doc.data() as ReviewRequest);
  
  const stats = {
    totalRequests: requests.length,
    totalShown: requests.filter(r => r.status === "SHOWN" || r.status === "SUBMITTED" || r.status === "DECLINED").length,
    totalSubmitted: requests.filter(r => r.status === "SUBMITTED").length,
    totalDeclined: requests.filter(r => r.status === "DECLINED").length,
    averageRating: 0,
    conversionRate: 0,
  };
  
  // Calculate average rating
  const ratingsSubmitted = requests.filter(r => r.rating);
  if (ratingsSubmitted.length > 0) {
    const totalRating = ratingsSubmitted.reduce((sum, r) => sum + (r.rating || 0), 0);
    stats.averageRating = totalRating / ratingsSubmitted.length;
  }
  
  // Calculate conversion rate (submitted / shown)
  if (stats.totalShown > 0) {
    stats.conversionRate = stats.totalSubmitted / stats.totalShown;
  }
  
  return stats;
}

/**
 * Get pending review requests for a user
 */
export async function getPendingReviewRequest(
  userId: string
): Promise<ReviewRequest | null> {
  const snapshot = await db
    .collection("review_requests")
    .where("userId", "==", userId)
    .where("status", "==", "PENDING")
    .orderBy("requestedAt", "desc")
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as ReviewRequest;
}

/**
 * Cancel a pending review request
 */
export async function cancelReviewRequest(requestId: string): Promise<void> {
  await db.collection("review_requests").doc(requestId).update({
    status: "CANCELLED",
  });
  
  logger.info(`Review request cancelled: ${requestId}`);
}

/**
 * Get review history for a user
 */
export async function getUserReviewHistory(
  userId: string
): Promise<UserReviewHistory | null> {
  const historyDoc = await db
    .collection("user_review_history")
    .doc(userId)
    .get();
  
  if (!historyDoc.exists) {
    return null;
  }
  
  return historyDoc.data() as UserReviewHistory;
}

/**
 * Detect and block fake/fraudulent reviews
 * Integration with PACK 302 (Fraud Protection)
 */
export async function detectFraudulentReview(
  userId: string,
  requestId: string
): Promise<{
  isFraudulent: boolean;
  reason?: string;
}> {
  // Check 1: Emulator detection
  const userDoc = await db.collection("users").doc(userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data()!;
    if (userData.isEmulator) {
      return {
        isFraudulent: true,
        reason: "Emulator detected",
      };
    }
  }
  
  // Check 2: Burst review patterns
  const recentReviews = await db
    .collection("review_requests")
    .where("userId", "==", userId)
    .where("status", "==", "SUBMITTED")
    .where("submittedAt", ">", Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .get();
  
  if (recentReviews.size > 3) {
    return {
      isFraudulent: true,
      reason: "Burst review pattern detected",
    };
  }
  
  // Check 3: Geo/IP clustering (multiple reviews from same IP)
  const requestDoc = await db.collection("review_requests").doc(requestId).get();
  if (requestDoc.exists) {
    const request = requestDoc.data() as ReviewRequest;
    // This would integrate with PACK 302's IP tracking
    // Simplified here
  }
  
  // All checks passed
  return {
    isFraudulent: false,
  };
}
