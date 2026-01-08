/**
 * PACK 206C — Onboarding Missions Service
 * Manages onboarding mission state and progression
 */

import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  OnboardingProgress,
  OnboardingState,
  Day1Mission,
  Day2Mission,
  Day3Mission,
  OnboardingMissionStep,
} from '../types/onboarding';
import * as OnboardingTracker from './analytics/onboardingTracker';

// ============================================================================
// FIRESTORE INSTANCE
// ============================================================================

let firestore: ReturnType<typeof getFirestore> | null = null;

function getFirestoreInstance() {
  if (!firestore) {
    const app = getApp();
    firestore = getFirestore(app);
  }
  return firestore;
}

// ============================================================================
// MISSION DEFINITIONS
// ============================================================================

function createDay1Mission(): Day1Mission {
  return {
    id: 'day1_magnetic_profile',
    titleKey: 'onboarding.day1.title',
    completed: false,
    steps: [
      {
        id: 'day1_step1',
        textKey: 'onboarding.day1.step1',
        completed: false,
        condition: { type: 'photos_uploaded', count: 3 },
      },
      {
        id: 'day1_step2',
        textKey: 'onboarding.day1.step2',
        completed: false,
        condition: { type: 'bio_length', minLength: 40 },
      },
      {
        id: 'day1_step3',
        textKey: 'onboarding.day1.step3',
        completed: false,
        condition: { type: 'attraction_choices', count: 2 },
      },
    ],
  };
}

function createDay2Mission(): Day2Mission {
  return {
    id: 'day2_start_spark',
    titleKey: 'onboarding.day2.title',
    completed: false,
    steps: [
      {
        id: 'day2_step1',
        textKey: 'onboarding.day2.step1',
        completed: false,
        condition: { type: 'likes_sent', count: 6 },
      },
      {
        id: 'day2_step2',
        textKey: 'onboarding.day2.step2',
        completed: false,
        condition: { type: 'reply_sent' },
      },
      {
        id: 'day2_step3',
        textKey: 'onboarding.day2.step3',
        completed: false,
        condition: { type: 'first_message_sent' },
      },
    ],
  };
}

function createDay3Mission(): Day3Mission {
  return {
    id: 'day3_heat_connection',
    titleKey: 'onboarding.day3.title',
    completed: false,
    steps: [
      {
        id: 'day3_step1',
        textKey: 'onboarding.day3.step1',
        completed: false,
        condition: { type: 'chat_started' },
      },
      {
        id: 'day3_step2',
        textKey: 'onboarding.day3.step2',
        completed: false,
        condition: { type: 'stories_watched', count: 3 },
      },
      {
        id: 'day3_step3',
        textKey: 'onboarding.day3.step3',
        completed: false,
        condition: { type: 'availability_added' },
      },
      {
        id: 'day3_step4',
        textKey: 'onboarding.day3.step4',
        completed: false,
        condition: { type: 'event_saved' },
      },
    ],
  };
}

// ============================================================================
// GET ONBOARDING STATE
// ============================================================================

/**
 * Get user's onboarding state
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  try {
    const db = getFirestoreInstance();
    const onboardingRef = doc(db, 'onboarding', userId);
    const onboardingSnap = await getDoc(onboardingRef);

    if (onboardingSnap.exists()) {
      const data = onboardingSnap.data();
      return {
        ...data,
        startedAt: data.startedAt?.toDate() || new Date(),
        completedAt: data.completedAt?.toDate(),
      } as OnboardingState;
    }

    // Create new onboarding state
    const newState: OnboardingState = {
      currentDay: 1,
      day1: createDay1Mission(),
      day2: createDay2Mission(),
      day3: createDay3Mission(),
      startedAt: new Date(),
    };

    await setDoc(onboardingRef, newState);
    return newState;
  } catch (error) {
    console.error('Error getting onboarding state:', error);
    throw error;
  }
}

/**
 * Get user's onboarding progress
 */
export async function getOnboardingProgress(
  userId: string
): Promise<OnboardingProgress> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);
    const progressSnap = await getDoc(progressRef);

    if (progressSnap.exists()) {
      const data = progressSnap.data();
      return {
        ...data,
        completedAt: data.completedAt?.toDate(),
        lastUpdated: data.lastUpdated?.toDate() || new Date(),
      } as OnboardingProgress;
    }

    // Create new progress
    const newProgress: OnboardingProgress = {
      userId,
      currentDay: 1,
      day1Completed: false,
      day2Completed: false,
      day3Completed: false,
      photosUploaded: 0,
      bioCompleted: false,
      attractionChoicesSelected: false,
      likesSent: 0,
      replySent: false,
      firstMessageSent: false,
      chatStarted: false,
      storiesWatched: 0,
      availabilityAdded: false,
      eventSaved: false,
      lastUpdated: new Date(),
    };

    await setDoc(progressRef, newProgress);
    return newProgress;
  } catch (error) {
    console.error('Error getting onboarding progress:', error);
    throw error;
  }
}

// ============================================================================
// UPDATE PROGRESS
// ============================================================================

/**
 * Update photo upload progress
 */
export async function updatePhotoProgress(
  userId: string,
  photoCount: number
): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      photosUploaded: photoCount,
      lastUpdated: new Date(),
    });

    if (photoCount >= 3) {
      OnboardingTracker.trackPhotoUploadCompleted(photoCount);
    }
  } catch (error) {
    console.error('Error updating photo progress:', error);
    throw error;
  }
}

/**
 * Update bio completion
 */
export async function updateBioProgress(
  userId: string,
  bioLength: number
): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    const bioCompleted = bioLength >= 40;
    await updateDoc(progressRef, {
      bioCompleted,
      lastUpdated: new Date(),
    });

    if (bioCompleted) {
      OnboardingTracker.trackVibeCompleted(bioLength);
    }
  } catch (error) {
    console.error('Error updating bio progress:', error);
    throw error;
  }
}

/**
 * Update attraction choices
 */
export async function updateAttractionChoices(
  userId: string,
  choicesSelected: boolean
): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      attractionChoicesSelected: choicesSelected,
      lastUpdated: new Date(),
    });

    if (choicesSelected) {
      OnboardingTracker.trackAttractionPreferencesCompleted(2);
    }
  } catch (error) {
    console.error('Error updating attraction choices:', error);
    throw error;
  }
}

/**
 * Update likes sent count
 */
export async function updateLikesProgress(
  userId: string,
  likeCount: number
): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      likesSent: likeCount,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackLikeSent(likeCount);
  } catch (error) {
    console.error('Error updating likes progress:', error);
    throw error;
  }
}

/**
 * Mark reply sent
 */
export async function markReplySent(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      replySent: true,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackReplySent();
  } catch (error) {
    console.error('Error marking reply sent:', error);
    throw error;
  }
}

/**
 * Mark first message sent
 */
export async function markFirstMessageSent(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      firstMessageSent: true,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackFirstMessageSent();
  } catch (error) {
    console.error('Error marking first message sent:', error);
    throw error;
  }
}

/**
 * Mark chat started
 */
export async function markChatStarted(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      chatStarted: true,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackChatStarted();
  } catch (error) {
    console.error('Error marking chat started:', error);
    throw error;
  }
}

/**
 * Update stories watched count
 */
export async function updateStoriesProgress(
  userId: string,
  storiesCount: number
): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      storiesWatched: storiesCount,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackStoriesWatched(storiesCount);
  } catch (error) {
    console.error('Error updating stories progress:', error);
    throw error;
  }
}

/**
 * Mark availability added
 */
export async function markAvailabilityAdded(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      availabilityAdded: true,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackCalendarAdded();
  } catch (error) {
    console.error('Error marking availability added:', error);
    throw error;
  }
}

/**
 * Mark event saved
 */
export async function markEventSaved(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      eventSaved: true,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackEventSaved();
  } catch (error) {
    console.error('Error marking event saved:', error);
    throw error;
  }
}

// ============================================================================
// DAY COMPLETION
// ============================================================================

/**
 * Complete Day 1 and move to Day 2
 */
export async function completeDay1(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      day1Completed: true,
      currentDay: 2,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackDay1Completed();
  } catch (error) {
    console.error('Error completing Day 1:', error);
    throw error;
  }
}

/**
 * Complete Day 2 and move to Day 3
 */
export async function completeDay2(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      day2Completed: true,
      currentDay: 3,
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackDay2Completed();
  } catch (error) {
    console.error('Error completing Day 2:', error);
    throw error;
  }
}

/**
 * Complete Day 3 and finish onboarding
 */
export async function completeDay3(userId: string): Promise<void> {
  try {
    const db = getFirestoreInstance();
    const progressRef = doc(db, 'onboardingProgress', userId);

    await updateDoc(progressRef, {
      day3Completed: true,
      currentDay: 'completed',
      completedAt: new Date(),
      lastUpdated: new Date(),
    });

    OnboardingTracker.trackDay3Completed();
    OnboardingTracker.trackOnboardingFinished(3, 10, 10);
  } catch (error) {
    console.error('Error completing Day 3:', error);
    throw error;
  }
}

/**
 * Check if Day 1 is complete
 */
export function isDay1Complete(progress: OnboardingProgress): boolean {
  return (
    progress.photosUploaded >= 3 &&
    progress.bioCompleted &&
    progress.attractionChoicesSelected
  );
}

/**
 * Check if Day 2 is complete
 */
export function isDay2Complete(progress: OnboardingProgress): boolean {
  return (
    progress.likesSent >= 6 &&
    progress.replySent &&
    progress.firstMessageSent
  );
}

/**
 * Check if Day 3 is complete (required steps only)
 */
export function isDay3Complete(progress: OnboardingProgress): boolean {
  return progress.chatStarted && progress.storiesWatched >= 3;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getOnboardingState,
  getOnboardingProgress,
  updatePhotoProgress,
  updateBioProgress,
  updateAttractionChoices,
  updateLikesProgress,
  markReplySent,
  markFirstMessageSent,
  markChatStarted,
  updateStoriesProgress,
  markAvailabilityAdded,
  markEventSaved,
  completeDay1,
  completeDay2,
  completeDay3,
  isDay1Complete,
  isDay2Complete,
  isDay3Complete,
};