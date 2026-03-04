/**
 * Moderation Insights — AI-powered moderation analytics.
 */

import type { RealtimeIncident, RealtimeAppeal } from './realtime';

export interface AIInsights {
  summary: string;
  topIssues: string[];
  recommendations: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  generatedAt: Date;
  emergingTrends: string[];
  potentialRisks: string[];
  moderatorRecommendations: string[];
  falsePositives: string[];
}

/**
 * Generate AI insights from incident and appeal data.
 * In production, this would call a Cloud Function with an AI model.
 * For now, returns basic statistical analysis.
 */
export async function generateAIInsights(
  incidents: RealtimeIncident[],
  appeals: RealtimeAppeal[],
): Promise<AIInsights> {
  const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL').length;
  const highCount = incidents.filter((i) => i.severity === 'HIGH').length;
  const openCount = incidents.filter((i) => i.status === 'OPEN').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING').length;

  const riskLevel =
    criticalCount > 5 ? 'HIGH' : criticalCount > 0 || highCount > 10 ? 'MEDIUM' : 'LOW';

  const topIssues: string[] = [];
  if (criticalCount > 0) topIssues.push(`${criticalCount} critical incident(s) require immediate attention`);
  if (openCount > 20) topIssues.push(`${openCount} open incidents in backlog`);
  if (pendingAppeals > 10) topIssues.push(`${pendingAppeals} pending appeals awaiting review`);

  const recommendations: string[] = [];
  if (criticalCount > 0) recommendations.push('Prioritize critical incidents for immediate resolution');
  if (openCount > 20) recommendations.push('Consider increasing moderation capacity');
  if (pendingAppeals > 10) recommendations.push('Review pending appeals to maintain user trust');

  /* ---- Extended fields consumed by analytics dashboard ---- */

  const emergingTrends: string[] = [];
  if (incidents.length > 50) emergingTrends.push('Incident volume is above average — potential spike detected');
  if (highCount > 5) emergingTrends.push(`${highCount} high-severity incidents trending upward`);
  if (pendingAppeals > 5) emergingTrends.push('Appeal submission rate increasing');

  const potentialRisks: string[] = [];
  if (criticalCount > 0) potentialRisks.push(`${criticalCount} critical incident(s) may indicate coordinated abuse`);
  if (openCount > 30) potentialRisks.push('Large backlog may cause delayed enforcement');
  if (pendingAppeals > 15) potentialRisks.push('Unresolved appeals risk user trust erosion');

  const moderatorRecommendations: string[] = [...recommendations];
  if (incidents.length > 100) moderatorRecommendations.push('Consider bulk-action workflow for repetitive low-severity incidents');

  const falsePositives: string[] = [];
  const lowSeverityOpen = incidents.filter((i) => i.severity === 'LOW' && i.status === 'OPEN').length;
  if (lowSeverityOpen > 10) falsePositives.push(`${lowSeverityOpen} low-severity open incidents may be false positives`);

  return {
    summary: `${incidents.length} total incidents, ${openCount} open. ${appeals.length} appeals, ${pendingAppeals} pending.`,
    topIssues,
    recommendations,
    riskLevel,
    generatedAt: new Date(),
    emergingTrends,
    potentialRisks,
    moderatorRecommendations,
    falsePositives,
  };
}
