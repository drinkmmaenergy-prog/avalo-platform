/**
 * PACK 170 — Avalo Universal Search 3.0
 * Safe-search classifier and content filtering middleware
 */

import { SearchIndexEntry } from '../types/search.types';

export interface SafetyAnalysis {
  isSafe: boolean;
  safetyScore: number;
  flags: string[];
  suggestedAlternative?: string;
}

const EXPLICIT_KEYWORDS = [
  'sex', 'porn', 'nude', 'naked', 'xxx', 'nsfw',
  'escort', 'prostitute', 'hookup', 'onlyfans leak',
  'explicit', 'adult content', 'erotic', 'seductive'
];

const ROMANTIC_KEYWORDS = [
  'dating', 'romance', 'flirt', 'seduce', 'tinder',
  'match', 'singles', 'hookup', 'meet women', 'meet men',
  'find love', 'relationship', 'boyfriend', 'girlfriend'
];

const ATTRACTIVENESS_KEYWORDS = [
  'hot', 'sexy', 'beautiful', 'gorgeous', 'attractive',
  'stunning', 'pretty women', 'handsome men', 'model',
  'bikini model', 'fitness model' // unless fitness context
];

const BODY_KEYWORDS = [
  'body type', 'curves', 'measurements', 'bust', 'booty',
  'abs', 'muscles' // unless fitness context
];

const SAFE_CONTEXTS = [
  'fitness', 'workout', 'training', 'yoga', 'health',
  'nutrition', 'exercise', 'gym', 'sports', 'athletics'
];

/**
 * Analyze text for safety and appropriateness
 */
export function analyzeSafety(text: string, context?: string): SafetyAnalysis {
  const lowerText = text.toLowerCase();
  const lowerContext = context?.toLowerCase() || '';
  const flags: string[] = [];
  let safetyScore = 100;

  // Check explicit keywords
  for (const keyword of EXPLICIT_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      flags.push(`explicit_keyword:${keyword}`);
      safetyScore -= 50;
    }
  }

  // Check romantic keywords
  for (const keyword of ROMANTIC_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      flags.push(`romantic_keyword:${keyword}`);
      safetyScore -= 30;
    }
  }

  // Check attractiveness keywords (unless in safe context)
  const inSafeContext = SAFE_CONTEXTS.some(ctx => 
    lowerText.includes(ctx) || lowerContext.includes(ctx)
  );

  if (!inSafeContext) {
    for (const keyword of ATTRACTIVENESS_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        flags.push(`attractiveness_keyword:${keyword}`);
        safetyScore -= 25;
      }
    }

    for (const keyword of BODY_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        flags.push(`body_keyword:${keyword}`);
        safetyScore -= 20;
      }
    }
  }

  // Ensure score doesn't go below 0
  safetyScore = Math.max(0, safetyScore);

  // Determine if safe (threshold: 60)
  const isSafe = safetyScore >= 60;

  // Suggest alternatives for borderline cases
  let suggestedAlternative: string | undefined;
  if (!isSafe) {
    if (lowerText.includes('bikini') && lowerText.includes('fitness')) {
      suggestedAlternative = 'fitness workouts';
    } else if (lowerText.includes('model')) {
      suggestedAlternative = 'creator profiles';
    } else if (lowerText.includes('dating') || lowerText.includes('romance')) {
      suggestedAlternative = 'social events';
    }
  }

  return {
    isSafe,
    safetyScore,
    flags,
    suggestedAlternative
  };
}

/**
 * Analyze thumbnail/image URL for safety
 */
export function analyzeImageUrl(url: string): SafetyAnalysis {
  const lowerUrl = url.toLowerCase();
  const flags: string[] = [];
  let safetyScore = 100;

  // Check for suspicious patterns in URL
  const suspiciousPatterns = [
    'nude', 'naked', 'xxx', 'nsfw', 'adult',
    'sexy', 'hot', 'bikini', 'lingerie', 'swimsuit'
  ];

  for (const pattern of suspiciousPatterns) {
    if (lowerUrl.includes(pattern)) {
      flags.push(`suspicious_url_pattern:${pattern}`);
      safetyScore -= 40;
    }
  }

  safetyScore = Math.max(0, safetyScore);

  return {
    isSafe: safetyScore >= 60,
    safetyScore,
    flags
  };
}

/**
 * Comprehensive content analysis for search index entries
 */
export function analyzeSearchContent(entry: Omit<SearchIndexEntry, 'safetyScore' | 'isExplicit'>): SafetyAnalysis {
  const titleAnalysis = analyzeSafety(entry.title, entry.category);
  const descAnalysis = analyzeSafety(entry.description, entry.category);
  
  // Analyze tags
  let tagsScore = 100;
  const tagFlags: string[] = [];
  for (const tag of entry.tags) {
    const tagAnalysis = analyzeSafety(tag, entry.category);
    if (!tagAnalysis.isSafe) {
      tagsScore = Math.min(tagsScore, tagAnalysis.safetyScore);
      tagFlags.push(...tagAnalysis.flags);
    }
  }

  // Combine scores (weighted)
  const combinedScore = 
    titleAnalysis.safetyScore * 0.4 +
    descAnalysis.safetyScore * 0.4 +
    tagsScore * 0.2;

  const allFlags = [
    ...titleAnalysis.flags,
    ...descAnalysis.flags,
    ...tagFlags
  ];

  return {
    isSafe: combinedScore >= 60 && titleAnalysis.isSafe,
    safetyScore: Math.round(combinedScore),
    flags: allFlags,
    suggestedAlternative: titleAnalysis.suggestedAlternative || descAnalysis.suggestedAlternative
  };
}

/**
 * Validate creator profile for search indexing
 */
export function validateCreatorProfile(profile: {
  bio: string;
  tags: string[];
  profileImageUrl?: string;
}): SafetyAnalysis {
  const bioAnalysis = analyzeSafety(profile.bio, 'profile');
  
  let tagsScore = 100;
  const tagFlags: string[] = [];
  for (const tag of profile.tags) {
    const tagAnalysis = analyzeSafety(tag, 'profile');
    if (!tagAnalysis.isSafe) {
      tagsScore = Math.min(tagsScore, tagAnalysis.safetyScore);
      tagFlags.push(...tagAnalysis.flags);
    }
  }

  let imageScore = 100;
  const imageFlags: string[] = [];
  if (profile.profileImageUrl) {
    const imageAnalysis = analyzeImageUrl(profile.profileImageUrl);
    imageScore = imageAnalysis.safetyScore;
    imageFlags.push(...imageAnalysis.flags);
  }

  const combinedScore = 
    bioAnalysis.safetyScore * 0.4 +
    tagsScore * 0.3 +
    imageScore * 0.3;

  return {
    isSafe: combinedScore >= 60,
    safetyScore: Math.round(combinedScore),
    flags: [...bioAnalysis.flags, ...tagFlags, ...imageFlags]
  };
}

/**
 * Check if content is appropriate for all audiences
 */
export function isContentSFW(content: string): boolean {
  const analysis = analyzeSafety(content);
  return analysis.isSafe && analysis.safetyScore >= 80;
}

/**
 * Sanitize search query by removing inappropriate terms
 */
export function sanitizeSearchQuery(query: string): string {
  let sanitized = query;

  // Remove explicit terms
  for (const term of EXPLICIT_KEYWORDS) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '***');
  }

  return sanitized.trim();
}

/**
 * Get content rating
 */
export function getContentRating(safetyScore: number): 'SAFE' | 'CAUTION' | 'UNSAFE' {
  if (safetyScore >= 80) return 'SAFE';
  if (safetyScore >= 60) return 'CAUTION';
  return 'UNSAFE';
}

/**
 * Check if thumbnail should be blocked
 */
export function shouldBlockThumbnail(url: string, contentType: string): boolean {
  const imageAnalysis = analyzeImageUrl(url);
  
  // Block if unsafe
  if (!imageAnalysis.isSafe) return true;
  
  // Block if content type is sensitive
  const sensitiveContentTypes = ['profile', 'personal', 'dating'];
  if (sensitiveContentTypes.includes(contentType.toLowerCase())) {
    return imageAnalysis.safetyScore < 85;
  }
  
  return false;
}

/**
 * Middleware function to validate search request
 */
export function validateSearchRequest(query: string, filters: any): { valid: boolean; reason?: string } {
  // Check query
  const queryAnalysis = analyzeSafety(query);
  if (!queryAnalysis.isSafe) {
    return {
      valid: false,
      reason: 'Search query contains inappropriate content'
    };
  }

  // Check if filters contain forbidden categories
  const forbiddenFilters = ['gender', 'attractiveness', 'relationship_status', 'looking_for'];
  for (const filter of forbiddenFilters) {
    if (filter in filters) {
      return {
        valid: false,
        reason: `Filter "${filter}" is not allowed`
      };
    }
  }

  return { valid: true };
}

/**
 * Auto-flag content for manual review
 */
export function shouldFlagForReview(entry: SearchIndexEntry): boolean {
  // Flag if safety score is borderline
  if (entry.safetyScore >= 60 && entry.safetyScore < 75) {
    return true;
  }

  // Flag if explicit but not banned
  if (entry.isExplicit && !entry.isBanned) {
    return true;
  }

  // Flag if certain keywords in combo
  const text = `${entry.title} ${entry.description}`.toLowerCase();
  const suspiciousCombos = [
    ['private', 'photos'],
    ['exclusive', 'content'],
    ['behind', 'scenes'],
    ['fan', 'request']
  ];

  for (const combo of suspiciousCombos) {
    if (combo.every(word => text.includes(word))) {
      return true;
    }
  }

  return false;
}