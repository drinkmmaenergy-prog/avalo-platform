/**
 * NSFW Content Classification Module
 * Reused from PACK 287 - Media Processing
 * 
 * Integrates with external NSFW detection API or ML model
 * Enforces Avalo's content policy
 */

export type NSFWFlag = 'unknown' | 'safe' | 'soft' | 'erotic' | 'blocked';

export interface NSFWClassificationResult {
  flag: NSFWFlag;
  scores: {
    safe: number;
    soft: number;
    erotic: number;
    explicit: number;
  };
  confidence: number;
}

/**
 * Avalo Content Policy (from PACK 267, 268):
 * - 18+ only (no minors ever)
 * - No explicit genitals close-up
 * - No sexual acts depicted
 * - No hate speech, gore, violence
 * - Soft erotic content allowed with proper flagging
 * - Suggestive/artistic nudity allowed
 */

/**
 * Classify media content for NSFW
 * @param buffer - Media file buffer (image or video frame)
 * @param type - Media type ('image' or 'video')
 * @returns NSFWFlag based on classification
 */
export async function classifyNSFW(
  buffer: Buffer,
  type: 'image' | 'video'
): Promise<NSFWFlag> {
  try {
    // In production, this would call:
    // 1. External NSFW detection API (e.g., Sightengine, AWS Rekognition)
    // 2. Internal ML model hosted on Cloud Run
    // 3. Combination of multiple classifiers for accuracy
    
    const result = await performNSFWClassification(buffer, type);
    
    // Apply Avalo's policy thresholds
    return applyPolicyThresholds(result);
    
  } catch (error) {
    console.error('NSFW classification error:', error);
    // Fail safe: flag as unknown and require manual review
    return 'unknown';
  }
}

/**
 * Perform actual NSFW classification using ML model or API
 * This is a placeholder - integrate with real service in production
 */
async function performNSFWClassification(
  buffer: Buffer,
  type: string
): Promise<NSFWClassificationResult> {
  // Placeholder implementation
  // In production, integrate with:
  // - Sightengine API
  // - AWS Rekognition Moderation
  // - Google Cloud Vision Safe Search
  // - Custom TensorFlow model
  
  // For now, return safe by default for development
  // Real implementation would analyze the image/video frame
  
  return {
    flag: 'safe',
    scores: {
      safe: 0.85,
      soft: 0.10,
      erotic: 0.03,
      explicit: 0.02
    },
    confidence: 0.85
  };
}

/**
 * Apply Avalo's content policy thresholds to classification result
 */
function applyPolicyThresholds(result: NSFWClassificationResult): NSFWFlag {
  const { scores } = result;
  
  // BLOCKED: Explicit sexual content, genitals, sex acts
  // Block if explicit score > 50% or high confidence explicit detection
  if (scores.explicit > 0.50 || (scores.explicit > 0.30 && result.confidence > 0.80)) {
    return 'blocked';
  }
  
  // EROTIC: Suggestive nudity, artistic nude, lingerie
  // Flag as erotic if erotic score > 40%
  if (scores.erotic > 0.40 || (scores.soft > 0.50 && scores.erotic > 0.20)) {
    return 'erotic';
  }
  
  // SOFT: Mildly suggestive, swimwear, revealing clothing
  // Flag as soft if soft score > 30%
  if (scores.soft > 0.30) {
    return 'soft';
  }
  
  // SAFE: No concerning content detected
  // This is allowed for all users regardless of settings
  if (scores.safe > 0.60) {
    return 'safe';
  }
  
  // UNKNOWN: Unclear classification, requires manual review
  // This happens when scores are ambiguous or low confidence
  return 'unknown';
}

/**
 * Check if content contains minors (CRITICAL - always block)
 * This should use specialized minor detection models
 */
export async function containsMinors(buffer: Buffer): Promise<boolean> {
  // In production, use:
  // - AWS Rekognition Face Analysis (age estimation)
  // - Specialized minor detection models
  // - Multiple validators for high confidence
  
  // Placeholder - always return false for development
  // CRITICAL: Implement proper minor detection in production
  return false;
}

/**
 * Check for hate symbols, violence, gore
 */
export async function containsProhibitedContent(buffer: Buffer): Promise<{
  contains: boolean;
  categories: string[];
}> {
  // In production, check for:
  // - Hate symbols (swastikas, etc.)
  // - Violence/gore
  // - Weapons
  // - Drugs/illegal substances
  // - Self-harm imagery
  
  return {
    contains: false,
    categories: []
  };
}

/**
 * Comprehensive content moderation check
 * Combines all moderation checks
 */
export async function moderateContent(buffer: Buffer): Promise<{
  approved: boolean;
  nsfwFlag: NSFWFlag;
  reasons: string[];
}> {
  const reasons: string[] = [];
  
  // Check for minors (immediate block)
  const hasMinors = await containsMinors(buffer);
  if (hasMinors) {
    return {
      approved: false,
      nsfwFlag: 'blocked',
      reasons: ['Content appears to contain minors - STRICTLY PROHIBITED']
    };
  }
  
  // Check for prohibited content
  const prohibited = await containsProhibitedContent(buffer);
  if (prohibited.contains) {
    reasons.push(...prohibited.categories.map(cat => `Prohibited: ${cat}`));
    return {
      approved: false,
      nsfwFlag: 'blocked',
      reasons
    };
  }
  
  // Check NSFW level
  const nsfwFlag = await classifyNSFW(buffer, 'image');
  
  // Block explicit content
  if (nsfwFlag === 'blocked') {
    reasons.push('Explicit sexual content detected');
    return {
      approved: false,
      nsfwFlag: 'blocked',
      reasons
    };
  }
  
  // Approve with appropriate flag
  return {
    approved: true,
    nsfwFlag,
    reasons: []
  };
}

/**
 * Batch moderate multiple images (for posts with multiple photos)
 */
export async function moderateBatch(buffers: Buffer[]): Promise<{
  approved: boolean;
  results: Array<{
    index: number;
    nsfwFlag: NSFWFlag;
    approved: boolean;
  }>;
  overallFlag: NSFWFlag;
}> {
  const results = await Promise.all(
    buffers.map(async (buffer, index) => {
      const result = await moderateContent(buffer);
      return {
        index,
        nsfwFlag: result.nsfwFlag,
        approved: result.approved
      };
    })
  );
  
  // If any image is blocked, block the entire post
  const anyBlocked = results.some(r => !r.approved);
  
  // Overall flag is the most restrictive flag found
  const flags = results.map(r => r.nsfwFlag);
  const overallFlag = flags.includes('blocked') ? 'blocked' :
                      flags.includes('erotic') ? 'erotic' :
                      flags.includes('soft') ? 'soft' :
                      flags.includes('unknown') ? 'unknown' : 'safe';
  
  return {
    approved: !anyBlocked,
    results,
    overallFlag
  };
}