/**
 * PACK 436 — Review Nudges Module
 * 
 * Mobile UI integration for review nudges
 * Displays review prompts at optimal emotional moments
 */

import { Alert, Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewNudge {
  type: 'review_request';
  trigger: 'date_success' | 'monetization' | 'event_attendance' | 'onboarding' | 'match_unlock';
  score: number;
  message: string;
  createdAt: number;
  displayed: boolean;
  responded: boolean;
}

// ============================================================================
// DISPLAY REVIEW NUDGE
// ============================================================================

/**
 * Display a review nudge to the user
 * Uses native in-app review when available
 */
export async function displayReviewNudge(nudge: ReviewNudge): Promise<boolean> {
  try {
    // Check if we should show the nudge
    const shouldShow = await shouldShowNudge(nudge);
    if (!shouldShow) {
      return false;
    }

    // Check if in-app review is available
    const isAvailable = await StoreReview.isAvailableAsync();
    
    if (isAvailable) {
      // Use native in-app review (preferred)
      await StoreReview.requestReview();
      await markNudgeDisplayed(nudge);
      return true;
    } else {
      // Fallback to custom alert
      return await showCustomReviewPrompt(nudge);
    }
  } catch (error) {
    console.error('Error displaying review nudge:', error);
    return false;
  }
}

/**
 * Show custom review prompt with action buttons
 */
async function showCustomReviewPrompt(nudge: ReviewNudge): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      '❤️ Support Avalo',
      nudge.message,
      [
        {
          text: 'Not Now',
          style: 'cancel',
          onPress: () => {
            markNudgeDisplayed(nudge);
            resolve(false);
          },
        },
        {
          text: 'Rate App',
          onPress: async () => {
            await openStoreReviewPage();
            await markNudgeDisplayed(nudge);
            await markNudgeResponded(nudge, true);
            resolve(true);
          },
        },
      ],
      { cancelable: true }
    );
  });
}

/**
 * Open the app store review page
 */
async function openStoreReviewPage() {
  const storeUrl = Platform.select({
    ios: 'itms-apps://itunes.apple.com/app/id YOUR_APP_ID?action=write-review',
    android: 'market://details?id=YOUR_PACKAGE_NAME',
  });

  if (storeUrl) {
    const canOpen = await Linking.canOpenURL(storeUrl);
    if (canOpen) {
      await Linking.openURL(storeUrl);
    }
  }
}

// ============================================================================
// NUDGE MANAGEMENT
// ============================================================================

/**
 * Check if nudge should be shown
 */
async function shouldShowNudge(nudge: ReviewNudge): Promise<boolean> {
  try {
    // Don't show if already displayed
    if (nudge.displayed) {
      return false;
    }

    // Check last nudge timestamp
    const lastNudgeStr = await AsyncStorage.getItem('@lastReviewNudge');
    if (lastNudgeStr) {
      const lastNudge = parseInt(lastNudgeStr, 10);
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      
      // Don't show if nudged in last 24 hours
      if (lastNudge > oneDayAgo) {
        return false;
      }
    }

    // Check if user already left a review
    const hasReviewed = await AsyncStorage.getItem('@hasLeftReview');
    if (hasReviewed === 'true') {
      return false;
    }

    // Check nudge score threshold (only show if score >= 60)
    if (nudge.score < 60) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking if should show nudge:', error);
    return false;
  }
}

/**
 * Mark nudge as displayed
 */
async function markNudgeDisplayed(nudge: ReviewNudge): Promise<void> {
  try {
    await AsyncStorage.setItem('@lastReviewNudge', Date.now().toString());
    
    // Store nudge history
    const historyStr = await AsyncStorage.getItem('@reviewNudgeHistory');
    const history = historyStr ? JSON.parse(historyStr) : [];
    history.push({
      trigger: nudge.trigger,
      timestamp: Date.now(),
      responded: false,
    });
    await AsyncStorage.setItem('@reviewNudgeHistory', JSON.stringify(history));
  } catch (error) {
    console.error('Error marking nudge displayed:', error);
  }
}

/**
 * Mark nudge as responded
 */
async function markNudgeResponded(nudge: ReviewNudge, leftReview: boolean): Promise<void> {
  try {
    if (leftReview) {
      await AsyncStorage.setItem('@hasLeftReview', 'true');
    }
    
    // Update history
    const historyStr = await AsyncStorage.getItem('@reviewNudgeHistory');
    if (historyStr) {
      const history = JSON.parse(historyStr);
      if (history.length > 0) {
        history[history.length - 1].responded = true;
        history[history.length - 1].leftReview = leftReview;
        await AsyncStorage.setItem('@reviewNudgeHistory', JSON.stringify(history));
      }
    }
  } catch (error) {
    console.error('Error marking nudge responded:', error);
  }
}

// ============================================================================
// TRIGGER EVALUATION
// ============================================================================

/**
 * Check for pending review nudges
 */
export async function checkForPendingNudges(userId: string): Promise<ReviewNudge | null> {
  try {
    // In production, fetch from Firestore
    // For now, return null as placeholder
    
    // Example implementation:
    // const db = getFirestore();
    // const nudgeDoc = await getDoc(doc(db, 'reviewNudges', userId));
    // if (nudgeDoc.exists()) {
    //   return nudgeDoc.data() as ReviewNudge;
    // }
    
    return null;
  } catch (error) {
    console.error('Error checking for pending nudges:', error);
    return null;
  }
}

/**
 * Get nudge statistics
 */
export async function getNudgeStats(): Promise<{
  totalNudges: number;
  responded: number;
  leftReview: boolean;
}> {
  try {
    const historyStr = await AsyncStorage.getItem('@reviewNudgeHistory');
    const history = historyStr ? JSON.parse(historyStr) : [];
    const hasReviewed = await AsyncStorage.getItem('@hasLeftReview');
    
    return {
      totalNudges: history.length,
      responded: history.filter((h: any) => h.responded).length,
      leftReview: hasReviewed === 'true',
    };
  } catch (error) {
    console.error('Error getting nudge stats:', error);
    return {
      totalNudges: 0,
      responded: 0,
      leftReview: false,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Reset review nudge state (for testing)
 */
export async function resetNudgeState(): Promise<void> {
  try {
    await AsyncStorage.removeItem('@lastReviewNudge');
    await AsyncStorage.removeItem('@hasLeftReview');
    await AsyncStorage.removeItem('@reviewNudgeHistory');
  } catch (error) {
    console.error('Error resetting nudge state:', error);
  }
}

/**
 * Force show review prompt (for testing)
 */
export async function forceShowReviewPrompt(): Promise<void> {
  const mockNudge: ReviewNudge = {
    type: 'review_request',
    trigger: 'onboarding',
    score: 100,
    message: 'Would you like to support Avalo with a rating? ❤️ Your feedback helps us grow!',
    createdAt: Date.now(),
    displayed: false,
    responded: false,
  };
  
  await displayReviewNudge(mockNudge);
}
