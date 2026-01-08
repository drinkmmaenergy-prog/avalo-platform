/**
 * PACK 202 - NSFW & Romantic Content Detection
 * 
 * Machine moderation to block NSFW, romantic, and inappropriate content
 * in ambassador applications and recruitment messages.
 */

import { NSFWDetectionResult, NSFWCategory, ForbiddenRecruitmentPattern, FORBIDDEN_PATTERNS } from '../types/ambassador.types';

/**
 * Detect NSFW content in text
 */
export async function detectNSFWContent(text: string): Promise<NSFWDetectionResult> {
  const lowercaseText = text.toLowerCase();
  const detectedCategories: NSFWCategory[] = [];
  let totalConfidence = 0;
  let detectionCount = 0;

  // NSFW keywords and patterns
  const nsfwPatterns = [
    { pattern: /\b(sexy|hot|attractive|beautiful|gorgeous)\b/gi, category: 'suggestive_content' as NSFWCategory, weight: 0.3 },
    { pattern: /\b(adult|explicit|nsfw|18\+|xxx)\b/gi, category: 'explicit_content' as NSFWCategory, weight: 0.9 },
    { pattern: /\b(cam|webcam|onlyfans|fansly)\b/gi, category: 'adult_entertainment_reference' as NSFWCategory, weight: 0.8 },
    { pattern: /\b(nude|naked|topless|lingerie)\b/gi, category: 'explicit_content' as NSFWCategory, weight: 0.9 },
    { pattern: /\b(seduce|seductive|flirt|flirty)\b/gi, category: 'suggestive_content' as NSFWCategory, weight: 0.6 },
    { pattern: /\b(sexual|sex\s|porn)\b/gi, category: 'explicit_content' as NSFWCategory, weight: 1.0 },
    { pattern: /\b(erotic|sensual|intimate)\b/gi, category: 'suggestive_content' as NSFWCategory, weight: 0.7 },
    { pattern: /\b(body|physique|curves|figure)\s+(content|photos|videos)\b/gi, category: 'body_focus' as NSFWCategory, weight: 0.5 },
    { pattern: /\b(monetize|sell|profit)\s+(beauty|looks|appearance|attraction)\b/gi, category: 'body_focus' as NSFWCategory, weight: 0.8 },
    { pattern: /\b(sugar\s+daddy|sugar\s+baby|arrangement)\b/gi, category: 'explicit_content' as NSFWCategory, weight: 1.0 },
    { pattern: /\b(escort|companion|date\s+service)\b/gi, category: 'explicit_content' as NSFWCategory, weight: 0.9 }
  ];

  for (const { pattern, category, weight } of nsfwPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      if (!detectedCategories.includes(category)) {
        detectedCategories.push(category);
      }
      totalConfidence += weight * matches.length;
      detectionCount += matches.length;
    }
  }

  // Calculate average confidence
  const confidence = detectionCount > 0 ? Math.min(totalConfidence / detectionCount, 1.0) : 0;
  const detected = confidence > 0.4;

  return {
    detected,
    confidence,
    categories: detectedCategories,
    details: detected 
      ? `Detected ${detectedCategories.length} NSFW categories with ${detectionCount} matches`
      : 'No NSFW content detected',
    timestamp: new Date()
  };
}

/**
 * Detect romantic/dating content in text
 */
export async function detectRomanticContent(text: string): Promise<NSFWDetectionResult> {
  const lowercaseText = text.toLowerCase();
  const detectedCategories: NSFWCategory[] = [];
  let totalConfidence = 0;
  let detectionCount = 0;

  // Romantic content patterns
  const romanticPatterns = [
    { pattern: /\b(date|dating|romance|romantic)\b/gi, category: 'romantic_language' as NSFWCategory, weight: 0.6 },
    { pattern: /\b(boyfriend|girlfriend|partner|relationship)\s+(experience|service)\b/gi, category: 'romantic_language' as NSFWCategory, weight: 0.9 },
    { pattern: /\b(flirt|flirting|chatting\s+with\s+men|talking\s+to\s+guys)\b/gi, category: 'romantic_language' as NSFWCategory, weight: 0.7 },
    { pattern: /\b(paid|get\s+paid|earn|money)\s+(for\s+)?(attention|chatting|messages|company)\b/gi, category: 'dating_appeal' as NSFWCategory, weight: 0.8 },
    { pattern: /\b(men\s+will\s+pay|guys\s+want\s+to|lonely\s+men)\b/gi, category: 'emotional_manipulation' as NSFWCategory, weight: 0.9 },
    { pattern: /\b(emotional\s+connection|parasocial|fan\s+relationship)\b/gi, category: 'emotional_manipulation' as NSFWCategory, weight: 0.5 },
    { pattern: /\b(jealous|exclusive|personal\s+attention)\b/gi, category: 'emotional_manipulation' as NSFWCategory, weight: 0.6 },
    { pattern: /\b(sugar|financial\s+arrangement|allowance)\b/gi, category: 'dating_appeal' as NSFWCategory, weight: 1.0 }
  ];

  for (const { pattern, category, weight } of romanticPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      if (!detectedCategories.includes(category)) {
        detectedCategories.push(category);
      }
      totalConfidence += weight * matches.length;
      detectionCount += matches.length;
    }
  }

  // Calculate average confidence
  const confidence = detectionCount > 0 ? Math.min(totalConfidence / detectionCount, 1.0) : 0;
  const detected = confidence > 0.4;

  return {
    detected,
    confidence,
    categories: detectedCategories,
    details: detected 
      ? `Detected ${detectedCategories.length} romantic content categories with ${detectionCount} matches`
      : 'No romantic content detected',
    timestamp: new Date()
  };
}

/**
 * Detect inappropriate language
 */
export async function detectInappropriateLanguage(text: string): Promise<NSFWDetectionResult> {
  const lowercaseText = text.toLowerCase();
  const detectedCategories: NSFWCategory[] = [];
  let totalConfidence = 0;
  let detectionCount = 0;

  // Inappropriate language patterns
  const inappropriatePatterns = [
    { pattern: /\b(sexy\s+chat|dirty\s+talk|naughty)\b/gi, category: 'sexual_innuendo' as NSFWCategory, weight: 0.9 },
    { pattern: /\b(turn\s+on|arousing|provocative)\b/gi, category: 'sexual_innuendo' as NSFWCategory, weight: 0.8 },
    { pattern: /\b(tease|teasing|playful\s+banter)\b/gi, category: 'suggestive_content' as NSFWCategory, weight: 0.5 },
    { pattern: /\b(fans\s+love|admirers|worship)\b/gi, category: 'emotional_manipulation' as NSFWCategory, weight: 0.4 }
  ];

  for (const { pattern, category, weight } of inappropriatePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      if (!detectedCategories.includes(category)) {
        detectedCategories.push(category);
      }
      totalConfidence += weight * matches.length;
      detectionCount += matches.length;
    }
  }

  // Calculate average confidence
  const confidence = detectionCount > 0 ? Math.min(totalConfidence / detectionCount, 1.0) : 0;
  const detected = confidence > 0.5;

  return {
    detected,
    confidence,
    categories: detectedCategories,
    details: detected 
      ? `Detected ${detectedCategories.length} inappropriate language categories with ${detectionCount} matches`
      : 'No inappropriate language detected',
    timestamp: new Date()
  };
}

/**
 * Screen recruitment message for forbidden patterns
 */
export async function screenRecruitmentMessage(message: string): Promise<{
  approved: boolean;
  blockedPatterns: ForbiddenRecruitmentPattern[];
  reason?: string;
}> {
  const lowercaseMessage = message.toLowerCase();
  const blockedPatterns: ForbiddenRecruitmentPattern[] = [];

  for (const forbiddenPattern of FORBIDDEN_PATTERNS) {
    if (lowercaseMessage.includes(forbiddenPattern.pattern.toLowerCase())) {
      blockedPatterns.push(forbiddenPattern);
    }

    for (const example of forbiddenPattern.examples) {
      if (lowercaseMessage.includes(example.toLowerCase())) {
        blockedPatterns.push(forbiddenPattern);
        break;
      }
    }
  }

  const criticalBlocks = blockedPatterns.filter(p => p.severity === 'critical');
  const approved = criticalBlocks.length === 0;

  return {
    approved,
    blockedPatterns,
    reason: approved 
      ? undefined 
      : `Message contains forbidden recruitment patterns: ${criticalBlocks.map(p => p.type).join(', ')}`
  };
}

/**
 * Comprehensive content screening for ambassador applications
 */
export async function screenAmbassadorContent(content: {
  motivationStatement: string;
  qualificationDescription: string;
  experience: string;
  achievements: string[];
  contentSamples?: string[];
}): Promise<{
  passed: boolean;
  nsfwResult: NSFWDetectionResult;
  romanticResult: NSFWDetectionResult;
  inappropriateResult: NSFWDetectionResult;
  summary: string;
}> {
  const allText = [
    content.motivationStatement,
    content.qualificationDescription,
    content.experience,
    ...content.achievements,
    ...(content.contentSamples || [])
  ].join(' ');

  const nsfwResult = await detectNSFWContent(allText);
  const romanticResult = await detectRomanticContent(allText);
  const inappropriateResult = await detectInappropriateLanguage(allText);

  const passed = !nsfwResult.detected && !romanticResult.detected && !inappropriateResult.detected;

  const issues: string[] = [];
  if (nsfwResult.detected) issues.push('NSFW content');
  if (romanticResult.detected) issues.push('romantic/dating content');
  if (inappropriateResult.detected) issues.push('inappropriate language');

  const summary = passed
    ? 'Content passed all screening checks'
    : `Content failed screening: ${issues.join(', ')} detected`;

  return {
    passed,
    nsfwResult,
    romanticResult,
    inappropriateResult,
    summary
  };
}

/**
 * Validate social profile URLs for adult content platforms
 */
export function validateSocialProfile(platform: string, url: string): {
  valid: boolean;
  reason?: string;
} {
  const lowercasePlatform = platform.toLowerCase();
  const lowercaseUrl = url.toLowerCase();

  // Blocked platforms
  const blockedPlatforms = [
    'onlyfans',
    'fansly',
    'patreon',
    'chaturbate',
    'cam4',
    'myfreecams',
    'streamate',
    'adult',
    'pornhub',
    'xvideos'
  ];

  for (const blocked of blockedPlatforms) {
    if (lowercasePlatform.includes(blocked) || lowercaseUrl.includes(blocked)) {
      return {
        valid: false,
        reason: `Platform '${blocked}' is not allowed for ambassador applications`
      };
    }
  }

  return {
    valid: true
  };
}

/**
 * Check portfolio item for adult content
 */
export async function validatePortfolioItem(
  title: string,
  description: string,
  url: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  const combinedText = `${title} ${description} ${url}`;
  
  const nsfwResult = await detectNSFWContent(combinedText);
  const romanticResult = await detectRomanticContent(combinedText);

  if (nsfwResult.detected || romanticResult.detected) {
    return {
      valid: false,
      reason: 'Portfolio item contains inappropriate content'
    };
  }

  // Check URL for adult platforms
  const urlCheck = validateSocialProfile('', url);
  if (!urlCheck.valid) {
    return urlCheck;
  }

  return {
    valid: true
  };
}