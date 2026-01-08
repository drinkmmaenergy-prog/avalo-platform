/**
 * PACK 450 — Platform Health Score Engine
 * 
 * A single number describing:
 * - Stability
 * - Complexity
 * - Maintenance cost
 * - Risk
 * 
 * Quarterly trends for board/investors
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
export interface PlatformHealthMetrics {
  stability: {
    uptime: number; // %
    errorRate: number; // errors per 1000 requests
    mttr: number; // Mean Time To Recovery (minutes)
    incidentCount: number;
    score: number; // 0-100
  };
  complexity: {
    technicalDebtCount: number;
    architectureViolations: number;
    cyclomaticComplexity: number;
    couplingScore: number;
    score: number; // 0-100
  };
  cost: {
    totalMonthlyCost: number; // USD
    costTrend: 'increasing' | 'stable' | 'decreasing';
    costEfficiency: number; // value per dollar
    wastedCost: number; // USD (low value modules)
    score: number; // 0-100
  };
  risk: {
    securityVulnerabilities : number;
    complianceIssues: number;
    singlePointsOfFailure: number;
    outdatedDependencies: number;
    score: number; // 0-100
  };
  performance: {
    averageResponseTime: number; // ms
    p95ResponseTime: number; // ms
    throughput: number; // requests per minute
    score: number; // 0-100
  };
  maintainability: {
    codeQualityScore: number; // 0-100
    testCoverage: number; // %
    documentationScore: number; // 0-100
    score: number; // 0-100
  };
}

export interface PlatformHealthScore {
  timestamp: Date;
  overallScore: number; // 0-100
  metrics: PlatformHealthMetrics;
  trend: 'improving' | 'stable' | 'declining';
  quarter: string; // e.g., "2026-Q1"
  recommendations: string[];
  criticalIssues: string[];
  executiveSummary: string;
}

/**
 * Calculate platform health score
 */
export const pack450HealthScoreCalculate = functions
  .region('us-central1')
  .pubsub.schedule('0 0 1 */1 *') // First day of every month
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('Calculating platform health score...');

    // Gather metrics from various sources
    const stabilityMetrics = await calculateStabilityMetrics();
    const complexityMetrics = await calculateComplexityMetrics();
    const costMetrics = await calculateCostMetrics();
    const riskMetrics = await calculateRiskMetrics();
    const performanceMetrics = await calculatePerformanceMetrics();
    const maintainabilityMetrics = await calculateMaintainabilityMetrics();

    const metrics: PlatformHealthMetrics = {
      stability: stabilityMetrics,
      complexity: complexityMetrics,
      cost: costMetrics,
      risk: riskMetrics,
      performance: performanceMetrics,
      maintainability: maintainabilityMetrics
    };

    // Calculate overall score (weighted average)
    const overallScore = calculateOverallScore(metrics);

    // Determine trend
    const trend = await determinePlatformTrend(overallScore);

    // Generate recommendations
    const recommendations = generateRecommendations(metrics);

    // Identify critical issues
    const criticalIssues = identifyCriticalIssues(metrics);

    // Generate executive summary
    const executiveSummary = generateExecutiveSummary(overallScore, metrics, trend);

    const healthScore: PlatformHealthScore = {
      timestamp: new Date(),
      overallScore,
      metrics,
      trend,
      quarter: getCurrentQuarter(),
      recommendations,
      criticalIssues,
      executiveSummary
    };

    // Save health score
    await db.collection('platform_health_scores').add(healthScore);

    // Send alert if score is critically low
    if (overallScore < 50) {
      await sendHealthAlert(healthScore);
    }

    console.log(`Platform health score calculated: ${overallScore}/100`);

    return {
      success: true,
      score: overallScore,
      trend
    };
  });

/**
 * Get platform health score report
 */
export const pack450HealthScoreReport = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { timeRange = 'quarterly', format = 'detailed' } = data;

    // Get latest health score
    const latestSnapshot = await db
      .collection('platform_health_scores')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (latestSnapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'No health scores available'
      );
    }

    const latestScore = latestSnapshot.docs[0].data() as PlatformHealthScore;

    // Get historical scores for trend analysis
    const historicalScores = await getHistoricalScores(timeRange);

    // Generate report
    const report = {
      current: latestScore,
      historical: historicalScores,
      trends: analyzeTrends(historicalScores),
      comparison: compareWithPrevious(historicalScores),
      insights: generateInsights(latestScore, historicalScores)
    };

    if (format === 'executive') {
      // Return simplified executive report
      return {
        success: true,
        score: latestScore.overallScore,
        trend: latestScore.trend,
        executiveSummary: latestScore.executiveSummary,
        criticalIssues: latestScore.criticalIssues,
        topRecommendations: latestScore.recommendations.slice(0, 3)
      };
    }

    return {
      success: true,
      report
    };
  });

/**
 * Calculate stability metrics
 */
async function calculateStabilityMetrics(): Promise<PlatformHealthMetrics['stability']> {
  // Get from observability data (PACK 364)
  const observabilityData = await db
    .collection('observability_metrics')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  const data = observabilityData.empty ? {} : observabilityData.docs[0].data();

  const uptime = data.uptime || 99.9;
  const errorRate = data.errorRate || 0.1;
  const mttr = data.mttr || 15;
  const incidentCount = data.incidentCount || 0;

  // Calculate score (0-100)
  let score = 100;
  score -= (100 - uptime) * 10; // Uptime impact
  score -= Math.min(errorRate * 10, 30); // Error rate impact
  score -= Math.min(mttr / 10, 20); // MTTR impact
  score -= Math.min(incidentCount * 5, 20); // Incident count impact

  return {
    uptime,
    errorRate,
    mttr,
    incidentCount,
    score: Math.max(0, score)
  };
}

/**
 * Calculate complexity metrics
 */
async function calculateComplexityMetrics(): Promise<PlatformHealthMetrics['complexity']> {
  // Get technical debt count
  const debtSnapshot = await db
    .collection('technical_debt')
    .where('status', '!=', 'RESOLVED')
    .get();

  // Get architecture violations
  const violationsSnapshot = await db
    .collection('architecture_violations')
    .where('resolvedAt', '==', null)
    .get();

  const technicalDebtCount = debtSnapshot.size;
  const architectureViolations = violationsSnapshot.size;
  const cyclomaticComplexity = 10; // Placeholder
  const couplingScore = 50; // Placeholder

  // Calculate score
  let score = 100;
  score -= Math.min(technicalDebtCount / 2, 30); // Debt impact
  score -= Math.min(architectureViolations * 2, 30); // Violations impact
  score -= Math.min(cyclomaticComplexity, 20); // Complexity impact
  score -= Math.min(couplingScore / 5, 20); // Coupling impact

  return {
    technicalDebtCount,
    architectureViolations,
    cyclomaticComplexity,
    couplingScore,
    score: Math.max(0, score)
  };
}

/**
 * Calculate cost metrics
 */
async function calculateCostMetrics(): Promise<PlatformHealthMetrics['cost']> {
  // Get cost summary
  const costSummarySnapshot = await db
    .collection('cost_value_summary')
    .orderBy('analyzedAt', 'desc')
    .limit(1)
    .get();

  const costSummary = costSummarySnapshot.empty ? {} : costSummarySnapshot.docs[0].data();

  const totalMonthlyCost = costSummary.totalCost || 0;
  const totalValue = costSummary.totalValue || 0;
  const costEfficiency = totalMonthlyCost > 0 ? totalValue / totalMonthlyCost : 0;

  // Get wasted cost (low value high cost modules)
  const wastedCostSnapshot = await db
    .collection('cost_value_analysis')
    .where('classification', '==', 'low_value_high_cost')
    .get();

  const wastedCost = wastedCostSnapshot.docs.reduce(
    (sum, doc) => sum + (doc.data().cost?.totalCost || 0),
    0
  );

  // Determine trend
  const historicalCosts = await getHistoricalCosts();
  const costTrend = determineCostTrend(historicalCosts);

  // Calculate score
  let score = 100;
  score -= Math.min((wastedCost / totalMonthlyCost) * 100, 40); // Waste percentage
  score -= costTrend === 'increasing' ? 20 : 0; // Trend penalty
  score -= Math.min((100 - costEfficiency * 10), 30); // Efficiency impact

  return {
    totalMonthlyCost,
    costTrend,
    costEfficiency,
    wastedCost,
    score: Math.max(0, score)
  };
}

/**
 * Calculate risk metrics
 */
async function calculateRiskMetrics(): Promise<PlatformHealthMetrics['risk']> {
  // Get security vulnerabilities (from PACK 299, 437)
  const securitySnapshot = await db
    .collection('security_vulnerabilities')
    .where('status', '==', 'open')
    .get();

  // Get compliance issues (from PACK 445)
  const complianceSnapshot = await db
    .collection('compliance_issues')
    .where('resolved', '==', false)
    .get();

  const securityVulnerabilities = securitySnapshot.size;
  const complianceIssues = complianceSnapshot.size;
  const singlePointsOfFailure = 0; // Placeholder
  const outdatedDependencies = 0; // Placeholder

  // Calculate score
  let score = 100;
  score -= Math.min(securityVulnerabilities * 5, 40); // Security impact
  score -= Math.min(complianceIssues * 10, 30); // Compliance impact
  score -= Math.min(singlePointsOfFailure * 10, 20); // SPOF impact
  score -= Math.min(outdatedDependencies * 2, 10); // Dependencies impact

  return {
    securityVulnerabilities,
    complianceIssues,
    singlePointsOfFailure,
    outdatedDependencies,
    score: Math.max(0, score)
  };
}

/**
 * Calculate performance metrics
 */
async function calculatePerformanceMetrics(): Promise<PlatformHealthMetrics['performance']> {
  // Get from observability data
  const performanceSnapshot = await db
    .collection('performance_metrics')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  const data = performanceSnapshot.empty ? {} : performanceSnapshot.docs[0].data();

  const averageResponseTime = data.averageResponseTime || 200;
  const p95ResponseTime = data.p95ResponseTime || 500;
  const throughput = data.throughput || 1000;

  // Calculate score
  let score = 100;
  score -= Math.min(averageResponseTime / 20, 30); // Response time impact
  score -= Math.min(p95ResponseTime / 50, 30); // P95 impact
  score += Math.min(throughput / 100, 20); // Throughput bonus (capped)

  return {
    averageResponseTime,
    p95ResponseTime,
    throughput,
    score: Math.min(100, Math.max(0, score))
  };
}

/**
 * Calculate maintainability metrics
 */
async function calculateMaintainabilityMetrics(): Promise<PlatformHealthMetrics['maintainability']> {
  const codeQualityScore = 75; // Placeholder (from code analysis tools)
  const testCoverage = 65; // Placeholder
  const documentationScore = 70; // Placeholder

  const score = (codeQualityScore + testCoverage + documentationScore) / 3;

  return {
    codeQualityScore,
    testCoverage,
    documentationScore,
    score
  };
}

/**
 * Calculate overall score (weighted average)
 */
function calculateOverallScore(metrics: PlatformHealthMetrics): number {
  const weights = {
    stability: 0.25,
    complexity: 0.15,
    cost: 0.15,
    risk: 0.25,
    performance: 0.10,
    maintainability: 0.10
  };

  const score = (
    metrics.stability.score * weights.stability +
    metrics.complexity.score * weights.complexity +
    metrics.cost.score * weights.cost +
    metrics.risk.score * weights.risk +
    metrics.performance.score * weights.performance +
    metrics.maintainability.score * weights.maintainability
  );

  return Math.round(score);
}

/**
 * Determine platform trend
 */
async function determinePlatformTrend(currentScore: number): Promise<'improving' | 'stable' | 'declining'> {
  const historicalScores = await db
    .collection('platform_health_scores')
    .orderBy('timestamp', 'desc')
    .limit(3)
    .get();

  if (historicalScores.size < 2) {
    return 'stable';
  }

  const scores = historicalScores.docs.map(doc => doc.data().overallScore as number);
  const averagePrevious = scores.slice(1).reduce((a, b) => a + b, 0) / (scores.length - 1);

  const change = currentScore - averagePrevious;

  if (change > 5) return 'improving';
  if (change < -5) return 'declining';
  return 'stable';
}

/**
 * Generate recommendations
 */
function generateRecommendations(metrics: PlatformHealthMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.stability.score < 70) {
    recommendations.push('Improve platform stability: address high error rates and reduce MTTR');
  }
  if (metrics.complexity.score < 60) {
    recommendations.push('Reduce technical debt and resolve architecture violations');
  }
  if (metrics.cost.score < 60) {
    recommendations.push('Optimize costs by addressing low-value high-cost modules');
  }
  if (metrics.risk.score < 70) {
    recommendations.push('Address security vulnerabilities and compliance issues urgently');
  }
  if (metrics.performance.score < 70) {
    recommendations.push('Improve performance: reduce response times and increase throughput');
  }
  if (metrics.maintainability.score < 70) {
    recommendations.push('Improve code quality, test coverage, and documentation');
  }

  return recommendations;
}

/**
 * Identify critical issues
 */
function identifyCriticalIssues(metrics: PlatformHealthMetrics): string[] {
  const issues: string[] = [];

  if (metrics.stability.uptime < 99.5) {
    issues.push(`Critical: Platform uptime below threshold (${metrics.stability.uptime}%)`);
  }
  if (metrics.risk.securityVulnerabilities > 10) {
    issues.push(`Critical: ${metrics.risk.securityVulnerabilities} open security vulnerabilities`);
  }
  if (metrics.risk.complianceIssues > 0) {
    issues.push(`Critical: ${metrics.risk.complianceIssues} compliance issues require immediate attention`);
  }
  if (metrics.complexity.architectureViolations > 20) {
    issues.push(`Warning: ${metrics.complexity.architectureViolations} architecture violations detected`);
  }

  return issues;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(
  score: number,
  metrics: PlatformHealthMetrics,
  trend: string
): string {
  let summary = `Platform Health Score: ${score}/100 (${trend}). `;

  if (score >= 80) {
    summary += 'Platform is in excellent health with strong stability and performance. ';
  } else if (score >= 60) {
    summary += 'Platform is generally healthy but requires attention in some areas. ';
  } else if (score >= 40) {
    summary += 'Platform health is concerning and requires immediate action. ';
  } else {
    summary += 'Platform health is critical and requires urgent intervention. ';
  }

  const weakest = Object.entries(metrics)
    .sort((a, b) => (a[1] as any).score - (b[1] as any).score)[0];

  summary += `Primary concern: ${weakest[0]} (score: ${(weakest[1] as any).score}/100).`;

  return summary;
}

/**
 * Get historical scores
 */
async function getHistoricalScores(timeRange: string): Promise<PlatformHealthScore[]> {
  let limit = 4; // Default: last 4 months

  if (timeRange === 'quarterly') {
    limit = 4; // Last quarter
  } else if (timeRange === 'yearly') {
    limit = 12; // Last year
  }

  const snapshot = await db
    .collection('platform_health_scores')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as PlatformHealthScore);
}

/**
 * Get historical costs
 */
async function getHistoricalCosts(): Promise<number[]> {
  const snapshot = await db
    .collection('cost_value_summary')
    .orderBy('analyzedAt', 'desc')
    .limit(3)
    .get();

  return snapshot.docs.map(doc => doc.data().totalCost || 0);
}

/**
 * Determine cost trend
 */
function determineCostTrend(costs: number[]): 'increasing' | 'stable' | 'decreasing' {
  if (costs.length < 2) return 'stable';

  const recent = costs.slice(0, Math.ceil(costs.length / 2));
  const older = costs.slice(Math.ceil(costs.length / 2));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

/**
 * Analyze trends
 */
function analyzeTrends(scores: PlatformHealthScore[]): any {
  if (scores.length < 2) {
    return { message: 'Insufficient data for trend analysis' };
  }

  const overallScores = scores.map(s => s.overallScore);
  const stabilityScores = scores.map(s => s.metrics.stability.score);
  const riskScores = scores.map(s => s.metrics.risk.score);

  return {
    overall: calculateTrendDirection(overallScores),
    stability: calculateTrendDirection(stabilityScores),
    risk: calculateTrendDirection(riskScores)
  };
}

/**
 * Calculate trend direction
 */
function calculateTrendDirection(values: number[]): string {
  if (values.length < 2) return 'stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = secondAvg - firstAvg;

  if (change > 5) return 'improving';
  if (change < -5) return 'declining';
  return 'stable';
}

/**
 * Compare with previous
 */
function compareWithPrevious(scores: PlatformHealthScore[]): any {
  if (scores.length < 2) {
    return { message: 'No previous score for comparison' };
  }

  const current = scores[0];
  const previous = scores[1];

  return {
    scoreDifference: current.overallScore - previous.overallScore,
    stabilityChange: current.metrics.stability.score - previous.metrics.stability.score,
    complexityChange: current.metrics.complexity.score - previous.metrics.complexity.score,
    costChange: current.metrics.cost.score - previous.metrics.cost.score,
    riskChange: current.metrics.risk.score - previous.metrics.risk.score
  };
}

/**
 * Generate insights
 */
function generateInsights(current: PlatformHealthScore, historical: PlatformHealthScore[]): string[] {
  const insights: string[] = [];

  if (current.trend === 'improving') {
    insights.push('Platform health is improving - continue current strategies');
  } else if (current.trend === 'declining') {
    insights.push('Platform health is declining - immediate action required');
  }

  if (current.criticalIssues.length > 0) {
    insights.push(`${current.criticalIssues.length} critical issues require immediate attention`);
  }

  return insights;
}

/**
 * Get current quarter
 */
function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

/**
 * Send health alert
 */
async function sendHealthAlert(healthScore: PlatformHealthScore): Promise<void> {
  await db.collection('notifications').add({
    type: 'PLATFORM_HEALTH_ALERT',
    severity: 'CRITICAL',
    title: 'Platform Health Score Critical',
    message: `Platform health score has fallen to ${healthScore.overallScore}/100`,
    data: {
      score: healthScore.overallScore,
      trend: healthScore.trend,
      criticalIssues: healthScore.criticalIssues,
      recommendations: healthScore.recommendations
    },
    createdAt: new Date(),
    requiresAction: true
  });
}
