import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

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
    if (analytics) {
      logEvent(analytics, eventName, params);
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