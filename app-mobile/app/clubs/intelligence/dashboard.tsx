/**
 * PACK 193 — Club Intelligence Dashboard
 * Smart community metrics and contribution tracking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface ContributionScore {
  userId: string;
  userName: string;
  totalScore: number;
  knowledgeScore: number;
  engagementScore: number;
  creativityScore: number;
  collaborationScore: number;
  leadershipScore: number;
  contributionCount: number;
}

interface ClubHealth {
  healthScore: number;
  toxicityIndex: number;
  cliqueRisk: number;
  contributionDiversity: number;
  activeContributors: number;
}

export default function ClubIntelligenceDashboard() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<ContributionScore[]>([]);
  const [health, setHealth] = useState<ClubHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadDashboardData();
    }
  }, [clubId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [scoresResult, healthResult] = await Promise.all([
        httpsCallable(functions, 'getContributionScores')({ clubId, limit: 10 }),
        httpsCallable(functions, 'getClubHealth')({ clubId }),
      ]);

      const scoresData = scoresResult.data as any;
      if (scoresData.success) {
        setScores(scoresData.scores || []);
      }

      const healthData = healthResult.data as any;
      if (healthData.success) {
        setHealth(healthData.healthMetrics);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      Alert.alert('Error', 'Failed to load club intelligence data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#27AE60';
    if (score >= 60) return '#F39C12';
    if (score >= 40) return '#E67E22';
    return '#E74C3C';
  };

  const getHealthLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Attention';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading intelligence data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club Intelligence</Text>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing}>
          <Ionicons 
            name="refresh" 
            size={24} 
            color={refreshing ? '#BDC3C7' : '#2C3E50'} 
          />
        </TouchableOpacity>
      </View>

      {/* Health Score Card */}
      {health && (
        <View style={styles.healthCard}>
          <View style={styles.healthHeader}>
            <Text style={styles.healthTitle}>Community Health</Text>
            <View style={[styles.healthBadge, { backgroundColor: getHealthColor(health.healthScore) }]}>
              <Text style={styles.healthBadgeText}>{getHealthLabel(health.healthScore)}</Text>
            </View>
          </View>

          <View style={styles.healthScoreContainer}>
            <View style={[styles.healthScoreCircle, { borderColor: getHealthColor(health.healthScore) }]}>
              <Text style={[styles.healthScoreValue, { color: getHealthColor(health.healthScore) }]}>
                {health.healthScore}
              </Text>
              <Text style={styles.healthScoreLabel}>Health Score</Text>
            </View>
          </View>

          <View style={styles.healthMetrics}>
            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
                <Text style={styles.metricLabel}>Toxicity</Text>
                <Text style={[styles.metricValue, { color: health.toxicityIndex < 20 ? '#27AE60' : '#E74C3C' }]}>
                  {health.toxicityIndex}%
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Ionicons name="people" size={20} color="#3498DB" />
                <Text style={styles.metricLabel}>Clique Risk</Text>
                <Text style={[styles.metricValue, { color: health.cliqueRisk < 30 ? '#27AE60' : '#E67E22' }]}>
                  {health.cliqueRisk}%
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Ionicons name="sparkles" size={20} color="#9B59B6" />
                <Text style={styles.metricLabel}>Diversity</Text>
                <Text style={[styles.metricValue, { color: '#27AE60' }]}>
                  {health.contributionDiversity}%
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Ionicons name="trending-up" size={20} color="#F39C12" />
                <Text style={styles.metricLabel}>Active Contributors</Text>
                <Text style={[styles.metricValue, { color: '#27AE60' }]}>
                  {health.activeContributors}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#3498DB" />
        <Text style={styles.infoText}>
          Rankings based on contribution & value, never beauty, spending, or popularity
        </Text>
      </View>

      {/* Top Contributors */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Contributors</Text>
          <TouchableOpacity onPress={() => router.push(`/clubs/${clubId}/intelligence/contributions` as any)}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {scores.length > 0 ? (
          scores.map((score, index) => (
            <View key={score.userId} style={styles.contributorCard}>
              <View style={styles.contributorRank}>
                <Text style={styles.rankNumber}>#{index + 1}</Text>
              </View>

              <View style={styles.contributorInfo}>
                <Text style={styles.contributorName}>{score.userName}</Text>
                <Text style={styles.contributorStats}>
                  {score.contributionCount} contributions
                </Text>
              </View>

              <View style={styles.contributorScore}>
                <Text style={styles.scoreValue}>{score.totalScore}</Text>
                <Text style={styles.scoreLabel}>points</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trophy" size={48} color="#BDC3C7" />
            <Text style={styles.emptyText}>No contributions yet</Text>
            <Text style={styles.emptySubtext}>Be the first to contribute!</Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(`/clubs/${clubId}/intelligence/contribute` as any)}
        >
          <Ionicons name="add-circle" size={24} color="#FFF" />
          <Text style={styles.actionButtonText}>Record Contribution</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => router.push(`/clubs/${clubId}/intelligence/challenges` as any)}
        >
          <Ionicons name="trophy" size={24} color="#4A90E2" />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>View Challenges</Text>
        </TouchableOpacity>
      </View>

      {/* Guidelines */}
      <View style={styles.guidelines}>
        <Text style={styles.guidelinesTitle}>Community Guidelines</Text>
        <View style={styles.guidelineItem}>
          <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
          <Text style={styles.guidelineText}>Contributions rewarded: knowledge, teamwork, creativity</Text>
        </View>
        <View style={styles.guidelineItem}>
          <Ionicons name="close-circle" size={16} color="#E74C3C" />
          <Text style={styles.guidelineText}>Never ranked by: looks, spending, popularity</Text>
        </View>
        <View style={styles.guidelineItem}>
          <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
          <Text style={styles.guidelineText}>Safe space: anti-toxicity & anti-clique protection</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  healthCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  healthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  healthBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  healthBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  healthScoreContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  healthScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthScoreValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  healthScoreLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
  healthMetrics: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#7F8C8D',
    marginTop: 4,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E8F4FD',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#2980B9',
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  seeAllText: {
    fontSize: 14,
    color: '#4A90E2',
    fontWeight: '500',
  },
  contributorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  contributorRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90E2',
  },
  contributorInfo: {
    flex: 1,
  },
  contributorName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 2,
  },
  contributorStats: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  contributorScore: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#27AE60',
  },
  scoreLabel: {
    fontSize: 11,
    color: '#7F8C8D',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7F8C8D',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#95A5A6',
    marginTop: 4,
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  secondaryButtonText: {
    color: '#4A90E2',
  },
  guidelines: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
});
