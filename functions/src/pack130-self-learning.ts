/**
 * PACK 130 — Self-Learning Moderation System
 * 
 * Adjusts AI confidence based on moderator feedback
 * Improves detection accuracy over time without manual rule updates
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ModerationFeedback,
  AIConfidenceRule,
  PatrolEventType,
  DEFAULT_PATROL_CONFIG,
} from './types/pack130-types';

const FEEDBACK_COLLECTION = 'patrol_feedback_loop';
const CONFIDENCE_RULES_COLLECTION = 'patrol_ai_confidence_rules';

// ============================================================================
// FEEDBACK RECORDING
// ============================================================================

/**
 * Record moderator feedback on a patrol case
 */
export async function recordModerationFeedback(
  caseId: string,
  flaggedViolation: PatrolEventType,
  confirmed: boolean,
  moderatorId: string,
  moderatorNotes?: string
): Promise<string> {
  const feedbackId = `${caseId}_${Date.now()}`;
  
  // Get current rule confidence
  const rule = await getConfidenceRule(flaggedViolation);
  
  // Calculate adjustment based on feedback
  const { confidenceAdjustment, weightAdjustment } = calculateAdjustments(
    confirmed,
    rule?.currentConfidence || 0.5
  );
  
  const feedback: ModerationFeedback = {
    feedbackId,
    patrolCaseId: caseId,
    flaggedViolation,
    confirmed,
    moderatorId,
    moderatorNotes,
    decidedAt: Timestamp.now(),
    ruleConfidenceAdjustment: confidenceAdjustment,
    patternWeightAdjustment: weightAdjustment,
    feedbackApplied: false,
  };
  
  await db.collection(FEEDBACK_COLLECTION).doc(feedbackId).set(feedback);
  
  console.log(`[Self-Learning] Recorded ${confirmed ? 'positive' : 'negative'} feedback for ${flaggedViolation}`);
  
  // Apply feedback if enough samples collected
  await applyFeedbackIfReady(flaggedViolation);
  
  return feedbackId;
}

/**
 * Calculate confidence and weight adjustments
 */
function calculateAdjustments(
  confirmed: boolean,
  currentConfidence: number
): { confidenceAdjustment: number; weightAdjustment: number } {
  const learningRate = DEFAULT_PATROL_CONFIG.feedbackLearningRate;
  
  if (confirmed) {
    // True positive - increase confidence slightly
    const confidenceAdjustment = learningRate * (1 - currentConfidence);
    return {
      confidenceAdjustment: Math.min(confidenceAdjustment, 0.1),
      weightAdjustment: 0.05,
    };
  } else {
    // False positive - decrease confidence
    const confidenceAdjustment = -learningRate * currentConfidence;
    return {
      confidenceAdjustment: Math.max(confidenceAdjustment, -0.1),
      weightAdjustment: -0.05,
    };
  }
}

// ============================================================================
// CONFIDENCE RULE MANAGEMENT
// ============================================================================

/**
 * Initialize confidence rule for an event type
 */
async function initializeConfidenceRule(eventType: PatrolEventType): Promise<AIConfidenceRule> {
  const rule: AIConfidenceRule = {
    ruleId: `rule_${eventType}`,
    eventType,
    baseConfidence: 0.5,
    currentConfidence: 0.5,
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    lastUpdatedAt: Timestamp.now(),
    totalFeedbackCount: 0,
  };
  
  await db.collection(CONFIDENCE_RULES_COLLECTION).doc(rule.ruleId).set(rule);
  return rule;
}

/**
 * Get confidence rule for an event type
 */
export async function getConfidenceRule(eventType: PatrolEventType): Promise<AIConfidenceRule | null> {
  const ruleId = `rule_${eventType}`;
  const doc = await db.collection(CONFIDENCE_RULES_COLLECTION).doc(ruleId).get();
  
  if (!doc.exists) {
    return await initializeConfidenceRule(eventType);
  }
  
  return doc.data() as AIConfidenceRule;
}

/**
 * Apply accumulated feedback to update confidence rule
 */
async function applyFeedbackIfReady(eventType: PatrolEventType): Promise<void> {
  // Get all unapplied feedback for this event type
  const feedbackSnapshot = await db.collection(FEEDBACK_COLLECTION)
    .where('flaggedViolation', '==', eventType)
    .where('feedbackApplied', '==', false)
    .get();
  
  if (feedbackSnapshot.size < DEFAULT_PATROL_CONFIG.minFeedbackForAdjustment) {
    console.log(`[Self-Learning] Not enough feedback yet for ${eventType} (${feedbackSnapshot.size}/${DEFAULT_PATROL_CONFIG.minFeedbackForAdjustment})`);
    return;
  }
  
  console.log(`[Self-Learning] Applying ${feedbackSnapshot.size} feedback items for ${eventType}`);
  
  // Get current rule
  let rule = await getConfidenceRule(eventType);
  if (!rule) {
    rule = await initializeConfidenceRule(eventType);
  }
  
  // Calculate new statistics
  let truePositives = rule.truePositives;
  let falsePositives = rule.falsePositives;
  let totalConfidenceAdjustment = 0;
  
  for (const feedbackDoc of feedbackSnapshot.docs) {
    const feedback = feedbackDoc.data() as ModerationFeedback;
    
    if (feedback.confirmed) {
      truePositives++;
    } else {
      falsePositives++;
    }
    
    totalConfidenceAdjustment += feedback.ruleConfidenceAdjustment;
  }
  
  // Update confidence
  const newConfidence = Math.max(
    0.1,
    Math.min(0.95, rule.currentConfidence + totalConfidenceAdjustment)
  );
  
  // Calculate performance metrics
  const precision = truePositives / (truePositives + falsePositives || 1);
  const recall = truePositives / (truePositives + rule.falseNegatives || 1);
  const f1Score = 2 * (precision * recall) / (precision + recall || 1);
  
  // Update rule
  await db.collection(CONFIDENCE_RULES_COLLECTION).doc(rule.ruleId).update({
    currentConfidence: newConfidence,
    truePositives,
    falsePositives,
    precision,
    recall,
    f1Score,
    lastUpdatedAt: Timestamp.now(),
    totalFeedbackCount: rule.totalFeedbackCount + feedbackSnapshot.size,
  });
  
  // Mark feedback as applied
  const batch = db.batch();
  feedbackSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      feedbackApplied: true,
      appliedAt: Timestamp.now(),
    });
  });
  await batch.commit();
  
  console.log(`[Self-Learning] Updated ${eventType} confidence: ${rule.currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} (Precision: ${precision.toFixed(2)}, Recall: ${recall.toFixed(2)}, F1: ${f1Score.toFixed(2)})`);
}

/**
 * Get current confidence for an event type
 */
export async function getCurrentConfidence(eventType: PatrolEventType): Promise<number> {
  const rule = await getConfidenceRule(eventType);
  return rule?.currentConfidence || 0.5;
}

/**
 * Get all confidence rules
 */
export async function getAllConfidenceRules(): Promise<AIConfidenceRule[]> {
  const snapshot = await db.collection(CONFIDENCE_RULES_COLLECTION).get();
  return snapshot.docs.map(doc => doc.data() as AIConfidenceRule);
}

/**
 * Get rules with low performance (need tuning)
 */
export async function getLowPerformanceRules(
  minF1Score: number = 0.6
): Promise<AIConfidenceRule[]> {
  const snapshot = await db.collection(CONFIDENCE_RULES_COLLECTION)
    .where('f1Score', '<', minF1Score)
    .where('totalFeedbackCount', '>=', 10)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as AIConfidenceRule);
}

// ============================================================================
// FEEDBACK ANALYSIS
// ============================================================================

/**
 * Get feedback statistics for a time period
 */
export async function getFeedbackStatistics(
  daysBack: number = 30
): Promise<{
  totalFeedback: number;
  confirmationRate: number;
  byEventType: Record<string, { confirmed: number; rejected: number }>;
}> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (daysBack * 24 * 60 * 60 * 1000)
  );
  
  const snapshot = await db.collection(FEEDBACK_COLLECTION)
    .where('decidedAt', '>', cutoffDate)
    .get();
  
  if (snapshot.empty) {
    return {
      totalFeedback: 0,
      confirmationRate: 0,
      byEventType: {},
    };
  }
  
  const byEventType: Record<string, { confirmed: number; rejected: number }> = {};
  let totalConfirmed = 0;
  
  for (const doc of snapshot.docs) {
    const feedback = doc.data() as ModerationFeedback;
    
    if (!byEventType[feedback.flaggedViolation]) {
      byEventType[feedback.flaggedViolation] = { confirmed: 0, rejected: 0 };
    }
    
    if (feedback.confirmed) {
      byEventType[feedback.flaggedViolation].confirmed++;
      totalConfirmed++;
    } else {
      byEventType[feedback.flaggedViolation].rejected++;
    }
  }
  
  return {
    totalFeedback: snapshot.size,
    confirmationRate: totalConfirmed / snapshot.size,
    byEventType,
  };
}

/**
 * Get moderator accuracy (for quality control)
 */
export async function getModeratorAccuracy(
  moderatorId: string,
  daysBack: number = 30
): Promise<{
  totalDecisions: number;
  consistencyScore: number;
  averageResponseTime: number;
}> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (daysBack * 24 * 60 * 60 * 1000)
  );
  
  const snapshot = await db.collection(FEEDBACK_COLLECTION)
    .where('moderatorId', '==', moderatorId)
    .where('decidedAt', '>', cutoffDate)
    .get();
  
  if (snapshot.empty) {
    return {
      totalDecisions: 0,
      consistencyScore: 0,
      averageResponseTime: 0,
    };
  }
  
  // Calculate consistency (how often moderator agrees with AI)
  let consistentDecisions = 0;
  let totalResponseTime = 0;
  
  for (const doc of snapshot.docs) {
    const feedback = doc.data() as ModerationFeedback;
    
    // Get the case to see when it was created
    const caseDoc = await db.collection('patrol_cases').doc(feedback.patrolCaseId).get();
    if (caseDoc.exists) {
      const caseData = caseDoc.data();
      const responseTime = feedback.decidedAt.toMillis() - caseData?.createdAt.toMillis();
      totalResponseTime += responseTime;
    }
    
    if (feedback.confirmed) {
      consistentDecisions++;
    }
  }
  
  return {
    totalDecisions: snapshot.size,
    consistencyScore: consistentDecisions / snapshot.size,
    averageResponseTime: totalResponseTime / snapshot.size / (1000 * 60),  // minutes
  };
}

// ============================================================================
// MANUAL RULE ADJUSTMENT (Admin only)
// ============================================================================

/**
 * Manually adjust confidence rule (admin override)
 */
export async function manuallyAdjustConfidence(
  eventType: PatrolEventType,
  newConfidence: number,
  adjustedBy: string,
  reason: string
): Promise<void> {
  if (newConfidence < 0 || newConfidence > 1) {
    throw new Error('Confidence must be between 0 and 1');
  }
  
  const rule = await getConfidenceRule(eventType);
  if (!rule) {
    throw new Error('Rule not found');
  }
  
  await db.collection(CONFIDENCE_RULES_COLLECTION).doc(rule.ruleId).update({
    currentConfidence: newConfidence,
    lastUpdatedAt: Timestamp.now(),
  });
  
  // Log the manual adjustment
  await db.collection('patrol_audit_logs').add({
    action: 'MANUAL_CONFIDENCE_ADJUSTMENT',
    eventType,
    oldConfidence: rule.currentConfidence,
    newConfidence,
    adjustedBy,
    reason,
    timestamp: Timestamp.now(),
  });
  
  console.log(`[Self-Learning] Manually adjusted ${eventType} confidence: ${rule.currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} by ${adjustedBy}`);
}

/**
 * Reset confidence rule to baseline
 */
export async function resetConfidenceRule(
  eventType: PatrolEventType,
  resetBy: string
): Promise<void> {
  const rule = await getConfidenceRule(eventType);
  if (!rule) {
    throw new Error('Rule not found');
  }
  
  await db.collection(CONFIDENCE_RULES_COLLECTION).doc(rule.ruleId).update({
    currentConfidence: rule.baseConfidence,
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    lastUpdatedAt: Timestamp.now(),
    totalFeedbackCount: 0,
  });
  
  // Log the reset
  await db.collection('patrol_audit_logs').add({
    action: 'CONFIDENCE_RULE_RESET',
    eventType,
    resetBy,
    timestamp: Timestamp.now(),
  });
  
  console.log(`[Self-Learning] Reset ${eventType} confidence rule by ${resetBy}`);
}