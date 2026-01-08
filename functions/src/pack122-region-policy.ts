/**
 * PACK 122 — Regional Policy Engine
 * Functions for resolving and enforcing regional policies
 * 
 * Integrates with:
 * - PACK 106: Multi-currency display (no pricing changes)
 * - PACK 108: NSFW region rules
 * - PACK 84/105: KYC and payout enforcement
 * - PACK 121: Ads category restrictions
 */

import { db, timestamp as Timestamp } from './init';
import { logger } from 'firebase-functions/v2';
import {
  RegionPolicyProfile,
  RegionDetectionResult,
  RegionVerification,
  PayoutVerificationCheck,
  SupportedLanguage,
  REGION_GROUPS,
} from './pack122-types';

// ============================================================================
// REGION POLICY RESOLUTION
// ============================================================================

/**
 * Get region policy for a specific country code
 * Resolution order: COUNTRY > REGION_GROUP > GLOBAL_DEFAULT
 */
export async function getRegionPolicy(regionCode: string): Promise<RegionPolicyProfile> {
  try {
    logger.info('[Pack122] Getting region policy', { regionCode });

    // 1. Try country-specific policy
    const countryDoc = await db
      .collection('region_policy_profiles')
      .doc(regionCode.toUpperCase())
      .get();

    if (countryDoc.exists && countryDoc.data()?.enabled) {
      logger.info('[Pack122] Found country-specific policy', { regionCode });
      return countryDoc.data() as RegionPolicyProfile;
    }

    // 2. Try region group policy
    const regionGroup = getRegionGroup(regionCode);
    if (regionGroup) {
      const regionDoc = await db
        .collection('region_policy_profiles')
        .doc(`REGION_${regionGroup}`)
        .get();

      if (regionDoc.exists && regionDoc.data()?.enabled) {
        logger.info('[Pack122] Found region group policy', { regionCode, regionGroup });
        return regionDoc.data() as RegionPolicyProfile;
      }
    }

    // 3. Fall back to global default
    const globalDoc = await db
      .collection('region_policy_profiles')
      .doc('GLOBAL_DEFAULT')
      .get();

    if (globalDoc.exists) {
      logger.info('[Pack122] Using global default policy', { regionCode });
      return globalDoc.data() as RegionPolicyProfile;
    }

    // 4. If no default exists, create restrictive fallback
    logger.warn('[Pack122] No policies found, using restrictive fallback', { regionCode });
    return createRestrictiveFallbackPolicy();

  } catch (error) {
    logger.error('[Pack122] Error getting region policy', { regionCode, error });
    return createRestrictiveFallbackPolicy();
  }
}

/**
 * Get region group for a country code
 */
function getRegionGroup(countryCode: string): keyof typeof REGION_GROUPS | null {
  const code = countryCode.toUpperCase();
  
  for (const [group, countries] of Object.entries(REGION_GROUPS)) {
    if ((countries as readonly string[]).includes(code)) {
      return group as keyof typeof REGION_GROUPS;
    }
  }
  
  return null;
}

/**
 * Create a restrictive fallback policy when no other policy exists
 */
function createRestrictiveFallbackPolicy(): RegionPolicyProfile {
  return {
    regionCode: 'UNKNOWN',
    regionName: 'Unknown Region',
    regionGroup: 'OTHER',
    
    guardrails: {
      NSFW_ALLOWED: false,
      NSFW_EXPLICIT_ALLOWED: false,
      NSFW_MONETIZATION_ALLOWED: false,
      POLITICAL_CONTENT_RESTRICTED: true,
    },
    
    ageRules: {
      minimumAge: 18,
      ageVerificationRequired: true,
      ageVerificationDepth: 'ENHANCED',
      nsfwMinimumAge: 21,
    },
    
    adsRestrictions: ['ADULT', 'GAMBLING', 'ALCOHOL', 'CANNABIS'],
    
    payoutAvailability: false,
    payoutPSPs: [],
    
    dataRetentionRules: {
      maxRetentionDays: 365,
      rightToErasure: true,
      dataLocalization: false,
      thirdPartySharing: false,
    },
    
    messagingRestrictions: {
      blockCrossBorderDMs: false,
      contentModerationLevel: 'STRICT',
      autoTranslateEnabled: true,
      harassmentDetectionLevel: 'AGGRESSIVE',
    },
    
    userDeletionTimeline: 30,
    
    complianceNotes: 'Restrictive fallback policy - manual review required',
    lastReviewedAt: Timestamp.now(),
    effectiveFrom: Timestamp.now(),
    
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    enabled: true,
  };
}

// ============================================================================
// USER REGION DETECTION & VERIFICATION
// ============================================================================

/**
 * Detect user's region from multiple sources
 */
export async function detectUserRegion(userId: string): Promise<RegionVerification> {
  try {
    logger.info('[Pack122] Detecting user region', { userId });

    const detections: RegionDetectionResult[] = [];

    // 1. Get region from user profile
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData?.profile?.country) {
      detections.push({
        country: userData.profile.country,
        detectionMethod: 'PROFILE',
        confidence: 0.9,
        detectedAt: Timestamp.now(),
      });
    }

    // 2. Get region from phone number (if available)
    if (userData?.profile?.phoneCountry) {
      detections.push({
        country: userData.profile.phoneCountry,
        detectionMethod: 'PHONE',
        confidence: 0.8,
        detectedAt: Timestamp.now(),
      });
    }

    // 3. Get region from payment method (if available)
    if (userData?.paymentMethodCountry) {
      detections.push({
        country: userData.paymentMethodCountry,
        detectionMethod: 'PAYMENT',
        confidence: 0.85,
        detectedAt: Timestamp.now(),
      });
    }

    // 4. Get region from last known IP (if available)
    if (userData?.lastKnownCountry) {
      detections.push({
        country: userData.lastKnownCountry,
        detectionMethod: 'IP',
        confidence: 0.6,
        detectedAt: Timestamp.now(),
      });
    }

    // Determine consensus
    const verification = determineConsensusRegion(detections);
    
    // Store verification result
    await db.collection('region_verifications').doc(userId).set(verification);

    const fullVerification: RegionVerification = {
      userId,
      ...verification,
    };

    logger.info('[Pack122] Region detection complete', {
      userId,
      consensusRegion: fullVerification.consensusRegion,
      confidence: fullVerification.consensusConfidence,
    });

    return fullVerification;

  } catch (error) {
    logger.error('[Pack122] Error detecting user region', { userId, error });
    
    // Return unknown region verification
    return {
      userId,
      detections: [],
      consensusRegion: 'UNKNOWN',
      consensusConfidence: 0,
      inconsistencies: ['Detection failed'],
      verified: false,
      verifiedAt: Timestamp.now(),
    };
  }
}

/**
 * Determine consensus region from multiple detections
 */
function determineConsensusRegion(detections: RegionDetectionResult[]): Omit<RegionVerification, 'userId'> {
  if (detections.length === 0) {
    return {
      detections: [],
      consensusRegion: 'UNKNOWN',
      consensusConfidence: 0,
      inconsistencies: ['No detections available'],
      verified: false,
      verifiedAt: Timestamp.now(),
    };
  }

  // Count occurrences of each country
  const countryScores = new Map<string, number>();
  
  for (const detection of detections) {
    const current = countryScores.get(detection.country) || 0;
    countryScores.set(detection.country, current + detection.confidence);
  }

  // Find country with highest score
  let consensusRegion = 'UNKNOWN';
  let maxScore = 0;
  
  countryScores.forEach((score, country) => {
    if (score > maxScore) {
      maxScore = score;
      consensusRegion = country;
    }
  });

  // Check for inconsistencies
  const uniqueCountries = Array.from(countryScores.keys());
  const inconsistencies: string[] = [];
  
  if (uniqueCountries.length > 1) {
    inconsistencies.push(`Multiple countries detected: ${uniqueCountries.join(', ')}`);
  }

  // Calculate consensus confidence
  const totalConfidence = detections.reduce((sum, d) => sum + d.confidence, 0);
  const consensusConfidence = totalConfidence > 0 ? maxScore / totalConfidence : 0;

  // Verification requires high confidence and no major inconsistencies
  const verified = consensusConfidence >= 0.7 && inconsistencies.length === 0;

  return {
    detections,
    consensusRegion,
    consensusConfidence,
    inconsistencies,
    verified,
    verifiedAt: Timestamp.now(),
  };
}

// ============================================================================
// POLICY ENFORCEMENT
// ============================================================================

/**
 * Apply regional restrictions to a user
 * This function checks and applies all applicable restrictions
 */
export async function applyRegionRestrictionsToUser(userId: string): Promise<{
  success: boolean;
  restrictionsApplied: string[];
  errors: string[];
}> {
  try {
    logger.info('[Pack122] Applying region restrictions', { userId });

    const restrictionsApplied: string[] = [];
    const errors: string[] = [];

    // 1. Detect user region
    const verification = await detectUserRegion(userId);
    
    if (!verification.verified) {
      errors.push('Region verification failed');
      return { success: false, restrictionsApplied, errors };
    }

    // 2. Get region policy
    const policy = await getRegionPolicy(verification.consensusRegion);

    // 3. Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      errors.push('User not found');
      return { success: false, restrictionsApplied, errors };
    }

    const updates: any = {
      'restrictions.regionCode': policy.regionCode,
      'restrictions.policyAppliedAt': Timestamp.now(),
    };

    // 4. Apply NSFW restrictions
    if (!policy.guardrails.NSFW_ALLOWED) {
      updates['restrictions.nsfwBlocked'] = true;
      restrictionsApplied.push('NSFW_BLOCKED');
    }

    if (!policy.guardrails.NSFW_EXPLICIT_ALLOWED) {
      updates['restrictions.explicitNsfwBlocked'] = true;
      restrictionsApplied.push('EXPLICIT_NSFW_BLOCKED');
    }

    if (!policy.guardrails.NSFW_MONETIZATION_ALLOWED) {
      updates['restrictions.nsfwMonetizationBlocked'] = true;
      restrictionsApplied.push('NSFW_MONETIZATION_BLOCKED');
    }

    // 5. Apply payout restrictions
    if (!policy.payoutAvailability) {
      updates['restrictions.payoutsBlocked'] = true;
      restrictionsApplied.push('PAYOUTS_BLOCKED');
    }

    // 6. Apply ad restrictions
    if (policy.adsRestrictions.length > 0) {
      updates['restrictions.blockedAdCategories'] = policy.adsRestrictions;
      restrictionsApplied.push(`ADS_RESTRICTED:${policy.adsRestrictions.length}`);
    }

    // 7. Apply age verification requirements
    if (policy.ageRules.ageVerificationRequired) {
      updates['restrictions.ageVerificationRequired'] = true;
      updates['restrictions.ageVerificationDepth'] = policy.ageRules.ageVerificationDepth;
      restrictionsApplied.push('AGE_VERIFICATION_REQUIRED');
    }

    // 8. Apply messaging restrictions
    if (policy.messagingRestrictions.blockCrossBorderDMs) {
      updates['restrictions.crossBorderDMsBlocked'] = true;
      restrictionsApplied.push('CROSS_BORDER_DMS_BLOCKED');
    }

    // 9. Update user document
    await userRef.update(updates);

    logger.info('[Pack122] Region restrictions applied', { 
      userId, 
      regionCode: policy.regionCode,
      restrictionsCount: restrictionsApplied.length,
    });

    return {
      success: true,
      restrictionsApplied,
      errors,
    };

  } catch (error) {
    logger.error('[Pack122] Error applying region restrictions', { userId, error });
    return {
      success: false,
      restrictionsApplied: [],
      errors: [(error as Error).message],
    };
  }
}

/**
 * Check if user can access a specific feature in their region
 */
export async function canUserAccessFeature(
  userId: string,
  feature: 'NSFW_CONTENT' | 'NSFW_MONETIZATION' | 'PAYOUTS' | 'CROSS_BORDER_DMS' | 'SPECIFIC_AD_CATEGORY'
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user's region
    const verificationDoc = await db.collection('region_verifications').doc(userId).get();
    
    if (!verificationDoc.exists) {
      // Try to detect region
      const verification = await detectUserRegion(userId);
      if (!verification.verified) {
        return { allowed: false, reason: 'REGION_UNVERIFIED' };
      }
    }

    const verification = verificationDoc.data() as RegionVerification;
    const policy = await getRegionPolicy(verification.consensusRegion);

    // Check feature-specific restrictions
    switch (feature) {
      case 'NSFW_CONTENT':
        if (!policy.guardrails.NSFW_ALLOWED) {
          return { allowed: false, reason: 'NSFW_NOT_ALLOWED_IN_REGION' };
        }
        break;

      case 'NSFW_MONETIZATION':
        if (!policy.guardrails.NSFW_MONETIZATION_ALLOWED) {
          return { allowed: false, reason: 'NSFW_MONETIZATION_NOT_ALLOWED_IN_REGION' };
        }
        break;

      case 'PAYOUTS':
        if (!policy.payoutAvailability) {
          return { allowed: false, reason: 'PAYOUTS_NOT_AVAILABLE_IN_REGION' };
        }
        break;

      case 'CROSS_BORDER_DMS':
        if (policy.messagingRestrictions.blockCrossBorderDMs) {
          return { allowed: false, reason: 'CROSS_BORDER_DMS_BLOCKED_IN_REGION' };
        }
        break;

      default:
        return { allowed: true };
    }

    return { allowed: true };

  } catch (error) {
    logger.error('[Pack122] Error checking feature access', { userId, feature, error });
    return { allowed: false, reason: 'ERROR_CHECKING_ACCESS' };
  }
}

// ============================================================================
// PAYOUT VERIFICATION (PACK 84/105 Integration)
// ============================================================================

/**
 * Verify payout eligibility with multi-factor location check
 * Prevents VPN/location spoofing for payout circumvention
 */
export async function verifyPayoutEligibility(userId: string): Promise<PayoutVerificationCheck> {
  try {
    logger.info('[Pack122] Verifying payout eligibility', { userId });

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new Error('User not found');
    }

    // Get KYC verification data (PACK 84)
    const kycDoc = await db.collection('kyc_verifications').doc(userId).get();
    const kycData = kycDoc.data();

    // Build verification check
    const check: PayoutVerificationCheck = {
      userId,
      
      // Document verification
      documentCountry: kycData?.document?.country || 'UNKNOWN',
      documentType: kycData?.document?.type || 'ID_CARD',
      documentVerified: kycData?.status === 'VERIFIED' || false,
      
      // Payment method verification
      paymentMethodCountry: userData.paymentMethodCountry || 'UNKNOWN',
      paymentMethodType: userData.paymentMethodType || 'BANK_ACCOUNT',
      paymentMethodVerified: userData.paymentMethodVerified || false,
      
      // Location verification
      ipCountry: userData.lastKnownCountry || 'UNKNOWN',
      gpsCountry: userData.gpsCountry,
      phoneCountry: userData.profile?.phoneCountry,
      
      // Consistency check
      allConsistent: false,
      inconsistencies: [],
      
      // Result
      verified: false,
    };

    // Check consistency
    const countries = [
      check.documentCountry,
      check.paymentMethodCountry,
      check.ipCountry,
      check.gpsCountry,
      check.phoneCountry,
    ].filter(c => c && c !== 'UNKNOWN');

    const uniqueCountries = Array.from(new Set(countries));
    
    if (uniqueCountries.length === 0) {
      check.inconsistencies.push('No country information available');
    } else if (uniqueCountries.length === 1) {
      check.allConsistent = true;
    } else {
      check.inconsistencies.push(`Multiple countries detected: ${uniqueCountries.join(', ')}`);
      
      // Flag potential VPN usage
      if (check.documentCountry !== check.ipCountry && check.documentCountry !== 'UNKNOWN' && check.ipCountry !== 'UNKNOWN') {
        check.inconsistencies.push('Document country does not match IP country');
      }
    }

    // Determine verification status
    check.verified = 
      check.documentVerified &&
      check.paymentMethodVerified &&
      check.allConsistent &&
      check.inconsistencies.length === 0;

    if (check.verified) {
      check.verifiedAt = Timestamp.now();
      // Verification expires after 90 days
      check.expiresAt = Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000);
    } else {
      check.failureReason = check.inconsistencies.join('; ');
    }

    // Store verification result
    await db.collection('payout_verifications').doc(userId).set(check);

    logger.info('[Pack122] Payout eligibility verification complete', {
      userId,
      verified: check.verified,
      inconsistencies: check.inconsistencies.length,
    });

    return check;

  } catch (error) {
    logger.error('[Pack122] Error verifying payout eligibility', { userId, error });
    throw error;
  }
}

// ============================================================================
// LANGUAGE PREFERENCE MANAGEMENT
// ============================================================================

/**
 * Get or auto-detect user's language preference
 */
export async function getUserLanguagePreference(userId: string): Promise<SupportedLanguage> {
  try {
    const prefDoc = await db
      .collection('users')
      .doc(userId)
      .collection('preferences')
      .doc('language')
      .get();

    if (prefDoc.exists) {
      return prefDoc.data()?.language || 'en';
    }

    // Auto-detect from region
    const verification = await detectUserRegion(userId);
    const language = getDefaultLanguageForRegion(verification.consensusRegion);

    // Store auto-detected preference
    await db
      .collection('users')
      .doc(userId)
      .collection('preferences')
      .doc('language')
      .set({
        userId,
        language,
        autoDetected: true,
        setAt: Timestamp.now(),
      });

    return language;

  } catch (error) {
    logger.error('[Pack122] Error getting language preference', { userId, error });
    return 'en'; // Fallback to English
  }
}

/**
 * Get default language for a region
 */
function getDefaultLanguageForRegion(regionCode: string): SupportedLanguage {
  const languageMap: Record<string, SupportedLanguage> = {
    US: 'en', GB: 'en', AU: 'en', NZ: 'en',
    ES: 'es', MX: 'es', CL: 'es', CO: 'es',
    BR: 'pt', PT: 'pt',
    FR: 'fr', BE: 'fr',
    DE: 'de', AT: 'de', CH: 'de',
    IT: 'it',
    PL: 'pl',
    RU: 'ru', UA: 'uk',
    TR: 'tr',
    JP: 'ja',
    KR: 'ko',
    CN: 'zh', TW: 'zh',
    TH: 'th',
    ID: 'id',
    VN: 'vi',
    IN: 'hi',
    SA: 'ar', AE: 'ar',
    NL: 'nl',
    SE: 'sv',
    NO: 'no',
    DK: 'da',
    FI: 'fi',
    GR: 'el',
    IL: 'he',
    IR: 'fa',
    RO: 'ro',
    HU: 'hu',
    CZ: 'cs',
    BG: 'bg',
  };

  return languageMap[regionCode.toUpperCase()] || 'en';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  RegionPolicyProfile,
  RegionVerification,
  PayoutVerificationCheck,
} from './pack122-types';