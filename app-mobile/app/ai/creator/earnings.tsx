/**
 * PACK 340 - AI Earnings Preview (Mobile - Creator Side)
 * Preview of AI companion earnings with navigation to full dashboard
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';

import {
  getAIEarningsPreview,
  type AIEarningsPreview,
  formatTokens,
} from "@/types/aiCompanion";

export default function AIEarningsPreviewScreen() {
  const [earnings, setEarnings] = useState<AIEarningsPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      setLoading(true);
      const data = await getAIEarningsPreview();
      setEarnings(data);
    } catch (error) {
      console.error('Error loading earnings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadEarnings();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!earnings) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No earnings data available</Text>
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
        <Text style={styles.title}>AI Earnings Preview</Text>
        <Text style={styles.subtitle}>
          Track your AI companion performance
        </Text>
      </View>

      {/* Today's Earnings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today</Text>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsValue}>
            {formatTokens(earnings.todayTokens)}
          </Text>
          <Text style={styles.earningsLabel}>Tokens Earned</Text>
        </View>
      </View>

      {/* Period Earnings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>

        <View style={styles.periodGrid}>
          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>7 Days</Text>
            <Text style={styles.periodValue}>
              {formatTokens(earnings.last7DaysTokens)}
            </Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>30 Days</Text>
            <Text style={styles.periodValue}>
              {formatTokens(earnings.last30DaysTokens)}
            </Text>
          </View>
        </View>
      </View>

      {/* Best Performing AI */}
      {earnings.bestPerformingAI && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performer</Text>

          <View style={styles.topPerformerCard}>
            <View style={styles.topPerformerHeader}>
              <Text style={styles.topPerformerName}>
                {earnings.bestPerformingAI.name}
              </Text>
              <View style={styles.crownBadge}>
                <Text style={styles.crownEmoji}>👑</Text>
              </View>
            </View>

            <Text style={styles.topPerformerEarnings}>
              {formatTokens(
                earnings.bestPerformingAI.tokensEarned
              )}{' '}
              tokens
            </Text>

            <TouchableOpacity
              style={styles.viewButton}
              onPress={() =>
                router.push(
                  `/ai/${earnings.bestPerformingAI!.companionId}` as any
                )
              }
            >
              <Text style={styles.viewButtonText}>View Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Conversion Rate */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stats</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {earnings.conversionRate.toFixed(1)}%
            </Text>
            <Text style={styles.statLabel}>Conversion Rate</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {earnings.totalCompanions}
            </Text>
            <Text style={styles.statLabel}>AI Companions</Text>
          </View>
        </View>
      </View>

      {/* Full Dashboard CTA */}
      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() =>
            router.push('/ai/creator/dashboard' as any)
          }
        >
          <Text style={styles.ctaButtonText}>
            📊 Go to Full Dashboard
          </Text>
          <Text style={styles.ctaButtonSubtext}>
            Advanced analytics, revenue tracking, and more
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Grow Your Earnings</Text>
        <Text style={styles.infoText}>
          • Create engaging AI companions{'\n'}
          • Optimize pricing strategies{'\n'}
          • Monitor performance metrics{'\n'}
          • Respond to user feedback
        </Text>
      </View>

      {/* Bottom Spacer */}
      <View style={styles.bottomSpacer} />
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  section: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  earningsCard: {
    padding: 24,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    alignItems: 'center',
  },
  earningsValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  earningsLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  periodGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  periodCard: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    alignItems: 'center',
  },
  periodLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  periodValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  topPerformerCard: {
    padding: 20,
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  topPerformerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topPerformerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
  },
  crownBadge: {
    width: 40,
    height: 40,
    backgroundColor: '#FFD700',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crownEmoji: {
    fontSize: 24,
  },
  topPerformerEarnings: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 12,
  },
  viewButton: {
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#34C759',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  ctaSection: {
    padding: 20,
  },
  ctaButton: {
    padding: 24,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  ctaButtonSubtext: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  infoBox: {
    margin: 20,
    padding: 20,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 22,
  },
  bottomSpacer: {
    height: 40,
  },
});

