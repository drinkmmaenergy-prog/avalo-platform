/**
 * PACK 137: Challenge Detail Screen
 * View challenge details, leaderboard, and join
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
import {
  getChallengeDetails,
  getChallengeLeaderboard,
  joinChallenge,
  Challenge,
  LeaderboardEntry,
  formatCategory,
  formatDuration,
  getCategoryColor,
  getCategoryIcon,
  getDaysRemaining,
  formatDateRange,
  getStreakEmoji,
  formatCompletionRate,
  getCompletionBadgeColor,
} from '../../services/challengesService';

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (challengeId) {
      loadChallengeData();
    }
  }, [challengeId]);

  const loadChallengeData = async () => {
    try {
      setLoading(true);
      const [challengeData, leaderboardData] = await Promise.all([
        getChallengeDetails(challengeId!),
        getChallengeLeaderboard(challengeId!, 10),
      ]);
      setChallenge(challengeData);
      setLeaderboard(leaderboardData);
    } catch (error: any) {
      console.error('Error loading challenge:', error);
      Alert.alert('Error', error.message || 'Failed to load challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!challenge) return;

    try {
      setJoining(true);

      if (challenge.isPaid && challenge.entryTokens > 0) {
        Alert.alert(
          'Confirm Join',
          `This challenge costs ${challenge.entryTokens} tokens. No refunds if you leave. Continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Join',
              onPress: async () => {
                try {
                  await joinChallenge(challengeId!);
                  Alert.alert('Success', 'You have joined the challenge!');
                  router.back();
                } catch (error: any) {
                  Alert.alert('Error', error.message || 'Failed to join challenge');
                }
              },
            },
          ]
        );
      } else {
        await joinChallenge(challengeId!);
        Alert.alert('Success', 'You have joined the challenge!');
        router.back();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join challenge');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Challenge not found</Text>
      </View>
    );
  }

  const daysRemaining = getDaysRemaining(challenge.endDate.toDate());
  const isFull = challenge.maxParticipants && challenge.currentParticipants >= challenge.maxParticipants;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: getCategoryColor(challenge.category) },
            ]}
          >
            <Text style={styles.categoryBadgeText}>
              {getCategoryIcon(challenge.category)} {formatCategory(challenge.category)}
            </Text>
          </View>
          {challenge.isPaid && (
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText}>💎 {challenge.entryTokens} tokens</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{challenge.title}</Text>
        <Text style={styles.description}>{challenge.description}</Text>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⏱️</Text>
            <Text style={styles.statValue}>{formatDuration(challenge.duration)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>👥</Text>
            <Text style={styles.statValue}>
              {challenge.currentParticipants}
              {challenge.maxParticipants ? `/${challenge.maxParticipants}` : ''}
            </Text>
            <Text style={styles.statLabel}>Participants</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📅</Text>
            <Text style={styles.statValue}>{daysRemaining}d</Text>
            <Text style={styles.statLabel}>Days Left</Text>
          </View>
        </View>

        {/* Date Range */}
        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Challenge Period</Text>
          <Text style={styles.dateValue}>
            {formatDateRange(challenge.startDate.toDate(), challenge.endDate.toDate())}
          </Text>
        </View>

        {/* Task Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Task</Text>
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>{challenge.taskTitle}</Text>
            <Text style={styles.taskDescription}>{challenge.taskDescription}</Text>
            <View style={styles.taskRequirements}>
              {challenge.requiresPhoto && (
                <View style={styles.requirementChip}>
                  <Text style={styles.requirementText}>📸 Photo Required</Text>
                </View>
              )}
              {challenge.requiresVideo && (
                <View style={styles.requirementChip}>
                  <Text style={styles.requirementText}>🎥 Video Required</Text>
                </View>
              )}
              {challenge.requiresTextLog && (
                <View style={styles.requirementChip}>
                  <Text style={styles.requirementText}>📝 Text Log Required</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Safety Notice */}
        <View style={styles.safetyNotice}>
          <Text style={styles.safetyIcon}>🛡️</Text>
          <View style={styles.safetyContent}>
            <Text style={styles.safetyTitle}>100% Consistency-Based</Text>
            <Text style={styles.safetyText}>
              Rankings based only on completion rate and streak. No popularity contests.
            </Text>
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Top Participants</Text>
          {leaderboard.length > 0 ? (
            leaderboard.map((entry) => (
              <View key={entry.userId} style={styles.leaderboardItem}>
                <View style={styles.leaderboardRank}>
                  <Text style={styles.rankText}>#{entry.rank}</Text>
                </View>
                <View style={styles.leaderboardInfo}>
                  <Text style={styles.leaderboardName}>{entry.userName}</Text>
                  <View style={styles.leaderboardStats}>
                    <Text style={styles.leaderboardStat}>
                      {getStreakEmoji(entry.currentStreak)} {entry.currentStreak} day streak
                    </Text>
                    <Text style={styles.leaderboardStat}>
                      • {formatCompletionRate(entry.completionRate)} complete
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.completionBadge,
                    { backgroundColor: getCompletionBadgeColor(entry.completionRate) },
                  ]}
                >
                  <Text style={styles.completionBadgeText}>
                    {Math.round(entry.completionRate)}%
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyLeaderboard}>
              <Text style={styles.emptyLeaderboardText}>
                No participants yet. Be the first to join!
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Join Button */}
      {!isFull && (
        <View style={styles.joinButtonContainer}>
          <TouchableOpacity
            style={[styles.joinButton, joining && styles.joinButtonDisabled]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.joinButtonText}>
                  {challenge.isPaid ? `Join for ${challenge.entryTokens} 💎` : 'Join Free'}
                </Text>
                {challenge.isPaid && (
                  <Text style={styles.joinButtonSubtext}>No refunds if you leave</Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isFull && (
        <View style={styles.fullContainer}>
          <Text style={styles.fullText}>🔒 Challenge is Full</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 16,
  },
  categoryBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  categoryBadgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  priceBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  priceBadgeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  dateCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  dateLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  taskCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  taskDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  taskRequirements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  requirementChip: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  requirementText: {
    fontSize: 12,
    color: '#666',
  },
  safetyNotice: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  safetyIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  safetyContent: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 4,
  },
  safetyText: {
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 18,
  },
  leaderboardItem: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  leaderboardRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  leaderboardStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaderboardStat: {
    fontSize: 12,
    color: '#666',
  },
  completionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completionBadgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyLeaderboard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyLeaderboardText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  joinButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  joinButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  joinButtonSubtext: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  fullContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFE5E5',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#FFCDD2',
    alignItems: 'center',
  },
  fullText: {
    color: '#D32F2F',
    fontSize: 16,
    fontWeight: '600',
  },
});