/**
 * PACK 144 - Royal Club Overview Screen
 * Main dashboard for Royal Club luxury loyalty system
 * 
 * CONSTRAINTS:
 * - No token discounts displayed
 * - No visibility advantages mentioned
 * - No romantic/NSFW content
 * - Focus on lifestyle and prestige perks
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";

interface RoyalClubStatus {
  currentLevel: string;
  levelTitle: string;
  activityScore: number;
  nextLevelScore: number;
  daysActive: number;
  clubParticipation: number;
  eventAttendance: number;
  mentorshipSessions: number;
  completedMissions: number;
  activeMissions: number;
  unlockedPerks: number;
}

const LEVEL_COLORS = {
  RC1_BRONZE: ['#CD7F32', '#8B4513'],
  RC2_SILVER: ['#C0C0C0', '#808080'],
  RC3_GOLD: ['#FFD700', '#DAA520'],
  RC4_DIAMOND: ['#B9F2FF', '#4A90E2'],
  RC5_ROYAL_ELITE: ['#9B59B6', '#6C3483']
};

const LEVEL_ICONS = {
  RC1_BRONZE: '🥉',
  RC2_SILVER: '🥈',
  RC3_GOLD: '🥇',
  RC4_DIAMOND: '💎',
  RC5_ROYAL_ELITE: '👑'
};

export default function RoyalClubOverviewScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<RoyalClubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoyalClubStatus();
  }, []);

  const loadRoyalClubStatus = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/status`,
        {
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error loading Royal Club status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading Royal Club...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!status) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👑</Text>
          <Text style={styles.emptyTitle}>Welcome to Royal Club</Text>
          <Text style={styles.emptyDescription}>
            A luxury loyalty experience that rewards your engagement and participation in the Avalo community.
          </Text>
          <Text style={styles.emptyNote}>
            Continue being active to unlock your Royal Club membership.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentColors = LEVEL_COLORS[status.currentLevel as keyof typeof LEVEL_COLORS] || LEVEL_COLORS.RC1_BRONZE;
  const levelIcon = LEVEL_ICONS[status.currentLevel as keyof typeof LEVEL_ICONS] || '🥉';
  const progressPercentage = (status.activityScore / status.nextLevelScore) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header with Level Badge */}
        <View style={[styles.header, { backgroundColor: currentColors[0] }]}>
          <View style={styles.headerContent}>
            <Text style={styles.headerIcon}>{levelIcon}</Text>
            <Text style={styles.headerTitle}>{status.levelTitle}</Text>
            <Text style={styles.headerSubtitle}>Royal Club Member</Text>
          </View>
        </View>

        {/* Progress to Next Level */}
        <View style={styles.progressSection}>
          <Text style={styles.sectionTitle}>Progress to Next Level</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progressPercentage, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {status.activityScore} / {status.nextLevelScore} Activity Score
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Ionicons name="calendar-outline" size={24} color="#9B59B6" />
            <Text style={styles.statValue}>{status.daysActive}</Text>
            <Text style={styles.statLabel}>Days Active</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={24} color="#3498DB" />
            <Text style={styles.statValue}>{status.clubParticipation}</Text>
            <Text style={styles.statLabel}>Club Posts</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar-outline" size={24} color="#E74C3C" />
            <Text style={styles.statValue}>{status.eventAttendance}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="school-outline" size={24} color="#F39C12" />
            <Text style={styles.statValue}>{status.mentorshipSessions}</Text>
            <Text style={styles.statLabel}>Mentorship</Text>
          </View>
        </View>

        {/* Action Cards */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/royalclub/missions' as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="trophy-outline" size={28} color="#F39C12" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Active Missions</Text>
              <Text style={styles.actionSubtitle}>{status.activeMissions} missions available</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#95A5A6" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/royalclub/perks' as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="gift-outline" size={28} color="#9B59B6" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Lifestyle Perks</Text>
              <Text style={styles.actionSubtitle}>{status.unlockedPerks} perks unlocked</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#95A5A6" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/royalclub/status' as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="stats-chart-outline" size={28} color="#3498DB" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Level Status</Text>
              <Text style={styles.actionSubtitle}>View your progress details</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#95A5A6" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/royalclub/settings' as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="settings-outline" size={28} color="#7F8C8D" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Royal Settings</Text>
              <Text style={styles.actionSubtitle}>Customize your experience</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#95A5A6" />
          </TouchableOpacity>
        </View>

        {/* Information Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={24} color="#3498DB" />
          <Text style={styles.infoText}>
            Royal Club is a luxury lifestyle experience. Your level does not affect platform visibility, matching, or token pricing.
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
    color: '#7F8C8D',
    marginTop: 16
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'center'
  },
  emptyDescription: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24
  },
  emptyNote: {
    fontSize: 14,
    color: '#95A5A6',
    textAlign: 'center',
    fontStyle: 'italic'
  },
  header: {
    padding: 32,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24
  },
  headerContent: {
    alignItems: 'center'
  },
  headerIcon: {
    fontSize: 64,
    marginBottom: 8
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9
  },
  progressSection: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12
  },
  progressBar: {
    height: 8,
    backgroundColor: '#ECF0F1',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9B59B6',
    borderRadius: 4
  },
  progressText: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center'
  },
  statsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  statValue: {
    fontSize: 24,
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
  actionsSection: {
    padding: 16,
    gap: 12
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  actionContent: {
    flex: 1
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#7F8C8D'
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EBF5FB',
    padding: 16,
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    gap: 12
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#2874A6',
    lineHeight: 18
  }
});
