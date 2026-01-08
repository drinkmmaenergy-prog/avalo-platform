/**
 * PACK 110 — Feedback Survey Hooks
 * 
 * Custom hooks for managing feedback survey eligibility and display.
 * 
 * CRITICAL CONSTRAINTS:
 * - Non-intrusive timing
 * - Respect user preferences (declined surveys)
 * - No forced or repetitive prompts
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getShouldAskForNps,
  getShouldAskForFeatureFeedback,
  FeatureKey,
} from '@/services/feedbackService';

// ============================================================================
// NPS SURVEY HOOK
// ============================================================================

interface UseNpsSurveyResult {
  shouldShow: boolean;
  isChecking: boolean;
  checkEligibility: () => Promise<void>;
  showSurvey: () => void;
  hideSurvey: () => void;
  isVisible: boolean;
}

/**
 * Hook to manage NPS survey display
 * 
 * Usage:
 * const nps = useNpsSurvey();
 * 
 * // Check eligibility when appropriate (e.g., app becomes active)
 * useEffect(() => {
 *   nps.checkEligibility();
 * }, []);
 * 
 * // Show modal when eligible
 * if (nps.shouldShow) {
 *   nps.showSurvey();
 * }
 */
export function useNpsSurvey(): UseNpsSurveyResult {
  const [shouldShow, setShouldShow] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const checkEligibility = useCallback(async () => {
    setIsChecking(true);
    
    try {
      const result = await getShouldAskForNps();
      setShouldShow(result.shouldAsk);
      
      if (!result.shouldAsk && result.reason) {
        console.log('[NPS Survey] Not showing:', result.reason);
      }
    } catch (error) {
      console.error('[NPS Survey] Error checking eligibility:', error);
      setShouldShow(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const showSurvey = useCallback(() => {
    setIsVisible(true);
  }, []);

  const hideSurvey = useCallback(() => {
    setIsVisible(false);
    setShouldShow(false);
  }, []);

  return {
    shouldShow,
    isChecking,
    checkEligibility,
    showSurvey,
    hideSurvey,
    isVisible,
  };
}

// ============================================================================
// FEATURE SURVEY HOOK
// ============================================================================

interface UseFeatureSurveyResult {
  shouldShow: boolean;
  isChecking: boolean;
  checkEligibility: (featureKey: FeatureKey) => Promise<void>;
  showSurvey: () => void;
  hideSurvey: () => void;
  isVisible: boolean;
}

/**
 * Hook to manage feature-specific survey display
 * 
 * Usage:
 * const chatFeedback = useFeatureSurvey();
 * 
 * // Check eligibility after user interacts with feature
 * const handleUseChatMonetization = async () => {
 *   // ... user uses feature
 *   await chatFeedback.checkEligibility('chat_monetization');
 * };
 * 
 * // Show modal when eligible
 * if (chatFeedback.shouldShow) {
 *   chatFeedback.showSurvey();
 * }
 */
export function useFeatureSurvey(): UseFeatureSurveyResult {
  const [shouldShow, setShouldShow] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const checkEligibility = useCallback(async (featureKey: FeatureKey) => {
    setIsChecking(true);
    
    try {
      const result = await getShouldAskForFeatureFeedback({ featureKey });
      setShouldShow(result.shouldAsk);
      
      if (!result.shouldAsk && result.reason) {
        console.log(`[Feature Survey: ${featureKey}] Not showing:`, result.reason);
      }
    } catch (error) {
      console.error(`[Feature Survey: ${featureKey}] Error checking eligibility:`, error);
      setShouldShow(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const showSurvey = useCallback(() => {
    setIsVisible(true);
  }, []);

  const hideSurvey = useCallback(() => {
    setIsVisible(false);
    setShouldShow(false);
  }, []);

  return {
    shouldShow,
    isChecking,
    checkEligibility,
    showSurvey,
    hideSurvey,
    isVisible,
  };
}

// ============================================================================
// AUTO-TRIGGER NPS HOOK (WITH DELAY)
// ============================================================================

interface UseAutoNpsSurveyOptions {
  delayMs?: number; // Delay before checking (default: 30 seconds)
  enabled?: boolean; // Whether to auto-check (default: true)
}

/**
 * Hook that automatically checks and shows NPS survey with delay
 * 
 * Usage:
 * const nps = useAutoNpsSurvey({
 *   delayMs: 30000, // Wait 30 seconds after mount
 *   enabled: isAppActive, // Only check when app is active
 * });
 * 
 * <NpsSurveyModal
 *   visible={nps.isVisible}
 *   onClose={nps.hideSurvey}
 *   {...otherProps}
 * />
 */
export function useAutoNpsSurvey(
  options: UseAutoNpsSurveyOptions = {}
): UseNpsSurveyResult {
  const { delayMs = 30000, enabled = true } = options;
  const nps = useNpsSurvey();

  useEffect(() => {
    if (!enabled) return;

    // Wait before checking eligibility
    const timer = setTimeout(() => {
      nps.checkEligibility();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [enabled, delayMs, nps]);

  // Auto-show survey if eligible
  useEffect(() => {
    if (nps.shouldShow && !nps.isVisible) {
      nps.showSurvey();
    }
  }, [nps.shouldShow, nps.isVisible, nps]);

  return nps;
}

// ============================================================================
// AUTO-TRIGGER FEATURE SURVEY HOOK
// ============================================================================

interface UseAutoFeatureSurveyOptions {
  featureKey: FeatureKey;
  delayMs?: number; // Delay before checking (default: 5 seconds)
  triggerOnMount?: boolean; // Check on mount (default: false)
}

/**
 * Hook that automatically checks and shows feature survey with delay
 * 
 * Usage:
 * const chatFeedback = useAutoFeatureSurvey({
 *   featureKey: 'chat_monetization',
 *   delayMs: 5000, // Wait 5 seconds after feature use
 *   triggerOnMount: false, // Don't check on mount
 * });
 * 
 * // Manually trigger check after feature use
 * const handleSendPaidMessage = async () => {
 *   // ... send message
 *   await chatFeedback.checkEligibility('chat_monetization');
 * };
 * 
 * <FeatureSurveyModal
 *   visible={chatFeedback.isVisible}
 *   onClose={chatFeedback.hideSurvey}
 *   featureKey="chat_monetization"
 *   featureName="Chat Monetization"
 *   {...otherProps}
 * />
 */
export function useAutoFeatureSurvey(
  options: UseAutoFeatureSurveyOptions
): UseFeatureSurveyResult {
  const { featureKey, delayMs = 5000, triggerOnMount = false } = options;
  const survey = useFeatureSurvey();

  useEffect(() => {
    if (!triggerOnMount) return;

    // Wait before checking eligibility
    const timer = setTimeout(() => {
      survey.checkEligibility(featureKey);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [triggerOnMount, delayMs, featureKey, survey]);

  // Auto-show survey if eligible
  useEffect(() => {
    if (survey.shouldShow && !survey.isVisible) {
      survey.showSurvey();
    }
  }, [survey.shouldShow, survey.isVisible, survey]);

  return survey;
}