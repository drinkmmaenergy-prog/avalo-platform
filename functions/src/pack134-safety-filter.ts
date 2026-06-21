import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 134 — Safety Avoidance Filter
 * 
 * Integrates with PACK 126 Safety Framework
 * Prevents exploitation and unsafe recommendations
 * 
 * Anti-Exploitation Rules:
 * - No suggesting high-risk earners to vulnerable users
 * - No NSFW to minors or restricted regions
 * - No intense personalities to lonely users
 * - Trauma-aware filtering
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  SafetyFilterContext,
  ExploitationCheckResult,
  ExploitationConcern,
} from './types/pack134-types';
import { functions } from './runtime';

// ============================================================================
// SAFETY FILTER CORE
// ============================================================================

/**
 * Check if content is safe to recommend to user
 * Integrates with PACK 126 Safety Framework
 * 
 * @param userId - User receiving recommendation
 * @param earnerId - Content earner
 * @param contentId - Content ID
 * @returns Whether content is safe to show
 */
export async function checkSafetyFilters(
  userId: string,
  earnerId: string,
  contentId: string
): Promise<boolean> {
  // 1. Get safety context for user
  const context = await getSafetyFilterContext(userId);
  
  // 2. Check if earner is blocked
  if (context.blockedCreators.includes(earnerId)) {
    logger.info('[Pack134] Filtered: Creator blocked', { userId, earnerId });
    return false;
  }
  
  // 3. Check content rating compatibility
  const contentRating = await getContentRating(contentId);
  if (!context.contentRatingAllowed.includes(contentRating)) {
    logger.info('[Pack134] Filtered: Content rating not allowed', {
      userId,
      contentId,
      rating: contentRating,
    });
    return false;
  }
  
  // 4. Check for exploitation risks
  const exploitationCheck = await checkExploitationRisk(userId, earnerId, context);
  if (!exploitationCheck.allowed) {
    logger.warn('[Pack134] Filtered: Exploitation risk detected', {
      userId,
      earnerId,
      concerns: exploitationCheck.concerns,
    });
    return false;
  }
  
  // 5. Check regional restrictions (PACK 122 integration)
  const regionalAllowed = await checkRegionalRestrictions(userId, contentId);
  if (!regionalAllowed) {
    logger.info('[Pack134] Filtered: Regional restrictions', {
      userId,
      contentId,
    });
    return false;
  }
  
  // 6. Check user consent status (PACK 126 integration)
  const consentValid = await checkConsentStatus(userId, earnerId);
  if (!consentValid) {
    logger.info('[Pack134] Filtered: No active consent', {
      userId,
      earnerId,
    });
    return false;
  }
  
  return true; // All checks passed
}

// ============================================================================
// SAFETY CONTEXT
// ============================================================================

/**
 * Get safety filter context for user
 */
async function getSafetyFilterContext(userId: string): Promise<SafetyFilterContext> {
  // Get user profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Get user's safety preferences
  const safetyPrefsDoc = await db.collection('user_safety_preferences').doc(userId).get();
  const safetyPrefs = safetyPrefsDoc.data();
  
  // Get blocked earners
  const blockedSnapshot = await db.collection('user_blocks')
    .where('userId', '==', userId)
    .get();
  const blockedCreators = blockedSnapshot.docs.map(doc => doc.data().blockedUserId);
  
  // Determine allowed content ratings
  const userAge = userData.age || 18;
  const userRegion = userData.profile?.country || 'US';
  
  let contentRatingAllowed: string[];
  if (userAge < 18) {
    contentRatingAllowed = ['SFW']; // Minors: SFW only
  } else {
    // Check regional NSFW policy
    const regionPolicy = await db.collection('region_policy_profiles').doc(userRegion).get();
    const policyData = regionPolicy.data();
    
    if (policyData?.guardrails?.NSFW_ALLOWED) {
      contentRatingAllowed = ['SFW', 'SENSITIVE', 'NSFW_SOFT'];
      
      if (policyData?.guardrails?.NSFW_EXPLICIT_ALLOWED) {
        contentRatingAllowed.push('NSFW_STRONG');
      }
    } else {
      contentRatingAllowed = ['SFW', 'SENSITIVE'];
    }
  }
  
  return {
    userId,
    userAge,
    userRegion,
    contentRatingAllowed,
    blockedCreators,
    mutedCategories: safetyPrefs?.mutedCategories || [],
    sensitiveContentPref: safetyPrefs?.sensitiveContentPref || 'BLUR',
    traumaAwareMode: safetyPrefs?.traumaAwareMode || false,
  };
}

/**
 * Get content rating
 */
async function getContentRating(contentId: string): Promise<string> {
  const contentDoc = await db.collection('content_category_profiles').doc(contentId).get();
  const categoryData = contentDoc.data();
  
  // Check NSFW classification (PACK 108 integration)
  const nsfwDoc = await db.collection('nsfw_classifications').doc(contentId).get();
  const nsfwData = nsfwDoc.data();
  
  if (nsfwData?.classification === 'NSFW_STRONG') {
    return 'NSFW_STRONG';
  }
  
  if (nsfwData?.classification === 'NSFW_SOFT') {
    return 'NSFW_SOFT';
  }
  
  if (nsfwData?.classification === 'SENSITIVE') {
    return 'SENSITIVE';
  }
  
  return 'SFW'; // Default safe for work
}

// ============================================================================
// EXPLOITATION PREVENTION
// ============================================================================

/**
 * Check for exploitation risks
 * Prevents suggesting risky earners to vulnerable users
 */
async function checkExploitationRisk(
  userId: string,
  earnerId: string,
  context: SafetyFilterContext
): Promise<ExploitationCheckResult> {
  const concerns: ExploitationConcern[] = [];
  
  // Get earner's trust profile (PACK 85 integration)
  const trustDoc = await db.collection('user_trust_profile').doc(earnerId).get();
  const trustData = trustDoc.data();
  
  // Get user's vulnerability indicators
  const vulnerabilityDoc = await db.collection('user_vulnerability_indicators').doc(userId).get();
  const vulnerabilityData = vulnerabilityDoc.data();
  
  // Check 1: High-risk earner to vulnerable user
  if (trustData?.riskScore && trustData.riskScore > 70) {
    if (vulnerabilityData?.isVulnerable) {
      concerns.push('HIGH_RISK_TO_VULNERABLE');
    }
  }
  
  // Check 2: NSFW content to minor
  if (context.userAge && context.userAge < 18) {
    const earnerProfile = await db.collection('users').doc(earnerId).get();
    const earnerData = earnerProfile.data();
    
    if (earnerData?.nsfwAffinity === 'STRONG') {
      concerns.push('NSFW_TO_MINOR');
    }
  }
  
  // Check 3: Intense personality to lonely user
  if (vulnerabilityData?.lonelinessIndicator && vulnerabilityData.lonelinessIndicator > 0.7) {
    const earnerBehavior = await db.collection('earner_behavior_profile').doc(earnerId).get();
    const behaviorData = earnerBehavior.data();
    
    if (behaviorData?.interactionIntensity === 'HIGH') {
      concerns.push('INTENSE_PERSONALITY_TO_LONELY');
    }
  }
  
  // Check 4: Trauma triggers (if trauma-aware mode enabled)
  if (context.traumaAwareMode) {
    const traumaCheck = await checkTraumaTriggers(userId, earnerId);
    if (traumaCheck) {
      concerns.push('TRAUMA_TRIGGER');
    }
  }
  
  // Determine if recommendation is allowed
  const allowed = concerns.length === 0;
  const autoBlock = concerns.some(c => 
    c === 'NSFW_TO_MINOR' || c === 'TRAUMA_TRIGGER'
  );
  
  return {
    allowed,
    concerns,
    requiresWarning: !allowed && !autoBlock,
    autoBlock,
  };
}

/**
 * Check for trauma triggers
 */
async function checkTraumaTriggers(
  userId: string,
  earnerId: string
): Promise<boolean> {
  // Get user's trauma indicators
  const traumaDoc = await db.collection('user_trauma_indicators').doc(userId).get();
  const traumaData = traumaDoc.data();
  
  if (!traumaData || !traumaData.triggers) {
    return false; // No known triggers
  }
  
  // Get earner's content themes
  const earnerDoc = await db.collection('earner_content_themes').doc(earnerId).get();
  const earnerData = earnerDoc.data();
  
  if (!earnerData || !earnerData.themes) {
    return false; // No theme data
  }
  
  // Check for overlap
  const triggers = new Set(traumaData.triggers);
  const themes = earnerData.themes;
  
  for (const theme of themes) {
    if (triggers.has(theme)) {
      logger.warn('[Pack134] Trauma trigger detected', {
        userId,
        earnerId,
        trigger: theme,
      });
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// REGIONAL & CONSENT CHECKS
// ============================================================================

/**
 * Check regional restrictions (PACK 122 integration)
 */
async function checkRegionalRestrictions(
  userId: string,
  contentId: string
): Promise<boolean> {
  // Get user region
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const userRegion = userData?.profile?.country || 'US';
  
  // Get content restrictions
  const contentDoc = await db.collection('content_regional_restrictions').doc(contentId).get();
  const restrictionData = contentDoc.data();
  
  if (!restrictionData) {
    return true; // No restrictions
  }
  
  // Check if content is blocked in user's region
  if (restrictionData.blockedRegions?.includes(userRegion)) {
    return false;
  }
  
  // Check if content is only allowed in specific regions
  if (restrictionData.allowedRegions && 
      restrictionData.allowedRegions.length > 0 &&
      !restrictionData.allowedRegions.includes(userRegion)) {
    return false;
  }
  
  return true;
}

/**
 * Check consent status (PACK 126 integration)
 */
async function checkConsentStatus(
  userId: string,
  earnerId: string
): Promise<boolean> {
  // Check if user has revoked consent with earner
  const consentDoc = await db.collection('user_consent_records')
    .where('userId', '==', userId)
    .where('counterpartId', '==', earnerId)
    .limit(1)
    .get();
  
  if (consentDoc.empty) {
    return true; // No consent record = OK for discovery
  }
  
  const consentData = consentDoc.docs[0].data();
  
  // Don't recommend if consent is REVOKED or PAUSED
  if (consentData.state === 'REVOKED' || consentData.state === 'PAUSED') {
    return false;
  }
  
  return true;
}

// ============================================================================
// HARASSMENT SHIELD CHECK
// ============================================================================

/**
 * Check if earner has active harassment shields against them
 * 
 * @param earnerId - Creator to check
 * @returns Whether earner has harassment issues
 */
export async function hasHarassmentIssues(earnerId: string): Promise<boolean> {
  // Check harassment shields (PACK 126 integration)
  const shieldsSnapshot = await db.collection('harassment_shields')
    .where('counterpartId', '==', earnerId)
    .where('level', 'in', ['HIGH', 'CRITICAL'])
    .limit(1)
    .get();
  
  return !shieldsSnapshot.empty;
}

// ============================================================================
// CONTENT SENSITIVITY CHECK
// ============================================================================

/**
 * Check if content should be blurred or hidden
 * 
 * @param userId - User viewing content
 * @param contentId - Content to check
 * @returns Sensitivity action
 */
export async function checkContentSensitivity(
  userId: string,
  contentId: string
): Promise<'SHOW' | 'BLUR' | 'HIDE'> {
  const context = await getSafetyFilterContext(userId);
  const rating = await getContentRating(contentId);
  
  // Always hide if not in allowed ratings
  if (!context.contentRatingAllowed.includes(rating)) {
    return 'HIDE';
  }
  
  // Apply user preference for sensitive content
  if (rating === 'SENSITIVE' || rating.startsWith('NSFW')) {
    if (context.sensitiveContentPref === 'HIDE') {
      return 'HIDE';
    }
    if (context.sensitiveContentPref === 'BLUR') {
      return 'BLUR';
    }
  }
  
  return 'SHOW';
}

// ============================================================================
// BATCH SAFETY FILTERING
// ============================================================================

/**
 * Filter array of content IDs for safety
 * 
 * @param userId - User receiving recommendations
 * @param contentItems - Array of content items
 * @returns Filtered array
 */
export async function batchFilterForSafety(
  userId: string,
  contentItems: Array<{ contentId: string; earnerId: string }>
): Promise<Array<{ contentId: string; earnerId: string }>> {
  const safeItems: Array<{ contentId: string; earnerId: string }> = [];
  
  // Process in batches to avoid overwhelming Firestore
  const batchSize = 10;
  for (let i = 0; i < contentItems.length; i += batchSize) {
    const batch = contentItems.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(item => checkSafetyFilters(userId, item.earnerId, item.contentId))
    );
    
    batch.forEach((item, index) => {
      if (batchResults[index]) {
        safeItems.push(item);
      }
    });
  }
  
  logger.info('[Pack134] Batch safety filter complete', {
    userId,
    totalItems: contentItems.length,
    safeItems: safeItems.length,
    filtered: contentItems.length - safeItems.length,
  });
  
  return safeItems;
}

























