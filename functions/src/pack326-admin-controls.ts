/**
 * PACK 326 — Admin Controls & Moderation
 * Admin functions for managing campaigns, moderating creatives, and fraud review
 */

import { https } from 'firebase-functions';
import { db } from './init';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  ModerateCreativeRequest,
  ModerateCreativeResponse,
  PauseCampaignRequest,
  PauseCampaignResponse,
  AdsCreative,
  AdsCampaign,
  FraudAlert,
} from './types/pack326-ads.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return false;
  }
  
  const userData = userDoc.data();
  return userData?.role === 'ADMIN' || userData?.isAdmin === true;
}

/**
 * Validate admin access
 */
async function validateAdminAccess(userId: string): Promise<void> {
  const admin = await isAdmin(userId);
  
  if (!admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}

// ============================================================================
// CREATIVE MODERATION
// ============================================================================

/**
 * Approve or reject an ad creative
 */
export const pack326_moderateCreative = https.onCall(
  async (request): Promise<ModerateCreativeResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const {
        creativeId,
        action,
        rejectionReason,
      } = data as ModerateCreativeRequest;
      
      if (!creativeId || !action) {
        throw new HttpsError('invalid-argument', 'Creative ID and action required');
      }
      
      if (!['APPROVE', 'REJECT'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be APPROVE or REJECT');
      }
      
      // Get creative
      const creativeDoc = await db.collection('adsCreatives').doc(creativeId).get();
      
      if (!creativeDoc.exists) {
        throw new HttpsError('not-found', 'Creative not found');
      }
      
      const creative = creativeDoc.data() as AdsCreative;
      
      if (creative.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', 'Creative is not pending moderation');
      }
      
      // Update creative status
      const updateData: Partial<AdsCreative> = {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      };
      
      if (action === 'REJECT' && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }
      
      await db.collection('adsCreatives').doc(creativeId).update(updateData);
      
      // Log moderation action
      await db.collection('adsModerationLog').add({
        creativeId,
        campaignId: creative.campaignId,
        action,
        rejectionReason: rejectionReason || null,
        moderatorUserId: auth.uid,
        moderatedAt: new Date().toISOString(),
      });
      
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Moderate creative error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || 'Failed to moderate creative',
      };
    }
  }
);

/**
 * Get pending creatives for moderation
 */
export const pack326_getPendingCreatives = https.onCall(
  async (request) => {
    const { auth,data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { limit = 20 } = data || {};
      
      const snapshot = await db
        .collection('adsCreatives')
        .where('status', '==', 'PENDING')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();
      
      const creatives = snapshot.docs.map(doc => doc.data() as AdsCreative);
      
      // Enrich with campaign info
      const enrichedCreatives = await Promise.all(
        creatives.map(async (creative) => {
          const campaignDoc = await db.collection('adsCampaigns').doc(creative.campaignId).get();
          const campaign = campaignDoc.data() as AdsCampaign;
          
          return {
            ...creative,
            campaignName: campaign?.name,
            advertiserUserId: campaign?.advertiserUserId,
          };
        })
      );
      
      return {
        success: true,
        creatives: enrichedCreatives,
      };
    } catch (error: any) {
      console.error('Get pending creatives error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get pending creatives');
    }
  }
);

// ============================================================================
// CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * Admin pause/resume campaign
 */
export const pack326_adminPauseCampaign = https.onCall(
  async (request): Promise<PauseCampaignResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { campaignId, reason } = data as PauseCampaignRequest;
      
      if (!campaignId || !reason) {
        throw new HttpsError('invalid-argument', 'Campaign ID and reason required');
      }
      
      const campaignDoc = await db.collection('adsCampaigns').doc(campaignId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdsCampaign;
      
      // Toggle pause/resume
      const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      
      await db.collection('adsCampaigns').doc(campaignId).update({
        status: newStatus,
        pauseReason: newStatus === 'PAUSED' ? reason : null,
        updatedAt: new Date().toISOString(),
      });
      
      // Log action
      await db.collection('adsCampaignLog').add({
        campaignId,
        action: newStatus === 'PAUSED' ? 'ADMIN_PAUSED' : 'ADMIN_RESUMED',
        reason,
        adminUserId: auth.uid,
        performedAt: new Date().toISOString(),
      });
      
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Admin pause campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || 'Failed to pause campaign',
      };
    }
  }
);

/**
 * Admin force-end campaign
 */
export const pack326_adminEndCampaign = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { campaignId, reason } = data;
      
      if (!campaignId || !reason) {
        throw new HttpsError('invalid-argument', 'Campaign ID and reason required');
      }
      
      const campaignDoc = await db.collection('adsCampaigns').doc(campaignId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      await db.collection('adsCampaigns').doc(campaignId).update({
        status: 'ENDED',
        endReason: reason,
        updatedAt: new Date().toISOString(),
      });
      
      // Log action
      await db.collection('adsCampaignLog').add({
        campaignId,
        action: 'ADMIN_ENDED',
        reason,
        adminUserId: auth.uid,
        performedAt: new Date().toISOString(),
      });
      
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Admin end campaign error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to end campaign');
    }
  }
);

/**
 * Get all campaigns (admin view)
 */
export const pack326_adminListCampaigns = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { status, limit = 50 } = data || {};
      
      let query = db.collection('adsCampaigns').orderBy('createdAt', 'desc');
      
      if (status) {
        query = query.where('status', '==', status) as any;
      }
      
      const snapshot = await query.limit(limit).get();
      const campaigns = snapshot.docs.map(doc => doc.data() as AdsCampaign);
      
      return {
        success: true,
        campaigns,
      };
    } catch (error: any) {
      console.error('Admin list campaigns error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to list campaigns');
    }
  }
);

// ============================================================================
// FRAUD DETECTION & REVIEW
// ============================================================================

/**
 * Get fraud alerts
 */
export const pack326_getFraudAlerts = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { severity, limit = 50 } = data || {};
      
      let query = db.collection('fraudAlerts').orderBy('createdAt', 'desc');
      
      if (severity) {
        query = query.where('severity', '==', severity) as any;
      }
      
      const snapshot = await query.limit(limit).get();
      const alerts = snapshot.docs.map(doc => doc.data() as FraudAlert);
      
      return {
        success: true,
        alerts,
      };
    } catch (error: any) {
      console.error('Get fraud alerts error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get fraud alerts');
    }
  }
);

/**
 * Review fraud alert
 */
export const pack326_reviewFraudAlert = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { alertId, resolution } = data;
      
      if (!alertId || !resolution) {
        throw new HttpsError('invalid-argument', 'Alert ID and resolution required');
      }
      
      await db.collection('fraudAlerts').doc(alertId).update({
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.uid,
        resolution,
      });
      
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Review fraud alert error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to review alert');
    }
  }
);

/**
 * Get campaign audit log
 */
export const pack326_getCampaignAuditLog = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      const { campaignId, limit = 100 } = data;
      
      if (!campaignId) {
        throw new HttpsError('invalid-argument', 'Campaign ID required');
      }
      
      const snapshot = await db
        .collection('adsCampaignLog')
        .where('campaignId', '==', campaignId)
        .orderBy('performedAt', 'desc')
        .limit(limit)
        .get();
      
      const log = snapshot.docs.map(doc => doc.data());
      
      return {
        success: true,
        log,
      };
    } catch (error: any) {
      console.error('Get campaign audit log error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get audit log');
    }
  }
);

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get admin dashboard stats
 */
export const pack326_getAdminDashboardStats = https.onCall(
  async (request) => {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      await validateAdminAccess(auth.uid);
      
      // Get counts for various entities
      const [
        activeCampaigns,
        pausedCampaigns,
        pendingCreatives,
        totalImpressions,
        totalClicks,
        fraudAlerts,
      ] = await Promise.all([
        db.collection('adsCampaigns').where('status', '==', 'ACTIVE').get(),
        db.collection('adsCampaigns').where('status', '==', 'PAUSED').get(),
        db.collection('adsCreatives').where('status', '==', 'PENDING').get(),
        db.collection('adsImpressions').get(),
        db.collection('adsClicks').get(),
        db.collection('fraudAlerts').where('reviewedAt', '==', null).get(),
      ]);
      
      // Calculate total revenue from all campaigns
      const allCampaignsSnapshot = await db.collection('adsCampaigns').get();
      const totalRevenue = allCampaignsSnapshot.docs.reduce((sum, doc) => {
        const campaign = doc.data() as AdsCampaign;
        return sum + (campaign.spentTokens || 0);
      }, 0);
      
      const impressionCount = totalImpressions.size;
      const clickCount = totalClicks.size;
      const overallCTR = impressionCount > 0 ? (clickCount / impressionCount) * 100 : 0;
      
      return {
        success: true,
        stats: {
          activeCampaigns: activeCampaigns.size,
          pausedCampaigns: pausedCampaigns.size,
          pendingCreatives: pendingCreatives.size,
          totalImpressions: impressionCount,
          totalClicks: clickCount,
          overallCTR: overallCTR.toFixed(2),
          totalRevenue,
          unreviewedFraudAlerts: fraudAlerts.size,
        },
      };
    } catch (error: any) {
      console.error('Get admin dashboard stats error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get dashboard stats');
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack326_moderateCreative,
  pack326_getPendingCreatives,
  pack326_adminPauseCampaign,
  pack326_adminEndCampaign,
  pack326_adminListCampaigns,
  pack326_getFraudAlerts,
  pack326_reviewFraudAlert,
  pack326_getCampaignAuditLog,
  pack326_getAdminDashboardStats,
};