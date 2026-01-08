/**
 * PACK 428 — Feature Flag Service
 * 
 * Core service for evaluating feature flags based on user context
 * 
 * Integration Points:
 * - PACK 301: Retention profiles for sticky experiment assignments
 * - PACK 296: Audit logs for all flag changes
 * - PACK 302/352: Fraud detection for auto-disable
 */

import * as admin from 'firebase-admin';
import { 
  FeatureFlag, 
  UserContext, 
  FlagEvaluationResult,
  ExperimentAssignment,
  RegionCode,
  Platform,
  UserSegment,
  KillSwitchKey
} from './pack428-flags-types';

const db = admin.firestore();

/**
 * Get all feature flags for a user based on their context
 */
export async function getFeatureFlagsForUser(
  userId: string,
  region: RegionCode,
  platform: Platform
): Promise<Record<string, boolean>> {
  try {
    const userContext = await buildUserContext(userId, region, platform);
    const flagsSnapshot = await db.collection('global')
      .doc('featureFlags')
      .collection('flags')
      .get();

    const flags: Record<string, boolean> = {};

    for (const doc of flagsSnapshot.docs) {
      const flag = doc.data() as FeatureFlag;
      const result = await evaluateFeatureFlag(flag, userContext);
      flags[flag.key] = result.enabled;
    }

    return flags;
  } catch (error) {
    console.error('[PACK 428] Error getting feature flags:', error);
    // Fail open - return empty flags on error
    return {};
  }
}

/**
 * Check if a specific feature is enabled for a user
 */
export async function isFeatureEnabled(
  flagKey: string,
  userContext: UserContext
): Promise<boolean> {
  try {
    // Check kill switch first
    const killSwitchActive = await isKillSwitchActive(flagKey);
    if (killSwitchActive) {
      return false;
    }

    // Get flag from Firestore
    const flagDoc = await db.collection('global')
      .doc('featureFlags')
      .collection('flags')
      .doc(flagKey)
      .get();

    if (!flagDoc.exists) {
      // Feature flag doesn't exist - fail safe (disabled)
      return false;
    }

    const flag = flagDoc.data() as FeatureFlag;
    const result = await evaluateFeatureFlag(flag, userContext);
    
    return result.enabled;
  } catch (error) {
    console.error(`[PACK 428] Error checking feature ${flagKey}:`, error);
    // Fail safe - disabled on error
    return false;
  }
}

/**
 * Evaluate a feature flag against user context
 */
async function evaluateFeatureFlag(
  flag: FeatureFlag,
  userContext: UserContext
): Promise<FlagEvaluationResult> {
  const now = admin.firestore.Timestamp.now();

  // Check kill switch first - overrides everything
  if (flag.killSwitch) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: 'Kill switch active',
      evaluatedAt: now
    };
  }

  // Check master enabled flag
  if (!flag.enabled) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: 'Flag globally disabled',
      evaluatedAt: now
    };
  }

  // Check schedule
  if (flag.startAt && now.toMillis() < flag.startAt.toMillis()) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: 'Feature not started yet',
      evaluatedAt: now
    };
  }

  if (flag.endAt && now.toMillis() > flag.endAt.toMillis()) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: 'Feature expired',
      evaluatedAt: now
    };
  }

  // Check region
  if (!isRegionMatch(flag.regions, userContext.region)) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: `Region ${userContext.region} not in allowed regions`,
      evaluatedAt: now
    };
  }

  // Check platform
  if (!isPlatformMatch(flag.platforms, userContext.platform)) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: `Platform ${userContext.platform} not in allowed platforms`,
      evaluatedAt: now
    };
  }

  // Check user segment
  if (!isUserSegmentMatch(flag.userSegments, userContext)) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: `User segment doesn't match`,
      evaluatedAt: now
    };
  }

  // Check rollout percentage
  if (flag.rolloutPercentage < 100) {
    const isInRollout = isUserInRollout(userContext.userId, flag.key, flag.rolloutPercentage);
    if (!isInRollout) {
      return {
        flagKey: flag.key,
        enabled: false,
        reason: `User not in ${flag.rolloutPercentage}% rollout`,
        evaluatedAt: now
      };
    }
  }

  // Check if part of experiment
  if (flag.experimentKey) {
    const assignment = await getExperimentAssignment(userContext.userId, flag.experimentKey);
    return {
      flagKey: flag.key,
      enabled: true,
      reason: 'Enabled via experiment',
      variantKey: assignment?.variantKey || null,
      evaluatedAt: now
    };
  }

  // All checks passed
  return {
    flagKey: flag.key,
    enabled: true,
    reason: 'All criteria met',
    evaluatedAt: now
  };
}

/**
 * Build user context from userId and metadata
 */
async function buildUserContext(
  userId: string,
  region: RegionCode,
  platform: Platform
): Promise<UserContext> {
  // Get user profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }

  // Determine user segment
  const accountAge = Date.now() - userData.createdAt.toMillis();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  let segment: UserSegment = 'ALL';
  
  if (accountAge < sevenDays) {
    segment = 'NEW';
  } else if (userData.lastActivity && (Date.now() - userData.lastActivity.toMillis()) < thirtyDays) {
    segment = 'ACTIVE';
  }

  // Check premium tiers
  const isVip = userData.subscriptionTier === 'VIP';
  const isRoyal = userData.subscriptionTier === 'ROYAL' || userData.isRoyalClubMember === true;
  const isCreator = userData.isCreator === true;

  if (isRoyal) segment = 'ROYAL';
  else if (isVip) segment = 'VIP';
  else if (isCreator) segment = 'CREATOR';

  return {
    userId,
    region,
    platform,
    userSegment: segment,
    subscriptionTier: userData.subscriptionTier || 'FREE',
    createdAt: userData.createdAt,
    isCreator,
    isVip,
    isRoyal
  };
}

/**
 * Check if region matches
 */
function isRegionMatch(allowedRegions: RegionCode | RegionCode[], userRegion: RegionCode): boolean {
  if (allowedRegions === 'ALL') return true;
  
  if (Array.isArray(allowedRegions)) {
    return allowedRegions.includes(userRegion) || allowedRegions.includes('ALL');
  }
  
  return allowedRegions === userRegion;
}

/**
 * Check if platform matches
 */
function isPlatformMatch(allowedPlatforms: Platform | Platform[], userPlatform: Platform): boolean {
  if (allowedPlatforms === 'ALL') return true;
  
  if (Array.isArray(allowedPlatforms)) {
    return allowedPlatforms.includes(userPlatform) || allowedPlatforms.includes('ALL');
  }
  
  return allowedPlatforms === userPlatform;
}

/**
 * Check if user segment matches
 */
function isUserSegmentMatch(allowedSegments: UserSegment | UserSegment[], userContext: UserContext): boolean {
  if (allowedSegments === 'ALL') return true;
  
  const segments = Array.isArray(allowedSegments) ? allowedSegments : [allowedSegments];
  
  // Check if user's segment is in allowed segments
  return segments.includes(userContext.userSegment) || segments.includes('ALL');
}

/**
 * Consistent hash to determine if user is in rollout percentage
 * Same user + same flag = same result (sticky)
 */
function isUserInRollout(userId: string, flagKey: string, percentage: number): boolean {
  // Simple hash function
  const str = `${userId}:${flagKey}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to 0-100 range
  const bucket = Math.abs(hash % 100);
  return bucket < percentage;
}

/**
 * Check if a kill switch is active
 */
async function isKillSwitchActive(flagKey: string): Promise<boolean> {
  try {
    // Check if this flag has a direct kill switch
    const killSwitchDoc = await db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .doc(flagKey)
      .get();

    if (killSwitchDoc.exists) {
      const data = killSwitchDoc.data();
      return data?.active === true;
    }

    // Check global kill switches
    const globalKillSwitches = await db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .where('active', '==', true)
      .get();

    // Map feature flags to global kill switches
    const killSwitchMap: Record<string, string[]> = {
      [KillSwitchKey.CHAT_GLOBAL]: ['CHAT_', 'MESSAGE_', 'CONVERSATION_'],
      [KillSwitchKey.PAYMENTS_GLOBAL]: ['PAYMENT_', 'PURCHASE_', 'TOKEN_BUY'],
      [KillSwitchKey.WITHDRAWALS_GLOBAL]: ['WITHDRAW_', 'PAYOUT_'],
      [KillSwitchKey.AI_COMPANIONS_GLOBAL]: ['AI_', 'COMPANION_', 'BOT_'],
      [KillSwitchKey.CALENDAR_BOOKINGS_GLOBAL]: ['CALENDAR_', 'BOOKING_'],
      [KillSwitchKey.EVENTS_GLOBAL]: ['EVENT_', 'LIVE_'],
      [KillSwitchKey.DISCOVERY_GLOBAL]: ['DISCOVERY_', 'EXPLORE_', 'FEED_'],
      [KillSwitchKey.PUSH_NOTIFICATIONS_GLOBAL]: ['NOTIFICATION_', 'PUSH_', 'ALERT_']
    };

    for (const doc of globalKillSwitches.docs) {
      const key = doc.id;
      const prefixes = killSwitchMap[key] || [];
      
      for (const prefix of prefixes) {
        if (flagKey.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[PACK 428] Error checking kill switch:', error);
    // Fail safe - assume kill switch is not active
    return false;
  }
}

/**
 * Get user's experiment assignment (sticky)
 */
async function getExperimentAssignment(
  userId: string,
  experimentKey: string
): Promise<ExperimentAssignment | null> {
  try {
    const assignmentDoc = await db.collection('users')
      .doc(userId)
      .collection('experimentAssignments')
      .doc(experimentKey)
      .get();

    if (assignmentDoc.exists) {
      return assignmentDoc.data() as ExperimentAssignment;
    }

    return null;
  } catch (error) {
    console.error('[PACK 428] Error getting experiment assignment:', error);
    return null;
  }
}

/**
 * Assign a user to an experiment variant (sticky assignment)
 */
export async function assignExperimentVariant(
  experimentKey: string,
  userId: string,
  region: RegionCode,
  platform: Platform
): Promise<string | null> {
  try {
    // Check if already assigned
    const existingAssignment = await getExperimentAssignment(userId, experimentKey);
    if (existingAssignment) {
      return existingAssignment.variantKey;
    }

    // Get experiment config
    const experimentDoc = await db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experimentKey)
      .get();

    if (!experimentDoc.exists) {
      console.warn(`[PACK 428] Experiment ${experimentKey} not found`);
      return null;
    }

    const experiment = experimentDoc.data();

    // Check if user is eligible
    const userContext = await buildUserContext(userId, region, platform);
    
    if (!isRegionMatch(experiment.regions, region)) return null;
    if (!isPlatformMatch(experiment.platforms, platform)) return null;
    if (!isUserSegmentMatch(experiment.userSegments, userContext)) return null;

    // Get variants
    const variantsSnapshot = await db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experimentKey)
      .collection('variants')
      .where('enabled', '==', true)
      .get();

    if (variantsSnapshot.empty) {
      console.warn(`[PACK 428] No active variants for experiment ${experimentKey}`);
      return null;
    }

    // Assign variant based on weighted random selection (sticky via hash)
    const variants = variantsSnapshot.docs.map(doc => ({
      variantKey: doc.id,
      rolloutPercentage: doc.data().rolloutPercentage
    }));

    const variantKey = selectVariantByHash(userId, experimentKey, variants);

    // Store assignment
    const assignment: ExperimentAssignment = {
      userId,
      experimentKey,
      variantKey,
      assignedAt: admin.firestore.Timestamp.now(),
      firstExposureAt: null,
      exposureCount: 0,
      lastExposureAt: null
    };

    await db.collection('users')
      .doc(userId)
      .collection('experimentAssignments')
      .doc(experimentKey)
      .set(assignment);

    // Also store in retention profile (PACK 301 integration)
    await db.collection('retention')
      .doc('profiles')
      .collection('users')
      .doc(userId)
      .set({
        experiments: {
          [experimentKey]: variantKey
        }
      }, { merge: true });

    return variantKey;
  } catch (error) {
    console.error('[PACK 428] Error assigning experiment variant:', error);
    return null;
  }
}

/**
 * Select variant by consistent hash (sticky)
 */
function selectVariantByHash(
  userId: string,
  experimentKey: string,
  variants: Array<{ variantKey: string; rolloutPercentage: number }>
): string {
  const str = `${userId}:${experimentKey}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const bucket = Math.abs(hash % 100);
  
  // Cumulative distribution
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.rolloutPercentage;
    if (bucket < cumulative) {
      return variant.variantKey;
    }
  }
  
  // Fallback to first variant
  return variants[0].variantKey;
}

/**
 * Log experiment exposure for analytics
 */
export async function logExperimentExposure(
  experimentKey: string,
  variantKey: string,
  userId: string,
  region: RegionCode,
  platform: Platform,
  context?: Record<string, any>
): Promise<void> {
  try {
    const exposureId = `${userId}_${experimentKey}_${Date.now()}`;

    // Update assignment exposure count
    const assignmentRef = db.collection('users')
      .doc(userId)
      .collection('experimentAssignments')
      .doc(experimentKey);

    await assignmentRef.update({
      exposureCount: admin.firestore.FieldValue.increment(1),
      lastExposureAt: admin.firestore.Timestamp.now(),
      firstExposureAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log exposure event for analytics
    await db.collection('analytics')
      .doc('experiments')
      .collection('exposures')
      .doc(exposureId)
      .set({
        exposureId,
        userId,
        experimentKey,
        variantKey,
        timestamp: admin.firestore.Timestamp.now(),
        platform,
        region,
        context: context || {}
      });

  } catch (error) {
    console.error('[PACK 428] Error logging experiment exposure:', error);
    // Non-blocking error
  }
}

/**
 * Batch fetch feature flags (optimized for client)
 */
export async function batchGetFeatureFlags(
  flagKeys: string[],
  userContext: UserContext
): Promise<Record<string, boolean>> {
  try {
    const results: Record<string, boolean> = {};

    // Fetch all flags in parallel
    const flagPromises = flagKeys.map(async (key) => {
      const enabled = await isFeatureEnabled(key, userContext);
      return { key, enabled };
    });

    const resolvedFlags = await Promise.all(flagPromises);

    for (const { key, enabled } of resolvedFlags) {
      results[key] = enabled;
    }

    return results;
  } catch (error) {
    console.error('[PACK 428] Error batch fetching flags:', error);
    // Fail safe - all disabled
    return Object.fromEntries(flagKeys.map(key => [key, false]));
  }
}
