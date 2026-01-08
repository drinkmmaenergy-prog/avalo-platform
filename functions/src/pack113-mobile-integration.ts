/**
 * PACK 113 — Mobile Integration Functions
 * Cloud Functions for mobile app to manage connected apps
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import {
  UserAppAuthorization,
  ExternalApp,
  AccessToken,
} from './pack113-types';
import { revokeAccessToken } from './pack113-api-gateway';

// ============================================================================
// GET CONNECTED APPS
// ============================================================================

/**
 * Get list of connected apps for current user
 */
export const getConnectedApps = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;

    try {
      // Get user's authorizations
      const authsSnapshot = await db
        .collection('user_app_authorizations')
        .where('userId', '==', userId)
        .get();

      const connectedApps = [];

      for (const authDoc of authsSnapshot.docs) {
        const auth = authDoc.data() as UserAppAuthorization;

        // Get app details
        const appDoc = await db.collection('external_apps').doc(auth.appId).get();
        
        if (appDoc.exists) {
          const app = appDoc.data() as ExternalApp;

          connectedApps.push({
            authorization: {
              authorizationId: auth.authorizationId,
              userId: auth.userId,
              appId: auth.appId,
              grantedScopes: auth.grantedScopes,
              grantedAt: auth.grantedAt,
              activeTokenCount: auth.activeTokenCount || 0,
              lastUsedAt: auth.lastUsedAt,
            },
            app: {
              appId: app.appId,
              name: app.name,
              description: app.description,
              type: app.type,
              status: app.status,
            },
          });
        }
      }

      return { connectedApps };
    } catch (error: any) {
      logger.error('Error getting connected apps', error);
      throw new HttpsError('internal', 'Failed to get connected apps');
    }
  }
);

// ============================================================================
// REVOKE APP ACCESS
// ============================================================================

/**
 * Revoke access for a specific app
 */
export const revokeAppAccess = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { appId } = request.data;

    if (!appId) {
      throw new HttpsError('invalid-argument', 'appId required');
    }

    try {
      // Verify authorization exists
      const authSnapshot = await db
        .collection('user_app_authorizations')
        .where('userId', '==', userId)
        .where('appId', '==', appId)
        .get();

      if (authSnapshot.empty) {
        throw new HttpsError('not-found', 'Authorization not found');
      }

      // Revoke all tokens for this app/user
      const result = await revokeAccessToken({
        userId,
        appId,
        reason: 'User revoked app access',
      });

      // Delete authorization
      const batch = db.batch();
      authSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      logger.info('App access revoked', {
        userId,
        appId,
        tokensRevoked: result.revokedCount,
      });

      return {
        success: true,
        tokensRevoked: result.revokedCount,
      };
    } catch (error: any) {
      logger.error('Error revoking app access', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to revoke app access');
    }
  }
);

// ============================================================================
// GET APP DETAILS
// ============================================================================

/**
 * Get detailed information about a connected app
 */
export const getAppDetails = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { appId } = request.data;

    if (!appId) {
      throw new HttpsError('invalid-argument', 'appId required');
    }

    try {
      // Verify user has authorization for this app
      const authSnapshot = await db
        .collection('user_app_authorizations')
        .where('userId', '==', userId)
        .where('appId', '==', appId)
        .get();

      if (authSnapshot.empty) {
        throw new HttpsError('not-found', 'No authorization for this app');
      }

      const auth = authSnapshot.docs[0].data() as UserAppAuthorization;

      // Get app details
      const appDoc = await db.collection('external_apps').doc(appId).get();
      if (!appDoc.exists) {
        throw new HttpsError('not-found', 'App not found');
      }

      const app = appDoc.data() as ExternalApp;

      // Get recent activity (last 10 API calls)
      const recentActivity = await db
        .collection('api_audit_log')
        .where('appId', '==', appId)
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      const activity = recentActivity.docs.map(doc => ({
        endpoint: doc.data().endpoint,
        method: doc.data().method,
        statusCode: doc.data().statusCode,
        timestamp: doc.data().timestamp,
      }));

      return {
        app: {
          appId: app.appId,
          name: app.name,
          description: app.description,
          type: app.type,
          status: app.status,
        },
        authorization: {
          grantedScopes: auth.grantedScopes,
          grantedAt: auth.grantedAt,
          activeTokenCount: auth.activeTokenCount || 0,
          lastUsedAt: auth.lastUsedAt,
        },
        recentActivity: activity,
      };
    } catch (error: any) {
      logger.error('Error getting app details', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get app details');
    }
  }
);

// ============================================================================
// ROTATE API KEY (for app owners)
// ============================================================================

/**
 * Rotate API key for an app (app creator only)
 */
export const rotateAPIKey = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = request.auth.uid;
    const { appId } = request.data;

    if (!appId) {
      throw new HttpsError('invalid-argument', 'appId required');
    }

    try {
      // Verify user owns this app
      const appDoc = await db.collection('external_apps').doc(appId).get();
      if (!appDoc.exists) {
        throw new HttpsError('not-found', 'App not found');
      }

      const app = appDoc.data() as ExternalApp;
      if (app.createdBy !== userId) {
        throw new HttpsError('permission-denied', 'Not authorized to rotate key for this app');
      }

      // Generate new API key
      const crypto = require('crypto');
      const newApiKey = crypto.randomBytes(32).toString('hex');
      const newApiKeyHash = crypto
        .createHash('sha256')
        .update(newApiKey)
        .digest('hex');

      // Update app
      await db.collection('external_apps').doc(appId).update({
        apiKeyHash: newApiKeyHash,
        updatedAt: serverTimestamp(),
      });

      // Revoke all existing tokens for this app
      const tokensSnapshot = await db
        .collection('access_tokens')
        .where('appId', '==', appId)
        .get();

      const batch = db.batch();
      tokensSnapshot.forEach(doc => {
        batch.update(doc.ref, {
          revokedAt: serverTimestamp(),
          revokedReason: 'API key rotated',
        });
      });
      await batch.commit();

      logger.info('API key rotated', {
        userId,
        appId,
        tokensRevoked: tokensSnapshot.size,
      });

      return {
        success: true,
        newApiKey, // Return new key once
        tokensRevoked: tokensSnapshot.size,
      };
    } catch (error: any) {
      logger.error('Error rotating API key', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to rotate API key');
    }
  }
);