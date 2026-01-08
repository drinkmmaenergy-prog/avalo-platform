/**
 * PACK 429 — Anti-Sabotage & Press-Crisis Mode
 * Automatically or manually activates defensive measures during crises
 */

import * as admin from 'firebase-admin';
import {
  CrisisMode,
  DefenseEventType,
  EventSeverity,
} from './pack429-store-defense.types';

const db = admin.firestore();

// ============================================================================
// CRISIS MODE ACTIVATION
// ============================================================================

export interface ActivateCrisisModeParams {
  trigger?: {
    eventId: string;
    eventType: DefenseEventType;
    severity: EventSeverity;
  };
  activatedBy: string; // userId or 'SYSTEM'
  manual?: boolean;
}

/**
 * Activate crisis mode - defensive measures during review attacks or PR crises
 */
export async function activateCrisisMode(params: ActivateCrisisModeParams): Promise<void> {
  console.log('🚨 ACTIVATING CRISIS MODE');
  
  const crisisMode: CrisisMode = {
    active: true,
    activatedAt: admin.firestore.Timestamp.now(),
    activatedBy: params.activatedBy,
    activationType: params.manual ? 'MANUAL' : 'AUTOMATIC',
    trigger: params.trigger,
    config: {
      disableAggressivePrompts: true,
      disableRiskyExperiments: true,
      increaseSafetyVisibility: true,
      forceExtraRecoveryPrompts: true,
      maxRecoveryPromptsPerDay: 50, // Increased limit during crisis
    },
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  await db.collection('crisisMode').doc('global').set(crisisMode);
  
  // Update feature flags (PACK 428 integration)
  try {
    await updateFeatureFlags({
      STORE_CRISIS_MODE: true,
      AGGRESSIVE_GROWTH_PROMPTS: false,
      RISKY_EXPERIMENTS: false,
      ENHANCED_SAFETY_UI: true,
      REVIEW_RECOVERY_BOOST: true,
    });
  } catch (error) {
    console.error('Error updating feature flags:', error);
  }
  
  // Send notification to ops team
  try {
    await notifyOpsTeam({
      title: '🚨 Crisis Mode Activated',
      message: params.trigger
        ? `Crisis mode activated due to ${params.trigger.eventType} (${params.trigger.severity})`
        : 'Crisis mode manually activated',
      priority: 'CRITICAL',
    });
  } catch (error) {
    console.error('Error notifying ops:', error);
  }
  
  // Log audit event
  try {
    const { auditLog } = await import('./pack296-audit-log');
    await auditLog({
      eventType: 'CRISIS_MODE_ACTIVATED',
      userId: params.activatedBy,
      resource: 'crisisMode',
      action: 'ACTIVATE',
      metadata: {
        type: crisisMode.activationType,
        trigger: params.trigger,
      },
    });
  } catch (error) {
    console.error('Error logging audit:', error);
  }
  
  console.log('✅ Crisis mode activated successfully');
}

// ============================================================================
// CRISIS MODE DEACTIVATION
// ============================================================================

export interface DeactivateCrisisModeParams {
  deactivatedBy: string;
  impactAnalysis?: {
    ratingChange: number;
    reviewCount: number;
    recoveryActions: number;
    [key: string]: any;
  };
}

/**
 * Deactivate crisis mode and return to normal operations
 */
export async function deactivateCrisisMode(params: DeactivateCrisisModeParams): Promise<void> {
  console.log('🟢 DEACTIVATING CRISIS MODE');
  
  const crisisDoc = await db.collection('crisisMode').doc('global').get();
  
  if (!crisisDoc.exists || !crisisDoc.data()?.active) {
    console.log('Crisis mode not active, nothing to deactivate');
    return;
  }
  
  await db.collection('crisisMode').doc('global').update({
    active: false,
    deactivatedAt: admin.firestore.Timestamp.now(),
    deactivatedBy: params.deactivatedBy,
    impactAnalysis: params.impactAnalysis,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  
  // Restore feature flags
  try {
    await updateFeatureFlags({
      STORE_CRISIS_MODE: false,
      AGGRESSIVE_GROWTH_PROMPTS: true,
      RISKY_EXPERIMENTS: true,
      ENHANCED_SAFETY_UI: false,
      REVIEW_RECOVERY_BOOST: false,
    });
  } catch (error) {
    console.error('Error updating feature flags:', error);
  }
  
  // Notify ops
  try {
    await notifyOpsTeam({
      title: '🟢 Crisis Mode Deactivated',
      message: 'Crisis mode deactivated, returning to normal operations',
      priority: 'HIGH',
    });
  } catch (error) {
    console.error('Error notifying ops:', error);
  }
  
  // Log audit event
  try {
    const { auditLog } = await import('./pack296-audit-log');
    await auditLog({
      eventType: 'CRISIS_MODE_DEACTIVATED',
      userId: params.deactivatedBy,
      resource: 'crisisMode',
      action: 'DEACTIVATE',
      metadata: {
        impactAnalysis: params.impactAnalysis,
      },
    });
  } catch (error) {
    console.error('Error logging audit:', error);
  }
  
  console.log('✅ Crisis mode deactivated successfully');
}

// ============================================================================
// CRISIS MODE STATUS
// ============================================================================

export async function isCrisisModeActive(): Promise<boolean> {
  const crisisDoc = await db.collection('crisisMode').doc('global').get();
  
  if (!crisisDoc.exists) {
    return false;
  }
  
  const data = crisisDoc.data() as CrisisMode;
  return data.active === true;
}

export async function getCrisisMode(): Promise<CrisisMode | null> {
  const crisisDoc = await db.collection('crisisMode').doc('global').get();
  
  if (!crisisDoc.exists) {
    return null;
  }
  
  return crisisDoc.data() as CrisisMode;
}

// ============================================================================
// AUTO-EVALUATION
// ============================================================================

/**
 * Automatically check if crisis should end based on metrics
 * Should be run periodically (e.g., every 6 hours)
 */
export async function evaluateCrisisAutoDeactivation(): Promise<void> {
  const crisisMode = await getCrisisMode();
  
  if (!crisisMode || !crisisMode.active) {
    return;
  }
  
  // Don't auto-deactivate manual crisis modes
  if (crisisMode.activationType === 'MANUAL') {
    console.log('Crisis mode is manual, skipping auto-evaluation');
    return;
  }
  
  // Check if crisis has been active for at least 12 hours
  const activatedAt = crisisMode.activatedAt.toDate();
  const hoursSinceActivation = (Date.now() - activatedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceActivation < 12) {
    console.log('Crisis mode active for less than 12 hours, too soon to deactivate');
    return;
  }
  
  // Check if all critical events are resolved
  const unresolvedCriticalSnap = await db
    .collection('storeDefenseEvents')
    .where('severity', '==', 'CRITICAL')
    .where('resolved', '==', false)
    .where('createdAt', '>', crisisMode.activatedAt)
    .limit(1)
    .get();
  
  if (!unresolvedCriticalSnap.empty) {
    console.log('Unresolved critical events exist, keeping crisis mode active');
    return;
  }
  
  // Check rating trend - has it stabilized?
  const ratingTrend = await checkRatingTrend();
  
  if (ratingTrend === 'NEGATIVE') {
    console.log('Rating trend still negative, keeping crisis mode active');
    return;
  }
  
  // All conditions met, auto-deactivate
  console.log('Conditions met for auto-deactivation');
  
  // Calculate impact analysis
  const impactAnalysis = await calculateImpactAnalysis(crisisMode);
  
  await deactivateCrisisMode({
    deactivatedBy: 'SYSTEM',
    impactAnalysis,
  });
}

async function checkRatingTrend(): Promise<'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Get recent reviews (last 3 days)
    const recentSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(threeDaysAgo))
      .get();
    
    // Get baseline reviews (4-7 days ago)
    const baselineSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(threeDaysAgo))
      .get();
    
    if (recentSnap.empty || baselineSnap.empty) {
      return 'NEUTRAL';
    }
    
    const recentAvg = calculateAverage(recentSnap);
    const baselineAvg = calculateAverage(baselineSnap);
    
    const change = recentAvg - baselineAvg;
    
    if (change > 0.2) return 'POSITIVE';
    if (change < -0.2) return 'NEGATIVE';
    return 'NEUTRAL';
  } catch (error) {
    console.error('Error checking rating trend:', error);
    return 'NEUTRAL';
  }
}

function calculateAverage(snapshot: admin.firestore.QuerySnapshot): number {
  let sum = 0;
  
  snapshot.forEach(doc => {
    sum += doc.data().rating;
  });
  
  return snapshot.size > 0 ? sum / snapshot.size : 0;
}

async function calculateImpactAnalysis(crisisMode: CrisisMode): Promise<any> {
  try {
    const activatedAt = crisisMode.activatedAt.toDate();
    const now = new Date();
    
    // Get reviews during crisis
    const reviewsSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', crisisMode.activatedAt)
      .get();
    
    // Get recovery prompts during crisis
    const promptsSnap = await db
      .collection('reviewRecoveryPrompts')
      .where('createdAt', '>', crisisMode.activatedAt)
      .get();
    
    let positiveReviews = 0;
    let avgRating = 0;
    
    reviewsSnap.forEach(doc => {
      const review = doc.data();
      avgRating += review.rating;
      if (review.rating >= 4) positiveReviews++;
    });
    
    avgRating = reviewsSnap.size > 0 ? avgRating / reviewsSnap.size : 0;
    
    return {
      durationHours: (now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60),
      reviewCount: reviewsSnap.size,
      avgRating,
      positiveReviews,
      recoveryPrompts: promptsSnap.size,
      ratingChange: 0, // Would need baseline comparison
    };
  } catch (error) {
    console.error('Error calculating impact analysis:', error);
    return {};
  }
}

// ============================================================================
// FEATURE FLAG INTEGRATION
// ============================================================================

async function updateFeatureFlags(flags: { [key: string]: boolean }): Promise<void> {
  // Integration with PACK 428 feature flags
  const featureFlagsRef = db.collection('featureFlags').doc('global');
  
  for (const [flag, value] of Object.entries(flags)) {
    await featureFlagsRef.update({
      [flag]: value,
      [`${flag}_updatedAt`]: admin.firestore.Timestamp.now(),
      [`${flag}_updatedBy`]: 'CRISIS_MODE',
    });
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

interface OpsNotification {
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

async function notifyOpsTeam(notification: OpsNotification): Promise<void> {
  // Integration with PACK 293 notifications
  try {
    // Create notification for all admin users
    const adminsSnap = await db
      .collection('users')
      .where('role', '==', 'ADMIN')
      .get();
    
    const batch = db.batch();
    
    adminsSnap.forEach(doc => {
      const notifRef = db.collection('notifications').doc();
      
      batch.set(notifRef, {
        id: notifRef.id,
        userId: doc.id,
        type: 'SYSTEM_ALERT',
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        read: false,
        createdAt: admin.firestore.Timestamp.now(),
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error sending ops notification:', error);
  }
}

// ============================================================================
// CRISIS MODE EFFECTS
// ============================================================================

/**
 * Check if a specific action should be disabled during crisis mode
 */
export async function shouldDisableAction(actionType: string): Promise<boolean> {
  const crisisMode = await getCrisisMode();
  
  if (!crisisMode || !crisisMode.active) {
    return false;
  }
  
  const { config } = crisisMode;
  
  switch (actionType) {
    case 'AGGRESSIVE_GROWTH_PROMPT':
      return config.disableAggressivePrompts;
    
    case 'RISKY_EXPERIMENT':
      return config.disableRiskyExperiments;
    
    default:
      return false;
  }
}

/**
 * Check if enhanced safety features should be shown
 */
export async function shouldEnhanceSafety(): Promise<boolean> {
  const crisisMode = await getCrisisMode();
  
  if (!crisisMode || !crisisMode.active) {
    return false;
  }
  
  return crisisMode.config.increaseSafetyVisibility;
}

/**
 * Get max recovery prompts allowed per day (higher during crisis)
 */
export async function getMaxRecoveryPromptsPerDay(): Promise<number> {
  const crisisMode = await getCrisisMode();
  
  if (!crisisMode || !crisisMode.active) {
    return 10; // Normal limit
  }
  
  return crisisMode.config.maxRecoveryPromptsPerDay;
}
