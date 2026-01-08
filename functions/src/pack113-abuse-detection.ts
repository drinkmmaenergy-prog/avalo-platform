/**
 * PACK 113 — Full Ecosystem API Gateway
 * Abuse Detection & Security Monitoring
 * 
 * Detects suspicious patterns:
 * - Excessive posting
 * - Bot-like behavior
 * - NSFW classification dodging
 * - Content spam
 * - Rate limit bypass attempts
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  APIAbuseDetection,
  APIAbuseType,
  APIAuditLog,
  ExternalApp,
} from './pack113-types';

// ============================================================================
// ABUSE DETECTION PATTERNS
// ============================================================================

interface AbusePattern {
  type: APIAbuseType;
  severity: number;
  confidence: number;
  evidence: string[];
  metadata: Record<string, any>;
}

/**
 * Detect excessive posting pattern
 */
async function detectExcessivePosting(
  appId: string,
  userId: string,
  timeWindowHours: number = 24
): Promise<AbusePattern | null> {
  const threshold = Timestamp.fromMillis(Date.now() - timeWindowHours * 3600 * 1000);

  // Count POST requests to content endpoints
  const logsSnapshot = await db
    .collection('api_audit_log')
    .where('appId', '==', appId)
    .where('userId', '==', userId)
    .where('method', '==', 'POST')
    .where('timestamp', '>=', threshold)
    .get();

  const postCount = logsSnapshot.size;

  // Define thresholds
  const NORMAL_POST_RATE = 50; // 50 posts per 24h is normal
  const SUSPICIOUS_POST_RATE = 200; // 200+ is suspicious
  const ABUSIVE_POST_RATE = 500; // 500+ is clearly abuse

  if (postCount < SUSPICIOUS_POST_RATE) {
    return null;
  }

  const severity = Math.min(100, (postCount / ABUSIVE_POST_RATE) * 100);
  const confidence = postCount > ABUSIVE_POST_RATE ? 0.95 : 0.7;

  return {
    type: 'EXCESSIVE_POSTING',
    severity,
    confidence,
    evidence: [
      `${postCount} POST requests in ${timeWindowHours} hours`,
      `Normal rate: ${NORMAL_POST_RATE}/day`,
      `Posts/hour: ${(postCount / timeWindowHours).toFixed(1)}`,
    ],
    metadata: {
      postCount,
      timeWindowHours,
      threshold: SUSPICIOUS_POST_RATE,
    },
  };
}

/**
 * Detect bot-like behavior patterns
 */
async function detectBotLikeBehavior(
  appId: string,
  userId: string
): Promise<AbusePattern | null> {
  const threshold = Timestamp.fromMillis(Date.now() - 3600 * 1000); // Last hour

  const logsSnapshot = await db
    .collection('api_audit_log')
    .where('appId', '==', appId)
    .where('userId', '==', userId)
    .where('timestamp', '>=', threshold)
    .orderBy('timestamp', 'asc')
    .get();

  if (logsSnapshot.size < 20) {
    return null; // Not enough data
  }

  const logs = logsSnapshot.docs.map(doc => doc.data() as APIAuditLog);

  // Check for:
  // 1. Uniform intervals between requests
  // 2. Identical response times
  // 3. Same endpoint repeatedly
  const intervals: number[] = [];
  const responseTimes: number[] = [];
  const endpointCounts = new Map<string, number>();

  for (let i = 1; i < logs.length; i++) {
    const interval = logs[i].timestamp.toMillis() - logs[i - 1].timestamp.toMillis();
    intervals.push(interval);
    responseTimes.push(logs[i].responseTime);

    const count = endpointCounts.get(logs[i].endpoint) || 0;
    endpointCounts.set(logs[i].endpoint, count + 1);
  }

  // Calculate variance
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const intervalVariance =
    intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
  const intervalStdDev = Math.sqrt(intervalVariance);

  // Bot indicators
  const uniformIntervals = intervalStdDev < avgInterval * 0.1; // Very low variance
  const repetitiveEndpoint = Math.max(...Array.from(endpointCounts.values())) > logs.length * 0.8;

  if (!uniformIntervals && !repetitiveEndpoint) {
    return null;
  }

  const evidence: string[] = [];
  let severity = 0;

  if (uniformIntervals) {
    evidence.push(`Highly uniform request intervals (stddev: ${intervalStdDev.toFixed(2)}ms)`);
    severity += 50;
  }

  if (repetitiveEndpoint) {
    const topEndpoint = Array.from(endpointCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    evidence.push(`Single endpoint called ${topEndpoint[1]} times (${((topEndpoint[1] / logs.length) * 100).toFixed(0)}%)`);
    severity += 50;
  }

  return {
    type: 'BOT_LIKE_BEHAVIOR',
    severity: Math.min(100, severity),
    confidence: 0.8,
    evidence,
    metadata: {
      requestCount: logs.length,
      avgInterval,
      intervalStdDev,
      topEndpoint: Array.from(endpointCounts.entries())[0],
    },
  };
}

/**
 * Detect rate limit bypass attempts
 */
async function detectRateLimitBypass(
  appId: string,
  userId: string
): Promise<AbusePattern | null> {
  const threshold = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);

  // Check for multiple violations
  const limitDoc = await db
    .collection('api_rate_limits')
    .doc(`${appId}_${userId}`)
    .get();

  if (!limitDoc.exists) {
    return null;
  }

  const limitData = limitDoc.data()!;
  const violationCount = limitData.violationCount || 0;

  if (violationCount < 5) {
    return null; // Some violations are normal
  }

  // Check if they're trying different tokens or methods
  const securityEvents = await db
    .collection('api_security_events')
    .where('appId', '==', appId)
    .where('userId', '==', userId)
    .where('timestamp', '>=', threshold)
    .get();

  const invalidTokenAttempts = securityEvents.docs.filter(
    doc => doc.data().eventType === 'INVALID_TOKEN'
  ).length;

  if (invalidTokenAttempts > 10) {
    return {
      type: 'RATE_LIMIT_BYPASS',
      severity: 90,
      confidence: 0.9,
      evidence: [
        `${violationCount} rate limit violations`,
        `${invalidTokenAttempts} invalid token attempts`,
        'Possible token rotation to bypass limits',
      ],
      metadata: {
        violationCount,
        invalidTokenAttempts,
      },
    };
  }

  return null;
}

/**
 * Detect content spam across regions
 */
async function detectContentSpam(
  appId: string,
  userId: string
): Promise<AbusePattern | null> {
  const threshold = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);

  // Check for identical or near-identical content posted multiple times
  const postsSnapshot = await db
    .collection('posts')
    .where('authorId', '==', userId)
    .where('postedViaAPI', '==', true)
    .where('postedByAppId', '==', appId)
    .where('createdAt', '>=', threshold)
    .get();

  if (postsSnapshot.size < 10) {
    return null;
  }

  // Simple spam detection: check for repeated content
  const contentMap = new Map<string, number>();
  
  postsSnapshot.forEach(doc => {
    const post = doc.data();
    const content = post.content || '';
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (normalized.length > 10) {
      const count = contentMap.get(normalized) || 0;
      contentMap.set(normalized, count + 1);
    }
  });

  // Find duplicates
  const duplicates = Array.from(contentMap.entries()).filter(([_, count]) => count > 3);

  if (duplicates.length === 0) {
    return null;
  }

  const totalDuplicates = duplicates.reduce((sum, [_, count]) => sum + count, 0);
  const duplicateRate = totalDuplicates / postsSnapshot.size;

  if (duplicateRate < 0.3) {
    return null; // Less than 30% duplicates
  }

  return {
    type: 'CONTENT_SPAM',
    severity: Math.min(100, duplicateRate * 150),
    confidence: 0.85,
    evidence: [
      `${postsSnapshot.size} posts in 24h`,
      `${duplicates.length} unique messages repeated`,
      `${totalDuplicates} duplicate posts (${(duplicateRate * 100).toFixed(0)}%)`,
    ],
    metadata: {
      totalPosts: postsSnapshot.size,
      duplicateCount: totalDuplicates,
      duplicateRate: duplicateRate,
    },
  };
}

/**
 * Detect suspicious deletion patterns
 */
async function detectSuspiciousDeletion(
  appId: string,
  userId: string
): Promise<AbusePattern | null> {
  const threshold = Timestamp.fromMillis(Date.now() - 3600 * 1000); // Last hour

  const deleteLogs = await db
    .collection('api_audit_log')
    .where('appId', '==', appId)
    .where('userId', '==', userId)
    .where('method', '==', 'DELETE')
    .where('timestamp', '>=', threshold)
    .get();

  const deleteCount = deleteLogs.size;

  if (deleteCount < 20) {
    return null; // Normal deletion rate
  }

  return {
    type: 'SUSPICIOUS_DELETION',
    severity: Math.min(100, (deleteCount / 50) * 100),
    confidence: 0.75,
    evidence: [
      `${deleteCount} DELETE requests in 1 hour`,
      'Possible content cleanup to hide abuse',
    ],
    metadata: {
      deleteCount,
      timeWindow: '1 hour',
    },
  };
}

// ============================================================================
// ABUSE DETECTION ORCHESTRATION
// ============================================================================

/**
 * Run all abuse detection patterns for an app/user
 */
async function detectAbuse(appId: string, userId: string): Promise<AbusePattern[]> {
  const patterns = await Promise.all([
    detectExcessivePosting(appId, userId),
    detectBotLikeBehavior(appId, userId),
    detectRateLimitBypass(appId, userId),
    detectContentSpam(appId, userId),
    detectSuspiciousDeletion(appId, userId),
  ]);

  return patterns.filter((p): p is AbusePattern => p !== null);
}

/**
 * Create abuse detection record
 */
async function createAbuseDetection(
  appId: string,
  userId: string,
  pattern: AbusePattern
): Promise<string> {
  const detectionId = generateId();

  const detection: APIAbuseDetection = {
    detectionId,
    appId,
    userId,
    abuseType: pattern.type,
    severity: pattern.severity,
    confidence: pattern.confidence,
    evidenceCount: pattern.evidence.length,
    evidenceSummary: pattern.evidence.join(' | '),
    metadata: pattern.metadata,
    status: 'DETECTED',
    appSuspended: false,
    trustEventCreated: false,
    detectedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection('api_abuse_detections').doc(detectionId).set(detection);

  logger.warn('API abuse detected', {
    detectionId,
    appId,
    userId,
    abuseType: pattern.type,
    severity: pattern.severity,
  });

  // Auto-suspend app if severity is critical
  if (pattern.severity >= 90 && pattern.confidence >= 0.85) {
    await suspendApp(appId, detectionId, pattern);
  }

  // Create trust event for pack103/104 integration
  await createTrustEvent(userId, appId, pattern, detectionId);

  return detectionId;
}

/**
 * Suspend app automatically
 */
async function suspendApp(
  appId: string,
  detectionId: string,
  pattern: AbusePattern
): Promise<void> {
  await db.collection('external_apps').doc(appId).update({
    status: 'SUSPENDED',
    suspendedAt: serverTimestamp(),
    suspensionReason: `Auto-suspended: ${pattern.type} (severity: ${pattern.severity})`,
    suspensionDetectionId: detectionId,
    updatedAt: serverTimestamp(),
  });

  // Update detection record
  await db.collection('api_abuse_detections').doc(detectionId).update({
    appSuspended: true,
    updatedAt: serverTimestamp(),
  });

  logger.error('App auto-suspended due to abuse', {
    appId,
    detectionId,
    abuseType: pattern.type,
    severity: pattern.severity,
  });
}

/**
 * Create trust event for integration with PACK 103/104
 */
async function createTrustEvent(
  userId: string,
  appId: string,
  pattern: AbusePattern,
  detectionId: string
): Promise<void> {
  // Create a trust event that will be picked up by pack103/104
  const trustEvent = {
    userId,
    eventType: 'API_ABUSE',
    source: 'API_GATEWAY',
    severity: pattern.severity,
    confidence: pattern.confidence,
    details: {
      appId,
      abuseType: pattern.type,
      detectionId,
      evidence: pattern.evidence,
      metadata: pattern.metadata,
    },
    createdAt: serverTimestamp(),
  };

  await db.collection('trust_events').add(trustEvent);

  // Update detection record
  await db.collection('api_abuse_detections').doc(detectionId).update({
    trustEventCreated: true,
  });

  logger.info('Trust event created for API abuse', {
    userId,
    appId,
    detectionId,
    abuseType: pattern.type,
  });
}

// ============================================================================
// SCHEDULED ABUSE DETECTION
// ============================================================================

/**
 * Run abuse detection for all active apps
 * Runs every 15 minutes
 */
export const runAbuseDetection = onSchedule(
  {
    schedule: '*/15 * * * *', // Every 15 minutes
    timeZone: 'UTC',
    memory: '512MiB' as const,
    timeoutSeconds: 300,
  },
  async (event) => {
    try {
      logger.info('Starting API abuse detection scan');

      // Get all active apps
      const appsSnapshot = await db
        .collection('external_apps')
        .where('status', '==', 'ACTIVE')
        .get();

      let totalDetections = 0;
      let totalAppsScanned = 0;

      for (const appDoc of appsSnapshot.docs) {
        const app = appDoc.data() as ExternalApp;
        const appId = app.appId;

        // Get recent authorizations for this app
        const authsSnapshot = await db
          .collection('user_app_authorizations')
          .where('appId', '==', appId)
          .limit(100) // Check top 100 users per app
          .get();

        for (const authDoc of authsSnapshot.docs) {
          const auth = authDoc.data();
          const userId = auth.userId;

          try {
            // Run detection patterns
            const patterns = await detectAbuse(appId, userId);

            if (patterns.length > 0) {
              // Create detection records for each pattern
              for (const pattern of patterns) {
                await createAbuseDetection(appId, userId, pattern);
                totalDetections++;
              }
            }

            totalAppsScanned++;
          } catch (error: any) {
            logger.error('Error detecting abuse for user', {
              appId,
              userId,
              error: error.message,
            });
          }
        }
      }

      logger.info('Completed API abuse detection scan', {
        totalAppsScanned,
        totalDetections,
      });

      return null;
    } catch (error: any) {
      logger.error('Error in abuse detection scan', error);
      throw error;
    }
  }
);

/**
 * Review and cleanup old detections
 * Runs daily
 */
export const cleanupOldDetections = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      const threshold = Timestamp.fromMillis(Date.now() - 90 * 24 * 3600 * 1000); // 90 days

      const oldDetections = await db
        .collection('api_abuse_detections')
        .where('detectedAt', '<', threshold)
        .get();

      const batch = db.batch();
      oldDetections.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${oldDetections.size} old abuse detections`);
      return null;
    } catch (error: any) {
      logger.error('Error cleaning up detections', error);
      throw error;
    }
  }
);