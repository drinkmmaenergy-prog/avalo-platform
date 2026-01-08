/**
 * PACK 291 — AI Assist Safety & Validation
 * Ensures all AI-generated content is compliant and safe
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_SAFETY_CONSTRAINTS } from './types/pack291-ai-assist.types';

const db = getFirestore();

// ============================================================================
// CONTENT FILTERING
// ============================================================================

/**
 * Forbidden keywords that should never appear in AI suggestions
 */
const FORBIDDEN_KEYWORDS = [
  // NSFW content
  'sexy', 'hot', 'attractive', 'beautiful', 'gorgeous', 'cute',
  'nsfw', 'adult', 'explicit', 'sexual', 'intimate', 'sensual',
  'nude', 'naked', 'body', 'curves', 'figure',
  
  // Escort/sex work
  'escort', 'prostitute', 'hookup', 'dating', 'meet',
  'service', 'private', 'discrete', 'discreet',
  
  // Appearance-related
  'looks', 'appearance', 'face', 'smile', 'eyes', 'hair',
  'dress', 'outfit', 'wear', 'clothing',
  
  // Manipulation/pressure
  'must', 'should always', 'have to', 'need to be',
  'force', 'pressure', 'demand',
];

/**
 * Patterns that indicate inappropriate suggestions
 */
const FORBIDDEN_PATTERNS = [
  /\b(show|display|reveal|expose)\s+(more|less|your)\b/i,
  /\b(get|make)\s+\w+\s+(interested|excited|attracted)\b/i,
  /\b(sell|offer|provide)\s+\w+\s+(services?|experiences?)\b/i,
  /\b(personal|private|intimate)\s+(meeting|encounter|session)\b/i,
];

/**
 * Validate AI-generated content for safety compliance
 */
export function validateAIContent(content: string): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check for forbidden keywords
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      violations.push(`Contains forbidden keyword: "${keyword}"`);
    }
  }

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`Matches forbidden pattern: ${pattern.source}`);
    }
  }

  // Check for URLs (should not appear in insights)
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  if (urlPattern.test(content)) {
    violations.push('Contains URLs');
  }

  // Check for phone numbers
  const phonePattern = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  if (phonePattern.test(content)) {
    violations.push('Contains phone numbers');
  }

  // Check for email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  if (emailPattern.test(content)) {
    violations.push('Contains email addresses');
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Sanitize AI content by removing/replacing unsafe elements
 */
export function sanitizeAIContent(content: string): string {
  let sanitized = content;

  // Remove URLs
  sanitized = sanitized.replace(/(https?:\/\/[^\s]+)/g, '[link removed]');

  // Remove phone numbers
  sanitized = sanitized.replace(/(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[contact removed]');

  // Remove email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email removed]');

  // Replace forbidden keywords with neutral terms
  const replacements: Record<string, string> = {
    'sexy': 'appealing',
    'hot': 'popular',
    'attractive': 'engaging',
    'beautiful': 'well-crafted',
    'gorgeous': 'excellent',
  };

  for (const [forbidden, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${forbidden}\\b`, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }

  return sanitized.trim();
}

// ============================================================================
// SAFETY LOGGING
// ============================================================================

/**
 * Log safety violations for audit purposes
 */
export async function logSafetyViolation(
  userId: string,
  content: string,
  violations: string[],
  context: {
    endpoint: string;
    timestamp: Date;
    action: 'BLOCKED' | 'SANITIZED' | 'ALLOWED';
  }
): Promise<void> {
  try {
    await db.collection('aiSafetyLogs').add({
      userId,
      content,
      violations,
      endpoint: context.endpoint,
      action: context.action,
      flagged: violations.length > 0,
      createdAt: Timestamp.fromDate(context.timestamp),
    });

    logger.warn('AI Safety Violation Logged', {
      userId,
      violations,
      endpoint: context.endpoint,
      action: context.action,
    });
  } catch (error) {
    logger.error('Failed to log safety violation:', error);
  }
}

/**
 * Check if user has too many safety violations (abuse detection)
 */
export async function checkUserSafetyStatus(userId: string): Promise<{
  safe: boolean;
  violationCount: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
}> {
  // Count violations in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const violationsQuery = db.collection('aiSafetyLogs')
    .where('userId', '==', userId)
    .where('flagged', '==', true)
    .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo));

  const violationsSnapshot = await violationsQuery.get();
  const violationCount = violationsSnapshot.size;

  // Thresholds
  const WARN_THRESHOLD = 5;
  const BLOCK_THRESHOLD = 10;

  return {
    safe: violationCount < BLOCK_THRESHOLD,
    violationCount,
    shouldWarn: violationCount >= WARN_THRESHOLD && violationCount < BLOCK_THRESHOLD,
    shouldBlock: violationCount >= BLOCK_THRESHOLD,
  };
}

// ============================================================================
// CONTENT MODERATION
// ============================================================================

/**
 * Moderate AI-generated insight before returning to user
 */
export async function moderateInsight(
  userId: string,
  content: string,
  endpoint: string
): Promise<{
  approved: boolean;
  content: string;
  violations: string[];
  action: 'BLOCKED' | 'SANITIZED' | 'ALLOWED';
}> {
  // Validate content
  const validation = validateAIContent(content);

  let finalContent = content;
  let action: 'BLOCKED' | 'SANITIZED' | 'ALLOWED' = 'ALLOWED';

  if (!validation.safe) {
    // Check if violations are severe
    const severeViolations = validation.violations.filter(v =>
      v.includes('NSFW') ||
      v.includes('escort') ||
      v.includes('sexual')
    );

    if (severeViolations.length > 0) {
      // Block content entirely
      action = 'BLOCKED';
      await logSafetyViolation(userId, content, validation.violations, {
        endpoint,
        timestamp: new Date(),
        action: 'BLOCKED',
      });

      return {
        approved: false,
        content: '',
        violations: validation.violations,
        action: 'BLOCKED',
      };
    } else {
      // Attempt to sanitize
      finalContent = sanitizeAIContent(content);
      action = 'SANITIZED';

      await logSafetyViolation(userId, content, validation.violations, {
        endpoint,
        timestamp: new Date(),
        action: 'SANITIZED',
      });
    }
  }

  return {
    approved: true,
    content: finalContent,
    violations: validation.violations,
    action,
  };
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if user is within rate limits for AI requests
 */
export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  requestsToday: number;
  limit: number;
  resetAt: Date;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Count requests today
  const requestsQuery = db.collection('aiAssistCache')
    .where('userId', '==', userId)
    .where('generatedAt', '>=', Timestamp.fromDate(today))
    .where('generatedAt', '<', Timestamp.fromDate(tomorrow));

  const requestsSnapshot = await requestsQuery.get();
  const requestsToday = requestsSnapshot.size;

  // Different limits based on user status
  const userDoc = await db.collection('profiles').doc(userId).get();
  const isRoyal = userDoc.exists && userDoc.data()?.roles?.royal === true;
  const isVIP = userDoc.exists && userDoc.data()?.roles?.vip === true;

  let limit = 50; // Standard users
  if (isRoyal) {
    limit = 200; // Royal members get 4x requests
  } else if (isVIP) {
    limit = 100; // VIP members get 2x requests
  }

  return {
    allowed: requestsToday < limit,
    requestsToday,
    limit,
    resetAt: tomorrow,
  };
}

// ============================================================================
// COMPLIANCE VALIDATION
// ============================================================================

/**
 * Validate that all AI responses meet platform compliance standards
 */
export function validateCompliance(content: string): {
  compliant: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check length
  if (content.length > 2000) {
    issues.push('Content exceeds maximum length (2000 chars)');
  }

  // Check for platform policy compliance
  const constraints = DEFAULT_SAFETY_CONSTRAINTS;

  if (constraints.noNSFWSuggestions) {
    const nsfwPattern = /\b(nsfw|adult|explicit|xxx)\b/i;
    if (nsfwPattern.test(content)) {
      issues.push('Contains NSFW references');
    }
  }

  if (constraints.noAppearanceComments) {
    const appearancePattern = /\b(looks?|appearance|beautiful|gorgeous|attractive|cute|sexy|hot)\b/i;
    if (appearancePattern.test(content)) {
      issues.push('Contains appearance-related comments');
    }
  }

  if (constraints.noSexualContent) {
    const sexualPattern = /\b(sexual|intimate|sex|erotic|sensual)\b/i;
    if (sexualPattern.test(content)) {
      issues.push('Contains sexual content references');
    }
  }

  return {
    compliant: issues.length === 0,
    issues,
  };
}

/**
 * Generate safe fallback content when AI content is blocked
 */
export function generateSafeFallback(type: string): string {
  const fallbacks: Record<string, string> = {
    daily_summary: 'Continue building your presence on Avalo. Focus on consistent activity and engagement.',
    weekly_optimization: 'Keep tracking your performance metrics to identify optimization opportunities.',
    content_recommendation: 'Post regularly and engage with your audience to maximize visibility.',
    chat_optimization: 'Respond quickly to messages to improve conversion rates.',
    calendar_optimization: 'Make your availability clear and book time strategically.',
    profile_health: 'Complete your profile and verify your photos to improve trustworthiness.',
  };

  return fallbacks[type] || 'Continue focusing on quality engagement and consistent activity.';
}