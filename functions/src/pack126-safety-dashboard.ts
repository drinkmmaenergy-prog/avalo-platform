/**
 * PACK 126 — Safety Dashboard
 * 
 * User-facing safety dashboard providing transparent insights
 * into protections, consent management, and available safety tools
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  SafetyDashboard,
  SafetyTool,
  SafetyDashboardAction,
  SafetyAuditLog,
} from './types/pack126-types';
import { getUserConsentRecords } from './pack126-consent-protocol';

const SAFETY_AUDIT_COLLECTION = 'safety_audit_logs';

// ============================================================================
// SAFETY DASHBOARD GENERATION
// ============================================================================

/**
 * Get comprehensive safety dashboard for user
 */
export async function getSafetyDashboard(userId: string): Promise<SafetyDashboard> {
  console.log(`[Safety Dashboard] Generating dashboard for user ${userId}`);
  
  // Gather all safety data
  const [
    consentRecords,
    blocks,
    harassmentShields,
    activeProtections,
    recentActions,
  ] = await Promise.all([
    getUserConsentRecords(userId),
    getUserBlocks(userId),
    getUserHarassmentShields(userId),
    getActiveProtections(userId),
    getRecentSafetyActions(userId, 10),
  ]);
  
  // Calculate consent statistics
  const consentHistory = {
    totalConnections: consentRecords.length,
    activeConsents: consentRecords.filter(r => r.state === 'ACTIVE_CONSENT').length,
    pausedConsents: consentRecords.filter(r => r.state === 'PAUSED').length,
    revokedConsents: consentRecords.filter(r => r.state === 'REVOKED').length,
  };
  
  // Get paused and revoked contacts
  const contactsPaused = consentRecords
    .filter(r => r.state === 'PAUSED')
    .map(r => r.counterpartId === userId ? r.userId : r.counterpartId);
  
  const contactsRevoked = consentRecords
    .filter(r => r.state === 'REVOKED')
    .map(r => r.counterpartId === userId ? r.userId : r.counterpartId);
  
  // Determine safety level
  const safetyLevel = determineSafetyLevel(
    activeProtections.length,
    harassmentShields.length,
    consentHistory.revokedConsents
  );
  
  // Get available tools
  const availableTools = getAvailableSafetyTools(userId);
  
  const dashboard: SafetyDashboard = {
    userId,
    safetyLevel,
    activeProtections: activeProtections.map(p => p.type),
    consentHistory,
    contactsPaused,
    contactsRevoked,
    blockedUsers: blocks,
    availableTools,
    recentSafetyActions: recentActions,
    lastUpdatedAt: Timestamp.now(),
  };
  
  // Log dashboard access
  await logDashboardAccess(userId);
  
  return dashboard;
}

// ============================================================================
// DATA GATHERING
// ============================================================================

/**
 * Get user's active blocks
 */
async function getUserBlocks(userId: string): Promise<string[]> {
  try {
    const blocksSnapshot = await db.collection('blocks')
      .where('blockerId', '==', userId)
      .get();
    
    return blocksSnapshot.docs.map(doc => doc.data().blockedUserId);
  } catch (error) {
    console.error('[Safety Dashboard] Error fetching blocks:', error);
    return [];
  }
}

/**
 * Get active harassment shields protecting user
 */
async function getUserHarassmentShields(userId: string): Promise<any[]> {
  try {
    const shieldsSnapshot = await db.collection('harassment_shields')
      .where('userId', '==', userId)
      .where('resolvedAt', '==', null)
      .get();
    
    return shieldsSnapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error('[Safety Dashboard] Error fetching shields:', error);
    return [];
  }
}

/**
 * Get active safety protections
 */
async function getActiveProtections(userId: string): Promise<Array<{ type: string; description: string }>> {
  const protections: Array<{ type: string; description: string }> = [];
  
  try {
    // Check enforcement protections
    const enforcement = await db.collection('user_enforcement_state').doc(userId).get();
    if (enforcement.exists && enforcement.data()?.accountStatus === 'ACTIVE') {
      protections.push({
        type: 'Account in good standing',
        description: 'No restrictions currently active',
      });
    }
    
    // Check harassment shields
    const shields = await db.collection('harassment_shields')
      .where('userId', '==', userId)
      .where('resolvedAt', '==', null)
      .get();
    
    if (!shields.empty) {
      protections.push({
        type: 'Harassment Shield Active',
        description: `Protected from ${shields.size} potential harasser(s)`,
      });
    }
    
    // Check consent protections
    const consents = await getUserConsentRecords(userId);
    const activeCount = consents.filter(c => c.state === 'ACTIVE_CONSENT').length;
    
    if (activeCount > 0) {
      protections.push({
        type: 'Consent Protocol Active',
        description: `${activeCount} active connection(s) with consent`,
      });
    }
    
    // Add baseline protections
    protections.push({
      type: 'Baseline Safety',
      description: 'AI moderation, trust engine, fraud detection',
    });
    
    return protections;
  } catch (error) {
    console.error('[Safety Dashboard] Error fetching protections:', error);
    return [{
      type: 'Baseline Safety',
      description: 'Standard safety protections active',
    }];
  }
}

/**
 * Get recent safety actions (sanitized)
 */
async function getRecentSafetyActions(userId: string, limit: number): Promise<SafetyDashboardAction[]> {
  try {
    const logsSnapshot = await db.collection(SAFETY_AUDIT_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    return logsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        action: sanitizeActionType(data.eventType),
        timestamp: data.timestamp,
        outcome: sanitizeOutcome(data.details),
      };
    });
  } catch (error) {
    console.error('[Safety Dashboard] Error fetching recent actions:', error);
    return [];
  }
}

/**
 * Sanitize action type for user display
 */
function sanitizeActionType(eventType: string): string {
  const mapping: Record<string, string> = {
    'CONSENT_GRANTED': 'Started new connection',
    'CONSENT_PAUSED': 'Paused a connection',
    'CONSENT_REVOKED': 'Ended a connection',
    'CONSENT_RESUMED': 'Resumed a connection',
    'HARASSMENT_SHIELD_ACTIVATED': 'Protection activated',
    'RISK_ORCHESTRATION_TRIGGERED': 'Safety check performed',
  };
  
  return mapping[eventType] || 'Safety action taken';
}

/**
 * Sanitize outcome for user display (no internal details)
 */
function sanitizeOutcome(details: any): string {
  if (details.state) {
    return `Status: ${details.state}`;
  }
  
  if (details.level) {
    return `Level: ${details.level}`;
  }
  
  return 'Completed successfully';
}

// ============================================================================
// SAFETY LEVEL DETERMINATION
// ============================================================================

/**
 * Determine user's overall safety level
 */
function determineSafetyLevel(
  activeProtections: number,
  harassmentShields: number,
  revokedConsents: number
): SafetyDashboard['safetyLevel'] {
  // Protected: Has active shields or recent revocations (user is being proactive)
  if (harassmentShields > 0 || revokedConsents > 0) {
    return 'PROTECTED';
  }
  
  // Needs attention: Low protection count
  if (activeProtections < 2) {
    return 'NEEDS_ATTENTION';
  }
  
  // Standard: Normal safety posture
  return 'STANDARD';
}

// ============================================================================
// AVAILABLE SAFETY TOOLS
// ============================================================================

/**
 * Get available safety tools for user
 */
function getAvailableSafetyTools(userId: string): SafetyTool[] {
  return [
    {
      toolId: 'pause_consent',
      name: 'Pause Connection',
      description: 'Temporarily pause communication with someone',
      category: 'CONSENT',
      enabled: true,
    },
    {
      toolId: 'revoke_consent',
      name: 'End Connection',
      description: 'Permanently end communication with someone',
      category: 'CONSENT',
      enabled: true,
    },
    {
      toolId: 'block_user',
      name: 'Block User',
      description: 'Block someone from contacting you',
      category: 'BLOCKING',
      enabled: true,
    },
    {
      toolId: 'report_user',
      name: 'Report User',
      description: 'Report concerning behavior to our safety team',
      category: 'REPORTING',
      enabled: true,
    },
    {
      toolId: 'contact_support',
      name: 'Contact Support',
      description: 'Reach out to our support team for help',
      category: 'SUPPORT',
      enabled: true,
    },
    {
      toolId: 'privacy_settings',
      name: 'Privacy Settings',
      description: 'Manage who can contact and find you',
      category: 'PRIVACY',
      enabled: true,
    },
    {
      toolId: 'safety_center',
      name: 'Safety Center',
      description: 'Access all safety resources and features',
      category: 'SUPPORT',
      enabled: true,
    },
  ];
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log dashboard access
 */
async function logDashboardAccess(userId: string): Promise<void> {
  const log: SafetyAuditLog = {
    logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType: 'SAFETY_DASHBOARD_VIEWED',
    userId,
    details: {
      timestamp: Timestamp.now(),
    },
    timestamp: Timestamp.now(),
    gdprCompliant: true,
    retentionPeriod: 90,
  };
  
  await db.collection(SAFETY_AUDIT_COLLECTION).add(log);
}