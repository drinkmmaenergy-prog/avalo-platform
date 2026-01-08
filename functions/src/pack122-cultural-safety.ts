/**
 * PACK 122 — Cultural Safety Classification System
 * Automated detection and moderation of culturally harmful content
 * 
 * Prevents:
 * - Hate symbolism and slurs
 * - Xenophobia and discrimination
 * - Political propaganda in restricted regions
 * - Regional harassment using local slang
 * - Cultural insensitivity
 */

import { db, timestamp as Timestamp } from './init';
import { logger } from 'firebase-functions/v2';
import {
  CulturalSafetyConcern,
  CulturalSafetyClassification,
  CulturalSafetyWarning,
  RegionalViolation,
} from './pack122-types';
import { getRegionPolicy } from './pack122-region-policy';

// ============================================================================
// CULTURAL SAFETY PATTERNS
// ============================================================================

/**
 * Pattern detection rules for cultural safety concerns
 * These are basic pattern matches - should be enhanced with ML models
 */
const CULTURAL_SAFETY_PATTERNS: Record<CulturalSafetyConcern, RegExp[]> = {
  HATE_SYMBOLISM: [
    /nazi/i,
    /swastika/i,
    /kkk/i,
    /white\s*power/i,
  ],
  
  ETHNIC_SLUR: [
    // Pattern matching for common slurs (implement with care)
    // In production, use a proper slur database or ML model
  ],
  
  XENOPHOBIA: [
    /illegal\s*alien/i,
    /invaders/i,
    /go\s*back\s*to/i,
  ],
  
  POLITICAL_PROPAGANDA: [
    // Region-specific political content detection
    // Should be customized per region
  ],
  
  RELIGIOUS_OFFENSE: [
    // Religious slurs and offensive terms
    // Implement with cultural sensitivity
  ],
  
  CULTURAL_APPROPRIATION: [
    // Patterns for inappropriate cultural references
  ],
  
  REGIONAL_SLANG_HARASSMENT: [
    // Region-specific harassment terms
    // Should be customized per region/language
  ],
  
  HISTORICAL_SENSITIVITY: [
    /holocaust\s*denial/i,
    /genocide\s*denial/i,
  ],
  
  GENDER_HARASSMENT: [
    // Gender-based harassment patterns
  ],
  
  LGBTQ_HARASSMENT: [
    // LGBTQ+ targeted harassment patterns
  ],
};

/**
 * Confidence thresholds for different actions
 */
const CONFIDENCE_THRESHOLDS = {
  WARNING: 0.5,      // Show warning to user
  BLUR: 0.7,         // Blur content, require confirmation
  BLOCK: 0.85,       // Block content immediately
  REPORT: 0.9,       // Auto-report for moderation
};

// ============================================================================
// CONTENT CLASSIFICATION
// ============================================================================

/**
 * Classify content for cultural safety concerns
 * @param contentId - ID of the content being classified
 * @param contentType - Type of content (POST, MESSAGE, etc.)
 * @param text - Text content to analyze
 * @param userId - User who created the content
 * @param userRegion - User's region code
 * @returns Classification result
 */
export async function classifyCulturalSafety(
  contentId: string,
  contentType: 'POST' | 'MESSAGE' | 'PROFILE' | 'COMMENT',
  text: string,
  userId: string,
  userRegion: string
): Promise<CulturalSafetyClassification> {
  try {
    logger.info('[Pack122] Classifying cultural safety', { contentId, contentType, userRegion });

    const concerns: CulturalSafetyConcern[] = [];
    let totalConfidence = 0;
    let maxConfidence = 0;

    // Analyze text against each concern pattern
    for (const [concern, patterns] of Object.entries(CULTURAL_SAFETY_PATTERNS)) {
      const matches = patterns.filter(pattern => pattern.test(text));
      
      if (matches.length > 0) {
        concerns.push(concern as CulturalSafetyConcern);
        
        // Calculate confidence based on number of matches
        const confidence = Math.min(1.0, matches.length * 0.3);
        totalConfidence += confidence;
        maxConfidence = Math.max(maxConfidence, confidence);
      }
    }

    // Check regional specific concerns
    const regionalConcerns = await checkRegionalConcerns(text, userRegion);
    concerns.push(...regionalConcerns);

    // Calculate overall confidence
    const confidence = concerns.length > 0 ? maxConfidence : 0;

    // Determine action based on confidence
    let action: CulturalSafetyClassification['action'] = 'NONE';
    let actionReason: string | undefined;
    
    if (confidence >= CONFIDENCE_THRESHOLDS.REPORT) {
      action = 'REPORT';
      actionReason = 'High confidence cultural safety violation detected';
    } else if (confidence >= CONFIDENCE_THRESHOLDS.BLOCK) {
      action = 'BLOCK';
      actionReason = 'Content blocked for cultural safety review';
    } else if (confidence >= CONFIDENCE_THRESHOLDS.BLUR) {
      action = 'BLUR';
      actionReason = 'Content blurred pending user confirmation';
    } else if (confidence >= CONFIDENCE_THRESHOLDS.WARNING) {
      action = 'WARNING';
      actionReason = 'Potential cultural safety concern detected';
    }

    const classification: CulturalSafetyClassification = {
      contentId,
      contentType,
      detected: concerns.length > 0,
      concerns,
      confidence,
      detectedAt: Timestamp.now(),
      userRegion,
      contentLanguage: detectLanguage(text),
      action,
      actionReason,
      moderationRequired: action === 'REPORT' || action === 'BLOCK',
      moderationStatus: action === 'REPORT' || action === 'BLOCK' ? 'PENDING' : undefined,
    };

    // Store classification
    await db.collection('cultural_safety_classifications').doc(contentId).set(classification);

    // Create moderation case if needed
    if (classification.moderationRequired) {
      await createModerationCase(userId, contentId, classification);
    }

    logger.info('[Pack122] Cultural safety classification complete', {
      contentId,
      detected: classification.detected,
      action: classification.action,
      concernsCount: concerns.length,
    });

    return classification;

  } catch (error) {
    logger.error('[Pack122] Error classifying cultural safety', { contentId, error });
    
    // Return safe classification on error
    return {
      contentId,
      contentType,
      detected: false,
      concerns: [],
      confidence: 0,
      detectedAt: Timestamp.now(),
      userRegion,
      action: 'NONE',
      moderationRequired: false,
    };
  }
}

/**
 * Check for region-specific cultural concerns
 */
async function checkRegionalConcerns(text: string, regionCode: string): Promise<CulturalSafetyConcern[]> {
  const concerns: CulturalSafetyConcern[] = [];
  
  try {
    // Get region policy
    const policy = await getRegionPolicy(regionCode);
    
    // Check if political content is restricted in this region
    if (policy.guardrails.POLITICAL_CONTENT_RESTRICTED) {
      // Check for political keywords (simplified - should use ML in production)
      const politicalPatterns = [
        /election/i,
        /government/i,
        /political\s*party/i,
        /vote/i,
        /campaign/i,
      ];
      
      const hasPoliticalContent = politicalPatterns.some(pattern => pattern.test(text));
      if (hasPoliticalContent) {
        concerns.push('POLITICAL_PROPAGANDA');
      }
    }
    
    // Add region-specific slang detection
    // This should be customized per region with local expertise
    // For now, we'll use a placeholder
    
  } catch (error) {
    logger.error('[Pack122] Error checking regional concerns', { regionCode, error });
  }
  
  return concerns;
}

/**
 * Simple language detection (placeholder - use proper library in production)
 */
function detectLanguage(text: string): string {
  // Simplified language detection
  // In production, use a proper library like franc or languagedetect
  
  // Check for common non-latin scripts
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Chinese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japanese
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'; // Korean
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; // Thai
  if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hebrew
  
  return 'en'; // Default to English for latin script
}

/**
 * Create moderation case for cultural safety violation
 */
async function createModerationCase(
  userId: string,
  contentId: string,
  classification: CulturalSafetyClassification
): Promise<void> {
  try {
    const caseId = db.collection('moderation_cases').doc().id;
    
    await db.collection('moderation_cases').doc(caseId).set({
      caseId,
      type: 'CULTURAL_SAFETY',
      userId,
      contentId,
      contentType: classification.contentType,
      concerns: classification.concerns,
      confidence: classification.confidence,
      status: 'OPEN',
      priority: classification.confidence > 0.9 ? 'HIGH' : 'MEDIUM',
      createdAt: Timestamp.now(),
      source: 'AUTOMATED',
    });
    
    logger.info('[Pack122] Moderation case created', { caseId, userId, contentId });
    
  } catch (error) {
    logger.error('[Pack122] Error creating moderation case', { userId, contentId, error });
  }
}

// ============================================================================
// USER WARNINGS
// ============================================================================

/**
 * Create and show warning to user before they post potentially harmful content
 */
export async function createCulturalSafetyWarning(
  userId: string,
  contentId: string,
  classification: CulturalSafetyClassification
): Promise<CulturalSafetyWarning> {
  try {
    const warningId = db.collection('cultural_safety_warnings').doc().id;
    
    // Determine severity
    let severity: CulturalSafetyWarning['severity'] = 'LOW';
    if (classification.confidence >= 0.9) {
      severity = 'CRITICAL';
    } else if (classification.confidence >= 0.7) {
      severity = 'HIGH';
    } else if (classification.confidence >= 0.5) {
      severity = 'MEDIUM';
    }
    
    // Generate localized warning message
    const message = generateWarningMessage(classification.concerns[0], userId);
    
    const warning: CulturalSafetyWarning = {
      warningId,
      userId,
      contentId,
      concern: classification.concerns[0],
      message,
      severity,
      userAcknowledged: false,
      userProceeded: false,
      autoReported: classification.action === 'REPORT',
      reportId: classification.action === 'REPORT' ? contentId : undefined,
      createdAt: Timestamp.now(),
    };
    
    // Store warning
    await db.collection('cultural_safety_warnings').doc(warningId).set(warning);
    
    logger.info('[Pack122] Cultural safety warning created', { warningId, userId, severity });
    
    return warning;
    
  } catch (error) {
    logger.error('[Pack122] Error creating warning', { userId, contentId, error });
    throw error;
  }
}

/**
 * Generate warning message for user (should be localized)
 */
function generateWarningMessage(concern: CulturalSafetyConcern, userId: string): string {
  // In production, these should be properly localized using the user's language preference
  const messages: Record<CulturalSafetyConcern, string> = {
    HATE_SYMBOLISM: 'Your content may contain hate symbols or extremist imagery. This violates our community guidelines.',
    ETHNIC_SLUR: 'Your content may contain offensive language targeting ethnic or racial groups. Please review before posting.',
    XENOPHOBIA: 'Your content may contain xenophobic or discriminatory language. This is not allowed on our platform.',
    POLITICAL_PROPAGANDA: 'Political propaganda is restricted in your region. Please review your content.',
    RELIGIOUS_OFFENSE: 'Your content may be offensive to religious groups. Please be respectful of all beliefs.',
    CULTURAL_APPROPRIATION: 'Your content may inappropriately reference another culture. Please consider if this is respectful.',
    REGIONAL_SLANG_HARASSMENT: 'Your content may contain harassment using regional language. Please be respectful.',
    HISTORICAL_SENSITIVITY: 'Your content references sensitive historical events. Please ensure you are being respectful.',
    GENDER_HARASSMENT: 'Your content may contain gender-based harassment. This violates our community guidelines.',
    LGBTQ_HARASSMENT: 'Your content may contain harassment targeting LGBTQ+ individuals. This is not tolerated.',
  };
  
  return messages[concern] || 'Your content may violate community guidelines. Please review before posting.';
}

/**
 * User acknowledges warning and chooses to proceed or cancel
 */
export async function acknowledgeCulturalSafetyWarning(
  warningId: string,
  userProceeded: boolean
): Promise<void> {
  try {
    await db.collection('cultural_safety_warnings').doc(warningId).update({
      userAcknowledged: true,
      userProceeded,
      acknowledgedAt: Timestamp.now(),
    });
    
    // If user proceeded despite warning, auto-report for review
    if (userProceeded) {
      const warningDoc = await db.collection('cultural_safety_warnings').doc(warningId).get();
      const warning = warningDoc.data() as CulturalSafetyWarning;
      
      await db.collection('cultural_safety_warnings').doc(warningId).update({
        autoReported: true,
      });
      
      // Create violation record
      await createRegionalViolation(warning.userId, warning.contentId, 'RESTRICTED_CONTENT');
      
      logger.warn('[Pack122] User proceeded despite warning', { warningId, userId: warning.userId });
    }
    
  } catch (error) {
    logger.error('[Pack122] Error acknowledging warning', { warningId, error });
    throw error;
  }
}

// ============================================================================
// VIOLATION TRACKING
// ============================================================================

/**
 * Create regional violation record
 */
async function createRegionalViolation(
  userId: string,
  contentId: string,
  violationType: RegionalViolation['violationType']
): Promise<void> {
  try {
    const violationId = db.collection('regional_violations').doc().id;
    
    const violation: RegionalViolation = {
      violationId,
      userId,
      violationType,
      detectedAt: Timestamp.now(),
      detectedBy: 'SYSTEM',
      evidence: {
        // Evidence would be populated based on violation type
      },
      actionTaken: 'WARNING',
      actionDetails: 'Content auto-reported for moderation review',
      status: 'OPEN',
    };
    
    await db.collection('regional_violations').doc(violationId).set(violation);
    
    logger.info('[Pack122] Regional violation created', { violationId, userId, violationType });
    
  } catch (error) {
    logger.error('[Pack122] Error creating violation', { userId, error });
  }
}

/**
 * Check user's violation history
 */
export async function getUserViolationHistory(userId: string): Promise<RegionalViolation[]> {
  try {
    const snapshot = await db
      .collection('regional_violations')
      .where('userId', '==', userId)
      .orderBy('detectedAt', 'desc')
      .limit(50)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as RegionalViolation);
    
  } catch (error) {
    logger.error('[Pack122] Error getting violation history', { userId, error });
    return [];
  }
}

/**
 * Check if user is a repeat offender
 * Returns true if user has multiple violations in recent period
 */
export async function isRepeatOffender(userId: string): Promise<boolean> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const snapshot = await db
      .collection('regional_violations')
      .where('userId', '==', userId)
      .where('detectedAt', '>', Timestamp.fromDate(thirtyDaysAgo))
      .get();
    
    // User is repeat offender if they have 3+ violations in last 30 days
    return snapshot.size >= 3;
    
  } catch (error) {
    logger.error('[Pack122] Error checking repeat offender', { userId, error });
    return false;
  }
}

// ============================================================================
// CONTENT MODERATION HOOKS
// ============================================================================

/**
 * Pre-publish hook for content creation
 * Called before content is published to check for cultural safety
 */
export async function prePublishCulturalSafetyCheck(
  userId: string,
  contentId: string,
  contentType: 'POST' | 'MESSAGE' | 'PROFILE' | 'COMMENT',
  text: string,
  userRegion: string
): Promise<{
  allowed: boolean;
  warning?: CulturalSafetyWarning;
  requiresConfirmation: boolean;
}> {
  try {
    // Classify content
    const classification = await classifyCulturalSafety(
      contentId,
      contentType,
      text,
      userId,
      userRegion
    );
    
    // If no concerns detected, allow immediately
    if (!classification.detected) {
      return {
        allowed: true,
        requiresConfirmation: false,
      };
    }
    
    // If content should be blocked, deny
    if (classification.action === 'BLOCK') {
      return {
        allowed: false,
        requiresConfirmation: false,
      };
    }
    
    // If warning or blur, require user confirmation
    if (classification.action === 'WARNING' || classification.action === 'BLUR') {
      const warning = await createCulturalSafetyWarning(userId, contentId, classification);
      
      return {
        allowed: false, // Not allowed until user confirms
        warning,
        requiresConfirmation: true,
      };
    }
    
    // Default allow
    return {
      allowed: true,
      requiresConfirmation: false,
    };
    
  } catch (error) {
    logger.error('[Pack122] Error in pre-publish check', { userId, contentId, error });
    // On error, allow content but log for review
    return {
      allowed: true,
      requiresConfirmation: false,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CulturalSafetyConcern,
  CulturalSafetyClassification,
  CulturalSafetyWarning,
  RegionalViolation,
} from './pack122-types';