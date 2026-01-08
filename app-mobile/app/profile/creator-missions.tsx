/**
 * Creator Missions Screen
 * 
 * Displays:
 * - Active daily and weekly missions
 * - Progress tracking
 * - Streak counters
 * - Mission history
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import CreatorMissionCard, { MissionStatus, MissionType } from "@/components/CreatorMissionCard";

interface Mission {
  missionId: string;
  title: string;
  description: string;
  missionType: MissionType;
  status: MissionStatus;
  progress: {
    current: number;
    target: number;
    percentage: number;
  };
  reward: {
    lp: number;
  };
  expiresAt: Date;
}

interface MissionProfile {
  creatorId: string;
  level: string;
  slots: {
    daily: number;
    weekly: number;
  };
  streaks: {
    dailyStreak: number;
    weeklyStreak: number;
    bestDailyStreak: number;
    bestWeeklyStreak: number;
  };
  totalLPEarned: number;
  totalCompleted: {
    daily: number;
    weekly: number;
  };
}

export default function CreatorMissionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<MissionProfile | null>(null);
  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [selectedTab, setSelectedTab] = useState<'daily' | 'weekly'>('daily');

  useEffect(() => {
    loadMissions();
  }, []);

  const loadMissions = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // TODO: Call Cloud Function to get missions
      // const { data } = await getCreatorMissions();
      
      // Mock data for development
      const mockProfile: MissionProfile = {
        creatorId: 'user123',
        level: 'gold',
        slots: { daily: 4, weekly: 2 },
        streaks: {
          dailyStreak: 7,
          weeklyStreak: 3,
          bestDailyStreak: 14,
          bestWeeklyStreak: 5,
        },
        totalLPEarned: 12500,
        totalCompleted: { daily: 45, weekly: 12 },
      };

      const mockMissions: Mission[] = [
        {
          missionId: '1',
          title: 'Reply to 20 paid messages',
          description: 'Respond to 20 messages from paying supporters today',
          missionType: 'daily',
          status: 'active',
          progress: { current: 15, target: 20, percentage: 75 },
          reward: { lp: 150 },
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
        {
          missionId: '2',
          title: 'Host a 10-minute Live',
          description: 'Stream live for at least 10 minutes with viewers',
          missionType: 'daily',
          status: 'completed',
          progress: { current: 10, target: 10, percentage: 100 },
          reward: { lp: 250 },
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
        {
          missionId: '3',
          title: 'Post 1 new story',
          description: 'Share a new story to keep your audience engaged',
          missionType: 'daily',
          status: 'active',
          progress: { current: 0, target: 1, percentage: 0 },
          reward: { lp: 75 },
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
        {
          missionId: '4',
          title: 'Earn 5,000 tokens',
          description: 'Accumulate 5,000 tokens in earnings this week',
          missionType: 'weekly',
          status: 'active',
          progress: { current: 2800, target: 5000, percentage: 56 },
          reward: { lp: 1500 },
          expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        },
        {
          missionId: '5',
          title: 'Get 3 Fan Club subscriptions',
          description: 'Convert 3 new supporters to Fan Club members',
          missionType: 'weekly',
          status: 'active',
          progress: { current: 1, target: 3, percentage: 33 },
          reward: { lp: 2500 },
          expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        },
      ];

      setProfile(mockProfile);
      setActiveMissions(mockMissions);
    } catch (error) {
      console.error('Failed to load missions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleClaimReward = async (missionId: string) => {
    try {
      // TODO: Call Cloud Function to claim reward
      // await claimMissionReward({ missionId });
      
      // Update local state
      setActiveMissions(prev =>
        prev.map(m =>
          m.missionId === missionId
            ? { ...m, status: 'claimed' as MissionStatus }
            : m
        )
      );

      // Show success message
      console.log(`Claimed reward for mission ${missionId}`);
    } catch (error) {
      console.error('Failed to claim reward:', error);
    }
  };

  const handleRefresh = () => {
    loadMissions(true);
  };

  const filteredMissions = activeMissions.filter(
    m => m.missionType === selectedTab
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading missions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Creator Missions</Text>
        <Text style={styles.subtitle}>Earn LP by completing tasks</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Streak Section */}
        {profile && (
          <View style={styles.streakSection}>
            <View style={styles.streakCard}>
              <Text style={styles.streakIcon}>🔥</Text>
              <View style={styles.streakInfo}>
                <Text style={styles.streakLabel}>Daily Streak</Text>
                <Text style={styles.streakValue}>
                  {profile.streaks.dailyStreak} days
                </Text>
                <Text style={styles.streakBest}>
                  Best: {profile.streaks.bestDailyStreak} days
                </Text>
              </View>
            </View>
            
            <View style={styles.streakCard}>
              <Text style={styles.streakIcon}>⭐</Text>
              <View style={styles.streakInfo}>
                <Text style={styles.streakLabel}>Weekly Streak</Text>
                <Text style={styles.streakValue}>
                  {profile.streaks.weeklyStreak} weeks
                </Text>
                <Text style={styles.streakBest}>
                  Best: {profile.streaks.bestWeeklyStreak} weeks
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Stats Section */}
        {profile && (
          <View style={styles.statsSection}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{profile.totalLPEarned.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total LP Earned</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {profile.totalCompleted.daily + profile.totalCompleted.weekly}
              </Text>
              <Text style={styles.statLabel}>Missions Completed</Text>
            </View>
          </View>
        )}

        {/* Tab Selector */}
        <View style={styles.tabSelector}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'daily' && styles.tabActive]}
            onPress={() => setSelectedTab('daily')}
          >
            <Text style={[styles.tabText, selectedTab === 'daily' && styles.tabTextActive]}>
              ⚡ Daily ({activeMissions.filter(m => m.missionType === 'daily').length})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'weekly' && styles.tabActive]}
            onPress={() => setSelectedTab('weekly')}
          >
            <Text style={[styles.tabText, selectedTab === 'weekly' && styles.tabTextActive]}>
              🎯 Weekly ({activeMissions.filter(m => m.missionType === 'weekly').length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Missions List */}
        <View style={styles.missionsSection}>
          {filteredMissions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {selectedTab === 'daily' ? '⚡' : '🎯'}
              </Text>
              <Text style={styles.emptyTitle}>No {selectedTab} missions</Text>
              <Text style={styles.emptyText}>
                {selectedTab === 'daily'
                  ? 'New daily missions will be available tomorrow'
                  : 'New weekly missions will be available on Monday'}
              </Text>
            </View>
          ) : (
            filteredMissions.map(mission => (
              <CreatorMissionCard
                key={mission.missionId}
                mission={mission}
                onClaim={handleClaimReward}
              />
            ))
          )}
        </View>

        {/* How it Works Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How Missions Work</Text>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Daily Missions</Text> reset at 00:00 local time
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🎯</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Weekly Missions</Text> reset every Sunday at 23:59
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🏆</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Level Up</Text> to unlock more mission slots
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>💰</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>LP rewards</Text> help you progress through creator levels
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🔥</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Maintain streaks</Text> by completing missions daily/weekly
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  streakSection: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  streakCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  streakIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  streakInfo: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  streakValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  streakBest: {
    fontSize: 10,
    color: '#999',
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  tabSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF5F5',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#FF6B6B',
  },
  missionsSection: {
    paddingHorizontal: 20,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 20,
    marginBottom: 40,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
    color: '#333',
  },
});
