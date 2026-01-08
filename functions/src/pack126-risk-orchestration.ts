/**
 * PACK 126 — Background Risk Orchestration
 * 
 * Unified risk assessment engine pulling signals from all safety systems
 * Routes to appropriate enforcement without affecting monetization
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  RiskOrchestrationInput,
  RiskSignalSource,
  RiskOrchestrationResult,
  SafetyAuditLog,
} from './types/pack126-types';
import { activateHarassmentShield } from './pack126-harassment-shield';
import { pauseConsent } from './pack126-consent-protocol';

const SAFETY_AUDIT_COLLECTION = 'safety_audit_logs';

// ============================================================================
// RISK ORCHESTRATION ENGINE
// ============================================================================

/**
 * Main orchestration function - pulls signals from all safety systems
 * and determines appropriate action
 */
export async function orchestrateRiskAssessment(
  input: RiskOrchestrationInput
): Promise<RiskOrchestrationResult> {
  console.log(`[Risk Orchestration] Assessing risk for user ${input.userId} in context ${input.context}`);
  
  // Gather signals from all sources
  const signals = await gatherRiskSignals(input.userId, input.counterpartId);
  
  // Calculate aggregated risk
  const aggregatedRisk = calculateAggregatedRisk(signals);
  
  // Determine action based on risk level and context
  const action = determineAction(aggregatedRisk, signals, input.context);
  
  // Determine follow-up actions
  const result: RiskOrchestrationResult = {
    action,
    signals,
    aggregatedRisk,
    reasoning: generateReasoning(signals, aggregatedRisk, action),
    notifyUser: shouldNotifyUser(action, aggregatedRisk),
    createCase: shouldCreateCase(action, aggregatedRisk),
    adjustEnforcement: shouldAdjustEnforcement(action, aggregatedRisk),
  };
  
  // Execute follow-up actions
  await executeFollowUpActions(input, result);
  
  // Log orchestration
  await logRiskOrchestration(input.userId, input.counterpartId, result);
  
  return result;
}

// ============================================================================
// SIGNAL GATHERING (Multi-source)
// ============================================================================

/**
 * Gather risk signals from all integrated safety systems
 */
async function gatherRiskSignals(
  userId: string,
  counterpartId?: string
): Promise<RiskSignalSource[]> {
  const signals: RiskSignalSource[] = [];
  
  // Parallel signal gathering for performance
  const [
    trustSignal,
    enforcementSignal,
    nsfwSignal,
    behaviorSignal,
    fraudSignal,
    consentSignal,
    regionSignal,
  ] = await Promise.all([
    getTrustEngineSignal(userId),
    getEnforcementStateSignal(userId),
    getNSFWClassifierSignal(userId),
    getBehaviorPatternSignal(userId, counterpartId),
    getFraudAttemptSignal(userId),
    getConsentViolationSignal(userId, counterpartId),
    getRegionSafetySignal(userId),
  ]);
  
  if (trustSignal) signals.push(trustSignal);
  if (enforcementSignal) signals.push(enforcementSignal);
  if (nsfwSignal) signals.push(nsfwSignal);
  if (behaviorSignal) signals.push(behaviorSignal);
  if (fraudSignal) signals.push(fraudSignal);
  if (consentSignal) signals.push(consentSignal);
  if (regionSignal) signals.push(regionSignal);
  
  return signals;
}

/**
 * Get signal from Trust Engine (PACK 85)
 */
async function getTrustEngineSignal(userId: string): Promise<RiskSignalSource | null> {
  try {
    const trustProfile = await db.collection('user_trust_profile').doc(userId).get();
    
    if (!trustProfile.exists) {
      return null;
    }
    
    const data = trustProfile.data();
    const riskScore = data?.riskScore || 0;
    const flags = data?.flags || [];
    
    // Convert trust risk score to safety risk level
    let riskLevel: RiskSignalSource['riskLevel'] = 'NONE';
    if (riskScore >= 75) riskLevel = 'CRITICAL';
    else if (riskScore >= 50) riskLevel = 'HIGH';
    else if (riskScore >= 25) riskLevel = 'MEDIUM';
    else if (riskScore >= 10) riskLevel = 'LOW';
    
    if (riskLevel === 'NONE') return null;
    
    return {
      source: 'TRUST_ENGINE',
      riskLevel,
      confidence: Math.min(riskScore /100, 1.0),
      details: {
        riskScore,
        flags,
        enforcementLevel: data?.enforcementLevel,
      },
    };
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching trust signal:', error);
    return null;
  }
}

/**
 * Get signal from Enforcement State (PACK 87)
 */
async function getEnforcementStateSignal(userId: string): Promise<RiskSignalSource | null> {
  try {
    const enforcement = await db.collection('user_enforcement_state').doc(userId).get();
    
    if (!enforcement.exists) {
      return null;
    }
    
    const data = enforcement.data();
    const accountStatus = data?.accountStatus;
    
    if (accountStatus === 'ACTIVE') return null;
    
    let riskLevel: RiskSignalSource['riskLevel'] = 'NONE';
    if (accountStatus === 'SUSPENDED') riskLevel = 'CRITICAL';
    else if (accountStatus === 'HARD_RESTRICTED') riskLevel = 'HIGH';
    else if (accountStatus === 'SOFT_RESTRICTED') riskLevel = 'MEDIUM';
    
    return {
      source: 'ENFORCEMENT_STATE',
      riskLevel,
      confidence: 0.9,
      details: {
        accountStatus,
        featureLocks: data?.featureLocks || [],
        reasonCodes: data?.reasonCodes || [],
      },
    };
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching enforcement signal:', error);
    return null;
  }
}

/**
 * Get signal from NSFW Classifier (PACK 72)
 */
async function getNSFWClassifierSignal(userId: string): Promise<RiskSignalSource | null> {
  try {
    // Check for recent NSFW violations
    const violations = await db.collection('nsfw_violations')
      .where('userId', '==', userId)
      .where('status', '==', 'CONFIRMED')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (violations.empty) return null;
    
    const violationCount = violations.size;
    
    let riskLevel: RiskSignalSource['riskLevel'] = 'LOW';
    if (violationCount >= 5) riskLevel = 'HIGH';
    else if (violationCount >= 3) riskLevel = 'MEDIUM';
    
    return {
      source: 'NSFW_CLASSIFIER',
      riskLevel,
      confidence: 0.8,
      details: {
        recentViolations: violationCount,
        latestViolation: violations.docs[0].data(),
      },
    };
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching NSFW signal:', error);
    return null;
  }
}

/**
 * Get signal from Behavior Patterns (PACK 74)
 */
async function getBehaviorPatternSignal(
  userId: string,
  counterpartId?: string
): Promise<RiskSignalSource | null> {
  if (!counterpartId) return null;
  
  try {
    // Check for relationship red flags
    const hints = await db.collection('safety_relationship_hints')
      .where('viewerUserId', '==', counterpartId)
      .where('counterpartUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (hints.empty) return null;
    
    const latestHint = hints.docs[0].data();
    const level = latestHint.level;
    
    let riskLevel: RiskSignalSource['riskLevel'] = 'NONE';
    if (level === 'HIGH') riskLevel = 'HIGH';
    else if (level === 'MEDIUM') riskLevel = 'MEDIUM';
    else if (level === 'LOW') riskLevel = 'LOW';
    
    if (riskLevel === 'NONE') return null;
    
    return {
      source: 'BEHAVIOR_PATTERNS',
      riskLevel,
      confidence: 0.7,
      details: {
        level,
        signals: latestHint.signals || [],
      },
    };
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching behavior signal:', error);
    return null;
  }
}

/**
 * Get signal from Fraud Detection (PACK 71)
 */
async function getFraudAttemptSignal(userId: string): Promise<RiskSignalSource | null> {
  try {
    const fraudAttempts = await db.collection('fraud_detection_events')
      .where('userId', '==', userId)
      .where('riskLevel', 'in', ['HIGH', 'CRITICAL'])
      .orderBy('detectedAt', 'desc')
      .limit(3)
      .get();
    
    if (fraudAttempts.empty) return null;
    
    const attemptCount = fraudAttempts.size;
    
    let riskLevel: RiskSignalSource['riskLevel'] = 'MEDIUM';
    if (attemptCount >= 3) riskLevel = 'CRITICAL';
    else if (attemptCount >= 2) riskLevel = 'HIGH';
    
    return {
      source: 'FRAUD_ATTEMPTS',
      riskLevel,
      confidence: 0.85,
      details: {
        recentAttempts: attemptCount,
        latestAttempt: fraudAttempts.docs[0].data(),
      },
    };
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching fraud signal:', error);
    return null;
  }
}

/**
 * Get signal from Consent Violations (this pack)
 */
async function getConsentViolationSignal(
  userId: string,
  counterpartId?: string
): Promise<RiskSignalSource | null> {
  if (!counterpartId) return null;
  
  try {
    const recordId = [userId, counterpartId].sort().join('_');
    const consent = await db.collection('user_consent_records').doc(recordId).get();
    
    if (!consent.exists) return null;
    
    const data = consent.data();
    
    // Check if consent was revoked recently
    if (data?.state === 'REVOKED') {
      return {
        source: 'CONSENT_VIOLATIONS',
        riskLevel: 'HIGH',
        confidence: 1.0,
        details: {
          state: data.state,
          revokedAt: data.revokedAt,
          reason: 'Consent revoked by counterpart',
        },
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching consent signal:', error);
    return null;
  }
}

/**
 * Get signal from Regional Safety (PACK 122)
 */
async function getRegionSafetySignal(userId: string): Promise<RiskSignalSource | null> {
  try {
    const userProfile = await db.collection('users').doc(userId).get();
    
    if (!userProfile.exists) return null;
    
    const regionCode = userProfile.data()?.regionCode;
    
    if (!regionCode) return null;
    
    // Check regional restrictions
    const regionalPolicy = await db.collection('regional_policies').doc(regionCode).get();
    
    if (!regionalPolicy.exists) return null;
    
    const policy = regionalPolicy.data();
    
    // Check if region has high-risk indicators
    if (policy?.safetyRiskLevel === 'HIGH' || policy?.restrictedFeatures?.length > 0) {
      return {
        source: 'REGION_SAFETY',
        riskLevel: 'MEDIUM',
        confidence: 0.6,
        details: {
          regionCode,
          safetyRiskLevel: policy.safetyRiskLevel,
          restrictedFeatures: policy.restrictedFeatures,
        },
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Risk Orchestration] Error fetching region signal:', error);
    return null;
  }
}

// ============================================================================
// RISK CALCULATION & DECISION
// ============================================================================

/**
 * Calculate aggregated risk from all signals
 */
function calculateAggregatedRisk(signals: RiskSignalSource[]): number {
  if (signals.length === 0) return 0;
  
  const weights: Record<RiskSignalSource['riskLevel'], number> = {
    'CRITICAL': 40,
    'HIGH': 25,
    'MEDIUM': 15,
    'LOW': 5,
    'NONE': 0,
  };
  
  let totalRisk = 0;
  
  for (const signal of signals) {
    const baseWeight = weights[signal.riskLevel];
    const weightedRisk = baseWeight * signal.confidence;
    totalRisk += weightedRisk;
  }
  
  // Cap at 100
  return Math.min(totalRisk, 100);
}

/**
 * Determine appropriate action based on risk level
 */
function determineAction(
  aggregatedRisk: number,
  signals: RiskSignalSource[],
  context: RiskOrchestrationInput['context']
): RiskOrchestrationResult['action'] {
  // CRITICAL risk (90+)
  if (aggregatedRisk >= 90) {
    return 'IMMEDIATE_LOCKDOWN';
  }
  
  // HIGH risk (70+)
  if (aggregatedRisk >= 70) {
    // Check if harassment shield needed
    const hasHarassmentSignals = signals.some(s => 
      s.source === 'BEHAVIOR_PATTERNS' || s.source === 'CONSENT_VIOLATIONS'
    );
    
    if (hasHarassmentSignals) {
      return 'ENABLE_HARASSMENT_SHIELD';
    }
    
    return 'QUEUE_FOR_REVIEW';
  }
  
  // MEDIUM risk (40+)
  if (aggregatedRisk >= 40) {
    // Reconfirm consent for sensitive contexts
    if (context === 'CALL_REQUEST' || context === 'LOCATION_SHARE') {
      return 'CONSENT_RECONFIRM';
    }
    
    return 'SOFT_SAFETY_WARNING';
  }
  
  // LOW risk (20+)
  if (aggregatedRisk >= 20) {
    return 'SOFT_SAFETY_WARNING';
  }
  
  // No action needed
  return 'NO_ACTION';
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  signals: RiskSignalSource[],
  aggregatedRisk: number,
  action: RiskOrchestrationResult['action']
): string {
  if (signals.length === 0) {
    return 'No risk signals detected';
  }
  
  const signalSources = signals.map(s => s.source).join(', ');
  return `Risk level ${aggregatedRisk}/100 based on signals from: ${signalSources}. Action: ${action}`;
}

/**
 * Determine if user should be notified
 */
function shouldNotifyUser(action: RiskOrchestrationResult['action'], risk: number): boolean {
  return action !== 'NO_ACTION' && risk >= 40;
}

/**
 * Determine if moderation case should be created
 */
function shouldCreateCase(action: RiskOrchestrationResult['action'], risk: number): boolean {
  return action === 'QUEUE_FOR_REVIEW' || action === 'IMMEDIATE_LOCKDOWN' || risk >= 70;
}

/**
 * Determine if enforcement state should be adjusted
 */
function shouldAdjustEnforcement(action: RiskOrchestrationResult['action'], risk: number): boolean {
  return action === 'IMMEDIATE_LOCKDOWN' || risk >= 90;
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

/**
 * Execute follow-up actions based on risk assessment
 */
async function executeFollowUpActions(
  input: RiskOrchestrationInput,
  result: RiskOrchestrationResult
): Promise<void> {
  const { userId, counterpartId } = input;
  
  // Execute primary action
  switch (result.action) {
    case 'ENABLE_HARASSMENT_SHIELD':
      if (counterpartId) {
        // Activate harassment shield
        const signals = result.signals
          .filter(s => s.source === 'BEHAVIOR_PATTERNS' || s.source === 'CONSENT_VIOLATIONS')
          .map(s => ({
            type: 'COORDINATED_HARASSMENT' as const,
            confidence: s.confidence,
            detectedAt: Timestamp.now(),
            evidence: s.details,
          }));
        
        await activateHarassmentShield(counterpartId, userId, signals);
      }
      break;
    
    case 'CONSENT_RECONFIRM':
      if (counterpartId) {
        // Pause consent temporarily - requires reconfirmation
        await pauseConsent(userId, counterpartId, 'SYSTEM', 'Risk assessment requires consent reconfirmation');
      }
      break;
    
    case 'QUEUE_FOR_REVIEW':
      // Create moderation case
      if (result.createCase) {
        await createModerationCase(userId, result);
      }
      break;
    
    case 'IMMEDIATE_LOCKDOWN':
      // Create critical case and adjust enforcement
      await createModerationCase(userId, result);
      await triggerEnforcementUpdate(userId, 'HARD_RESTRICTED');
      break;
  }
  
  // Send notification if needed
  if (result.notifyUser) {
    await sendSafetyNotification(userId, result);
  }
}

/**
 * Create moderation case
 */
async function createModerationCase(
  userId: string,
  result: RiskOrchestrationResult
): Promise<string> {
  const caseData = {
    subjectUserId: userId,
    reasonCodes: result.signals.map(s => s.source),
    priority: result.aggregatedRisk >= 90 ? 'CRITICAL' : result.aggregatedRisk >= 70 ? 'HIGH' : 'MEDIUM',
    status: 'OPEN',
    createdAt: Timestamp.now(),
    source: 'RISK_ORCHESTRATION',
    riskScore: result.aggregatedRisk,
    signals: result.signals,
    reasoning: result.reasoning,
  };
  
  const caseRef = await db.collection('moderation_cases').add(caseData);
  return caseRef.id;
}

/**
 * Trigger enforcement state update
 */
async function triggerEnforcementUpdate(
  userId: string,
  newStatus: 'SOFT_RESTRICTED' | 'HARD_RESTRICTED'
): Promise<void> {
  await db.collection('user_enforcement_state').doc(userId).update({
    accountStatus: newStatus,
    lastUpdatedAt: Timestamp.now(),
    reasonCodes: ['RISK_ORCHESTRATION_TRIGGERED'],
  });
}

/**
 * Send safety notification to user
 */
async function sendSafetyNotification(
  userId: string,
  result: RiskOrchestrationResult
): Promise<void> {
  // This would integrate with PACK 92 notification system
  const notificationData = {
    userId,
    type: 'SAFETY_ALERT',
    title: 'Safety Notice',
    message: getSafetyNotificationMessage(result.action),
    priority: result.aggregatedRisk >= 70 ? 'HIGH' : 'MEDIUM',
    createdAt: Timestamp.now(),
  };
  
  await db.collection('notifications').add(notificationData);
}

/**
 * Get user-friendly notification message
 */
function getSafetyNotificationMessage(action: RiskOrchestrationResult['action']): string {
  switch (action) {
    case 'SOFT_SAFETY_WARNING':
      return 'Please be mindful of our community guidelines';
    case 'CONSENT_RECONFIRM':
      return 'For your safety, please reconfirm your consent to continue';
    case 'ENABLE_HARASSMENT_SHIELD':
      return 'We\'ve activated additional protections for your safety';
    case 'QUEUE_FOR_REVIEW':
      return 'Your account activity is being reviewed by our safety team';
    case 'IMMEDIATE_LOCKDOWN':
      return 'Your account has been temporarily restricted. Please contact support';
    default:
      return 'Thank you for keeping Avalo safe';
  }
}

/**
 * Log risk orchestration event
 */
async function logRiskOrchestration(
  userId: string,
  counterpartId: string | undefined,
  result: RiskOrchestrationResult
): Promise<void> {
  const log: SafetyAuditLog = {
    logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType: 'RISK_ORCHESTRATION_TRIGGERED',
    userId,
    affectedUserId: counterpartId,
    details: {
      action: result.action,
      aggregatedRisk: result.aggregatedRisk,
      signalCount: result.signals.length,
      reasoning: result.reasoning,
    },
    timestamp: Timestamp.now(),
    gdprCompliant: true,
    retentionPeriod: 90,
  };
  
  await db.collection(SAFETY_AUDIT_COLLECTION).add(log);
}