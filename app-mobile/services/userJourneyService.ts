/**
 * User Journey Service - Phase 5
 * Handles profile completion checks, wallet warnings, and navigation guards
 */

import {
  getFirestore,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { router } from 'expo-router';

// Initialize Firestore
const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

// Minimum token threshold for warnings
const MIN_TOKEN_THRESHOLD = 5;

/**
 * Check if user profile is complete
 */
export const isProfileComplete = async (userId: string): Promise<boolean> => {
  try {
    const db = getDb();
    const profileRef = doc(db, 'profiles', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return false;
    }

    const profile = profileSnap.data();

    // Required fields for a complete profile
    const requiredFields = [
      'displayName',
      'birthDate',
      'gender',
      'location',
      'bio',
      'photos',
    ];

    // Check all required fields are present and not empty
    for (const field of requiredFields) {
      if (!profile[field]) {
        return false;
      }
    }

    // Check photos array has at least 1 photo
    if (!Array.isArray(profile.photos) || profile.photos.length === 0) {
      return false;
    }

    // Check onboarding is marked as complete
    if (!profile.onboardingComplete) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking profile completion:', error);
    return false;
  }
};

/**
 * Check if user has low token balance
 */
export const hasLowTokenBalance = async (userId: string): Promise<boolean> => {
  try {
    const db = getDb();
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      return true; // No wallet = low balance
    }

    const balance = walletSnap.data().tokens || 0;
    return balance < MIN_TOKEN_THRESHOLD;
  } catch (error) {
    console.error('Error checking token balance:', error);
    return true; // Assume low balance on error
  }
};

/**
 * Force user back to onboarding if profile incomplete
 */
export const enforceProfileCompletion = async (userId: string): Promise<void> => {
  const isComplete = await isProfileComplete(userId);
  
  if (!isComplete) {
    // Redirect to onboarding
    router.replace('/welcome');
  }
};

/**
 * Get wallet top-up CTA message
 */
export const getWalletTopUpCTA = (balance: number): string | null => {
  if (balance < MIN_TOKEN_THRESHOLD) {
    if (balance === 0) {
      return '💰 Your wallet is empty! Top up now to unlock all features.';
    } else {
      return `💰 Low balance! You have ${balance} token${balance !== 1 ? 's' : ''}. Top up to continue chatting.`;
    }
  }
  return null;
};

/**
 * Check if user can perform action (requires minimum tokens)
 */
export const canPerformAction = async (
  userId: string,
  requiredTokens: number
): Promise<{ canPerform: boolean; balance: number; message?: string }> => {
  try {
    const db = getDb();
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      return {
        canPerform: false,
        balance: 0,
        message: 'Wallet not found. Please contact support.',
      };
    }

    const balance = walletSnap.data().tokens || 0;

    if (balance < requiredTokens) {
      return {
        canPerform: false,
        balance,
        message: `Insufficient tokens. You need ${requiredTokens} tokens but only have ${balance}.`,
      };
    }

    return {
      canPerform: true,
      balance,
    };
  } catch (error) {
    console.error('Error checking action permissions:', error);
    return {
      canPerform: false,
      balance: 0,
      message: 'Error checking balance. Please try again.',
    };
  }
};

/**
 * Navigation guard - checks profile completion before allowing access
 */
export const useNavigationGuard = async (userId: string): Promise<boolean> => {
  try {
    // Check profile completion
    const isComplete = await isProfileComplete(userId);
    
    if (!isComplete) {
      console.log('Profile incomplete, redirecting to onboarding');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in navigation guard:', error);
    return true; // Allow navigation on error to prevent blocking
  }
};

/**
 * Get user journey status
 */
export const getUserJourneyStatus = async (userId: string): Promise<{
  profileComplete: boolean;
  hasLowBalance: boolean;
  balance: number;
  warnings: string[];
}> => {
  try {
    const db = getDb();
    
    // Check profile
    const profileComplete = await isProfileComplete(userId);
    
    // Check balance
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);
    const balance = walletSnap.exists() ? (walletSnap.data().tokens || 0) : 0;
    const hasLowBalance = balance < MIN_TOKEN_THRESHOLD;
    
    // Build warnings array
    const warnings: string[] = [];
    
    if (!profileComplete) {
      warnings.push('Complete your profile to unlock all features');
    }
    
    if (hasLowBalance) {
      warnings.push(getWalletTopUpCTA(balance) || 'Low token balance');
    }
    
    return {
      profileComplete,
      hasLowBalance,
      balance,
      warnings,
    };
  } catch (error) {
    console.error('Error getting user journey status:', error);
    return {
      profileComplete: false,
      hasLowBalance: true,
      balance: 0,
      warnings: ['Error loading account status'],
    };
  }
};