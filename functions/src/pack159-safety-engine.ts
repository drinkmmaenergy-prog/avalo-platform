/**
 * ============================================================================
 * PACK 159 — SAFETY ENGINE CORE LOGIC
 * ============================================================================
 * 
 * Core functions for consent state management and safety score calculations
 * 
 * @version 3.0.0
 * @module pack159-safety-engine
 */

import { db, serverTimestamp, increment } from './common';
import { logger } from './common';
import {
  ConsentState,
  ConversationConsentState,
  SafetyScore,
  SafetyScoreDimensions,
  SafetyEvent,
  SafetyEventType,
  SafetyIntervention,
  InterventionLevel,
  InterventionAction,
  MANIPULATION_PATTERNS,
  ManipulationPattern,
} from './pack159-safety-types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// CONSENT STATE MACHINE
// ============================================================================

/**
 * Evaluate and update consent state for a conversation
 */
export async function evaluateConsentState(
  conversationId: string,
  options: {
    messageContent?: string;
    userAction?: 'NO' | 'STOP' | 'BLOCK';
    senderId?: string;
  }
): Promise<{
  previousState: ConsentState;
  newState: ConsentState;
  stateChanged: boolean;
  reason?: string;
}> {
  const consentRef = db.collection('consent_states').doc(conversationId);
  const consentDoc = await consentRef.get();
  
  let currentState: ConsentState = 'CONSENSUAL';
  
  if (consentDoc.exists) {
    const data = consentDoc.data() as ConversationConsentState;
    currentState = data.state;
  }
  
  const previousState = currentState;
  let newState = currentState;
  let reason = '';
  
  // Explicit user actions override everything
  if (options.userAction === 'NO' || options.userAction === 'STOP') {
    newState = 'WITHDRAWN';
    reason = 'User explicitly withdrew consent';
  } else if (options.userAction === 'BLOCK') {
    newState = 'VIOLATED';
    reason = 'User blocked conversation due to violation';
  }
  // Analyze message content for consent signals
  else if (options.messageContent) {
    const analysis = analyzeConsentInMessage(options.messageContent);
    
    if (analysis.explicitWithdrawal) {
      newState = 'WITHDRAWN';
      reason = 'Explicit withdrawal detected in message';
    } else if (analysis.emotionalPressure) {
      newState = 'UNCLEAR';
      reason = 'Emotional pressure detected';
    } else if (analysis.repeatedAfterRejection && currentState === 'WITHDRAWN') {
      newState = 'VIOLATED';
      reason = 'Request repeated after consent withdrawal';
    }
  }
  
  // Update state if changed
  if (newState !== currentState) {
    const stateUpdate: Partial<ConversationConsentState> = {
      state: newState,
      lastStateChange: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    if (consentDoc.exists) {
      await consentRef.update({
        ...stateUpdate,
        stateHistory: FieldValue.arrayUnion({
          state: newState,
          changedAt: Timestamp.now(),
          reason,
          triggeredBy: options.userAction ? 'USER_ACTION' : 'SYSTEM_DETECTION',
        }),
      });
    } else {
      // Initialize new consent state
      const conversationDoc = await db.collection('conversations').doc(conversationId).get();
      const participants = conversationDoc.exists ? conversationDoc.data()?.participants || [] : [];
      
      await consentRef.set({
        conversationId,
        participants,
        state: newState,
        lastStateChange: Timestamp.now(),
        stateHistory: [{
          state: newState,
          changedAt: Timestamp.now(),
          reason,
          triggeredBy: options.userAction ? 'USER_ACTION' : 'SYSTEM_DETECTION',
        }],
        hasActiveWarning: false,
        violationCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as ConversationConsentState);
    }
    
    // Record safety event if violation occurred
    if (newState === 'VIOLATED') {
      await recordSafetyEvent({
        userId: options.senderId || 'unknown',
        eventType: 'CONSENT_VIOLATION',
        conversationId,
        detectionMethod: options.userAction ? 'USER_REPORT' : 'AUTO',
        confidence: options.userAction ? 1.0 : 0.8,
        dimensionAffected: 'respectingConsent',
        scoreImpact: -15,
        evidence: {
          messageContent: options.messageContent,
          reason,
        },
      });
    }
  }
  
  return {
    previousState,
    newState,
    stateChanged: newState !== previousState,
    reason: newState !== previousState ? reason : undefined,
  };
}

/**
 * Analyze message content for consent signals
 */
function analyzeConsentInMessage(content: string): {
  explicitWithdrawal: boolean;
  emotionalPressure: boolean;
  repeatedAfterRejection: boolean;
} {
  const lowerContent = content.toLowerCase();
  
  // Explicit withdrawal keywords
  const withdrawalKeywords = ['no', 'stop', 'don\'t', 'not interested', 'leave me alone', 'uncomfortable'];
  const explicitWithdrawal = withdrawalKeywords.some(kw => lowerContent.includes(kw));
  
  // Emotional pressure indicators
  const pressureKeywords = ['you should', 'you must', 'you owe', 'after i paid'];
  const emotionalPressure = pressureKeywords.some(kw => lowerContent.includes(kw));
  
  // Note: repeatedAfterRejection requires conversation history analysis
  const repeatedAfterRejection = false;
  
  return {
    explicitWithdrawal,
    emotionalPressure,
    repeatedAfterRejection,
  };
}

/**
 * Update consent state based on message
 */
export async function updateConsentState(
  conversationId: string,
  messageContent: string,
  senderId: string
): Promise<void> {
  await evaluateConsentState(conversationId, {
    messageContent,
    senderId,
  });
}

// ============================================================================
// SAFETY SCORE MANAGEMENT
// ============================================================================

/**
 * Initialize safety score for new user
 */
export async function initializeSafetyScore(userId: string): Promise<SafetyScore> {
  const scoreRef = db.collection('safety_scores').doc(userId);
  
  const initialScore: SafetyScore = {
    userId,
    overallScore: 100,
    dimensions: {
      respectingConsent: 100,
      toneAndBoundaries: 100,
      paymentEthics: 100,
      platformSafety: 100,
    },
    riskLevel: 'SAFE',
    lastDecayAt: Timestamp.now(),
    decayEligible: true,
    lastRecalculatedAt: Timestamp.now(),
    totalViolations: 0,
    consecutiveGoodBehaviorDays: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  await scoreRef.set(initialScore);
  return initialScore;
}

/**
 * Get safety score for user (create if doesn't exist)
 */
export async function getSafetyScore(userId: string): Promise<SafetyScore> {
  const scoreRef = db.collection('safety_scores').doc(userId);
  const scoreDoc = await scoreRef.get();
  
  if (!scoreDoc.exists) {
    return await initializeSafetyScore(userId);
  }
  
  return scoreDoc.data() as SafetyScore;
}

/**
 * Calculate risk level from score
 */
function calculateRiskLevel(score: number): SafetyScore['riskLevel'] {
  if (score >= 80) return 'SAFE';
  if (score >= 60) return 'LOW_RISK';
  if (score >= 40) return 'MEDIUM_RISK';
  if (score >= 20) return 'HIGH_RISK';
  return 'CRITICAL';
}

/**
 * Apply safety score adjustment
 */
export async function applySafetyScoreAdjustment(
  userId: string,
  dimension: keyof SafetyScoreDimensions,
  adjustment: number,
  eventId: string
): Promise<{
  previousScore: number;
  newScore: number;
  interventionTriggered: boolean;
  interventionLevel?: InterventionLevel;
}> {
  const scoreRef = db.collection('safety_scores').doc(userId);
  const scoreDoc = await scoreRef.get();
  
  let currentScore: SafetyScore;
  if (!scoreDoc.exists) {
    currentScore = await initializeSafetyScore(userId);
  } else {
    currentScore = scoreDoc.data() as SafetyScore;
  }
  
  const previousDimensionScore = currentScore.dimensions[dimension];
  const newDimensionScore = Math.max(0, Math.min(100, previousDimensionScore + adjustment));
  
  // Update dimension
  const updatedDimensions = {
    ...currentScore.dimensions,
    [dimension]: newDimensionScore,
  };
  
  // Recalculate overall score (average of all dimensions)
  const overallScore = Math.round(
    (updatedDimensions.respectingConsent +
     updatedDimensions.toneAndBoundaries +
     updatedDimensions.paymentEthics +
     updatedDimensions.platformSafety) / 4
  );
  
  const riskLevel = calculateRiskLevel(overallScore);
  
  // Update score
  await scoreRef.update({
    dimensions: updatedDimensions,
    overallScore,
    riskLevel,
    lastRecalculatedAt: Timestamp.now(),
    totalViolations: adjustment < 0 ? FieldValue.increment(1) : currentScore.totalViolations,
    consecutiveGoodBehaviorDays: adjustment > 0 ? FieldValue.increment(1) : 0,
    updatedAt: Timestamp.now(),
  });
  
  // Check if intervention is needed
  const intervention = await checkInterventionNeeded(userId, overallScore, currentScore.totalViolations + (adjustment < 0 ? 1 : 0));
  
  return {
    previousScore: currentScore.overallScore,
    newScore: overallScore,
    interventionTriggered: intervention.triggered,
    interventionLevel: intervention.level,
  };
}

/**
 * Check if intervention is needed and apply
 */
async function checkInterventionNeeded(
  userId: string,
  score: number,
  totalViolations: number
): Promise<{ triggered: boolean; level?: InterventionLevel }> {
  let level: InterventionLevel | undefined;
  let action: InterventionAction | undefined;
  
  // Determine intervention level based on score and violations
  if (score < 20 || totalViolations >= 10) {
    level = 5;
    action = 'ACCOUNT_BAN';
  } else if (score < 40 || totalViolations >= 7) {
    level = 4;
    action = 'MESSAGING_TIMEOUT';
  } else if (score < 60 || totalViolations >= 5) {
    level = 3;
    action = 'CHAT_FREEZE';
  } else if (score < 70 || totalViolations >= 3) {
    level = 2;
    action = 'MESSAGE_SLOWDOWN';
  } else if (score < 80 || totalViolations >= 2) {
    level = 1;
    action = 'SOFT_WARNING';
  }
  
  if (level && action) {
    // Check if similar intervention already exists
    const existingIntervention = await db
      .collection('safety_interventions')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .where('level', '>=', level)
      .limit(1)
      .get();
    
    if (existingIntervention.empty) {
      await applyIntervention(userId, level, action, `Score: ${score}, Violations: ${totalViolations}`);
      return { triggered: true, level };
    }
  }
  
  return { triggered: false };
}

/**
 * Apply intervention to user
 */
async function applyIntervention(
  userId: string,
  level: InterventionLevel,
  action: InterventionAction,
  reason: string,
  triggeringEventId?: string
): Promise<string> {
  const interventionId = db.collection('safety_interventions').doc().id;
  
  // Calculate duration based on level
  const durationMinutes = calculateInterventionDuration(level, action);
  const expiresAt = durationMinutes ? Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000) : undefined;
  
  const intervention: SafetyIntervention = {
    interventionId,
    userId,
    level,
    action,
    triggeringEventId: triggeringEventId || 'score_threshold',
    reason,
    durationMinutes,
    expiresAt,
    active: true,
    createdAt: Timestamp.now(),
  };
  
  await db.collection('safety_interventions').doc(interventionId).set(intervention);
  
  logger.warn(`Applied intervention ${action} (level ${level}) to user ${userId}: ${reason}`);
  
  return interventionId;
}

/**
 * Calculate intervention duration in minutes
 */
function calculateInterventionDuration(level: InterventionLevel, action: InterventionAction): number | undefined {
  if (action === 'ACCOUNT_BAN') return undefined; // Permanent until appealed
  if (action === 'MESSAGING_TIMEOUT') return 24 * 60; // 24 hours
  if (action === 'CHAT_FREEZE') return 12 * 60; // 12 hours
  if (action === 'MESSAGE_SLOWDOWN') return 6 * 60; // 6 hours
  if (action === 'SOFT_WARNING') return 1 * 60; // 1 hour
  return undefined;
}

// ============================================================================
// SAFETY EVENT RECORDING
// ============================================================================

/**
 * Record a safety event
 */
export async function recordSafetyEvent(params: {
  userId: string;
  eventType: SafetyEventType;
  conversationId?: string;
  messageId?: string;
  targetUserId?: string;
  detectionMethod: 'AUTO' | 'USER_REPORT' | 'MANUAL_REVIEW';
  confidence: number;
  dimensionAffected: keyof SafetyScoreDimensions;
  scoreImpact: number;
  evidence?: Record<string, any>;
}): Promise<string> {
  const eventId = db.collection('safety_events').doc().id;
  
  const event: SafetyEvent = {
    eventId,
    userId: params.userId,
    eventType: params.eventType,
    conversationId: params.conversationId,
    messageId: params.messageId,
    targetUserId: params.targetUserId,
    detectionMethod: params.detectionMethod,
    confidence: params.confidence,
    dimensionAffected: params.dimensionAffected,
    scoreImpact: params.scoreImpact,
    evidence: params.evidence,
    resolved: false,
    createdAt: Timestamp.now(),
  };
  
  await db.collection('safety_events').doc(eventId).set(event);
  
  // Apply score adjustment
  await applySafetyScoreAdjustment(
    params.userId,
    params.dimensionAffected,
    params.scoreImpact,
    eventId
  );
  
  logger.info(`Recorded safety event ${params.eventType} for user ${params.userId}, impact: ${params.scoreImpact}`);
  
  return eventId;
}

// ============================================================================
// MANIPULATION DETECTION
// ============================================================================

/**
 * Detect manipulation patterns in message
 */
export function detectManipulation(messageContent: string): {
  detected: boolean;
  patterns: ManipulationPattern[];
  confidence: number;
} {
  const lowerContent = messageContent.toLowerCase();
  const detectedPatterns: ManipulationPattern[] = [];
  
  for (const pattern of MANIPULATION_PATTERNS) {
    if (!pattern.active) continue;
    
    // Check keywords
    const keywordMatches = pattern.keywords.filter(kw => 
      lowerContent.includes(kw.toLowerCase())
    );
    
    if (keywordMatches.length > 0) {
      detectedPatterns.push(pattern);
    }
    
    // Check regex if provided
    if (pattern.regex) {
      try {
        const regex = new RegExp(pattern.regex, 'i');
        if (regex.test(messageContent)) {
          if (!detectedPatterns.includes(pattern)) {
            detectedPatterns.push(pattern);
          }
        }
      } catch (e) {
        logger.error(`Invalid regex in pattern ${pattern.patternId}:`, e);
      }
    }
  }
  
  // Calculate confidence based on number of patterns and their severity
  let confidence = 0;
  if (detectedPatterns.length > 0) {
    const severityWeights = { LOW: 0.2, MEDIUM: 0.5, HIGH: 0.75, CRITICAL: 1.0 };
    confidence = detectedPatterns.reduce((sum, p) => sum + severityWeights[p.severity], 0) / detectedPatterns.length;
  }
  
  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    confidence: Math.min(confidence, 1.0),
  };
}

/**
 * Block unsafe message
 */
export async function blockUnsafeMessage(
  conversationId: string,
  messageContent: string,
  senderId: string
): Promise<{
  blocked: boolean;
  reason?: string;
  feedbackCardId?: string;
}> {
  // Check for manipulation patterns
  const manipulation = detectManipulation(messageContent);
  
  if (manipulation.detected && manipulation.confidence > 0.6) {
    // Block message
    const highestSeverity = manipulation.patterns.reduce((max, p) => 
      p.severity === 'CRITICAL' ? 'CRITICAL' : max === 'CRITICAL' ? 'CRITICAL' : p.severity, 
      'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    );
    
    const primaryPattern = manipulation.patterns[0];
    
    // Record event
    const eventId = await recordSafetyEvent({
      userId: senderId,
      eventType: getEventTypeForPattern(primaryPattern),
      conversationId,
      detectionMethod: 'AUTO',
      confidence: manipulation.confidence,
      dimensionAffected: primaryPattern.dimensionAffected,
      scoreImpact: -10 * (highestSeverity === 'CRITICAL' ? 2 : highestSeverity === 'HIGH' ? 1.5 : 1),
      evidence: {
        messageContent,
        patternsDetected: manipulation.patterns.map(p => p.name),
      },
    });
    
    // Create feedback card
    const feedbackCardId = await createSafetyFeedbackCard(
      senderId,
      eventId,
      primaryPattern,
      manipulation.confidence > 0.8 ? 'CRITICAL' : 'WARNING'
    );
    
    return {
      blocked: true,
      reason: `Message blocked due to detected ${primaryPattern.name.toLowerCase()}`,
      feedbackCardId,
    };
  }
  
  return { blocked: false };
}

/**
 * Get event type for manipulation pattern
 */
function getEventTypeForPattern(pattern: ManipulationPattern): SafetyEventType {
  const eventTypeMap: Record<string, SafetyEventType> = {
    'GUILT_TRIP': 'EMOTIONAL_FOR_TOKENS',
    'FAKE_ULTIMATUM': 'PAYMENT_PRESSURE',
    'REPUTATION_THREAT': 'THREATS',
    'PARASOCIAL_LEVERAGE': 'EMOTIONAL_FOR_TOKENS',
    'FEAR_MANIPULATION': 'THREATS',
  };
  
  return eventTypeMap[pattern.patternId] || 'CONSENT_VIOLATION';
}

/**
 * Create safety feedback card
 */
async function createSafetyFeedbackCard(
  userId: string,
  eventId: string,
  pattern: ManipulationPattern,
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
): Promise<string> {
  const cardId = db.collection('safety_feedback_cards').doc().id;
  
  const card = {
    cardId,
    userId,
    eventId,
    title: severity === 'CRITICAL' ? '🚨 Message Blocked' : '⚠️ Safety Warning',
    message: `Your message was ${severity === 'CRITICAL' ? 'blocked' : 'flagged'} due to ${pattern.name.toLowerCase()}. ${pattern.description}`,
    severity,
    suggestedAction: getSuggestedAction(pattern),
    dismissed: false,
    createdAt: Timestamp.now(),
  };
  
  await db.collection('safety_feedback_cards').doc(cardId).set(card);
  
  return cardId;
}

/**
 * Get suggested action for pattern
 */
function getSuggestedAction(pattern: ManipulationPattern): string {
  const suggestions: Record<string, string> = {
    'GUILT_TRIP': 'Focus on positive interactions rather than referencing past payments',
    'FAKE_ULTIMATUM': 'Communicate respectfully without threats or pressure',
    'REPUTATION_THREAT': 'Resolve conflicts through proper channels, not threats',
    'PARASOCIAL_LEVERAGE': 'Respect boundaries and understand payments don\'t create obligations',
    'FEAR_MANIPULATION': 'Communicate with respect and without intimidation',
  };
  
  return suggestions[pattern.patternId] || 'Please review our community guidelines';
}

// ============================================================================
// SCORE DECAY (Natural Recovery)
// ============================================================================

/**
 * Apply good behavior decay (score improvement over time)
 */
export async function applyScoreDecay(userId: string): Promise<void> {
  const scoreRef = db.collection('safety_scores').doc(userId);
  const scoreDoc = await scoreRef.get();
  
  if (!scoreDoc.exists) return;
  
  const score = scoreDoc.data() as SafetyScore;
  
  // Check if decay eligible (24+ hours since last decay)
  const hoursSinceLastDecay = (Date.now() - score.lastDecayAt.toMillis()) / (1000 * 60 * 60);
  
  if (hoursSinceLastDecay < 24) return;
  
  // Apply small positive adjustment to each dimension (max 100)
  const decayAmount = 2; // +2 points per day of good behavior
  
  const updatedDimensions: SafetyScoreDimensions = {
    respectingConsent: Math.min(100, score.dimensions.respectingConsent + decayAmount),
    toneAndBoundaries: Math.min(100, score.dimensions.toneAndBoundaries + decayAmount),
    paymentEthics: Math.min(100, score.dimensions.paymentEthics + decayAmount),
    platformSafety: Math.min(100, score.dimensions.platformSafety + decayAmount),
  };
  
  const overallScore = Math.round(
    (updatedDimensions.respectingConsent +
     updatedDimensions.toneAndBoundaries +
     updatedDimensions.paymentEthics +
     updatedDimensions.platformSafety) / 4
  );
  
  await scoreRef.update({
    dimensions: updatedDimensions,
    overallScore,
    riskLevel: calculateRiskLevel(overallScore),
    lastDecayAt: Timestamp.now(),
    consecutiveGoodBehaviorDays: FieldValue.increment(1),
    updatedAt: Timestamp.now(),
  });
  
  logger.info(`Applied score decay to user ${userId}: ${score.overallScore} -> ${overallScore}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  evaluateConsentState,
  updateConsentState,
  initializeSafetyScore,
  getSafetyScore,
  applySafetyScoreAdjustment,
  recordSafetyEvent,
  detectManipulation,
  blockUnsafeMessage,
  applyScoreDecay,
};