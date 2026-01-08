/**
 * Creator Dashboard
 * Private dashboard for creators showing their rankings, predictions, and suggestions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useAuth } from "@/contexts/AuthContext";
import * as rankingService from "@/services/rankingService";
import type { CreatorDashboard } from "@/services/rankingService";

const { width } = Dimensions.get('window');

export default function CreatorDashboardScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const data = await rankingService.getCreatorDashboard(user.uid);
      setDashboard(data);
    } catch (error) {
      // Error loading dashboard
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Ranking Data</Text>
        <Text style={styles.emptyText}>
          Start earning to appear on the leaderboard
        </Text>
      </View>
    );
  }

  const renderRankCard = (title: string, rank: number | null, points: number) => (
    <View style={styles.rankCard}>
      <Text style={styles.rankCardTitle}>{title}</Text>
      <Text style={styles.rankCardRank}>
        {rankingService.getRankDisplayText(rank)}
      </Text>
      <Text style={styles.rankCardPoints}>
        {rankingService.formatPoints(points)} points
      </Text>
    </View>
  );

  const renderPredictionCard = (
    title: string,
    change: number,
    icon: string
  ) => {
    const isPositive = change > 0;
    const isNegative = change < 0;
    
    return (
      <View style={styles.predictionCard}>
        <Text style={styles.predictionIcon}>{icon}</Text>
        <Text style={styles.predictionTitle}>{title}</Text>
        <Text
          style={[
            styles.predictionValue,
            isPositive && styles.predictionPositive,
            isNegative && styles.predictionNegative,
          ]}
        >
          {change > 0 ? '+' : ''}{change}
        </Text>
      </View>
    );
  };

  const renderSuggestionCard = (suggestion: string, index: number) => (
    <View key={index} style={styles.suggestionCard}>
      <Text style={styles.suggestionIcon}>💡</Text>
      <Text style={styles.suggestionText}>{suggestion}</Text>
    </View>
  );

  const renderMilestone = (milestone: any, index: number) => (
    <View key={index} style={styles.milestoneCard}>
      <Text style={styles.milestoneIcon}>{milestone.icon}</Text>
      <View style={styles.milestoneInfo}>
        <Text style={styles.milestoneTitle}>{milestone.title}</Text>
        <Text style={styles.milestoneDescription}>{milestone.description}</Text>
        <Text style={styles.milestoneDate}>
          {new Date(milestone.achievedAt).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📊 Your Dashboard</Text>
        {dashboard.hasTop10Bonus && (
          <View style={styles.bonusBanner}>
            <Text style={styles.bonusText}>
              ⚡ TOP 10 BONUS ACTIVE
            </Text>
            <Text style={styles.bonusSubtext}>
              +15% visibility, match & feed priority
            </Text>
          </View>
        )}
      </View>

      {/* Current Rankings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Rankings</Text>
        
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ranksRow}
        >
          {renderRankCard(
            'Today (Global)',
            dashboard.rankings.daily.worldwide,
            dashboard.points.daily
          )}
          {renderRankCard(
            'This Week',
            dashboard.rankings.weekly.worldwide,
            dashboard.points.weekly
          )}
          {renderRankCard(
            'This Month',
            dashboard.rankings.monthly.worldwide,
            dashboard.points.monthly
          )}
          {renderRankCard(
            'All Time',
            dashboard.rankings.lifetime.worldwide,
            dashboard.points.lifetime
          )}
        </ScrollView>
      </View>

      {/* Category Rankings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Category Rankings</Text>
        
        <View style={styles.categoryGrid}>
          <View style={styles.categoryCard}>
            <Text style={styles.categoryIcon}>📹</Text>
            <Text style={styles.categoryLabel}>Video</Text>
            <Text style={styles.categoryRank}>
              {rankingService.getRankDisplayText(dashboard.categoryRankings.video)}
            </Text>
          </View>
          
          <View style={styles.categoryCard}>
            <Text style={styles.categoryIcon}>💬</Text>
            <Text style={styles.categoryLabel}>Chat</Text>
            <Text style={styles.categoryRank}>
              {rankingService.getRankDisplayText(dashboard.categoryRankings.chat)}
            </Text>
          </View>
          
          <View style={styles.categoryCard}>
            <Text style={styles.categoryIcon}>💰</Text>
            <Text style={styles.categoryLabel}>Tips</Text>
            <Text style={styles.categoryRank}>
              {rankingService.getRankDisplayText(dashboard.categoryRankings.tips)}
            </Text>
          </View>
          
          <View style={styles.categoryCard}>
            <Text style={styles.categoryIcon}>🎨</Text>
            <Text style={styles.categoryLabel}>Content</Text>
            <Text style={styles.categoryRank}>
              {rankingService.getRankDisplayText(dashboard.categoryRankings.content)}
            </Text>
          </View>
        </View>
      </View>

      {/* Predictions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Position Predictions</Text>
        
        <View style={styles.predictionsGrid}>
          {renderPredictionCard(
            'Daily',
            dashboard.predictions.dailyPositionChange,
            '📅'
          )}
          {renderPredictionCard(
            'Weekly',
            dashboard.predictions.weeklyPositionChange,
            '📊'
          )}
          {renderPredictionCard(
            'Monthly',
            dashboard.predictions.monthlyPositionChange,
            '📈'
          )}
        </View>
        
        <View style={styles.pointsNeededCard}>
          <Text style={styles.pointsNeededText}>
            {dashboard.predictions.pointsNeededForNextRank} points to next rank
          </Text>
        </View>
      </View>

      {/* Action Suggestions */}
      {dashboard.suggestions && dashboard.suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested Actions</Text>
          {dashboard.suggestions.map(renderSuggestionCard)}
        </View>
      )}

      {/* Milestones */}
      {dashboard.milestones && dashboard.milestones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Milestones Achieved</Text>
          {dashboard.milestones.map(renderMilestone)}
        </View>
      )}

      {/* Improvement Timeline */}
      {dashboard.improvementTimeline && dashboard.improvementTimeline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>30-Day Progress</Text>
          <View style={styles.timelineContainer}>
            {dashboard.improvementTimeline.map((point, index) => (
              <View key={index} style={styles.timelinePoint}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineRank}>
                    #{point.rank}
                  </Text>
                  <Text style={styles.timelineDate}>
                    {new Date(point.date).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FF6B6B',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  bonusBanner: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FCD34D',
    borderRadius: 12,
  },
  bonusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
  },
  bonusSubtext: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 4,
    opacity: 0.8,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  ranksRow: {
    gap: 12,
  },
  rankCard: {
    width: width * 0.4,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rankCardTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  rankCardRank: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  rankCardPoints: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (width - 52) / 2,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  categoryRank: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  predictionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  predictionCard: {
    flex: 1,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  predictionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  predictionTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  predictionValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  predictionPositive: {
    color: '#10B981',
  },
  predictionNegative: {
    color: '#EF4444',
  },
  pointsNeededCard: {
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    alignItems: 'center',
  },
  pointsNeededText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  suggestionCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  milestoneCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  milestoneIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  milestoneDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  milestoneDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  timelineContainer: {
    paddingLeft: 20,
  },
  timelinePoint: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF6B6B',
    marginRight: 12,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineRank: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  timelineDate: {
    fontSize: 12,
    color: '#6B7280',
  },
});
