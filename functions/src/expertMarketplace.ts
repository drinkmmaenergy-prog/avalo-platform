/**
 * PACK 136: Verified Expert / Mentorship Marketplace
 * 
 * Zero Escort/Dating Loopholes - Fully Inside Avalo
 * 
 * Features:
 * - Expert verification with KYC
 * - SAFE categories only (no dating/romance/escort)
 * - Multiple offer types (chat, calls, sessions, curriculum)
 * - Anti-escort phrase detection
 * - In-app sessions only (no Zoom/WhatsApp)
 * - Non-competitive ratings
 * - Safe analytics (no spender tracking)
 * - 65/35 split preserved
 * - No ranking boost for experts
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db, serverTimestamp, increment, auth } from "./init";
import { FieldValue } from "firebase-admin/firestore";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Expert categories - SAFE ONLY
 */
enum ExpertCategory {
  FITNESS = "fitness",
  LIFESTYLE = "lifestyle",
  LANGUAGE = "language",
  FINANCE = "finance",
  BEAUTY = "beauty",
  CREATIVE = "creative",
  EDUCATION = "education",
  PRODUCTIVITY = "productivity",
  WELLNESS = "wellness",
  COOKING = "cooking",
}

/**
 * FORBIDDEN categories (auto-rejected)
 */
const FORBIDDEN_CATEGORIES = [
  "dating",
  "romance",
  "relationships",
  "companionship",
  "intimacy",
  "escort",
  "sugar",
  "girlfriend",
  "boyfriend",
];

/**
 * Offer types
 */
enum OfferType {
  CHAT_PER_MESSAGE = "chat_per_message",
  CALL_PER_MINUTE = "call_per_minute",
  GROUP_CALL_PER_MINUTE = "group_call_per_minute",
  SCHEDULED_SESSION = "scheduled_session",
  PREMIUM_POST = "premium_post",
  CURRICULUM = "curriculum",
}

/**
 * Expert verification status
 */
enum ExpertStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  SUSPENDED = "suspended",
}

/**
 * Session status
 */
enum SessionStatus {
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED_BY_EXPERT = "cancelled_by_expert",
  CANCELLED_BY_USER = "cancelled_by_user",
  NO_SHOW = "no_show",
}

/**
 * Review rating categories (skill-focused, NOT appearance)
 */
interface ReviewRating {
  expertise: number; // 1-5
  clarity: number; // 1-5
  professionalism: number; // 1-5
  helpfulness: number; // 1-5
}

// ============================================================================
// SAFETY FILTERS - ANTI-ESCORT/DATING
// ============================================================================

/**
 * Blocked phrases that indicate escort/dating/romance services
 * These trigger automatic rejection and AI case creation
 */
const BLOCKED_ESCORT_PHRASES = [
  // Direct escort terms
  "escort", "escorting", "companion service", "companionship for money",
  "paid dating", "sugar daddy", "sugar baby", "sugar dating",
  
  // Romance/relationship commodification
  "girlfriend experience", "boyfriend experience", "gfe", "bfe",
  "romantic roleplay", "date coaching", "dating partner",
  "relationship companion", "emotional partner",
  "intimate chat", "intimate conversation", "intimate session",
  "cuddle partner", "cuddling service", "cuddle session",
  
  // Implied arrangements
  "private relationship", "exclusive relationship", "personal relationship",
  "after-session dating", "off-platform dating",
  "i can be your", "be your girlfriend", "be your boyfriend",
  "premium emotional attention", "exclusive intimacy",
  "private attention", "special attention",
  
  // External platform bypasses
  "meet on zoom", "meet on whatsapp", "meet on telegram",
  "meet on discord", "continue on", "move to",
  "paypal me", "venmo me", "cashapp me",
  "onlyfans", "fansly", "patreon link",
  
  // Sexual/adult implications
  "adult services", "18+ content", "nsfw content",
  "erotic", "sensual", "seduction", "flirting coach",
  "pickup artist", "pua", "attraction coaching",
];

/**
 * Check for escort/dating loopholes in text
 */
function containsBlockedPhrases(text: string): { blocked: boolean; phrases: string[] } {
  const lowerText = text.toLowerCase();
  const foundPhrases: string[] = [];
  
  for (const phrase of BLOCKED_ESCORT_PHRASES) {
    if (lowerText.includes(phrase)) {
      foundPhrases.push(phrase);
    }
  }
  
  return {
    blocked: foundPhrases.length > 0,
    phrases: foundPhrases,
  };
}

/**
 * Validate expert category is SAFE
 */
function isValidCategory(category: string): boolean {
  const validCategories = Object.values(ExpertCategory);
  const isForbidden = FORBIDDEN_CATEGORIES.some((forbidden) =>
    category.toLowerCase().includes(forbidden)
  );
  
  return validCategories.includes(category as ExpertCategory) && !isForbidden;
}

/**
 * Create AI case for escort/dating violation
 */
async function createEscortViolationCase(
  userId: string,
  violationType: string,
  details: string
): Promise<void> {
  await db.collection("ai_cases").add({
    userId,
    caseType: "ESCORT_LOOPHOLE_ATTEMPT",
    violationType,
    details,
    severity: "CRITICAL",
    status: "OPEN",
    createdAt: serverTimestamp(),
    requiresModeration: true,
  });
}

// ============================================================================
// EXPERT APPLICATION & VERIFICATION
// ============================================================================

/**
 * Submit expert application
 * Requires KYC verification first
 */
export const submitExpertApplication = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      category,
      bio,
      expertiseDescription,
      certifications,
      portfolio,
      achievements,
    } = request.data;

    // Validate required fields
    if (!category || !bio || !expertiseDescription) {
      throw new HttpsError(
        "invalid-argument",
        "Category, bio, and expertise description are required"
      );
    }

    // Check KYC status (PACK 84 integration)
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.kycVerified) {
      throw new HttpsError(
        "failed-precondition",
        "KYC verification required before applying as expert"
      );
    }

    // Validate category is SAFE
    if (!isValidCategory(category)) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid or forbidden category. Dating/romance categories are not allowed."
      );
    }

    // Check for blocked escort/dating phrases
    const bioCheck = containsBlockedPhrases(bio);
    const descCheck = containsBlockedPhrases(expertiseDescription);

    if (bioCheck.blocked || descCheck.blocked) {
      const allPhrases = [...bioCheck.phrases, ...descCheck.phrases];
      
      // Create violation case
      await createEscortViolationCase(
        userId,
        "EXPERT_APPLICATION_ESCORT_ATTEMPT",
        `Blocked phrases: ${allPhrases.join(", ")}`
      );

      throw new HttpsError(
        "invalid-argument",
        "Application contains prohibited content related to dating, escort, or companionship services. This has been flagged for review."
      );
    }

    // Check for existing application
    const existingApp = await db
      .collection("expert_applications")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "approved"])
      .limit(1)
      .get();

    if (!existingApp.empty) {
      throw new HttpsError(
        "already-exists",
        "You already have a pending or approved expert application"
      );
    }

    // Create application
    const applicationRef = await db.collection("expert_applications").add({
      userId,
      userName: userData.name,
      userAvatar: userData.avatar || null,
      category,
      bio: bio.substring(0, 500), // Max 500 chars
      expertiseDescription: expertiseDescription.substring(0, 1000),
      certifications: certifications || [],
      portfolio: portfolio || [],
      achievements: achievements || [],
      status: ExpertStatus.PENDING,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });

    return {
      success: true,
      applicationId: applicationRef.id,
      message: "Expert application submitted for review",
    };
  }
);

/**
 * Approve expert application (Admin/Moderator only)
 */
export const approveExpertApplication = onCall(
  { maxInstances: 5 },
  async (request) => {
    const reviewerId = request.auth?.uid;
    if (!reviewerId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { applicationId } = request.data;

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "Application ID required");
    }

    // Check admin/moderator role
    const reviewerDoc = await db.collection("users").doc(reviewerId).get();
    const reviewerRole = reviewerDoc.data()?.role;

    if (!["admin", "moderator"].includes(reviewerRole)) {
      throw new HttpsError(
        "permission-denied",
        "Only admins and moderators can approve applications"
      );
    }

    const applicationRef = db
      .collection("expert_applications")
      .doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      throw new HttpsError("not-found", "Application not found");
    }

    const applicationData = applicationDoc.data()!;

    if (applicationData.status !== ExpertStatus.PENDING) {
      throw new HttpsError(
        "failed-precondition",
        "Application already reviewed"
      );
    }

    await db.runTransaction(async (transaction) => {
      // Update application
      transaction.update(applicationRef, {
        status: ExpertStatus.APPROVED,
        reviewedAt: serverTimestamp(),
        reviewedBy: reviewerId,
        updatedAt: serverTimestamp(),
      });

      // Create expert profile
      const expertProfileRef = db
        .collection("expert_profiles")
        .doc(applicationData.userId);

      transaction.set(expertProfileRef, {
        expertId: applicationData.userId,
        userName: applicationData.userName,
        userAvatar: applicationData.userAvatar,
        category: applicationData.category,
        bio: applicationData.bio,
        expertiseDescription: applicationData.expertiseDescription,
        certifications: applicationData.certifications,
        portfolio: applicationData.portfolio,
        achievements: applicationData.achievements,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Analytics (non-gamified)
        totalSessions: 0,
        completedSessions: 0,
        totalEarnings: 0,
        averageRating: 0,
        totalReviews: 0,
      });

      // Update user document
      const userRef = db.collection("users").doc(applicationData.userId);
      transaction.update(userRef, {
        isExpert: true,
        expertCategory: applicationData.category,
        updatedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      message: "Expert application approved",
    };
  }
);

/**
 * Reject expert application (Admin/Moderator only)
 */
export const rejectExpertApplication = onCall(
  { maxInstances: 5 },
  async (request) => {
    const reviewerId = request.auth?.uid;
    if (!reviewerId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { applicationId, reason } = request.data;

    if (!applicationId || !reason) {
      throw new HttpsError(
        "invalid-argument",
        "Application ID and reason required"
      );
    }

    // Check admin/moderator role
    const reviewerDoc = await db.collection("users").doc(reviewerId).get();
    const reviewerRole = reviewerDoc.data()?.role;

    if (!["admin", "moderator"].includes(reviewerRole)) {
      throw new HttpsError(
        "permission-denied",
        "Only admins and moderators can reject applications"
      );
    }

    const applicationRef = db
      .collection("expert_applications")
      .doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      throw new HttpsError("not-found", "Application not found");
    }

    const applicationData = applicationDoc.data()!;

    if (applicationData.status !== ExpertStatus.PENDING) {
      throw new HttpsError(
        "failed-precondition",
        "Application already reviewed"
      );
    }

    await applicationRef.update({
      status: ExpertStatus.REJECTED,
      rejectionReason: reason,
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerId,
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      message: "Expert application rejected",
    };
  }
);

// ============================================================================
// MENTORSHIP OFFERS
// ============================================================================

/**
 * Create mentorship offer
 */
export const createMentorshipOffer = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      type,
      title,
      description,
      priceTokens,
      duration,
      maxGroupSize,
    } = request.data;

    // Validate required fields
    if (!type || !title || !description || !priceTokens) {
      throw new HttpsError(
        "invalid-argument",
        "Type, title, description, and price required"
      );
    }

    // Check expert status
    const expertDoc = await db.collection("expert_profiles").doc(userId).get();
    if (!expertDoc.exists) {
      throw new HttpsError("permission-denied", "User is not an approved expert");
    }

    const expertData = expertDoc.data()!;
    if (!expertData.isActive) {
      throw new HttpsError("permission-denied", "Expert profile is not active");
    }

    // Validate offer type
    if (!Object.values(OfferType).includes(type)) {
      throw new HttpsError("invalid-argument", "Invalid offer type");
    }

    // Check for blocked phrases
    const titleCheck = containsBlockedPhrases(title);
    const descCheck = containsBlockedPhrases(description);

    if (titleCheck.blocked || descCheck.blocked) {
      const allPhrases = [...titleCheck.phrases, ...descCheck.phrases];

      await createEscortViolationCase(
        userId,
        "OFFER_ESCORT_ATTEMPT",
        `Offer creation with blocked phrases: ${allPhrases.join(", ")}`
      );

      throw new HttpsError(
        "invalid-argument",
        "Offer contains prohibited content. Dating, romance, and companionship services are not allowed."
      );
    }

    // Validate price (10-10,000 tokens)
    if (priceTokens < 10 || priceTokens > 10000) {
      throw new HttpsError(
        "invalid-argument",
        "Price must be between 10 and 10,000 tokens"
      );
    }

    // Validate duration for time-based offers
    if (
      [OfferType.SCHEDULED_SESSION, OfferType.CALL_PER_MINUTE].includes(type)
    ) {
      if (!duration || duration < 15 || duration > 120) {
        throw new HttpsError(
          "invalid-argument",
          "Duration must be between 15 and 120 minutes"
        );
      }
    }

    // Create offer
    const offerRef = await db.collection("expert_offers").add({
      expertId: userId,
      expertName: expertData.userName,
      expertAvatar: expertData.userAvatar,
      expertCategory: expertData.category,
      type,
      title: title.substring(0, 100),
      description: description.substring(0, 500),
      priceTokens,
      duration: duration || null,
      maxGroupSize: maxGroupSize || 1,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Stats
      purchaseCount: 0,
      viewCount: 0,
    });

    return {
      success: true,
      offerId: offerRef.id,
      message: "Mentorship offer created",
    };
  }
);

/**
 * Update mentorship offer
 */
export const updateMentorshipOffer = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { offerId, title, description, priceTokens, isActive } = request.data;

    if (!offerId) {
      throw new HttpsError("invalid-argument", "Offer ID required");
    }

    const offerRef = db.collection("expert_offers").doc(offerId);
    const offerDoc = await offerRef.get();

    if (!offerDoc.exists) {
      throw new HttpsError("not-found", "Offer not found");
    }

    const offerData = offerDoc.data()!;

    if (offerData.expertId !== userId) {
      throw new HttpsError("permission-denied", "Not your offer");
    }

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (title !== undefined) {
      const titleCheck = containsBlockedPhrases(title);
      if (titleCheck.blocked) {
        await createEscortViolationCase(
          userId,
          "OFFER_UPDATE_ESCORT_ATTEMPT",
          `Blocked phrases in title: ${titleCheck.phrases.join(", ")}`
        );
        throw new HttpsError(
          "invalid-argument",
          "Title contains prohibited content"
        );
      }
      updates.title = title.substring(0, 100);
    }

    if (description !== undefined) {
      const descCheck = containsBlockedPhrases(description);
      if (descCheck.blocked) {
        await createEscortViolationCase(
          userId,
          "OFFER_UPDATE_ESCORT_ATTEMPT",
          `Blocked phrases in description: ${descCheck.phrases.join(", ")}`
        );
        throw new HttpsError(
          "invalid-argument",
          "Description contains prohibited content"
        );
      }
      updates.description = description.substring(0, 500);
    }

    if (priceTokens !== undefined) {
      if (priceTokens < 10 || priceTokens > 10000) {
        throw new HttpsError(
          "invalid-argument",
          "Price must be between 10 and 10,000 tokens"
        );
      }
      updates.priceTokens = priceTokens;
    }

    if (isActive !== undefined) {
      updates.isActive = isActive;
    }

    await offerRef.update(updates);

    return {
      success: true,
      message: "Offer updated",
    };
  }
);

/**
 * List expert offers
 */
export const listExpertOffers = onCall({ maxInstances: 10 }, async (request) => {
  const { expertId, onlyActive } = request.data;

  if (!expertId) {
    throw new HttpsError("invalid-argument", "Expert ID required");
  }

  let query = db
    .collection("expert_offers")
    .where("expertId", "==", expertId);

  if (onlyActive) {
    query = query.where("isActive", "==", true);
  }

  const snapshot = await query.orderBy("createdAt", "desc").get();

  const offers = snapshot.docs.map((doc) => ({
    offerId: doc.id,
    ...doc.data(),
  }));

  return {
    success: true,
    offers,
  };
});

// ============================================================================
// CURRICULUM BUILDER (SAFE ONLY)
// ============================================================================

/**
 * Create curriculum
 */
export const createCurriculum = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { title, description, priceTokens, lessons } = request.data;

    if (!title || !description || !priceTokens || !lessons) {
      throw new HttpsError(
        "invalid-argument",
        "Title, description, price, and lessons required"
      );
    }

    // Check expert status
    const expertDoc = await db.collection("expert_profiles").doc(userId).get();
    if (!expertDoc.exists) {
      throw new HttpsError("permission-denied", "User is not an approved expert");
    }

    // Check for blocked phrases
    const titleCheck = containsBlockedPhrases(title);
    const descCheck = containsBlockedPhrases(description);

    if (titleCheck.blocked || descCheck.blocked) {
      await createEscortViolationCase(
        userId,
        "CURRICULUM_ESCORT_ATTEMPT",
        "Blocked phrases in curriculum"
      );
      throw new HttpsError(
        "invalid-argument",
        "Curriculum contains prohibited content"
      );
    }

    // Validate all lessons
    for (const lesson of lessons) {
      const lessonTitleCheck = containsBlockedPhrases(lesson.title);
      const lessonDescCheck = containsBlockedPhrases(lesson.description || "");

      if (lessonTitleCheck.blocked || lessonDescCheck.blocked) {
        await createEscortViolationCase(
          userId,
          "CURRICULUM_LESSON_ESCORT_ATTEMPT",
          "Blocked phrases in lesson content"
        );
        throw new HttpsError(
          "invalid-argument",
          "Lesson content contains prohibited material"
        );
      }
    }

    const expertData = expertDoc.data()!;

    const curriculumRef = await db.collection("expert_curriculums").add({
      expertId: userId,
      expertName: expertData.userName,
      expertAvatar: expertData.userAvatar,
      expertCategory: expertData.category,
      title: title.substring(0, 100),
      description: description.substring(0, 1000),
      priceTokens,
      lessons: lessons.map((lesson: any) => ({
        lessonId: db.collection("_").doc().id,
        title: lesson.title.substring(0, 100),
        description: lesson.description?.substring(0, 500) || "",
        type: lesson.type, // video, audio, pdf, quiz
        contentRef: lesson.contentRef || null,
        duration: lesson.duration || null,
        order: lesson.order,
      })),
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      enrollmentCount: 0,
      completionRate: 0,
    });

    return {
      success: true,
      curriculumId: curriculumRef.id,
      message: "Curriculum created",
    };
  }
);

/**
 * Enroll in curriculum
 */
export const enrollInCurriculum = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { curriculumId } = request.data;

    if (!curriculumId) {
      throw new HttpsError("invalid-argument", "Curriculum ID required");
    }

    const curriculumRef = db.collection("expert_curriculums").doc(curriculumId);
    const curriculumDoc = await curriculumRef.get();

    if (!curriculumDoc.exists) {
      throw new HttpsError("not-found", "Curriculum not found");
    }

    const curriculumData = curriculumDoc.data()!;

    if (!curriculumData.isActive) {
      throw new HttpsError("failed-precondition", "Curriculum not active");
    }

    // Cannot enroll in own curriculum
    if (curriculumData.expertId === userId) {
      throw new HttpsError("failed-precondition", "Cannot enroll in own curriculum");
    }

    // Check existing enrollment
    const existingEnrollment = await db
      .collection("curriculum_enrollments")
      .where("curriculumId", "==", curriculumId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existingEnrollment.empty) {
      throw new HttpsError("already-exists", "Already enrolled");
    }

    const priceTokens = curriculumData.priceTokens;
    const platformFee = Math.floor(priceTokens * 0.35);
    const expertEarnings = priceTokens - platformFee;

    await db.runTransaction(async (transaction) => {
      // Check buyer balance
      const buyerRef = db.collection("users").doc(userId);
      const buyerDoc = await transaction.get(buyerRef);
      const buyerBalance = buyerDoc.data()?.tokenBalance || 0;

      if (buyerBalance < priceTokens) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Deduct from buyer
      transaction.update(buyerRef, {
        tokenBalance: increment(-priceTokens),
        updatedAt: serverTimestamp(),
      });

      // Add to expert
      const expertRef = db.collection("users").doc(curriculumData.expertId);
      transaction.update(expertRef, {
        tokenBalance: increment(expertEarnings),
        updatedAt: serverTimestamp(),
      });

      // Create enrollment
      const enrollmentRef = db.collection("curriculum_enrollments").doc();
      transaction.set(enrollmentRef, {
        enrollmentId: enrollmentRef.id,
        curriculumId,
        curriculumTitle: curriculumData.title,
        userId,
        userName: buyerDoc.data()?.name || "Unknown",
        expertId: curriculumData.expertId,
        expertName: curriculumData.expertName,
        tokensAmount: priceTokens,
        platformFee,
        expertEarnings,
        progress: 0,
        completedLessons: [],
        startedAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
        completedAt: null,
        status: "active",
      });

      // Update curriculum stats
      transaction.update(curriculumRef, {
        enrollmentCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      // Update expert earnings
      const expertProfileRef = db
        .collection("expert_profiles")
        .doc(curriculumData.expertId);
      transaction.update(expertProfileRef, {
        totalEarnings: increment(expertEarnings),
        updatedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      message: "Enrolled in curriculum",
    };
  }
);

// ============================================================================
// SESSION SCHEDULING (IN-APP ONLY)
// ============================================================================

/**
 * Schedule mentorship session
 */
export const scheduleMentorshipSession = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { offerId, scheduledTime } = request.data;

    if (!offerId || !scheduledTime) {
      throw new HttpsError(
        "invalid-argument",
        "Offer ID and scheduled time required"
      );
    }

    const offerRef = db.collection("expert_offers").doc(offerId);
    const offerDoc = await offerRef.get();

    if (!offerDoc.exists) {
      throw new HttpsError("not-found", "Offer not found");
    }

    const offerData = offerDoc.data()!;

    if (!offerData.isActive) {
      throw new HttpsError("failed-precondition", "Offer not active");
    }

    if (offerData.type !== OfferType.SCHEDULED_SESSION) {
      throw new HttpsError(
        "invalid-argument",
        "Offer is not a scheduled session type"
      );
    }

    // Cannot book own session
    if (offerData.expertId === userId) {
      throw new HttpsError("failed-precondition", "Cannot book own session");
    }

    const priceTokens = offerData.priceTokens;
    const platformFee = Math.floor(priceTokens * 0.35);
    const expertEarnings = priceTokens - platformFee;

    const sessionId = db.collection("_").doc().id;

    await db.runTransaction(async (transaction) => {
      // Check balance
      const userRef = db.collection("users").doc(userId);
      const userDoc = await transaction.get(userRef);
      const userBalance = userDoc.data()?.tokenBalance || 0;

      if (userBalance < priceTokens) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Deduct tokens from user
      transaction.update(userRef, {
        tokenBalance: increment(-priceTokens),
        updatedAt: serverTimestamp(),
      });

      // Create session (tokens in escrow until completion)
      const sessionRef = db.collection("mentor_sessions").doc(sessionId);
      transaction.set(sessionRef, {
        sessionId,
        offerId,
        offerTitle: offerData.title,
        offerType: offerData.type,
        expertId: offerData.expertId,
        expertName: offerData.expertName,
        expertAvatar: offerData.expertAvatar,
        userId,
        userName: userDoc.data()?.name || "Unknown",
        userAvatar: userDoc.data()?.avatar || null,
        scheduledTime,
        duration: offerData.duration,
        tokensAmount: priceTokens,
        platformFee,
        expertEarnings,
        status: SessionStatus.SCHEDULED,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        autoRefundProcessed: false,
      });

      // Update offer stats
      transaction.update(offerRef, {
        purchaseCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      sessionId,
      message: "Session scheduled",
    };
  }
);

/**
 * Cancel session (by user or expert)
 */
export const cancelMentorshipSession = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId, reason } = request.data;

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Session ID required");
    }

    const sessionRef = db.collection("mentor_sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }

    const sessionData = sessionDoc.data()!;

    // Only participant or expert can cancel
    if (sessionData.userId !== userId && sessionData.expertId !== userId) {
      throw new HttpsError("permission-denied", "Not your session");
    }

    if (sessionData.status !== SessionStatus.SCHEDULED) {
      throw new HttpsError(
        "failed-precondition",
        "Can only cancel scheduled sessions"
      );
    }

    const cancelledBy =
      sessionData.expertId === userId ? "expert" : "user";
    const newStatus =
      cancelledBy === "expert"
        ? SessionStatus.CANCELLED_BY_EXPERT
        : SessionStatus.CANCELLED_BY_USER;

    await db.runTransaction(async (transaction) => {
      // Update session
      transaction.update(sessionRef, {
        status: newStatus,
        cancelledAt: serverTimestamp(),
        cancellationReason: reason || null,
        updatedAt: serverTimestamp(),
      });

      // Refund user (expert cancellation = full refund)
      if (cancelledBy === "expert") {
        const userRef = db.collection("users").doc(sessionData.userId);
        transaction.update(userRef, {
          tokenBalance: increment(sessionData.tokensAmount),
          updatedAt: serverTimestamp(),
        });

        transaction.update(sessionRef, {
          autoRefundProcessed: true,
        });
      }
    });

    return {
      success: true,
      message: `Session cancelled${cancelledBy === "expert" ? " and refunded" : ""}`,
    };
  }
);

/**
 * Complete session and release payment
 */
export const completeMentorshipSession = onCall(
  { maxInstances: 10 },
  async (request) => {
    const expertId = request.auth?.uid;
    if (!expertId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Session ID required");
    }

    const sessionRef = db.collection("mentor_sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }

    const sessionData = sessionDoc.data()!;

    if (sessionData.expertId !== expertId) {
      throw new HttpsError("permission-denied", "Not your session");
    }

    if (sessionData.status !== SessionStatus.IN_PROGRESS) {
      throw new HttpsError(
        "failed-precondition",
        "Session must be in progress to complete"
      );
    }

    await db.runTransaction(async (transaction) => {
      // Update session
      transaction.update(sessionRef, {
        status: SessionStatus.COMPLETED,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Release payment to expert
      const expertRef = db.collection("users").doc(expertId);
      transaction.update(expertRef, {
        tokenBalance: increment(sessionData.expertEarnings),
        updatedAt: serverTimestamp(),
      });

      // Update expert stats
      const expertProfileRef = db.collection("expert_profiles").doc(expertId);
      transaction.update(expertProfileRef, {
        totalSessions: increment(1),
        completedSessions: increment(1),
        totalEarnings: increment(sessionData.expertEarnings),
        updatedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      message: "Session completed and payment released",
    };
  }
);

// ============================================================================
// RATINGS & REVIEWS (NON-COMPETITIVE, SKILL-FOCUSED)
// ============================================================================

/**
 * Leave expert review (skill-focused only)
 */
export const leaveExpertReview = onCall(
  { maxInstances: 10 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId, ratings, comment } = request.data;

    if (!sessionId || !ratings) {
      throw new HttpsError(
        "invalid-argument",
        "Session ID and ratings required"
      );
    }

    // Validate ratings (skill-focused only)
    const requiredFields = ["expertise", "clarity", "professionalism", "helpfulness"];
    for (const field of requiredFields) {
      if (!ratings[field] || ratings[field] < 1 || ratings[field] > 5) {
        throw new HttpsError(
          "invalid-argument",
          `Rating for ${field} must be between 1 and 5`
        );
      }
    }

    // Check for forbidden rating categories
    const forbiddenRatingFields = [
      "attractiveness",
      "beauty",
      "sexiness",
      "flirtiness",
      "chemistry",
    ];
    for (const field of forbiddenRatingFields) {
      if (ratings[field] !== undefined) {
        throw new HttpsError(
          "invalid-argument",
          "Appearance-based ratings are not allowed"
        );
      }
    }

    const sessionRef = db.collection("mentor_sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }

    const sessionData = sessionDoc.data()!;

    if (sessionData.userId !== userId) {
      throw new HttpsError("permission-denied", "Not your session");
    }

    if (sessionData.status !== SessionStatus.COMPLETED) {
      throw new HttpsError(
        "failed-precondition",
        "Can only review completed sessions"
      );
    }

    // Check for existing review
    const existingReview = await db
      .collection("expert_reviews")
      .where("sessionId", "==", sessionId)
      .where("reviewerId", "==", userId)
      .limit(1)
      .get();

    if (!existingReview.empty) {
      throw new HttpsError("already-exists", "Review already submitted");
    }

    // Check comment for blocked phrases
    if (comment) {
      const commentCheck = containsBlockedPhrases(comment);
      if (commentCheck.blocked) {
        throw new HttpsError(
          "invalid-argument",
          "Review contains inappropriate content"
        );
      }
    }

    const averageRating =
      (ratings.expertise +
        ratings.clarity +
        ratings.professionalism +
        ratings.helpfulness) /
      4;

    await db.runTransaction(async (transaction) => {
      // Create review
      const reviewRef = db.collection("expert_reviews").doc();
      transaction.set(reviewRef, {
        reviewId: reviewRef.id,
        expertId: sessionData.expertId,
        reviewerId: userId,
        reviewerName: sessionData.userName,
        sessionId,
        offerId: sessionData.offerId,
        ratings: {
          expertise: ratings.expertise,
          clarity: ratings.clarity,
          professionalism: ratings.professionalism,
          helpfulness: ratings.helpfulness,
        },
        averageRating,
        comment: comment?.substring(0, 500) || null,
        createdAt: serverTimestamp(),
        isVisible: true,
      });

      // Update expert profile ratings
      const expertProfileRef = db
        .collection("expert_profiles")
        .doc(sessionData.expertId);
      const expertProfileDoc = await transaction.get(expertProfileRef);
      const expertProfile = expertProfileDoc.data()!;

      const currentTotal = expertProfile.averageRating * expertProfile.totalReviews;
      const newTotal = currentTotal + averageRating;
      const newCount = expertProfile.totalReviews + 1;
      const newAverage = newTotal / newCount;

      transaction.update(expertProfileRef, {
        averageRating: newAverage,
        totalReviews: newCount,
        updatedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      message: "Review submitted",
    };
  }
);

// ============================================================================
// ANALYTICS (SAFE & NON-GAMIFIED)
// ============================================================================

/**
 * Get expert analytics (safe, no user identification)
 */
export const getExpertAnalytics = onCall(
  { maxInstances: 10 },
  async (request) => {
    const expertId = request.auth?.uid;
    if (!expertId) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Verify expert
    const expertDoc = await db.collection("expert_profiles").doc(expertId).get();
    if (!expertDoc.exists) {
      throw new HttpsError("permission-denied", "Not an expert");
    }

    const expertData = expertDoc.data()!;

    // Get session stats (anonymized)
    const completedSessions = await db
      .collection("mentor_sessions")
      .where("expertId", "==", expertId)
      .where("status", "==", SessionStatus.COMPLETED)
      .get();

    const cancelledSessions = await db
      .collection("mentor_sessions")
      .where("expertId", "==", expertId)
      .where("status", "in", [
        SessionStatus.CANCELLED_BY_EXPERT,
        SessionStatus.CANCELLED_BY_USER,
      ])
      .get();

    const totalSessions = completedSessions.size + cancelledSessions.size;
    const completionRate =
      totalSessions > 0 ? (completedSessions.size / totalSessions) * 100 : 0;

    // Get curriculum stats
    const curriculums = await db
      .collection("expert_curriculums")
      .where("expertId", "==", expertId)
      .get();

    const totalEnrollments = curriculums.docs.reduce(
      (sum, doc) => sum + (doc.data().enrollmentCount || 0),
      0
    );

    // Get offer stats
    const offers = await db
      .collection("expert_offers")
      .where("expertId", "==", expertId)
      .get();

    const totalOfferViews = offers.docs.reduce(
      (sum, doc) => sum + (doc.data().viewCount || 0),
      0
    );

    const totalOfferPurchases = offers.docs.reduce(
      (sum, doc) => sum + (doc.data().purchaseCount || 0),
      0
    );

    return {
      success: true,
      analytics: {
        // Session metrics
        totalSessions: expertData.totalSessions || 0,
        completedSessions: expertData.completedSessions || 0,
        completionRate: completionRate.toFixed(1),
        
        // Earnings (cumulative only)
        totalEarnings: expertData.totalEarnings || 0,
        
        // Quality metrics
        averageRating: expertData.averageRating || 0,
        totalReviews: expertData.totalReviews || 0,
        
        // Reach metrics (anonymized)
        totalOfferViews,
        totalOfferPurchases,
        conversionRate:
          totalOfferViews > 0
            ? ((totalOfferPurchases / totalOfferViews) * 100).toFixed(1)
            : "0.0",
        
        // Curriculum metrics
        activeCurriculums: curriculums.docs.filter(
          (doc) => doc.data().isActive
        ).length,
        totalEnrollments,
        
        // NO spender tracking
        // NO user identification
        // NO ranking data
      },
    };
  }
);

// ============================================================================
// EVENT TRIGGERS
// ============================================================================

/**
 * Notify expert of new session booking
 */
export const notifyExpertOfBooking = onDocumentCreated(
  "mentor_sessions/{sessionId}",
  async (event) => {
    const sessionData = event.data?.data();
    if (!sessionData) return;

    await db.collection("notifications").add({
      userId: sessionData.expertId,
      type: "MENTORSHIP_SESSION_BOOKED",
      title: "New Session Booked",
      body: `${sessionData.userName} booked a session: ${sessionData.offerTitle}`,
      data: {
        sessionId: sessionData.sessionId,
        offerId: sessionData.offerId,
        scheduledTime: sessionData.scheduledTime,
      },
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }
);

/**
 * Notify user of expert approval
 */
export const notifyUserOnExpertApproval = onDocumentCreated(
  "expert_profiles/{expertId}",
  async (event) => {
    const expertData = event.data?.data();
    if (!expertData) return;

    await db.collection("notifications").add({
      userId: expertData.expertId,
      type: "EXPERT_APPLICATION_APPROVED",
      title: "Expert Application Approved",
      body: "You are now verified as an expert! Start creating offers.",
      data: {
        expertId: expertData.expertId,
        category: expertData.category,
      },
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }
);