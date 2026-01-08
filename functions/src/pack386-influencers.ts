/**
 * PACK 386 - Influencer & Creator Acquisition Engine
 * 
 * Manages influencer partnerships with:
 * - Registration and campaign assignment
 * - Performance tracking (installs, conversions, churn)
 * - Multiple payout models (CPI, revenue-share, hybrid)
 * - Fraud detection integration
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface InfluencerProfile {
  influencerId: string;
  userId?: string;
  name: string;
  platform: string[];
  socialHandles: Record<string, string>;
  tier: 'NANO' | 'MICRO' | 'MID' | 'MACRO' | 'MEGA';
  status: 'ACTIVE' | 'SUSPENDED' | 'CHURNED';
  payoutModel: 'CPI' | 'REVENUE_SHARE' | 'HYBRID';
  payoutRate: number;
  metrics: {
    totalInstalls: number;
    verifiedAccounts: number;
    tokenPurchases: number;
    totalRevenue: number;
    churnRate: number;
    fraudScore: number;
  };
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface InfluencerCampaign {
  campaignId: string;
  influencerId: string;
  name: string;
  startDate: admin.firestore.Timestamp;
  endDate?: admin.firestore.Timestamp;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  targetInstalls: number;
  bonusThreshold?: number;
  metrics: {
    installs: number;
    conversions: number;
    revenue: number;
    pendingPayout: number;
    paidOut: number;
  };
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface InfluencerAttribution {
  attributionId: string;
  influencerId: string;
  campaignId?: string;
  userId: string;
  installDate: admin.firestore.Timestamp;
  hasVerified: boolean;
  hasTokenPurchase: boolean;
  totalSpent: number;
  hasChurned: boolean;
  fraudScore: number;
  createdAt: admin.firestore.Timestamp;
}

// ============================================================================
// REGISTER INFLUENCER
// ============================================================================

export const pack386_registerInfluencer = functions.https.onCall(
  async (data: {
    name: string;
    platform: string[];
    socialHandles: Record<string, string>;
    tier: 'NANO' | 'MICRO' | 'MID' | 'MACRO' | 'MEGA';
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const adminUserId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(adminUserId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Validate request
    if (!data.name || !data.platform || !data.tier) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Create influencer profile
    const influencerRef = db.collection('influencerProfiles').doc();
    const profile: InfluencerProfile = {
      influencerId: influencerRef.id,
      name: data.name,
      platform: data.platform,
      socialHandles: data.socialHandles || {},
      tier: data.tier,
      status: 'ACTIVE',
      payoutModel: 'CPI', // Default
      payoutRate: 2.0, // $2 per install default
      metrics: {
        totalInstalls: 0,
        verifiedAccounts: 0,
        tokenPurchases: 0,
        totalRevenue: 0,
        churnRate: 0,
        fraudScore: 0,
      },
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await influencerRef.set(profile);

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'INFLUENCER_REGISTERED',
      influencerId: influencerRef.id,
      name: data.name,
      tier: data.tier,
      userId: adminUserId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true, influencerId: influencerRef.id };
  }
);

// ============================================================================
// ASSIGN INFLUENCER CAMPAIGN
// ============================================================================

export const pack386_assignInfluencerCampaign = functions.https.onCall(
  async (data: {
    influencerId: string;
    name: string;
    startDate: string;
    endDate?: string;
    targetInstalls: number;
    bonusThreshold?: number;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const adminUserId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(adminUserId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Validate influencer exists
    const influencerDoc = await db.collection('influencerProfiles').doc(data.influencerId).get();
    if (!influencerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Influencer not found');
    }

    // Create campaign
    const campaignRef = db.collection('influencerCampaigns').doc();
    const campaign: InfluencerCampaign = {
      campaignId: campaignRef.id,
      influencerId: data.influencerId,
      name: data.name,
      startDate: admin.firestore.Timestamp.fromDate(new Date(data.startDate)),
      endDate: data.endDate ? admin.firestore.Timestamp.fromDate(new Date(data.endDate)) : undefined,
      status: 'ACTIVE',
      targetInstalls: data.targetInstalls,
      bonusThreshold: data.bonusThreshold,
      metrics: {
        installs: 0,
        conversions: 0,
        revenue: 0,
        pendingPayout: 0,
        paidOut: 0,
      },
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await campaignRef.set(campaign);

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'INFLUENCER_CAMPAIGN_ASSIGNED',
      influencerId: data.influencerId,
      campaignId: campaignRef.id,
      targetInstalls: data.targetInstalls,
      userId: adminUserId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true, campaignId: campaignRef.id };
  }
);

// ============================================================================
// SET INFLUENCER PAYOUT MODEL
// ============================================================================

export const pack386_setInfluencerPayoutModel = functions.https.onCall(
  async (data: {
    influencerId: string;
    payoutModel: 'CPI' | 'REVENUE_SHARE' | 'HYBRID';
    payoutRate: number;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const adminUserId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(adminUserId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Validate influencer exists
    const influencerRef = db.collection('influencerProfiles').doc(data.influencerId);
    const influencerDoc = await influencerRef.get();
    if (!influencerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Influencer not found');
    }

    // Update payout model
    await influencerRef.update({
      payoutModel: data.payoutModel,
      payoutRate: data.payoutRate,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'INFLUENCER_PAYOUT_UPDATED',
      influencerId: data.influencerId,
      payoutModel: data.payoutModel,
      payoutRate: data.payoutRate,
      userId: adminUserId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// TRACK INFLUENCER ATTRIBUTION (TRIGGERED)
// ============================================================================

export const pack386_trackInfluencerAttribution = functions.firestore
  .document('acquisitionAttribution/{attributionId}')
  .onCreate(async (snap) => {
    const attribution = snap.data();
    const influencerId = attribution.influencerId;

    if (!influencerId) {
      return; // Not an influencer attribution
    }

    // Update influencer metrics
    const influencerRef = db.collection('influencerProfiles').doc(influencerId);
    const influencerDoc = await influencerRef.get();

    if (!influencerDoc.exists) {
      return;
    }

    const influencer = influencerDoc.data() as InfluencerProfile;

    // Update profile metrics
    await influencerRef.update({
      'metrics.totalInstalls': admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Update campaign metrics if associated
    if (attribution.campaignId) {
      const campaignRef = db.collection('influencerCampaigns').doc(attribution.campaignId);
      await campaignRef.update({
        'metrics.installs': admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Calculate pending payout based on model
      let payout = 0;
      if (influencer.payoutModel === 'CPI' || influencer.payoutModel === 'HYBRID') {
        payout = influencer.payoutRate;
      }

      if (payout > 0) {
        await campaignRef.update({
          'metrics.pendingPayout': admin.firestore.FieldValue.increment(payout),
        });
      }
    }
  });

// ============================================================================
// UPDATE INFLUENCER CONVERSION (TRIGGERED)
// ============================================================================

export const pack386_updateInfluencerConversion = functions.firestore
  .document('acquisitionAttribution/{attributionId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    const influencerId = after.influencerId;
    if (!influencerId) {
      return;
    }

    // Check if user made first token purchase
    if (!before.hasTokenPurchase && after.hasTokenPurchase) {
      const influencerRef = db.collection('influencerProfiles').doc(influencerId);
      const influencerDoc = await influencerRef.get();

      if (!influencerDoc.exists) {
        return;
      }

      const influencer = influencerDoc.data() as InfluencerProfile;

      // Update influencer metrics
      await influencerRef.update({
        'metrics.tokenPurchases': admin.firestore.FieldValue.increment(1),
        'metrics.totalRevenue': admin.firestore.FieldValue.increment(after.totalSpent),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Update campaign metrics
      if (after.campaignId) {
        const campaignRef = db.collection('influencerCampaigns').doc(after.campaignId);
        await campaignRef.update({
          'metrics.conversions': admin.firestore.FieldValue.increment(1),
          'metrics.revenue': admin.firestore.FieldValue.increment(after.totalSpent),
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Add revenue share payout if applicable
        if (influencer.payoutModel === 'REVENUE_SHARE' || influencer.payoutModel === 'HYBRID') {
          const sharePayout = after.totalSpent * (influencer.payoutRate / 100);
          await campaignRef.update({
            'metrics.pendingPayout': admin.firestore.FieldValue.increment(sharePayout),
          });
        }
      }
    }

    // Check if user churned
    if (!before.hasChurned && after.hasChurned) {
      const influencerRef = db.collection('influencerProfiles').doc(influencerId);
      await influencerRef.update({
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Recalculate churn rate
      const attributionsSnapshot = await db.collection('influencerAttribution')
        .where('influencerId', '==', influencerId)
        .get();

      const total = attributionsSnapshot.size;
      const churned = attributionsSnapshot.docs.filter(doc => doc.data().hasChurned).length;
      const churnRate = total > 0 ? churned / total : 0;

      await influencerRef.update({
        'metrics.churnRate': churnRate,
      });
    }
  });

// ============================================================================
// CALCULATE INFLUENCER ROI (SCHEDULED)
// ============================================================================

export const pack386_calculateInfluencerROI = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const influencersSnapshot = await db.collection('influencerProfiles')
      .where('status', '==', 'ACTIVE')
      .get();

    for (const doc of influencersSnapshot.docs) {
      const influencer = doc.data() as InfluencerProfile;

      // Get all campaigns for this influencer
      const campaignsSnapshot = await db.collection('influencerCampaigns')
        .where('influencerId', '==', influencer.influencerId)
        .get();

      let totalPayout = 0;
      let totalRevenue = 0;

      campaignsSnapshot.forEach(campaignDoc => {
        const campaign = campaignDoc.data();
        totalPayout += campaign.metrics?.paidOut || 0;
        totalPayout += campaign.metrics?.pendingPayout || 0;
        totalRevenue += campaign.metrics?.revenue || 0;
      });

      const roi = totalPayout > 0 ? totalRevenue / totalPayout : 0;

      // Flag low-performing influencers
      if (influencer.metrics.totalInstalls > 100 && roi < 1.0) {
        await db.collection('adminAuditLog').add({
          action: 'INFLUENCER_LOW_ROI',
          influencerId: influencer.influencerId,
          name: influencer.name,
          roi,
          totalInstalls: influencer.metrics.totalInstalls,
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }

    return null;
  });

// ============================================================================
// GET INFLUENCER ANALYTICS
// ============================================================================

export const pack386_getInfluencerAnalytics = functions.https.onCall(
  async (data: { influencerId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    if (data.influencerId) {
      // Single influencer analytics
      const influencerDoc = await db.collection('influencerProfiles').doc(data.influencerId).get();
      if (!influencerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Influencer not found');
      }

      const campaignsSnapshot = await db.collection('influencerCampaigns')
        .where('influencerId', '==', data.influencerId)
        .get();

      const campaigns = campaignsSnapshot.docs.map(doc => doc.data());

      return {
        influencer: influencerDoc.data(),
        campaigns,
      };
    } else {
      // All influencers ranking
      const influencersSnapshot = await db.collection('influencerProfiles')
        .orderBy('metrics.totalRevenue', 'desc')
        .limit(100)
        .get();

      const influencers = influencersSnapshot.docs.map(doc => doc.data());

      return { influencers };
    }
  }
);
