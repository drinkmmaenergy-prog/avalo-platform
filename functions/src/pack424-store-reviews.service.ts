/**
 * PACK 424 — Store Review Ingestion Service
 * Collects reviews from Google Play and App Store
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  StoreReview,
  Platform,
  ReviewRating,
  ReviewDetectionResult,
} from './pack424-store-reviews.types';

const db = admin.firestore();

export class StoreReviewService {
  private readonly COLLECTION = 'storeReviews';
  private readonly BURSTS_COLLECTION = 'reviewBursts';

  /**
   * Fetch reviews from Google Play Store
   */
  async fetchGooglePlayReviews(
    packageName: string,
    maxResults: number = 100
  ): Promise<StoreReview[]> {
    try {
      const { google } = require('googleapis');
      const androidPublisher = google.androidpublisher('v3');

      // Initialize auth from service account
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });

      const authClient = await auth.getClient();

      const response = await androidPublisher.reviews.list({
        auth: authClient,
        packageName,
        maxResults,
      });

      const reviews: StoreReview[] = [];
      const scrapedAt = Date.now();

      if (response.data.reviews) {
        for (const review of response.data.reviews) {
          const comment = review.comments?.[0]?.userComment;
          if (!comment) continue;

          reviews.push({
            id: review.reviewId || `android_${Date.now()}_${Math.random()}`,
            platform: 'ANDROID',
            locale: comment.reviewerLanguage || 'en',
            storeUserName: review.authorName || 'Anonymous',
            rating: (comment.starRating || 3) as ReviewRating,
            reviewText: comment.text,
            createdAt: comment.lastModified?.seconds
              ? comment.lastModified.seconds * 1000
              : Date.now(),
            scrapedAt,
            version: comment.appVersionName || 'unknown',
            country: comment.deviceMetadata?.productName || 'unknown',
          });
        }
      }

      return reviews;
    } catch (error) {
      functions.logger.error('Error fetching Google Play reviews:', error);
      return [];
    }
  }

  /**
   * Fetch reviews from Apple App Store
   */
  async fetchAppStoreReviews(
    appId: string,
    country: string = 'us',
    maxResults: number = 100
  ): Promise<StoreReview[]> {
    try {
      const fetch = require('node-fetch');
      
      // Use RSS feed for public reviews (for private use App Store Connect API)
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
      
      const response = await fetch(url);
      const data = await response.json();

      const reviews: StoreReview[] = [];
      const scrapedAt = Date.now();

      const entries = data.feed?.entry || [];
      
      for (let i = 0; i < Math.min(entries.length, maxResults); i++) {
        const entry = entries[i];
        
        // Skip the first entry if it's metadata
        if (entry['im:name']) continue;

        const rating = parseInt(entry['im:rating']?.label || '3');
        const author = entry.author?.name?.label || 'Anonymous';
        const text = entry.content?.label;
        const version = entry['im:version']?.label || 'unknown';
        const createdAt = new Date(entry.updated?.label || Date.now()).getTime();

        reviews.push({
          id: entry.id?.label || `ios_${Date.now()}_${Math.random()}`,
          platform: 'IOS',
          locale: country,
          storeUserName: author,
          rating: Math.min(5, Math.max(1, rating)) as ReviewRating,
          reviewText: text,
          createdAt,
          scrapedAt,
          version,
          country,
        });
      }

      return reviews;
    } catch (error) {
      functions.logger.error('Error fetching App Store reviews:', error);
      return [];
    }
  }

  /**
   * Store reviews in Firestore
   */
  async storeReviews(reviews: StoreReview[]): Promise<void> {
    const batch = db.batch();
    let count = 0;

    for (const review of reviews) {
      // Check if review already exists
      const existing = await db
        .collection(this.COLLECTION)
        .doc(review.id)
        .get();

      if (!existing.exists) {
        const ref = db.collection(this.COLLECTION).doc(review.id);
        batch.set(ref, review);
        count++;

        // Commit batch every 500 operations
        if (count % 500 === 0) {
          await batch.commit();
        }
      }
    }

    if (count % 500 !== 0) {
      await batch.commit();
    }

    functions.logger.info(`Stored ${count} new reviews`);
  }

  /**
   * Link review to user if possible
   */
  async linkReviewToUser(review: StoreReview): Promise<string | undefined> {
    // Try to match by username, device info, or timing patterns
    // This is a heuristic approach as stores don't provide user IDs

    try {
      // Search for users who:
      // 1. Installed the app around the review time
      // 2. Match the country/locale
      // 3. Match the app version

      const timeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
      const startTime = review.createdAt - timeWindow;
      const endTime = review.createdAt + timeWindow;

      const users = await db
        .collection('users')
        .where('appVersion', '==', review.version)
        .where('country', '==', review.country)
        .where('createdAt', '>=', startTime)
        .where('createdAt', '<=', endTime)
        .limit(5)
        .get();

      // If only one match, likely the same user
      if (users.size === 1) {
        return users.docs[0].id;
      }

      // More sophisticated matching could be added here
      // (device fingerprinting, behavioral patterns, etc.)

      return undefined;
    } catch (error) {
      functions.logger.error('Error linking review to user:', error);
      return undefined;
    }
  }

  /**
   * Calculate sentiment score for review
   */
  async calculateSentiment(reviewText: string): Promise<number> {
    // Integration with PACK 423 sentiment analysis
    try {
      const { LanguageServiceClient } = require('@google-cloud/language');
      const client = new LanguageServiceClient();

      const document = {
        content: reviewText,
        type: 'PLAIN_TEXT',
      };

      const [result] = await client.analyzeSentiment({ document });
      const sentiment = result.documentSentiment;

      // Returns -1.0 to +1.0
      return sentiment?.score || 0;
    } catch (error) {
      functions.logger.error('Error calculating sentiment:', error);
      
      // Fallback: simple keyword-based sentiment
      const positive = ['great', 'love', 'amazing', 'excellent', 'fantastic', 'best'];
      const negative = ['bad', 'terrible', 'worst', 'hate', 'awful', 'horrible'];
      
      const text = reviewText.toLowerCase();
      let score = 0;
      
      for (const word of positive) {
        if (text.includes(word)) score += 0.2;
      }
      
      for (const word of negative) {
        if (text.includes(word)) score -= 0.2;
      }
      
      return Math.max(-1, Math.min(1, score));
    }
  }

  /**
   * Process new review: enrich with metadata
   */
  async processReview(review: StoreReview): Promise<StoreReview> {
    const enriched = { ...review };

    // Add sentiment score if text exists
    if (review.reviewText) {
      enriched.sentimentScore = await this.calculateSentiment(review.reviewText);
    }

    // Try to link to user
    enriched.linkedUserId = await this.linkReviewToUser(review);

    // Update in database
    await db.collection(this.COLLECTION).doc(review.id).set(enriched, { merge: true });

    return enriched;
  }

  /**
   * Get reviews by filters
   */
  async getReviews(options: {
    platform?: Platform;
    country?: string;
    rating?: ReviewRating;
    minRating?: number;
    maxRating?: number;
    startDate?: number;
    endDate?: number;
    riskFlag?: boolean;
    limit?: number;
  }): Promise<StoreReview[]> {
    let query: any = db.collection(this.COLLECTION);

    if (options.platform) {
      query = query.where('platform', '==', options.platform);
    }

    if (options.country) {
      query = query.where('country', '==', options.country);
    }

    if (options.rating) {
      query = query.where('rating', '==', options.rating);
    }

    if (options.riskFlag !== undefined) {
      query = query.where('riskFlag', '==', options.riskFlag);
    }

    if (options.startDate) {
      query = query.where('createdAt', '>=', options.startDate);
    }

    if (options.endDate) {
      query = query.where('createdAt', '<=', options.endDate);
    }

    query = query.orderBy('createdAt', 'desc').limit(options.limit || 100);

    const snapshot = await query.get();
    const reviews: StoreReview[] = [];

    snapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
      const review = doc.data() as StoreReview;
      
      // Apply client-side filters
      if (options.minRating && review.rating < options.minRating) return;
      if (options.maxRating && review.rating > options.maxRating) return;
      
      reviews.push(review);
    });

    return reviews;
  }

  /**
   * Get review statistics
   */
  async getReviewStats(
    startDate: number,
    endDate: number
  ): Promise<{
    totalReviews: number;
    averageRating: number;
    distribution: Record<number, number>;
    byPlatform: Record<Platform, { count: number; avgRating: number }>;
  }> {
    const reviews = await this.getReviews({
      startDate,
      endDate,
      limit: 10000,
    });

    const stats = {
      totalReviews: reviews.length,
      averageRating: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byPlatform: {
        IOS: { count: 0, avgRating: 0 },
        ANDROID: { count: 0, avgRating: 0 },
      } as Record<Platform, { count: number; avgRating: number }>,
    };

    let totalRating = 0;
    const platformRatings: Record<Platform, number[]> = {
      IOS: [],
      ANDROID: [],
    };

    for (const review of reviews) {
      totalRating += review.rating;
      stats.distribution[review.rating]++;
      stats.byPlatform[review.platform].count++;
      platformRatings[review.platform].push(review.rating);
    }

    stats.averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    // Calculate platform averages
    for (const platform of ['IOS', 'ANDROID'] as Platform[]) {
      const ratings = platformRatings[platform];
      if (ratings.length > 0) {
        stats.byPlatform[platform].avgRating =
          ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }
    }

    return stats;
  }

  /**
   * Post response to store review
   */
  async postResponse(
    reviewId: string,
    responseText: string,
    adminUserId: string
  ): Promise<boolean> {
    try {
      const reviewDoc = await db.collection(this.COLLECTION).doc(reviewId).get();
      
      if (!reviewDoc.exists) {
        throw new Error('Review not found');
      }

      const review = reviewDoc.data() as StoreReview;

      // Update review with response
      await db.collection(this.COLLECTION).doc(reviewId).update({
        responseText,
        responseAt: Date.now(),
        respondedBy: adminUserId,
      });

      // Here you would integrate with actual store APIs to publish the response
      // For Google Play:
      // await androidPublisher.reviews.reply({ ... });
      
      // For App Store:
      // Use App Store Connect API

      functions.logger.info(`Posted response to review ${reviewId}`);
      
      return true;
    } catch (error) {
      functions.logger.error('Error posting response:', error);
      return false;
    }
  }
}

export const storeReviewService = new StoreReviewService();
