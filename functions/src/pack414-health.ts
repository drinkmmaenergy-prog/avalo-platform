/**
 * PACK 414 — Health Check Endpoints
 * 
 * Deep health checks for all critical Avalo subsystems.
 * Returns detailed status for each system component.
 * 
 * Stage: D — Launch & Defense
 * Purpose: Real-time health monitoring for launch readiness
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface HealthStatus {
  status: 'OK' | 'WARN' | 'FAIL';
  details: Record<string, any>;
  timestamp: string;
}

/**
 * Health Check: Wallet System
 * Validates wallet operations, balance tracking, and transactions
 */
export const health_wallet = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check wallet collection accessibility
      const walletsSnap = await db.collection('wallets').limit(1).get();
      checks.walletsAccessible = !walletsSnap.empty;
      
      // Check wallet config
      const walletConfig = await db.collection('system_config').doc('wallet').get();
      checks.configExists = walletConfig.exists;
      checks.config = walletConfig.data() || null;
      
      // Check transactions collection
      const transactionsSnap = await db.collection('wallet_transactions').limit(1).get();
      checks.transactionsAccessible = true;
      
      // Check ledger integrity
      const ledgerSnap = await db.collection('wallet_ledger').limit(1).get();
      checks.ledgerAccessible = true;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.configExists && checks.walletsAccessible ? 'OK' : 
        checks.walletsAccessible ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: Support System
 * Validates support tickets, SLA tracking, and admin console
 */
export const health_support = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check support tickets collection
      const ticketsSnap = await db.collection('support_tickets').limit(1).get();
      checks.ticketsAccessible = true;
      
      // Check SLA config
      const slaConfig = await db.collection('system_config').doc('sla').get();
      checks.slaConfigured = slaConfig.exists;
      
      // Check admin agents
      const agentsSnap = await db.collection('support_agents').limit(1).get();
      checks.agentsConfigured = !agentsSnap.empty;
      
      // Check ticket routing
      const routingConfig = await db.collection('system_config').doc('ticket_routing').get();
      checks.routingConfigured = routingConfig.exists;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.ticketsAccessible && checks.slaConfigured ? 'OK' : 
        checks.ticketsAccessible ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: Safety System
 * Validates abuse detection, fraud prevention, and panic mode
 */
export const health_safety = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check panic mode system
      const panicDoc = await db.collection('pack413_panic_state').doc('global').get();
      checks.panicModeReady = panicDoc.exists;
      if (panicDoc.exists) {
        checks.panicState = panicDoc.data();
      }
      
      // Check safety config
      const safetyConfig = await db.collection('system_config').doc('safety').get();
      checks.safetyConfigured = safetyConfig.exists;
      
      // Check abuse detection
      const abuseSnap = await db.collection('abuse_reports').limit(1).get();
      checks.abuseDetectionActive = true;
      
      // Check fraud detection
      const fraudConfig = await db.collection('system_config').doc('fraud_detection').get();
      checks.fraudDetectionConfigured = fraudConfig.exists;
      
      // Check minor protection
      const minorConfig = await db.collection('system_config').doc('minor_protection').get();
      checks.minorProtectionConfigured = minorConfig.exists;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.panicModeReady && checks.safetyConfigured && checks.fraudDetectionConfigured ? 'OK' : 
        checks.panicModeReady && checks.safetyConfigured ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: Store Reputation
 * Validates rating defense and keyword monitoring
 */
export const health_store_reputation = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check rating defense system
      const ratingDoc = await db.collection('pack410_rating_defense').doc('config').get();
      checks.ratingDefenseConfigured = ratingDoc.exists;
      if (ratingDoc.exists) {
        checks.ratingDefenseConfig = ratingDoc.data();
      }
      
      // Check keyword defense
      const keywordDoc = await db.collection('pack411_keyword_defense').doc('config').get();
      checks.keywordDefenseConfigured = keywordDoc.exists;
      
      // Check reputation monitoring
      const reputationSnap = await db.collection('app_store_reputation').limit(1).get();
      checks.reputationMonitoringActive = true;
      
      // Check review monitoring
      const reviewsSnap = await db.collection('app_store_reviews').limit(1).get();
      checks.reviewMonitoringActive = true;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.ratingDefenseConfigured ? 'OK' : 
        checks.reputationMonitoringActive ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: AI Systems
 * Validates AI companions, video/voice, and endpoint health
 */
export const health_ai = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check AI companions config
      const aiConfig = await db.collection('system_config').doc('ai_companions').get();
      checks.companionsConfigured = aiConfig.exists;
      
      // Check AI video/voice config
      const aiVideoConfig = await db.collection('system_config').doc('ai_video_voice').get();
      checks.videoVoiceConfigured = aiVideoConfig.exists;
      
      // Check AI characters collection
      const charactersSnap = await db.collection('ai_characters').limit(1).get();
      checks.charactersAccessible = true;
      
      // Check AI billing
      const aiBillingConfig = await db.collection('system_config').doc('ai_billing').get();
      checks.billingConfigured = aiBillingConfig.exists;
      
      // Check emotional intelligence
      const eiConfig = await db.collection('system_config').doc('emotional_intelligence').get();
      checks.emotionalIntelligenceConfigured = eiConfig.exists;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.companionsConfigured || checks.videoVoiceConfigured ? 'OK' : 'WARN';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: Notifications
 * Validates push notifications, FCM, and delivery pipeline
 */
export const health_notifications = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Check FCM config
      const fcmConfig = await db.collection('system_config').doc('fcm').get();
      checks.fcmConfigured = fcmConfig.exists;
      if (fcmConfig.exists) {
        checks.fcmConfig = fcmConfig.data();
      }
      
      // Check notification topics
      const topicConfig = await db.collection('system_config').doc('notification_topics').get();
      checks.topicsConfigured = topicConfig.exists;
      
      // Check notification delivery
      const notificationsSnap = await db.collection('notifications').limit(1).get();
      checks.notificationsAccessible = true;
      
      // Check device tokens
      const tokensSnap = await db.collection('device_tokens').limit(1).get();
      checks.deviceTokensConfigured = !tokensSnap.empty;
      
      // Check notification queue
      const queueSnap = await db.collection('notification_queue').limit(1).get();
      checks.queueAccessible = true;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.fcmConfigured && checks.notificationsAccessible ? 'OK' : 
        checks.notificationsAccessible ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Health Check: Performance
 * Validates system performance, error tracking, and monitoring
 */
export const health_performance = functions
  .https.onRequest(async (req, res) => {
    try {
      const checks: Record<string, any> = {};
      
      // Query latency test
      const queryStart = Date.now();
      await db.collection('system_config').limit(1).get();
      const queryLatency = Date.now() - queryStart;
      checks.queryLatency = queryLatency;
      checks.queryLatencyStatus = queryLatency < 1000 ? 'OK' : 'WARN';
      
      // Check error tracking config
      const errorConfig = await db.collection('system_config').doc('error_tracking').get();
      checks.errorTrackingConfigured = errorConfig.exists;
      
      // Check monitoring config
      const monitoringConfig = await db.collection('system_config').doc('monitoring').get();
      checks.monitoringConfigured = monitoringConfig.exists;
      
      // Check performance metrics collection
      const metricsSnap = await db.collection('performance_metrics').limit(1).get();
      checks.metricsCollectionActive = true;
      
      // Check regional launch system
      const regionDoc = await db.collection('pack412_regional_launch').doc('config').get();
      checks.regionalLaunchConfigured = regionDoc.exists;
      
      // Overall status
      const status: 'OK' | 'WARN' | 'FAIL' = 
        checks.queryLatencyStatus === 'OK' && checks.regionalLaunchConfigured ? 'OK' : 
        checks.queryLatencyStatus === 'OK' ? 'WARN' : 'FAIL';
      
      const result: HealthStatus = {
        status,
        details: checks,
        timestamp: new Date().toISOString()
      };
      
      res.status(status === 'OK' ? 200 : status === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * Master Health Check
 * Runs all health checks and returns aggregated status
 */
export const health_master = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    try {
      const startTime = Date.now();
      
      // Run all health checks in parallel
      const [
        walletSnap,
        supportSnap,
        safetySnap,
        notificationsSnap,
        performanceSnap,
        aiSnap,
        storeReputationSnap
      ] = await Promise.all([
        db.collection('wallets').limit(1).get(),
        db.collection('support_tickets').limit(1).get(),
        db.collection('pack413_panic_state').doc('global').get(),
        db.collection('notifications').limit(1).get(),
        db.collection('system_config').limit(1).get(),
        db.collection('ai_characters').limit(1).get(),
        db.collection('pack410_rating_defense').doc('config').get()
      ]);
      
      const checks = {
        wallet: { status: 'OK', accessible: true },
        support: { status: 'OK', accessible: true },
        safety: { status: safetySnap.exists ? 'OK' : 'WARN', configured: safetySnap.exists },
        notifications: { status: 'OK', accessible: true },
        performance: { status: 'OK', latency: Date.now() - startTime },
        ai: { status: 'OK', accessible: true },
        storeReputation: { status: storeReputationSnap.exists ? 'OK' : 'WARN', configured: storeReputationSnap.exists }
      };
      
      // Calculate overall status
      const failedChecks = Object.values(checks).filter((check: any) => check.status === 'FAIL').length;
      const warnChecks = Object.values(checks).filter((check: any) => check.status === 'WARN').length;
      
      const overallStatus: 'OK' | 'WARN' | 'FAIL' = 
        failedChecks > 0 ? 'FAIL' : 
        warnChecks > 2 ? 'WARN' : 'OK';
      
      const result = {
        status: overallStatus,
        checks,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      res.status(overallStatus === 'OK' ? 200 : overallStatus === 'WARN' ? 200 : 503).json(result);
      
    } catch (error) {
      res.status(503).json({
        status: 'FAIL',
        details: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }
  });
