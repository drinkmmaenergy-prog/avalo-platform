/**
 * Health Check Endpoints for Avalo Platform
 * 
 * Provides comprehensive health checks for all system components
 */

import * as functions from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services?: {
    database: 'healthy' | 'unhealthy' | 'degraded';
    auth: 'healthy' | 'unhealthy' | 'degraded';
    storage: 'healthy' | 'unhealthy' | 'degraded';
  };
  responseTime?: number;
  uptime?: number;
  error?: string;
}

/**
 * Main health check endpoint
 * GET /health
 */
export const health = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    // Run all health checks in parallel
    const [firestoreHealth, authHealth, storageHealth] = await Promise.all([
      checkFirestore(),
      checkAuth(),
      checkStorage(),
    ]);

    const allHealthy = firestoreHealth && authHealth && storageHealth;
    const responseTime = Date.now() - startTime;

    const result: HealthCheckResult = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      services: {
        database: firestoreHealth ? 'healthy' : 'unhealthy',
        auth: authHealth ? 'healthy' : 'unhealthy',
        storage: storageHealth ? 'healthy' : 'unhealthy',
      },
      responseTime,
      uptime: process.uptime(),
    };

    res.status(allHealthy ? 200 : 503).json(result);
  } catch (error) {
    console.error('Health check error:', error);
    
    const result: HealthCheckResult = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      error: error instanceof Error ? error.message : 'Health check failed',
      responseTime: Date.now() - startTime,
    };

    res.status(503).json(result);
  }
});

/**
 * Detailed health check with component testing
 * GET /health/detailed
 */
export const healthDetailed = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const startTime = Date.now();

  try {
    const checks = await Promise.allSettled([
      checkFirestoreDetailed(),
      checkAuthDetailed(),
      checkStorageDetailed(),
    ]);

    const [firestoreResult, authResult, storageResult] = checks;

    const result = {
      status: checks.every((c) => c.status === 'fulfilled') ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      checks: {
        firestore: firestoreResult.status === 'fulfilled' ? firestoreResult.value : { status: 'failed', error: (firestoreResult as PromiseRejectedResult).reason },
        auth: authResult.status === 'fulfilled' ? authResult.value : { status: 'failed', error: (authResult as PromiseRejectedResult).reason },
        storage: storageResult.status === 'fulfilled' ? storageResult.value : { status: 'failed', error: (storageResult as PromiseRejectedResult).reason },
      },
      responseTime: Date.now() - startTime,
    };

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Liveness probe - simple check that process is running
 * GET /health/live
 */
export const healthLive = functions.https.onRequest((req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe - check if ready to serve traffic
 * GET /health/ready
 */
export const healthReady = functions.https.onRequest(async (req, res) => {
  res.set('Cache-Control', 'no-cache');

  try {
    // Quick check - just verify database connection
    const isReady = await checkFirestore();

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================
// HEALTH CHECK FUNCTIONS
// ============================================

/**
 * Check Firestore health
 */
async function checkFirestore(): Promise<boolean> {
  try {
    const db = getFirestore();
    const docRef = db.collection('_health').doc('check');
    
    // Write and read test
    await docRef.set({ lastCheck: new Date().toISOString() }, { merge: true });
    await docRef.get();
    
    return true;
  } catch (error) {
    console.error('Firestore health check failed:', error);
    return false;
  }
}

/**
 * Detailed Firestore health check
 */
async function checkFirestoreDetailed() {
  const startTime = Date.now();
  
  try {
    const db = getFirestore();
    const docRef = db.collection('_health').doc('check');
    
    // Write test
    const writeStart = Date.now();
    await docRef.set({ lastCheck: new Date().toISOString() }, { merge: true });
    const writeTime = Date.now() - writeStart;
    
    // Read test
    const readStart = Date.now();
    const doc = await docRef.get();
    const readTime = Date.now() - readStart;
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      metrics: {
        writeTime,
        readTime,
        documentExists: doc.exists,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Check Firebase Auth health
 */
async function checkAuth(): Promise<boolean> {
  try {
    const auth = getAuth();
    
    // List users (limit 1) as a health check
    await auth.listUsers(1);
    
    return true;
  } catch (error) {
    console.error('Auth health check failed:', error);
    return false;
  }
}

/**
 * Detailed Auth health check
 */
async function checkAuthDetailed() {
  const startTime = Date.now();
  
  try {
    const auth = getAuth();
    
    // List users as health check
    const listStart = Date.now();
    const result = await auth.listUsers(1);
    const listTime = Date.now() - listStart;
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      metrics: {
        listTime,
        usersFound: result.users.length,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Check Cloud Storage health
 */
async function checkStorage(): Promise<boolean> {
  try {
    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Check if bucket exists
    const [exists] = await bucket.exists();
    
    return exists;
  } catch (error) {
    console.error('Storage health check failed:', error);
    return false;
  }
}

/**
 * Detailed Storage health check
 */
async function checkStorageDetailed() {
  const startTime = Date.now();
  
  try {
    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Check bucket existence
    const existsStart = Date.now();
    const [exists] = await bucket.exists();
    const existsTime = Date.now() - existsStart;
    
    if (!exists) {
      return {
        status: 'unhealthy',
        error: 'Bucket does not exist',
        responseTime: Date.now() - startTime,
      };
    }
    
    // Get metadata
    const metadataStart = Date.now();
    const [metadata] = await bucket.getMetadata();
    const metadataTime = Date.now() - metadataStart;
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      metrics: {
        existsTime,
        metadataTime,
        bucketName: metadata.name,
        storageClass: metadata.storageClass,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * System metrics endpoint
 * GET /health/metrics
 */
export const healthMetrics = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      nodejs: process.version,
    };

    res.status(200).json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});