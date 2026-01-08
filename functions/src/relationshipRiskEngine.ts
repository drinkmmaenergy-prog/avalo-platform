/**
 * PACK 74 — Relationship Risk Engine
 * 
 * Detects behavioral patterns that may indicate:
 * - Grooming or coercion
 * - Financial exploitation
 * - Manipulative relationship dynamics
 * 
 * DOES NOT:
 * - Read raw message content
 * - Auto-ban users
 * - Modify any monetization logic
 * 
 * Returns discrete risk levels: NONE, LOW, MEDIUM, HIGH
 */

import { db } from './init.js';

// ============================================================================
// TYPES
// ============================================================================

export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskSignal =
  | 'FAST_ESCALATION'
  | 'OFF_PLATFORM_PRESSURE'
  | 'FINANCIAL_PRESSURE'
  | 'EXCESSIVE_MESSAGES'
  | 'RAPID_PAYMENT_REQUESTS'
  | 'MULTIPLE_REPORTS'
  | 'TRUST_FLAGS'
  | 'ENFORCEMENT_HISTORY'
  | 'RATE_LIMIT_VIOLATIONS'
  | 'CANCEL_PATTERN'
  | 'PAYOUT_RISK';

export interface RelationshipRiskHint {
  level: RiskLevel;
  signals: RiskSignal[];
}

// ============================================================================
// RISK SCORING WEIGHTS
// ============================================================================

const RISK_WEIGHTS = {
  // Enforcement & moderation history
  ENFORCEMENT_HISTORY: 30,
  MULTIPLE_REPORTS: 25,
  
  // Behavioral patterns
  FAST_ESCALATION: 20,
  OFF_PLATFORM_PRESSURE: 20,
  FINANCIAL_PRESSURE: 25,
  
  // Technical indicators
  EXCESSIVE_MESSAGES: 15,
  RAPID_PAYMENT_REQUESTS: 20,
  TRUST_FLAGS: 20,
  RATE_LIMIT_VIOLATIONS: 15,
  
  // Reservation abuse
  CANCEL_PATTERN: 15,
  
  // Financial risk
  PAYOUT_RISK: 20,
};

// Risk level thresholds
const THRESHOLDS = {
  LOW: 20,
  MEDIUM: 50,
  HIGH: 80,
};

// ============================================================================
// MAIN RISK ASSESSMENT FUNCTION
// ============================================================================

/**
 * Get relationship risk hint for a counterpart user
 * Aggregates signals from multiple sources without exposing internal scores
 * 
 * @param viewerUserId - User viewing the risk hint
 * @param counterpartUserId - User being assessed
 * @returns Risk level and detected signals
 */
export async function getRelationshipRiskHint(
  viewerUserId: string,
  counterpartUserId: string
): Promise<RelationshipRiskHint> {
  
  if (viewerUserId === counterpartUserId) {
    return { level: 'NONE', signals: [] };
  }

  try {
    // Aggregate risk signals from various sources
    const signals = await aggregateRiskSignals(viewerUserId, counterpartUserId);
    
    // Calculate total risk score
    const totalScore = calculateRiskScore(signals);
    
    // Determine risk level
    const level = determineRiskLevel(totalScore);
    
    return {
      level,
      signals,
    };
  } catch (error) {
    console.error('[RelationshipRisk] Error assessing risk:', error);
    // Fail-safe: Return NONE on error
    return { level: 'NONE', signals: [] };
  }
}

// ============================================================================
// SIGNAL AGGREGATION
// ============================================================================

async function aggregateRiskSignals(
  viewerUserId: string,
  counterpartUserId: string
): Promise<RiskSignal[]> {
  
  const signals: RiskSignal[] = [];

  // Run all checks in parallel for performance
  const [
    enforcementData,
    reportData,
    trustData,
    chatMetadata,
    reservationData,
    payoutRiskData,
    rateLimitData,
  ] = await Promise.all([
    checkEnforcementHistory(counterpartUserId),
    checkReportHistory(counterpartUserId),
    checkTrustFlags(counterpartUserId),
    analyzeChatMetadata(viewerUserId, counterpartUserId),
    checkReservationPatterns(counterpartUserId),
    checkPayoutRisk(counterpartUserId),
    checkRateLimits(counterpartUserId),
  ]);

  // Add detected signals
  if (enforcementData.hasViolations) signals.push('ENFORCEMENT_HISTORY');
  if (reportData.hasMultipleReports) signals.push('MULTIPLE_REPORTS');
  if (trustData.hasTrustFlags) signals.push('TRUST_FLAGS');
  if (chatMetadata.fastEscalation) signals.push('FAST_ESCALATION');
  if (chatMetadata.offPlatformPressure) signals.push('OFF_PLATFORM_PRESSURE');
  if (chatMetadata.financialPressure) signals.push('FINANCIAL_PRESSURE');
  if (chatMetadata.excessiveMessages) signals.push('EXCESSIVE_MESSAGES');
  if (chatMetadata.rapidPaymentRequests) signals.push('RAPID_PAYMENT_REQUESTS');
  if (reservationData.cancelPattern) signals.push('CANCEL_PATTERN');
  if (payoutRiskData.hasRisk) signals.push('PAYOUT_RISK');
  if (rateLimitData.violations) signals.push('RATE_LIMIT_VIOLATIONS');

  return signals;
}

// ============================================================================
// INDIVIDUAL SIGNAL CHECKS
// ============================================================================

async function checkEnforcementHistory(userId: string): Promise<{ hasViolations: boolean }> {
  try {
    const enforcementRef = db.collection('enforcement_states').doc(userId);
    const enforcementDoc = await enforcementRef.get();
    
    if (!enforcementDoc.exists) {
      return { hasViolations: false };
    }

    const data = enforcementDoc.data();
    const restrictions = data?.restrictions || [];
    
    // Check for active restrictions or recent violations
    const hasActiveRestrictions = restrictions.some((r: any) => 
      r.active && ['temp_ban', 'chat_restricted', 'payment_restricted'].includes(r.type)
    );
    
    return { hasViolations: hasActiveRestrictions };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking enforcement:', error);
    return { hasViolations: false };
  }
}

async function checkReportHistory(userId: string): Promise<{ hasMultipleReports: boolean }> {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { hasMultipleReports: false };
    }

    const reportCount = userDoc.data()?.moderation?.reportCount || 0;
    
    // 3+ reports is a concern
    return { hasMultipleReports: reportCount >= 3 };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking reports:', error);
    return { hasMultipleReports: false };
  }
}

async function checkTrustFlags(userId: string): Promise<{ hasTrustFlags: boolean }> {
  try {
    const trustRef = db.collection('trust_states').doc(userId);
    const trustDoc = await trustRef.get();
    
    if (!trustDoc.exists) {
      return { hasTrustFlags: false };
    }

    const data = trustDoc.data();
    const trustScore = data?.trustScore || 100;
    const riskLevel = data?.riskLevel || 'NONE';
    
    // Trust score below 50 or high risk level
    return { 
      hasTrustFlags: trustScore < 50 || riskLevel === 'HIGH' 
    };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking trust:', error);
    return { hasTrustFlags: false };
  }
}

async function analyzeChatMetadata(
  viewerUserId: string,
  counterpartUserId: string
): Promise<{
  fastEscalation: boolean;
  offPlatformPressure: boolean;
  financialPressure: boolean;
  excessiveMessages: boolean;
  rapidPaymentRequests: boolean;
}> {
  
  try {
    // Find conversation between these users
    // Check both possible conversation IDs
    const convId1 = [viewerUserId, counterpartUserId].sort().join('_');
    const convId2 = [counterpartUserId, viewerUserId].sort().join('_');
    
    const convRef = db.collection('conversations').doc(convId1);
    let convDoc = await convRef.get();
    
    if (!convDoc.exists) {
      const convRef2 = db.collection('conversations').doc(convId2);
      convDoc = await convRef2.get();
    }
    
    if (!convDoc.exists) {
      return {
        fastEscalation: false,
        offPlatformPressure: false,
        financialPressure: false,
        excessiveMessages: false,
        rapidPaymentRequests: false,
      };
    }

    const convData = convDoc.data();
    
    // Analyze metadata (NOT message content)
    const messageCount = convData?.messageCount || 0;
    const createdAt = convData?.createdAt?.toMillis() || Date.now();
    const ageInHours = (Date.now() - createdAt) / (1000 * 60 * 60);
    
    // Fast escalation: Many messages in short time
    const fastEscalation = messageCount > 50 && ageInHours < 24;
    
    // Excessive messages: High message rate
    const messagesPerHour = ageInHours > 0 ? messageCount / ageInHours : 0;
    const excessiveMessages = messagesPerHour > 20;
    
    // Check for metadata flags (set by existing moderation systems)
    const flags = convData?.metadata?.flags || {};
    const offPlatformPressure = flags.offPlatformContactAttempt || false;
    const financialPressure = flags.requestedMoney || flags.requestedGifts || false;
    
    // Check payment patterns
    const paymentRequests = convData?.metadata?.paymentRequests || 0;
    const rapidPaymentRequests = paymentRequests > 3 && ageInHours < 48;
    
    return {
      fastEscalation,
      offPlatformPressure,
      financialPressure,
      excessiveMessages,
      rapidPaymentRequests,
    };
  } catch (error) {
    console.error('[RelationshipRisk] Error analyzing chat:', error);
    return {
      fastEscalation: false,
      offPlatformPressure: false,
      financialPressure: false,
      excessiveMessages: false,
      rapidPaymentRequests: false,
    };
  }
}

async function checkReservationPatterns(userId: string): Promise<{ cancelPattern: boolean }> {
  try {
    // Check for patterns of canceling reservations
    const bookingsRef = db.collection('meet_bookings')
      .where('hostId', '==', userId)
      .where('status', '==', 'cancelled')
      .orderBy('createdAt', 'desc')
      .limit(10);
    
    const bookingsSnap = await bookingsRef.get();
    
    // Cancel pattern: 5+ recent cancellations
    return { cancelPattern: bookingsSnap.size >= 5 };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking reservations:', error);
    return { cancelPattern: false };
  }
}

async function checkPayoutRisk(userId: string): Promise<{ hasRisk: boolean }> {
  try {
    const amlRef = db.collection('aml_profiles').doc(userId);
    const amlDoc = await amlRef.get();
    
    if (!amlDoc.exists) {
      return { hasRisk: false };
    }

    const data = amlDoc.data();
    const riskLevel = data?.riskLevel || 'LOW';
    
    // Medium or high AML risk
    return { hasRisk: ['MEDIUM', 'HIGH'].includes(riskLevel) };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking payout risk:', error);
    return { hasRisk: false };
  }
}

async function checkRateLimits(userId: string): Promise<{ violations: boolean }> {
  try {
    const rateLimitRef = db.collection('rate_limits').doc(userId);
    const rateLimitDoc = await rateLimitRef.get();
    
    if (!rateLimitDoc.exists) {
      return { violations: false };
    }

    const data = rateLimitDoc.data();
    const violations = data?.violations || 0;
    
    // 3+ rate limit violations
    return { violations: violations >= 3 };
  } catch (error) {
    console.error('[RelationshipRisk] Error checking rate limits:', error);
    return { violations: false };
  }
}

// ============================================================================
// RISK CALCULATION
// ============================================================================

function calculateRiskScore(signals: RiskSignal[]): number {
  let totalScore = 0;
  
  for (const signal of signals) {
    totalScore += RISK_WEIGHTS[signal] || 0;
  }
  
  return totalScore;
}

function determineRiskLevel(score: number): RiskLevel {
  if (score >= THRESHOLDS.HIGH) return 'HIGH';
  if (score >= THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (score >= THRESHOLDS.LOW) return 'LOW';
  return 'NONE';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  RISK_WEIGHTS,
  THRESHOLDS,
};