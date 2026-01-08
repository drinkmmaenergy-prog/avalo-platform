/**
 * PACK 311 — AI Companions Marketplace
 * Owner analytics for AI avatars
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import type { OwnerAIAvatarsResponse } from "@/types/aiMarketplace";

export default function AIAnalyticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarsData, setAvatarsData] = useState<OwnerAIAvatarsResponse | null>(null);

  const loadAnalytics = async (refresh: boolean = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const getMyAvatars = httpsCallable<void, OwnerAIAvatarsResponse>(
        functions,
        'getMyAIAvatars'
      );

      const result = await getMyAvatars();
      setAvatarsData(result.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadAnalytics(true);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading && !avatarsData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '#10b981';
      case 'PAUSED': return '#f59e0b';
      case 'BANNED': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '● Active';
      case 'PAUSED': return '● Paused';
      case 'BANNED': return '● Banned';
      default: return status;
    }
  };

  const formatRetention = (score: number) => {
    return `${(score * 100).toFixed(0)}%`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>📊 AI Companions Analytics</Text>
          <Text style={styles.subtitle}>
            Track performance of your AI avatars
          </Text>
        </View>

        {/* Summary Stats */}
        {avatarsData && avatarsData.avatars.length > 0 && (
          <View style={styles.summaryContainer}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {avatarsData.avatars.reduce((sum, a) => sum + a.stats.tokensEarned7d, 0)}
              </Text>
              <Text style={styles.summaryLabel}>Total Tokens (7d)</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {avatarsData.avatars.reduce((sum, a) => sum + a.stats.chatStarts7d, 0)}
              </Text>
              <Text style={styles.summaryLabel}>Chat Sessions (7d)</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {avatarsData.avatars.reduce((sum, a) => sum + a.stats.views7d, 0)}
              </Text>
              <Text style={styles.summaryLabel}>Views (7d)</Text>
            </View>
          </View>
        )}

        {/* Avatar Cards */}
        <View style={styles.avatarsContainer}>
          {!avatarsData || avatarsData.avatars.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🤖</Text>
              <Text style={styles.emptyStateText}>
                No AI Companions yet
              </Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/profile/ai-avatars/create' as any)}
              >
                <Text style={styles.createButtonText}>Create Your First AI</Text>
              </TouchableOpacity>
            </View>
          ) : (
            avatarsData.avatars.map((avatar) => (
              <View key={avatar.avatarId} style={styles.avatarCard}>
                {/* Header */}
                <View style={styles.avatarHeader}>
                  <Text style={styles.avatarName}>{avatar.displayName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(avatar.status) }]}>
                    <Text style={styles.statusText}>{getStatusLabel(avatar.status)}</Text>
                  </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                  {/* 7 Days Stats */}
                  <View style={styles.statsSection}>
                    <Text style={styles.statsHeader}>Last 7 Days</Text>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.views7d}</Text>
                        <Text style={styles.statLabel}>Views</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.chatStarts7d}</Text>
                        <Text style={styles.statLabel}>Chats</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.tokensEarned7d}</Text>
                        <Text style={styles.statLabel}>Tokens</Text>
                      </View>
                    </View>
                  </View>

                  {/* 30 Days Stats */}
                  <View style={styles.statsSection}>
                    <Text style={styles.statsHeader}>Last 30 Days</Text>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.views30d}</Text>
                        <Text style={styles.statLabel}>Views</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.chatStarts30d}</Text>
                        <Text style={styles.statLabel}>Chats</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{avatar.stats.tokensEarned30d}</Text>
                        <Text style={styles.statLabel}>Tokens</Text>
                      </View>
                    </View>
                  </View>

                  {/* Retention Score */}
                  <View style={styles.retentionSection}>
                    <Text style={styles.retentionLabel}>User Retention</Text>
                    <Text style={styles.retentionValue}>
                      {formatRetention(avatar.stats.retentionScore)}
                    </Text>
                    <Text style={styles.retentionHint}>
                      of users come back within 7 days
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => router.push(`/profile/ai-avatars/edit/${avatar.avatarId}` as any)}
                  >
                    <Text style={styles.actionButtonText}>Edit Avatar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={() => router.push(`/ai-companions/${avatar.avatarId}` as any)}
                  >
                    <Text style={styles.actionButtonTextSecondary}>View Profile</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
    fontSize: 14,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1f2937',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
  avatarsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  avatarCard: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  avatarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    gap: 16,
  },
  statsSection: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 8,
  },
  statsHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  retentionSection: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  retentionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  retentionValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  retentionHint: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '600',
  },
});
