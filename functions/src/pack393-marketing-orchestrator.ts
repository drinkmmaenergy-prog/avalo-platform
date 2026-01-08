/**
 * PACK 393: Marketing Orchestration Engine
 * Central control system for global marketing campaigns
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// TYPES & INTERFACES
// ============================================

interface GeoMetrics {
  cpaByGeo: number;
  arpuByGeo: number;
  reviewRiskByGeo: number;
  fraudRiskByGeo: number;
  creatorSupplyDemand: number;
  retentionRate: number;
  conversionRate: number;
}

interface BudgetAllocation {
  geo: string;
  channel: string;
  allocated: number;
  spent: number;
  cpa: number;
  conversions: number;
  roi: number;
}

interface CampaignAction {
  campaignId: string;
  action: 'pause' | 'activate' | 'increase_budget' | 'decrease_budget' | 'swap_creative';
  reason: string;
  timestamp: admin.firestore.Timestamp;
}

interface SafetyThresholds {
  reviewBombingRisk: number;
  fraudProbability: number;
  retentionRate: number;
}

// Geo tiers configuration
const GEO_TIERS = {
  tier1: {
    countries: ['PL', 'UK', 'DE', 'SE'],
    budgetWeight: 0.50,
    targetCPA: 12.50,
    expectedARPU: 52.50,
    description: 'Premium markets - Strong ARPU & retention'
  },
  tier2: {
    countries: ['ES', 'IT', 'FR', 'NL'],
    budgetWeight: 0.30,
    targetCPA: 8.50,
    expectedARPU: 37.50,
    description: 'Core markets - Cultural localization focus'
  },
  tier3: {
    countries: ['RO', 'HU', 'CZ', 'BG', 'HR'],
    budgetWeight: 0.15,
    targetCPA: 5.50,
    expectedARPU: 25.00,
    description: 'Volume markets - Scale testing'
  },
  tier4: {
    countries: ['MX', 'BR', 'AR', 'TH', 'PH'],
    budgetWeight: 0.05,
    targetCPA: 3.00,
    expectedARPU: 15.00,
    description: 'Experimental markets - Learning phase'
  }
};

// Channel configuration
const CHANNELS = ['meta', 'tiktok', 'google_uac', 'influencer', 'aso'] as const;
type Channel = typeof CHANNELS[number];

// Safety thresholds
const SAFETY_THRESHOLDS: SafetyThresholds = {
  reviewBombingRisk: 0.65,
  fraudProbability: 0.45,
  retentionRate: 0.12
};

// ============================================
// MARKETING ORCHESTRATOR (Main Controller)
// ============================================

export const pack393_marketingOrchestrator = functions
  .runWith({ 
    timeoutSeconds: 540, 
    memory: '2GB' 
  })
  .pubsub.schedule('every 6 hours')
  .onRun(async (context) => {
    functions.logger.info('🚀 Marketing Orchestrator: Starting campaign optimization cycle');
    
    try {
      // Step 1: Calculate geo metrics
      const geoMetricsMap = await calculateAllGeoMetrics();
      
      // Step 2: Check safety for all active campaigns
      const safetyActions = await evaluateCampaignSafety(geoMetricsMap);
      
      // Step 3: Optimize budget allocation
      const budgetActions = await optimizeBudgetAllocation(geoMetricsMap);
      
      // Step 4: Execute campaign actions
      await executeCampaignActions([...safetyActions, ...budgetActions]);
      
      // Step 5: Generate orchestration report
      await generateOrchestrationReport(geoMetricsMap, safetyActions, budgetActions);
      
      functions.logger.info('✅ Marketing Orchestrator: Optimization cycle complete');
      
      return { success: true, actionsExecuted: safetyActions.length + budgetActions.length };
    } catch (error) {
      functions.logger.error('❌ Marketing Orchestrator failed:', error);
      
      // Alert admins on critical failure
      await createAlert({
        type: 'orchestrator_failure',
        severity: 'critical',
        message: `Marketing Orchestrator failed: ${error}`,
        timestamp: admin.firestore.Timestamp.now()
      });
      
      throw error;
    }
  });

// ============================================
// GEO METRICS CALCULATION
// ============================================

async function calculateAllGeoMetrics(): Promise<Map<string, GeoMetrics>> {
  const geoMetricsMap = new Map<string, GeoMetrics>();
  
  // Get all unique geos from budget collection
  const budgetSnapshot = await db.collection('marketingBudget')
    .where('date', '>=', getDateString(-7)) // Last 7 days
    .get();
  
  const geos = new Set<string>();
  budgetSnapshot.forEach(doc => geos.add(doc.data().geo));
  
  // Calculate metrics for each geo
  for (const geo of geos) {
    const metrics = await calculateGeoMetrics(geo);
    geoMetricsMap.set(geo, metrics);
  }
  
  functions.logger.info(`📊 Calculated metrics for ${geoMetricsMap.size} geos`);
  return geoMetricsMap;
}

async function calculateGeoMetrics(geo: string): Promise<GeoMetrics> {
  const sevenDaysAgo = getDateString(-7);
  
  // Get budget data
  const budgetSnapshot = await db.collection('marketingBudget')
    .where('geo', '==', geo)
    .where('date', '>=', sevenDaysAgo)
    .get();
  
  let totalSpent = 0;
  let totalConversions = 0;
  
  budgetSnapshot.forEach(doc => {
    const data = doc.data();
    totalSpent += data.spent || 0;
    totalConversions += data.conversions || 0;
  });
  
  const cpaByGeo = totalConversions > 0 ? totalSpent / totalConversions : 999;
  
  // Get ARPU data
  const attributionSnapshot = await db.collection('marketingAttribution')
    .where('geo', '==', geo)
    .where('installDate', '>=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
    .get();
  
  let totalLTV = 0;
  let userCount = 0;
  
  attributionSnapshot.forEach(doc => {
    totalLTV += doc.data().ltv || 0;
    userCount++;
  });
  
  const arpuByGeo = userCount > 0 ? totalLTV / userCount : 0;
  
  // Get fraud risk (from PACK 302 integration)
  const fraudRiskByGeo = await getGeoFraudRisk(geo);
  
  // Get review risk (from PACK 392 integration)
  const reviewRiskByGeo = await getGeoReviewRisk(geo);
  
  // Get retention rate
  const retentionRate = await getGeoRetentionRate(geo);
  
  // Get conversion rate
  const conversionRate = totalConversions > 0 ? (totalConversions / userCount) : 0;
  
  // Creator supply/demand (placeholder - would integrate with creator discovery)
  const creatorSupplyDemand = 1.0;
  
  return {
    cpaByGeo,
    arpuByGeo,
    reviewRiskByGeo,
    fraudRiskByGeo,
    creatorSupplyDemand,
    retentionRate,
    conversionRate
  };
}

// ============================================
// SAFETY EVALUATION
// ============================================

async function evaluateCampaignSafety(geoMetricsMap: Map<string, GeoMetrics>): Promise<CampaignAction[]> {
  const actions: CampaignAction[] = [];
  
  // Get all active campaigns
  const campaignsSnapshot = await db.collection('marketingCampaigns')
    .where('status', '==', 'active')
    .get();
  
  for (const campaignDoc of campaignsSnapshot.docs) {
    const campaign = campaignDoc.data();
    const campaignId = campaignDoc.id;
    
    // Check each geo in campaign
    for (const geo of (campaign.geo || [])) {
      const metrics = geoMetricsMap.get(geo);
      
      if (!metrics) continue;
      
      // Check safety thresholds
      if (metrics.reviewRiskByGeo > SAFETY_THRESHOLDS.reviewBombingRisk) {
        actions.push({
          campaignId,
          action: 'pause',
          reason: `Review bombing risk too high in ${geo}: ${(metrics.reviewRiskByGeo * 100).toFixed(1)}%`,
          timestamp: admin.firestore.Timestamp.now()
        });
      }
      
      if (metrics.fraudRiskByGeo > SAFETY_THRESHOLDS.fraudProbability) {
        actions.push({
          campaignId,
          action: 'pause',
          reason: `Fraud risk too high in ${geo}: ${(metrics.fraudRiskByGeo * 100).toFixed(1)}%`,
          timestamp: admin.firestore.Timestamp.now()
        });
      }
      
      if (metrics.retentionRate < SAFETY_THRESHOLDS.retentionRate) {
        actions.push({
          campaignId,
          action: 'pause',
          reason: `Retention rate too low in ${geo}: ${(metrics.retentionRate * 100).toFixed(1)}%`,
          timestamp: admin.firestore.Timestamp.now()
        });
      }
    }
  }
  
  functions.logger.info(`🛡️ Safety evaluation: ${actions.length} actions recommended`);
  return actions;
}

// ============================================
// BUDGET OPTIMIZATION
// ============================================

async function optimizeBudgetAllocation(geoMetricsMap: Map<string, GeoMetrics>): Promise<CampaignAction[]> {
  const actions: CampaignAction[] = [];
  
  // Get all active campaigns with budget data
  const campaignsSnapshot = await db.collection('marketingCampaigns')
    .where('status', '==', 'active')
    .get();
  
  for (const campaignDoc of campaignsSnapshot.docs) {
    const campaign = campaignDoc.data();
    const campaignId = campaignDoc.id;
    
    // Get recent performance
    const performanceSnapshot = await db.collection('campaignPerformance')
      .where('campaignId', '==', campaignId)
      .where('date', '>=', getDateString(-3))
      .get();
    
    let avgCPA = 0;
    let avgROI = 0;
    let dataPoints = 0;
    
    performanceSnapshot.forEach(doc => {
      const data = doc.data();
      avgCPA += data.cpa || 0;
      avgROI += data.roi || 0;
      dataPoints++;
    });
    
    if (dataPoints === 0) continue;
    
    avgCPA = avgCPA / dataPoints;
    avgROI = avgROI / dataPoints;
    
    // Get target CPA for campaign's geo tier
    const targetCPA = getTargetCPAForGeo(campaign.geo?.[0] || 'PL');
    
    // Decision logic
    if (avgCPA > targetCPA * 1.5) {
      // CPA too high - decrease budget
      actions.push({
        campaignId,
        action: 'decrease_budget',
        reason: `CPA ${avgCPA.toFixed(2)} exceeds target ${targetCPA.toFixed(2)} by 50%+`,
        timestamp: admin.firestore.Timestamp.now()
      });
    } else if (avgROI > 2.0 && avgCPA < targetCPA) {
      // Great performance - increase budget
      actions.push({
        campaignId,
        action: 'increase_budget',
        reason: `Excellent ROI ${avgROI.toFixed(2)}x with CPA ${avgCPA.toFixed(2)} below target`,
        timestamp: admin.firestore.Timestamp.now()
      });
    } else if (avgCPA > targetCPA * 1.2) {
      // Slightly high CPA - swap creative
      actions.push({
        campaignId,
        action: 'swap_creative',
        reason: `CPA ${avgCPA.toFixed(2)} moderately above target ${targetCPA.toFixed(2)}`,
        timestamp: admin.firestore.Timestamp.now()
      });
    }
  }
  
  functions.logger.info(`💰 Budget optimization: ${actions.length} actions recommended`);
  return actions;
}

// ============================================
// CAMPAIGN ACTION EXECUTION
// ============================================

async function executeCampaignActions(actions: CampaignAction[]): Promise<void> {
  const batch = db.batch();
  let batchCount = 0;
  
  for (const action of actions) {
    const campaignRef = db.collection('marketingCampaigns').doc(action.campaignId);
    
    switch (action.action) {
      case 'pause':
        batch.update(campaignRef, {
          status: 'paused',
          pausedReason: action.reason,
          pausedAt: action.timestamp,
          updatedAt: action.timestamp
        });
        
        // Create alert
        await createAlert({
          type: 'campaign_paused',
          severity: 'warning',
          message: `Campaign ${action.campaignId} paused: ${action.reason}`,
          timestamp: action.timestamp
        });
        break;
        
      case 'activate':
        batch.update(campaignRef, {
          status: 'active',
          activatedAt: action.timestamp,
          updatedAt: action.timestamp
        });
        break;
        
      case 'increase_budget':
        batch.update(campaignRef, {
          budget: admin.firestore.FieldValue.increment(1000), // Increase by $1000
          budgetIncreaseReason: action.reason,
          updatedAt: action.timestamp
        });
        break;
        
      case 'decrease_budget':
        batch.update(campaignRef, {
          budget: admin.firestore.FieldValue.increment(-500), // Decrease by $500
          budgetDecreaseReason: action.reason,
          updatedAt: action.timestamp
        });
        break;
        
      case 'swap_creative':
        // Trigger creative optimization (handled by pack393-creative-optimization)
        await db.collection('creativeOptimizationQueue').add({
          campaignId: action.campaignId,
          reason: action.reason,
          timestamp: action.timestamp
        });
        break;
    }
    
    // Log action to audit trail
    await db.collection('marketingAuditLog').add({
      action: `campaign_${action.action}`,
      campaignId: action.campaignId,
      reason: action.reason,
      actor: 'pack393_orchestrator',
      timestamp: action.timestamp
    });
    
    batchCount++;
    
    // Commit batch every 450 operations (Firestore limit is 500)
    if (batchCount >= 450) {
      await batch.commit();
      batchCount = 0;
    }
  }
  
  // Commit remaining operations
  if (batchCount > 0) {
    await batch.commit();
  }
  
  functions.logger.info(`✅ Executed ${actions.length} campaign actions`);
}

// ============================================
// REPORT GENERATION
// ============================================

async function generateOrchestrationReport(
  geoMetricsMap: Map<string, GeoMetrics>,
  safetyActions: CampaignAction[],
  budgetActions: CampaignAction[]
): Promise<void> {
  const report = {
    timestamp: admin.firestore.Timestamp.now(),
    geoCount: geoMetricsMap.size,
    safetyActionsCount: safetyActions.length,
    budgetActionsCount: budgetActions.length,
    topPerformingGeos: await getTopPerformingGeos(geoMetricsMap, 5),
    underperformingGeos: await getUnderperformingGeos(geoMetricsMap, 5),
    totalActiveCampaigns: await getActiveCampaignCount(),
    summary: {
      safeCampaigns: safetyActions.filter(a => a.action !== 'pause').length,
      pausedCampaigns: safetyActions.filter(a => a.action === 'pause').length,
      budgetIncreases: budgetActions.filter(a => a.action === 'increase_budget').length,
      budgetDecreases: budgetActions.filter(a => a.action === 'decrease_budget').length,
      creativeSwaps: budgetActions.filter(a => a.action === 'swap_creative').length
    }
  };
  
  await db.collection('orchestrationReports').add(report);
  functions.logger.info('📄 Orchestration report generated');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDateString(daysOffset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

function getTargetCPAForGeo(geo: string): number {
  for (const [, tier] of Object.entries(GEO_TIERS)) {
    if (tier.countries.includes(geo)) {
      return tier.targetCPA;
    }
  }
  return 10.00; // Default target CPA
}

async function getGeoFraudRisk(geo: string): Promise<number> {
  // Integration with PACK 302 fraud detection
  const fraudDataSnapshot = await db.collection('marketingFraudEvents')
    .where('geo', '==', geo)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
    .get();
  
  if (fraudDataSnapshot.empty) return 0;
  
  let totalFraudScore = 0;
  fraudDataSnapshot.forEach(doc => {
    totalFraudScore += doc.data().fraudScore || 0;
  });
  
  return totalFraudScore / fraudDataSnapshot.size;
}

async function getGeoReviewRisk(geo: string): Promise<number> {
  // Integration with PACK 392 ASO + Store Defense
  // Placeholder - would call PACK 392 functions
  return 0.15; // Default low risk
}

async function getGeoRetentionRate(geo: string): Promise<number> {
  // Integration with PACK 301 Retention Engine
  // Placeholder - would call retention analytics
  return 0.28; // Default 28% D7 retention
}

async function getTopPerformingGeos(geoMetricsMap: Map<string, GeoMetrics>, limit: number): Promise<string[]> {
  const geoArray = Array.from(geoMetricsMap.entries());
  geoArray.sort((a, b) => {
    const scoreA = (a[1].arpuByGeo / 50) * 0.5 + a[1].retentionRate * 0.5;
    const scoreB = (b[1].arpuByGeo / 50) * 0.5 + b[1].retentionRate * 0.5;
    return scoreB - scoreA;
  });
  return geoArray.slice(0, limit).map(entry => entry[0]);
}

async function getUnderperformingGeos(geoMetricsMap: Map<string, GeoMetrics>, limit: number): Promise<string[]> {
  const geoArray = Array.from(geoMetricsMap.entries());
  geoArray.sort((a, b) => {
    const scoreA = (a[1].cpaByGeo / 100) * 0.4 + a[1].fraudRiskByGeo * 0.3 + a[1].reviewRiskByGeo * 0.3;
    const scoreB = (b[1].cpaByGeo / 100) * 0.4 + b[1].fraudRiskByGeo * 0.3 + b[1].reviewRiskByGeo * 0.3;
    return scoreB - scoreA;
  });
  return geoArray.slice(0, limit).map(entry => entry[0]);
}

async function getActiveCampaignCount(): Promise<number> {
  const snapshot = await db.collection('marketingCampaigns')
    .where('status', '==', 'active')
    .count()
    .get();
  return snapshot.data().count;
}

async function createAlert(alert: { type: string; severity: string; message: string; timestamp: admin.firestore.Timestamp }): Promise<void> {
  await db.collection('marketingAlerts').add({
    ...alert,
    acknowledged: false
  });
}

// ============================================
// MANUAL TRIGGER (For Testing/Emergency)
// ============================================

export const pack393_manualOrchestration = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
    // Require admin authentication
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    functions.logger.info('🔧 Manual orchestration triggered by admin:', context.auth.uid);
    
    // Run orchestration immediately
    const result = await pack393_marketingOrchestrator(null as any);
    
    return { success: true, result };
  });

// ============================================
// GET ORCHESTRATION STATUS
// ============================================

export const pack393_getOrchestrationStatus = functions.https.onCall(async (data, context) => {
  // Require marketing manager or admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userRole = userDoc.data()?.role;
  
  if (!['admin', 'marketing_manager'].includes(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Marketing access required');
  }
  
  // Get latest report
  const latestReportSnapshot = await db.collection('orchestrationReports')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (latestReportSnapshot.empty) {
    return { status: 'no_reports', message: 'No orchestration reports found' };
  }
  
  const latestReport = latestReportSnapshot.docs[0].data();
  
  // Get active campaigns count
  const activeCampaignsSnapshot = await db.collection('marketingCampaigns')
    .where('status', '==', 'active')
    .get();
  
  // Get recent alerts
  const alertsSnapshot = await db.collection('marketingAlerts')
    .where('acknowledged', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  
  return {
    status: 'operational',
    lastRun: latestReport.timestamp,
    activeCampaigns: activeCampaignsSnapshot.size,
    recentActions: latestReport.summary,
    unacknowledgedAlerts: alertsSnapshot.size,
    topPerformingGeos: latestReport.topPerformingGeos,
    underperformingGeos: latestReport.underperformingGeos
  };
});
