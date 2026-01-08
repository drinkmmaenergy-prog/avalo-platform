/**
 * PACK 145 - Targeting Validator
 * Ethical Targeting Only
 * 
 * FORBIDDEN:
 * - Beauty/attractiveness targeting
 * - Body type targeting
 * - Vulnerability/emotional state targeting
 * - High-spender targeting
 * - Gender-based sexual expectations
 * 
 * ALLOWED:
 * - Interests (photography, fitness, etc.)
 * - Purchase intent (digital products, courses)
 * - Engagement level (low, medium, high)
 * - Location (region-level only)
 * - Language
 */

import {
  FORBIDDEN_TARGETING_SIGNALS,
  ALLOWED_INTERESTS,
  ALLOWED_PURCHASE_INTENT,
  MAX_TARGETING_INTERESTS,
  AdTargeting,
  TargetingValidationResult,
} from './pack145-types';

export class AdTargetingValidator {
  static validate(targeting: AdTargeting): TargetingValidationResult {
    const violations: string[] = [];
    const forbiddenSignals: string[] = [];

    if (targeting.interests && targeting.interests.length > 0) {
      if (targeting.interests.length > MAX_TARGETING_INTERESTS) {
        violations.push(`Too many interests (max ${MAX_TARGETING_INTERESTS})`);
      }

      for (const interest of targeting.interests) {
        const interestLower = interest.toLowerCase();
        
        for (const forbidden of FORBIDDEN_TARGETING_SIGNALS) {
          if (interestLower.includes(forbidden)) {
            violations.push(`Forbidden targeting signal in interests: ${forbidden}`);
            forbiddenSignals.push(forbidden);
          }
        }

        const isForbidden = this.checkForbiddenInterest(interestLower);
        if (isForbidden) {
          violations.push(`Interest "${interest}" is not allowed for ethical targeting`);
        }
      }
    }

    if (targeting.purchaseIntent && targeting.purchaseIntent.length > 0) {
      for (const intent of targeting.purchaseIntent) {
        const intentLower = intent.toLowerCase();
        
        for (const forbidden of FORBIDDEN_TARGETING_SIGNALS) {
          if (intentLower.includes(forbidden)) {
            violations.push(`Forbidden targeting signal in purchase intent: ${forbidden}`);
            forbiddenSignals.push(forbidden);
          }
        }

        if (!ALLOWED_PURCHASE_INTENT.includes(intentLower)) {
          violations.push(`Purchase intent "${intent}" is not in allowed list`);
        }
      }
    }

    if (targeting.ageRange) {
      if (targeting.ageRange.min < 18) {
        violations.push('Cannot target users under 18');
      }
      if (targeting.ageRange.max - targeting.ageRange.min < 5) {
        violations.push('Age range too narrow (minimum 5 years)');
      }
    }

    const exploitativePatterns = [
      /lonely|vulnerable|desperate|heartbroken/i,
      /high.*spend|wealthy|rich/i,
      /attractive|beautiful|sexy|hot/i,
      /body.*type|weight|appearance/i,
      /emotional.*state|mental.*health/i,
    ];

    const allTargeting = JSON.stringify(targeting).toLowerCase();
    for (const pattern of exploitativePatterns) {
      if (pattern.test(allTargeting)) {
        violations.push(`Exploitative targeting pattern detected: ${pattern.source}`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      forbiddenSignals,
    };
  }

  static checkForbiddenInterest(interest: string): boolean {
    const forbiddenInterestPatterns = [
      /dating|romance|relationship|hookup/i,
      /sexy|hot|attractive|beautiful|cute/i,
      /sugar.*daddy|sugar.*baby|escort/i,
      /adult|nsfw|18\+|erotic/i,
      /lonely|companionship|attention/i,
      /body.*image|weight.*loss|diet.*extreme/i,
      /vulnerability|desperate|heartbreak/i,
    ];

    for (const pattern of forbiddenInterestPatterns) {
      if (pattern.test(interest)) {
        return true;
      }
    }

    return false;
  }

  static validateRegions(regions: string[]): TargetingValidationResult {
    const violations: string[] = [];
    const forbiddenSignals: string[] = [];

    if (regions.length > 50) {
      violations.push('Too many regions specified (max 50)');
    }

    for (const region of regions) {
      if (region.length < 2) {
        violations.push(`Invalid region code: ${region}`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      forbiddenSignals,
    };
  }

  static sanitizeTargeting(targeting: AdTargeting): AdTargeting {
    const sanitized: AdTargeting = {
      interests: [],
      purchaseIntent: [],
    };

    if (targeting.interests) {
      sanitized.interests = targeting.interests
        .filter(interest => {
          const interestLower = interest.toLowerCase();
          return !this.checkForbiddenInterest(interestLower);
        })
        .slice(0, MAX_TARGETING_INTERESTS);
    }

    if (targeting.purchaseIntent) {
      sanitized.purchaseIntent = targeting.purchaseIntent
        .filter(intent => ALLOWED_PURCHASE_INTENT.includes(intent.toLowerCase()))
        .slice(0, 10);
    }

    if (targeting.engagementLevel) {
      sanitized.engagementLevel = targeting.engagementLevel;
    }

    if (targeting.regions) {
      sanitized.regions = targeting.regions.slice(0, 50);
    }

    if (targeting.languages) {
      sanitized.languages = targeting.languages.slice(0, 10);
    }

    if (targeting.ageRange && targeting.ageRange.min >= 18) {
      sanitized.ageRange = {
        min: Math.max(18, targeting.ageRange.min),
        max: Math.min(99, targeting.ageRange.max),
      };
    }

    return sanitized;
  }

  static matchesTargeting(
    targeting: AdTargeting,
    userProfile: {
      interests?: string[];
      purchaseHistory?: string[];
      engagementLevel?: 'low' | 'medium' | 'high';
      region?: string;
      language?: string;
      age?: number;
    }
  ): boolean {
    if (targeting.interests && targeting.interests.length > 0) {
      if (!userProfile.interests || userProfile.interests.length === 0) {
        return false;
      }
      const hasMatchingInterest = targeting.interests.some(interest =>
        userProfile.interests!.some(userInterest =>
          userInterest.toLowerCase().includes(interest.toLowerCase())
        )
      );
      if (!hasMatchingInterest) {
        return false;
      }
    }

    if (targeting.purchaseIntent && targeting.purchaseIntent.length > 0) {
      if (!userProfile.purchaseHistory || userProfile.purchaseHistory.length === 0) {
        return false;
      }
      const hasMatchingIntent = targeting.purchaseIntent.some(intent =>
        userProfile.purchaseHistory!.some(purchase =>
          purchase.toLowerCase().includes(intent.toLowerCase())
        )
      );
      if (!hasMatchingIntent) {
        return false;
      }
    }

    if (targeting.engagementLevel) {
      if (userProfile.engagementLevel !== targeting.engagementLevel) {
        return false;
      }
    }

    if (targeting.regions && targeting.regions.length > 0) {
      if (!userProfile.region) {
        return false;
      }
      if (!targeting.regions.includes(userProfile.region)) {
        return false;
      }
    }

    if (targeting.languages && targeting.languages.length > 0) {
      if (!userProfile.language) {
        return false;
      }
      if (!targeting.languages.includes(userProfile.language)) {
        return false;
      }
    }

    if (targeting.ageRange) {
      if (!userProfile.age) {
        return false;
      }
      if (
        userProfile.age < targeting.ageRange.min ||
        userProfile.age > targeting.ageRange.max
      ) {
        return false;
      }
    }

    return true;
  }

  static calculateTargetingScore(
    targeting: AdTargeting,
    userProfile: {
      interests?: string[];
      purchaseHistory?: string[];
      engagementLevel?: 'low' | 'medium' | 'high';
      region?: string;
      language?: string;
      age?: number;
    }
  ): number {
    let score = 0;
    let maxScore = 0;

    if (targeting.interests && targeting.interests.length > 0) {
      maxScore += 40;
      if (userProfile.interests) {
        const matchCount = targeting.interests.filter(interest =>
          userProfile.interests!.some(userInterest =>
            userInterest.toLowerCase().includes(interest.toLowerCase())
          )
        ).length;
        score += (matchCount / targeting.interests.length) * 40;
      }
    }

    if (targeting.purchaseIntent && targeting.purchaseIntent.length > 0) {
      maxScore += 30;
      if (userProfile.purchaseHistory) {
        const matchCount = targeting.purchaseIntent.filter(intent =>
          userProfile.purchaseHistory!.some(purchase =>
            purchase.toLowerCase().includes(intent.toLowerCase())
          )
        ).length;
        score += (matchCount / targeting.purchaseIntent.length) * 30;
      }
    }

    if (targeting.engagementLevel) {
      maxScore += 20;
      if (userProfile.engagementLevel === targeting.engagementLevel) {
        score += 20;
      }
    }

    if (targeting.regions && targeting.regions.length > 0) {
      maxScore += 10;
      if (userProfile.region && targeting.regions.includes(userProfile.region)) {
        score += 10;
      }
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 0;
  }
}