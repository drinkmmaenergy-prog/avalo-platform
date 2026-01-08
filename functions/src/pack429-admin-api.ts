/**
 * PACK 429 — Admin Panel HTTP Endpoints
 * API routes for store defense dashboard and management
 */

import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import {
  StoreDefenseDashboard,
  TrustScorePublicResponse,
  Platform,
  ReviewImportRequest,
} from './pack429-store-defense.types';
import { importReviews, getRecentReviews, getAttackPatternReviews } from './pack429-review-ingestion';
import {
  getActiveDefenseEvents,
  getDefenseEventsByPlatform,
  resolveDefenseEvent,
  runDefenseMonitoring,
} from './pack429-review-defense-engine';
import {
  updateTrustScore,
  getPublicTrustScore,
  getTrustSignals,
} from './pack429-trust-score';
import {
  getRecoveryStats,
  getAllPendingPrompts,
  markPromptDelivered,
  markPromptResponded,
} from './pack429-review-recovery';
import {
  activateCrisisMode,
  deactivateCrisisMode,
  getCrisisMode,
  evaluateCrisisAutoDeactivation,
} from './pack429-crisis-mode';

const db = admin.firestore();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Verify admin authentication
 */
async function verifyAdmin(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Check if user is admin
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return null;
    }
    
    const userData = userDoc.data();
    
    if (userData?.role !== 'ADMIN' && userData?.role !== 'OPS') {
      return null;
    }
    
    return { userId };
  } catch (error) {
    console.error('Error verifying admin:', error);
    return null;
  }
}

/**
 * Admin auth middleware wrapper
 */
async function requireAdmin(req: Request, res: Response, handler: (userId: string) => Promise<any>) {
  const auth = await verifyAdmin(req);
  
  if (!auth) {
    res.status(403).json({ error: 'Unauthorized - Admin access required' });
    return;
  }
  
  try {
    const result = await handler(auth.userId);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /pack429/dashboard
 * Get overview dashboard data
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    // Get trust score
    const trustSignals = await getTrustSignals();
    
    if (!trustSignals) {
      throw new Error('Trust signals not available');
    }
    
    // Get recent events
    const recentEvents = await getActiveDefenseEvents();
    
    // Get crisis mode status
    const crisisMode = await getCrisisMode();
    
    // Get recovery metrics
    const recoveryMetrics = await getRecoveryStats(7);
    
    // Calculate 7-day rating changes
    const iosChange = await calculate7DayChange(Platform.IOS);
    const androidChange = await calculate7DayChange(Platform.ANDROID);
    
    // Determine trend
    const avgChange = (iosChange + androidChange) / 2;
    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (avgChange > 0.1) trend = 'UP';
    if (avgChange < -0.1) trend = 'DOWN';
    
    const dashboard: StoreDefenseDashboard = {
      currentScore: trustSignals.trustScore,
      trend,
      ratings: {
        ios: {
          current: trustSignals.avgRatingIOS,
          change7d: iosChange,
          reviewCount: trustSignals.iosData.reviewCount,
        },
        android: {
          current: trustSignals.avgRatingAndroid,
          change7d: androidChange,
          reviewCount: trustSignals.androidData.reviewCount,
        },
      },
      recentEvents: recentEvents.slice(0, 10),
      activeAlerts: recentEvents.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH').length,
      crisisMode: crisisMode?.active || false,
      recoveryMetrics: {
        promptsSent7d: recoveryMetrics.promptsDelivered,
        responsesReceived7d: recoveryMetrics.promptsResponded,
        conversionRate: recoveryMetrics.conversionRate,
      },
    };
    
    return { success: true, dashboard };
  });
}

async function calculate7DayChange(platform: Platform): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  // Get current week average
  const currentWeekSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
    .get();
  
  // Get previous week average
  const previousWeekSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(fourteenDaysAgo))
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
    .get();
  
  if (currentWeekSnap.empty || previousWeekSnap.empty) {
    return 0;
  }
  
  let currentSum = 0;
  currentWeekSnap.forEach(doc => {
    currentSum += doc.data().rating;
  });
  
  let previousSum = 0;
  previousWeekSnap.forEach(doc => {
    previousSum += doc.data().rating;
  });
  
  const currentAvg = currentSum / currentWeekSnap.size;
  const previousAvg = previousSum / previousWeekSnap.size;
  
  return currentAvg - previousAvg;
}

// ============================================================================
// REVIEWS
// ============================================================================

/**
 * POST /pack429/reviews/import
 * Import reviews from CSV or API dump
 */
export async function importReviewsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const importRequest: ReviewImportRequest = {
      platform: req.body.platform,
      reviews: req.body.reviews,
      importedBy: userId,
    };
    
    if (!importRequest.platform || !importRequest.reviews || !Array.isArray(importRequest.reviews)) {
      throw new Error('Invalid request: platform and reviews array required');
    }
    
    const result = await importReviews(importRequest);
    
    return { success: result.success, ...result };
  });
}

/**
 * GET /pack429/reviews/recent
 * Get recent reviews
 */
export async function getRecentReviewsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const platform = req.query.platform as Platform | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const reviews = await getRecentReviews(platform, limit);
    
    return { success: true, reviews };
  });
}

/**
 * GET /pack429/reviews/attack-patterns
 * Get reviews flagged as attack patterns
 */
export async function getAttackPatternsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const platform = req.query.platform as Platform | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const reviews = await getAttackPatternReviews(platform, limit);
    
    return { success: true, reviews };
  });
}

// ============================================================================
// DEFENSE EVENTS
// ============================================================================

/**
 * GET /pack429/events
 * Get defense events
 */
export async function getEventsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const platform = req.query.platform as Platform | undefined;
    const active = req.query.active === 'true';
    
    let events;
    
    if (active) {
      events = await getActiveDefenseEvents();
    } else if (platform) {
      events = await getDefenseEventsByPlatform(platform);
    } else {
      events = await getActiveDefenseEvents();
    }
    
    return { success: true, events };
  });
}

/**
 * POST /pack429/events/:eventId/resolve
 * Resolve a defense event
 */
export async function resolveEventEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const eventId = req.params.eventId;
    
    if (!eventId) {
      throw new Error('Event ID required');
    }
    
    await resolveDefenseEvent(eventId, userId);
    
    return { success: true, message: 'Event resolved' };
  });
}

/**
 * POST /pack429/monitoring/run
 * Manually trigger defense monitoring
 */
export async function runMonitoringEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    await runDefenseMonitoring();
    
    return { success: true, message: 'Monitoring completed' };
  });
}

// ============================================================================
// TRUST SCORE
// ============================================================================

/**
 * GET /pack429/trust/score
 * Get public trust score (no auth required)
 */
export async function getTrustScoreEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const score = await getPublicTrustScore();
    res.status(200).json({ success: true, ...score });
  } catch (error: any) {
    console.error('Error getting trust score:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /pack429/trust/signals
 * Get detailed trust signals (admin only)
 */
export async function getTrustSignalsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const signals = await getTrustSignals();
    
    if (!signals) {
      throw new Error('Trust signals not available');
    }
    
    return { success: true, signals };
  });
}

/**
 * POST /pack429/trust/recalculate
 * Recalculate trust score
 */
export async function recalculateTrustScoreEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const signals = await updateTrustScore();
    
    return { success: true, signals };
  });
}

// ============================================================================
// REVIEW RECOVERY
// ============================================================================

/**
 * GET /pack429/recovery/stats
 * Get recovery statistics
 */
export async function getRecoveryStatsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const days = parseInt(req.query.days as string) || 7;
    
    const stats = await getRecoveryStats(days);
    
    return { success: true, stats };
  });
}

/**
 * GET /pack429/recovery/pending
 * Get pending prompts
 */
export async function getPendingPromptsEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const limit = parseInt(req.query.limit as string) || 100;
    
    const prompts = await getAllPendingPrompts(limit);
    
    return { success: true, prompts };
  });
}

/**
 * POST /pack429/recovery/:promptId/delivered
 * Mark prompt as delivered
 */
export async function markPromptDeliveredEndpoint(req: Request, res: Response): Promise<void> {
  // This endpoint can be called by the app (authenticated user)
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  
  try {
    const token = authHeader.split('Bearer ')[1];
    await admin.auth().verifyIdToken(token);
    
    const promptId = req.params.promptId;
    
    if (!promptId) {
      throw new Error('Prompt ID required');
    }
    
    await markPromptDelivered(promptId);
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error marking prompt delivered:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /pack429/recovery/:promptId/responded
 * Mark prompt as responded
 */
export async function markPromptRespondedEndpoint(req: Request, res: Response): Promise<void> {
  // This endpoint can be called by the app (authenticated user)
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  
  try {
    const token = authHeader.split('Bearer ')[1];
    await admin.auth().verifyIdToken(token);
    
    const promptId = req.params.promptId;
    const leftReview = req.body.leftReview === true;
    
    if (!promptId) {
      throw new Error('Prompt ID required');
    }
    
    await markPromptResponded(promptId, leftReview);
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error marking prompt responded:', error);
    res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// CRISIS MODE
// ============================================================================

/**
 * GET /pack429/crisis
 * Get crisis mode status
 */
export async function getCrisisModeEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const crisisMode = await getCrisisMode();
    
    return { success: true, crisisMode };
  });
}

/**
 * POST /pack429/crisis/activate
 * Manually activate crisis mode
 */
export async function activateCrisisModeEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    await activateCrisisMode({
      activatedBy: userId,
      manual: true,
    });
    
    return { success: true, message: 'Crisis mode activated' };
  });
}

/**
 * POST /pack429/crisis/deactivate
 * Deactivate crisis mode
 */
export async function deactivateCrisisModeEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    const impactAnalysis = req.body.impactAnalysis;
    
    await deactivateCrisisMode({
      deactivatedBy: userId,
      impactAnalysis,
    });
    
    return { success: true, message: 'Crisis mode deactivated' };
  });
}

/**
 * POST /pack429/crisis/evaluate
 * Evaluate for auto-deactivation
 */
export async function evaluateCrisisEndpoint(req: Request, res: Response): Promise<void> {
  await requireAdmin(req, res, async (userId) => {
    await evaluateCrisisAutoDeactivation();
    
    return { success: true, message: 'Crisis evaluation completed' };
  });
}
