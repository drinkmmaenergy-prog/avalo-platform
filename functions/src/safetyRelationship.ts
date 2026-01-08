/**
 * PACK 74 — Safety Relationship API
 * 
 * Provides HTTP endpoints for red flag relationship warnings and safety assistance
 * 
 * Endpoints:
 * - GET /safety/relationship-hint - Get risk level for a counterpart user
 * - POST /safety/relationship-action - Log safety assistance actions
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init.js';
import { getRelationshipRiskHint, RiskLevel, RiskSignal } from './relationshipRiskEngine.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipHintResponse {
  level: RiskLevel;
  signals: RiskSignal[];
}

export type SafetyAction = 
  | 'OPENED_WARNING'
  | 'CONTACT_SUPPORT'
  | 'OPENED_SAFETY_TIPS'
  | 'BLOCKED_USER'
  | 'REPORTED_USER';

export interface SafetyActionLog {
  userId: string;
  counterpartUserId: string;
  action: SafetyAction;
  notes?: string;
  createdAt: any;
}

// ============================================================================
// GET RELATIONSHIP HINT
// ============================================================================

/**
 * Get safety red-flag hint for a counterpart user
 * 
 * Query params:
 * - viewerUserId: string (required)
 * - counterpartUserId: string (required)
 * 
 * Returns:
 * {
 *   level: "NONE" | "LOW" | "MEDIUM" | "HIGH",
 *   signals: string[]
 * }
 */
export const getRelationshipHint = functions.https.onCall(
  async (data: {
    viewerUserId?: string;
    counterpartUserId: string;
  }, context) => {
    
    // Use authenticated user if available, otherwise use provided viewerUserId
    const viewerUserId = context.auth?.uid || data.viewerUserId;
    const { counterpartUserId } = data;

    // Validate input
    if (!viewerUserId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated or viewerUserId must be provided'
      );
    }

    if (!counterpartUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'counterpartUserId is required'
      );
    }

    if (viewerUserId === counterpartUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Cannot get hint for yourself'
      );
    }

    try {
      // Get risk hint from engine
      const hint = await getRelationshipRiskHint(viewerUserId, counterpartUserId);
      
      // Log analytics event (non-blocking)
      logHintRequest(viewerUserId, counterpartUserId, hint.level).catch(err => {
        console.error('[SafetyRelationship] Failed to log hint request:', err);
      });
      
      return hint;
    } catch (error: any) {
      console.error('[SafetyRelationship] Error getting relationship hint:', error);
      
      // Fail-safe: Return NONE on error
      return {
        level: 'NONE' as RiskLevel,
        signals: [] as RiskSignal[],
      };
    }
  }
);

// ============================================================================
// LOG SAFETY ACTION
// ============================================================================

/**
 * Log safety assistance action
 * 
 * Body:
 * {
 *   userId: string,
 *   counterpartUserId: string,
 *   action: SafetyAction,
 *   notes?: string
 * }
 * 
 * Returns:
 * {
 *   success: boolean,
 *   actionId: string
 * }
 */
export const logSafetyAction = functions.https.onCall(
  async (data: {
    userId?: string;
    counterpartUserId: string;
    action: SafetyAction;
    notes?: string;
  }, context) => {
    
    // Use authenticated user if available
    const userId = context.auth?.uid || data.userId;
    const { counterpartUserId, action, notes } = data;

    // Validate input
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    if (!counterpartUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'counterpartUserId is required'
      );
    }

    if (!action) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'action is required'
      );
    }

    const validActions: SafetyAction[] = [
      'OPENED_WARNING',
      'CONTACT_SUPPORT',
      'OPENED_SAFETY_TIPS',
      'BLOCKED_USER',
      'REPORTED_USER',
    ];

    if (!validActions.includes(action)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `action must be one of: ${validActions.join(', ')}`
      );
    }

    try {
      // Create action log
      const actionLog: SafetyActionLog = {
        userId,
        counterpartUserId,
        action,
        notes,
        createdAt: serverTimestamp(),
      };

      // Write to analytics collection
      const actionRef = await db.collection('safety_relationship_actions').add(actionLog);
      
      // Update user's safety profile counters
      await updateSafetyProfileCounters(userId, action);
      
      console.log(`[SafetyRelationship] Action logged: ${action} by ${userId} for ${counterpartUserId}`);
      
      return {
        success: true,
        actionId: actionRef.id,
      };
    } catch (error: any) {
      console.error('[SafetyRelationship] Error logging safety action:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log hint request for analytics (non-blocking)
 */
async function logHintRequest(
  viewerUserId: string,
  counterpartUserId: string,
  level: RiskLevel
): Promise<void> {
  try {
    await db.collection('safety_relationship_hints').add({
      viewerUserId,
      counterpartUserId,
      level,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[SafetyRelationship] Failed to log hint request:', error);
    // Don't throw - this is analytics only
  }
}

/**
 * Update user's safety profile counters based on action
 */
async function updateSafetyProfileCounters(
  userId: string,
  action: SafetyAction
): Promise<void> {
  
  const safetyProfileRef = db.collection('safety_profiles').doc(userId);
  
  try {
    const profileDoc = await safetyProfileRef.get();
    
    if (!profileDoc.exists) {
      // Create initial profile if it doesn't exist
      await safetyProfileRef.set({
        userId,
        openedWarningCount: action === 'OPENED_WARNING' ? 1 : 0,
        contactedSupportCount: action === 'CONTACT_SUPPORT' ? 1 : 0,
        openedSafetyTipsCount: action === 'OPENED_SAFETY_TIPS' ? 1 : 0,
        blockedUserCount: action === 'BLOCKED_USER' ? 1 : 0,
        reportedUserCount: action === 'REPORTED_USER' ? 1 : 0,
        lastUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    } else {
      // Update existing profile
      const updates: any = {
        lastUpdatedAt: serverTimestamp(),
      };
      
      switch (action) {
        case 'OPENED_WARNING':
          updates.openedWarningCount = (profileDoc.data()?.openedWarningCount || 0) + 1;
          break;
        case 'CONTACT_SUPPORT':
          updates.contactedSupportCount = (profileDoc.data()?.contactedSupportCount || 0) + 1;
          break;
        case 'OPENED_SAFETY_TIPS':
          updates.openedSafetyTipsCount = (profileDoc.data()?.openedSafetyTipsCount || 0) + 1;
          break;
        case 'BLOCKED_USER':
          updates.blockedUserCount = (profileDoc.data()?.blockedUserCount || 0) + 1;
          break;
        case 'REPORTED_USER':
          updates.reportedUserCount = (profileDoc.data()?.reportedUserCount || 0) + 1;
          break;
      }
      
      await safetyProfileRef.update(updates);
    }
  } catch (error) {
    console.error('[SafetyRelationship] Failed to update safety profile:', error);
    // Don't throw - counter update is not critical
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getRelationshipHint as getRelationshipHintEndpoint,
  logSafetyAction as logSafetyActionEndpoint,
};