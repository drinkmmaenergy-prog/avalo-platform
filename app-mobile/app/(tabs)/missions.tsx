/**
 * Missions Screen
 * Shows daily missions, progress, and rewards
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
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  getDailyMissions,
  claimMissionReward,
  getUserMissionStats,
  type Mission,
  type DailyMissionsResponse,
  type MissionStats,
  getMissionIcon,
  getMissionColor,
  formatMissionProgress,
  hasClaimableMissions,
  countClaimableMissions,
  calculateDailyProgress,
} from "@/services/missionService";

export default function MissionsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missionsData, setMissionsData] = useState<DailyMissionsResponse | null>(null);
  const [stats, setStats] = useState<MissionStats | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [missions, missionStats] = await Promise.all([
        getDailyMissions(),
        getUserMissionStats(),
      ]);
      setMissionsData(missions);
      setStats(missionStats);
    } catch (error) {
      console.error('Error loading missions:', error);
      Alert.alert('Error', 'Failed to load missions');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleClaimReward = async (missionId: string) => {
    try {
      setClaiming(missionId);
      const result = await claimMissionReward(missionId);
      
      if (result.success) {
        Alert.alert(
          'Reward Claimed!',
          `You earned ${result.tokensAwarded} tokens!`,
          [{ text: 'OK', onPress: () => loadData() }]
        );
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('Error claiming reward:', error);
      Alert.alert('Error', 'Failed to claim reward');
    } finally {
      setClaiming(null);
    }
  };

  const handleClaimAll = async () => {
    if (!missionsData) return;

    const claimable = missionsData.missions.filter(m => m.status === 'COMPLETED');
    if (claimable.length === 0) return;

    try {
      for (const mission of claimable) {
        await handleClaimReward(mission.missionId);
      }
    } catch (error) {
      console.error('Error claiming all rewards:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Daily Missions' }} />
        <ActivityIndicator size="large" color="#FF1493" />
      </View>
    );
  }

  const dailyProgress = missionsData ? calculateDailyProgress(missionsData.missions) : 0;
  const claimableCount = missionsData ? countClaimableMissions(missionsData.missions) : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Stack.Screen options={{ title: 'Daily Missions' }} />

      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Daily Missions</Text>
        <Text style={styles.headerSubtitle}>
          Complete missions to earn tokens!
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${dailyProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{dailyProgress}% Complete</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.currentStreak || 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{missionsData?.totalRewardsClaimed || 0}</Text>
            <Text style={styles.statLabel}>Claimed Today</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.totalRewardsEarned || 0}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
        </View>

        {/* Claim All Button */}
        {claimableCount > 0 && (
          <TouchableOpacity
            style={styles.claimAllButton}
            onPress={handleClaimAll}
            disabled={claiming !== null}
          >
            <Text style={styles.claimAllText}>
              Claim All Rewards ({claimableCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Missions List */}
      <View style={styles.missionsList}>
        <Text style={styles.sectionTitle}>Today's Missions</Text>
        {missionsData?.missions.map((mission) => (
          <MissionCard
            key={mission.missionId}
            mission={mission}
            onClaim={() => handleClaimReward(mission.missionId)}
            claiming={claiming === mission.missionId}
          />
        ))}
      </View>

      {/* Streak Info */}
      {stats && stats.currentStreak > 0 && (
        <View style={styles.streakCard}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakTitle}>
            {stats.currentStreak} Day Streak!
          </Text>
          <Text style={styles.streakText}>
            Keep it up! Your longest streak is {stats.longestStreak} days.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// Mission Card Component
function MissionCard({
  mission,
  onClaim,
  claiming,
}: {
  mission: Mission;
  onClaim: () => void;
  claiming: boolean;
}) {
  const statusColor = getMissionColor(mission.status);
  const isCompleted = mission.status === 'COMPLETED';
  const isClaimed = mission.status === 'CLAIMED';

  return (
    <View style={[styles.missionCard, isClaimed && styles.missionCardClaimed]}>
      <View style={styles.missionHeader}>
        <View style={styles.missionInfo}>
          <Text style={styles.missionName}>{mission.name}</Text>
          <Text style={styles.missionDescription}>{mission.description}</Text>
        </View>
        <View style={[styles.missionIcon, { backgroundColor: statusColor + '20' }]}>
          <Text style={styles.missionIconText}>
            {mission.status === 'CLAIMED' ? '✅' : '🎯'}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.missionProgressContainer}>
        <View style={styles.missionProgressBar}>
          <View
            style={[
              styles.missionProgressFill,
              { width: `${mission.progress}%`, backgroundColor: statusColor },
            ]}
          />
        </View>
        <Text style={styles.missionProgressText}>
          {formatMissionProgress(mission)}
        </Text>
      </View>

      {/* Reward Section */}
      <View style={styles.missionFooter}>
        <View style={styles.rewardBox}>
          <Text style={styles.rewardText}>
            🪙 {mission.rewardTokens} tokens
          </Text>
        </View>

        {isCompleted && (
          <TouchableOpacity
            style={[styles.claimButton, claiming && styles.claimButtonDisabled]}
            onPress={onClaim}
            disabled={claiming}
          >
            <Text style={styles.claimButtonText}>
              {claiming ? 'Claiming...' : 'Claim Reward'}
            </Text>
          </TouchableOpacity>
        )}

        {isClaimed && (
          <View style={styles.claimedBadge}>
            <Text style={styles.claimedText}>Claimed ✓</Text>
          </View>
        )}
      </View>
    </View>
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
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF1493',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
  },
  claimAllButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  claimAllText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  missionsList: {
    padding: 16,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  missionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  missionCardClaimed: {
    opacity: 0.6,
  },
  missionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  missionInfo: {
    flex: 1,
    marginRight: 12,
  },
  missionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  missionDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  missionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  missionIconText: {
    fontSize: 20,
  },
  missionProgressContainer: {
    marginBottom: 12,
  },
  missionProgressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  missionProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  missionProgressText: {
    fontSize: 12,
    color: '#6B7280',
  },
  missionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rewardText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  claimButton: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  claimButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  claimedBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  claimedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  streakCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  streakEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  streakTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF1493',
    marginBottom: 8,
  },
  streakText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
