/**
 * PACK 167 - Affiliate Safety Middleware
 * Detects and blocks romantic/sexual manipulation and forbidden content
 */

import { ContentSafetyCheck, BlockReason } from '../types/pack167-affiliates';

// Forbidden phrases and patterns (romantic/sexual manipulation)
const FORBIDDEN_PATTERNS = [
  // Romantic manipulation
  /love\s+you.*buy/i,
  /buy.*love\s+you/i,
  /prove.*fan.*purchas/i,
  /purchas.*prove.*fan/i,
  /support.*emotionally.*buy/i,
  /buy.*support.*emotionally/i,
  /affection.*purchas/i,
  /purchas.*affection/i,
  
  // Sexual/seductive content
  /private\s+attention/i,
  /seduc/i,
  /erotic/i,
  /nsfw/i,
  /sexy/i,
  /nude/i,
  /naked/i,
  
  // Escort/sugar dating
  /escort/i,
  /sugar.*dating/i,
  /companionship.*for.*money/i,
  /pay.*for.*company/i,
  
  // Romantic incentives
  /date.*me.*if.*you.*buy/i,
  /buy.*and.*i.*will.*date/i,
  /relationship.*requires.*purchase/i,
  
  // Financial grooming
  /spend.*more.*love/i,
  /only.*buyers.*can.*talk/i,
  /purchase.*to.*chat/i,
  /money.*proves.*love/i,
  
  // Guilt/fear tactics
  /abandon.*if.*not.*buy/i,
  /leave.*you.*unless.*purchase/i,
  /real.*fans.*buy/i,
  /fake.*fan.*no.*purchase/i,
];

// Forbidden platform URLs
const FORBIDDEN_URLS = [
  /onlyfans\.com/i,
  /fansly\.com/i,
  /patreon\.com.*adult/i,
  /telegram\.me/i,
  /t\.me/i,
  /wa\.me/i,
  /whatsapp/i,
  /cash\.app/i,
  /venmo\.com/i,
  /paypal\.me/i,
  /external.*payment/i,
  /private.*link/i,
];

// Body-focused/seductive image patterns (for banner/image URLs)
const NSFW_IMAGE_PATTERNS = [
  /sexy/i,
  /hot/i,
  /nude/i,
  /naked/i,
  /lingerie/i,
  /bikini.*closeup/i,
  /seductive/i,
  /erotic/i,
  /nsfw/i,
];

/**
 * Check text content for forbidden patterns
 */
export function checkTextSafety(text: string): ContentSafetyCheck {
  const lowerText = text.toLowerCase();
  const blockedReasons: BlockReason[] = [];
  const flaggedPhrases: string[] = [];
  let maxConfidence = 0;

  // Check for romantic manipulation
  const romanticPatterns = FORBIDDEN_PATTERNS.slice(0, 8);
  for (const pattern of romanticPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('romantic_manipulation')) {
        blockedReasons.push('romantic_manipulation');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.95);
    }
  }

  // Check for sexual content
  const sexualPatterns = FORBIDDEN_PATTERNS.slice(8, 15);
  for (const pattern of sexualPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('sexual_content')) {
        blockedReasons.push('sexual_content');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.98);
    }
  }

  // Check for escort/sugar dating
  const escortPatterns = FORBIDDEN_PATTERNS.slice(15, 19);
  for (const pattern of escortPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('sexual_content')) {
        blockedReasons.push('sexual_content');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.99);
    }
  }

  // Check for emotional manipulation
  const emotionalPatterns = FORBIDDEN_PATTERNS.slice(19, 23);
  for (const pattern of emotionalPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('emotional_manipulation')) {
        blockedReasons.push('emotional_manipulation');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.92);
    }
  }

  // Check for financial grooming
  const groomingPatterns = FORBIDDEN_PATTERNS.slice(23, 27);
  for (const pattern of groomingPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('financial_grooming')) {
        blockedReasons.push('financial_grooming');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.94);
    }
  }

  // Check for guilt/fear tactics
  const guiltPatterns = FORBIDDEN_PATTERNS.slice(27);
  for (const pattern of guiltPatterns) {
    if (pattern.test(text)) {
      if (!blockedReasons.includes('parasocial_exploitation')) {
        blockedReasons.push('parasocial_exploitation');
      }
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
      maxConfidence = Math.max(maxConfidence, 0.93);
    }
  }

  return {
    isAllowed: blockedReasons.length === 0,
    blockedReasons,
    confidence: maxConfidence || 1.0,
    flaggedPhrases: Array.from(new Set(flaggedPhrases)),
  };
}

/**
 * Check URL for forbidden platforms
 */
export function checkUrlSafety(url: string): ContentSafetyCheck {
  const blockedReasons: BlockReason[] = [];
  const flaggedPhrases: string[] = [];

  for (const pattern of FORBIDDEN_URLS) {
    if (pattern.test(url)) {
      blockedReasons.push('forbidden_platform_link');
      const match = url.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
    }
  }

  return {
    isAllowed: blockedReasons.length === 0,
    blockedReasons,
    confidence: blockedReasons.length > 0 ? 0.99 : 1.0,
    flaggedPhrases: Array.from(new Set(flaggedPhrases)),
  };
}

/**
 * Check image URL for NSFW/seductive content indicators
 */
export function checkImageSafety(imageUrl: string): ContentSafetyCheck {
  const blockedReasons: BlockReason[] = [];
  const flaggedPhrases: string[] = [];

  for (const pattern of NSFW_IMAGE_PATTERNS) {
    if (pattern.test(imageUrl)) {
      blockedReasons.push('nsfw_imagery');
      const match = imageUrl.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
    }
  }

  return {
    isAllowed: blockedReasons.length === 0,
    blockedReasons,
    confidence: blockedReasons.length > 0 ? 0.85 : 1.0,
    flaggedPhrases: Array.from(new Set(flaggedPhrases)),
  };
}

/**
 * Comprehensive safety check for affiliate content
 */
export function checkAffiliateSafety(params: {
  text?: string;
  url?: string;
  imageUrl?: string;
}): ContentSafetyCheck {
  const results: ContentSafetyCheck[] = [];

  if (params.text) {
    results.push(checkTextSafety(params.text));
  }

  if (params.url) {
    results.push(checkUrlSafety(params.url));
  }

  if (params.imageUrl) {
    results.push(checkImageSafety(params.imageUrl));
  }

  // Combine all results
  const allBlockedReasons: BlockReason[] = [];
  const allFlaggedPhrases: string[] = [];
  let maxConfidence = 1.0;

  for (const result of results) {
    if (!result.isAllowed) {
      allBlockedReasons.push(...result.blockedReasons);
      allFlaggedPhrases.push(...result.flaggedPhrases);
      maxConfidence = Math.max(maxConfidence, result.confidence);
    }
  }

  return {
    isAllowed: allBlockedReasons.length === 0,
    blockedReasons: Array.from(new Set(allBlockedReasons)),
    confidence: maxConfidence,
    flaggedPhrases: Array.from(new Set(allFlaggedPhrases)),
  };
}

/**
 * Validate revenue split complies with rules
 */
export function validateRevenueSplit(params: {
  sellerPercentage: number;
  referralPercentage: number;
  platformFee: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check referral percentage (0-20%)
  if (params.referralPercentage < 0 || params.referralPercentage > 20) {
    errors.push('Referral percentage must be between 0% and 20%');
  }

  // Check seller percentage (minimum 65%)
  if (params.sellerPercentage < 65) {
    errors.push('Seller percentage must be at least 65%');
  }

  // Check platform fee (minimum 15%)
  if (params.platformFee < 15) {
    errors.push('Platform fee must be at least 15%');
  }

  // Check total adds up to 100%
  const total = params.sellerPercentage + params.referralPercentage + params.platformFee;
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`Revenue split must total 100% (currently ${total}%)`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if content should be blocked and log it
 */
export async function logBlockedContent(
  firestore: FirebaseFirestore.Firestore,
  params: {
    creatorId: string;
    contentType: 'link' | 'banner' | 'description';
    contentId: string;
    blockedText?: string;
    blockedImageUrl?: string;
    safetyCheck: ContentSafetyCheck;
  }
): Promise<void> {
  if (!params.safetyCheck.isAllowed) {
    await firestore.collection('blocked_affiliate_content').add({
      creatorId: params.creatorId,
      contentType: params.contentType,
      contentId: params.contentId,
      blockedText: params.blockedText || '',
      blockedImageUrl: params.blockedImageUrl || '',
      reason: params.safetyCheck.blockedReasons[0],
      detectionMethod: 'keyword',
      confidence: params.safetyCheck.confidence,
      actionTaken: 'blocked',
      blockedAt: new Date(),
    });
  }
}