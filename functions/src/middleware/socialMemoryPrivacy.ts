/**
 * PACK 192: Social Memory Privacy Middleware
 * Blocks forbidden data from being shared between AIs
 */

import * as logger from 'firebase-functions/logger';
import type {
  ForbiddenDataType,
  PrivacyFilterResult,
  AllowedPreferenceCategory,
} from '../types/socialMemory.js';

/**
 * Forbidden keywords and patterns that indicate sensitive data
 */
const FORBIDDEN_PATTERNS = {
  emotional_vulnerability: [
    /\b(?:lonely|loneliness|isolated|alone|abandoned|unloved)\b/gi,
    /\b(?:depressed|depression|suicidal|self-harm)\b/gi,
    /\b(?:worthless|hopeless|desperate|broken)\b/gi,
  ],
  loneliness_signals: [
    /\b(?:no (?:one|friends)|nobody (?:cares|loves))\b/gi,
    /\b(?:miss (?:someone|you)|missing (?:someone|you))\b/gi,
    /\b(?:need (?:someone|you)|want (?:someone|you))\b/gi,
  ],
  fears_trauma: [
    /\b(?:trauma|traumatic|ptsd|abuse|abused)\b/gi,
    /\b(?:afraid|scared|terrified|fear|phobia)\b/gi,
    /\b(?:nightmare|flashback|triggered)\b/gi,
  ],
  mental_health: [
    /\b(?:anxiety|anxious|panic attack|ocd)\b/gi,
    /\b(?:bipolar|schizophrenia|psychosis)\b/gi,
    /\b(?:medication|therapy|therapist|psychiatrist)\b/gi,
  ],
  addiction_tendencies: [
    /\b(?:addicted|addiction|alcoholic|drunk)\b/gi,
    /\b(?:gambling|gamble|bet|betting)\b/gi,
    /\b(?:drug|drugs|substance|high)\b/gi,
  ],
  financial_data: [
    /\b(?:bank|credit card|account number|ssn|social security)\b/gi,
    /\b(?:salary|income|debt|loan|mortgage)\b/gi,
    /\b(?:invest|investment|stock|crypto)\b/gi,
  ],
  purchases: [
    /\b(?:bought|purchased|spent|shopping)\b/gi,
    /\b(?:order|ordered|cart|checkout)\b/gi,
  ],
  subscriptions: [
    /\b(?:subscribed|subscription|premium|plus)\b/gi,
    /\b(?:paying|payment|charge)\b/gi,
  ],
  sexual_interests: [
    /\b(?:sex|sexual|naked|nude)\b/gi,
    /\b(?:porn|erotic|kinky|fetish)\b/gi,
  ],
  relational_pain: [
    /\b(?:ex|breakup|broke up|divorce)\b/gi,
    /\b(?:cheated|betrayed|hurt me)\b/gi,
    /\b(?:miss (?:her|him)|lost (?:her|him))\b/gi,
  ],
  ai_rankings: [
    /\b(?:favorite ai|best ai|better than)\b/gi,
    /\b(?:prefer|like (?:you|them) (?:more|better))\b/gi,
    /\b(?:ranking|rank|compare|comparison)\b/gi,
  ],
  ai_favorites: [
    /\b(?:my favorite|i love you more)\b/gi,
    /\b(?:jealous|envy|envious)\b/gi,
  ],
};

/**
 * Check if text contains forbidden content
 */
export function evaluateTextForForbiddenContent(
  text: string
): PrivacyFilterResult {
  if (!text || typeof text !== 'string') {
    return { allowed: true };
  }

  const detectedTypes: ForbiddenDataType[] = [];
  const lowerText = text.toLowerCase();

  for (const [type, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        detectedTypes.push(type as ForbiddenDataType);
        break;
      }
    }
  }

  if (detectedTypes.length > 0) {
    logger.warn('[Social Memory Privacy] Blocked forbidden content', {
      detectedTypes,
      textSnippet: text.substring(0, 50),
    });

    return {
      allowed: false,
      reason: `Content contains sensitive information: ${detectedTypes.join(', ')}`,
      detectedForbiddenTypes: detectedTypes,
    };
  }

  return { allowed: true };
}

/**
 * Validate preference category is allowed
 */
export function isCategoryAllowed(
  category: string
): category is AllowedPreferenceCategory {
  const allowedCategories: AllowedPreferenceCategory[] = [
    'topics_liked',
    'humor_preference',
    'activity_preference',
    'languages',
    'safe_boundaries',
    'story_progress',
  ];

  return allowedCategories.includes(category as AllowedPreferenceCategory);
}

/**
 * Sanitize preference value before sharing
 */
export function sanitizePreferenceValue(
  category: AllowedPreferenceCategory,
  value: any
): any {
  if (!value) return value;

  if (typeof value === 'string') {
    const filterResult = evaluateTextForForbiddenContent(value);
    if (!filterResult.allowed) {
      logger.warn('[Social Memory] Blocked value due to forbidden content', {
        category,
        reason: filterResult.reason,
      });
      return null;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          const filterResult = evaluateTextForForbiddenContent(item);
          return filterResult.allowed ? item : null;
        }
        return item;
      })
      .filter((item) => item !== null);
  }

  return value;
}

/**
 * Check if AI behaviors indicate manipulation
 */
export function detectManipulativeBehavior(
  aiId: string,
  recentActions: Array<{ type: string; timestamp: Date }>
): { isManipulative: boolean; reason?: string } {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const recentAccessCount = recentActions.filter(
    (action) =>
      action.type === 'memory_access' && action.timestamp.getTime() > oneHourAgo
  ).length;

  if (recentAccessCount > 50) {
    return {
      isManipulative: true,
      reason: 'Excessive memory access rate detected',
    };
  }

  const jealousyAttempts = recentActions.filter(
    (action) =>
      action.type === 'comparison_query' || action.type === 'ranking_query'
  ).length;

  if (jealousyAttempts > 0) {
    return {
      isManipulative: true,
      reason: 'AI attempting to create jealousy or ranking dynamics',
    };
  }

  return { isManipulative: false };
}

/**
 * Validate preference key doesn't contain sensitive info
 */
export function validatePreferenceKey(key: string): boolean {
  const forbiddenKeywords = [
    'password',
    'secret',
    'private',
    'personal',
    'emotion',
    'feeling',
    'trauma',
    'pain',
    'hurt',
    'sad',
    'lonely',
    'money',
    'bank',
    'credit',
    'purchase',
    'buy',
    'sex',
    'intimate',
    'relationship',
    'ex',
    'breakup',
  ];

  const lowerKey = key.toLowerCase();
  return !forbiddenKeywords.some((keyword) => lowerKey.includes(keyword));
}

/**
 * Block AI gossip attempts
 */
export function blockAiGossip(
  requestingAiId: string,
  targetUserId: string,
  query: string
): { blocked: boolean; reason?: string } {
  const lowerQuery = query.toLowerCase();

  const gossipPatterns = [
    /\b(?:what (?:does|did) (?:user|they) say|tell me about)\b/gi,
    /\b(?:other ai|another ai|different ai)\b/gi,
    /\b(?:compare|versus|vs|better than)\b/gi,
    /\b(?:user prefer|user like|user love)\b/gi,
  ];

  for (const pattern of gossipPatterns) {
    if (pattern.test(lowerQuery)) {
      logger.warn('[Social Memory] Blocked AI gossip attempt', {
        aiId: requestingAiId,
        userId: targetUserId,
        querySnippet: query.substring(0, 50),
      });

      return {
        blocked: true,
        reason: 'AI gossip and comparison queries are not allowed',
      };
    }
  }

  return { blocked: false };
}

/**
 * Comprehensive privacy check for preference sharing
 */
export async function validatePreferenceSharing(params: {
  userId: string;
  category: string;
  key: string;
  value: any;
  requestingAiId?: string;
}): Promise<PrivacyFilterResult> {
  if (!isCategoryAllowed(params.category)) {
    return {
      allowed: false,
      reason: `Category "${params.category}" is not allowed for cross-AI sharing`,
    };
  }

  if (!validatePreferenceKey(params.key)) {
    return {
      allowed: false,
      reason: 'Preference key contains forbidden keywords',
    };
  }

  const sanitizedValue = sanitizePreferenceValue(
    params.category as AllowedPreferenceCategory,
    params.value
  );

  if (sanitizedValue === null) {
    return {
      allowed: false,
      reason: 'Preference value contains forbidden content',
    };
  }

  return { allowed: true };
}

export default {
  evaluateTextForForbiddenContent,
  isCategoryAllowed,
  sanitizePreferenceValue,
  detectManipulativeBehavior,
  validatePreferenceKey,
  blockAiGossip,
  validatePreferenceSharing,
};