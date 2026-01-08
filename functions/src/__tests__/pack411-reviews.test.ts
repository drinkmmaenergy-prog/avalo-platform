/**
 * PACK 411 — Unit Tests
 * Tests for store reviews ingestion, rating triggers, and reputation defense
 */

import { tagReview, isSafetyCritical } from '../pack411-store-reviews-ingestion';
import { ReviewTag } from '../../../shared/types/pack411-reviews';

describe('PACK 411 - Store Reviews', () => {
  describe('tagReview', () => {
    it('should tag crash-related reviews', () => {
      const reviewText = 'App keeps crashing every time I open it';
      const tags = tagReview(reviewText);
      expect(tags).toContain('CRASH' as ReviewTag);
    });

    it('should tag bug-related reviews', () => {
      const reviewText = 'There is a bug with the login feature';
      const tags = tagReview(reviewText);
      expect(tags).toContain('BUG' as ReviewTag);
    });

    it('should tag billing-related reviews', () => {
      const reviewText = 'I was charged twice for my subscription';
      const tags = tagReview(reviewText);
      expect(tags).toContain('BILLING' as ReviewTag);
    });

    it('should tag scam-related reviews', () => {
      const reviewText = 'This app is a total scam!';
      const tags = tagReview(reviewText);
      expect(tags).toContain('SCAM' as ReviewTag);
    });

    it('should tag multiple issues', () => {
      const reviewText = 'App crashes and I was charged even though I cancelled';
      const tags = tagReview(reviewText);
      expect(tags).toContain('CRASH' as ReviewTag);
      expect(tags).toContain('BILLING' as ReviewTag);
    });

    it('should return empty array for generic positive review', () => {
      const reviewText = 'Great app, love it!';
      const tags = tagReview(reviewText);
      expect(tags.length).toBe(0);
    });

    it('should handle case-insensitive matching', () => {
      const reviewText = 'APP KEEPS CRASHING';
      const tags = tagReview(reviewText);
      expect(tags).toContain('CRASH' as ReviewTag);
    });
  });

  describe('isSafetyCritical', () => {
    it('should identify scam tags as safety-critical', () => {
      const tags: ReviewTag[] = ['SCAM'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify fraud tags as safety-critical', () => {
      const tags: ReviewTag[] = ['FRAUD'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify violence tags as safety-critical', () => {
      const tags: ReviewTag[] = ['VIOLENCE'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify harassment tags as safety-critical', () => {
      const tags: ReviewTag[] = ['HARASSMENT'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify underage tags as safety-critical', () => {
      const tags: ReviewTag[] = ['UNDERAGE'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify self-harm tags as safety-critical', () => {
      const tags: ReviewTag[] = ['SELF_HARM'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should identify threats tags as safety-critical', () => {
      const tags: ReviewTag[] = ['THREATS'];
      expect(isSafetyCritical(tags)).toBe(true);
    });

    it('should not flag non-critical tags', () => {
      const tags: ReviewTag[] = ['BUG', 'UX', 'FEATURE_REQUEST'];
      expect(isSafetyCritical(tags)).toBe(false);
    });

    it('should flag mixed tags with at least one critical', () => {
      const tags: ReviewTag[] = ['BUG', 'SCAM', 'UX'];
      expect(isSafetyCritical(tags)).toBe(true);
    });
  });
});

describe('PACK 411 - Reputation Defense', () => {
  describe('calculateStdDev', () => {
    // This would test the standard deviation calculation
    // Import and test once the function is exported
  });

  describe('detectReviewSpike', () => {
    // Integration tests for spike detection
    // Would require mocking Firestore queries
  });

  describe('detectCoordinatedAttack', () => {
    // Integration tests for coordinated attack detection
    // Would require mocking Firestore queries
  });

  describe('detectDeviceClustering', () => {
    // Integration tests for device clustering detection
    // Would require mocking Firestore queries
  });
});

describe('PACK 411 - Rating Trigger Logic', () => {
  describe('checkRatingPromptEligibility', () => {
    // Integration tests for rating prompt eligibility
    // Would require mocking:
    // - User documents
    // - Support tickets
    // - Risk cases
    // - Activity metrics
    // - Prompt history
  });
});

// Mock data helpers
export const createMockReview = (overrides?: Partial<any>) => ({
  id: 'review-123',
  store: 'GOOGLE_PLAY',
  appVersion: '1.0.0',
  rating: 1,
  title: 'Test Review',
  body: 'Test body',
  language: 'en',
  country: 'US',
  createdAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  source: 'STORE_SCRAPE',
  status: 'NEW',
  tags: [],
  ...overrides,
});

export const createMockRatingPromptLog = (overrides?: Partial<any>) => ({
  id: 'log-123',
  userId: 'user-123',
  appVersion: '1.0.0',
  promptedAt: new Date().toISOString(),
  decision: {
    shouldPrompt: true,
    reason: 'ELIGIBLE',
  },
  redirectedToStore: false,
  ...overrides,
});

export const createMockReputationSnapshot = (overrides?: Partial<any>) => ({
  id: 'snapshot-123',
  date: new Date().toISOString().split('T')[0],
  store: 'GOOGLE_PLAY',
  avgRating: 4.5,
  ratingCount: 1000,
  ratingsDistribution: {
    oneStar: 50,
    twoStar: 100,
    threeStar: 150,
    fourStar: 300,
    fiveStar: 400,
  },
  oneStarShare: 5.0,
  flaggedReviewsCount: 10,
  suspectedBrigadeScore: 0.1,
  alerts: [],
  ...overrides,
});
