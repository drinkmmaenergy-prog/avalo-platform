/**
 * PACK 324C — Admin Trust & Rankings Dashboard
 * Admin-only screen for viewing creator trust scores and rankings
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
  TextInput,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged, User } from 'firebase/auth';

interface DashboardStats {
  totalCreators: number;
  eliteCreators: number;
  highTrustCreators: number;
  mediumTrustCreators: number;
  lowTrustCreators: number;
  averageTrustScore: number;
  topEarners: number;
}

interface CreatorRanking {
  date: string;
  userId: string;
  rankPosition: number;
  trustScore: number;
  performance: {
    earnedTokens: number;
    sessions: number;
    callsMinutes: number;
    rating: number;
  };
}

interface TrustScore {
  userId: string;
  trustScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'ELITE';
  scores: {
    quality: number;
    reliability: number;
    safety: number;
    payout: number;
  };
  lastUpdated: Date;
}

const TRUST_LEVEL_COLORS = {
  LOW: '#ef4444',
  MEDIUM: '#f59e0b',
  HIGH: '#10b981',
  ELITE: '#8b5cf6',
};

export default function AdminTrustRankingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topCreators, setTopCreators] = useState<CreatorRanking[]>([]);
  const [trustedCreators, setTrustedCreators] = useState<TrustScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rankings' | 'trust'>('rankings');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const loadData = async () => {
    if (!user?.uid) return;

    try {
      setError(null);

      // Load statistics
      const getStats = httpsCallable(functions, 'pack324c_getRankingDashboardStats');
      const statsResult = await getStats({});
      setStats(statsResult.data as DashboardStats);

      // Load top creators by ranking
      const getTopCreators = httpsCallable(functions, 'pack324c_getTopCreators');
      const topResult = await getTopCreators({ limit: 50 });
      const topData = topResult.data as { creators: CreatorRanking[] };
      setTopCreators(topData.creators);

      // Load top trusted creators
      const getTrusted = httpsCallable(functions, 'pack324c_getTopTrustedCreators');
      const trustedResult = await getTrusted({ limit: 50 });
      const trustedData = trustedResult.data as { creators: TrustScore[] };
      setTrustedCreators(trustedData.creators);
    } catch (err: any) {
      console.error('Error loading trust rankings data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user?.uid]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleTriggerRecalculation = async () => {
    try {
      const trigger = httpsCallable(functions, 'pack324c_admin_triggerRankingGeneration');
      await trigger({});
      alert('Ranking recalculation triggered successfully');
      handleRefresh();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const filteredRankings = topCreators.filter((creator) =>
    creator.userId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTrust = trustedCreators.filter((creator) =>
    creator.userId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Trust & Rankings' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Trust & Rankings' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️</Text>
          <Text style={styles.errorTitle}>Error Loading Data</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Trust & Rankings',
          headerRight: () => (
            <TouchableOpacity onPress={handleTriggerRecalculation}>
              <Text style={styles.triggerButton}>🔄 Recalculate</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Statistics */}
        {stats && (
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>📊 Overview</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.totalCreators}</Text>
                <Text style={styles.statLabel}>Total Creators</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#8b5cf6' }]}>
                  {stats.eliteCreators}
                </Text>
                <Text style={styles.statLabel}>Elite</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#10b981' }]}>
                  {stats.highTrustCreators}
                </Text>
                <Text style={styles.statLabel}>High Trust</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                  {stats.mediumTrustCreators}
                </Text>
                <Text style={styles.statLabel}>Medium Trust</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#ef4444' }]}>
                  {stats.lowTrustCreators}
                </Text>
                <Text style={styles.statLabel}>Low Trust</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.averageTrustScore}</Text>
                <Text style={styles.statLabel}>Avg Score</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'rankings' && styles.activeTab]}
            onPress={() => setActiveTab('rankings')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'rankings' && styles.activeTabText,
              ]}
            >
              🏆 Rankings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trust' && styles.activeTab]}
            onPress={() => setActiveTab('trust')}
          >
            <Text
              style={[styles.tabText, activeTab === 'trust' && styles.activeTabText]}
            >
              ⭐ Trust Scores
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by User ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        {/* Rankings Tab */}
        {activeTab === 'rankings' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>
              Top {filteredRankings.length} Creators
            </Text>
            {filteredRankings.map((creator) => (
              <View key={creator.userId} style={styles.creatorCard}>
                <View style={styles.creatorHeader}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{creator.rankPosition}</Text>
                  </View>
                  <View style={styles.creatorInfo}>
                    <Text style={styles.userId}>{creator.userId}</Text>
                    <Text style={styles.date}>{creator.date}</Text>
                  </View>
                  <View style={styles.trustScoreBadge}>
                    <Text style={styles.trustScoreText}>
                      {creator.trustScore}
                    </Text>
                  </View>
                </View>
                <View style={styles.performanceRow}>
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>
                      {creator.performance.earnedTokens.toLocaleString()}
                    </Text>
                    <Text style={styles.performanceLabel}>Tokens</Text>
                  </View>
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>
                      {creator.performance.sessions}
                    </Text>
                    <Text style={styles.performanceLabel}>Sessions</Text>
                  </View>
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>
                      {Math.round(creator.performance.callsMinutes)}
                    </Text>
                    <Text style={styles.performanceLabel}>Minutes</Text>
                  </View>
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>
                      {creator.performance.rating.toFixed(1)} ⭐
                    </Text>
                    <Text style={styles.performanceLabel}>Rating</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Trust Scores Tab */}
        {activeTab === 'trust' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>
              Top {filteredTrust.length} by Trust Score
            </Text>
            {filteredTrust.map((creator) => (
              <View key={creator.userId} style={styles.creatorCard}>
                <View style={styles.creatorHeader}>
                  <View
                    style={[
                      styles.levelBadge,
                      { backgroundColor: TRUST_LEVEL_COLORS[creator.level] },
                    ]}
                  >
                    <Text style={styles.levelText}>{creator.level}</Text>
                  </View>
                  <View style={styles.creatorInfo}>
                    <Text style={styles.userId}>{creator.userId}</Text>
                    <Text style={styles.date}>
                      {new Date(creator.lastUpdated).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.trustScoreBadge}>
                    <Text style={styles.trustScoreText}>{creator.trustScore}</Text>
                  </View>
                </View>
                <View style={styles.scoresRow}>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreValue}>{creator.scores.quality}</Text>
                    <Text style={styles.scoreLabel}>Quality</Text>
                  </View>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreValue}>
                      {creator.scores.reliability}
                    </Text>
                    <Text style={styles.scoreLabel}>Reliability</Text>
                  </View>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreValue}>{creator.scores.safety}</Text>
                    <Text style={styles.scoreLabel}>Safety</Text>
                  </View>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreValue}>{creator.scores.payout}</Text>
                    <Text style={styles.scoreLabel}>Payout</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 32,
  },
  errorText: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  triggerButton: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 16,
  },
  statsContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#8b5cf6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  listContainer: {
    marginBottom: 16,
  },
  creatorCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  creatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankBadge: {
    backgroundColor: '#8b5cf6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  rankText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  levelBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  levelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  creatorInfo: {
    flex: 1,
  },
  userId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  date: {
    fontSize: 11,
    color: '#666',
  },
  trustScoreBadge: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trustScoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  performanceItem: {
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  performanceLabel: {
    fontSize: 10,
    color: '#666',
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreItem: {
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  scoreLabel: {
    fontSize: 10,
    color: '#666',
  },
});
