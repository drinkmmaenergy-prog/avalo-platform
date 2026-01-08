/**
 * PACK 140 — Reputation Dashboard Screen
 * 
 * User-facing reputation insights with transparency
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  getReputationInsights,
  getDimensionDisplayName,
  getDimensionIcon,
  formatReputationChange,
  getChangeColor,
  getProgressBarColor,
  ReputationInsights,
} from "@/services/reputationService";

export default function ReputationDashboard() {
  const [insights, setInsights] = useState<ReputationInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    try {
      const data = await getReputationInsights();
      setInsights(data);
    } catch (error) {
      console.error('Error loading reputation insights:', error);
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading your reputation...</Text>
      </View>
    );
  }

  if (!insights) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load reputation data</Text>
        <TouchableOpacity onPress={loadInsights} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Your Reputation</Text>
        <Text style={styles.subtitle}>
          Based on verified activity, not popularity or appearance
        </Text>
      </View>

      {/* Overall Score */}
      <View style={styles.overallCard}>
        <Text style={styles.overallLabel}>Overall Score</Text>
        <Text style={styles.overallScore}>{Math.round(insights.scores.overall)}</Text>
        <View style={styles.overallProgressContainer}>
          <View
            style={[
              styles.overallProgress,
              {
                width: `${insights.scores.overall}%`,
                backgroundColor: getProgressBarColor(insights.scores.overall),
              },
            ]}
          />
        </View>
        <Text style={styles.overallDescription}>
          Out of 100 • Based on 5 professional dimensions
        </Text>
      </View>

      {/* Dimensions Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dimension Breakdown</Text>
        <Text style={styles.sectionSubtitle}>
          Your score in each professionalism category
        </Text>

        {renderDimension('RELIABILITY', insights.scores.reliability)}
        {renderDimension('COMMUNICATION', insights.scores.communication)}
        {renderDimension('DELIVERY', insights.scores.delivery)}
        {renderDimension('EXPERTISE_VALIDATION', insights.scores.expertiseValidation)}
        {renderDimension('SAFETY_CONSISTENCY', insights.scores.safetyConsistency)}
      </View>

      {/* Recent Changes */}
      {insights.recentChanges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Changes (Last 30 Days)</Text>
          <Text style={styles.sectionSubtitle}>
            Summary of your reputation events
          </Text>

          {insights.recentChanges.map((change, index) => (
            <View key={index} style={styles.changeCard}>
              <View style={styles.changeHeader}>
                <Text style={styles.changeIcon}>
                  {getDimensionIcon(change.dimension)}
                </Text>
                <View style={styles.changeInfo}>
                  <Text style={styles.changeDimension}>
                    {getDimensionDisplayName(change.dimension)}
                  </Text>
                  <Text
                    style={[
                      styles.changeValue,
                      { color: getChangeColor(change.change) },
                    ]}
                  >
                    {formatReputationChange(change.change)}
                  </Text>
                </View>
              </View>
              <Text style={styles.changeReason}>{change.reason}</Text>
              <Text style={styles.changeDate}>
                {new Date(change.date.seconds * 1000).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Improvement Suggestions */}
      {insights.suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to Improve</Text>
          <Text style={styles.sectionSubtitle}>
            Actionable steps to strengthen your reputation
          </Text>

          {insights.suggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionCard}>
              <Text style={styles.suggestionIcon}>💡</Text>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Where It's Visible */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Where Your Reputation Appears</Text>
        <Text style={styles.sectionSubtitle}>
          Your score is only shown in trust-relevant contexts
        </Text>

        <View style={styles.visibilityCard}>
          <Text style={styles.visibilityItem}>✓ Mentorship bookings</Text>
          <Text style={styles.visibilityItem}>✓ Digital product purchases</Text>
          <Text style={styles.visibilityItem}>✓ Paid club memberships</Text>
          <Text style={styles.visibilityItem}>✓ Paid event registrations</Text>
        </View>

        <View style={styles.notVisibleCard}>
          <Text style={styles.notVisibleTitle}>NOT visible in:</Text>
          <Text style={styles.notVisibleItem}>✗ Discovery feed</Text>
          <Text style={styles.notVisibleItem}>✗ Search rankings</Text>
          <Text style={styles.notVisibleItem}>✗ Profile suggestions</Text>
          <Text style={styles.notVisibleItem}>✗ Swipe recommendations</Text>
        </View>
      </View>

      {/* Important Notice */}
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>🛡️ Important Information</Text>
        <Text style={styles.noticeText}>
          • Your reputation is based solely on verified activity and professionalism
        </Text>
        <Text style={styles.noticeText}>
          • It NEVER considers appearance, attractiveness, or popularity
        </Text>
        <Text style={styles.noticeText}>
          • It does NOT affect your discovery ranking or feed visibility
        </Text>
        <Text style={styles.noticeText}>
          • It cannot be bought, boosted, or cleaned through payments
        </Text>
        <Text style={styles.noticeText}>
          • Recovery happens through consistent good behavior over time
        </Text>
      </View>
    </ScrollView>
  );
}

function renderDimension(dimension: string, score: number) {
  return (
    <View style={styles.dimensionCard}>
      <View style={styles.dimensionHeader}>
        <Text style={styles.dimensionIcon}>{getDimensionIcon(dimension)}</Text>
        <View style={styles.dimensionInfo}>
          <Text style={styles.dimensionName}>
            {getDimensionDisplayName(dimension)}
          </Text>
          <Text style={styles.dimensionScore}>{Math.round(score)}/100</Text>
        </View>
      </View>
      <View style={styles.dimensionProgressContainer}>
        <View
          style={[
            styles.dimensionProgress,
            { width: `${score}%`, backgroundColor: getProgressBarColor(score) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  overallCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  overallLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  overallScore: {
    fontSize: 64,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  overallProgressContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  overallProgress: {
    height: '100%',
    borderRadius: 6,
  },
  overallDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  dimensionCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  dimensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dimensionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  dimensionInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dimensionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  dimensionScore: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366F1',
  },
  dimensionProgressContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  dimensionProgress: {
    height: '100%',
    borderRadius: 4,
  },
  changeCard: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  changeIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  changeInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeDimension: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  changeValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  changeReason: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  changeDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  suggestionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  visibilityCard: {
    padding: 16,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  visibilityItem: {
    fontSize: 14,
    color: '#065F46',
    marginBottom: 8,
    lineHeight: 20,
  },
  notVisibleCard: {
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  notVisibleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 8,
  },
  notVisibleItem: {
    fontSize: 14,
    color: '#991B1B',
    marginBottom: 4,
    lineHeight: 20,
  },
  noticeCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 13,
    color: '#1E40AF',
    marginBottom: 8,
    lineHeight: 18,
  },
});
