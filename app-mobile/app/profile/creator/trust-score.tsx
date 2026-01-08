/**
 * PACK 324C — Creator Trust Score Screen
 * Allows creators to view their trust score, ranking, and performance metrics
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
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged, User } from 'firebase/auth';
import { router } from 'expo-router';

interface TrustScoreData {
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

interface RankingData {
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

const TRUST_LEVEL_CONFIG = {
  LOW: { label: 'Low Trust', color: '#ef4444', badge: '⚠️' },
  MEDIUM: { label: 'Medium Trust', color: '#f59e0b', badge: '✓' },
  HIGH: { label: 'High Trust', color: '#10b981', badge: '⭐' },
  ELITE: { label: 'Elite Creator', color: '#8b5cf6', badge: '👑' },
};

export default function CreatorTrustScoreScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trustScore, setTrustScore] = useState<TrustScoreData | null>(null);
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const loadData = async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // Load trust score
      const getTrustScore = httpsCallable(functions, 'pack324c_getCreatorTrustScore');
      const trustScoreResult = await getTrustScore({ userId: user.uid });
      const trustData = trustScoreResult.data as TrustScoreData;
      setTrustScore(trustData);

      // Load current ranking
      const getRanking = httpsCallable(functions, 'pack324c_getCreatorRanking');
      try {
        const rankingResult = await getRanking({ userId: user.uid });
        const rankData = rankingResult.data as RankingData;
        setRanking(rankData);
      } catch (rankError: any) {
        // Ranking might not exist yet for new creators
        console.log('No ranking data available:', rankError.message);
        setRanking(null);
      }
    } catch (err: any) {
      console.error('Error loading trust score data:', err);
      setError(err.message || 'Failed to load trust score data');
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading trust score...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
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

  if (!trustScore) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>📊</Text>
          <Text style={styles.errorTitle}>No Trust Score Yet</Text>
          <Text style={styles.errorMessage}>
            Your trust score will be calculated after you complete your first sessions.
          </Text>
        </View>
      </View>
    );
  }

  const levelConfig = TRUST_LEVEL_CONFIG[trustScore.level];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Trust Score Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Trust Score</Text>
        <Text style={styles.headerSubtitle}>
          Last updated: {new Date(trustScore.lastUpdated).toLocaleDateString()}
        </Text>
      </View>

      {/* Main Trust Score Card */}
      <View style={[styles.mainScoreCard, { borderColor: levelConfig.color }]}>
        <Text style={styles.badge}>{levelConfig.badge}</Text>
        <Text style={styles.mainScore}>{trustScore.trustScore}</Text>
        <Text style={styles.scoreSubtext}>/ 100</Text>
        <View style={[styles.levelBadge, { backgroundColor: levelConfig.color }]}>
          <Text style={styles.levelBadgeText}>{levelConfig.label}</Text>
        </View>
      </View>

      {/* Ranking Card */}
      {ranking && (
        <View style={styles.rankingCard}>
          <Text style={styles.cardTitle}>🏆 Your Ranking</Text>
          <View style={styles.rankingRow}>
            <Text style={styles.rankingPosition}>#{ranking.rankPosition}</Text>
            <Text style={styles.rankingDate}>
              {new Date(ranking.date).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.performanceGrid}>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>
                {ranking.performance.earnedTokens.toLocaleString()}
              </Text>
              <Text style={styles.performanceLabel}>Tokens Earned</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{ranking.performance.sessions}</Text>
              <Text style={styles.performanceLabel}>Sessions</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>
                {Math.round(ranking.performance.callsMinutes)}
              </Text>
              <Text style={styles.performanceLabel}>Call Minutes</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>
                {ranking.performance.rating.toFixed(1)} ⭐
              </Text>
              <Text style={styles.performanceLabel}>Rating</Text>
            </View>
          </View>
        </View>
      )}

      {/* Component Scores */}
      <View style={styles.scoresCard}>
        <Text style={styles.cardTitle}>Score Breakdown</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreInfo}>
            <Text style={styles.scoreLabel}>Quality Score</Text>
            <Text style={styles.scoreDescription}>
              Call completion, ratings, refunds
            </Text>
          </View>
          <Text style={styles.scoreValue}>{trustScore.scores.quality}</Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreInfo}>
            <Text style={styles.scoreLabel}>Reliability Score</Text>
            <Text style={styles.scoreDescription}>
              No-shows, cancellations, consistency
            </Text>
          </View>
          <Text style={styles.scoreValue}>{trustScore.scores.reliability}</Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreInfo}>
            <Text style={styles.scoreLabel}>Safety Score</Text>
            <Text style={styles.scoreDescription}>
              Reports, flags, moderation
            </Text>
          </View>
          <Text style={styles.scoreValue}>{trustScore.scores.safety}</Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreInfo}>
            <Text style={styles.scoreLabel}>Payout Score</Text>
            <Text style={styles.scoreDescription}>
              Payout integrity, disputes
            </Text>
          </View>
          <Text style={styles.scoreValue}>{trustScore.scores.payout}</Text>
        </View>
      </View>

      {/* Trust Level Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 About Trust Levels</Text>
        <View style={styles.levelRow}>
          <Text style={styles.levelEmoji}>👑</Text>
          <View style={styles.levelInfo}>
            <Text style={styles.levelName}>Elite (85-100)</Text>
            <Text style={styles.levelDesc}>Top performers, priority support</Text>
          </View>
        </View>
        <View style={styles.levelRow}>
          <Text style={styles.levelEmoji}>⭐</Text>
          <View style={styles.levelInfo}>
            <Text style={styles.levelName}>High (55-84)</Text>
            <Text style={styles.levelDesc}>Trusted creators, featured spots</Text>
          </View>
        </View>
        <View style={styles.levelRow}>
          <Text style={styles.levelEmoji}>✓</Text>
          <View style={styles.levelInfo}>
            <Text style={styles.levelName}>Medium (25-54)</Text>
            <Text style={styles.levelDesc}>Good standing, standard access</Text>
          </View>
        </View>
        <View style={styles.levelRow}>
          <Text style={styles.levelEmoji}>⚠️</Text>
          <View style={styles.levelInfo}>
            <Text style={styles.levelName}>Low (0-24)</Text>
            <Text style={styles.levelDesc}>Needs improvement</Text>
          </View>
        </View>
      </View>

      {/* How to Improve */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>🎯 How to Improve Your Score</Text>
        <Text style={styles.tipItem}>• Complete all scheduled calls and sessions</Text>
        <Text style={styles.tipItem}>• Maintain high user ratings (4.5+ stars)</Text>
        <Text style={styles.tipItem}>• Minimize cancellations and no-shows</Text>
        <Text style={styles.tipItem}>• Keep refund requests low</Text>
        <Text style={styles.tipItem}>• Stay active with regular sessions</Text>
        <Text style={styles.tipItem}>• Follow platform safety guidelines</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  mainScoreCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badge: {
    fontSize: 48,
    marginBottom: 8,
  },
  mainScore: {
    fontSize: 64,
    fontWeight: '700',
    color: '#000',
  },
  scoreSubtext: {
    fontSize: 24,
    color: '#666',
    marginBottom: 16,
  },
  levelBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  levelBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rankingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  rankingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rankingPosition: {
    fontSize: 32,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  rankingDate: {
    fontSize: 14,
    color: '#666',
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  performanceItem: {
    width: '48%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  scoresCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  scoreDescription: {
    fontSize: 12,
    color: '#666',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8b5cf6',
    marginLeft: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  levelEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  levelDesc: {
    fontSize: 12,
    color: '#666',
  },
  tipsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  tipItem: {
    fontSize: 14,
    color: '#444',
    paddingVertical: 4,
    lineHeight: 20,
  },
});
