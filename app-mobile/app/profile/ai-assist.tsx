/**
 * PACK 291 — AI Assist Dashboard
 * Smart optimization insights for creators
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import type {
  DailySummaryInsight,
  WeeklyOptimization,
  ProfileHealthScore,
  ChatOptimizationSuggestion,
  CalendarInsight,
} from "@/functions/src/types/pack291-ai-assist.types";

const { width } = Dimensions.get('window');

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIAssistDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyInsight, setDailyInsight] = useState<DailySummaryInsight | null>(null);
  const [weeklyTips, setWeeklyTips] = useState<WeeklyOptimization | null>(null);
  const [profileHealth, setProfileHealth] = useState<ProfileHealthScore | null>(null);
  const [chatSuggestions, setChatSuggestions] = useState<ChatOptimizationSuggestion[]>([]);
  const [calendarInsight, setCalendarInsight] = useState<CalendarInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'optimization'>('daily');

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    try {
      setError(null);
      
      const [daily, weekly, health, chat, calendar] = await Promise.all([
        fetchDailyInsights(),
        fetchWeeklyOptimization(),
        fetchProfileHealth(),
        fetchChatOptimization(),
        fetchCalendarOptimization(),
      ]);

      setDailyInsight(daily);
      setWeeklyTips(weekly);
      setProfileHealth(health);
      setChatSuggestions(chat);
      setCalendarInsight(calendar);
    } catch (err: any) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadInsights();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
        <Text style={styles.loadingText}>Analyzing your performance...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadInsights}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Assist</Text>
        <Text style={styles.headerSubtitle}>Smart insights to boost your earnings</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'daily' && styles.activeTab]}
          onPress={() => setActiveTab('daily')}
        >
          <Text style={[styles.tabText, activeTab === 'daily' && styles.activeTabText]}>
            Daily
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'weekly' && styles.activeTab]}
          onPress={() => setActiveTab('weekly')}
        >
          <Text style={[styles.tabText, activeTab === 'weekly' && styles.activeTabText]}>
            Weekly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'optimization' && styles.activeTab]}
          onPress={() => setActiveTab('optimization')}
        >
          <Text style={[styles.tabText, activeTab === 'optimization' && styles.activeTabText]}>
            Tips
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6C5CE7']} />
        }
      >
        {activeTab === 'daily' && dailyInsight && (
          <DailyInsightsView insight={dailyInsight} health={profileHealth} />
        )}
        {activeTab === 'weekly' && weeklyTips && (
          <WeeklyOptimizationView optimization={weeklyTips} />
        )}
        {activeTab === 'optimization' && (
          <OptimizationView
            chatSuggestions={chatSuggestions}
            calendarInsight={calendarInsight}
            health={profileHealth}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// DAILY INSIGHTS VIEW
// ============================================================================

function DailyInsightsView({
  insight,
  health,
}: {
  insight: DailySummaryInsight;
  health: ProfileHealthScore | null;
}) {
  return (
    <View style={styles.content}>
      {/* Summary Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={24} color="#6C5CE7" />
          <Text style={styles.cardTitle}>Today's Insight</Text>
        </View>
        <Text style={styles.summaryText}>{insight.summary}</Text>
      </View>

      {/* Highlights */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Performance Highlights</Text>
        {insight.highlights.map((highlight, index) => (
          <View key={index} style={styles.highlightRow}>
            <View style={styles.highlightLeft}>
              <Text style={styles.highlightMetric}>{highlight.metric}</Text>
              <Text style={styles.highlightValue}>
                {typeof highlight.value === 'number' ? highlight.value.toLocaleString() : highlight.value}
              </Text>
            </View>
            {highlight.change !== undefined && (
              <View style={[styles.trendBadge, getTrendStyle(highlight.trend)]}>
                <Ionicons 
                  name={highlight.trend === 'UP' ? 'arrow-up' : highlight.trend === 'DOWN' ? 'arrow-down' : 'remove'} 
                  size={12} 
                  color="#fff" 
                />
                <Text style={styles.trendText}>{Math.abs(highlight.change).toFixed(1)}%</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Earnings Summary */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Today's Earnings</Text>
        <View style={styles.earningsRow}>
          <Text style={styles.tokensLabel}>Tokens</Text>
          <Text style={styles.tokensValue}>{insight.earningsToday.toLocaleString()}</Text>
        </View>
        <View style={styles.earningsRow}>
          <Text style={styles.fiatLabel}>PLN</Text>
          <Text style={styles.fiatValue}>{insight.earningsTodayPLN.toFixed(2)} zł</Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.statsGrid}>
          <StatItem icon="eye" label="Views" value={insight.profileViews.toString()} />
          <StatItem icon="people" label="New Payers" value={insight.newPayers.toString()} />
          <StatItem icon="star" label="Top Feature" value={insight.topPerformingFeature} />
        </View>
      </View>

      {/* Profile Health */}
      {health && <ProfileHealthCard health={health} />}
    </View>
  );
}

// ============================================================================
// WEEKLY OPTIMIZATION VIEW
// ============================================================================

function WeeklyOptimizationView({ optimization }: { optimization: WeeklyOptimization }) {
  return (
    <View style={styles.content}>
      {/* Performance Summary */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="trending-up" size={24} color="#6C5CE7" />
          <Text style={styles.cardTitle}>Week Summary</Text>
        </View>
        <Text style={styles.summaryText}>{optimization.performanceSummary}</Text>
      </View>

      {/* Optimization Tips */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Optimization Tips</Text>
        {optimization.tips.map((tip, index) => (
          <TipCard key={index} tip={tip} />
        ))}
      </View>

      {/* Best Times */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Best Posting Times</Text>
        <View style={styles.timeChips}>
          {optimization.bestPostingTimes.map((time, index) => (
            <View key={index} style={styles.timeChip}>
              <Ionicons name="time-outline" size={14} color="#6C5CE7" />
              <Text style={styles.timeChipText}>{time}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Peak Chat Hours */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Peak Chat Hours</Text>
        <View style={styles.timeChips}>
          {optimization.peakChatHours.map((time, index) => (
            <View key={index} style={styles.timeChip}>
              <Ionicons name="chatbubbles-outline" size={14} color="#00B894" />
              <Text style={styles.timeChipText}>{time}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// OPTIMIZATION VIEW
// ============================================================================

function OptimizationView({
  chatSuggestions,
  calendarInsight,
  health,
}: {
  chatSuggestions: ChatOptimizationSuggestion[];
  calendarInsight: CalendarInsight | null;
  health: ProfileHealthScore | null;
}) {
  return (
    <View style={styles.content}>
      {/* Chat Optimization */}
      {chatSuggestions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#6C5CE7" />
            <Text style={styles.cardTitle}>Chat Optimization</Text>
          </View>
          {chatSuggestions.map((suggestion, index) => (
            <SuggestionCard key={index} suggestion={suggestion} />
          ))}
        </View>
      )}

      {/* Calendar Optimization */}
      {calendarInsight && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={24} color="#6C5CE7" />
            <Text style={styles.cardTitle}>Calendar Tips</Text>
          </View>
          {calendarInsight.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Ionicons name="checkmark-circle" size={20} color="#00B894" />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
          {calendarInsight.mostBookedHours.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Most Booked Hours</Text>
              <View style={styles.timeChips}>
                {calendarInsight.mostBookedHours.map((time, index) => (
                  <View key={index} style={styles.timeChip}>
                    <Text style={styles.timeChipText}>{time}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* Profile Health */}
      {health && <ProfileHealthCard health={health} />}
    </View>
  );
}

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

function ProfileHealthCard({ health }: { health: ProfileHealthScore }) {
  const getHealthColor = (score: number) => {
    if (score >= 80) return '#00B894';
    if (score >= 60) return '#FDCB6E';
    return '#FF6B6B';
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="fitness" size={24} color="#6C5CE7" />
        <Text style={styles.cardTitle}>Profile Health</Text>
      </View>
      
      {/* Overall Score */}
      <View style={styles.healthScoreContainer}>
        <View style={[styles.healthCircle, { borderColor: getHealthColor(health.overall) }]}>
          <Text style={[styles.healthScore, { color: getHealthColor(health.overall) }]}>
            {health.overall}
          </Text>
          <Text style={styles.healthScoreLabel}>/ 100</Text>
        </View>
      </View>

      {/* Components */}
      <View style={styles.healthComponents}>
        <HealthComponent label="Photos" score={health.components.photoQuality} />
        <HealthComponent label="Activity" score={health.components.activityLevel} />
        <HealthComponent label="Response" score={health.components.responseRate} />
        <HealthComponent label="Verified" score={health.components.verificationStatus} />
      </View>

      {/* Suggestions */}
      {health.suggestions.length > 0 && (
        <>
          <Text style={styles.subsectionTitle}>Suggestions</Text>
          {health.suggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionItem}>
              <Ionicons name="bulb-outline" size={18} color="#FDCB6E" />
              <Text style={styles.suggestionItemText}>{suggestion}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function TipCard({ tip }: { tip: WeeklyOptimization['tips'][0] }) {
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return '#00B894';
      case 'MEDIUM': return '#FDCB6E';
      case 'LOW': return '#74B9FF';
      default: return '#DFE6E9';
    }
  };

  return (
    <View style={styles.tipCard}>
      <View style={styles.tipHeader}>
        <Text style={styles.tipCategory}>{tip.category}</Text>
        <View style={[styles.impactBadge, { backgroundColor: getImpactColor(tip.impact) }]}>
          <Text style={styles.impactText}>{tip.impact}</Text>
        </View>
      </View>
      <Text style={styles.tipText}>{tip.tip}</Text>
      <Text style={styles.tipBasedOn}>Based on: {tip.basedOn}</Text>
    </View>
  );
}

function SuggestionCard({ suggestion }: { suggestion: ChatOptimizationSuggestion }) {
  return (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <Text style={styles.suggestionArea}>{suggestion.area.replace('_', ' ')}</Text>
        <Text style={styles.suggestionImpact}>{suggestion.impact} IMPACT</Text>
      </View>
      <View style={styles.suggestionMetrics}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Current</Text>
          <Text style={styles.metricValue}>{suggestion.current}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color="#B2BEC3" />
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Target</Text>
          <Text style={styles.metricValue}>{suggestion.target}</Text>
        </View>
      </View>
      <Text style={styles.suggestionText}>{suggestion.suggestion}</Text>
    </View>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon as any} size={20} color="#6C5CE7" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function HealthComponent({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return '#00B894';
    if (s >= 60) return '#FDCB6E';
    return '#FF6B6B';
  };

  return (
    <View style={styles.healthComponent}>
      <Text style={styles.healthComponentLabel}>{label}</Text>
      <View style={styles.healthBar}>
        <View style={[styles.healthBarFill, { width: `${score}%`, backgroundColor: getColor(score) }]} />
      </View>
      <Text style={styles.healthComponentScore}>{score}</Text>
    </View>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTrendStyle(trend?: 'UP' | 'DOWN' | 'STABLE') {
  switch (trend) {
    case 'UP': return { backgroundColor: '#00B894' };
    case 'DOWN': return { backgroundColor: '#FF6B6B' };
    default: return { backgroundColor: '#B2BEC3' };
  }
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchDailyInsights(): Promise<DailySummaryInsight | null> {
  try {
    const callable = httpsCallable(functions, 'creator_ai_insights_daily');
    const result = await callable({});
    const data = result.data as any;
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching daily insights:', error);
    return null;
  }
}

async function fetchWeeklyOptimization(): Promise<WeeklyOptimization | null> {
  try {
    const callable = httpsCallable(functions, 'creator_ai_insights_weekly');
    const result = await callable({});
    const data = result.data as any;
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching weekly optimization:', error);
    return null;
  }
}

async function fetchProfileHealth(): Promise<ProfileHealthScore | null> {
  try {
    const callable = httpsCallable(functions, 'creator_ai_profile_health');
    const result = await callable({});
    const data = result.data as any;
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching profile health:', error);
    return null;
  }
}

async function fetchChatOptimization(): Promise<ChatOptimizationSuggestion[]> {
  try {
    const callable = httpsCallable(functions, 'creator_ai_recommendations_chat');
    const result = await callable({});
    const data = result.data as any;
    return data.success ? data.suggestions || [] : [];
  } catch (error) {
    console.error('Error fetching chat optimization:', error);
    return [];
  }
}

async function fetchCalendarOptimization(): Promise<CalendarInsight | null> {
  try {
    const callable = httpsCallable(functions, 'creator_ai_recommendations_calendar');
    const result = await callable({});
    const data = result.data as any;
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching calendar optimization:', error);
    return null;
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#6C5CE7',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#FFF',
    opacity: 0.8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#6C5CE7',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#657786',
  },
  activeTabText: {
    color: '#6C5CE7',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#14171A',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#14171A',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#657786',
    marginTop: 16,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#14171A',
  },
  highlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  highlightLeft: {
    flex: 1,
  },
  highlightMetric: {
    fontSize: 13,
    color: '#657786',
    marginBottom: 4,
  },
  highlightValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#14171A',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tokensLabel: {
    fontSize: 14,
    color: '#657786',
  },
  tokensValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6C5CE7',
  },
  fiatLabel: {
    fontSize: 14,
    color: '#657786',
  },
  fiatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00B894',
  },
  separator: {
    height: 1,
    backgroundColor: '#E1E8ED',
    marginVertical: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#657786',
    marginTop: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#14171A',
    marginTop: 2,
  },
  tipCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  tipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C5CE7',
    textTransform: 'uppercase',
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  impactText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#14171A',
    marginBottom: 4,
  },
  tipBasedOn: {
    fontSize: 11,
    color: '#AAB8C2',
    fontStyle: 'italic',
  },
  timeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  timeChipText: {
    fontSize: 12,
    color: '#14171A',
    fontWeight: '500',
  },
  suggestionCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionArea: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C5CE7',
    textTransform: 'capitalize',
  },
  suggestionImpact: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#00B894',
  },
  suggestionMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricBox: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#657786',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#14171A',
  },
  suggestionText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#14171A',
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#14171A',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  suggestionItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#14171A',
  },
  healthScoreContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  healthCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthScore: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  healthScoreLabel: {
    fontSize: 12,
    color: '#657786',
  },
  healthComponents: {
    marginTop: 16,
  },
  healthComponent: {
    marginBottom: 12,
  },
  healthComponentLabel: {
    fontSize: 12,
    color: '#657786',
    marginBottom: 4,
  },
  healthBar: {
    height: 8,
    backgroundColor: '#F1F3F5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  healthComponentScore: {
    fontSize: 11,
    color: '#657786',
    textAlign: 'right',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#657786',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
