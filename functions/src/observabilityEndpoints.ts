/**
 * PACK 69 - Observability API Endpoints
 * 
 * Mobile error reporting and admin health APIs
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logEvent, LogLevel } from './observability.js';

// ============================================================================
// RATE LIMITING
// ============================================================================

const mobileErrorReports = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const record = mobileErrorReports.get(identifier);
  
  if (!record || now > record.resetAt) {
    mobileErrorReports.set(identifier, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (record.count >= maxPerMinute) {
    return false;
  }
  
  record.count++;
  return true;
}

// ============================================================================
// MOBILE ERROR REPORTING
// ============================================================================

export const mobileErrorReport = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const {
        userId,
        platform,
        appVersion,
        screen,
        errorMessage,
        errorName,
        stack,
        severity,
        extra,
      } = req.body;

      // Validate required fields
      if (!platform || !appVersion || !errorMessage) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Rate limiting (per IP or userId)
      const identifier = userId || req.ip || 'unknown';
      if (!checkRateLimit(identifier, 10)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Sanitize and truncate error message
      const sanitizedMessage = errorMessage.substring(0, 500);
      const sanitizedStack = stack ? stack.substring(0, 2000) : undefined;

      // Write log entry
      await logEvent({
        level: (severity as LogLevel) || 'ERROR',
        source: 'MOBILE',
        service: 'app-mobile',
        module: screen || 'MOBILE_APP',
        message: sanitizedMessage,
        context: {
          userId,
          platform: platform as 'android' | 'ios',
          appVersion,
        },
        details: {
          stackSnippet: sanitizedStack,
          extra: {
            errorName,
            locale: extra?.locale,
            networkType: extra?.networkType,
            isForeground: extra?.isForeground,
          },
        },
      });

      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('Mobile error report failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================================
// HEALTH AGGREGATION (Scheduled Job)
// ============================================================================

export const aggregateSystemHealth = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    region: 'europe-west3',
  },
  async (event) => {
    console.log('🔍 Aggregating system health snapshots...');
    
    try {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Aggregate hourly snapshot
      await aggregateSnapshot('HOURLY', oneHourAgo, now);
      
      // At midnight UTC, also aggregate daily snapshot
      const currentHour = new Date().getUTCHours();
      if (currentHour === 0) {
        await aggregateSnapshot('DAILY', oneDayAgo, now);
      }

      console.log('✅ System health aggregation completed');
    } catch (error) {
      console.error('❌ System health aggregation failed:', error);
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.observability',
        module: 'HEALTH_AGGREGATION',
        message: 'Failed to aggregate system health',
        details: {
          stackSnippet: (error as Error).stack?.substring(0, 500),
        },
      });
    }
  }
);

async function aggregateSnapshot(
  period: 'HOURLY' | 'DAILY',
  fromMs: number,
  toMs: number
): Promise<void> {
  const fromTimestamp = Timestamp.fromMillis(fromMs);
  const toTimestamp = Timestamp.fromMillis(toMs);
  
  // Query logs in time range
  const logsSnapshot = await db.collection('system_logs')
    .where('timestamp', '>=', fromTimestamp)
    .where('timestamp', '<', toTimestamp)
    .get();

  // Count by level
  const errorCounts = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  };

  // Count by module
  const moduleErrorCounts: { [module: string]: { error: number; critical: number } } = {};

  logsSnapshot.forEach((doc) => {
    const log = doc.data();
    const level = log.level?.toLowerCase() || 'info';
    
    if (level in errorCounts) {
      errorCounts[level as keyof typeof errorCounts]++;
    }

    // Track module-specific errors
    if (log.module && (log.level === 'ERROR' || log.level === 'CRITICAL')) {
      if (!moduleErrorCounts[log.module]) {
        moduleErrorCounts[log.module] = { error: 0, critical: 0 };
      }
      
      if (log.level === 'ERROR') {
        moduleErrorCounts[log.module].error++;
      } else if (log.level === 'CRITICAL') {
        moduleErrorCounts[log.module].critical++;
      }
    }
  });

  // Placeholder for business flow metrics
  // In a real implementation, query actual business events
  const flows = {
    payouts: {
      totalRequests: 0,
      failed: 0,
    },
    reservations: {
      totalBookings: 0,
      failed: 0,
    },
    payments: {
      tokenPurchases: 0,
      failed: 0,
    },
  };

  // Create snapshot ID
  const timestamp = new Date(fromMs).toISOString().replace(/[:.]/g, '-');
  const snapshotId = `${period.toLowerCase()}_${timestamp}`;

  const snapshot = {
    snapshotId,
    period,
    from: fromTimestamp,
    to: toTimestamp,
    errorCounts,
    moduleErrorCounts,
    flows,
    createdAt: serverTimestamp(),
  };

  await db.collection('system_health_snapshots').doc(snapshotId).set(snapshot);
  console.log(`📊 Created ${period} snapshot: ${snapshotId}`);
}

// ============================================================================
// ADMIN HEALTH APIS
// ============================================================================

/**
 * Get recent system logs
 * POST /admin/health/logs
 */
export const adminHealthLogs = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // TODO: Add proper admin authentication
      // For now, require Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        levelMin,
        module,
        service,
        source,
        fromTimestamp,
        toTimestamp,
        limit = 100,
        cursor,
      } = req.body;

      let query = db.collection('system_logs').orderBy('timestamp', 'desc');

      // Apply filters
      if (levelMin) {
        const levelOrder = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
        const minIndex = levelOrder.indexOf(levelMin);
        const allowedLevels = levelOrder.slice(minIndex);
        query = query.where('level', 'in', allowedLevels) as any;
      }

      if (module) {
        query = query.where('module', '==', module) as any;
      }

      if (service) {
        query = query.where('service', '==', service) as any;
      }

      if (source) {
        query = query.where('source', '==', source) as any;
      }

      if (fromTimestamp) {
        query = query.where('timestamp', '>=', Timestamp.fromMillis(fromTimestamp)) as any;
      }

      if (toTimestamp) {
        query = query.where('timestamp', '<', Timestamp.fromMillis(toTimestamp)) as any;
      }

      if (cursor) {
        const cursorDoc = await db.collection('system_logs').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc) as any;
        }
      }

      query = query.limit(Math.min(limit, 500)) as any;

      const snapshot = await query.get();
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      const nextCursor = snapshot.docs.length > 0 
        ? snapshot.docs[snapshot.docs.length - 1].id 
        : null;

      res.status(200).json({
        ok: true,
        logs,
        nextCursor,
      });
    } catch (error: any) {
      console.error('Admin health logs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Get health snapshots
 * GET /admin/health/snapshots
 */
export const adminHealthSnapshots = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // TODO: Add proper admin authentication
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const period = (req.query.period as string) || 'HOURLY';
      const limit = Math.min(parseInt(req.query.limit as string) || 24, 100);

      let query = db.collection('system_health_snapshots')
        .where('period', '==', period)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      const snapshot = await query.get();
      const snapshots = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.status(200).json({
        ok: true,
        snapshots,
      });
    } catch (error: any) {
      console.error('Admin health snapshots error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Get current health summary
 * GET /admin/health/summary
 */
export const adminHealthSummary = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // TODO: Add proper admin authentication
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get latest daily snapshot
      const dailySnapshot = await db.collection('system_health_snapshots')
        .where('period', '==', 'DAILY')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (dailySnapshot.empty) {
        res.status(200).json({
          ok: true,
          status: 'OK',
          message: 'No data available yet',
        });
        return;
      }

      const snapshot = dailySnapshot.docs[0].data();
      
      // Determine status based on error counts
      let status: 'OK' | 'DEGRADED' | 'CRITICAL' = 'OK';
      const notes: string[] = [];

      // Check for critical errors
      if (snapshot.errorCounts.critical > 10) {
        status = 'CRITICAL';
        notes.push(`${snapshot.errorCounts.critical} critical errors in last 24h`);
      } else if (snapshot.errorCounts.critical > 5) {
        status = 'DEGRADED';
        notes.push(`${snapshot.errorCounts.critical} critical errors detected`);
      }

      // Check for high error rates in specific modules
      for (const [module, counts] of Object.entries(snapshot.moduleErrorCounts || {})) {
        const moduleCounts = counts as { error: number; critical: number };
        if (moduleCounts.critical > 5) {
          status = 'CRITICAL';
          notes.push(`High critical errors in ${module}`);
        } else if (moduleCounts.error > 50) {
          if (status === 'OK') status = 'DEGRADED';
          notes.push(`Elevated errors in ${module}`);
        }
      }

      // Check flow failure rates
      const flows = snapshot.flows || {};
      if (flows.payouts?.failed > flows.payouts?.totalRequests * 0.1) {
        status = 'CRITICAL';
        notes.push('Payout errors elevated in last 24h');
      }

      if (flows.payments?.failed > flows.payments?.tokenPurchases * 0.05) {
        if (status === 'OK') status = 'DEGRADED';
        notes.push('Payment failures detected');
      }

      res.status(200).json({
        ok: true,
        status,
        lastDailySnapshot: snapshot,
        notes,
      });
    } catch (error: any) {
      console.error('Admin health summary error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);