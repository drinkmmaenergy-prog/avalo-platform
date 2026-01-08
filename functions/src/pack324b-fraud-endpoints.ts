/**
 * PACK 324B — Admin Fraud Detection API Endpoints
 * 
 * READ-ONLY endpoints for admins to view fraud signals and risk scores
 * No blocking actions - moderation handles enforcement separately
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  FraudSignal,
  UserRiskScore,
  FraudSignalResponse,
  UserRiskScoreResponse,
  HighRiskUsersResponse,
  FraudSignalsListResponse,
  FraudDashboardStats,
  FraudSignalsFilter,
  HighRiskUsersFilter,
  FRAUD_CONFIG,
  SIGNAL_TYPE_LABELS,
  SIGNAL_SOURCE_LABELS,
  FraudSignalType,
  FraudSignalSource,
} from './pack324b-fraud-types';
import { recalculateUserRiskScore, getHighRiskUsers } from './pack324b-risk-engine';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    return userData?.role === 'admin' || userData?.roles?.admin === true;
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Convert FraudSignal to API response format
 */
function fraudSignalToResponse(signal: FraudSignal): FraudSignalResponse {
  return {
    id: signal.id,
    userId: signal.userId,
    source: signal.source,
    signalType: signal.signalType,
    severity: signal.severity,
    contextRef: signal.contextRef,
    metadata: signal.metadata,
    createdAt: signal.createdAt.toDate(),
  };
}

/**
 * Convert UserRiskScore to API response format
 */
function riskScoreToResponse(score: UserRiskScore): UserRiskScoreResponse {
  return {
    userId: score.userId,
    riskScore: score.riskScore,
    level: score.level,
    signalCount: score.signalCount,
    lastSignalType: score.lastSignalType,
    lastSignalDate: score.lastSignalDate?.toDate(),
    lastUpdatedAt: score.lastUpdatedAt.toDate(),
  };
}

// ============================================================================
// ADMIN API ENDPOINTS
// ============================================================================

/**
 * Get fraud signals with filters
 * Admin-only endpoint
 */
export const pack324b_getFraudSignals = onCall<FraudSignalsFilter>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access fraud signals');
    }
    
    try {
      const {
        userId,
        source,
        signalType,
        severity,
        minSeverity,
        startDate,
        endDate,
        limit = FRAUD_CONFIG.DEFAULT_PAGE_SIZE,
        offset = 0,
      } = request.data;
      
      // Build query
      let query = db.collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
        .orderBy('createdAt', 'desc');
      
      // Apply filters
      if (userId) {
        query = query.where('userId', '==', userId) as any;
      }
      
      if (source) {
        query = query.where('source', '==', source) as any;
      }
      
      if (signalType) {
        query = query.where('signalType', '==', signalType) as any;
      }
      
      if (severity) {
        query = query.where('severity', '==', severity) as any;
      } else if (minSeverity) {
        query = query.where('severity', '>=', minSeverity) as any;
      }
      
      if (startDate) {
        const start = new Date(startDate);
        query = query.where('createdAt', '>=', Timestamp.fromDate(start)) as any;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.where('createdAt', '<=', Timestamp.fromDate(end)) as any;
      }
      
      // Get total count
      const countSnapshot = await query.count().get();
      const totalCount = countSnapshot.data().count;
      
      // Apply pagination
      const pageSize = Math.min(limit, FRAUD_CONFIG.MAX_PAGE_SIZE);
      query = query.limit(pageSize).offset(offset) as any;
      
      // Execute query
      const signalsSnapshot = await query.get();
      
      const signals: FraudSignalResponse[] = [];
      signalsSnapshot.forEach(doc => {
        const signal = doc.data() as FraudSignal;
        signals.push(fraudSignalToResponse(signal));
      });
      
      const response: FraudSignalsListResponse = {
        signals,
        totalCount,
        page: Math.floor(offset / pageSize) + 1,
        pageSize,
      };
      
      return response;
    } catch (error) {
      logger.error('Error getting fraud signals:', error);
      throw new HttpsError('internal', 'Failed to retrieve fraud signals');
    }
  }
);

/**
 * Get high risk users
 * Admin-only endpoint
 */
export const pack324b_getHighRiskUsers = onCall<HighRiskUsersFilter>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access risk scores');
    }
    
    try {
      const {
        level,
        minRiskScore,
        maxRiskScore,
        signalType,
        limit = FRAUD_CONFIG.DEFAULT_PAGE_SIZE,
        offset = 0,
      } = request.data;
      
      // Build query
      let query = db.collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
        .orderBy('riskScore', 'desc');
      
      // Apply filters
      if (level) {
        query = query.where('level', '==', level) as any;
      }
      
      if (minRiskScore !== undefined) {
        query = query.where('riskScore', '>=', minRiskScore) as any;
      }
      
      if (maxRiskScore !== undefined) {
        query = query.where('riskScore', '<=', maxRiskScore) as any;
      }
      
      if (signalType) {
        query = query.where('lastSignalType', '==', signalType) as any;
      }
      
      // Get total count
      const countSnapshot = await query.count().get();
      const totalCount = countSnapshot.data().count;
      
      // Apply pagination
      const pageSize = Math.min(limit, FRAUD_CONFIG.MAX_PAGE_SIZE);
      query = query.limit(pageSize).offset(offset) as any;
      
      // Execute query
      const scoresSnapshot = await query.get();
      
      const users: HighRiskUsersResponse['users'] = [];
      scoresSnapshot.forEach(doc => {
        const score = doc.data() as UserRiskScore;
        users.push({
          userId: score.userId,
          riskScore: score.riskScore,
          level: score.level,
          signalCount: score.signalCount,
          lastSignalType: score.lastSignalType,
          lastSignalDate: score.lastSignalDate?.toDate(),
        });
      });
      
      const response: HighRiskUsersResponse = {
        users,
        totalCount,
        page: Math.floor(offset / pageSize) + 1,
        pageSize,
      };
      
      return response;
    } catch (error) {
      logger.error('Error getting high risk users:', error);
      throw new HttpsError('internal', 'Failed to retrieve high risk users');
    }
  }
);

/**
 * Get user risk score
 * Admin-only endpoint
 */
export const pack324b_getUserRiskScore = onCall<{ userId: string }>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access risk scores');
    }
    
    try {
      const { userId } = request.data;
      
      if (!userId) {
        throw new HttpsError('invalid-argument', 'userId is required');
      }
      
      const riskScoreDoc = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
        .doc(userId)
        .get();
      
      if (!riskScoreDoc.exists) {
        return null;
      }
      
      const score = riskScoreDoc.data() as UserRiskScore;
      return riskScoreToResponse(score);
    } catch (error) {
      logger.error('Error getting user risk score:', error);
      throw new HttpsError('internal', 'Failed to retrieve user risk score');
    }
  }
);

/**
 * Get user fraud signals
 * Admin-only endpoint
 */
export const pack324b_getUserFraudSignals = onCall<{ userId: string; limit?: number }>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access fraud signals');
    }
    
    try {
      const { userId, limit = 50 } = request.data;
      
      if (!userId) {
        throw new HttpsError('invalid-argument', 'userId is required');
      }
      
      const signalsSnapshot = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(limit, 200))
        .get();
      
      const signals: FraudSignalResponse[] = [];
      signalsSnapshot.forEach(doc => {
        const signal = doc.data() as FraudSignal;
        signals.push(fraudSignalToResponse(signal));
      });
      
      return { signals };
    } catch (error) {
      logger.error('Error getting user fraud signals:', error);
      throw new HttpsError('internal', 'Failed to retrieve user fraud signals');
    }
  }
);

/**
 * Get fraud dashboard statistics
 * Admin-only endpoint
 */
export const pack324b_getFraudDashboardStats = onCall(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access fraud statistics');
    }
    
    try {
      const now = new Date();
      
      // Get signals from last 24h, 7d, 30d
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const [signals24h, signals7d, signals30d] = await Promise.all([
        db.collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
          .where('createdAt', '>=', Timestamp.fromDate(twentyFourHoursAgo))
          .count()
          .get(),
        db.collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
          .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
          .count()
          .get(),
        db.collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
          .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
          .count()
          .get(),
      ]);
      
      // Get high risk user counts
      const [highRiskCount, criticalRiskCount] = await Promise.all([
        db.collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
          .where('level', '==', 'HIGH')
          .count()
          .get(),
        db.collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
          .where('level', '==', 'CRITICAL')
          .count()
          .get(),
      ]);
      
      // Get signal breakdown by type and source
      const recentSignalsSnapshot = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
        .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
        .get();
      
      const signalsByType: Record<string, number> = {};
      const signalsBySource: Record<string, number> = {};
      
      recentSignalsSnapshot.forEach(doc => {
        const signal = doc.data() as FraudSignal;
        signalsByType[signal.signalType] = (signalsByType[signal.signalType] || 0) + 1;
        signalsBySource[signal.source] = (signalsBySource[signal.source] || 0) + 1;
      });
      
      // Calculate average risk score
      const allScoresSnapshot = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.USER_RISK_SCORES)
        .get();
      
      let totalScore = 0;
      let userCount = 0;
      
      allScoresSnapshot.forEach(doc => {
        const score = doc.data() as UserRiskScore;
        totalScore += score.riskScore;
        userCount++;
      });
      
      const averageRiskScore = userCount > 0 ? Math.round(totalScore / userCount) : 0;
      
      const stats: FraudDashboardStats = {
        totalSignals24h: signals24h.data().count,
        totalSignals7d: signals7d.data().count,
        totalSignals30d: signals30d.data().count,
        highRiskUsers: highRiskCount.data().count,
        criticalRiskUsers: criticalRiskCount.data().count,
        signalsByType: signalsByType as Record<FraudSignalType, number>,
        signalsBySource: signalsBySource as Record<FraudSignalSource, number>,
        averageRiskScore,
      };
      
      return stats;
    } catch (error) {
      logger.error('Error getting fraud dashboard stats:', error);
      throw new HttpsError('internal', 'Failed to retrieve fraud statistics');
    }
  }
);

/**
 * Trigger risk score recalculation for a user
 * Admin-only endpoint (for manual recalculation)
 */
export const pack324b_recalculateUserRiskScore = onCall<{ userId: string }>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can trigger risk recalculation');
    }
    
    try {
      const { userId } = request.data;
      
      if (!userId) {
        throw new HttpsError('invalid-argument', 'userId is required');
      }
      
      const riskScore = await recalculateUserRiskScore(userId);
      
      return riskScoreToResponse(riskScore);
    } catch (error) {
      logger.error('Error recalculating user risk score:', error);
      throw new HttpsError('internal', 'Failed to recalculate user risk score');
    }
  }
);

/**
 * Get context details for a fraud signal
 * Admin-only endpoint
 */
export const pack324b_getSignalContext = onCall<{ signalId: string }>(
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin status
    const adminStatus = await isAdmin(request.auth.uid);
    if (!adminStatus) {
      throw new HttpsError('permission-denied', 'Only admins can access signal context');
    }
    
    try {
      const { signalId } = request.data;
      
      if (!signalId) {
        throw new HttpsError('invalid-argument', 'signalId is required');
      }
      
      // Get the signal
      const signalDoc = await db
        .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
        .doc(signalId)
        .get();
      
      if (!signalDoc.exists) {
        throw new HttpsError('not-found', 'Signal not found');
      }
      
      const signal = signalDoc.data() as FraudSignal;
      
      // Try to fetch context based on source and contextRef
      let context: any = null;
      
      try {
        if (signal.source === 'CHAT' || signal.source === 'AI_CHAT') {
          const chatDoc = await db.collection('chats').doc(signal.contextRef).get();
          context = chatDoc.exists ? chatDoc.data() : null;
        } else if (signal.source === 'AI_VOICE' || signal.source === 'AI_VIDEO') {
          const sessionDoc = await db.collection('aiVoiceCallSessions').doc(signal.contextRef).get();
          if (!sessionDoc.exists) {
            const videoSessionDoc = await db.collection('aiVideoCallSessions').doc(signal.contextRef).get();
            context = videoSessionDoc.exists ? videoSessionDoc.data() : null;
          } else {
            context = sessionDoc.data();
          }
        } else if (signal.source === 'CALENDAR') {
          const bookingDoc = await db.collection('calendarBookings').doc(signal.contextRef).get();
          context = bookingDoc.exists ? bookingDoc.data() : null;
        } else if (signal.source === 'EVENT') {
          const eventDoc = await db.collection('events').doc(signal.contextRef).get();
          context = eventDoc.exists ? eventDoc.data() : null;
        } else if (signal.source === 'WALLET') {
          const payoutDoc = await db.collection('payouts').doc(signal.contextRef).get();
          context = payoutDoc.exists ? payoutDoc.data() : null;
        }
      } catch (error) {
        logger.error('Error fetching context:', error);
        // Context fetch is non-critical, continue
      }
      
      return {
        signal: fraudSignalToResponse(signal),
        context,
      };
    } catch (error) {
      logger.error('Error getting signal context:', error);
      throw new HttpsError('internal', 'Failed to retrieve signal context');
    }
  }
);