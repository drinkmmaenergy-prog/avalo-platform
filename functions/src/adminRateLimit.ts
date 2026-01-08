/**
 * PACK 70 - Admin APIs for Rate Limiting
 * 
 * Admin-only endpoints for viewing rate limit stats and config
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getRateLimitStats, getRateLimitConfig } from './rateLimit.js';
import { db } from './init.js';

/**
 * Check if user is admin
 */
async function checkAdmin(userId: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection('admin_users').doc(userId).get();
    return adminDoc.exists && adminDoc.data()?.role === 'ADMIN';
  } catch (error) {
    return false;
  }
}

/**
 * GET /admin/rate-limit/stats
 * Get rate limit statistics (violations, top offenders)
 */
export const admin_getRateLimitStats = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await checkAdmin(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { action, periodHours } = request.data as {
      action?: string;
      periodHours?: number;
    };

    try {
      const stats = await getRateLimitStats({
        action,
        periodHours: periodHours || 24
      });

      return {
        success: true,
        stats: {
          totalViolations: stats.totalViolations,
          uniqueUsers: stats.uniqueUsers,
          topOffenders: stats.topOffenders,
          action: action || 'all',
          periodHours: periodHours || 24
        }
      };
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limit stats:', error);
      throw new HttpsError('internal', 'Failed to get rate limit stats');
    }
  }
);

/**
 * GET /admin/rate-limit/config
 * Get merged rate limit configuration (read-only)
 */
export const admin_getRateLimitConfig = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await checkAdmin(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { environment } = request.data as { environment?: 'PROD' | 'STAGE' };

    try {
      const env = environment || 
                  (process.env.GCLOUD_PROJECT?.includes('prod') ? 'PROD' : 
                   process.env.GCLOUD_PROJECT?.includes('stage') ? 'STAGE' : 'OTHER');

      const config = await getRateLimitConfig(env);

      return {
        success: true,
        environment: env,
        config
      };
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limit config:', error);
      throw new HttpsError('internal', 'Failed to get rate limit config');
    }
  }
);

/**
 * GET /admin/rate-limit/user-violations
 * Get detailed violations for a specific user
 */
export const admin_getUserRateLimitViolations = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await checkAdmin(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, periodHours } = request.data as {
      userId: string;
      periodHours?: number;
    };

    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    try {
      const hours = periodHours || 24;
      const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);

      const snapshot = await db.collection('rate_limits')
        .where('userId', '==', userId)
        .where('lastUpdatedAt', '>=', threshold)
        .orderBy('lastUpdatedAt', 'desc')
        .limit(100)
        .get();

      const violations = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          action: data.action,
          windowId: data.windowId,
          count: data.count,
          lastUpdatedAt: data.lastUpdatedAt.toMillis(),
          scope: data.scope
        };
      });

      return {
        success: true,
        userId,
        periodHours: hours,
        violations
      };
    } catch (error: any) {
      console.error('[ADMIN] Error getting user violations:', error);
      throw new HttpsError('internal', 'Failed to get user violations');
    }
  }
);