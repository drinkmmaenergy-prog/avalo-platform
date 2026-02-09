/**
 * Moderation AI Insights — Analytics helper for moderation dashboard.
 *
 * Generates insights from incident and appeal data.
 */

import type { RealtimeIncident, RealtimeAppeal } from './realtime';

export interface AIInsights {
  totalIncidents: number;
  resolvedRate: number;
  avgResolutionTimeHours: number;
  topCategories: Array<{ category: string; count: number }>;
  severityDistribution: Record<string, number>;
  recommendations: string[];
}

/**
 * Generate AI-style insights from moderation data.
 * In production this could call a Cloud Function with real ML analysis.
 */
export function generateAIInsights(
  incidents: RealtimeIncident[],
  appeals: RealtimeAppeal[],
): AIInsights {
  const totalIncidents = incidents.length;
  const resolved = incidents.filter((i) => i.status === 'RESOLVED' || i.status === 'DISMISSED');
  const resolvedRate = totalIncidents > 0 ? resolved.length / totalIncidents : 0;

  // Category counts
  const categoryMap = new Map<string, number>();
  for (const incident of incidents) {
    const cat = incident.category || 'Uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
  }
  const topCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Severity distribution
  const severityDistribution: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const incident of incidents) {
    severityDistribution[incident.severity] = (severityDistribution[incident.severity] ?? 0) + 1;
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (resolvedRate < 0.7) {
    recommendations.push('Resolution rate is below 70%. Consider increasing moderator capacity.');
  }
  if (severityDistribution.CRITICAL > 5) {
    recommendations.push('High number of critical incidents. Review automated escalation rules.');
  }
  if (appeals.filter((a) => a.status === 'PENDING').length > 10) {
    recommendations.push('Pending appeals queue is growing. Prioritize appeal reviews.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Moderation metrics are within normal ranges.');
  }

  return {
    totalIncidents,
    resolvedRate,
    avgResolutionTimeHours: 0, // Would need timestamp pairs for actual calculation
    topCategories,
    severityDistribution,
    recommendations,
  };
}
