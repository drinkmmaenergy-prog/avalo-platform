/**
 * PACK 110 — Admin Endpoints for Feedback Management
 * 
 * Admin-only functions for viewing and exporting feedback data.
 * 
 * CRITICAL CONSTRAINTS:
 * - Admin access only (ADMIN or PRODUCT_MANAGER roles)
 * - Read-only analytics - no impact on user monetization
 * - Export functionality for compliance and analysis
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  GetFeedbackInsightsRequest,
  GetFeedbackInsightsResponse,
  GetRecentFeedbackRequest,
  GetRecentFeedbackResponse,
  ExportFeedbackRequest,
  ExportFeedbackResponse,
  ProductFeedbackInsights,
  UserFeedbackEvent,
} from './pack110-types';
import { storage } from './init';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify admin has required role for feedback analytics
 */
async function verifyAdminRole(authUid: string): Promise<void> {
  const adminDoc = await db.collection('admins').doc(authUid).get();
  
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  
  const adminData = adminDoc.data();
  const roles = adminData?.roles || [];
  
  if (!roles.includes('PRODUCT_MANAGER') && !roles.includes('ADMIN')) {
    throw new HttpsError(
      'permission-denied',
      'PRODUCT_MANAGER or ADMIN role required'
    );
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid date format');
  }
  return date;
}

// ============================================================================
// ADMIN FEEDBACK INSIGHTS
// ============================================================================

/**
 * Get aggregated feedback insights
 */
export const admin_getFeedbackInsights = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetFeedbackInsightsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as GetFeedbackInsightsRequest;
    
    try {
      // Determine what insights to fetch
      let insightsQuery = db.collection('product_feedback_insights');
      
      if (data.featureKey) {
        // Fetch specific feature insights
        const insightDoc = await insightsQuery.doc(data.featureKey).get();
        
        if (!insightDoc.exists) {
          return {
            success: false,
            error: 'No insights found for this feature',
          };
        }
        
        return {
          success: true,
          insights: insightDoc.data() as ProductFeedbackInsights,
        };
      } else {
        // Fetch overall NPS insights
        const insightDoc = await insightsQuery.doc('overall').get();
        
        if (!insightDoc.exists) {
          return {
            success: false,
            error: 'No insights available yet',
          };
        }
        
        return {
          success: true,
          insights: insightDoc.data() as ProductFeedbackInsights,
        };
      }
    } catch (error: any) {
      logger.error('Error getting feedback insights', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get recent feedback events
 */
export const admin_getRecentFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetRecentFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as GetRecentFeedbackRequest;
    const limit = Math.min(data.limit || 50, 500);
    
    try {
      let query = db
        .collection('user_feedback_events')
        .orderBy('createdAt', 'desc')
        .limit(limit + 1);
      
      // Apply filters
      if (data.eventType) {
        query = query.where('eventType', '==', data.eventType) as any;
      }
      
      if (data.featureKey) {
        query = query.where('featureKey', '==', data.featureKey) as any;
      }
      
      const eventsSnapshot = await query.get();
      
      const events: UserFeedbackEvent[] = [];
      const hasMore = eventsSnapshot.size > limit;
      
      eventsSnapshot.docs.slice(0, limit).forEach(doc => {
        events.push(doc.data() as UserFeedbackEvent);
      });
      
      return {
        success: true,
        events,
        hasMore,
      };
    } catch (error: any) {
      logger.error('Error getting recent feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Export feedback data as CSV
 */
export const admin_exportFeedback = onCall(
  { region: 'europe-west3', timeoutSeconds: 540 },
  async (request): Promise<ExportFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as ExportFeedbackRequest;
    
    if (!data.fromDate || !data.toDate) {
      throw new HttpsError('invalid-argument', 'fromDate and toDate required');
    }
    
    try {
      const startDate = parseDate(data.fromDate);
      const endDate = parseDate(data.toDate);
      
      // Build query
      let query = db
        .collection('user_feedback_events')
        .where('createdAt', '>=', Timestamp.fromDate(startDate))
        .where('createdAt', '<=', Timestamp.fromDate(endDate))
        .orderBy('createdAt', 'desc');
      
      if (data.eventType) {
        query = query.where('eventType', '==', data.eventType) as any;
      }
      
      if (data.featureKey) {
        query = query.where('featureKey', '==', data.featureKey) as any;
      }
      
      const eventsSnapshot = await query.get();
      
      if (eventsSnapshot.empty) {
        return {
          success: false,
          error: 'No feedback found in the specified date range',
        };
      }
      
      // Build CSV
      const headers = [
        'Event ID',
        'User ID',
        'Event Type',
        'Score',
        'Feature Key',
        'Feedback Text',
        'Language',
        'App Version',
        'Region',
        'Platform',
        'Created At',
      ];
      
      const rows: string[][] = [headers];
      
      eventsSnapshot.forEach(doc => {
        const event = doc.data() as UserFeedbackEvent;
        const createdAt = (event.createdAt as Timestamp).toDate().toISOString();
        
        rows.push([
          event.id,
          event.userId || 'anonymous',
          event.eventType,
          event.score?.toString() || '',
          event.featureKey || '',
          (event.text || '').replace(/"/g, '""'), // Escape quotes for CSV
          event.language,
          event.appVersion,
          event.region || '',
          event.platform || '',
          createdAt,
        ]);
      });
      
      // Convert to CSV string
      const csvContent = rows
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
      
      // Upload to Cloud Storage
      const bucket = storage.bucket();
      const filename = `feedback-export-${data.fromDate}-to-${data.toDate}-${Date.now()}.csv`;
      const file = bucket.file(`exports/feedback/${filename}`);
      
      await file.save(csvContent, {
        contentType: 'text/csv',
        metadata: {
          exportedBy: request.auth.uid,
          exportedAt: new Date().toISOString(),
        },
      });
      
      // Generate signed URL (valid for 7 days)
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      
      logger.info(`Feedback exported: ${eventsSnapshot.size} records by admin ${request.auth.uid}`);
      
      return {
        success: true,
        downloadUrl,
        recordCount: eventsSnapshot.size,
      };
    } catch (error: any) {
      logger.error('Error exporting feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get feedback statistics summary
 */
export const admin_getFeedbackStats = onCall(
  { region: 'europe-west3' },
  async (request): Promise<any> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    try {
      // Get counts by event type
      const [npsCount, featureCount, freeFormCount] = await Promise.all([
        db.collection('user_feedback_events').where('eventType', '==', 'NPS').count().get(),
        db.collection('user_feedback_events').where('eventType', '==', 'FEATURE').count().get(),
        db.collection('user_feedback_events').where('eventType', '==', 'FREE_FORM').count().get(),
      ]);
      
      // Get recent insights
      const insightsSnapshot = await db
        .collection('product_feedback_insights')
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get();
      
      const recentInsights = insightsSnapshot.docs.map(doc => ({
        featureKey: doc.id,
        ...doc.data(),
      }));
      
      return {
        success: true,
        stats: {
          totalFeedback: npsCount.data().count + featureCount.data().count + freeFormCount.data().count,
          byType: {
            nps: npsCount.data().count,
            feature: featureCount.data().count,
            freeForm: freeFormCount.data().count,
          },
          recentInsights,
        },
      };
    } catch (error: any) {
      logger.error('Error getting feedback stats', error);
      throw new HttpsError('internal', error.message);
    }
  }
);