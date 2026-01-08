/**
 * PACK 179 — Reputation Center
 * Main screen showing user's reputation, badges, and achievements
 * 
 * Public Trust Without Shaming · Positive Achievements Only
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ReputationBadge,
  AchievementMilestone,
  PublicReputation,
  BADGE_DEFINITIONS,
  CATEGORY_DEFINITIONS,
  timestampToDate
} from "@/types/reputation";

export default function ReputationCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publicReputation, setPublicReputation] = useState<PublicReputation | null>(null);
  const [badges, setBadges] = useState<ReputationBadge[]>([]);
  const [milestones, setMilestones] = useState<AchievementMilestone[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'badges' | 'achievements'>('overview');

  useEffect(() => {
    if (user) {
      loadReputationData();
    }
  }, [user]);

  const loadReputationData = async () => {
    try {
      setLoading(true);

      const getPublicReputationFn = httpsCallable(functions, 'getPublicReputation');
      const result = await getPublicReputationFn({ userId: user?.uid });
      const data = result.data as any;

      if (data.success && data.reputation) {
        setPublicReputation(data.reputation);
      }

      const badgesQuery = query(
        collection(db, 'reputation_badges'),
        where('userId', '==', user?.uid),
        orderBy('earnedAt', 'desc')
      );
      const badgesSnapshot = await getDocs(badgesQuery);
      const badgesData = badgesSnapshot.docs.map(doc => doc.data() as ReputationBadge);
      setBadges(badgesData);

      const milestonesQuery = query(
        collection(db, 'achievement_milestones'),
        where('userId', '==', user?.uid),
        orderBy('achievedAt', 'desc')
      );
      const milestonesSnapshot = await getDocs(milestonesQuery);
      const milestonesData = milestonesSnapshot.docs.map(doc => doc.data() as AchievementMilestone);
      setMilestones(milestonesData);
    } catch (error) {
      console.error('Error loading reputation data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReputationData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Reputation...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reputation Center</Text>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => router.push('/reputation/settings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'badges' && styles.tabActive]}
          onPress={() => setActiveTab('badges')}
        >
          <Text style={[styles.tabText, activeTab === 'badges' && styles.tabTextActive]}>
            Badges ({badges.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'achievements' && styles.tabActive]}
          onPress={() => setActiveTab('achievements')}
        >
          <Text style={[styles.tabText, activeTab === 'achievements' && styles.tabTextActive]}>
            Achievements ({milestones.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'overview' && (
          <OverviewTab
            publicReputation={publicReputation}
            badges={badges}
            milestones={milestones}
          />
        )}
        {activeTab === 'badges' && <BadgesTab badges={badges} />}
        {activeTab === 'achievements' && <AchievementsTab milestones={milestones} />}
      </ScrollView>

      <View style={styles.privacyNotice}>
        <Text style={styles.privacyText}>
          🔒 Your safety scores, moderation history, and financial data are always private
        </Text>
      </View>
    </View>
  );
}

function OverviewTab({
  publicReputation,
  badges,
  milestones
}: {
  publicReputation: PublicReputation | null;
  badges: ReputationBadge[];
  milestones: AchievementMilestone[];
}) {
  return (
    <View style={styles.overviewContainer}>
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Your Reputation</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{badges.length}</Text>
            <Text style={styles.statLabel}>Badges Earned</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{milestones.length}</Text>
            <Text style={styles.statLabel}>Milestones</Text>
          </View>
        </View>
        {publicReputation?.verificationStatus && (
          <View style={styles.verificationStatus}>
            <Text style={styles.verificationTitle}>Verification Status</Text>
            {publicReputation.verificationStatus.identityVerified && (
              <View style={styles.verificationItem}>
                <Text style={styles.verificationIcon}>✓</Text>
                <Text style={styles.verificationText}>Identity Verified</Text>
              </View>
            )}
            {publicReputation.verificationStatus.skillsVerified && (
              <View style={styles.verificationItem}>
                <Text style={styles.verificationIcon}>✓</Text>
                <Text style={styles.verificationText}>Skills Verified</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Badges</Text>
          {badges.slice(0, 3).map((badge) => (
            <BadgeCard key={badge.badgeId} badge={badge} />
          ))}
        </View>
      )}

      {milestones.filter(m => m.verified).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Achievements</Text>
          {milestones.filter(m => m.verified).slice(0, 3).map((milestone) => (
            <AchievementCard key={milestone.milestoneId} milestone={milestone} />
          ))}
        </View>
      )}

      {badges.length === 0 && milestones.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyTitle}>Build Your Reputation</Text>
          <Text style={styles.emptyText}>
            Complete courses, create content, and participate in the community to earn badges and achievements
          </Text>
        </View>
      )}
    </View>
  );
}

function BadgesTab({ badges }: { badges: ReputationBadge[] }) {
  if (badges.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🏅</Text>
        <Text style={styles.emptyTitle}>No Badges Yet</Text>
        <Text style={styles.emptyText}>
          Earn badges by completing verification, creating content, and contributing to the community
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listContainer}>
      {badges.map((badge) => (
        <BadgeCard key={badge.badgeId} badge={badge} showDetails />
      ))}
    </View>
  );
}

function AchievementsTab({ milestones }: { milestones: AchievementMilestone[] }) {
  if (milestones.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🎖️</Text>
        <Text style={styles.emptyTitle}>No Achievements Yet</Text>
        <Text style={styles.emptyText}>
          Track your progress and celebrate milestones as you grow on Avalo
        </Text>
      </View>
    );
  }

  const categorizedMilestones = milestones.reduce((acc, milestone) => {
    if (!acc[milestone.category]) {
      acc[milestone.category] = [];
    }
    acc[milestone.category].push(milestone);
    return acc;
  }, {} as Record<string, AchievementMilestone[]>);

  return (
    <View style={styles.listContainer}>
      {Object.entries(categorizedMilestones).map(([category, items]) => {
        const categoryDef = CATEGORY_DEFINITIONS[category as keyof typeof CATEGORY_DEFINITIONS];
        return (
          <View key={category} style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryIcon}>{categoryDef?.icon}</Text>
              <Text style={styles.categoryName}>{categoryDef?.name}</Text>
              <Text style={styles.categoryCount}>({items.length})</Text>
            </View>
            {items.map((milestone) => (
              <AchievementCard key={milestone.milestoneId} milestone={milestone} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function BadgeCard({ badge, showDetails }: { badge: ReputationBadge; showDetails?: boolean }) {
  const badgeDef = BADGE_DEFINITIONS[badge.badgeType];
  const earnedDate = timestampToDate(badge.earnedAt);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{badge.badgeIcon}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{badge.badgeName}</Text>
          {badge.verified && (
            <Text style={styles.verifiedBadge}>✓ Verified</Text>
          )}
        </View>
      </View>
      {showDetails && (
        <>
          <Text style={styles.cardDescription}>{badge.badgeDescription}</Text>
          <Text style={styles.cardDate}>
            Earned {earnedDate.toLocaleDateString()}
          </Text>
        </>
      )}
    </View>
  );
}

function AchievementCard({ milestone }: { milestone: AchievementMilestone }) {
  const achievedDate = timestampToDate(milestone.achievedAt);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{milestone.title}</Text>
          {milestone.verified && (
            <Text style={styles.verifiedBadge}>✓ Verified</Text>
          )}
          {!milestone.isPublic && (
            <Text style={styles.privateBadge}>🔒 Private</Text>
          )}
        </View>
      </View>
      <Text style={styles.cardDescription}>{milestone.description}</Text>
      <Text style={styles.cardDate}>
        Achieved {achievedDate.toLocaleDateString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000'
  },
  settingsButton: {
    padding: 8
  },
  settingsIcon: {
    fontSize: 24
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF'
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600'
  },
  content: {
    flex: 1
  },
  overviewContainer: {
    padding: 16
  },
  statsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16
  },
  statItem: {
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#007AFF'
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4
  },
  verificationStatus: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16
  },
  verificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  verificationIcon: {
    fontSize: 16,
    color: '#4CAF50',
    marginRight: 8
  },
  verificationText: {
    fontSize: 14,
    color: '#333'
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12
  },
  listContainer: {
    padding: 16
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 12
  },
  cardInfo: {
    flex: 1
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20
  },
  cardDate: {
    fontSize: 12,
    color: '#999'
  },
  verifiedBadge: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600'
  },
  privateBadge: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    marginTop: 2
  },
  categorySection: {
    marginBottom: 24
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 8
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000'
  },
  categoryCount: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20
  },
  privacyNotice: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2196F3'
  },
  privacyText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center'
  }
});
