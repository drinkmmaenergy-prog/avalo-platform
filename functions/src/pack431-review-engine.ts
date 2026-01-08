/**
 * PACK 431: Review & Rating Optimization Engine
 * 
 * Smart review request timing and automated responses
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ReviewPromptTrigger {
  type: "paid_chat" | "successful_event" | "wallet_withdrawal" | "milestone";
  userId: string;
  timestamp: Date;
  metadata?: any;
}

export interface ReviewPromptBlock {
  type: "failed_refund" | "safety_escalation" | "ban_appeal" | "negative_feedback";
  userId: string;
  timestamp: Date;
  reason: string;
  durationDays?: number;
}

export interface ReviewResponse {
  reviewId: string;
  userId: string;
  rating: number;
  text: string;
  platform: "ios" | "android";
  country: string;
  language: string;
  timestamp: Date;
}

export interface AutoReplyConfig {
  rating: number;
  language: string;
  template: string;
  action?: "thank" | "improve" | "support";
}

// ============================================================================
// REVIEW PROMPT TRIGGERS
// ============================================================================

export class ReviewPromptEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Check if user is eligible for review prompt
   */
  async isEligibleForReview(userId: string): Promise<boolean> {
    // Check if already reviewed
    const existingReview = await this.db
      .collection("user_reviews_pack431")
      .where("userId", "==", userId)
      .limit(1)
      .get();
    
    if (!existingReview.empty) {
      logger.info("User already reviewed app", { userId });
      return false;
    }
    
    // Check for active blocks
    const blocks = await this.getActiveBlocks(userId);
    if (blocks.length > 0) {
      logger.info("User blocked from review prompt", {
        userId,
        blocks: blocks.map(b => b.type)
      });
      return false;
    }
    
    // Check if recently prompted (avoid spam)
    const recentPrompt = await this.db
      .collection("review_prompts_pack431")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
    
    if (!recentPrompt.empty) {
      const lastPrompt = recentPrompt.docs[0].data();
      const daysSincePrompt = (Date.now() - lastPrompt.timestamp.toDate().getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSincePrompt < 30) {
        logger.info("User recently prompted", { userId, daysSincePrompt });
        return false;
      }
    }
    
    return true;
  }

  /**
   * Trigger review prompt on positive event
   */
  async triggerReviewPrompt(trigger: ReviewPromptTrigger): Promise<boolean> {
    const eligible = await this.isEligibleForReview(trigger.userId);
    
    if (!eligible) {
      return false;
    }
    
    // Record prompt
    await this.db.collection("review_prompts_pack431").add({
      userId: trigger.userId,
      triggerType: trigger.type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: trigger.metadata,
      shown: true
    });
    
    logger.info("Triggered review prompt", {
      userId: trigger.userId,
      trigger: trigger.type
    });
    
    return true;
  }

  /**
   * Block review prompt for negative events
   */
  async blockReviewPrompt(block: ReviewPromptBlock): Promise<void> {
    const expiresAt = new Date();
    if (block.durationDays) {
      expiresAt.setDate(expiresAt.getDate() + block.durationDays);
    } else {
      // Default: block for 90 days
      expiresAt.setDate(expiresAt.getDate() + 90);
    }
    
    await this.db.collection("review_prompt_blocks_pack431").add({
      userId: block.userId,
      blockType: block.type,
      reason: block.reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      active: true
    });
    
    logger.info("Blocked review prompt", {
      userId: block.userId,
      type: block.type,
      durationDays: block.durationDays || 90
    });
  }

  /**
   * Get active blocks for user
   */
  private async getActiveBlocks(userId: string): Promise<ReviewPromptBlock[]> {
    const now = new Date();
    
    const blocks = await this.db
      .collection("review_prompt_blocks_pack431")
      .where("userId", "==", userId)
      .where("active", "==", true)
      .where("expiresAt", ">", now)
      .get();
    
    return blocks.docs.map(doc => doc.data() as ReviewPromptBlock);
  }

  /**
   * Check trigger conditions for specific events
   */
  async checkTriggerConditions(
    userId: string,
    eventType: ReviewPromptTrigger["type"]
  ): Promise<boolean> {
    switch (eventType) {
      case "paid_chat":
        return await this.checkFirstPaidChat(userId);
      
      case "successful_event":
        return await this.checkSuccessfulEvent(userId);
      
      case "wallet_withdrawal":
        return await this.checkFirstWithdrawal(userId);
      
      case "milestone":
        return await this.checkMilestone(userId);
      
      default:
        return false;
    }
  }

  /**
   * Check if first successful paid chat
   */
  private async checkFirstPaidChat(userId: string): Promise<boolean> {
    const paidChats = await this.db
      .collection("chat_sessions")
      .where("userId", "==", userId)
      .where("paid", "==", true)
      .where("completed", "==", true)
      .limit(2)
      .get();
    
    // Trigger on first paid chat
    return paidChats.size === 1;
  }

  /**
   * Check if successful event attendance
   */
  private async checkSuccessfulEvent(userId: string): Promise<boolean> {
    const events = await this.db
      .collection("event_attendances")
      .where("userId", "==", userId)
      .where("attended", "==", true)
      .where("rating", ">=", 4)
      .limit(2)
      .get();
    
    // Trigger after first well-rated event
    return events.size === 1;
  }

  /**
   * Check if first wallet withdrawal
   */
  private async checkFirstWithdrawal(userId: string): Promise<boolean> {
    const withdrawals = await this.db
      .collection("wallet_withdrawals")
      .where("userId", "==", userId)
      .where("status", "==", "completed")
      .limit(2)
      .get();
    
    return withdrawals.size === 1;
  }

  /**
   * Check milestone achievements
   */
  private async checkMilestone(userId: string): Promise<boolean> {
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) return false;
    
    // Check various milestones
    const milestones = [
      userData.matchesCount >= 10,
      userData.messagesCount >= 50,
      userData.daysActive >= 7,
      userData.profileViews >= 100
    ];
    
    // Trigger if user reached at least 2 milestones
    return milestones.filter(Boolean).length >= 2;
  }
}

// ============================================================================
// AUTO REPLY ENGINE
// ============================================================================

export class ReviewAutoReplyEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Auto-reply to review based on rating
   */
  async autoReply(review: ReviewResponse): Promise<void> {
    const template = this.getReplyTemplate(review.rating, review.language);
    
    if (!template) {
      logger.info("No auto-reply template for rating", { rating: review.rating });
      return;
    }
    
    // Personalize reply
    const reply = this.personalizeReply(template, review);
    
    // Save reply
    await this.db.collection("review_replies_pack431").add({
      reviewId: review.reviewId,
      userId: review.userId,
      rating: review.rating,
      reply,
      language: review.language,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      automated: true
    });
    
    // Execute action based on rating
    await this.executeReplyAction(review, template.action);
    
    logger.info("Auto-replied to review", {
      reviewId: review.reviewId,
      rating: review.rating,
      action: template.action
    });
  }

  /**
   * Get reply template based on rating and language
   */
  private getReplyTemplate(rating: number, language: string): AutoReplyConfig | null {
    const templates: Record<string, string> = {
      "5_EN": "Thank you so much for your 5-star review! We're thrilled you're enjoying Avalo. 💜",
      "5_PL": "Dziękujemy za 5-gwiazdkową recenzję! Cieszymy się, że korzystasz z Avalo. 💜",
      "5_DE": "Vielen Dank für Ihre 5-Sterne-Bewertung! Wir freuen uns, dass Ihnen Avalo gefällt. 💜",
      "5_ES": "¡Muchas gracias por tu reseña de 5 estrellas! Nos encanta que disfrutes de Avalo. 💜",
      "5_IT": "Grazie mille per la tua recensione a 5 stelle! Siamo felici che ti piaccia Avalo. 💜",
      "5_FR": "Merci beaucoup pour votre avis 5 étoiles ! Nous sommes ravis que vous appréciiez Avalo. 💜",
      
      "4_EN": "Thank you for your review! We're glad you like Avalo. Let us know how we can make it even better!",
      "4_PL": "Dziękujemy za recenzję! Cieszymy się, że lubisz Avalo. Daj nam znać, jak możemy poprawić!",
      "4_DE": "Danke für Ihre Bewertung! Wir freuen uns, dass Ihnen Avalo gefällt. Sagen Sie uns, wie wir es verbessern können!",
      "4_ES": "¡Gracias por tu reseña! Nos alegra que te guste Avalo. ¡Haznos saber cómo mejorarlo!",
      "4_IT": "Grazie per la tua recensione! Siamo contenti che ti piaccia Avalo. Facci sapere come possiamo migliorare!",
      "4_FR": "Merci pour votre avis ! Nous sommes contents qu'Avalo vous plaise. Dites-nous comment l'améliorer !",
      
      "3_EN": "Thanks for your feedback. We'd love to hear more about your experience. Please contact our support team.",
      "3_PL": "Dziękujemy za opinię. Chcielibyśmy dowiedzieć się więcej. Skontaktuj się z naszym wsparciem.",
      "3_DE": "Danke für Ihr Feedback. Wir würden gerne mehr über Ihre Erfahrung hören. Kontaktieren Sie unseren Support.",
      "3_ES": "Gracias por tu feedback. Nos gustaría saber más sobre tu experiencia. Contacta con soporte.",
      "3_IT": "Grazie per il tuo feedback. Vorremmo saperne di più sulla tua esperienza. Contatta il supporto.",
      "3_FR": "Merci pour votre retour. Nous aimerions en savoir plus sur votre expérience. Contactez le support.",
      
      "2_EN": "We're sorry you had a negative experience. Please contact support@avalo.app so we can help.",
      "2_PL": "Przykro nam, że masz negatywne doświadczenia. Skontaktuj się: support@avalo.app",
      "2_DE": "Es tut uns leid, dass Sie eine negative Erfahrung hatten. Kontaktieren Sie: support@avalo.app",
      "2_ES": "Lamentamos tu experiencia negativa. Contacta: support@avalo.app y te ayudaremos.",
      "2_IT": "Ci dispiace per l'esperienza negativa. Contatta: support@avalo.app per assistenza.",
      "2_FR": "Nous sommes désolés pour votre expérience négative. Contactez: support@avalo.app",
      
      "1_EN": "We're very sorry to hear this. Please reach out to support@avalo.app immediately so we can resolve this.",
      "1_PL": "Bardzo nam przykro. Prosimy o pilny kontakt: support@avalo.app, abyśmy mogli to rozwiązać.",
      "1_DE": "Es tut uns sehr leid. Bitte kontaktieren Sie sofort: support@avalo.app zur Lösung.",
      "1_ES": "Lo sentimos mucho. Por favor contacta inmediatamente: support@avalo.app para resolverlo.",
      "1_IT": "Ci dispiace molto. Contatta immediatamente: support@avalo.app per risolvere.",
      "1_FR": "Nous sommes vraiment désolés. Contactez immédiatement: support@avalo.app pour résoudre cela."
    };
    
    const key = `${rating}_${language.toUpperCase()}`;
    const fallbackKey = `${rating}_EN`;
    const template = templates[key] || templates[fallbackKey];
    
    if (!template) return null;
    
    let action: AutoReplyConfig["action"];
    if (rating >= 4) action = "thank";
    else if (rating === 3) action = "improve";
    else action = "support";
    
    return {
      rating,
      language,
      template,
      action
    };
  }

  /**
   * Personalize reply with user data
   */
  private personalizeReply(template: AutoReplyConfig, review: ReviewResponse): string {
    // Could add user name, specific feedback acknowledgment, etc.
    return template.template;
  }

  /**
   * Execute action based on reply type
   */
  private async executeReplyAction(
    review: ReviewResponse,
    action?: AutoReplyConfig["action"]
  ): Promise<void> {
    switch (action) {
      case "thank":
        // Log positive feedback
        await this.logPositiveFeedback(review);
        break;
      
      case "improve":
        // Create improvement task
        await this.createImprovementTask(review);
        break;
      
      case "support":
        // Redirect to support (PACK 300A integration)
        await this.redirectToSupport(review);
        break;
    }
  }

  /**
   * Log positive feedback for analytics
   */
  private async logPositiveFeedback(review: ReviewResponse): Promise<void> {
    await this.db.collection("positive_feedback_pack431").add({
      userId: review.userId,
      rating: review.rating,
      reviewText: review.text,
      country: review.country,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Create improvement task from feedback
   */
  private async createImprovementTask(review: ReviewResponse): Promise<void> {
    await this.db.collection("improvement_tasks_pack431").add({
      source: "review",
      reviewId: review.reviewId,
      userId: review.userId,
      rating: review.rating,
      feedback: review.text,
      status: "pending",
      priority: review.rating <= 2 ? "high" : "medium",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Redirect to support system
   */
  private async redirectToSupport(review: ReviewResponse): Promise<void> {
    // Integration with PACK 300A support system
    await this.db.collection("support_tickets").add({
      userId: review.userId,
      source: "negative_review",
      reviewId: review.reviewId,
      priority: review.rating === 1 ? "critical" : "high",
      status: "open",
      content: review.text,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info("Created support ticket from review", {
      userId: review.userId,
      rating: review.rating
    });
  }

  /**
   * Analyze review sentiment
   */
  async analyzeReviewSentiment(review: ReviewResponse): Promise<string> {
    // Simple sentiment analysis based on keywords
    const text = review.text.toLowerCase();
    
    const positiveKeywords = ["great", "amazing", "love", "excellent", "perfect", "best"];
    const negativeKeywords = ["bad", "terrible", "hate", "worst", "awful", "useless"];
    
    const positiveCount = positiveKeywords.filter(kw => text.includes(kw)).length;
    const negativeCount = negativeKeywords.filter(kw => text.includes(kw)).length;
    
    if (positiveCount > negativeCount) return "positive";
    if (negativeCount > positiveCount) return "negative";
    return "neutral";
  }
}

// ============================================================================
// REVIEW ANALYTICS
// ============================================================================

export class ReviewAnalyticsEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Get review statistics
   */
  async getReviewStats(country?: string): Promise<any> {
    let query: FirebaseFirestore.Query = this.db.collection("user_reviews_pack431");
    
    if (country) {
      query = query.where("country", "==", country);
    }
    
    const reviews = await query.get();
    
    if (reviews.empty) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: {}
      };
    }
    
    const ratings = reviews.docs.map(doc => doc.data().rating);
    const averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    
    const distribution: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      distribution[i] = ratings.filter(r => r === i).length;
    }
    
    return {
      totalReviews: reviews.size,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution: distribution,
      country
    };
  }

  /**
   * Track review impact on conversions
   */
  async trackReviewImpact(timeframe: "day" | "week" | "month"): Promise<any> {
    // Get average rating over timeframe
    const stats = await this.getReviewStats();
    
    // Get install data from analytics
    // This would integrate with PACK 431 ASO Analytics
    
    return {
      averageRating: stats.averageRating,
      estimatedImpact: this.estimateRatingImpact(stats.averageRating)
    };
  }

  /**
   * Estimate conversion impact based on rating
   */
  private estimateRatingImpact(averageRating: number): string {
    if (averageRating >= 4.5) return "+20% conversion boost";
    if (averageRating >= 4.0) return "+10% conversion boost";
    if (averageRating >= 3.5) return "Neutral impact";
    if (averageRating >= 3.0) return "-10% conversion penalty";
    return "-20% conversion penalty";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createReviewPromptEngine = (db: FirebaseFirestore.Firestore) => {
  return new ReviewPromptEngine(db);
};

export const createReviewAutoReplyEngine = (db: FirebaseFirestore.Firestore) => {
  return new ReviewAutoReplyEngine(db);
};

export const createReviewAnalyticsEngine = (db: FirebaseFirestore.Firestore) => {
  return new ReviewAnalyticsEngine(db);
};
