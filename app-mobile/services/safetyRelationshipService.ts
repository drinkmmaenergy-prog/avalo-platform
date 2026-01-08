/**
 * PACK 74 — Safety Relationship Service
 * 
 * Provides API wrapper functions for red flag relationship warnings
 * and safety assistance actions
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

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

export type SafetyAction =
  | 'OPENED_WARNING'
  | 'CONTACT_SUPPORT'
  | 'OPENED_SAFETY_TIPS'
  | 'BLOCKED_USER'
  | 'REPORTED_USER';

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get relationship risk hint for a counterpart user
 * 
 * @param counterpartUserId - User ID to assess
 * @returns Risk level and detected signals
 */
export async function getRelationshipRiskHint(
  counterpartUserId: string
): Promise<RelationshipRiskHint> {
  try {
    const functions = getFunctions();
    const getHint = httpsCallable<
      { counterpartUserId: string },
      RelationshipRiskHint
    >(functions, 'safety_getRelationshipHint');

    const result = await getHint({ counterpartUserId });
    return result.data;
  } catch (error) {
    console.error('[SafetyRelationship] Error getting risk hint:', error);
    // Fail-safe: Return NONE on error
    return {
      level: 'NONE',
      signals: [],
    };
  }
}

/**
 * Log a safety assistance action
 * 
 * @param counterpartUserId - User ID the action relates to
 * @param action - Type of safety action taken
 * @param notes - Optional notes about the action
 * @returns Success status and action ID
 */
export async function logSafetyAction(
  counterpartUserId: string,
  action: SafetyAction,
  notes?: string
): Promise<{ success: boolean; actionId?: string }> {
  try {
    const functions = getFunctions();
    const logAction = httpsCallable<
      {
        counterpartUserId: string;
        action: SafetyAction;
        notes?: string;
      },
      { success: boolean; actionId: string }
    >(functions, 'safety_logRelationshipAction');

    const result = await logAction({
      counterpartUserId,
      action,
      notes,
    });

    return result.data;
  } catch (error) {
    console.error('[SafetyRelationship] Error logging safety action:', error);
    return { success: false };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if risk hint should trigger a warning
 * 
 * @param hint - Risk hint from API
 * @returns True if warning should be shown
 */
export function shouldShowWarning(hint: RelationshipRiskHint): boolean {
  return hint.level !== 'NONE';
}

/**
 * Check if risk hint is high priority
 * 
 * @param hint - Risk hint from API
 * @returns True if HIGH risk level
 */
export function isHighRisk(hint: RelationshipRiskHint): boolean {
  return hint.level === 'HIGH';
}

/**
 * Get user-friendly description of risk signals
 * 
 * @param signals - Array of risk signals
 * @returns Human-readable description
 */
export function getRiskSignalDescription(signals: RiskSignal[]): string {
  if (signals.length === 0) {
    return '';
  }

  const descriptions: Record<RiskSignal, string> = {
    FAST_ESCALATION: 'rapid conversation escalation',
    OFF_PLATFORM_PRESSURE: 'pressure to move off-platform',
    FINANCIAL_PRESSURE: 'financial requests or pressure',
    EXCESSIVE_MESSAGES: 'unusually high message volume',
    RAPID_PAYMENT_REQUESTS: 'frequent payment requests',
    MULTIPLE_REPORTS: 'previous reports from other users',
    TRUST_FLAGS: 'trust and safety concerns',
    ENFORCEMENT_HISTORY: 'previous policy violations',
    RATE_LIMIT_VIOLATIONS: 'suspicious activity patterns',
    CANCEL_PATTERN: 'frequent reservation cancellations',
    PAYOUT_RISK: 'financial risk indicators',
  };

  // Return first few signals as description
  const topSignals = signals.slice(0, 2);
  return topSignals
    .map((signal) => descriptions[signal] || signal)
    .join(', ');
}

/**
 * Get appropriate action recommendations based on risk level
 * 
 * @param level - Risk level
 * @returns Array of recommended actions
 */
export function getRecommendedActions(
  level: RiskLevel
): Array<'block' | 'report' | 'support' | 'tips'> {
  switch (level) {
    case 'HIGH':
      return ['block', 'report', 'support'];
    case 'MEDIUM':
      return ['report', 'tips'];
    case 'LOW':
      return ['tips'];
    case 'NONE':
    default:
      return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRelationshipRiskHint,
  logSafetyAction,
  shouldShowWarning,
  isHighRisk,
  getRiskSignalDescription,
  getRecommendedActions,
};