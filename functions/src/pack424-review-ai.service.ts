/**
 * PACK 424 — AI-Assisted Review Response System
 * Generates contextual reply suggestions for store reviews
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  StoreReview,
  AIReviewSuggestion,
} from './pack424-store-reviews.types';

const db = admin.firestore();

export class ReviewAIService {
  /**
   * Generate AI-powered response suggestions
   */
  async generateResponseSuggestion(
    reviewId: string
  ): Promise<AIReviewSuggestion> {
    try {
      const reviewDoc = await db.collection('storeReviews').doc(reviewId).get();
      
      if (!reviewDoc.exists) {
        throw new Error('Review not found');
      }

      const review = reviewDoc.data() as StoreReview;

      // Determine response type based on rating and content
      const suggestedType = this.determineSuggestionType(review);
      const tone = this.determineTone(review);
      const keyPoints = this.extractKeyPoints(review);

      // Generate response text
      const suggestedText = await this.generateResponseText(
        review,
        suggestedType,
        tone,
        keyPoints
      );

      const suggestion: AIReviewSuggestion = {
        reviewId,
        suggestedType,
        suggestedText,
        tone,
        confidence: 0.8, // Can be enhanced with actual ML model
        keyPoints,
      };

      // Store suggestion for admin review
      await db.collection('reviewResponseSuggestions').add({
        ...suggestion,
        createdAt: Date.now(),
      });

      return suggestion;
    } catch (error) {
      functions.logger.error('Error generating response suggestion:', error);
      throw error;
    }
  }

  /**
   * Determine what type of response is appropriate
   */
  private determineSuggestionType(
    review: StoreReview
  ): AIReviewSuggestion['suggestedType'] {
    const rating = review.rating;
    const text = (review.reviewText || '').toLowerCase();

    // Positive reviews (4-5 stars)
    if (rating >= 4) {
      return 'appreciation';
    }

    // Check for specific issues
    if (text.includes('bug') || text.includes('crash') || text.includes('error')) {
      return 'bug_acknowledgment';
    }

    if (
      text.includes('unsafe') ||
      text.includes('scam') ||
      text.includes('harass') ||
      text.includes('fake')
    ) {
      return 'safety_reassurance';
    }

    if (
      text.includes('refund') ||
      text.includes('money') ||
      text.includes('charge')
    ) {
      return 'refund_guidance';
    }

    // Default to apology for negative reviews
    return 'apology';
  }

  /**
   * Determine appropriate tone
   */
  private determineTone(
    review: StoreReview
  ): AIReviewSuggestion['tone'] {
    const rating = review.rating;
    const text = (review.reviewText || '').toLowerCase();

    if (rating >= 4) {
      return 'friendly';
    }

    if (
      text.includes('unsafe') ||
      text.includes('danger') ||
      text.includes('harass')
    ) {
      return 'professional';
    }

    if (rating <= 2) {
      return 'empathetic';
    }

    return 'formal';
  }

  /**
   * Extract key points from review
   */
  private extractKeyPoints(review: StoreReview): string[] {
    const text = review.reviewText || '';
    const points: string[] = [];

    // Simple keyword extraction (can be enhanced with NLP)
    const issues = [
      'bug',
      'crash',
      'slow',
      'payment',
      'refund',
      'safety',
      'harassment',
      'fake',
      'expensive',
      'confusing',
    ];

    for (const issue of issues) {
      if (text.toLowerCase().includes(issue)) {
        points.push(issue);
      }
    }

    return points;
  }

  /**
   * Generate response text based on analysis
   */
  private async generateResponseText(
    review: StoreReview,
    type: AIReviewSuggestion['suggestedType'],
    tone: AIReviewSuggestion['tone'],
    keyPoints: string[]
  ): Promise<string> {
    // Template-based generation (can be replaced with GPT/LLM integration)
    const templates = {
      appreciation: {
        friendly: `Thank you so much for your ${review.rating}-star review! We're thrilled to hear you're enjoying Avalo. Your support means the world to us! 💙`,
        professional: `Thank you for your positive feedback. We're pleased that Avalo is meeting your expectations.`,
        empathetic: `We truly appreciate your kind words! It's wonderful to know Avalo is working well for you.`,
        formal: `Thank you for taking the time to rate Avalo. We appreciate your positive feedback.`,
      },
      apology: {
        friendly: `We're really sorry to hear about your experience. This isn't the experience we want for our users. Please reach out to support@avalo.app so we can make this right!`,
        professional: `We apologize for the disappointing experience. Please contact our support team at support@avalo.app so we can address your concerns.`,
        empathetic: `We're truly sorry you had this experience. We take all feedback seriously and would love to help resolve any issues. Please email us at support@avalo.app.`,
        formal: `We apologize for any inconvenience. Please contact support@avalo.app to discuss your concerns.`,
      },
      bug_acknowledgment: {
        friendly: `Oh no! Thanks for letting us know about this bug. Our team is on it! 🛠️ Please email support@avalo.app with details so we can fix this ASAP.`,
        professional: `Thank you for reporting this issue. Our development team has been notified and is working on a fix. Please contact support@avalo.app for updates.`,
        empathetic: `We're really sorry you encountered this bug. We understand how frustrating technical issues can be. Our team is investigating and working on a fix.`,
        formal: `Thank you for reporting this technical issue. Our team is investigating. Please contact support@avalo.app for assistance.`,
      },
      safety_reassurance: {
        friendly: `Your safety is our #1 priority! We take these concerns very seriously. Please report any issues to safety@avalo.app immediately so we can investigate.`,
        professional: `Thank you for bringing this to our attention. User safety is paramount to Avalo. Please contact safety@avalo.app to report specific incidents.`,
        empathetic: `We're deeply concerned to hear this. Your safety and wellbeing matter to us. Please contact our safety team at safety@avalo.app immediately.`,
        formal: `Safety concerns are treated with utmost priority. Please contact safety@avalo.app to report this matter.`,
      },
      refund_guidance: {
        friendly: `We'd love to help with your refund request! Please email billing@avalo.app with your account details and we'll sort this out for you.`,
        professional: `For refund requests, please contact billing@avalo.app with your account information and order details.`,
        empathetic: `We understand billing concerns can be frustrating. Please reach out to billing@avalo.app and we'll work to resolve this quickly.`,
        formal: `Please contact billing@avalo.app regarding refund requests.`,
      },
    };

    let response = templates[type][tone];

    // Add specific mentions of key issues
    if (keyPoints.length > 0 && type !== 'appreciation') {
      response += ` We've noted your feedback about: ${keyPoints.join(', ')}.`;
    }

    return response;
  }

  /**
   * Get multiple response suggestions
   */
  async getMultipleSuggestions(
    reviewId: string
  ): Promise<AIReviewSuggestion[]> {
    const reviewDoc = await db.collection('storeReviews').doc(reviewId).get();
    
    if (!reviewDoc.exists) {
      throw new Error('Review not found');
    }

    const review = reviewDoc.data() as StoreReview;
    const suggestions: AIReviewSuggestion[] = [];

    // Generate different tone variations
    const tones: AIReviewSuggestion['tone'][] = [
      'friendly',
      'professional',
      'empathetic',
    ];

    const baseType = this.determineSuggestionType(review);
    const keyPoints = this.extractKeyPoints(review);

    for (const tone of tones) {
      const text = await this.generateResponseText(review, baseType, tone, keyPoints);
      
      suggestions.push({
        reviewId,
        suggestedType: baseType,
        suggestedText: text,
        tone,
        confidence: 0.85,
        keyPoints,
      });
    }

    return suggestions;
  }
}

export const reviewAIService = new ReviewAIService();

/**
 * HTTP endpoint: Get AI response suggestions
 */
export const getReviewResponseSuggestions = functions.https.onCall(
  async (data, context) => {
    if (!context.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can get review response suggestions'
      );
    }

    try {
      const reviewId = data.reviewId;

      if (!reviewId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'reviewId is required'
        );
      }

      const suggestions = await reviewAIService.getMultipleSuggestions(reviewId);

      return {
        success: true,
        suggestions,
      };
    } catch (error) {
      functions.logger.error('Error getting suggestions:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate suggestions'
      );
    }
  }
);

/**
 * Auto-generate suggestions for new negative reviews
 */
export const autoGenerateSuggestionsForNegativeReviews = functions.firestore
  .document('storeReviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const review = snap.data() as StoreReview;

    // Only generate for negative reviews (1-2 stars)
    if (review.rating <= 2) {
      try {
        await reviewAIService.generateResponseSuggestion(snap.id);
        
        functions.logger.info('Auto-generated suggestions for negative review', {
          reviewId: snap.id,
          rating: review.rating,
        });
      } catch (error) {
        functions.logger.error('Error auto-generating suggestions:', error);
      }
    }
  });
