import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 358 — Financial Stress Scenario Simulator
 * 
 * Simulates various financial stress scenarios
 * Provides risk assessment and survival runway
 */


import * as admin from 'firebase-admin';
import { FieldValue, HttpsError, auth, onCall, serverTimestamp, logger, onSchedule } from './runtime';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type FinancialScenario = {
  id: string;
  name: string;
  trafficMultiplier: number;    // e.g., 0.7 = -30% traffic
  churnMultiplier: number;       // e.g., 1.4 = +40% churn
  payoutMultiplier: number;      // e.g., 1.25 = +25% payouts
  durationDays: number;
};

export type ScenarioResult = {
  scenarioId: string;
  scenarioName: string;
  baselineRevenueUSD: number;
  baselinePayoutsUSD: number;
  baselineProfitUSD: number;
  stressedRevenueUSD: number;
  stressedPayoutsUSD: number;
  stressedProfitUSD: number;
  revenueImpactUSD: number;
  profitImpactUSD: number;
  revenueImpactPercent: number;
  profitImpactPercent: number;
  timeToCashZeroDays: number | null;
  survivalRunwayDays: number;
  recoveryThresholdDays: number | null;
  recommendations: string[];
  simulatedAt: string;
};

type BaselineMetrics = {
  dailyRevenueUSD: number;
  dailyPayoutsUSD: number;
  dailyActiveUsers: number;
  dailyTransactions: number;
  churnRate: number;
  conversionRate: number;
  currentCashUSD: number;
};

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

const PREDEFINED_SCENARIOS: FinancialScenario[] = [
  {
    id: 'traffic_drop_30',
    name: 'Traffic Drop -30%',
    trafficMultiplier: 0.7,
    churnMultiplier: 1.0,
    payoutMultiplier: 1.0,
    durationDays: 30,
  },
  {
    id: 'churn_spike_40',
    name: 'Churn Spike +40%',
    trafficMultiplier: 1.0,
    churnMultiplier: 1.4,
    payoutMultiplier: 1.0,
    durationDays: 30,
  },
  {
    id: 'payout_surge_25',
    name: 'Payout Surge +25%',
    trafficMultiplier: 1.0,
    churnMultiplier: 1.0,
    payoutMultiplier: 1.25,
    durationDays: 30,
  },
  {
    id: 'refund_wave',
    name: 'High Refund Wave',
    trafficMultiplier: 1.0,
    churnMultiplier: 1.2,
    payoutMultiplier: 1.15,
    durationDays: 14,
  },
  {
    id: 'viral_growth',
    name: 'Viral Growth Spike +200%',
    trafficMultiplier: 3.0,
    churnMultiplier: 1.3, // New users churn more
    payoutMultiplier: 0.9, // Lower payout ratio initially
    durationDays: 14,
  },
  {
    id: 'perfect_storm',
    name: 'Perfect Storm (All Negative)',
    trafficMultiplier: 0.6,
    churnMultiplier: 1.5,
    payoutMultiplier: 1.3,
    durationDays: 60,
  },
  {
    id: 'market_crash',
    name: 'Market Crash -50%',
    trafficMultiplier: 0.5,
    churnMultiplier: 1.6,
    payoutMultiplier: 1.2,
    durationDays: 90,
  },
  {
    id: 'competitor_attack',
    name: 'Aggressive Competitor',
    trafficMultiplier: 0.75,
    churnMultiplier: 1.35,
    payoutMultiplier: 1.1,
    durationDays: 45,
  },
];

// ============================================================================
// STRESS SCENARIO ENGINE
// ============================================================================

class StressScenarioEngine {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Run stress scenario simulation
   */
  async runScenario(scenarioId: string): Promise<ScenarioResult> {
    console.log(`[PACK 358] Running stress scenario: ${scenarioId}`);

    // Get scenario definition
    const scenario = PREDEFINED_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    // Get baseline metrics
    const baseline = await this.getBaselineMetrics();

    // Simulate stressed conditions
    const stressed = this.simulateStress(baseline, scenario);

    // Calculate impacts
    const result = this.calculateImpacts(baseline, stressed, scenario);

    // Save result
    await this.saveScenarioResult(result);

    return result;
  }

  /**
   * Run all predefined scenarios
   */
  async runAllScenarios(): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of PREDEFINED_SCENARIOS) {
      try {
        const result = await this.runScenario(scenario.id);
        results.push(result);
      } catch (error) {
        console.error(`[PACK 358] Error running scenario ${scenario.id}:`, error);
      }
    }

    // Generate summary report
    await this.generateStressSummary(results);

    return results;
  }

  /**
   * Get baseline metrics from current state
   */
  private async getBaselineMetrics(): Promise<BaselineMetrics> {
    // Get recent revenue data (last 7 days average)
    const last7Days = await this.getLast7DaysMetrics();
    
    // Get current cash position
    const cashDoc = await this.db
      .collection('finance')
      .doc('cash')
      .get();

    const currentCash = cashDoc.exists ? cashDoc.data()!.balanceUSD || 100000 : 100000;

    return {
      dailyRevenueUSD: last7Days.avgRevenue,
      dailyPayoutsUSD: last7Days.avgPayouts,
      dailyActiveUsers: last7Days.avgActiveUsers,
      dailyTransactions: last7Days.avgTransactions,
      churnRate: last7Days.churnRate,
      conversionRate: last7Days.conversionRate,
      currentCashUSD: currentCash,
    };
  }

  /**
   * Get last 7 days metrics
   */
  private async getLast7DaysMetrics(): Promise<{
    avgRevenue: number;
    avgPayouts: number;
    avgActiveUsers: number;
    avgTransactions: number;
    churnRate: number;
    conversionRate: number;
  }> {
    const days = 7;
    let totalRevenue = 0;
    let totalPayouts = 0;
    let totalUsers = 0;
    let totalTransactions = 0;
    let count = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayDoc = await this.db
        .collection('analytics')
        .doc('daily')
        .collection('revenue')
        .doc(dateStr)
        .get();

      if (dayDoc.exists) {
        const data = dayDoc.data()!;
        totalRevenue += data.revenueUSD || 0;
        totalPayouts += data.payoutsUSD || 0;
        totalUsers += data.activeUsers || 0;
        totalTransactions += data.transactions || 0;
        count++;
      }
    }

    // Get retention metrics
    const retentionDoc = await this.db
      .collection('analytics')
      .doc('current')
      .collection('retention')
      .doc('metrics')
      .get();

    const churnRate = retentionDoc.exists ? retentionDoc.data()!.dailyChurnRate || 0.02 : 0.02;

    // Get conversion rate
    const conversionDoc = await this.db
      .collection('analytics')
      .doc('current')
      .collection('kpi')
      .doc('conversion')
      .get();

    const conversionRate = conversionDoc.exists ? conversionDoc.data()!.installToPayRate || 0.03 : 0.03;

    console.log('Scheduled job result:', {
      avgRevenue: count > 0 ? totalRevenue / count : 1000,
      avgPayouts: count > 0 ? totalPayouts / count : 700,
      avgActiveUsers: count > 0 ? totalUsers / count : 500,
      avgTransactions: count > 0 ? totalTransactions / count : 50,
      churnRate,
      conversionRate,
    });


    return;
  }

  /**
   * Simulate stressed conditions
   */
  private simulateStress(
    baseline: BaselineMetrics,
    scenario: FinancialScenario
  ): {
    dailyRevenueUSD: number;
    dailyPayoutsUSD: number;
    totalRevenueUSD: number;
    totalPayoutsUSD: number;
  } {
    // Calculate daily stressed metrics
    let stressedRevenue = baseline.dailyRevenueUSD * scenario.trafficMultiplier;
    
    // Churn affects revenue negatively
    const churnImpact = 1 - ((scenario.churnMultiplier - 1) * 0.5); // 50% direct impact
    stressedRevenue *= churnImpact;

    // Calculate stressed payouts
    let stressedPayouts = baseline.dailyPayoutsUSD * scenario.payoutMultiplier;
    
    // Payouts also affected by traffic
    stressedPayouts *= scenario.trafficMultiplier;

    // Calculate total over duration
    const totalRevenue = stressedRevenue * scenario.durationDays;
    const totalPayouts = stressedPayouts * scenario.durationDays;

    console.log('Scheduled job result:', {
      dailyRevenueUSD: stressedRevenue,
      dailyPayoutsUSD: stressedPayouts,
      totalRevenueUSD: totalRevenue,
      totalPayoutsUSD: totalPayouts,
    });


    return;
  }

  /**
   * Calculate impacts and generate result
   */
  private calculateImpacts(
    baseline: BaselineMetrics,
    stressed: {
      dailyRevenueUSD: number;
      dailyPayoutsUSD: number;
      totalRevenueUSD: number;
      totalPayoutsUSD: number;
    },
    scenario: FinancialScenario
  ): ScenarioResult {
    // Baseline totals
    const baselineRevenue = baseline.dailyRevenueUSD * scenario.durationDays;
    const baselinePayouts = baseline.dailyPayoutsUSD * scenario.durationDays;
    const baselineProfit = baselineRevenue - baselinePayouts;

    // Stressed totals
    const stressedProfit = stressed.totalRevenueUSD - stressed.totalPayoutsUSD;

    // Impacts
    const revenueImpact = stressed.totalRevenueUSD - baselineRevenue;
    const profitImpact = stressedProfit - baselineProfit;
    const revenueImpactPercent = baselineRevenue > 0 ? (revenueImpact / baselineRevenue) * 100 : 0;
    const profitImpactPercent = baselineProfit > 0 ? (profitImpact / baselineProfit) * 100 : 0;

    // Calculate time to cash zero
    const dailyProfitDiff = stressed.dailyRevenueUSD - stressed.dailyPayoutsUSD;
    const timeToCashZero = dailyProfitDiff < 0 
      ? Math.floor(baseline.currentCashUSD / Math.abs(dailyProfitDiff))
      : null;

    // Calculate survival runway
    const survivalRunway = this.calculateSurvivalRunway(
      baseline.currentCashUSD,
      stressed.dailyRevenueUSD,
      stressed.dailyPayoutsUSD
    );

    // Calculate recovery threshold (days to return to baseline)
    const recoveryThreshold = this.calculateRecoveryThreshold(
      baseline,
      stressed,
      scenario
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      scenario,
      timeToCashZero,
      survivalRunway,
      profitImpactPercent
    );

    console.log('Scheduled job result:', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      baselineRevenueUSD: Math.round(baselineRevenue * 100) / 100,
      baselinePayoutsUSD: Math.round(baselinePayouts * 100) / 100,
      baselineProfitUSD: Math.round(baselineProfit * 100) / 100,
      stressedRevenueUSD: Math.round(stressed.totalRevenueUSD * 100) / 100,
      stressedPayoutsUSD: Math.round(stressed.totalPayoutsUSD * 100) / 100,
      stressedProfitUSD: Math.round(stressedProfit * 100) / 100,
      revenueImpactUSD: Math.round(revenueImpact * 100) / 100,
      profitImpactUSD: Math.round(profitImpact * 100) / 100,
      revenueImpactPercent: Math.round(revenueImpactPercent * 100) / 100,
      profitImpactPercent: Math.round(profitImpactPercent * 100) / 100,
      timeToCashZeroDays: timeToCashZero,
      survivalRunwayDays: survivalRunway,
      recoveryThresholdDays: recoveryThreshold,
      recommendations,
      simulatedAt: new Date().toISOString(),
    });


    return;
  }

  /**
   * Calculate survival runway
   */
  private calculateSurvivalRunway(
    currentCash: number,
    dailyRevenue: number,
    dailyPayouts: number
  ): number {
    const dailyBurn = dailyPayouts - dailyRevenue; // Net burn
    
    if (dailyBurn <= 0) {
      return Infinity; // Profitable, infinite runway
    }

    // Add fixed costs (estimate 10% of revenue as operating costs)
    const dailyOperatingCosts = dailyRevenue * 0.1;
    const totalDailyBurn = dailyBurn + dailyOperatingCosts;

    return Math.floor(currentCash / totalDailyBurn);
  }

  /**
   * Calculate days to recovery
   */
  private calculateRecoveryThreshold(
    baseline: BaselineMetrics,
    stressed: any,
    scenario: FinancialScenario
  ): number | null {
    const profitDiff = (baseline.dailyRevenueUSD - baseline.dailyPayoutsUSD) - 
                       (stressed.dailyRevenueUSD - stressed.dailyPayoutsUSD);
    
    if (profitDiff <= 0) {
      return; // No recovery needed
    }

    // Assume 5% daily recovery rate
    const recoveryRate = 0.05;
    const daysToRecover = Math.ceil(scenario.durationDays * (1 / recoveryRate));

    return daysToRecover;
  }

  /**
   * Generate recommendations based on scenario
   */
  private generateRecommendations(
    scenario: FinancialScenario,
    timeToCashZero: number | null,
    survivalRunway: number,
    profitImpact: number
  ): string[] {
    const recommendations: string[] = [];

    // Critical runway warning
    if (timeToCashZero !== null && timeToCashZero < 90) {
      recommendations.push('CRITICAL: Seek immediate funding or bridge loan');
      recommendations.push('Reduce all non-essential spending immediately');
    }

    if (survivalRunway < 120) {
      recommendations.push('HIGH PRIORITY: Extend runway to 180+ days');
    }

    // Scenario-specific recommendations
    if (scenario.trafficMultiplier < 1) {
      recommendations.push('Increase marketing spend to recover traffic');
      recommendations.push('Analyze traffic drop causes and address immediately');
      recommendations.push('Consider promotional campaigns or partnerships');
    }

    if (scenario.churnMultiplier > 1) {
      recommendations.push('Implement retention campaigns for at-risk users');
      recommendations.push('Analyze churn reasons via user surveys');
      recommendations.push('Increase engagement features and notifications');
    }

    if (scenario.payoutMultiplier > 1) {
      recommendations.push('Review payout structure and consider adjustments');
      recommendations.push('Negotiate better terms with high-volume earners');
      recommendations.push('Optimize revenue sharing thresholds');
    }

    if (profitImpact < -50) {
      recommendations.push('Consider emergency cost reduction measures');
      recommendations.push('Pause non-critical feature development');
      recommendations.push('Focus on profitability over growth');
    }

    // Always include monitoring recommendation
    recommendations.push('Monitor metrics daily during stress period');

    return recommendations;
  }

  /**
   * Save scenario result
   */
  private async saveScenarioResult(result: ScenarioResult): Promise<void> {
    await this.db
      .collection('finance')
      .doc('scenarios')
      .collection('results')
      .doc(result.scenarioId)
      .set({
        ...result,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Save to history
    await this.db
      .collection('finance')
      .doc('scenarios')
      .collection('history')
      .add({
        ...result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Generate stress test summary
   */
  private async generateStressSummary(results: ScenarioResult[]): Promise<void> {
    const worstCase = results.reduce((worst, r) => 
      r.profitImpactPercent < worst.profitImpactPercent ? r : worst
    );

    const bestCase = results.reduce((best, r) => 
      r.profitImpactPercent > best.profitImpactPercent ? r : best
    );

    const avgImpact = results.reduce((sum, r) => sum + r.profitImpactPercent, 0) / results.length;

    const criticalScenarios = results.filter(r => r.survivalRunwayDays < 120);

    const summary = {
      totalScenariosRun: results.length,
      worstCaseScenario: worstCase.scenarioName,
      worstCaseImpact: worstCase.profitImpactPercent,
      bestCaseScenario: bestCase.scenarioName,
      bestCaseImpact: bestCase.profitImpactPercent,
      avgProfitImpact: Math.round(avgImpact * 100) / 100,
      criticalScenariosCount: criticalScenarios.length,
      criticalScenarios: criticalScenarios.map(s => s.scenarioName),
      generatedAt: new Date().toISOString(),
    };

    await this.db
      .collection('finance')
      .doc('scenarios')
      .set({
        summary,
        results,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Create alerts for critical scenarios
    if (criticalScenarios.length > 0) {
      await this.createStressAlert(criticalScenarios);
    }
  }

  /**
   * Create alert for critical stress scenarios
   */
  private async createStressAlert(criticalScenarios: ScenarioResult[]): Promise<void> {
    await this.db
      .collection('finance')
      .doc('alerts')
      .collection('active')
      .add({
        type: 'CRITICAL_STRESS_SCENARIOS',
        severity: 'high',
        category: 'STRESS_TEST',
        message: `${criticalScenarios.length} scenarios show runway < 120 days`,
        data: {
          criticalCount: criticalScenarios.length,
          scenarios: criticalScenarios.map(s => ({
            name: s.scenarioName,
            runway: s.survivalRunwayDays,
          })),
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false,
      });
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const engine = new StressScenarioEngine();

/**
 * Scheduled function: Run stress scenarios monthly on 5th at 4 AM
 */
export const runMonthlyStressScenarios = onSchedule({ schedule: "0 4 5 * *", timeZone: "USDope/Warsaw", region: "europe-west1" }, async (event) => {
    console.log('[PACK 358] Running monthly stress scenarios');
    
    try {
      const results = await engine.runAllScenarios();
      console.log('[PACK 358] Stress scenarios complete:', {
        scenariosRun: results.length,
        avgImpact: results.reduce((sum, r) => sum + r.profitImpactPercent, 0) / results.length,
      });
      
      console.log('Scheduled job result:', { success: true });

      
      return;
    } catch (error) {
      console.error('[PACK 358] Error running stress scenarios:', error);
      throw error;
    }
  });

/**
 * HTTP function: Run specific scenario (admin only)
 */
export const runStressScenario = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    // Verify admin authentication
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError(
        'permission-denied',
        'Only admins can run stress scenarios'
      );
    }

    const { scenarioId } = data;

    if (!scenarioId) {
      throw new HttpsError(
        'invalid-argument',
        'Scenario ID required'
      );
    }

    try {
      const result = await engine.runScenario(scenarioId);
      return result;
    } catch (error) {
      console.error('[PACK 358] Error running scenario:', error);
      throw new HttpsError('internal', 'Failed to run scenario');
    }
  });

/**
 * HTTP function: Get available scenarios (admin only)
 */
export const getAvailableScenarios = onCall(
  { region: 'europe-west1' },
  async (request) => {
    // Verify admin authentication
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError(
        'permission-denied',
        'Only admins can view scenarios'
      );
    }

    return { scenarios: PREDEFINED_SCENARIOS };
  });

/**
 * HTTP function: Get scenario results (admin only)
 */
export const getScenarioResults = onCall(
  { region: 'europe-west1' },
  async (request) => {
  const data = request.data;
    // Verify admin authentication
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError(
        'permission-denied',
        'Only admins can view scenario results'
      );
    }

    try {
      const db = admin.firestore();
      const doc = await db.collection('finance').doc('scenarios').get();

      if (!doc.exists) {
        throw new HttpsError('not-found', 'No scenario results available');
      }

      return doc.data();
    } catch (error) {
      console.error('[PACK 358] Error fetching scenario results:', error);
      throw new HttpsError('internal', 'Failed to fetch results');
    }
  });























