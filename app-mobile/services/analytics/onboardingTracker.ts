/**
 * PACK 206C — Onboarding Analytics Tracker
 * Tracks onboarding mission progress and events
 */

import { getAnalytics, logEvent } from 'firebase/analytics';
import { getApp } from 'firebase/app';
import {
  OnboardingAnalyticsEvent,
  OnboardingAnalyticsPayload,
} from '../../types/onboarding';

// ============================================================================
// ANALYTICS INSTANCE
// ============================================================================

let analytics: ReturnType<typeof getAnalytics> | null = null;

function getAnalyticsInstance() {
  if (!analytics) {
    try {
      const app = getApp();
      analytics = getAnalytics(app);
    } catch (error) {
      console.warn('Analytics not available:', error);
    }
  }
  return analytics;
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Track generic onboarding event
 */
export function trackOnboardingEvent(
  event: OnboardingAnalyticsEvent,
  metadata?: Record<string, any>
): void {
  try {
    const analyticsInstance = getAnalyticsInstance();
    if (!analyticsInstance) return;

    logEvent(analyticsInstance, event, {
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    console.log(`[OnboardingTracker] Event tracked: ${event}`, metadata);
  } catch (error) {
    console.error('Error tracking onboarding event:', error);
  }
}

/**
 * Track photo upload completion
 */
export function trackPhotoUploadCompleted(photoCount: number): void {
  trackOnboardingEvent('onboarding.photoUpload.completed', {
    photo_count: photoCount,
    step: 'day1_step1',
  });
}

/**
 * Track vibe (bio) completion
 */
export function trackVibeCompleted(bioLength: number): void {
  trackOnboardingEvent('onboarding.vibe.completed', {
    bio_length: bioLength,
    step: 'day1_step2',
  });
}

/**
 * Track attraction preferences selection
 */
export function trackAttractionPreferencesCompleted(
  selectedCount: number
): void {
  trackOnboardingEvent('onboarding.attractionPreferences.completed', {
    selected_count: selectedCount,
    step: 'day1_step3',
  });
}

/**
 * Track like sent
 */
export function trackLikeSent(totalLikes: number): void {
  trackOnboardingEvent('onboarding.like.sent', {
    total_likes: totalLikes,
    step: 'day2_step1',
  });
}

/**
 * Track reply sent
 */
export function trackReplySent(): void {
  trackOnboardingEvent('onboarding.reply.sent', {
    step: 'day2_step2',
  });
}

/**
 * Track first message sent
 */
export function trackFirstMessageSent(): void {
  trackOnboardingEvent('onboarding.firstMessage.sent', {
    step: 'day2_step3',
  });
}

/**
 * Track chat started
 */
export function trackChatStarted(): void {
  trackOnboardingEvent('onboarding.chat.started', {
    step: 'day3_step1',
  });
}

/**
 * Track stories watched
 */
export function trackStoriesWatched(totalWatched: number): void {
  trackOnboardingEvent('onboarding.stories.watched', {
    total_watched: totalWatched,
    step: 'day3_step2',
  });
}

/**
 * Track calendar availability added
 */
export function trackCalendarAdded(): void {
  trackOnboardingEvent('onboarding.calendar.added', {
    step: 'day3_step3_optional',
  });
}

/**
 * Track event saved
 */
export function trackEventSaved(): void {
  trackOnboardingEvent('onboarding.event.saved', {
    step: 'day3_step4_optional',
  });
}

/**
 * Track onboarding finished
 */
export function trackOnboardingFinished(
  totalDays: number,
  completedSteps: number,
  totalSteps: number
): void {
  trackOnboardingEvent('onboarding.finished', {
    total_days: totalDays,
    completed_steps: completedSteps,
    total_steps: totalSteps,
    completion_rate: (completedSteps / totalSteps) * 100,
  });
}

// ============================================================================
// DAY COMPLETION TRACKING
// ============================================================================

/**
 * Track day 1 completion
 */
export function trackDay1Completed(): void {
  trackOnboardingEvent('onboarding.day1.completed', {
    day: 1,
    title: 'Magnetic Profile',
  });
}

/**
 * Track day 2 completion
 */
export function trackDay2Completed(): void {
  trackOnboardingEvent('onboarding.day2.completed', {
    day: 2,
    title: 'Start the Spark',
  });
}

/**
 * Track day 3 completion
 */
export function trackDay3Completed(): void {
  trackOnboardingEvent('onboarding.day3.completed', {
    day: 3,
    title: 'Heat Up the Connection',
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackOnboardingEvent,
  trackPhotoUploadCompleted,
  trackVibeCompleted,
  trackAttractionPreferencesCompleted,
  trackLikeSent,
  trackReplySent,
  trackFirstMessageSent,
  trackChatStarted,
  trackStoriesWatched,
  trackCalendarAdded,
  trackEventSaved,
  trackOnboardingFinished,
  trackDay1Completed,
  trackDay2Completed,
  trackDay3Completed,
};