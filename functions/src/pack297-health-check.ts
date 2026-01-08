/**
 * PACK 297 - Health Check & Monitoring Endpoints
 * 
 * Provides health status and service monitoring
 */

import { onRequest } from 'firebase-functions/v2/https';
import { db } from './init.js';
import Stripe from 'stripe';

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  env: 'STAGING' | 'PRODUCTION';
  services: {
    firebase: 'ok' | 'degraded' | 'down';
    stripe: 'ok' | 'degraded' | 'down';
  };
  time: string;
  version?: string;
}

/**
 * Check Firebase connectivity
 */
async function checkFirebase(): Promise<'ok' | 'degraded' | 'down'> {
  try {
    // Try to read a test document
    await db.collection('_health_check').doc('test').get();
    return 'ok';
  } catch (error) {
    console.error('Firebase health check failed:', error);
    return 'down';
  }
}

/**
 * Check Stripe connectivity
 */
async function checkStripe(): Promise<'ok' | 'degraded' | 'down'> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return 'degraded';
    }
    
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });
    
    // Try to retrieve account info (lightweight check)
    await stripe.balance.retrieve();
    return 'ok';
  } catch (error) {
    console.error('Stripe health check failed:', error);
    return 'down';
  }
}

/**
 * GET /health
 * Public health check endpoint (no auth required)
 */
export const healthCheck = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    try {
      // Determine environment
      const environment = process.env.FUNCTION_ENV === 'staging' ? 'STAGING' : 'PRODUCTION';
      
      // Check services
      const [firebaseStatus, stripeStatus] = await Promise.all([
        checkFirebase(),
        checkStripe()
      ]);
      
      // Determine overall status
      let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
      
      if (firebaseStatus === 'down') {
        overallStatus = 'down';
      } else if (stripeStatus === 'down' || firebaseStatus === 'degraded' || stripeStatus === 'degraded') {
        overallStatus = 'degraded';
      }
      
      const response: HealthCheckResponse = {
        status: overallStatus,
        env: environment,
        services: {
          firebase: firebaseStatus,
          stripe: stripeStatus
        },
        time: new Date().toISOString(),
        version: process.env.APP_VERSION || 'unknown'
      };
      
      // Set appropriate status code
      const statusCode = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        status: 'down',
        error: 'Health check failed'
      });
    }
  }
);

/**
 * GET /health/detailed
 * Detailed health check with more metrics (requires auth)
 */
export const healthCheckDetailed = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    // TODO: Add admin authentication check
    
    try {
      const environment = process.env.FUNCTION_ENV === 'staging' ? 'STAGING' : 'PRODUCTION';
      
      // Check services with timing
      const startTime = Date.now();
      const firebaseStartTime = Date.now();
      const firebaseStatus = await checkFirebase();
      const firebaseTime = Date.now() - firebaseStartTime;
      
      const stripeStartTime = Date.now();
      const stripeStatus = await checkStripe();
      const stripeTime = Date.now() - stripeStartTime;
      
      const totalTime = Date.now() - startTime;
      
      // Get additional metrics
      const [activeUsers, pendingTransactions] = await Promise.all([
        getActiveUsersCount(),
        getPendingTransactionCount()
      ]);
      
      let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
      if (firebaseStatus === 'down') {
        overallStatus = 'down';
      } else if (stripeStatus === 'down' || firebaseStatus === 'degraded' || stripeStatus === 'degraded') {
        overallStatus = 'degraded';
      }
      
      res.status(200).json({
        status: overallStatus,
        env: environment,
        services: {
          firebase: {
            status: firebaseStatus,
            responseTime: `${firebaseTime}ms`
          },
          stripe: {
            status: stripeStatus,
            responseTime: `${stripeTime}ms`
          }
        },
        metrics: {
          activeUsers,
          pendingTransactions,
          totalCheckTime: `${totalTime}ms`
        },
        time: new Date().toISOString(),
        version: process.env.APP_VERSION || 'unknown'
      });
    } catch (error) {
      console.error('Detailed health check error:', error);
      res.status(500).json({
        status: 'down',
        error: 'Health check failed'
      });
    }
  }
);

/**
 * Get count of active users (last 24h)
 */
async function getActiveUsersCount(): Promise<number> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const snapshot = await db
      .collection('users')
      .where('lastActiveAt', '>=', yesterday)
      .count()
      .get();
    
    return snapshot.data().count || 0;
  } catch (error) {
    console.error('Error getting active users count:', error);
    return -1;
  }
}

/**
 * Get count of pending transactions
 */
async function getPendingTransactionCount(): Promise<number> {
  try {
    const snapshot = await db
      .collection('transactions')
      .where('status', '==', 'pending')
      .count()
      .get();
    
    return snapshot.data().count || 0;
  } catch (error) {
    console.error('Error getting pending transaction count:', error);
    return -1;
  }
}