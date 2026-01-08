/**
 * PACK 153 — Avalo Anti-Harassment & Hate-Speech Neural Filter 2.0
 * 
 * Core Safety Evaluation Engine
 * Real-Time Intervention · Multilingual · Cross-Media · Zero Over-Blocking
 */

import { db, serverTimestamp, generateId } from './init';
import {
  SafetyIncident,
  HarassmentCase,
  BlockedMessage,
  SafetyStatus,
  SafetyAppeal,
  ViolationType,
  ViolationSeverity,
  ContentType,
  SafetyAction,
  ContentClassificationResult,
  calculatePenaltyLevel,
  getPenaltyLevelName,
  getViolationSeverity,
  determineAction,
  validateSafetyIncident,
  isProtectedContent,
} from './types/safety.types';
import { trackHarassmentDetected, trackSafetyViolation } from './reputation-integrations';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CORE SAFETY EVALUATION
// ============================================================================

/**
 * Evaluate message safety before sending
 */
export async function evaluateMessageSafety(params: {
  userId: string;
  content: string;
  contentType: ContentType;
  targetUserId?: string;
  conversationId?: string;
  contextId?: string; // eventId, streamId, etc.
}): Promise<{
  allowed: boolean;
  action: SafetyAction;
  violationType?: ViolationType;
  severity?: ViolationSeverity;
  messageToUser: string;
  educationTipId?: string;
  incidentId?: string;
}> {
  const { userId, content, contentType, targetUserId, conversationId, contextId } = params;

  // Get user's current safety status
  const safetyStatus = await getSafetyStatus(userId);

  // Check if user is currently restricted
  if (safetyStatus.restrictions.platformBanned) {
    return {
      allowed: false,
      action: SafetyAction.PLATFORM_BAN,
      messageToUser: 'Your account has been suspended for safety violations.',
    };
  }

  // Classify content using ML
  const classification = await classifyContent({
    content,
    contentType,
    userId,
    targetUserId,
  });

  // Check if content is protected (never block)
  if (isProtectedContent(classification)) {
    return {
      allowed: true,
      action: SafetyAction.EDUCATION_TIP,
      messageToUser: 'Message approved',
    };
  }

  // Check for violations
  if (classification.violations.length > 0) {
    const primaryViolation = classification.violations[0];
    const severity = primaryViolation.severity;
    const violationType = primaryViolation.type;

    // Determine action based on severity and user history
    const action = determineAction(severity, safetyStatus.penaltyLevel);

    // Create incident
    const incidentId = await logSafetyIncident({
      userId,
      violationType,
      severity,
      contentType,
      contentId: generateId(),
      contentSnippet: content.substring(0, 200),
      detectionMethod: 'ML_CLASSIFIER',
      confidence: primaryViolation.confidence,
      actionTaken: action,
      targetUserId,
      conversationId,
    });

    // Block message
    if (action !== SafetyAction.WARNING && action !== SafetyAction.EDUCATION_TIP) {
      await recordBlockedMessage({
        userId,
        originalMessage: content,
        detectedViolation: violationType,
        confidence: primaryViolation.confidence,
        targetUserId,
        conversationId,
      });
    }

    // Apply penalty
    await applySafetyPenalty(userId, severity);

    // Get education tip
    const educationTip = await getEducationTip(violationType);

    return {
      allowed: action === SafetyAction.WARNING || action === SafetyAction.EDUCATION_TIP,
      action,
      violationType,
      severity,
      messageToUser: getMessageForAction(action, violationType),
      educationTipId: educationTip?.tipId,
      incidentId,
    };
  }

  // Apply slow-down if active
  if (safetyStatus.restrictions.slowDownActive) {
    const now = new Date();
    const slowDownUntil = safetyStatus.restrictions.slowDownUntil?.toDate();
    
    if (slowDownUntil && now < slowDownUntil) {
      // Rate limiting active - check if user should wait
      return {
        allowed: true, // Allow but remind of slow-down
        action: SafetyAction.SLOW_DOWN,
        messageToUser: 'Message approved. Please maintain respectful communication.',
      };
    }
  }

  // Content is safe
  return {
    allowed: true,
    action: SafetyAction.EDUCATION_TIP,
    messageToUser: 'Message approved',
  };
}

/**
 * Evaluate voice content safety during call
 */
export async function evaluateVoiceSafety(params: {
  userId: string;
  transcriptSegment: string;
  callId: string;
  participantIds: string[];
}): Promise<{
  violationDetected: boolean;
  action?: SafetyAction;
  severity?: ViolationSeverity;
  shouldMute: boolean;
  shouldTerminate: boolean;
}> {
  const { userId, transcriptSegment, callId, participantIds } = params;

  // Classify voice content
  const classification = await classifyContent({
    content: transcriptSegment,
    contentType: ContentType.VOICE_CALL,
    userId,
  });

  if (classification.violations.length > 0) {
    const primaryViolation = classification.violations[0];
    const severity = primaryViolation.severity;

    // Get safety status
    const safetyStatus = await getSafetyStatus(userId);
    const action = determineAction(severity, safetyStatus.penaltyLevel);

    // Log incident
    await logSafetyIncident({
      userId,
      violationType: primaryViolation.type,
      severity,
      contentType: ContentType.VOICE_CALL,
      contentId: callId,
      contentSnippet: transcriptSegment.substring(0, 100),
      detectionMethod: 'ML_CLASSIFIER',
      confidence: primaryViolation.confidence,
      actionTaken: action,
    });

    // Apply penalty
    await applySafetyPenalty(userId, severity);

    return {
      violationDetected: true,
      action,
      severity,
      shouldMute: severity === ViolationSeverity.HIGH || severity === ViolationSeverity.CRITICAL,
      shouldTerminate: severity === ViolationSeverity.CRITICAL,
    };
  }

  return {
    violationDetected: false,
    shouldMute: false,
    shouldTerminate: false,
  };
}

// ============================================================================
// INCIDENT LOGGING
// ============================================================================

/**
 * Log a safety incident
 */
export async function logSafetyIncident(params: {
  userId: string;
  violationType: ViolationType;
  severity: ViolationSeverity;
  contentType: ContentType;
  contentId: string;
  contentSnippet?: string;
  detectionMethod: 'ML_CLASSIFIER' | 'USER_REPORT' | 'MANUAL_REVIEW' | 'PATTERN_DETECTION';
  confidence: number;
  actionTaken: SafetyAction;
  targetUserId?: string;
  conversationId?: string;
  eventId?: string;
}): Promise<string> {
  const incidentId = generateId();

  const incident: Partial<SafetyIncident> = {
    incidentId,
    userId: params.userId,
    violationType: params.violationType,
    severity: params.severity,
    contentType: params.contentType,
    contentId: params.contentId,
    contentSnippet: params.contentSnippet,
    detectionMethod: params.detectionMethod,
    confidence: params.confidence,
    actionTaken: params.actionTaken,
    blockedFromSending: params.actionTaken !== SafetyAction.WARNING,
    targetUserId: params.targetUserId,
    conversationId: params.conversationId,
    eventId: params.eventId,
    reviewed: false,
    appealed: false,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  // Validate incident
  const validation = validateSafetyIncident(incident);
  if (!validation.valid) {
    throw new Error(`Invalid safety incident: ${validation.errors.join(', ')}`);
  }

  // Save to Firestore
  await db.collection('safety_incidents').doc(incidentId).set(incident);

  // Check for harassment patterns
  if (params.targetUserId) {
    await checkHarassmentPattern(params.userId, params.targetUserId, incidentId);
  }

  // Integrate with reputation system
  await integrateSafetyWithReputation(params.userId, params.violationType, params.severity);

  return incidentId;
}

/**
 * Check for harassment patterns
 */
async function checkHarassmentPattern(
  harasserId: string,
  victimId: string,
  newIncidentId: string
): Promise<void> {
  // Get existing case between these users
  const casesSnapshot = await db
    .collection('harassment_cases')
    .where('harasserId', '==', harasserId)
    .where('victimId', '==', victimId)
    .where('status', 'in', ['OPEN', 'MONITORING'])
    .limit(1)
    .get();

  if (casesSnapshot.empty) {
    // Create new case
    const caseId = generateId();
    const harassmentCase: Partial<HarassmentCase> = {
      caseId,
      harasserId,
      victimId,
      incidentIds: [newIncidentId],
      incidentCount: 1,
      pattern: 'SINGLE',
      severity: ViolationSeverity.LOW,
      stopRequested: false,
      violationsAfterStop: 0,
      status: 'OPEN',
      actionsTaken: [],
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('harassment_cases').doc(caseId).set(harassmentCase);
  } else {
    // Update existing case
    const caseDoc = casesSnapshot.docs[0];
    const caseData = caseDoc.data() as HarassmentCase;

    const incidentCount = caseData.incidentCount + 1;
    let pattern: 'SINGLE' | 'REPEATED' | 'ESCALATING' | 'COORDINATED' = 'REPEATED';
    
    if (incidentCount >= 5) {
      pattern = 'ESCALATING';
    }

    let severity = ViolationSeverity.MEDIUM;
    if (incidentCount >= 5) {
      severity = ViolationSeverity.HIGH;
    }
    if (incidentCount >= 10 || caseData.stopRequested) {
      severity = ViolationSeverity.CRITICAL;
    }

    const update: Partial<HarassmentCase> = {
      incidentIds: [...caseData.incidentIds, newIncidentId],
      incidentCount,
      pattern,
      severity,
      violationsAfterStop: caseData.stopRequested ? caseData.violationsAfterStop + 1 : 0,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('harassment_cases').doc(caseDoc.id).update(update);
  }
}

/**
 * Record blocked message
 */
async function recordBlockedMessage(params: {
  userId: string;
  originalMessage: string;
  detectedViolation: ViolationType;
  confidence: number;
  targetUserId?: string;
  conversationId?: string;
}): Promise<void> {
  const messageId = generateId();

  const blockedMessage: Partial<BlockedMessage> = {
    messageId,
    userId: params.userId,
    originalMessage: params.originalMessage,
    detectedViolation: params.detectedViolation,
    confidence: params.confidence,
    targetUserId: params.targetUserId,
    conversationId: params.conversationId,
    correctionAttempted: false,
    sentAlternative: false,
    educationTipShown: false,
    blockedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('blocked_messages').doc(messageId).set(blockedMessage);
}

// ============================================================================
// PENALTY MANAGEMENT
// ============================================================================

/**
 * Get user's safety status
 */
export async function getSafetyStatus(userId: string): Promise<SafetyStatus> {
  const doc = await db.collection('safety_status').doc(userId).get();

  if (!doc.exists) {
    // Create initial status
    const initialStatus: Partial<SafetyStatus> = {
      userId,
      penaltyLevel: 0,
      penaltyLevelName: 'CLEAN',
      incidentCount30d: 0,
      minorIncidents: 0,
      moderateIncidents: 0,
      severeIncidents: 0,
      restrictions: {
        slowDownActive: false,
        featuresBanned: [],
        platformBanned: false,
      },
      cleanStreak: 0,
      reputationImpactApplied: false,
      lastUpdatedAt: serverTimestamp() as Timestamp,
      createdAt: serverTimestamp() as Timestamp,
    };

    await db.collection('safety_status').doc(userId).set(initialStatus);
    return initialStatus as SafetyStatus;
  }

  return doc.data() as SafetyStatus;
}

/**
 * Apply safety penalty
 */
export async function applySafetyPenalty(
  userId: string,
  severity: ViolationSeverity
): Promise<void> {
  const status = await getSafetyStatus(userId);

  // Increment incident counters
  let minorIncidents = status.minorIncidents;
  let moderateIncidents = status.moderateIncidents;
  let severeIncidents = status.severeIncidents;

  if (severity === ViolationSeverity.LOW) {
    minorIncidents++;
  } else if (severity === ViolationSeverity.MEDIUM) {
    moderateIncidents++;
  } else {
    severeIncidents++;
  }

  // Calculate new penalty level
  const newPenaltyLevel = calculatePenaltyLevel(
    minorIncidents,
    moderateIncidents,
    severeIncidents
  );

  // Determine restrictions
  const restrictions = {
    slowDownActive: newPenaltyLevel >= 2,
    slowDownUntil: newPenaltyLevel >= 2 
      ? Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) // 24 hours
      : undefined,
    featuresBanned: newPenaltyLevel >= 3 ? ['groups', 'events', 'calls'] : [],
    featureBansUntil: newPenaltyLevel >= 3
      ? Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days
      : undefined,
    platformBanned: newPenaltyLevel >= 4,
    platformBanUntil: newPenaltyLevel >= 4 ? undefined : undefined, // Permanent for level 4
    platformBanReason: newPenaltyLevel >= 4 ? 'Multiple severe safety violations' : undefined,
  };

  // Update status
  await db.collection('safety_status').doc(userId).update({
    penaltyLevel: newPenaltyLevel,
    penaltyLevelName: getPenaltyLevelName(newPenaltyLevel),
    incidentCount30d: status.incidentCount30d + 1,
    minorIncidents,
    moderateIncidents,
    severeIncidents,
    restrictions,
    cleanStreak: 0,
    lastIncidentAt: serverTimestamp(),
    lastUpdatedAt: serverTimestamp(),
  });
}

// ============================================================================
// APPEALS
// ============================================================================

/**
 * Submit appeal for safety decision
 */
export async function submitSafetyAppeal(params: {
  userId: string;
  incidentId: string;
  reason: string;
  evidence?: string;
}): Promise<string> {
  const appealId = generateId();

  const appeal: Partial<SafetyAppeal> = {
    appealId,
    userId: params.userId,
    incidentId: params.incidentId,
    reason: params.reason,
    evidence: params.evidence,
    status: 'PENDING',
    incidentReversed: false,
    penaltyAdjusted: false,
    submittedAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('safety_appeals').doc(appealId).set(appeal);

  // Mark incident as appealed
  await db.collection('safety_incidents').doc(params.incidentId).update({
    appealed: true,
    appealId,
    updatedAt: serverTimestamp(),
  });

  return appealId;
}

/**
 * Review and process appeal (admin function)
 */
export async function reviewSafetyAppeal(params: {
  appealId: string;
  reviewerId: string;
  approved: boolean;
  reviewerNotes: string;
}): Promise<void> {
  const { appealId, reviewerId, approved, reviewerNotes } = params;

  const appealDoc = await db.collection('safety_appeals').doc(appealId).get();
  if (!appealDoc.exists) {
    throw new Error('Appeal not found');
  }

  const appeal = appealDoc.data() as SafetyAppeal;

  // Update appeal status
  await db.collection('safety_appeals').doc(appealId).update({
    status: approved ? 'APPROVED' : 'REJECTED',
    reviewedBy: reviewerId,
    reviewedAt: serverTimestamp(),
    reviewerNotes,
    incidentReversed: approved,
    penaltyAdjusted: approved,
    updatedAt: serverTimestamp(),
  });

  if (approved) {
    // Reverse incident
    await db.collection('safety_incidents').doc(appeal.incidentId).update({
      reviewed: true,
      reviewedBy: reviewerId,
      reviewedAt: serverTimestamp(),
      reviewNotes: 'Appeal approved - incident reversed',
      updatedAt: serverTimestamp(),
    });

    // Adjust penalty - reduce incident count
    const status = await getSafetyStatus(appeal.userId);
    await db.collection('safety_status').doc(appeal.userId).update({
      incidentCount30d: Math.max(0, status.incidentCount30d - 1),
      lastUpdatedAt: serverTimestamp(),
    });
  }
}

// ============================================================================
// EDUCATION TIPS
// ============================================================================

/**
 * Get education tip for violation type
 */
async function getEducationTip(violationType: ViolationType): Promise<any | null> {
  const snapshot = await db
    .collection('safety_education_tips')
    .where('violationType', '==', violationType)
    .where('active', '==', true)
    .orderBy('priority', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

// ============================================================================
// REPUTATION INTEGRATION
// ============================================================================

/**
 * Integrate safety violations with reputation system
 */
async function integrateSafetyWithReputation(
  userId: string,
  violationType: ViolationType,
  severity: ViolationSeverity
): Promise<void> {
  // Map severity to reputation impact level
  let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  
  if (severity === ViolationSeverity.CRITICAL) {
    level = 'CRITICAL';
  } else if (severity === ViolationSeverity.HIGH) {
    level = 'HIGH';
  } else if (severity === ViolationSeverity.MEDIUM) {
    level = 'MEDIUM';
  }

  // Track in reputation system
  const incidentId = generateId();
  
  try {
    await trackHarassmentDetected(userId, incidentId, level);
    await trackSafetyViolation(userId, violationType, incidentId);
  } catch (error) {
    console.error('Error integrating with reputation system:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user-friendly message for action
 */
function getMessageForAction(action: SafetyAction, violationType: ViolationType): string {
  switch (action) {
    case SafetyAction.WARNING:
      return 'Your message may violate our community guidelines. Please review and edit.';
    case SafetyAction.MESSAGE_BLOCKED:
      return 'Your message was blocked for violating our safety policies.';
    case SafetyAction.SLOW_DOWN:
      return 'Please slow down and maintain respectful communication.';
    case SafetyAction.FEATURE_FREEZE:
      return 'Your access to certain features has been temporarily restricted.';
    case SafetyAction.FEATURE_BAN:
      return 'You have been banned from this feature due to safety violations.';
    case SafetyAction.PLATFORM_BAN:
      return 'Your account has been suspended for serious safety violations.';
    default:
      return 'Please review our community guidelines.';
  }
}

/**
 * Classify content using ML (placeholder - to be implemented with actual ML service)
 */
async function classifyContent(params: {
  content: string;
  contentType: ContentType;
  userId: string;
  targetUserId?: string;
}): Promise<ContentClassificationResult> {
  // This is a placeholder that simulates ML classification
  // In production, this would call an actual ML service
  
  const startTime = Date.now();
  
  // Basic keyword detection for demonstration
  const violations = detectViolations(params.content);
  
  return {
    contentType: params.contentType,
    content: params.content,
    sentiment: {
      score: 0,
      label: 'NEUTRAL',
    },
    toxicity: {
      score: violations.length > 0 ? 75 : 10,
      categories: violations.map(v => ({ category: v.type, score: v.confidence })),
    },
    violations,
    language: 'en',
    languageConfidence: 95,
    contextFlags: {
      isHumor: false,
      isSarcasm: false,
      isDebate: false,
      isDirected: !!params.targetUserId,
      targetUserId: params.targetUserId,
    },
    shouldBlock: violations.some(v => v.severity === ViolationSeverity.HIGH || v.severity === ViolationSeverity.CRITICAL),
    shouldWarn: violations.length > 0,
    shouldEducate: violations.length > 0,
    processingTimeMs: Date.now() - startTime,
    modelVersion: '1.0.0',
    timestamp: serverTimestamp() as Timestamp,
  };
}

/**
 * Basic violation detection (to be replaced with ML)
 */
function detectViolations(content: string): Array<{
  type: ViolationType;
  confidence: number;
  severity: ViolationSeverity;
  explanation: string;
}> {
  const violations: Array<{
    type: ViolationType;
    confidence: number;
    severity: ViolationSeverity;
    explanation: string;
  }> = [];

  const lower = content.toLowerCase();

  // Check for violent threats
  if (lower.includes('kill') || lower.includes('hurt') || lower.includes('attack')) {
    violations.push({
      type: ViolationType.VIOLENT_THREAT,
      confidence: 85,
      severity: ViolationSeverity.CRITICAL,
      explanation: 'Content contains violent language',
    });
  }

  // Check for harassment keywords
  if (lower.includes('stupid') || lower.includes('idiot') || lower.includes('hate you')) {
    violations.push({
      type: ViolationType.TARGETED_HARASSMENT,
      confidence: 70,
      severity: ViolationSeverity.MEDIUM,
      explanation: 'Content contains harassing language',
    });
  }

  return violations;
}