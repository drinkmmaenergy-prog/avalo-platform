/**
 * PACK 371: REVIEW NUDGE HOOK
 * 
 * Triggers app store review prompts at optimal moments
 */

import { useState, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface ReviewNudgeResult {
  shouldShow: boolean;
  reason?: string;
  message?: string;
}

export function useReviewNudge() {
  const [isProcessing, setIsProcessing] = useState(false);
  
  /**
   * Check if user is eligible and show review prompt
   */
  const requestReview = useCallback(async (trigger: string): Promise<boolean> => {
    try {
      setIsProcessing(true);
      
      // Check if StoreReview is available on this device
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        console.log('Store review not available on this device');
        return false;
      }
      
      // Call Cloud Function to check eligibility
      const checkEligibility = httpsCallable<
        { trigger: string },
        ReviewNudgeResult
      >(functions, 'pack371_reviewNudges');
      
      const result = await checkEligibility({ trigger });
      
      if (!result.data.shouldShow) {
        console.log(`Review nudge suppressed: ${result.data.reason}`);
        return false;
      }
      
      // Show in-app review prompt (iOS 10.3+ / Android 5+)
      await StoreReview.requestReview();
      
      return true;
    } catch (error) {
      console.error('Error requesting review:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  /**
   * Record that user left a review (for conversion tracking)
   */
  const recordReviewConversion = useCallback(async (): Promise<void> => {
    try {
      const recordConversion = httpsCallable(
        functions,
        'pack371_recordReviewConversion'
      );
      
      await recordConversion({});
    } catch (error) {
      console.error('Error recording review conversion:', error);
    }
  }, []);
  
  /**
   * Open app store page (if in-app review doesn't work)
   */
  const openStorePage = useCallback(async (): Promise<void> => {
    try {
      // Replace with your actual app store URLs
      const appStoreId = 'YOUR_APP_STORE_ID';
      const androidPackage = 'com.avalo.app';
      
      if (Platform.OS === 'ios') {
        const url = `https://apps.apple.com/app/id${appStoreId}?action=write-review`;
        await Linking.openURL(url);
      } else {
        const url = `market://details?id=${androidPackage}`;
        await Linking.openURL(url);
      }
      
      // Record conversion
      await recordReviewConversion();
    } catch (error) {
      console.error('Error opening store page:', error);
    }
  }, [recordReviewConversion]);
  
  return {
    requestReview,
    recordReviewConversion,
    openStorePage,
    isProcessing,
  };
}

/**
 * Trigger points for review nudges
 */
export const REVIEW_TRIGGERS = {
  AFTER_SUCCESSFUL_CHAT: 'after_successful_chat',
  AFTER_VIDEO_CALL: 'after_video_call',
  AFTER_WITHDRAWAL: 'after_withdrawal',
  AFTER_IDENTITY_VERIFIED: 'after_identity_verified',
  AFTER_FIVE_STAR_INTERACTION: 'after_five_star_interaction',
} as const;
