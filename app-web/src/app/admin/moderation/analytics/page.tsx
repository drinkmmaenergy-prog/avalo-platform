'use client';

import { useState, useEffect } from 'react';
import { useRealtimeIncidents, useRealtimeAppeals } from '@/lib/moderation/realtime';
import { generateAIInsights, AIInsights } from '@/lib/moderation/insights';
import { BarChart, PieChart, LineChart, StatCard, AlertCard } from '../components/Charts';
import { AlertTriangle, TrendingUp, Clock, Shield, Sparkles, Brain } from 'lucide-react';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'ai'>('overview');
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // Fetch real-time data
  const { incidents, loading: incidentsLoading } = useRealtimeIncidents(200);
  const { appeals, loading: appealsLoading } = useRealtimeAppeals(50);

  // Calculate analytics data
  const analyticsData = calculateAnalytics(incidents, appeals);

  // Load AI insights on mount
  useEffect(() => {
    if (activeTab === 'ai' && !aiInsights && !insightsLoading) {
      loadAIInsights();
    }
  }, [activeTab]);

  const loadAIInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);

    try {
      const insights = await generateAIInsights({
        incidents: incidents.slice(0, 200),
        appeals: appeals.slice(0, 50),
        restrictions: [], // Would need to fetch from userModerationStats
      });

      if (insights) {
        setAiInsights(insights);
      } else {
        setInsightsError('AI insights unavailable. OpenAI API key not configured.');
      }
    } catch (error: any) {
      setInsightsError(error.message || 'Failed to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  };

  if (incidentsLoading || appealsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#40E0D0] mx-auto"></div>
          <p className="text-white/70 mt-4">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
        <p className="text-white/70">Comprehensive moderation insights and AI-powered analysis</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-white/10">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            activeTab === 'overview'
              ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Overview
          </div>
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            activeTab === 'ai'
              ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Insights
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          </div>
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Alert Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <AlertCard
              title="CSAM Alerts"
              count={analyticsData.csamCount}
              color="red"
              icon={<Shield className="w-6 h-6" />}
            />
            <AlertCard
              title="Extremism Alerts"
              count={analyticsData.extremismCount}
              color="amber"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
            <AlertCard
              title="Hate Speech Alerts"
              count={analyticsData.hateSpeechCount}
              color="yellow"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Violations by Category */}
            <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">
                Violations by Category (7 days)
              </h3>
              <BarChart data={analyticsData.categoryData} />
            </div>

            {/* Violations by Severity */}
            <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">
                Violations by Severity
              </h3>
              <PieChart data={analyticsData.severityData} />
            </div>
          </div>

          {/* Top 10 Offenders */}
          <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
            <h3 className="text-xl font-bold text-white mb-6">
              Top 10 Offenders (Last 30 Days)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-white/70">User ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Violations</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Severity</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.topOffenders.map((offender, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-[#D4AF37] font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 text-white/80 font-mono text-sm">
                        {offender.userId.slice(0, 12)}...
                      </td>
                      <td className="py-3 px-4 text-white font-bold">{offender.count}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            offender.maxSeverity === 'CRITICAL'
                              ? 'bg-red-500/20 text-red-400'
                              : offender.maxSeverity === 'HIGH'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {offender.maxSeverity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white/60 text-sm">{offender.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Appeals and Resolution Time */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* New Appeals Chart */}
            <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">
                New Appeals (14 days)
              </h3>
              <LineChart data={analyticsData.appealsData} />
            </div>

            {/* Time-to-Resolution */}
            <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">
                Time-to-Resolution (Averages)
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <StatCard
                  title="Average Resolution Time"
                  value={analyticsData.avgResolutionTime}
                  subtitle="Hours to close incident"
                  icon={<Clock className="w-6 h-6" />}
                  color="#40E0D0"
                />
                <StatCard
                  title="Average Appeal Time"
                  value={analyticsData.avgAppealTime}
                  subtitle="Hours to process appeal"
                  icon={<Clock className="w-6 h-6" />}
                  color="#D4AF37"
                />
                <StatCard
                  title="Pending Cases"
                  value={analyticsData.pendingCases}
                  subtitle="Awaiting review"
                  icon={<AlertTriangle className="w-6 h-6" />}
                  color="#FFA500"
                />
              </div>
            </div>
          </div>

          {/* Moderator Productivity Metrics */}
          <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
            <h3 className="text-xl font-bold text-white mb-6">
              Moderator Productivity Metrics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Cases Resolved"
                value={analyticsData.casesResolved}
                subtitle="Last 30 days"
                color="#40E0D0"
              />
              <StatCard
                title="Avg Resolution Time"
                value={`${analyticsData.avgModeratorTime}h`}
                subtitle="Per moderator"
                color="#D4AF37"
              />
              <StatCard
                title="Accepted Appeals"
                value={`${analyticsData.appealAcceptanceRate}%`}
                subtitle="Approval rate"
                color="#4ADE80"
              />
              <StatCard
                title="Actions by Type"
                value={analyticsData.topActionType}
                subtitle="Most common action"
                color="#FF6B6B"
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Insights Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-8">
          {insightsLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#40E0D0] mx-auto"></div>
                <p className="text-white/70 mt-4">Generating AI insights...</p>
              </div>
            </div>
          )}

          {insightsError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-red-400 mb-2">Insights Unavailable</h3>
                  <p className="text-white/80">{insightsError}</p>
                  <p className="text-white/60 text-sm mt-2">
                    To enable AI insights, set the OPENAI_API_KEY environment variable.
                  </p>
                </div>
              </div>
            </div>
          )}

          {aiInsights && !insightsLoading && (
            <>
              {/* Summary */}
              <div className="bg-[#1A1A1A] rounded-xl p-6 border border-[#40E0D0]/30">
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-6 h-6 text-[#40E0D0]" />
                  <h3 className="text-xl font-bold text-white">Summary</h3>
                </div>
                <p className="text-white/80 leading-relaxed">{aiInsights.summary}</p>
                <div className="mt-4 text-xs text-white/50">
                  Generated: {aiInsights.generatedAt.toLocaleString()}
                </div>
              </div>

              {/* Emerging Trends */}
              <div className="bg-[#1A1A1A] rounded-xl p-6 border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-6 h-6 text-[#D4AF37]" />
                  <h3 className="text-xl font-bold text-white">Emerging Trends</h3>
                </div>
                <ul className="space-y-3">
                  {aiInsights.emergingTrends.map((trend, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#D4AF37] mt-2 flex-shrink-0" />
                      <p className="text-white/80">{trend}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Potential Risks */}
              <div className="bg-[#1A1A1A] rounded-xl p-6 border border-red-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                  <h3 className="text-xl font-bold text-white">Potential Risks</h3>
                </div>
                <ul className="space-y-3">
                  {aiInsights.potentialRisks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                      <p className="text-white/80">{risk}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Moderator Recommendations */}
              <div className="bg-[#1A1A1A] rounded-xl p-6 border border-[#40E0D0]/30">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-6 h-6 text-[#40E0D0]" />
                  <h3 className="text-xl font-bold text-white">Moderator Recommendations</h3>
                </div>
                <ul className="space-y-3">
                  {aiInsights.moderatorRecommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded bg-[#40E0D0]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#40E0D0] font-bold text-sm">{idx + 1}</span>
                      </div>
                      <p className="text-white/80">{rec}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Possible False Positives */}
              <div className="bg-[#1A1A1A] rounded-xl p-6 border border-yellow-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-yellow-400" />
                  <h3 className="text-xl font-bold text-white">Possible False Positives</h3>
                </div>
                <ul className="space-y-3">
                  {aiInsights.falsePositives.map((fp, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 mt-2 flex-shrink-0" />
                      <p className="text-white/80">{fp}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Refresh Button */}
              <div className="flex justify-center">
                <button
                  onClick={loadAIInsights}
                  disabled={insightsLoading}
                  className="px-6 py-3 bg-[#40E0D0] text-[#0F0F0F] rounded-lg font-bold hover:bg-[#40E0D0]/90 transition-all duration-200 disabled:opacity-50"
                >
                  Refresh Insights
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Calculate analytics from incidents and appeals
 */
function calculateAnalytics(incidents: any[], appeals: any[]) {
  // Get incidents from last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentIncidents = incidents.filter(
    (inc) => inc.timestamp?.toMillis() > sevenDaysAgo
  );

  // Category distribution
  const categoryCount: Record<string, number> = {};
  recentIncidents.forEach((inc) => {
    const cat = inc.category || 'Unknown';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const categoryData = Object.entries(categoryCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  // Severity distribution
  const severityCount = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  incidents.forEach((inc) => {
    if (inc.severity in severityCount) {
      severityCount[inc.severity as keyof typeof severityCount]++;
    }
  });

  const severityData = [
    { label: 'Critical', value: severityCount.CRITICAL, color: '#FF0000' },
    { label: 'High', value: severityCount.HIGH, color: '#FFA500' },
    { label: 'Medium', value: severityCount.MEDIUM, color: '#FFD700' },
    { label: 'Low', value: severityCount.LOW, color: '#4ADE80' },
  ];

  // Top offenders (last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentViolations = incidents.filter(
    (inc) => inc.timestamp?.toMillis() > thirtyDaysAgo
  );

  const userViolations: Record<string, { count: number; maxSeverity: string }> = {};
  recentViolations.forEach((inc) => {
    const userId = inc.userId || 'unknown';
    if (!userViolations[userId]) {
      userViolations[userId] = { count: 0, maxSeverity: 'LOW' };
    }
    userViolations[userId].count++;

    const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const currentRank = severityRank[userViolations[userId].maxSeverity as keyof typeof severityRank] || 0;
    const newRank = severityRank[inc.severity as keyof typeof severityRank] || 0;
    if (newRank > currentRank) {
      userViolations[userId].maxSeverity = inc.severity;
    }
  });

  const topOffenders = Object.entries(userViolations)
    .map(([userId, data]) => ({
      userId,
      count: data.count,
      maxSeverity: data.maxSeverity,
      status: 'Active',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Appeals over 14 days
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const appealsByDay: Record<string, number> = {};

  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    appealsByDay[key] = 0;
  }

  appeals.forEach((appeal) => {
    const timestamp = appeal.timestamp?.toMillis();
    if (timestamp && timestamp > fourteenDaysAgo) {
      const date = new Date(timestamp);
      const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (key in appealsByDay) {
        appealsByDay[key]++;
      }
    }
  });

  const appealsData = Object.entries(appealsByDay).map(([label, value]) => ({
    label,
    value,
  }));

  // Critical alerts
  const csamCount = recentIncidents.filter((inc) =>
    inc.category?.toLowerCase().includes('csam')
  ).length;
  const extremismCount = recentIncidents.filter((inc) =>
    inc.category?.toLowerCase().includes('extremism')
  ).length;
  const hateSpeechCount = recentIncidents.filter((inc) =>
    inc.category?.toLowerCase().includes('hate')
  ).length;

  // Time calculations (mock data for now)
  const avgResolutionTime = '4.2h';
  const avgAppealTime = '2.8h';
  const pendingCases = incidents.filter((inc) => inc.status === 'pending').length;

  // Moderator metrics (mock data)
  const casesResolved = incidents.filter(
    (inc) => inc.status === 'resolved' && inc.timestamp?.toMillis() > thirtyDaysAgo
  ).length;
  const avgModeratorTime = 5.3;
  const approvedAppeals = appeals.filter((a) => a.status === 'APPROVED').length;
  const appealAcceptanceRate = appeals.length > 0 
    ? Math.round((approvedAppeals / appeals.length) * 100) 
    : 0;
  const topActionType = 'Warning';

  return {
    categoryData,
    severityData,
    topOffenders,
    appealsData,
    csamCount,
    extremismCount,
    hateSpeechCount,
    avgResolutionTime,
    avgAppealTime,
    pendingCases,
    casesResolved,
    avgModeratorTime,
    appealAcceptanceRate,
    topActionType,
  };
}