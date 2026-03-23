"use client";

import { logEvent, getAnalytics, type Analytics } from 'firebase/analytics';
import { getFirebaseApp } from './firebase';

export enum AnalyticsEvent {
  // Marketing funnel events
  LANDING_VIEW = 'landing_view',
  CTA_CLICK_DOWNLOAD = 'cta_click_download',
  CTA_CLICK_WEB_SIGNUP = 'cta_click_web_signup',
  PRESIGNUP_CREATED = 'presignup_created',
  PRESIGNUP_CONVERTED = 'presignup_converted',
  
  // Page views
  FEATURES_VIEW = 'features_view',
  CREATORS_VIEW = 'creators_view',
  SAFETY_VIEW = 'safety_view',
  DOWNLOAD_VIEW = 'download_view',
  INVESTORS_VIEW = 'investors_view',
  
  // Investor dashboard
  INVESTOR_DASHBOARD_VIEWED = 'investor_dashboard_viewed',
}

interface AnalyticsParams {
  source?: string;
  campaign?: string;
  medium?: string;
  [key: string]: string | number | boolean | undefined;
}

export const trackEvent = (eventName: AnalyticsEvent, params?: AnalyticsParams) => {
  try {
    // Track with Firebase Analytics
    if (typeof window !== 'undefined') {
      const analyticsInstance = getAnalytics(getFirebaseApp());
      logEvent(analyticsInstance, eventName, params);
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventName, params);
    }

    // Send to custom analytics endpoint if needed
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const enhancedParams = {
        ...params,
        source: params?.source || urlParams.get('utm_source') || undefined,
        campaign: params?.campaign || urlParams.get('utm_campaign') || undefined,
        medium: params?.medium || urlParams.get('utm_medium') || undefined,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      };

      // Store in localStorage for session tracking
      const sessionEvents = JSON.parse(localStorage.getItem('marketing_events') || '[]');
      sessionEvents.push({ event: eventName, params: enhancedParams });
      localStorage.setItem('marketing_events', JSON.stringify(sessionEvents.slice(-50))); // Keep last 50 events
    }
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

export const trackPageView = (pageName: string) => {
  trackEvent(AnalyticsEvent.LANDING_VIEW, { page: pageName });
};

export const getUTMParameters = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_term: params.get('utm_term') || '',
    utm_content: params.get('utm_content') || '',
  };
};

// =============================================================================
// FIX 132: Consent-aware product analytics event tracking
// =============================================================================

let consentAnalytics: Analytics | null = null;

/**
 * Initialize analytics only after cookie consent is granted.
 * Listens for 'consent_granted' custom event and checks localStorage.
 */
export function initProductAnalytics() {
  if (typeof window === 'undefined') return;
  try {
    const consent = localStorage.getItem('cookie_consent');
    if (consent === 'all') {
      consentAnalytics = getAnalytics(getFirebaseApp());
    }
  } catch {
    // Analytics unavailable — silently degrade
  }
}

// Auto-initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  window.addEventListener('consent_granted', initProductAnalytics);
  initProductAnalytics();
}

/**
 * Track a product event (consent-aware).
 * No-ops if analytics not initialized (no consent).
 */
export function trackProductEvent(name: string, params?: Record<string, string | number | boolean>) {
  if (!consentAnalytics) return;
  try {
    logEvent(consentAnalytics, name, params);
    if (process.env.NODE_ENV === 'development') {
      console.log('[ProductAnalytics]', name, params);
    }
  } catch {
    // Silently degrade
  }
}

/**
 * Predefined product events for key user actions.
 * Import and call: Events.like(targetId)
 */
export const Events = {
  // Auth
  signUp: (method: string) => trackProductEvent('sign_up', { method }),
  login: (method: string) => trackProductEvent('login', { method }),

  // Discovery
  profileView: (profileId: string) => trackProductEvent('profile_view', { profileId }),
  like: (targetId: string) => trackProductEvent('like', { targetId }),
  superLike: (targetId: string) => trackProductEvent('super_like', { targetId }),
  match: (targetId: string) => trackProductEvent('match', { targetId }),
  boost: () => trackProductEvent('boost_activated'),
  swipe: (direction: 'like' | 'dislike') => trackProductEvent('swipe', { direction }),

  // Chat
  messageSent: (chatType: 'match' | 'paid' | 'ai') => trackProductEvent('message_sent', { chatType }),
  mediaUnlocked: (price: number) => trackProductEvent('media_unlocked', { price }),
  icebreakerUsed: () => trackProductEvent('icebreaker_used'),

  // Monetization
  tokenPurchase: (pack: string, tokens: number) => trackProductEvent('purchase', { pack, tokens }),
  tipSent: (amount: number) => trackProductEvent('tip_sent', { amount }),
  subscriptionStarted: (creatorId: string) => trackProductEvent('subscription_started', { creatorId }),
  callStarted: (type: 'voice' | 'video') => trackProductEvent('call_started', { type }),

  // Engagement
  postCreated: (type: 'post' | 'reel' | 'story') => trackProductEvent('content_created', { type }),
  challengeJoined: (challengeId: string) => trackProductEvent('challenge_joined', { challengeId }),
  clubJoined: (clubId: string) => trackProductEvent('club_joined', { clubId }),
  missionCompleted: (missionId: string) => trackProductEvent('mission_completed', { missionId }),

  // Retention
  dailyActive: () => trackProductEvent('daily_active'),
  sessionStart: () => trackProductEvent('session_start'),
  referralShared: () => trackProductEvent('referral_shared'),
} as const;
