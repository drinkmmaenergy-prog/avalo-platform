/**
 * PACK 145 - Ad Safety Validator
 * NSFW/Romance/Exploitative Content Detection
 * 
 * Zero tolerance for:
 * - Dating/romance ads
 * - Sexual/seductive content
 * - Emotional manipulation
 * - Vulnerability exploitation
 */

import {
  FORBIDDEN_AD_PATTERNS,
  FORBIDDEN_CTAS,
  NSFW_THRESHOLD,
  ROMANCE_THRESHOLD,
  EXPLOITATIVE_THRESHOLD,
  SafetyValidationResult,
  ContentValidationResult,
  AdAsset,
  AdCampaign,
} from './pack145-types';

export class AdSafetyValidator {
  static validateContent(
    title: string,
    description: string,
    callToAction?: string
  ): ContentValidationResult {
    const violations: string[] = [];
    const forbiddenPatterns: string[] = [];
    const forbiddenCTAs: string[] = [];

    const combinedText = `${title} ${description} ${callToAction || ''}`.toLowerCase();

    for (const pattern of FORBIDDEN_AD_PATTERNS) {
      if (pattern.test(combinedText)) {
        violations.push(`Content matches forbidden pattern: ${pattern.source}`);
        forbiddenPatterns.push(pattern.source);
      }
    }

    if (callToAction) {
      const ctaLower = callToAction.toLowerCase();
      for (const forbidden of FORBIDDEN_CTAS) {
        if (ctaLower.includes(forbidden)) {
          violations.push(`Call-to-action contains forbidden phrase: ${forbidden}`);
          forbiddenCTAs.push(forbidden);
        }
      }
    }

    const romanticKeywords = [
      'love', 'romance', 'dating', 'relationship', 'meet me',
      'girlfriend', 'boyfriend', 'single', 'lonely', 'miss you'
    ];
    const romanticMatches = romanticKeywords.filter(kw => combinedText.includes(kw));
    if (romanticMatches.length > 0) {
      violations.push(`Romantic/dating content detected: ${romanticMatches.join(', ')}`);
    }

    const nsfwKeywords = [
      'sexy', 'hot', 'nsfw', '18+', 'adult', 'erotic',
      'sensual', 'intimate', 'seductive', 'desire'
    ];
    const nsfwMatches = nsfwKeywords.filter(kw => combinedText.includes(kw));
    if (nsfwMatches.length > 0) {
      violations.push(`NSFW content detected: ${nsfwMatches.join(', ')}`);
    }

    const exploitativeKeywords = [
      'attention', 'notice me', 'exclusive chat', 'private company',
      'emotional support', 'companionship for sale', 'make you feel',
      'special treatment', 'vip access to me'
    ];
    const exploitativeMatches = exploitativeKeywords.filter(kw => combinedText.includes(kw));
    if (exploitativeMatches.length > 0) {
      violations.push(`Exploitative content detected: ${exploitativeMatches.join(', ')}`);
    }

    const externalPaymentKeywords = [
      'paypal', 'venmo', 'cashapp', 'telegram', 'whatsapp',
      'onlyfans', 'patreon', 'ko-fi', 'external payment'
    ];
    const externalPaymentMatches = externalPaymentKeywords.filter(kw => combinedText.includes(kw));
    if (externalPaymentMatches.length > 0) {
      violations.push(`External payment links detected: ${externalPaymentMatches.join(', ')}`);
    }

    return {
      isValid: violations.length === 0,
      violations,
      forbiddenPatterns,
      forbiddenCTAs,
    };
  }

  static async validateAsset(asset: AdAsset): Promise<SafetyValidationResult> {
    const contentValidation = this.validateContent(
      asset.title,
      asset.description
    );

    let nsfwScore = 0;
    let romanceScore = 0;
    let exploitativeScore = 0;

    const combinedText = `${asset.title} ${asset.description}`.toLowerCase();

    const nsfwKeywords = ['sexy', 'hot', 'nsfw', '18+', 'adult', 'erotic', 'sensual', 'seductive'];
    nsfwScore = nsfwKeywords.filter(kw => combinedText.includes(kw)).length / nsfwKeywords.length;

    const romanticKeywords = ['love', 'romance', 'dating', 'relationship', 'meet', 'girlfriend', 'boyfriend'];
    romanceScore = romanticKeywords.filter(kw => combinedText.includes(kw)).length / romanticKeywords.length;

    const exploitativeKeywords = ['attention', 'notice', 'exclusive', 'private', 'emotional', 'lonely'];
    exploitativeScore = exploitativeKeywords.filter(kw => combinedText.includes(kw)).length / exploitativeKeywords.length;

    const violations = [...contentValidation.violations];

    if (nsfwScore >= NSFW_THRESHOLD) {
      violations.push(`NSFW score too high: ${nsfwScore.toFixed(2)}`);
    }

    if (romanceScore >= ROMANCE_THRESHOLD) {
      violations.push(`Romance score too high: ${romanceScore.toFixed(2)}`);
    }

    if (exploitativeScore >= EXPLOITATIVE_THRESHOLD) {
      violations.push(`Exploitative score too high: ${exploitativeScore.toFixed(2)}`);
    }

    let severity: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    if (violations.length > 0) {
      if (nsfwScore >= 0.7 || romanceScore >= 0.7 || exploitativeScore >= 0.7) {
        severity = 'critical';
      } else if (nsfwScore >= 0.5 || romanceScore >= 0.5 || exploitativeScore >= 0.5) {
        severity = 'high';
      } else if (violations.length >= 3) {
        severity = 'medium';
      } else {
        severity = 'low';
      }
    }

    const requiresHumanReview = (
      severity === 'high' ||
      severity === 'critical' ||
      (violations.length > 0 && violations.length < 2)
    );

    return {
      isValid: violations.length === 0,
      violations,
      severity,
      nsfwScore,
      romanceScore,
      exploitativeScore,
      requiresHumanReview,
    };
  }

  static async validateCampaign(campaign: AdCampaign): Promise<SafetyValidationResult> {
    const contentValidation = this.validateContent(
      campaign.name,
      campaign.description,
      campaign.callToAction
    );

    if (!contentValidation.isValid) {
      return {
        isValid: false,
        violations: contentValidation.violations,
        severity: 'high',
        nsfwScore: 1.0,
        romanceScore: 1.0,
        exploitativeScore: 1.0,
        requiresHumanReview: true,
      };
    }

    const validCTAs = ['buy', 'learn_more', 'join_event', 'view_product', 'book_session', 'join_club'];
    if (!validCTAs.includes(campaign.callToAction)) {
      contentValidation.violations.push(`Invalid call-to-action: ${campaign.callToAction}`);
    }

    const validContentTypes = ['product', 'club', 'challenge', 'event', 'mentorship', 'digital_good', 'service'];
    if (!validContentTypes.includes(campaign.contentType)) {
      contentValidation.violations.push(`Invalid content type: ${campaign.contentType}`);
    }

    return {
      isValid: contentValidation.violations.length === 0,
      violations: contentValidation.violations,
      severity: contentValidation.violations.length > 0 ? 'medium' : 'none',
      nsfwScore: 0,
      romanceScore: 0,
      exploitativeScore: 0,
      requiresHumanReview: contentValidation.violations.length > 0,
    };
  }

  static validateImageContent(imageUrl: string): boolean {
    const forbiddenExtensions = ['.gif', '.webp'];
    const url = imageUrl.toLowerCase();
    
    for (const ext of forbiddenExtensions) {
      if (url.includes('sexy') || url.includes('nsfw') || url.includes('adult')) {
        return false;
      }
    }

    return true;
  }

  static detectManipulativeLanguage(text: string): string[] {
    const manipulativePatterns = [
      /make you feel/i,
      /you deserve/i,
      /lonely|vulnerable|desperate/i,
      /exclusive (just|only) for you/i,
      /limited.*attention/i,
      /private.*connection/i,
      /emotional.*bond/i,
      /special.*relationship/i,
    ];

    const violations: string[] = [];
    for (const pattern of manipulativePatterns) {
      if (pattern.test(text)) {
        violations.push(`Manipulative language detected: ${pattern.source}`);
      }
    }

    return violations;
  }

  static calculateRiskScore(
    nsfwScore: number,
    romanceScore: number,
    exploitativeScore: number
  ): number {
    return (nsfwScore * 0.4) + (romanceScore * 0.4) + (exploitativeScore * 0.2);
  }
}