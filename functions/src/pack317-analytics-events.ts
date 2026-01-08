/**
 * PACK 317 — Security Analytics & Audit Events
 * 
 * Additional analytics events for security monitoring:
 * - Rate limit hits
 * - Spam detection
 * - Launch gate changes
 * - Security violations
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logBusinessEvent, incrementMetric } from './pack90-logging';

// ============================================================================
// ANALYTICS EVENT TYPES
// ============================================================================

export type SecurityEventType =
  | 'RATE_LIMIT_HIT'
  | 'SPAM_SUSPECT_DETECTED'
  | 'LAUNCH_GATE_CHANGED'
  | 'DISPOSABLE_EMAIL_BLOCKED'
  | 'REGISTRATION_ABUSE_DETECTED'
  | 'MESSAGE_SPAM_DETECTED'
  | 'BOT_PATTERN_DETECTED'
  | 'SECURITY_VIOLATION';

export interface SecurityAnalyticsEvent {
  eventId: string;
  eventType: SecurityEventType;
  userId?: string;
  ipHash?: string;
  metadata: Record<string, any>;
  createdAt: Timestamp;
}

// ============================================================================
// LOG SECURITY EVENTS
// ============================================================================

/**
 * Log security analytics event
 */
export async function logSecurityEvent(params: {
  eventType: SecurityEventType;
  userId?: string;
  ipHash?: string;
  metadata?: Record<string, any>;
}): Promise<string> {
  try {
    const eventId = generateId();

    const event: SecurityAnalyticsEvent = {
      eventId,
      eventType: params.eventType,
      userId: params.userId,
      ipHash: params.ipHash,
      metadata: params.metadata || {},
      createdAt: Timestamp.now(),
    };

    await db.collection('pack317_security_events').doc(eventId).set(event);

    // Also log to business audit for important events
    if (['LAUNCH_GATE_CHANGED', 'SECURITY_VIOLATION'].includes(params.eventType)) {
      await logBusinessEvent({
        eventType: 'ENFORCEMENT_CHANGED',
        metadata: {
          securityEventType: params.eventType,
          ...params.metadata,
        },
        source: 'SYSTEM',
        functionName: 'logSecurityEvent',
      });
    }

    // Increment daily metrics
    await incrementSecurityMetric(params.eventType);

    return eventId;
  } catch (error) {
    console.error('[Pack317] Failed to log security event:', error);
    return '';
  }
}

/**
 * Increment security metric counter
 */
async function incrementSecurityMetric(eventType: SecurityEventType): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const metricKey = `SECURITY_${eventType}`;
    const docId = `${metricKey}_${today}`;

    await db.collection('metrics_daily').doc(docId).set({
      id: docId,
      date: today,
      metricKey,
      value: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('[Pack317] Failed to increment security metric:', error);
  }
}

// ============================================================================
// QUERY SECURITY EVENTS
// ============================================================================

export interface QuerySecurityEventsParams {
  eventType?: SecurityEventType;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface QuerySecurityEventsResult {
  events: SecurityAnalyticsEvent[];
  total: number;
}

/**
 * Query security events (admin only)
 */
export async function querySecurityEvents(
  params: QuerySecurityEventsParams
): Promise<QuerySecurityEventsResult> {
  try {
    let query: any = db.collection('pack317_security_events');

    if (params.eventType) {
      query = query.where('eventType', '==', params.eventType);
    }

    if (params.userId) {
      query = query.where('userId', '==', params.userId);
    }

    if (params.startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(params.startDate));
    }

    if (params.endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(params.endDate));
    }

    query = query.orderBy('createdAt', 'desc').limit(params.limit || 100);

    const snapshot = await query.get();

    return {
      events: snapshot.docs.map(doc => doc.data() as SecurityAnalyticsEvent),
      total: snapshot.size,
    };
  } catch (error) {
    console.error('[Pack317] Failed to query security events:', error);
    return { events: [], total: 0 };
  }
}

// ============================================================================
// SECURITY DASHBOARD STATS
// ============================================================================

export interface SecurityDashboardStats {
  today: {
    rateLimitHits: number;
    spamDetections: number;
    registrationBlocks: number;
    securityViolations: number;
  };
  last7Days: {
    rateLimitHits: number;
    spamDetections: number;
    registrationBlocks: number;
  };
}

/**
 * Get security dashboard statistics
 */
export async function getSecurityDashboardStats(): Promise<SecurityDashboardStats> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get today's stats
    const todayStats = await Promise.all([
      getMetricValue('SECURITY_RATE_LIMIT_HIT', today),
      getMetricValue('SECURITY_SPAM_SUSPECT_DETECTED', today),
      getMetricValue('SECURITY_REGISTRATION_ABUSE_DETECTED', today),
      getMetricValue('SECURITY_SECURITY_VIOLATION', today),
    ]);

    // Get 7-day stats
    const last7DaysSnapshot = await db
      .collection('pack317_security_events')
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();

    const eventCounts = {
      rateLimitHits: 0,
      spamDetections: 0,
      registrationBlocks: 0,
    };

    last7DaysSnapshot.docs.forEach(doc => {
      const event = doc.data();
      if (event.eventType === 'RATE_LIMIT_HIT') eventCounts.rateLimitHits++;
      if (event.eventType === 'SPAM_SUSPECT_DETECTED') eventCounts.spamDetections++;
      if (event.eventType === 'REGISTRATION_ABUSE_DETECTED') eventCounts.registrationBlocks++;
    });

    return {
      today: {
        rateLimitHits: todayStats[0],
        spamDetections: todayStats[1],
        registrationBlocks: todayStats[2],
        securityViolations: todayStats[3],
      },
      last7Days: eventCounts,
    };
  } catch (error) {
    console.error('[Pack317] Failed to get security stats:', error);
    return {
      today: { rateLimitHits: 0, spamDetections: 0, registrationBlocks: 0, securityViolations: 0 },
      last7Days: { rateLimitHits: 0, spamDetections: 0, registrationBlocks: 0 },
    };
  }
}

async function getMetricValue(metricKey: string, date: string): Promise<number> {
  try {
    const docId = `${metricKey}_${date}`;
    const doc = await db.collection('metrics_daily').doc(docId).get();
    return doc.exists ? (doc.data()?.value || 0) : 0;
  } catch (error) {
    return 0;
  }
}