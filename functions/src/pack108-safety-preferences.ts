/**
 * PACK 108 — User Safety Preferences System
 * Personal boundaries and NSFW controls
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  UserSafetyPreferences,
  DEFAULT_SAFETY_PREFERENCES,
  GLOBAL_MINIMUM_AGE_NSFW,
} from './pack108-types';
import { resolveUserPolicyContext } from './pack91-policy-engine';

// ============================================================================
// SAFETY PREFERENCES MANAGEMENT
// ============================================================================

/**
 * Get user safety preferences
 * Creates default preferences if none exist
 */
export async function getUserSafetyPreferences(
  userId: string
): Promise<UserSafetyPreferences> {
  try {
    const doc = await db.collection('user_safety_preferences').doc(userId).get();

    if (doc.exists) {
      return doc.data() as UserSafetyPreferences;
    }

    // Create default preferences
    const defaultPrefs = await createDefaultSafetyPreferences(userId);
    return defaultPrefs;
  } catch (error) {
    console.error(`[PACK108] Error getting safety preferences for ${userId}:`, error);
    throw error;
  }
}

/**
 * Create default safety preferences for new user
 */
async function createDefaultSafetyPreferences(
  userId: string
): Promise<UserSafetyPreferences> {
  try {
    // Get user's region and age
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const regionCode = userData?.profile?.country || userData?.ipCountry || 'UNKNOWN';
    const age = calculateAge(userData?.dateOfBirth);
    const ageVerified = userData?.ageVerified === true || age >= GLOBAL_MINIMUM_AGE_NSFW;

    // Check if NSFW is legal in user's region
    const policyContext = await resolveUserPolicyContext(userId);
    const nsfwLegalInRegion = policyContext.policy.allowNSFWSoft || policyContext.policy.allowNSFWStrong;

    const preferences: UserSafetyPreferences = {
      userId,
      ...DEFAULT_SAFETY_PREFERENCES,
      allowAdultContentInFeed: false,
      autoFilterNSFWPreviews: true,
      blurExplicitMediaByDefault: true,
      allowAdultCreatorsToDM: true,
      nsfwHistoryHidden: false,
      regionCode,
      nsfwLegalInRegion,
      ageVerified,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('user_safety_preferences').doc(userId).set(preferences);
    
    console.log(`[PACK108] Created default safety preferences for ${userId}`);
    return preferences;
  } catch (error) {
    console.error(`[PACK108] Error creating default preferences:`, error);
    throw error;
  }
}

/**
 * Update user safety preferences
 */
export async function updateSafetyPreferences(
  userId: string,
  updates: Partial<UserSafetyPreferences>
): Promise<UserSafetyPreferences> {
  try {
    // Get current preferences
    const currentPrefs = await getUserSafetyPreferences(userId);

    // Validate updates based on region and age
    const validatedUpdates = await validatePreferenceUpdates(userId, updates, currentPrefs);

    // Apply updates
    const updatedPrefs: UserSafetyPreferences = {
      ...currentPrefs,
      ...validatedUpdates,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('user_safety_preferences').doc(userId).set(updatedPrefs);

    console.log(`[PACK108] Updated safety preferences for ${userId}`);
    return updatedPrefs;
  } catch (error) {
    console.error(`[PACK108] Error updating safety preferences:`, error);
    throw error;
  }
}

/**
 * Validate preference updates based on region and age
 */
async function validatePreferenceUpdates(
  userId: string,
  updates: Partial<UserSafetyPreferences>,
  current: UserSafetyPreferences
): Promise<Partial<UserSafetyPreferences>> {
  const validated: Partial<UserSafetyPreferences> = {};

  // Check if user can enable adult content
  if (updates.allowAdultContentInFeed !== undefined) {
    if (updates.allowAdultContentInFeed === true) {
      // Verify age and region legality
      if (!current.ageVerified) {
        throw new Error('Age verification required to enable adult content');
      }
      if (!current.nsfwLegalInRegion) {
        throw new Error('Adult content is not available in your region');
      }
    }
    validated.allowAdultContentInFeed = updates.allowAdultContentInFeed;
  }

  // Other preferences can be updated freely
  if (updates.autoFilterNSFWPreviews !== undefined) {
    validated.autoFilterNSFWPreviews = updates.autoFilterNSFWPreviews;
  }
  if (updates.blurExplicitMediaByDefault !== undefined) {
    validated.blurExplicitMediaByDefault = updates.blurExplicitMediaByDefault;
  }
  if (updates.allowAdultCreatorsToDM !== undefined) {
    validated.allowAdultCreatorsToDM = updates.allowAdultCreatorsToDM;
  }

  return validated;
}

/**
 * Panic-hide NSFW history (emergency feature)
 */
export async function panicHideNSFWHistory(userId: string): Promise<void> {
  try {
    await db.collection('user_safety_preferences').doc(userId).update({
      nsfwHistoryHidden: true,
      hiddenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] NSFW history hidden for ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error hiding NSFW history:`, error);
    throw error;
  }
}

/**
 * Restore NSFW history visibility
 */
export async function restoreNSFWHistory(userId: string): Promise<void> {
  try {
    await db.collection('user_safety_preferences').doc(userId).update({
      nsfwHistoryHidden: false,
      hiddenAt: null,
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] NSFW history restored for ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error restoring NSFW history:`, error);
    throw error;
  }
}

// ============================================================================
// PREFERENCE CHECKS
// ============================================================================

/**
 * Check if user can view NSFW content based on preferences
 */
export async function canUserViewNSFWByPreferences(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const prefs = await getUserSafetyPreferences(userId);

    // Check age verification
    if (!prefs.ageVerified) {
      return {
        allowed: false,
        reason: 'Age verification required',
      };
    }

    // Check region legality
    if (!prefs.nsfwLegalInRegion) {
      return {
        allowed: false,
        reason: 'Not available in your region',
      };
    }

    // Check user opt-in for feed
    if (!prefs.allowAdultContentInFeed) {
      return {
        allowed: false,
        reason: 'Adult content disabled in preferences',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error(`[PACK108] Error checking NSFW view permission:`, error);
    return {
      allowed: false,
      reason: 'Error checking permissions',
    };
  }
}

/**
 * Check if adult creator can DM user
 */
export async function canAdultCreatorDMUser(
  creatorId: string,
  recipientId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get recipient's preferences
    const recipientPrefs = await getUserSafetyPreferences(recipientId);

    // Check if recipient allows adult creators to DM
    if (!recipientPrefs.allowAdultCreatorsToDM) {
      return {
        allowed: false,
        reason: 'User does not accept messages from adult creators',
      };
    }

    // Check if creator has NSFW content
    const creatorProfile = await db.collection('creator_content_profiles').doc(creatorId).get();
    const hasNSFWContent = creatorProfile.exists && 
      (creatorProfile.data()?.nsfwContentRatio || 0) > 0;

    if (hasNSFWContent && !recipientPrefs.allowAdultCreatorsToDM) {
      return {
        allowed: false,
        reason: 'User does not accept messages from adult creators',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error(`[PACK108] Error checking DM permission:`, error);
    return {
      allowed: true, // Default to allowing on error (fail-open for messages)
    };
  }
}

/**
 * Should media be blurred for user
 */
export async function shouldBlurMediaForUser(
  userId: string,
  nsfwLevel: 'SAFE' | 'SOFT_NSFW' | 'NSFW_EXPLICIT'
): Promise<boolean> {
  try {
    if (nsfwLevel === 'SAFE') {
      return false; // Never blur safe content
    }

    const prefs = await getUserSafetyPreferences(userId);

    // Always blur if auto-filter is enabled
    if (prefs.autoFilterNSFWPreviews) {
      return true;
    }

    // Blur explicit content if that setting is enabled
    if (nsfwLevel === 'NSFW_EXPLICIT' && prefs.blurExplicitMediaByDefault) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[PACK108] Error checking blur preference:`, error);
    return true; // Default to blurring on error (fail-safe)
  }
}

// ============================================================================
// AGE VERIFICATION HELPERS
// ============================================================================

/**
 * Calculate user age from date of birth
 */
function calculateAge(dateOfBirth: any): number {
  if (!dateOfBirth) {
    return 0;
  }

  try {
    let dobDate: Date;

    // Handle Firestore Timestamp
    if (dateOfBirth.toDate) {
      dobDate = dateOfBirth.toDate();
    } else if (typeof dateOfBirth === 'string') {
      dobDate = new Date(dateOfBirth);
    } else if (dateOfBirth instanceof Date) {
      dobDate = dateOfBirth;
    } else {
      return 0;
    }

    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }

    return Math.max(0, age);
  } catch (error) {
    console.error('[PACK108] Failed to calculate age:', error);
    return 0;
  }
}

/**
 * Update age verification status
 */
export async function updateAgeVerification(
  userId: string,
  verified: boolean
): Promise<void> {
  try {
    await db.collection('user_safety_preferences').doc(userId).update({
      ageVerified: verified,
      updatedAt: serverTimestamp(),
    });

    // If verified, check if user's region allows NSFW
    if (verified) {
      const policyContext = await resolveUserPolicyContext(userId);
      const nsfwLegalInRegion = policyContext.policy.allowNSFWSoft || policyContext.policy.allowNSFWStrong;

      await db.collection('user_safety_preferences').doc(userId).update({
        nsfwLegalInRegion,
        updatedAt: serverTimestamp(),
      });
    }

    console.log(`[PACK108] Age verification updated for ${userId}: ${verified}`);
  } catch (error) {
    console.error(`[PACK108] Error updating age verification:`, error);
    throw error;
  }
}

/**
 * Batch update region legality for users (after policy change)
 */
export async function batchUpdateRegionLegality(
  regionCode: string,
  nsfwLegal: boolean
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  try {
    // Get all users in region
    const usersSnapshot = await db
      .collection('user_safety_preferences')
      .where('regionCode', '==', regionCode)
      .get();

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of usersSnapshot.docs) {
      batch.update(doc.ref, {
        nsfwLegalInRegion: nsfwLegal,
        updatedAt: serverTimestamp(),
      });

      batchCount++;
      updated++;

      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[PACK108] Updated region legality for ${updated} users in ${regionCode}`);
  } catch (error) {
    console.error(`[PACK108] Error batch updating region legality:`, error);
    failed++;
  }

  return { updated, failed };
}