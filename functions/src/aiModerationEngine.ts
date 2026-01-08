/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * AI Moderation Engine with Cloud Vision Integration
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  ModerationLabels,
  ModerationResult,
  ModerationContext,
  ModerationDecision,
  ContentModerationRecord,
} from '../../shared/types/contentModeration';
import { logEvent } from './observability';

const db = getFirestore();

// Logger utility wrapping observability
const logger = {
  info: (message: string, context: any) => {
    logEvent({
      level: 'INFO',
      source: 'BACKEND',
      service: context.service || 'functions.moderation',
      module: context.module || 'CONTENT_SAFETY',
      message,
      context: {
        userId: context.userId,
        functionName: context.functionName,
      },
      details: { extra: context },
    }).catch(console.error);
  },
  warn: (message: string, context: any) => {
    logEvent({
      level: 'WARN',
      source: 'BACKEND',
      service: context.service || 'functions.moderation',
      module: context.module || 'CONTENT_SAFETY',
      message,
      details: { extra: context },
    }).catch(console.error);
  },
  error: (message: string, context: any) => {
    logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: context.service || 'functions.moderation',
      module: context.module || 'CONTENT_SAFETY',
      message,
      details: { extra: context },
    }).catch(console.error);
  },
};

// Cloud Vision client - lazy loaded (optional dependency)
let visionClient: any = null;
let visionAvailable: boolean | null = null;

async function getVisionClient() {
  if (visionAvailable === false) {
    return null;
  }
  
  if (!visionClient && visionAvailable === null) {
    try {
      // Dynamic import to handle optional dependency
      const vision = await import('@google-cloud/vision').catch(() => null);
      if (vision) {
        visionClient = new vision.ImageAnnotatorClient();
        visionAvailable = true;
      } else {
        visionAvailable = false;
        logger.warn('Cloud Vision not available, using fallback moderation', {
          service: 'functions.moderation',
          module: 'CONTENT_SAFETY',
        });
      }
    } catch (error) {
      visionAvailable = false;
      logger.error('Failed to load Cloud Vision client', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return visionClient;
}

/**
 * Fallback moderation when Cloud Vision is not available
 * Returns conservative scores that trigger manual review
 */
function fallbackModeration(mediaUrl: string): ModerationLabels {
  logger.warn('Using fallback moderation (Cloud Vision unavailable)', {
    service: 'functions.moderation',
    module: 'CONTENT_SAFETY',
    mediaUrl,
  });
  
  // Conservative approach: trigger review for all content
  return {
    adult: 0.4, // Borderline - will trigger review
    violence: 0.0,
    hateful: 0.0,
    illegal: 0.0,
    selfHarm: 0.0,
    minorPresence: 0.0,
  };
}

/**
 * Classify content using Cloud Vision SafeSearch API
 */
async function classifyWithCloudVision(mediaUrl: string): Promise<ModerationLabels> {
  try {
    const client = await getVisionClient();
    
    // If Cloud Vision is not available, use fallback
    if (!client) {
      return fallbackModeration(mediaUrl);
    }

    const [result] = await client.safeSearchDetection(mediaUrl);
    const safeSearch = result.safeSearchAnnotation;

    if (!safeSearch) {
      throw new Error('No SafeSearch annotation returned');
    }

    // Map Cloud Vision likelihood to 0-1 scores
    const likelihoodToScore = (likelihood: string | null | undefined): number => {
      switch (likelihood) {
        case 'VERY_UNLIKELY': return 0.1;
        case 'UNLIKELY': return 0.3;
        case 'POSSIBLE': return 0.5;
        case 'LIKELY': return 0.7;
        case 'VERY_LIKELY': return 0.9;
        default: return 0.0;
      }
    };

    // Map to our label structure
    const labels: ModerationLabels = {
      adult: likelihoodToScore(safeSearch.adult),
      violence: likelihoodToScore(safeSearch.violence),
      hateful: likelihoodToScore(safeSearch.racy), // Use 'racy' for hateful content
      illegal: 0.0, // Base score, will be adjusted below
      selfHarm: likelihoodToScore(safeSearch.violence) * 0.5, // Estimate from violence
      minorPresence: 0.0, // Will be detected separately if needed
    };

    // Check for explicit labels that indicate illegal content
    const labelAnnotations = result.labelAnnotations || [];
    const dangerousLabels = labelAnnotations.filter(label => {
      const desc = label.description?.toLowerCase() || '';
      return desc.includes('weapon') ||
             desc.includes('drug') ||
             desc.includes('illegal');
    });

    if (dangerousLabels.length > 0) {
      labels.illegal = Math.min(0.9, dangerousLabels.length * 0.3);
    }

    return labels;
  } catch (error) {
    logger.error('Cloud Vision classification failed', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      mediaUrl,
    });
    
    // Return fallback on error
    return fallbackModeration(mediaUrl);
  }
}

/**
 * Make moderation decision based on labels and context
 */
function makeDecision(
  labels: ModerationLabels,
  context: ModerationContext
): { decision: ModerationDecision; reason: string; shouldEscalate: boolean; confidence: number } {
  
  // CRITICAL: Auto-block if minor presence detected
  if (labels.minorPresence > 0.1) {
    return {
      decision: 'AUTO_BLOCK',
      reason: 'CSAM/minor presence detected - zero tolerance policy',
      shouldEscalate: true,
      confidence: labels.minorPresence,
    };
  }

  // Auto-block illegal content
  if (labels.illegal > 0.4) {
    return {
      decision: 'AUTO_BLOCK',
      reason: 'Illegal content detected (weapons/drugs/illegal activities)',
      shouldEscalate: true,
      confidence: labels.illegal,
    };
  }

  // Auto-block extreme violence or self-harm
  if (labels.violence > 0.8 || labels.selfHarm > 0.7) {
    return {
      decision: 'AUTO_BLOCK',
      reason: 'Extreme violence or self-harm content detected',
      shouldEscalate: true,
      confidence: Math.max(labels.violence, labels.selfHarm),
    };
  }

  // Handle adult content based on user verification
  if (labels.adult > 0.6) {
    if (context.isAdultVerified) {
      // Allow monetizable NSFW for verified adults
      return {
        decision: 'ALLOW',
        reason: 'Adult content from verified 18+ user - monetizable',
        shouldEscalate: false,
        confidence: labels.adult,
      };
    } else {
      // Block adult content from non-verified users
      return {
        decision: 'AUTO_BLOCK',
        reason: 'Adult content from non-verified user',
        shouldEscalate: true,
        confidence: labels.adult,
      };
    }
  }

  // Borderline adult content - needs review
  if (labels.adult >= 0.3 && labels.adult <= 0.6) {
    return {
      decision: 'REVIEW_REQUIRED',
      reason: 'Borderline adult content - requires human review',
      shouldEscalate: false,
      confidence: labels.adult,
    };
  }

  // Check for hateful content
  if (labels.hateful > 0.6) {
    return {
      decision: 'AUTO_BLOCK',
      reason: 'Hateful symbols or abusive content detected',
      shouldEscalate: true,
      confidence: labels.hateful,
    };
  }

  // Moderate violence or hateful content - restrict visibility
  if (labels.violence > 0.4 || labels.hateful > 0.3) {
    return {
      decision: 'RESTRICT',
      reason: 'Moderate concerning content - limited visibility',
      shouldEscalate: false,
      confidence: Math.max(labels.violence, labels.hateful),
    };
  }

  // Default: allow safe content
  return {
    decision: 'ALLOW',
    reason: 'Content passed safety checks',
    shouldEscalate: false,
    confidence: 0.95,
  };
}

/**
 * Main moderation engine - classify and make decision
 */
export async function moderateContent(
  contentId: string,
  userId: string,
  mediaUrl: string,
  context: ModerationContext
): Promise<ModerationResult> {
  try {
    logger.info('Starting content moderation', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      contentId,
      userId,
      contentType: context.contentType,
    });

    // Step 1: Classify with Cloud Vision
    const labels = await classifyWithCloudVision(mediaUrl);

    // Step 2: Make decision
    const { decision, reason, shouldEscalate, confidence } = makeDecision(labels, context);

    // Step 3: Store moderation record
    const moderationRecord: ContentModerationRecord = {
      contentId,
      userId,
      mediaUrl,
      labels,
      decision,
      reason,
      reviewedByAdmin: null,
      reviewedAt: null,
      createdAt: FieldValue.serverTimestamp() as any,
      updatedAt: FieldValue.serverTimestamp() as any,
    };

    await db.collection('content_moderation').doc(contentId).set(moderationRecord);

    // Step 4: Log result
    logger.info('Content moderation completed', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      contentId,
      userId,
      decision,
      confidence,
      shouldEscalate,
    });

    // Step 5: Handle auto-block actions
    if (decision === 'AUTO_BLOCK') {
      await handleAutoBlock(contentId, userId, mediaUrl, reason);
    }

    // Step 6: Export risk signal if escalation needed
    if (shouldEscalate) {
      await exportRiskSignal(userId, contentId, labels, reason);
    }

    return {
      labels,
      decision,
      reason,
      shouldEscalate,
      confidence,
    };
  } catch (error) {
    logger.error('Content moderation failed', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      contentId,
      userId,
    });

    // On error, default to review required
    return {
      labels: {
        adult: 0.0,
        violence: 0.0,
        hateful: 0.0,
        illegal: 0.0,
        selfHarm: 0.0,
        minorPresence: 0.0,
      },
      decision: 'REVIEW_REQUIRED',
      reason: 'Moderation engine error - requires manual review',
      shouldEscalate: false,
      confidence: 0.0,
    };
  }
}

/**
 * Handle auto-blocked content
 */
async function handleAutoBlock(
  contentId: string,
  userId: string,
  mediaUrl: string,
  reason: string
): Promise<void> {
  try {
    // Create audit log entry (PACK 65 integration)
    await db.collection('audit_logs').add({
      action: 'CONTENT_AUTO_BLOCKED',
      performedBy: 'SYSTEM',
      targetEntityType: 'content',
      targetEntityId: contentId,
      details: {
        userId,
        mediaUrl,
        reason,
        automated: true,
      },
      timestamp: FieldValue.serverTimestamp(),
      ipAddress: null,
      userAgent: null,
    });

    // Check for repeated violations
    const recentBlocks = await db
      .collection('content_moderation')
      .where('userId', '==', userId)
      .where('decision', '==', 'AUTO_BLOCK')
      .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
      .get();

    if (recentBlocks.size >= 3) {
      // Integrate with enforcement system (PACK 54)
      await escalateToEnforcement(userId, recentBlocks.size);
    }

    logger.info('Auto-block handled', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      contentId,
      userId,
      recentBlockCount: recentBlocks.size,
    });
  } catch (error) {
    logger.error('Failed to handle auto-block', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      contentId,
      userId,
    });
  }
}

/**
 * Escalate to enforcement system
 */
async function escalateToEnforcement(userId: string, violationCount: number): Promise<void> {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return;
    }

    // Update enforcement status (PACK 54 integration)
    await userRef.update({
      'enforcement.warningCount': FieldValue.increment(1),
      'enforcement.lastWarningAt': FieldValue.serverTimestamp(),
      'enforcement.reasons': FieldValue.arrayUnion('REPEATED_CONTENT_VIOLATIONS'),
    });

    // If severe violations, disable earnings
    if (violationCount >= 5) {
      await userRef.update({
        earningStatus: 'EARN_DISABLED',
        accountStatus: 'LIMITED',
        'enforcement.severity': 'HIGH',
      });

      logger.warn('User earnings disabled due to repeated violations', {
        source: 'BACKEND',
        service: 'functions.moderation',
        module: 'CONTENT_SAFETY',
        userId,
        violationCount,
      });
    }
  } catch (error) {
    logger.error('Failed to escalate to enforcement', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });
  }
}

/**
 * Export risk signal to fraud engine (PACK 71 integration)
 */
async function exportRiskSignal(
  userId: string,
  contentId: string,
  labels: ModerationLabels,
  reason: string
): Promise<void> {
  try {
    // Calculate risk score (0-100)
    const riskScore = Math.min(100, Math.round(
      (labels.minorPresence * 100) +
      (labels.illegal * 80) +
      (labels.violence * 60) +
      (labels.hateful * 50)
    ));

    const riskFactors: string[] = [];
    if (labels.minorPresence > 0.1) riskFactors.push('CSAM_RISK');
    if (labels.illegal > 0.4) riskFactors.push('ILLEGAL_CONTENT');
    if (labels.violence > 0.6) riskFactors.push('VIOLENCE');
    if (labels.hateful > 0.6) riskFactors.push('HATEFUL_CONTENT');

    // Store in fraud signals collection
    await db.collection('fraud_signals').add({
      type: 'CONTENT_MODERATION',
      userId,
      contentId,
      riskScore,
      riskFactors,
      reason,
      timestamp: FieldValue.serverTimestamp(),
    });

    logger.info('Risk signal exported to fraud engine', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      userId,
      contentId,
      riskScore,
      riskFactors,
    });
  } catch (error) {
    logger.error('Failed to export risk signal', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      contentId,
    });
  }
}

/**
 * Get moderation status for content
 */
export async function getModerationStatus(contentId: string): Promise<ContentModerationRecord | null> {
  try {
    const doc = await db.collection('content_moderation').doc(contentId).get();
    return doc.exists ? (doc.data() as ContentModerationRecord) : null;
  } catch (error) {
    logger.error('Failed to get moderation status', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      contentId,
    });
    return null;
  }
}

/**
 * Update moderation decision (for admin review)
 */
export async function updateModerationDecision(
  contentId: string,
  decision: ModerationDecision,
  reason: string,
  adminId: string
): Promise<void> {
  try {
    await db.collection('content_moderation').doc(contentId).update({
      decision,
      reason,
      reviewedByAdmin: adminId,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create audit log
    await db.collection('audit_logs').add({
      action: 'MODERATION_DECISION_UPDATED',
      performedBy: adminId,
      targetEntityType: 'content',
      targetEntityId: contentId,
      details: {
        decision,
        reason,
      },
      timestamp: FieldValue.serverTimestamp(),
      ipAddress: null,
      userAgent: null,
    });

    logger.info('Moderation decision updated', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      contentId,
      decision,
      adminId,
    });
  } catch (error) {
    logger.error('Failed to update moderation decision', {
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      error: error instanceof Error ? error.message : 'Unknown error',
      contentId,
    });
    throw error;
  }
}