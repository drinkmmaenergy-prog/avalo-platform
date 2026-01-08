/**
 * PACK 144 - Royal Club Status & Level Screen
 * Detailed view of user's Royal Club progress and achievements
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";

interface LevelRequirement {
  level: string;
  title: string;
  minDaysActive: number;
  minActivityScore: number;
  minClubParticipation: number;
  minEventAttendance: number;
  minMentorshipSessions: number;
  isUnlocked: boolean;
  isCurrent: boolean;
}

interface UserProgress {
  currentLevel: string;
  levelTitle: string;
  daysActive: number;
  activityScore: number;
  clubParticipation: number;
  eventAttendance: number;
  mentorshipSessions: number;
  digitalProductsPurchased: number;
  lifetimeActivityScore: number;
  lifetimeClubPosts: number;
  lifetimeChallengesCompleted: number;
}

const LEVEL_DATA = [
  { level: 'RC1_BRONZE', title: 'Bronze', icon: '🥉', color: '#CD7F32' },
  { level: 'RC2_SILVER', title: 'Silver', icon: '🥈', color: '#C0C0C0' },
  { level: 'RC3_GOLD', title: 'Gold', icon: '🥇', color: '#FFD700' },
  { level: 'RC4_DIAMOND', title: 'Diamond', icon: '💎', color: '#B9F2FF' },
  { level: 'RC5_ROYAL_ELITE', title: 'Royal Elite', icon: '👑', color: '#9B59B6' }
];

export default function RoyalClubStatusScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [requirements, setRequirements] = useState<LevelRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatusData();
  }, []);

  const loadStatusData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();

      const [progressRes, requirementsRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_API_URL}/royalclub/progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${process.env.EXPO_PUBLIC_API_URL}/royalclub/levels`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (progressRes.ok && requirementsRes.ok) {
        setProgress(await progressRes.json());
        setRequirements(await requirementsRes.json());
      }
    } catch (error) {
      console.error('Error loading status data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (current: number, required: number): number => {
    return Math.min((current / required) * 100, 100);
  };

  const renderProgressBar = (current: number, required: number, label: string) => {
    const percentage = getProgressPercentage(current, required);
    const isComplete = current >= required;

    return (
      <View style={styles.progressItem}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{label}</Text>
          <Text style={[styles.progressValue, isComplete && styles.progressComplete]}>
            {current} / {required}
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${percentage}%` }, isComplete && styles.progressBarComplete]} />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Level Status</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!progress) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Level Status</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No status data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentLevelData = LEVEL_DATA.find(l => l.level === progress.currentLevel) || LEVEL_DATA[0];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Level Status</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Current Level Card */}
        <View style={[styles.currentLevelCard, { borderColor: currentLevelData.color }]}>
          <Text style={styles.currentLevelIcon}>{currentLevelData.icon}</Text>
          <Text style={styles.currentLevelTitle}>{currentLevelData.title}</Text>
          <Text style={styles.currentLevelSubtitle}>Current Level</Text>
        </View>

        {/* Lifetime Stats */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Lifetime Achievements</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={24} color="#E74C3C" />
              <Text style={styles.statValue}>{progress.lifetimeActivityScore.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Activity Score</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="chatbubbles" size={24} color="#3498DB" />
              <Text style={styles.statValue}>{progress.lifetimeClubPosts.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Club Posts</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trophy" size={24} color="#F39C12" />
              <Text style={styles.statValue}>{progress.lifetimeChallengesCompleted.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Challenges</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="calendar" size={24} color="#9B59B6" />
              <Text style={styles.statValue}>{progress.daysActive}</Text>
              <Text style={styles.statLabel}>Days Active</Text>
            </View>
          </View>
        </View>

        {/* Requirements for Next Level */}
        {requirements.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Next Level Requirements</Text>
            <Text style={styles.sectionSubtitle}>
              Complete these milestones to reach the next level
            </Text>
            
            {requirements[0] && (
              <View style={styles.requirementsContainer}>
                {renderProgressBar(
                  progress.daysActive,
                  requirements[0].minDaysActive,
                  'Days Active'
                )}
                {renderProgressBar(
                  progress.activityScore,
                  requirements[0].minActivityScore,
                  'Activity Score'
                )}
                {renderProgressBar(
                  progress.clubParticipation,
                  requirements[0].minClubParticipation,
                  'Club Participation'
                )}
                {renderProgressBar(
                  progress.eventAttendance,
                  requirements[0].minEventAttendance,
                  'Event Attendance'
                )}
                {renderProgressBar(
                  progress.mentorshipSessions,
                  requirements[0].minMentorshipSessions,
                  'Mentorship Sessions'
                )}
              </View>
            )}
          </View>
        )}

        {/* Level Roadmap */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Level Roadmap</Text>
          <Text style={styles.sectionSubtitle}>
            All Royal Club levels and their requirements
          </Text>
          
          <View style={styles.roadmap}>
            {LEVEL_DATA.map((level, index) => {
              const requirement = requirements.find(r => r.level === level.level);
              const isUnlocked = requirement?.isUnlocked || false;
              const isCurrent = progress.currentLevel === level.level;

              return (
                <View key={level.level} style={styles.roadmapItem}>
                  <View style={[
                    styles.roadmapIcon,
                    { backgroundColor: level.color + '20' },
                    isCurrent && styles.roadmapIconCurrent
                  ]}>
                    <Text style={styles.roadmapEmoji}>{level.icon}</Text>
                  </View>
                  <View style={styles.roadmapContent}>
                    <View style={styles.roadmapHeader}>
                      <Text style={styles.roadmapTitle}>{level.title}</Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>CURRENT</Text>
                        </View>
                      )}
                      {isUnlocked && !isCurrent && (
                        <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
                      )}
                    </View>
                    {requirement && (
                      <Text style={styles.roadmapRequirements}>
                        {requirement.minDaysActive} days • {requirement.minActivityScore} score • {requirement.minClubParticipation} posts
                      </Text>
                    )}
                  </View>
                  {index < LEVEL_DATA.length - 1 && (
                    <View style={styles.roadmapConnector} />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={24} color="#27AE60" />
          <Text style={styles.infoText}>
            Your Royal Club level is based purely on engagement and participation. It does not provide any advantages in discovery, matching, or token pricing.
          </Text>
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
  scrollView: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32
  },
  emptyText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  currentLevelCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  currentLevelIcon: {
    fontSize: 64,
    marginBottom: 8
  },
  currentLevelTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 4
  },
  currentLevelSubtitle: {
    fontSize: 14,
    color: '#7F8C8D'
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 16
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginTop: 8
  },
  statLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
    textAlign: 'center'
  },
  requirementsContainer: {
    gap: 16
  },
  progressItem: {
    gap: 8
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  progressLabel: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500'
  },
  progressValue: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '600'
  },
  progressComplete: {
    color: '#27AE60'
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#ECF0F1',
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#9B59B6',
    borderRadius: 4
  },
  progressBarComplete: {
    backgroundColor: '#27AE60'
  },
  roadmap: {
    marginTop: 16
  },
  roadmapItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative'
  },
  roadmapIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  roadmapIconCurrent: {
    borderWidth: 3,
    borderColor: '#9B59B6'
  },
  roadmapEmoji: {
    fontSize: 28
  },
  roadmapContent: {
    flex: 1,
    paddingVertical: 8
  },
  roadmapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  roadmapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50'
  },
  currentBadge: {
    backgroundColor: '#9B59B6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  roadmapRequirements: {
    fontSize: 12,
    color: '#7F8C8D'
  },
  roadmapConnector: {
    position: 'absolute',
    left: 27,
    top: 56,
    bottom: -16,
    width: 2,
    backgroundColor: '#ECF0F1'
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F8F5',
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    gap: 12
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#27AE60',
    lineHeight: 18
  }
});
