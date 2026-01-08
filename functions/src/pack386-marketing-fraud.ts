/**
 * PACK 386 - Marketing-Fraud Fusion Layer
 * 
 * Integrates with PACK 302 (Fraud Detection) to protect marketing spend:
 * - Detects fake installs and burst reviews
 * - Identifies CPI anomalies
 * - Catches influencer farm behavior
 * - Blocks refund loops from ads
 * - Auto-blocks attribution sources and payouts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface MarketingFraudSignal {
  signalId: string;
  type: 'FAKE_INSTALLS' | 'BURST_REVIEWS' | 'CPI_ANOMALY' | 'INFLUENCER_FARM' | 'REFUND_LOOP';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: string;
  sourceId: string;
  details: Record<string, any>;
  actionTaken?: string;
  createdAt: admin.firestore.Timestamp;
}

interface FraudShieldResponse {
  blocked: boolean;
  signals: MarketingFraudSignal[];
  actions: string[];
}

// ============================================================================
// MARKETING FRAUD SHIELD (MAIN FUNCTION)
// ============================================================================

export const pack386_marketingFraudShield = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const signals: MarketingFraudSignal[] = [];

    // 1. Detect fake installs
    const fakeInstallSignals = await detectFakeInstalls();
    signals.push(...fakeInstallSignals);

    // 2. Detect burst reviews
    const burstReviewSignals = await detectBurstReviews();
    signals.push(...burstReviewSignals);

    // 3. Detect CPI anomalies
    const cpiAnomalySignals = await detectCPIAnomalies();
    signals.push(...cpiAnomalySignals);

    // 4. Detect influencer farm behavior
    const influencerFarmSignals = await detectInfluencerFarms();
    signals.push(...influencerFarmSignals);

    // 5. Detect refund loops
    const refundLoopSignals = await detectRefundLoops();
    signals.push(...refundLoopSignals);

    // Process all signals and take action
    for (const signal of signals) {
      await processSignal(signal);
    }

    // Log summary
    await db.collection('adminAuditLog').add({
      action: 'MARKETING_FRAUD_SHIELD_RUN',
      signalsDetected: signals.length,
      criticalSignals: signals.filter(s => s.severity === 'CRITICAL').length,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return null;
  });

// ============================================================================
// DETECT FAKE INSTALLS
// ============================================================================

async function detectFakeInstalls(): Promise<MarketingFraudSignal[]> {
  const signals: MarketingFraudSignal[] = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Check recent attributions
  const attributionsSnapshot = await db.collection('acquisitionAttribution')
    .where('installDate', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
    .get();

  // Group by campaign
  const byCampaign: Record<string, any[]> = {};
  attributionsSnapshot.forEach(doc => {
    const attr = doc.data();
    if (attr.campaignId) {
      if (!byCampaign[attr.campaignId]) {
        byCampaign[attr.campaignId] = [];
      }
      byCampaign[attr.campaignId].push(attr);
    }
  });

  // Check for suspicious patterns in each campaign
  for (const [campaignId, attributions] of Object.entries(byCampaign)) {
    const totalInstalls = attributions.length;
    const blockedInstalls = attributions.filter(a => a.blocked).length;
    const highFraudScore = attributions.filter(a => a.fraudScore > 0.6).length;

    // Alert if >30% blocked or high fraud score
    if (totalInstalls >= 10 && (blockedInstalls / totalInstalls > 0.3 || highFraudScore / totalInstalls > 0.4)) {
      const signalRef = db.collection('marketingFraudSignals').doc();
      const signal: MarketingFraudSignal = {
        signalId: signalRef.id,
        type: 'FAKE_INSTALLS',
        severity: blockedInstalls / totalInstalls > 0.5 ? 'CRITICAL' : 'HIGH',
        source: 'campaign',
        sourceId: campaignId,
        details: {
          totalInstalls,
          blockedInstalls,
          highFraudScore,
          blockRate: blockedInstalls / totalInstalls,
          fraudRate: highFraudScore / totalInstalls,
        },
        createdAt: admin.firestore.Timestamp.now(),
      };

      await signalRef.set(signal);
      signals.push(signal);
    }
  }

  return signals;
}

// ============================================================================
// DETECT BURST REVIEWS
// ============================================================================

async function detectBurstReviews(): Promise<MarketingFraudSignal[]> {
  const signals: MarketingFraudSignal[] = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Check review prompts completed
  const reviewsSnapshot = await db.collection('reviewPrompts')
    .where('completed', '==', true)
    .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
    .get();

  const reviewsBySource: Record<string, any[]> = {};

  for (const doc of reviewsSnapshot.docs) {
    const review = doc.data();
    const userId = review.userId;

    // Get user's attribution
    const attrSnapshot = await db.collection('acquisitionAttribution')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!attrSnapshot.empty) {
      const attr = attrSnapshot.docs[0].data();
      const source = attr.campaignId || attr.influencerId || 'organic';

      if (!reviewsBySource[source]) {
        reviewsBySource[source] = [];
      }
      reviewsBySource[source].push(review);
    }
  }

  // Check for burst patterns (>10 reviews in 1 hour from same source)
  for (const [source, reviews] of Object.entries(reviewsBySource)) {
    if (reviews.length > 10) {
      const signalRef = db.collection('marketingFraudSignals').doc();
      const signal: MarketingFraudSignal = {
        signalId: signalRef.id,
        type: 'BURST_REVIEWS',
        severity: reviews.length > 20 ? 'CRITICAL' : 'HIGH',
        source: 'attribution',
        sourceId: source,
        details: {
          reviewCount: reviews.length,
          timeWindow: '1 hour',
        },
        createdAt: admin.firestore.Timestamp.now(),
      };

      await signalRef.set(signal);
      signals.push(signal);
    }
  }

  return signals;
}

// ============================================================================
// DETECT CPI ANOMALIES
// ============================================================================

async function detectCPIAnomalies(): Promise<MarketingFraudSignal[]> {
  const signals: MarketingFraudSignal[] = [];

  // Get active campaigns
  const campaignsSnapshot = await db.collection('marketingCampaigns')
    .where('status', '==', 'ACTIVE')
    .get();

  for (const doc of campaignsSnapshot.docs) {
    const campaign = doc.data();
    
    // Skip if not enough data
    if (campaign.metrics.installs < 50) {
      continue;
    }

    const actualCPI = campaign.metrics.actualCPI;
    const targetCPI = campaign.cpiTarget;

    // Alert if actual CPI is 200%+ of target
    if (actualCPI > targetCPI * 2) {
      const signalRef = db.collection('marketingFraudSignals').doc();
      const signal: MarketingFraudSignal = {
        signalId: signalRef.id,
        type: 'CPI_ANOMALY',
        severity: actualCPI > targetCPI * 3 ? 'CRITICAL' : 'HIGH',
        source: 'campaign',
        sourceId: doc.id,
        details: {
          actualCPI,
          targetCPI,
          multiplier: actualCPI / targetCPI,
          platform: campaign.platform,
        },
        createdAt: admin.firestore.Timestamp.now(),
      };

      await signalRef.set(signal);
      signals.push(signal);
    }
  }

  return signals;
}

// ============================================================================
// DETECT INFLUENCER FARM BEHAVIOR
// ============================================================================

async function detectInfluencerFarms(): Promise<MarketingFraudSignal[]> {
  const signals: MarketingFraudSignal[] = [];

  // Get influencers with recent activity
  const influencersSnapshot = await db.collection('influencerProfiles')
    .where('status', '==', 'ACTIVE')
    .get();

  for (const doc of influencersSnapshot.docs) {
    const influencer = doc.data();
    
    // Skip if not enough data
    if (influencer.metrics.totalInstalls < 20) {
      continue;
    }

    // Get recent attributions from this influencer
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const attributionsSnapshot = await db.collection('acquisitionAttribution')
      .where('influencerId', '==', influencer.influencerId)
      .where('installDate', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    if (attributionsSnapshot.empty) continue;

    // Check for farm indicators
    const attributions = attributionsSnapshot.docs.map(d => d.data());
    const uniqueIPs = new Set(attributions.map(a => a.deviceInfo?.ipAddress)).size;
    const avgFraudScore = attributions.reduce((sum, a) => sum + (a.fraudScore || 0), 0) / attributions.length;
    const blockedRate = attributions.filter(a => a.blocked).length / attributions.length;
    const conversionRate = attributions.filter(a => a.hasTokenPurchase).length / attributions.length;

    // Flag if: low IP diversity, high fraud score, high block rate, or zero conversions
    if (
      (uniqueIPs < attributions.length * 0.5) ||  // <50% unique IPs
      (avgFraudScore > 0.6) ||
      (blockedRate > 0.3) ||
      (conversionRate === 0 && attributions.length > 30)
    ) {
      const signalRef = db.collection('marketingFraudSignals').doc();
      const signal: MarketingFraudSignal = {
        signalId: signalRef.id,
        type: 'INFLUENCER_FARM',
        severity: blockedRate > 0.5 ? 'CRITICAL' : 'HIGH',
        source: 'influencer',
        sourceId: influencer.influencerId,
        details: {
          name: influencer.name,
          totalInstalls: attributions.length,
          uniqueIPs,
          ipDiversity: uniqueIPs / attributions.length,
          avgFraudScore,
          blockedRate,
          conversionRate,
        },
        createdAt: admin.firestore.Timestamp.now(),
      };

      await signalRef.set(signal);
      signals.push(signal);
    }
  }

  return signals;
}

// ============================================================================
// DETECT REFUND LOOPS
// ============================================================================

async function detectRefundLoops(): Promise<MarketingFraudSignal[]> {
  const signals: MarketingFraudSignal[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get recent refunds
  const refundsSnapshot = await db.collection('tokenTransactions')
    .where('type', '==', 'REFUND')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
    .get();

  // Group by user
  const refundsByUser: Record<string, any[]> = {};
  refundsSnapshot.forEach(doc => {
    const refund = doc.data();
    const userId = refund.userId;
    if (!refundsByUser[userId]) {
      refundsByUser[userId] = [];
    }
    refundsByUser[userId].push(refund);
  });

  // Check users with multiple refunds
  for (const [userId, refunds] of Object.entries(refundsByUser)) {
    if (refunds.length >= 3) {
      // Get user's attribution
      const attrSnapshot = await db.collection('acquisitionAttribution')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!attrSnapshot.empty) {
        const attr = attrSnapshot.docs[0].data();
        const source = attr.campaignId || attr.influencerId;

        if (source) {
          const signalRef = db.collection('marketingFraudSignals').doc();
          const signal: MarketingFraudSignal = {
            signalId: signalRef.id,
            type: 'REFUND_LOOP',
            severity: refunds.length >= 5 ? 'CRITICAL' : 'HIGH',
            source: attr.campaignId ? 'campaign' : 'influencer',
            sourceId: source,
            details: {
              userId,
              refundCount: refunds.length,
              totalRefunded: refunds.reduce((sum, r) => sum + (r.amount || 0), 0),
            },
            createdAt: admin.firestore.Timestamp.now(),
          };

          await signalRef.set(signal);
          signals.push(signal);
        }
      }
    }
  }

  return signals;
}

// ============================================================================
// PROCESS SIGNAL AND TAKE ACTION
// ============================================================================

async function processSignal(signal: MarketingFraudSignal): Promise<void> {
  const actions: string[] = [];

  // Take action based on severity and type
  if (signal.severity === 'CRITICAL' || signal.severity === 'HIGH') {
    switch (signal.type) {
      case 'FAKE_INSTALLS':
      case 'CPI_ANOMALY':
        // Pause campaign
        if (signal.source === 'campaign') {
          await db.collection('marketingCampaigns').doc(signal.sourceId).update({
            status: 'PAUSED',
            updatedAt: admin.firestore.Timestamp.now(),
          });
          actions.push('CAMPAIGN_PAUSED');
        }
        break;

      case 'INFLUENCER_FARM':
        // Suspend influencer
        await db.collection('influencerProfiles').doc(signal.sourceId).update({
          status: 'SUSPENDED',
          updatedAt: admin.firestore.Timestamp.now(),
        });
        actions.push('INFLUENCER_SUSPENDED');

        // Block pending payouts
        const campaignsSnapshot = await db.collection('influencerCampaigns')
          .where('influencerId', '==', signal.sourceId)
          .where('status', '==', 'ACTIVE')
          .get();

        for (const doc of campaignsSnapshot.docs) {
          await doc.ref.update({
            status: 'PAUSED',
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
        actions.push('PAYOUTS_BLOCKED');
        break;

      case 'BURST_REVIEWS':
        // Block future reviews from this source
        await db.collection('attributionBlocklist').add({
          sourceType: signal.source,
          sourceId: signal.sourceId,
          reason: 'BURST_REVIEWS',
          timestamp: admin.firestore.Timestamp.now(),
        });
        actions.push('SOURCE_BLOCKED');
        break;

      case 'REFUND_LOOP':
        // Blacklist user and block attribution source
        const userId = signal.details.userId;
        await db.collection('users').doc(userId).update({
          status: 'SUSPENDED',
          suspensionReason: 'REFUND_ABUSE',
          updatedAt: admin.firestore.Timestamp.now(),
        });
        actions.push('USER_SUSPENDED');
        break;
    }
  }

  // Update signal with actions taken
  await db.collection('marketingFraudSignals').doc(signal.signalId).update({
    actionTaken: actions.join(', '),
  });

  // Create fraud alert
  await db.collection('fraudAlerts').add({
    type: signal.type,
    severity: signal.severity,
    source: signal.source,
    sourceId: signal.sourceId,
    details: signal.details,
    actions,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

// ============================================================================
// MANUAL REVIEW AND UNBLOCK
// ============================================================================

export const pack386_reviewFraudSignal = functions.https.onCall(
  async (data: {
    signalId: string;
    action: 'APPROVE' | 'REJECT' | 'UNBLOCK';
    notes?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const signalDoc = await db.collection('marketingFraudSignals').doc(data.signalId).get();
    if (!signalDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Signal not found');
    }

    const signal = signalDoc.data() as MarketingFraudSignal;

    // Handle unblock action
    if (data.action === 'UNBLOCK') {
      if (signal.source === 'campaign') {
        await db.collection('marketingCampaigns').doc(signal.sourceId).update({
          status: 'ACTIVE',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else if (signal.source === 'influencer') {
        await db.collection('influencerProfiles').doc(signal.sourceId).update({
          status: 'ACTIVE',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    }

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'FRAUD_SIGNAL_REVIEWED',
      signalId: data.signalId,
      signalType: signal.type,
      reviewAction: data.action,
      notes: data.notes,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// GET FRAUD DASHBOARD DATA
// ============================================================================

export const pack386_getFraudDashboard = functions.https.onCall(
  async (data: { period?: 'day' | 'week' | 'month' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (data.period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get fraud signals
    const signalsSnapshot = await db.collection('marketingFraudSignals')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .get();

    // Aggregate by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    signalsSnapshot.forEach(doc => {
      const signal = doc.data();
      byType[signal.type] = (byType[signal.type] || 0) + 1;
      bySeverity[signal.severity] = (bySeverity[signal.severity] || 0) + 1;
    });

    return {
      totalSignals: signalsSnapshot.size,
      byType,
      bySeverity,
      recentSignals: signalsSnapshot.docs.slice(0, 20).map(doc => doc.data()),
    };
  }
);
