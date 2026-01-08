/**
 * PACK 90 — System Audit, Event Logging & Technical Observability
 * 
 * Central audit & event logging layer for production monitoring and compliance.
 * This module provides:
 * - Business audit log (high-value events tied to users & money)
 * - Technical event log (function calls, errors, performance)
 * - Metrics aggregation (pre-aggregated counters for dashboards)
 * 
 * COMPLIANCE RULES:
 * - Audit and logs are read-only historical records
 * - They must never mutate financial data
 * - No free tokens, no discounts, no promo codes
 * - Token price and revenue split remain unchanged
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type BusinessEventType =
  // Payment & Earnings Events
  | 'PAYMENT_COMPLETED'
  | 'EARNINGS_CREDITED'
  | 'TOKEN_PURCHASE'
  | 'GIFT_SENT'
  | 'PREMIUM_STORY_PURCHASED'
  | 'PAID_MEDIA_PURCHASED'
  | 'CHAT_DEPOSIT'
  | 'CALL_BILLING'
  
  // Payout Events
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_STATUS_CHANGED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_FAILED'
  | 'PAYOUT_COMPLETED'
  
  // KYC Events
  | 'KYC_SUBMITTED'
  | 'KYC_STATUS_CHANGED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_BLOCKED'
  
  // Dispute Events
  | 'DISPUTE_CREATED'
  | 'DISPUTE_STATUS_CHANGED'
  | 'DISPUTE_RESOLVED'
  | 'DISPUTE_MESSAGE_ADDED'
  
  // Enforcement Events
  | 'ENFORCEMENT_CHANGED'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'FEATURE_LOCKED'
  | 'FEATURE_UNLOCKED'
  
  // Moderator Actions
  | 'MODERATOR_ACTION'
  | 'CASE_ASSIGNED'
  | 'CASE_RESOLVED'
  | 'MANUAL_REVIEW_COMPLETED';

export type TechEventLevel = 'INFO' | 'WARN' | 'ERROR';
export type TechEventCategory = 'FUNCTION' | 'JOB' | 'SERVICE' | 'SECURITY';
export type EventSource = 'BACKEND_FUNCTION' | 'ADMIN_PANEL' | 'SYSTEM';

export interface BusinessAuditLog {
  id: string;
  eventType: BusinessEventType;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  relatedId?: string | null;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  source: EventSource;
  functionName?: string | null;
  ipCountry?: string | null;
}

export interface TechEventLog {
  id: string;
  level: TechEventLevel;
  category: TechEventCategory;
  functionName: string;
  message: string;
  context?: Record<string, any>;
  createdAt: Timestamp;
}

export interface DailyMetric {
  id: string;
  date: string; // YYYY-MM-DD
  metricKey: string;
  value: number;
  updatedAt: Timestamp;
}

// ============================================================================
// BUSINESS AUDIT LOGGING
// ============================================================================

export interface LogBusinessEventParams {
  eventType: BusinessEventType;
  actorUserId?: string;
  subjectUserId?: string;
  relatedId?: string;
  metadata?: Record<string, any>;
  source?: EventSource;
  functionName?: string;
  ipCountry?: string;
}

/**
 * Log a business event (user & money related events)
 * These logs are immutable and kept for compliance
 */
export async function logBusinessEvent(params: LogBusinessEventParams): Promise<string> {
  try {
    const eventId = generateId();
    
    const event: BusinessAuditLog = {
      id: eventId,
      eventType: params.eventType,
      actorUserId: params.actorUserId || null,
      subjectUserId: params.subjectUserId || null,
      relatedId: params.relatedId || null,
      metadata: sanitizeMetadata(params.metadata || {}),
      createdAt: Timestamp.now(),
      source: params.source || 'BACKEND_FUNCTION',
      functionName: params.functionName || null,
      ipCountry: params.ipCountry || null,
    };
    
    await db.collection('business_audit_log').doc(eventId).set(event);
    
    console.log(`[BusinessAudit] ${params.eventType} - actor:${params.actorUserId} subject:${params.subjectUserId}`);
    
    return eventId;
  } catch (error) {
    console.error('[BusinessAudit] Failed to log event:', error);
    // Non-blocking - don't fail the operation if logging fails
    return '';
  }
}

/**
 * Sanitize metadata to remove sensitive information
 */
function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'card', 'cvv', 'ssn'];
  
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = JSON.stringify(value).substring(0, 500); // Limit object size
    } else if (typeof value === 'string') {
      sanitized[key] = value.substring(0, 500); // Limit string length
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// ============================================================================
// TECHNICAL EVENT LOGGING
// ============================================================================

export interface LogTechEventParams {
  level: TechEventLevel;
  category: TechEventCategory;
  functionName: string;
  message: string;
  context?: Record<string, any>;
}

/**
 * Log a technical event (system health, errors, debugging)
 * Lower retention than business logs (30-90 days typical)
 */
export async function logTechEvent(params: LogTechEventParams): Promise<string> {
  try {
    const eventId = generateId();
    
    const event: TechEventLog = {
      id: eventId,
      level: params.level,
      category: params.category,
      functionName: params.functionName,
      message: params.message.substring(0, 500),
      context: params.context ? sanitizeMetadata(params.context) : undefined,
      createdAt: Timestamp.now(),
    };
    
    await db.collection('tech_event_log').doc(eventId).set(event);
    
    if (params.level === 'ERROR') {
      console.error(`[TechEvent] ERROR in ${params.functionName}: ${params.message}`);
    }
    
    return eventId;
  } catch (error) {
    console.error('[TechEvent] Failed to log event:', error);
    // Fallback to console
    console.log(`[TechEvent] ${params.level} - ${params.functionName}: ${params.message}`);
    return '';
  }
}

// ============================================================================
// METRICS AGGREGATION
// ============================================================================

export type MetricKey =
  | 'TOTAL_PAYMENTS'
  | 'TOTAL_EARNINGS_EVENTS'
  | 'GIFTS_SENT'
  | 'PREMIUM_STORIES_SOLD'
  | 'PAYOUT_REQUESTS'
  | 'PAYOUTS_COMPLETED'
  | 'KYC_SUBMISSIONS'
  | 'KYC_APPROVALS'
  | 'KYC_REJECTIONS'
  | 'DISPUTES_CREATED'
  | 'DISPUTES_RESOLVED'
  | 'ENFORCEMENT_CHANGES'
  | 'MODERATOR_ACTIONS'
  | 'NEW_USERS';

/**
 * Increment a daily metric counter
 * Date defaults to today if not specified
 */
export async function incrementMetric(
  metricKey: MetricKey,
  date?: string,
  amount: number = 1
): Promise<void> {
  try {
    const dateStr = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const docId = `${metricKey}_${dateStr}`;
    
    const metricRef = db.collection('metrics_daily').doc(docId);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(metricRef);
      
      if (doc.exists) {
        transaction.update(metricRef, {
          value: increment(amount),
          updatedAt: serverTimestamp(),
        });
      } else {
        const newMetric: DailyMetric = {
          id: docId,
          date: dateStr,
          metricKey,
          value: amount,
          updatedAt: Timestamp.now(),
        };
        transaction.set(metricRef, newMetric);
      }
    });
  } catch (error) {
    console.error(`[Metrics] Failed to increment ${metricKey}:`, error);
    // Non-blocking
  }
}

/**
 * Get metric value for a specific date
 */
export async function getMetricValue(metricKey: MetricKey, date: string): Promise<number> {
  try {
    const docId = `${metricKey}_${date}`;
    const doc = await db.collection('metrics_daily').doc(docId).get();
    
    if (doc.exists) {
      const data = doc.data() as DailyMetric;
      return data.value;
    }
    
    return 0;
  } catch (error) {
    console.error(`[Metrics] Failed to get metric ${metricKey}:`, error);
    return 0;
  }
}

/**
 * Get metrics for a date range
 */
export async function getMetricsRange(
  metricKey: MetricKey,
  startDate: string,
  endDate: string
): Promise<DailyMetric[]> {
  try {
    const snapshot = await db.collection('metrics_daily')
      .where('metricKey', '==', metricKey)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as DailyMetric);
  } catch (error) {
    console.error(`[Metrics] Failed to get metrics range:`, error);
    return [];
  }
}

// ============================================================================
// QUERY HELPERS FOR BUSINESS AUDIT LOG
// ============================================================================

export interface QueryBusinessEventsParams {
  eventType?: BusinessEventType;
  actorUserId?: string;
  subjectUserId?: string;
  relatedId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  cursor?: string;
}

export interface QueryBusinessEventsResult {
  events: BusinessAuditLog[];
  nextCursor?: string;
  total?: number;
}

/**
 * Query business audit logs with filters
 */
export async function queryBusinessEvents(
  params: QueryBusinessEventsParams
): Promise<QueryBusinessEventsResult> {
  try {
    let query: any = db.collection('business_audit_log');
    
    // Apply filters
    if (params.eventType) {
      query = query.where('eventType', '==', params.eventType);
    }
    if (params.actorUserId) {
      query = query.where('actorUserId', '==', params.actorUserId);
    }
    if (params.subjectUserId) {
      query = query.where('subjectUserId', '==', params.subjectUserId);
    }
    if (params.relatedId) {
      query = query.where('relatedId', '==', params.relatedId);
    }
    if (params.startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(params.startDate));
    }
    if (params.endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(params.endDate));
    }
    
    // Order by timestamp descending
    query = query.orderBy('createdAt', 'desc');
    
    // Apply limit
    const limit = params.limit || 50;
    query = query.limit(limit + 1);
    
    // Apply cursor
    if (params.cursor) {
      const cursorDoc = await db.collection('business_audit_log').doc(params.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    const events: BusinessAuditLog[] = [];
    let nextCursor: string | undefined;
    
    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i < limit) {
        events.push(snapshot.docs[i].data() as BusinessAuditLog);
      } else {
        nextCursor = snapshot.docs[i].id;
      }
    }
    
    return { events, nextCursor };
  } catch (error) {
    console.error('[BusinessAudit] Query failed:', error);
    return { events: [] };
  }
}

// ============================================================================
// QUERY HELPERS FOR TECHNICAL EVENT LOG
// ============================================================================

export interface QueryTechEventsParams {
  level?: TechEventLevel;
  category?: TechEventCategory;
  functionName?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  cursor?: string;
}

export interface QueryTechEventsResult {
  events: TechEventLog[];
  nextCursor?: string;
}

/**
 * Query technical event logs with filters
 */
export async function queryTechEvents(
  params: QueryTechEventsParams
): Promise<QueryTechEventsResult> {
  try {
    let query: any = db.collection('tech_event_log');
    
    // Apply filters
    if (params.level) {
      query = query.where('level', '==', params.level);
    }
    if (params.category) {
      query = query.where('category', '==', params.category);
    }
    if (params.functionName) {
      query = query.where('functionName', '==', params.functionName);
    }
    if (params.startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(params.startDate));
    }
    if (params.endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(params.endDate));
    }
    
    // Order by timestamp descending
    query = query.orderBy('createdAt', 'desc');
    
    // Apply limit
    const limit = params.limit || 50;
    query = query.limit(limit + 1);
    
    // Apply cursor
    if (params.cursor) {
      const cursorDoc = await db.collection('tech_event_log').doc(params.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    const events: TechEventLog[] = [];
    let nextCursor: string | undefined;
    
    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i < limit) {
        events.push(snapshot.docs[i].data() as TechEventLog);
      } else {
        nextCursor = snapshot.docs[i].id;
      }
    }
    
    return { events, nextCursor };
  } catch (error) {
    console.error('[TechEvent] Query failed:', error);
    return { events: [] };
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS FOR COMMON EVENTS
// ============================================================================

/**
 * Log a payment completion (token charge + earnings credit)
 */
export async function logPaymentEvent(
  payerId: string,
  earnerId: string,
  amountTokens: number,
  context: string,
  relatedId?: string
): Promise<void> {
  // Log payment completion
  await logBusinessEvent({
    eventType: 'PAYMENT_COMPLETED',
    actorUserId: payerId,
    subjectUserId: earnerId,
    relatedId,
    metadata: {
      tokens: amountTokens,
      context,
    },
    functionName: 'logPaymentEvent',
  });
  
  // Log earnings credited
  await logBusinessEvent({
    eventType: 'EARNINGS_CREDITED',
    actorUserId: payerId,
    subjectUserId: earnerId,
    relatedId,
    metadata: {
      tokens: amountTokens,
      context,
    },
    functionName: 'logPaymentEvent',
  });
  
  // Increment metrics
  await incrementMetric('TOTAL_PAYMENTS');
  await incrementMetric('TOTAL_EARNINGS_EVENTS');
}

/**
 * Log a payout lifecycle event
 */
export async function logPayoutEvent(
  eventType: 'PAYOUT_REQUESTED' | 'PAYOUT_STATUS_CHANGED' | 'PAYOUT_COMPLETED' | 'PAYOUT_FAILED',
  userId: string,
  payoutRequestId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logBusinessEvent({
    eventType,
    subjectUserId: userId,
    relatedId: payoutRequestId,
    metadata: metadata || {},
    functionName: 'logPayoutEvent',
  });
  
  if (eventType === 'PAYOUT_REQUESTED') {
    await incrementMetric('PAYOUT_REQUESTS');
  } else if (eventType === 'PAYOUT_COMPLETED') {
    await incrementMetric('PAYOUTS_COMPLETED');
  }
}

/**
 * Log a KYC lifecycle event
 */
export async function logKycEvent(
  eventType: 'KYC_SUBMITTED' | 'KYC_STATUS_CHANGED' | 'KYC_APPROVED' | 'KYC_REJECTED' | 'KYC_BLOCKED',
  userId: string,
  documentId: string,
  reviewerId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logBusinessEvent({
    eventType,
    actorUserId: reviewerId,
    subjectUserId: userId,
    relatedId: documentId,
    metadata: metadata || {},
    functionName: 'logKycEvent',
    source: reviewerId ? 'ADMIN_PANEL' : 'BACKEND_FUNCTION',
  });
  
  if (eventType === 'KYC_SUBMITTED') {
    await incrementMetric('KYC_SUBMISSIONS');
  } else if (eventType === 'KYC_APPROVED') {
    await incrementMetric('KYC_APPROVALS');
  } else if (eventType === 'KYC_REJECTED') {
    await incrementMetric('KYC_REJECTIONS');
  }
}

/**
 * Log a dispute lifecycle event
 */
export async function logDisputeEvent(
  eventType: 'DISPUTE_CREATED' | 'DISPUTE_STATUS_CHANGED' | 'DISPUTE_RESOLVED',
  userId: string,
  disputeId: string,
  reviewerId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logBusinessEvent({
    eventType,
    actorUserId: reviewerId || userId,
    subjectUserId: userId,
    relatedId: disputeId,
    metadata: metadata || {},
    functionName: 'logDisputeEvent',
    source: reviewerId ? 'ADMIN_PANEL' : 'BACKEND_FUNCTION',
  });
  
  if (eventType === 'DISPUTE_CREATED') {
    await incrementMetric('DISPUTES_CREATED');
  } else if (eventType === 'DISPUTE_RESOLVED') {
    await incrementMetric('DISPUTES_RESOLVED');
  }
}

/**
 * Log an enforcement state change
 */
export async function logEnforcementEvent(
  userId: string,
  accountStatus: string,
  reviewerId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logBusinessEvent({
    eventType: 'ENFORCEMENT_CHANGED',
    actorUserId: reviewerId,
    subjectUserId: userId,
    metadata: {
      accountStatus,
      ...metadata,
    },
    functionName: 'logEnforcementEvent',
    source: reviewerId ? 'ADMIN_PANEL' : 'SYSTEM',
  });
  
  await incrementMetric('ENFORCEMENT_CHANGES');
}

/**
 * Log a moderator action
 */
export async function logModeratorAction(
  moderatorId: string,
  action: string,
  targetUserId: string,
  caseId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logBusinessEvent({
    eventType: 'MODERATOR_ACTION',
    actorUserId: moderatorId,
    subjectUserId: targetUserId,
    relatedId: caseId,
    metadata: {
      action,
      ...metadata,
    },
    functionName: 'logModeratorAction',
    source: 'ADMIN_PANEL',
  });
  
  await incrementMetric('MODERATOR_ACTIONS');
}