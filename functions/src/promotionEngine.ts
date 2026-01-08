/**
 * PACK 61: Promotion Engine - Core filtering and eligibility logic
 * Determines which promotions can be shown to a viewer
 */

import { ViewerContext, PromotionCandidate } from './types/promotion';

/**
 * Filter eligible promotions based on viewer context and campaign rules
 * 
 * Filtering rules:
 * 1. Status must be ACTIVE
 * 2. Current time must be within startAt and endAt
 * 3. Budget not exceeded (if budget > 0)
 * 4. Marketing consent required if campaign requires it
 * 5. NSFW campaigns require age verification and 18+
 * 6. Targeting rules (age, country, gender) must match
 */
export function filterEligiblePromotions(
  viewer: ViewerContext,
  candidates: PromotionCandidate[],
  now: Date
): PromotionCandidate[] {
  return candidates.filter((candidate) => {
    // Rule 1: Status must be ACTIVE
    if (candidate.status !== 'ACTIVE') {
      return false;
    }

    // Rule 2: Current time must be within campaign schedule
    const nowTime = now.getTime();
    const startTime = candidate.startAt.getTime();
    const endTime = candidate.endAt.getTime();
    
    if (nowTime < startTime || nowTime > endTime) {
      return false;
    }

    // Rule 3: Budget check (if budget > 0)
    if (candidate.budgetTokensTotal > 0) {
      if (candidate.budgetTokensSpent >= candidate.budgetTokensTotal) {
        return false;
      }
    }

    // Rule 4: Marketing consent check
    if (candidate.requiresMarketingConsent && !viewer.marketingAllowed) {
      return false;
    }

    // Rule 5: NSFW campaigns require age verification and 18+
    if (candidate.nsfw) {
      if (!viewer.ageVerified) {
        return false;
      }
      if (!viewer.age || viewer.age < 18) {
        return false;
      }
    }

    // Rule 6: Targeting rules
    const targeting = candidate.targeting;

    // Age targeting
    if (targeting.minAge !== undefined && targeting.minAge !== null) {
      if (!viewer.age || viewer.age < targeting.minAge) {
        return false;
      }
    }
    if (targeting.maxAge !== undefined && targeting.maxAge !== null) {
      if (!viewer.age || viewer.age > targeting.maxAge) {
        return false;
      }
    }

    // Country targeting
    if (targeting.countries && targeting.countries.length > 0) {
      if (!viewer.country || !targeting.countries.includes(viewer.country)) {
        return false;
      }
    }

    // Gender targeting
    if (targeting.genders && targeting.genders.length > 0) {
      if (!viewer.gender || !targeting.genders.includes(viewer.gender)) {
        return false;
      }
    }

    // Rule 7: Impression limits (if set)
    if (candidate.maxTotalImpressions !== undefined && 
        candidate.maxTotalImpressions !== null &&
        candidate.maxTotalImpressions > 0) {
      if (candidate.impressions >= candidate.maxTotalImpressions) {
        return false;
      }
    }

    // All checks passed
    return true;
  });
}

/**
 * Simple weighted random selection from eligible promotions
 * Returns up to maxCount items
 */
export function selectPromotions(
  eligible: PromotionCandidate[],
  maxCount: number
): PromotionCandidate[] {
  if (eligible.length === 0) {
    return [];
  }

  // Shuffle using Fisher-Yates algorithm
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Return up to maxCount
  return shuffled.slice(0, Math.min(maxCount, shuffled.length));
}

/**
 * Check if a campaign owner (creator) is eligible to run promotions
 * Must check: age, enforcement status, creator earning capability
 */
export interface CampaignOwnerEligibility {
  eligible: boolean;
  reason?: string;
}

export function checkCampaignOwnerEligibility(
  ownerAge: number | null | undefined,
  accountStatus: string | null | undefined,
  earningStatus: string | null | undefined,
  isCreator: boolean
): CampaignOwnerEligibility {
  // Must be 18+
  if (!ownerAge || ownerAge < 18) {
    return {
      eligible: false,
      reason: 'Owner must be 18 or older'
    };
  }

  // Must not be suspended or banned
  if (accountStatus === 'SUSPENDED' || accountStatus === 'BANNED') {
    return {
      eligible: false,
      reason: 'Account is suspended or banned'
    };
  }

  // Must be able to earn (creator status)
  if (earningStatus === 'EARN_DISABLED') {
    return {
      eligible: false,
      reason: 'Earning is disabled for this account'
    };
  }

  // Must be a creator
  if (!isCreator) {
    return {
      eligible: false,
      reason: 'Only creators can run promotion campaigns'
    };
  }

  return { eligible: true };
}