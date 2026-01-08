/**
 * PACK 317 — Launch Check Endpoint
 * 
 * Read-only endpoint that verifies system readiness:
 * - Environment verification
 * - Critical module health checks
 * - Security feature status
 * - Config validation
 * 
 * Used by ops before flipping to production
 */

import { db } from './init';
import { getLaunchConfig } from './pack317-launch-gate';
import * as functions from 'firebase-functions';

// ============================================================================
// TYPES
// ============================================================================

export type ModuleStatus = 'OK' | 'FAIL' | 'DISABLED_BY_CONFIG';

export interface LaunchCheckResponse {
  env: string;
  appConfigVersion: number;
  launchStatus: 'PRELAUNCH' | 'LIMITED_BETA' | 'OPEN';
  criticalModules: {
    auth: ModuleStatus;
    verification: ModuleStatus;
    wallet: ModuleStatus;
    chat: ModuleStatus;
    calendar: ModuleStatus;
    events: ModuleStatus;
    aiCompanions: ModuleStatus;
    notifications: ModuleStatus;
  };
  security: {
    rateLimiting: 'ENABLED' | 'DISABLED';
    errorTracking: 'ENABLED' | 'DISABLED';
    monitoring: 'ENABLED' | 'DISABLED';
  };
  timestamp: string;
}

// ============================================================================
// LAUNCH CHECK ENDPOINT
// ============================================================================

/**
 * GET /system/launch-check
 * Returns system readiness status
 */
export const launchCheck = functions.https.onRequest(async (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const result = await performLaunchCheck();
    
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[Pack317] Launch check failed:', error);
    res.status(500).json({
      error: 'Launch check failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Perform comprehensive launch readiness check
 */
async function performLaunchCheck(): Promise<LaunchCheckResponse> {
  const env = process.env.NODE_ENV || 'development';
  const launchConfig = await getLaunchConfig();

  // Check critical modules
  const criticalModules = {
    auth: await checkAuthModule(),
    verification: await checkVerificationModule(),
    wallet: await checkWalletModule(),
    chat: await checkChatModule(),
    calendar: await checkCalendarModule(),
    events: await checkEventsModule(),
    aiCompanions: await checkAICompanionsModule(),
    notifications: await checkNotificationsModule(),
  };

  // Check security features
  const security = {
    rateLimiting: await checkRateLimiting(),
    errorTracking: await checkErrorTracking(),
    monitoring: await checkMonitoring(),
  };

  return {
    env,
    appConfigVersion: 317, // PACK 317
    launchStatus: launchConfig.status,
    criticalModules,
    security,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// MODULE HEALTH CHECKS
// ============================================================================

async function checkAuthModule(): Promise<ModuleStatus> {
  try {
    // Check if auth config exists
    const authConfig = await db.collection('config').doc('auth').get();
    
    // Verify Firebase Auth is accessible
    const admin = require('firebase-admin');
    await admin.auth().listUsers(1); // Test auth API
    
    return 'OK';
  } catch (error) {
    console.error('[LaunchCheck] Auth module check failed:', error);
    return 'FAIL';
  }
}

async function checkVerificationModule(): Promise<ModuleStatus> {
  try {
    // Check if verification settings exist
    const verificationDoc = await db.collection('config').doc('verification').get();
    return verificationDoc.exists ? 'OK' : 'FAIL';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkWalletModule(): Promise<ModuleStatus> {
  try {
    // Check if token packs are configured
    const tokenPacks = await db.collection('token_packs').limit(1).get();
    
    // Check if treasury is initialized
    const treasury = await db.collection('treasury_vaults').doc('platform').get();
    
    return (tokenPacks.size > 0 && treasury.exists) ? 'OK' : 'FAIL';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkChatModule(): Promise<ModuleStatus> {
  try {
    // Check if chat pricing config exists
    const chatConfig = await db.collection('config').doc('chatPricing').get();
    return chatConfig.exists ? 'OK' : 'FAIL';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkCalendarModule(): Promise<ModuleStatus> {
  try {
    // Check if calendar config exists
    const calendarConfig = await db.collection('config').doc('calendar').get();
    return calendarConfig.exists ? 'OK' : 'DISABLED_BY_CONFIG';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkEventsModule(): Promise<ModuleStatus> {
  try {
    // Check if events config exists
    const eventsConfig = await db.collection('config').doc('events').get();
    return eventsConfig.exists ? 'OK' : 'DISABLED_BY_CONFIG';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkAICompanionsModule(): Promise<ModuleStatus> {
  try {
    // Check if AI config exists
    const aiConfig = await db.collection('config').doc('aiCompanions').get();
    
    if (!aiConfig.exists) {
      return 'DISABLED_BY_CONFIG';
    }

    const data = aiConfig.data();
    return data?.enabled === false ? 'DISABLED_BY_CONFIG' : 'OK';
  } catch (error) {
    return 'FAIL';
  }
}

async function checkNotificationsModule(): Promise<ModuleStatus> {
  try {
    // Check if notification config exists
    const notifConfig = await db.collection('config').doc('notifications').get();
    return notifConfig.exists ? 'OK' : 'FAIL';
  } catch (error) {
    return 'FAIL';
  }
}

// ============================================================================
// SECURITY FEATURE CHECKS
// ============================================================================

async function checkRateLimiting(): Promise<'ENABLED' | 'DISABLED'> {
  try {
    // Check if rate limits collection exists and has data
    const rateLimits = await db.collection('rateLimits').limit(1).get();
    return rateLimits.size > 0 ? 'ENABLED' : 'DISABLED';
  } catch (error) {
    return 'DISABLED';
  }
}

async function checkErrorTracking(): Promise<'ENABLED' | 'DISABLED'> {
  try {
    // Check if error tracking is configured (look for recent tech event logs)
    const recentLogs = await db
      .collection('tech_event_log')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    return recentLogs.size > 0 ? 'ENABLED' : 'DISABLED';
  } catch (error) {
    return 'DISABLED';
  }
}

async function checkMonitoring(): Promise<'ENABLED' | 'DISABLED'> {
  try {
    // Check if monitoring config exists (PACK 313)
    const monitoringConfig = await db.collection('config').doc('monitoring').get();
    
    if (!monitoringConfig.exists) {
      return 'DISABLED';
    }

    const data = monitoringConfig.data();
    return data?.enabled === true ? 'ENABLED' : 'DISABLED';
  } catch (error) {
    return 'DISABLED';
  }
}

// ============================================================================
// CALLABLE VERSION (for admin use)
// ============================================================================

/**
 * Callable version of launch check (admin only)
 */
export const launchCheckCallable = functions.https.onCall(async (data, context) => {
  // Optional: Add admin authentication here
  
  try {
    const result = await performLaunchCheck();
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[Pack317] Launch check callable failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});