/**
 * PACK 144 - Royal Club Missions Board
 * Ethical missions that reward participation and learning
 * 
 * SAFETY: No romantic/NSFW missions, no attention-seeking tasks
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";

interface Mission {
  missionId: string;
  category: string;
  title: string;
  description: string;
  requirements: {
    type: string;
    targetValue: number;
    currentValue?: number;
    timeframeHours?: number;
  };
  rewards: {
    activityScoreBonus: number;
    unlockedPerks?: string[];
  };
  expiresAt?: string;
  isActive: boolean;
}

const CATEGORY_CONFIG = {
  CLUB_PARTICIPATION: { icon: 'people', color: '#3498DB', label: 'Club Activity' },
  CHALLENGE_COMPLETION: { icon: 'trophy', color: '#F39C12', label: 'Challenges' },
  MENTORSHIP: { icon: 'school', color: '#9B59B6', label: 'Mentorship' },
  LEARNING: { icon: 'book', color: '#27AE60', label: 'Learning' },
  EVENT_ATTENDANCE: { icon: 'calendar', color: '#E74C3C', label: 'Events' },
  DIGITAL_PRODUCTS: { icon: 'cart', color: '#16A085', label: 'Products' },
  COMMUNITY_CONTRIBUTION: { icon: 'heart', color: '#E91E63', label: 'Community' }
};

export default function RoyalClubMissionsScreen() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completedMissions, setCompletedMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    loadMissions();
  }, []);

  const loadMissions = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/missions`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMissions(data.active || []);
        setCompletedMissions(data.completed || []);
      }
    } catch (error) {
      console.error('Error loading missions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadMissions();
  };

  const handleMissionPress = (mission: Mission) => {
    // Navigate to mission details or start mission
    router.push(`/royalclub/missions/${mission.missionId}` as any);
  };

  const renderMissionCard = (mission: Mission) => {
    const category = CATEGORY_CONFIG[mission.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.CLUB_PARTICIPATION;
    const progress = mission.requirements.currentValue || 0;
    const target = mission.requirements.targetValue;
    const progressPercentage = Math.min((progress / target) * 100, 100);
    const isCompleted = selectedTab === 'completed';

    return (
      <TouchableOpacity
        key={mission.missionId}
        style={styles.missionCard}
        onPress={() => handleMissionPress(mission)}
        disabled={isCompleted}
      >
        <View style={styles.missionHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: category.color + '20' }]}>
            <Ionicons name={category.icon as any} size={24} color={category.color} />
          </View>
          <View style={styles.missionInfo}>
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <Text style={styles.missionTitle}>{mission.title}</Text>
          </View>
          {isCompleted && (
            <Ionicons name="checkmark-circle" size={28} color="#27AE60" />
          )}
        </View>

        <Text style={styles.missionDescription}>{mission.description}</Text>

        {!isCompleted && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressValue}>
                {progress} / {target}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.missionFooter}>
          <View style={styles.rewardSection}>
            <Ionicons name="star" size={16} color="#F39C12" />
            <Text style={styles.rewardText}>+{mission.rewards.activityScoreBonus} Activity Score</Text>
          </View>
          {mission.expiresAt && !isCompleted && (
            <View style={styles.expirySection}>
              <Ionicons name="time-outline" size={16} color="#95A5A6" />
              <Text style={styles.expiryText}>
                Expires {new Date(mission.expiresAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Missions</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#2C3E50" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'active' && styles.tabActive]}
          onPress={() => setSelectedTab('active')}
        >
          <Text style={[styles.tabText, selectedTab === 'active' && styles.tabTextActive]}>
            Active ({missions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'completed' && styles.tabActive]}
          onPress={() => setSelectedTab('completed')}
        >
          <Text style={[styles.tabText, selectedTab === 'completed' && styles.tabTextActive]}>
            Completed ({completedMissions.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading missions...</Text>
          </View>
        ) : selectedTab === 'active' ? (
          missions.length > 0 ? (
            <View style={styles.missionsContainer}>
              {missions.map(renderMissionCard)}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>No Active Missions</Text>
              <Text style={styles.emptyText}>
                New missions will appear here. Check back soon!
              </Text>
            </View>
          )
        ) : (
          completedMissions.length > 0 ? (
            <View style={styles.missionsContainer}>
              {completedMissions.map(renderMissionCard)}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>No Completed Missions</Text>
              <Text style={styles.emptyText}>
                Complete missions to see them here
              </Text>
            </View>
          )
        )}

        {/* Mission Guidelines */}
        <View style={styles.guidelinesSection}>
          <Text style={styles.guidelinesTitle}>Mission Guidelines</Text>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
            <Text style={styles.guidelineText}>
              All missions focus on learning and community participation
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
            <Text style={styles.guidelineText}>
              Missions reward ethical engagement and activity
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
            <Text style={styles.guidelineText}>
              No missions involve attention-seeking or appearance-based tasks
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50'
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1'
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabActive: {
    borderBottomColor: '#9B59B6'
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#7F8C8D'
  },
  tabTextActive: {
    color: '#9B59B6',
    fontWeight: '600'
  },
  scrollView: {
    flex: 1
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center'
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 20
  },
  missionsContainer: {
    padding: 16,
    gap: 12
  },
  missionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  missionInfo: {
    flex: 1
  },
  categoryLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 2,
    fontWeight: '500'
  },
  missionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50'
  },
  missionDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
    marginBottom: 12
  },
  progressSection: {
    marginBottom: 12
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  progressLabel: {
    fontSize: 13,
    color: '#2C3E50',
    fontWeight: '500'
  },
  progressValue: {
    fontSize: 13,
    color: '#7F8C8D',
    fontWeight: '600'
  },
  progressBar: {
    height: 6,
    backgroundColor: '#ECF0F1',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9B59B6',
    borderRadius: 3
  },
  missionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1'
  },
  rewardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F39C12'
  },
  expirySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  expiryText: {
    fontSize: 12,
    color: '#95A5A6'
  },
  guidelinesSection: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    gap: 12
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18
  }
});
