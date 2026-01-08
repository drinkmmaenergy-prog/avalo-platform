/**
 * PACK 325 — Boost History Screen
 * View user's boost history with metrics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { callFunction } from "@/lib/firebase";

interface Boost {
  id: string;
  contentType: 'POST' | 'REEL';
  contentId: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  startAt: string;
  endAt: string;
  tokensPaid: number;
  createdAt: string;
  metrics: {
    impressions: number;
    clicks: number;
    profileVisits: number;
  };
}

export default function BoostHistoryScreen() {
  const router = useRouter();
  const [boosts, setBoosts] = useState<Boost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBoosts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await callFunction('pack325_getUserBoosts_callable', {
        limit: 50,
      });

      if (result.success) {
        setBoosts(result.boosts || []);
      }
    } catch (error) {
      console.error('Error loading boosts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBoosts();
  }, [loadBoosts]);

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#4CAF50';
      case 'EXPIRED':
        return '#9E9E9E';
      case 'CANCELLED':
        return '#F44336';
      default:
        return '#FFC107';
    }
  };

  const getBoostSizeLabel = (tokens: number) => {
    switch (tokens) {
      case 200:
        return 'Small (24h)';
      case 500:
        return 'Medium (3d)';
      case 1000:
        return 'Large (7d)';
      default:
        return 'Custom';
    }
  };

  const renderBoost = useCallback(({ item }: { item: Boost }) => {
    const ctr = item.metrics.impressions > 0
      ? ((item.metrics.clicks / item.metrics.impressions) * 100).toFixed(1)
      : '0.0';

    return (
      <View style={styles.boostCard}>
        {/* Header */}
        <View style={styles.boostHeader}>
          <View>
            <Text style={styles.boostType}>
              {item.contentType === 'POST' ? '📸 Post' : '🎬 Reel'}
            </Text>
            <Text style={styles.boostSize}>{getBoostSizeLabel(item.tokensPaid)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{item.metrics.impressions.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Impressions</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{item.metrics.clicks.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Clicks</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{ctr}%</Text>
            <Text style={styles.metricLabel}>CTR</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{item.metrics.profileVisits.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Visits</Text>
          </View>
        </View>

        {/* Duration */}
        <View style={styles.durationRow}>
          <Text style={styles.durationText}>
            {formatDate(item.startAt)} → {formatDate(item.endAt)}
          </Text>
        </View>

        {/* Cost */}
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Cost:</Text>
          <Text style={styles.costValue}>{item.tokensPaid} tokens</Text>
        </View>
      </View>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={boosts}
        renderItem={renderBoost}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadBoosts(true)}
            tintColor="#40E0D0"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📣</Text>
            <Text style={styles.emptyTitle}>No Boosts Yet</Text>
            <Text style={styles.emptyText}>
              Promote your posts and reels to reach more people
            </Text>
          </View>
        }
        contentContainerStyle={boosts.length === 0 ? styles.emptyList : styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  boostCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  boostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  boostType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  boostSize: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'uppercase',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#999',
  },
  durationRow: {
    marginBottom: 8,
  },
  durationText: {
    fontSize: 13,
    color: '#666',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: {
    fontSize: 14,
    color: '#666',
  },
  costValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
