/**
 * PACK 90 — Admin Endpoints for Audit Logs & Metrics
 * 
 * Secure endpoints for admin dashboard to query:
 * - Business audit logs
 * - Technical event logs
 * - Daily metrics
 * 
 * Security: All endpoints require admin role verification
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  queryBusinessEvents,
  queryTechEvents,
  getMetricValue,
  getMetricsRange,
  BusinessEventType,
  TechEventLevel,
  TechEventCategory,
  MetricKey,
  QueryBusinessEventsParams,
  QueryTechEventsParams,
} from './pack90-logging';

// ============================================================================
// ADMIN ROLE CHECK
// ============================================================================

/**
 * Verify the caller has admin role
 * In production, this should check against admin_roles collection or custom claims
 */
async function verifyAdminRole(context: functions.https.CallableContext): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }
  
  const uid = context.auth.uid;
  
  // Check if user has admin role
  const adminDoc = await db.collection('admin_roles').doc(uid).get();
  
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }
  
  const adminData = adminDoc.data();
  if (!adminData?.active) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin account is not active'
    );
  }
}

// ============================================================================
// ADMIN ENDPOINT: GET DAILY METRICS
// ============================================================================

export interface GetDailyMetricsRequest {
  dateRange: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
  metricKeys?: MetricKey[];
}

export interface GetDailyMetricsResponse {
  metrics: Array<{
    date: string;
    metricKey: MetricKey;
    value: number;
  }>;
}

/**
 * Get daily metrics for a date range
 */
export const admin_getDailyMetrics = functions.https.onCall(
  async (data: GetDailyMetricsRequest, context): Promise<GetDailyMetricsResponse> => {
    try {
      // Verify admin role
      await verifyAdminRole(context);
      
      const { dateRange, metricKeys } = data;
      
      if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'dateRange with startDate and endDate is required'
        );
      }
      
      // If specific metrics requested, get those
      if (metricKeys && metricKeys.length > 0) {
        const results = [];
        
        for (const metricKey of metricKeys) {
          const metricData = await getMetricsRange(
            metricKey,
            dateRange.startDate,
            dateRange.endDate
          );
          
          for (const metric of metricData) {
            results.push({
              date: metric.date,
              metricKey: metric.metricKey as MetricKey,
              value: metric.value,
            });
          }
        }
        
        return { metrics: results };
      }
      
      // Otherwise, get all metrics for the date range
      const snapshot = await db.collection('metrics_daily')
        .where('date', '>=', dateRange.startDate)
        .where('date', '<=', dateRange.endDate)
        .orderBy('date', 'asc')
        .get();
      
      const metrics = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          date: data.date,
          metricKey: data.metricKey as MetricKey,
          value: data.value,
        };
      });
      
      return { metrics };
    } catch (error: any) {
      console.error('[Admin] Error getting daily metrics:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get daily metrics',
        { error: error.message }
      );
    }
  }
);

// ============================================================================
// ADMIN ENDPOINT: LIST BUSINESS EVENTS
// ============================================================================

export interface ListBusinessEventsRequest {
  filters?: {
    eventType?: BusinessEventType;
    actorUserId?: string;
    subjectUserId?: string;
    relatedId?: string;
    startDate?: string; // ISO date string
    endDate?: string;   // ISO date string
  };
  pagination?: {
    limit?: number;
    cursor?: string;
  };
}

export interface ListBusinessEventsResponse {
  events: Array<{
    id: string;
    eventType: BusinessEventType;
    actorUserId?: string | null;
    subjectUserId?: string | null;
    relatedId?: string | null;
    metadata: Record<string, any>;
    createdAt: string; // ISO string
    source: string;
    functionName?: string | null;
    ipCountry?: string | null;
  }>;
  nextCursor?: string;
}

/**
 * List business audit events with filters
 */
export const admin_listBusinessEvents = functions.https.onCall(
  async (data: ListBusinessEventsRequest, context): Promise<ListBusinessEventsResponse> => {
    try {
      // Verify admin role
      await verifyAdminRole(context);
      
      const filters = data.filters || {};
      const pagination = data.pagination || {};
      
      const queryParams: QueryBusinessEventsParams = {
        eventType: filters.eventType,
        actorUserId: filters.actorUserId,
        subjectUserId: filters.subjectUserId,
        relatedId: filters.relatedId,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        limit: pagination.limit || 50,
        cursor: pagination.cursor,
      };
      
      const result = await queryBusinessEvents(queryParams);
      
      const events = result.events.map(event => ({
        id: event.id,
        eventType: event.eventType,
        actorUserId: event.actorUserId,
        subjectUserId: event.subjectUserId,
        relatedId: event.relatedId,
        metadata: event.metadata,
        createdAt: event.createdAt.toDate().toISOString(),
        source: event.source,
        functionName: event.functionName,
        ipCountry: event.ipCountry,
      }));
      
      return {
        events,
        nextCursor: result.nextCursor,
      };
    } catch (error: any) {
      console.error('[Admin] Error listing business events:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to list business events',
        { error: error.message }
      );
    }
  }
);

// ============================================================================
// ADMIN ENDPOINT: LIST TECHNICAL EVENTS
// ============================================================================

export interface ListTechEventsRequest {
  filters?: {
    level?: TechEventLevel;
    category?: TechEventCategory;
    functionName?: string;
    startDate?: string; // ISO date string
    endDate?: string;   // ISO date string
  };
  pagination?: {
    limit?: number;
    cursor?: string;
  };
}

export interface ListTechEventsResponse {
  events: Array<{
    id: string;
    level: TechEventLevel;
    category: TechEventCategory;
    functionName: string;
    message: string;
    context?: Record<string, any>;
    createdAt: string; // ISO string
  }>;
  nextCursor?: string;
}

/**
 * List technical event logs with filters
 */
export const admin_listTechEvents = functions.https.onCall(
  async (data: ListTechEventsRequest, context): Promise<ListTechEventsResponse> => {
    try {
      // Verify admin role
      await verifyAdminRole(context);
      
      const filters = data.filters || {};
      const pagination = data.pagination || {};
      
      const queryParams: QueryTechEventsParams = {
        level: filters.level,
        category: filters.category,
        functionName: filters.functionName,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        limit: pagination.limit || 50,
        cursor: pagination.cursor,
      };
      
      const result = await queryTechEvents(queryParams);
      
      const events = result.events.map(event => ({
        id: event.id,
        level: event.level,
        category: event.category,
        functionName: event.functionName,
        message: event.message,
        context: event.context,
        createdAt: event.createdAt.toDate().toISOString(),
      }));
      
      return {
        events,
        nextCursor: result.nextCursor,
      };
    } catch (error: any) {
      console.error('[Admin] Error listing tech events:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to list tech events',
        { error: error.message }
      );
    }
  }
);

// ============================================================================
// ADMIN ENDPOINT: GET USER AUDIT TRAIL
// ============================================================================

export interface GetUserAuditTrailRequest {
  userId: string;
  limit?: number;
}

export interface GetUserAuditTrailResponse {
  events: Array<{
    id: string;
    eventType: BusinessEventType;
    role: 'ACTOR' | 'SUBJECT';
    relatedId?: string | null;
    metadata: Record<string, any>;
    createdAt: string;
    source: string;
  }>;
}

/**
 * Get complete audit trail for a specific user
 * Shows both events where user is actor and subject
 */
export const admin_getUserAuditTrail = functions.https.onCall(
  async (data: GetUserAuditTrailRequest, context): Promise<GetUserAuditTrailResponse> => {
    try {
      // Verify admin role
      await verifyAdminRole(context);
      
      const { userId, limit = 100 } = data;
      
      if (!userId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'userId is required'
        );
      }
      
      // Query events where user is actor
      const actorEvents = await queryBusinessEvents({
        actorUserId: userId,
        limit: Math.floor(limit / 2),
      });
      
      // Query events where user is subject
      const subjectEvents = await queryBusinessEvents({
        subjectUserId: userId,
        limit: Math.floor(limit / 2),
      });
      
      // Combine and sort by timestamp
      const allEvents = [
        ...actorEvents.events.map(e => ({ ...e, role: 'ACTOR' as const })),
        ...subjectEvents.events.map(e => ({ ...e, role: 'SUBJECT' as const })),
      ].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      
      const events = allEvents.slice(0, limit).map(event => ({
        id: event.id,
        eventType: event.eventType,
        role: event.role,
        relatedId: event.relatedId,
        metadata: event.metadata,
        createdAt: event.createdAt.toDate().toISOString(),
        source: event.source,
      }));
      
      return { events };
    } catch (error: any) {
      console.error('[Admin] Error getting user audit trail:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get user audit trail',
        { error: error.message }
      );
    }
  }
);

// ============================================================================
// ADMIN ENDPOINT: GET METRICS SUMMARY
// ============================================================================

export interface GetMetricsSummaryRequest {
  date?: string; // YYYY-MM-DD, defaults to today
}

export interface GetMetricsSummaryResponse {
  date: string;
  summary: {
    payments: {
      total: number;
      earnings: number;
    };
    payouts: {
      requests: number;
      completed: number;
    };
    kyc: {
      submissions: number;
      approvals: number;
      rejections: number;
    };
    disputes: {
      created: number;
      resolved: number;
    };
    enforcement: {
      changes: number;
      moderatorActions: number;
    };
    users: {
      newUsers: number;
    };
  };
}

/**
 * Get summary of all key metrics for a specific date
 */
export const admin_getMetricsSummary = functions.https.onCall(
  async (data: GetMetricsSummaryRequest, context): Promise<GetMetricsSummaryResponse> => {
    try {
      // Verify admin role
      await verifyAdminRole(context);
      
      const date = data.date || new Date().toISOString().split('T')[0];
      
      // Fetch all metrics for the date
      const [
        totalPayments,
        totalEarnings,
        payoutRequests,
        payoutsCompleted,
        kycSubmissions,
        kycApprovals,
        kycRejections,
        disputesCreated,
        disputesResolved,
        enforcementChanges,
        moderatorActions,
        newUsers,
      ] = await Promise.all([
        getMetricValue('TOTAL_PAYMENTS', date),
        getMetricValue('TOTAL_EARNINGS_EVENTS', date),
        getMetricValue('PAYOUT_REQUESTS', date),
        getMetricValue('PAYOUTS_COMPLETED', date),
        getMetricValue('KYC_SUBMISSIONS', date),
        getMetricValue('KYC_APPROVALS', date),
        getMetricValue('KYC_REJECTIONS', date),
        getMetricValue('DISPUTES_CREATED', date),
        getMetricValue('DISPUTES_RESOLVED', date),
        getMetricValue('ENFORCEMENT_CHANGES', date),
        getMetricValue('MODERATOR_ACTIONS', date),
        getMetricValue('NEW_USERS', date),
      ]);
      
      return {
        date,
        summary: {
          payments: {
            total: totalPayments,
            earnings: totalEarnings,
          },
          payouts: {
            requests: payoutRequests,
            completed: payoutsCompleted,
          },
          kyc: {
            submissions: kycSubmissions,
            approvals: kycApprovals,
            rejections: kycRejections,
          },
          disputes: {
            created: disputesCreated,
            resolved: disputesResolved,
          },
          enforcement: {
            changes: enforcementChanges,
            moderatorActions: moderatorActions,
          },
          users: {
            newUsers: newUsers,
          },
        },
      };
    } catch (error: any) {
      console.error('[Admin] Error getting metrics summary:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get metrics summary',
        { error: error.message }
      );
    }
  }
);