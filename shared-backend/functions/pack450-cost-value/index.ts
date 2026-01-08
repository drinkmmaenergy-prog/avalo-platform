/**
 * PACK 450 — Cost-Value Analyzer
 * 
 * Mapping infrastructure/compute/operational cost to real business value
 * Identification of low value + high burn modules
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
export interface ModuleCost {
  module: string;
  infrastructureCost: number; // USD per month
  computeCost: number; // USD per month
  operationalCost: number; // USD per month (maintenance, support)
  storageCost: number; // USD per month
  networkCost: number; // USD per month
  totalCost: number; // USD per month
  costTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface ModuleValue {
  module: string;
  directRevenue: number; // USD per month
  indirectRevenue: number; // USD per month (attributed)
  userEngagement: number; // 0-100 score
  strategicImportance: number; // 0-100 score
  customerSatisfaction: number; // 0-100 score
  totalValue: number; // composite score
  valueTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface CostValueAnalysis {
  module: string;
  cost: ModuleCost;
  value: ModuleValue;
  roi: number; // Return on Investment %
  efficiency: number; // Value per dollar spent
  classification: 'high_value_low_cost' | 'high_value_high_cost' | 'low_value_low_cost' | 'low_value_high_cost';
  recommendation: string;
  priority: 'maintain' | 'optimize' | 'review' | 'decommission';
  analyzedAt: Date;
}

/**
 * Analyze cost-to-value mapping for all modules
 */
export const pack450CostValueAnalyze = functions
  .region('us-central1')
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => {
    console.log('Starting cost-value analysis...');

    // Get all active modules
    const modulesSnapshot = await db.collection('modules').get();
    const modules = modulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const analyses: CostValueAnalysis[] = [];

    for (const module of modules) {
      // Calculate costs
      const cost = await calculateModuleCost(module.id);

      // Calculate value
      const value = await calculateModuleValue(module.id);

      // Perform analysis
      const analysis = performCostValueAnalysis(module.id, cost, value);

      analyses.push(analysis);

      // Save analysis
      await db.collection('cost_value_analysis').doc(module.id).set(analysis, { merge: true });
    }

    // Identify problem modules
    const lowValueHighCost = analyses.filter(
      a => a.classification === 'low_value_high_cost'
    );

    const decommissionCandidates = analyses.filter(
      a => a.priority === 'decommission'
    );

    // Generate summary report
    const summary = {
      totalModules: analyses.length,
      totalCost: analyses.reduce((sum, a) => sum + a.cost.totalCost, 0),
      totalValue: analyses.reduce((sum, a) => sum + a.value.totalValue, 0),
      averageROI: analyses.reduce((sum, a) => sum + a.roi, 0) / analyses.length,
      lowValueHighCostModules: lowValueHighCost.length,
      decommissionCandidates: decommissionCandidates.length,
      byClassification: {
        high_value_low_cost: analyses.filter(a => a.classification === 'high_value_low_cost').length,
        high_value_high_cost: analyses.filter(a => a.classification === 'high_value_high_cost').length,
        low_value_low_cost: analyses.filter(a => a.classification === 'low_value_low_cost').length,
        low_value_high_cost: lowValueHighCost.length
      },
      analyzedAt: new Date()
    };

    await db.collection('cost_value_summary').add(summary);

    // Send alerts for critical issues
    if (decommissionCandidates.length > 0) {
      await sendCostValueAlerts(decommissionCandidates);
    }

    console.log(`Cost-value analysis complete: ${analyses.length} modules analyzed`);

    return {
      success: true,
      modulesAnalyzed: analyses.length,
      decommissionCandidates: decommissionCandidates.length
    };
  });

/**
 * Get cost-value report
 */
export const pack450CostValueReport = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { module, timeRange = '30d' } = data;

    let query: FirebaseFirestore.Query = db.collection('cost_value_analysis');

    if (module) {
      query = query.where('module', '==', module);
    }

    const snapshot = await query.get();
    const analyses = snapshot.docs.map(doc => doc.data()) as CostValueAnalysis[];

    // Get summary
    const summarySnapshot = await db
      .collection('cost_value_summary')
      .orderBy('analyzedAt', 'desc')
      .limit(1)
      .get();

    const summary = summarySnapshot.empty ? null : summarySnapshot.docs[0].data();

    // Identify optimization opportunities
    const opportunities = identifyOptimizationOpportunities(analyses);

    return {
      success: true,
      analyses,
      summary,
      opportunities
    };
  });

/**
 * Calculate module cost
 */
async function calculateModuleCost(moduleId: string): Promise<ModuleCost> {
  // Get cost data from monitoring systems
  const costSnapshot = await db
    .collection('module_costs')
    .doc(moduleId)
    .get();

  const costData = costSnapshot.data() || {};

  const infrastructureCost = costData.infrastructureCost || 0;
  const computeCost = costData.computeCost || 0;
  const operationalCost = costData.operationalCost || 0;
  const storageCost = costData.storageCost || 0;
  const networkCost = costData.networkCost || 0;

  const totalCost = infrastructureCost + computeCost + operationalCost + storageCost + networkCost;

  // Determine trend
  const historicalCosts = await getHistoricalCosts(moduleId, 3); // last 3 months
  const costTrend = determineTrend(historicalCosts.map(c => c.totalCost));

  return {
    module: moduleId,
    infrastructureCost,
    computeCost,
    operationalCost,
    storageCost,
    networkCost,
    totalCost,
    costTrend
  };
}

/**
 * Calculate module value
 */
async function calculateModuleValue(moduleId: string): Promise<ModuleValue> {
  // Get value data from analytics
  const valueSnapshot = await db
    .collection('module_value')
    .doc(moduleId)
    .get();

  const valueData = valueSnapshot.data() || {};

  const directRevenue = valueData.directRevenue || 0;
  const indirectRevenue = valueData.indirectRevenue || 0;
  const userEngagement = valueData.userEngagement || 0;
  const strategicImportance = valueData.strategicImportance || 50;
  const customerSatisfaction = valueData.customerSatisfaction || 50;

  // Calculate composite value score
  const totalValue = (
    (directRevenue + indirectRevenue) / 100 + // Revenue component
    userEngagement * 0.3 + // Engagement component
    strategicImportance * 0.4 + // Strategic component
    customerSatisfaction * 0.3 // Satisfaction component
  );

  // Determine trend
  const historicalValues = await getHistoricalValues(moduleId, 3);
  const valueTrend = determineTrend(historicalValues.map(v => v.totalValue));

  return {
    module: moduleId,
    directRevenue,
    indirectRevenue,
    userEngagement,
    strategicImportance,
    customerSatisfaction,
    totalValue,
    valueTrend
  };
}

/**
 * Perform cost-value analysis
 */
function performCostValueAnalysis(
  moduleId: string,
  cost: ModuleCost,
  value: ModuleValue
): CostValueAnalysis {
  // Calculate ROI
  const totalRevenue = value.directRevenue + value.indirectRevenue;
  const roi = cost.totalCost > 0 ? ((totalRevenue - cost.totalCost) / cost.totalCost) * 100 : 0;

  // Calculate efficiency (value per dollar)
  const efficiency = cost.totalCost > 0 ? value.totalValue / cost.totalCost : 0;

  // Classify module
  const highCost = cost.totalCost > 1000; // $1000/month threshold
  const highValue = value.totalValue > 50; // 50 value score threshold

  let classification: CostValueAnalysis['classification'];
  let recommendation: string;
  let priority: CostValueAnalysis['priority'];

  if (highValue && !highCost) {
    classification = 'high_value_low_cost';
    recommendation = 'Excellent module - maintain and potentially expand';
    priority = 'maintain';
  } else if (highValue && highCost) {
    classification = 'high_value_high_cost';
    recommendation = 'Strategic module - optimize costs while maintaining value';
    priority = 'optimize';
  } else if (!highValue && !highCost) {
    classification = 'low_value_low_cost';
    recommendation = 'Low priority - monitor and consider consolidation';
    priority = 'review';
  } else {
    classification = 'low_value_high_cost';
    recommendation = 'High cost with low return - strong decommission candidate';
    priority = 'decommission';
  }

  // Additional factors
  if (roi < -50) {
    priority = 'decommission';
    recommendation = 'Negative ROI - immediate decommission recommended';
  } else if (roi < 0 && priority !== 'decommission') {
    priority = 'review';
    recommendation += ' (negative ROI)';
  }

  if (value.strategicImportance > 80) {
    // Override decommission for strategically important modules
    if (priority === 'decommission') {
      priority = 'optimize';
      recommendation = 'Strategic importance prevents decommission - aggressive optimization required';
    }
  }

  return {
    module: moduleId,
    cost,
    value,
    roi,
    efficiency,
    classification,
    recommendation,
    priority,
    analyzedAt: new Date()
  };
}

/**
 * Get historical costs
 */
async function getHistoricalCosts(moduleId: string, months: number): Promise<ModuleCost[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const snapshot = await db
    .collection('module_costs_history')
    .where('module', '==', moduleId)
    .where('timestamp', '>=', cutoffDate)
    .orderBy('timestamp', 'asc')
    .get();

  return snapshot.docs.map(doc => doc.data() as ModuleCost);
}

/**
 * Get historical values
 */
async function getHistoricalValues(moduleId: string, months: number): Promise<ModuleValue[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const snapshot = await db
    .collection('module_value_history')
    .where('module', '==', moduleId)
    .where('timestamp', '>=', cutoffDate)
    .orderBy('timestamp', 'asc')
    .get();

  return snapshot.docs.map(doc => doc.data() as ModuleValue);
}

/**
 * Determine trend from historical data
 */
function determineTrend(values: number[]): 'increasing' | 'stable' | 'decreasing' {
  if (values.length < 2) {
    return 'stable';
  }

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

/**
 * Identify optimization opportunities
 */
function identifyOptimizationOpportunities(analyses: CostValueAnalysis[]): any[] {
  const opportunities: any[] = [];

  for (const analysis of analyses) {
    // High cost modules
    if (analysis.cost.totalCost > 5000) {
      opportunities.push({
        type: 'COST_REDUCTION',
        module: analysis.module,
        currentCost: analysis.cost.totalCost,
        potentialSavings: analysis.cost.totalCost * 0.2, // 20% reduction target
        priority: 'high'
      });
    }

    // Low efficiency modules
    if (analysis.efficiency < 10 && analysis.value.strategicImportance < 70) {
      opportunities.push({
        type: 'EFFICIENCY_IMPROVEMENT',
        module: analysis.module,
        currentEfficiency: analysis.efficiency,
        recommendation: 'Improve value delivery or reduce costs'
      });
    }

    // Negative ROI modules
    if (analysis.roi < 0 && analysis.value.strategicImportance < 60) {
      opportunities.push({
        type: 'DECOMMISSION_CANDIDATE',
        module: analysis.module,
        roi: analysis.roi,
        cost: analysis.cost.totalCost,
        potentialSavings: analysis.cost.totalCost
      });
    }

    // Increasing cost trend
    if (analysis.cost.costTrend === 'increasing' && analysis.value.valueTrend !== 'increasing') {
      opportunities.push({
        type: 'COST_TREND_ALERT',
        module: analysis.module,
        issue: 'Costs increasing while value is not'
      });
    }
  }

  return opportunities;
}

/**
 * Send cost-value alerts
 */
async function sendCostValueAlerts(candidates: CostValueAnalysis[]): Promise<void> {
  const totalPotentialSavings = candidates.reduce((sum, c) => sum + c.cost.totalCost, 0);

  await db.collection('notifications').add({
    type: 'COST_VALUE_ALERT',
    severity: 'HIGH',
    title: 'Decommission Candidates Identified',
    message: `${candidates.length} modules identified for potential decommission (potential savings: $${totalPotentialSavings.toFixed(2)}/month)`,
    data: {
      candidates: candidates.map(c => ({
        module: c.module,
        cost: c.cost.totalCost,
        roi: c.roi,
        recommendation: c.recommendation
      }))
    },
    createdAt: new Date()
  });
}
