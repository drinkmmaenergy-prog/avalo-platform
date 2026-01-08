/**
 * PACK 257 — Creator Analytics Dashboard
 * Comprehensive analytics dashboard for creators
 * Revenue, Engagement, Fan Growth & Optimization Suggestions
 */

import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCompleteDashboard } from "@/hooks/usePack257CreatorDashboard";
import {
  formatTokens,
  formatPercentage,
  getTrendIndicator,
  getTrendColor,
  formatTimeWindow,
  getTierProgressColor,
  getSuggestionTypeIcon,
  getSuggestionPriorityColor,
} from "@/services/pack257-creatorDashboardService";
import { TIER_INFO } from "@/types/pack257-creator-dashboard";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CreatorDashboardScreen() {
  const router = useRouter();
  const {
    dashboard,
    suggestions,
    royalAnalytics,
    isRoyal,
    loading,
    error,
    refreshing,
    refreshAll,
    dismissSuggestion,
    actOnSuggestion,
  } = useCompleteDashboard();

  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  if (loading && !dashboard) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load dashboard</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refreshAll}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No dashboard data available</Text>
      </View>
    );
  }

  const tierInfo = TIER_INFO[dashboard.performanceLevel.currentTier];
  const tierColor = getTierProgressColor(dashboard.performanceLevel.currentTier);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Track performance and grow your earnings
        </Text>
      </View>

      {/* Performance Tier Badge */}
      <View style={[styles.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor }]}>
        <MaterialCommunityIcons
          name={dashboard.performanceLevel.currentTier === 'L6' ? 'crown' : 'trophy'}
          size={24}
          color={tierColor}
        />
        <View style={styles.tierInfo}>
          <Text style={[styles.tierTitle, { color: tierColor }]}>
            {tierInfo.title} Creator
          </Text>
          {dashboard.performanceLevel.nextTier && (
            <View style={styles.tierProgress}>
              <View style={styles.tierProgressBar}>
                <View
                  style={[
                    styles.tierProgressFill,
                    {
                      width: `${dashboard.performanceLevel.currentProgress}%`,
                      backgroundColor: tierColor,
                    },
                  ]}
                />
              </View>
              <Text style={styles.tierProgressText}>
                {dashboard.performanceLevel.currentProgress.toFixed(0)}% to{' '}
                {TIER_INFO[dashboard.performanceLevel.nextTier].title}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Earnings Overview */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="currency-usd" size={20} color="#007AFF" />
          <Text style={styles.sectionTitle}>Earnings Overview</Text>
        </View>

        <View style={styles.earningsGrid}>
          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Total Earned</Text>
            <Text style={styles.earningsValue}>
              {formatTokens(dashboard.earnings.lifetimeTokens)}
            </Text>
            <Text style={styles.earningsSubtext}>lifetime</Text>
          </View>

          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Last 7 Days</Text>
            <Text style={styles.earningsValue}>
              {formatTokens(dashboard.earnings.last7DaysTokens)}
            </Text>
            <View style={styles.trendContainer}>
              <Text
                style={[
                  styles.trendText,
                  { color: getTrendColor(dashboard.earnings.last7DaysTrend) },
                ]}
              >
                {getTrendIndicator(dashboard.earnings.last7DaysTrend)}{' '}
                {formatPercentage(Math.abs(dashboard.earnings.last7DaysTrend))}
              </Text>
            </View>
          </View>

          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Today</Text>
            <Text style={styles.earningsValue}>
              {formatTokens(dashboard.earnings.todayTokens)}
            </Text>
            <Text style={styles.earningsSubtext}>realtime</Text>
          </View>

          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Expected</Text>
            <Text style={styles.earningsValue}>
              {formatTokens(dashboard.earnings.escrowExpected)}
            </Text>
            <Text style={styles.earningsSubtext}>from escrow</Text>
          </View>
        </View>

        {dashboard.earnings.escrowBreakdown.length > 0 && (
          <View style={styles.escrowSection}>
            <Text style={styles.escrowTitle}>Upcoming Events</Text>
            {dashboard.earnings.escrowBreakdown.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.escrowItem}>
                <MaterialCommunityIcons
                  name={
                    item.type === 'calendar_event'
                      ? 'calendar'
                      : item.type === 'scheduled_call'
                      ? 'phone'
                      : 'package-variant'
                  }
                  size={16}
                  color="#666"
                />
                <Text style={styles.escrowItemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.escrowItemValue}>
                  {formatTokens(item.expectedTokens)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* AI Optimization Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="lightbulb-on" size={20} color="#FF9500" />
            <Text style={styles.sectionTitle}>Optimization Tips</Text>
          </View>

          {suggestions.slice(0, 3).map((suggestion) => (
            <View
              key={suggestion.id}
              style={[
                styles.suggestionCard,
                { borderLeftColor: getSuggestionPriorityColor(suggestion.priority) },
              ]}
            >
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionIcon}>
                  {getSuggestionTypeIcon(suggestion.type)}
                </Text>
                <View style={styles.suggestionHeaderText}>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <Text style={styles.suggestionImpact}>
                    {suggestion.expectedImpact}
                  </Text>
                </View>
              </View>
              <Text style={styles.suggestionDescription}>
                {suggestion.description}
              </Text>
              {suggestion.actionable && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity
                    style={styles.suggestionActionButton}
                    onPress={() => actOnSuggestion(suggestion.id)}
                  >
                    <Text style={styles.suggestionActionText}>
                      {suggestion.actionLabel || 'Take Action'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => dismissSuggestion(suggestion.id)}
                    style={styles.suggestionDismiss}
                  >
                    <Text style={styles.suggestionDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Engagement Performance */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={20} color="#34C759" />
          <Text style={styles.sectionTitle}>Engagement</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="eye" size={24} color="#007AFF" />
            <Text style={styles.statValue}>
              {dashboard.engagement.profileViews.last7Days.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Profile Views</Text>
            <Text
              style={[
                styles.statTrend,
                { color: getTrendColor(dashboard.engagement.profileViews.trend) },
              ]}
            >
              {getTrendIndicator(dashboard.engagement.profileViews.trend)}{' '}
              {formatPercentage(Math.abs(dashboard.engagement.profileViews.trend))}
            </Text>
          </View>

          <View style={styles.statCard}>
            <MaterialCommunityIcons name="heart" size={24} color="#FF3B30" />
            <Text style={styles.statValue}>
              {dashboard.engagement.likes.last7Days.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Likes</Text>
            <Text
              style={[
                styles.statTrend,
                { color: getTrendColor(dashboard.engagement.likes.trend) },
              ]}
            >
              {getTrendIndicator(dashboard.engagement.likes.trend)}{' '}
              {formatPercentage(Math.abs(dashboard.engagement.likes.trend))}
            </Text>
          </View>

          <View style={styles.statCard}>
            <MaterialCommunityIcons name="account-plus" size={24} color="#5AC8FA" />
            <Text style={styles.statValue}>
              {dashboard.engagement.newFollowers.last7Days.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>New Followers</Text>
            <Text
              style={[
                styles.statTrend,
                { color: getTrendColor(dashboard.engagement.newFollowers.trend) },
              ]}
            >
              {getTrendIndicator(dashboard.engagement.newFollowers.trend)}{' '}
              {formatPercentage(Math.abs(dashboard.engagement.newFollowers.trend))}
            </Text>
          </View>
        </View>

        {/* Top Viewers with High Intent */}
        {dashboard.engagement.topViewers.length > 0 && (
          <View style={styles.topViewersSection}>
            <Text style={styles.subsectionTitle}>High-Intent Viewers</Text>
            <Text style={styles.subsectionSubtitle}>
              Users who view your profile frequently - consider messaging them
            </Text>
            {dashboard.engagement.topViewers.slice(0, 5).map((viewer, index) => (
              <View key={viewer.id} style={styles.viewerCard}>
                <View style={styles.viewerRank}>
                  <Text style={styles.viewerRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.viewerInfo}>
                  <Text style={styles.viewerName}>
                    {viewer.hasPaidInteraction && viewer.displayName
                      ? viewer.displayName
                      : `Viewer ${index + 1}`}
                  </Text>
                  <Text style={styles.viewerStats}>
                    {viewer.viewCount} views • Intent: {viewer.paidIntentScore}/100
                  </Text>
                </View>
                {viewer.hasPaidInteraction && (
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>💰</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Conversation Analytics */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="message-text" size={20} color="#AF52DE" />
          <Text style={styles.sectionTitle}>Conversation Analytics</Text>
        </View>

        <View style={styles.conversationStats}>
          <View style={styles.conversationRow}>
            <Text style={styles.conversationLabel}>New Chats</Text>
            <Text style={styles.conversationValue}>
              {dashboard.conversations.newChatStarts.last7Days}
            </Text>
          </View>
          <View style={styles.conversationRow}>
            <Text style={styles.conversationLabel}>Paid Chat Conversion</Text>
            <Text style={styles.conversationValue}>
              {dashboard.conversations.paidChats.conversionRate.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.conversationRow}>
            <Text style={styles.conversationLabel}>Avg Replies/Chat</Text>
            <Text style={styles.conversationValue}>
              {dashboard.conversations.averageRepliesPerConvo.toFixed(1)}
            </Text>
          </View>
          <View style={styles.conversationRow}>
            <Text style={styles.conversationLabel}>Response Rate</Text>
            <Text style={styles.conversationValue}>
              {dashboard.conversations.responseRate.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Best Chat Hours */}
        {dashboard.conversations.bestOnlineHours.length > 0 && (
          <View style={styles.bestHoursSection}>
            <Text style={styles.subsectionTitle}>Your Best Hours</Text>
            <Text style={styles.subsectionSubtitle}>
              When you earn the most from conversations
            </Text>
            <View style={styles.bestHoursGrid}>
              {dashboard.conversations.bestOnlineHours.slice(0, 3).map((hour, index) => (
                <View key={index} style={styles.bestHourCard}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color="#007AFF" />
                  <Text style={styles.bestHourText}>{hour}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Media Sales Analytics */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="image-multiple" size={20} color="#FF6B6B" />
          <Text style={styles.sectionTitle}>Media Sales</Text>
        </View>

        <View style={styles.mediaGrid}>
          <View style={styles.mediaCard}>
            <MaterialCommunityIcons name="folder-multiple-image" size={32} color="#4ECDC4" />
            <Text style={styles.mediaValue}>
              {dashboard.mediaSales.albums.soldCount}
            </Text>
            <Text style={styles.mediaLabel}>Albums Sold</Text>
            <Text style={styles.mediaEarnings}>
              {formatTokens(dashboard.mediaSales.albums.tokensEarned)} tokens
            </Text>
          </View>

          <View style={styles.mediaCard}>
            <MaterialCommunityIcons name="video" size={32} color="#FF9500" />
            <Text style={styles.mediaValue}>
              {dashboard.mediaSales.videos.soldCount}
            </Text>
            <Text style={styles.mediaLabel}>Videos Sold</Text>
            <Text style={styles.mediaEarnings}>
              {formatTokens(dashboard.mediaSales.videos.tokensEarned)} tokens
            </Text>
          </View>

          <View style={styles.mediaCard}>
            <MaterialCommunityIcons name="book-open-variant" size={32} color="#5AC8FA" />
            <Text style={styles.mediaValue}>
              {dashboard.mediaSales.storyDrops.soldCount}
            </Text>
            <Text style={styles.mediaLabel}>Story Drops</Text>
            <Text style={styles.mediaEarnings}>
              {formatTokens(dashboard.mediaSales.storyDrops.tokensEarned)} tokens
            </Text>
          </View>
        </View>

        {/* Top Selling Media */}
        {dashboard.mediaSales.topSellingMedia.length > 0 && (
          <View style={styles.topMediaSection}>
            <Text style={styles.subsectionTitle}>Top Sellers</Text>
            {dashboard.mediaSales.topSellingMedia.slice(0, 3).map((media, index) => (
              <View key={media.id} style={styles.topMediaCard}>
                <View style={styles.topMediaRank}>
                  <Text style={styles.topMediaRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.topMediaInfo}>
                  <Text style={styles.topMediaTitle} numberOfLines={1}>
                    {media.title}
                  </Text>
                  <Text style={styles.topMediaStats}>
                    {media.salesCount} sales • {formatTokens(media.tokensEarned)} tokens
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={
                    media.type === 'album'
                      ? 'folder-multiple-image'
                      : media.type === 'video'
                      ? 'video'
                      : 'book-open-variant'
                  }
                  size={24}
                  color="#666"
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Royal Advanced Analytics */}
      {isRoyal && royalAnalytics && (
        <View style={[styles.section, styles.royalSection]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="crown" size={20} color="#FFD700" />
            <Text style={[styles.sectionTitle, { color: '#FFD700' }]}>
              Royal Analytics
            </Text>
          </View>

          <TouchableOpacity
            style={styles.royalCard}
            onPress={() => router.push('/profile/royal-analytics' as any)}
          >
            <Text style={styles.royalCardTitle}>Advanced Insights Available</Text>
            <Text style={styles.royalCardDescription}>
              Top spenders, conversion funnels, deep chat analysis & more
            </Text>
            <View style={styles.royalCardAction}>
              <Text style={styles.royalCardActionText}>View Details</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#FFD700" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Last updated: {new Date(dashboard.lastUpdated).toLocaleString()}
        </Text>
        <Text style={styles.footerNote}>
          Analytics update daily. Earnings shown are creator share (after platform fee).
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666',
  },
  tierBadge: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierInfo: {
    marginLeft: 12,
    flex: 1,
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tierProgress: {
    gap: 6,
  },
  tierProgressBar: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  tierProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  tierProgressText: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  earningsCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  earningsSubtext: {
    fontSize: 12,
    color: '#999',
  },
  trendContainer: {
    marginTop: 4,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  escrowSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  escrowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  escrowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  escrowItemTitle: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  escrowItemValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  suggestionCard: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  suggestionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  suggestionHeaderText: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  suggestionImpact: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '500',
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  suggestionActionButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  suggestionActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionDismiss: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionDismissText: {
    color: '#666',
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  statTrend: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  topViewersSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  subsectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  viewerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  viewerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  viewerRankText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerInfo: {
    flex: 1,
  },
  viewerName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  viewerStats: {
    fontSize: 13,
    color: '#666',
  },
  paidBadge: {
    marginLeft: 8,
  },
  paidBadgeText: {
    fontSize: 20,
  },
  conversationStats: {
    gap: 12,
  },
  conversationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  conversationLabel: {
    fontSize: 15,
    color: '#666',
  },
  conversationValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  bestHoursSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  bestHoursGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  bestHourCard: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    alignItems: 'center',
    gap: 6,
  },
  bestHourText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  mediaGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    alignItems: 'center',
  },
  mediaValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 8,
    marginBottom: 4,
  },
  mediaLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  mediaEarnings: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  topMediaSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  topMediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  topMediaRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topMediaRankText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  topMediaInfo: {
    flex: 1,
  },
  topMediaTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  topMediaStats: {
    fontSize: 13,
    color: '#666',
  },
  royalSection: {
    backgroundColor: '#0F172A',
  },
  royalCard: {
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  royalCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  royalCardDescription: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 12,
  },
  royalCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  royalCardActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFD700',
  },
  footer: {
    padding: 20,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
