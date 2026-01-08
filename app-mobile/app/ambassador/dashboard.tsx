/**
 * PACK 202 - Ambassador Dashboard
 * 
 * Professional dashboard for ambassadors to track their performance,
 * referrals, and program progress.
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
  Share
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

interface AmbassadorStats {
  totalReferrals: number;
  activeReferrals: number;
  totalRevenue: number;
  totalCommission: number;
  commissionPending: number;
  modulesCompleted: number;
  totalModules: number;
  complianceScore: number;
}

interface ReferralActivity {
  type: 'referral_joined' | 'revenue_earned' | 'commission_paid';
  username: string;
  amount?: number;
  timestamp: Date;
}

export default function AmbassadorDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ambassador, setAmbassador] = useState<any>(null);
  const [stats, setStats] = useState<AmbassadorStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ReferralActivity[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) return;

      const db = getFirestore();
      
      // Get ambassador profile
      const ambassadorQuery = query(
        collection(db, 'ambassadors'),
        where('userId', '==', user.uid),
        where('status', '==', 'approved'),
        limit(1)
      );
      const ambassadorSnapshot = await getDocs(ambassadorQuery);
      
      if (ambassadorSnapshot.empty) {
        router.replace('/ambassador/apply');
        return;
      }

      const ambassadorData = {
        id: ambassadorSnapshot.docs[0].id,
        ...ambassadorSnapshot.docs[0].data()
      };
      setAmbassador(ambassadorData);

      // Get stats
      const statsDoc = await getDoc(doc(db, 'ambassador_dashboard_stats', ambassadorData.id));
      if (statsDoc.exists()) {
        setStats(statsDoc.data() as AmbassadorStats);
      } else {
        // Calculate basic stats from ambassador data
        setStats({
          totalReferrals: ambassadorData.totalReferrals || 0,
          activeReferrals: 0,
          totalRevenue: ambassadorData.totalRevenue || 0,
          totalCommission: ambassadorData.totalCommission || 0,
          commissionPending: 0,
          modulesCompleted: ambassadorData.academyProgress?.completedModules?.length || 0,
          totalModules: 8,
          complianceScore: 100
        });
      }

      // Get recent activity
      const referralsQuery = query(
        collection(db, 'ambassador_referrals'),
        where('ambassadorId', '==', ambassadorData.id),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const referralsSnapshot = await getDocs(referralsQuery);
      
      const activities: ReferralActivity[] = referralsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          type: 'referral_joined' as const,
          username: data.referredUserId.substring(0, 8),
          timestamp: data.createdAt?.toDate() || new Date()
        };
      });
      
      setRecentActivity(activities);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const handleShareReferralCode = async () => {
    if (!ambassador?.referralCode) return;

    try {
      await Share.share({
        message: `Join Avalo with my referral code: ${ambassador.referralCode}\n\nAvalo is a professional creator platform for educational content, coaching, and skill-sharing. Use my code to get started!`,
        title: 'Join Avalo'
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
      </View>
    );
  }

  if (!ambassador) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ambassador Dashboard',
          headerBackTitle: 'Back'
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Badge Display */}
        <View style={styles.badgeCard}>
          <View style={styles.badgeIcon}>
            <Ionicons name="ribbon" size={40} color="#f39c12" />
          </View>
          <View style={styles.badgeInfo}>
            <Text style={styles.badgeLabel}>Early Builder</Text>
            <Text style={styles.badgeSubtext}>Avalo Ambassador</Text>
          </View>
        </View>

        {/* Referral Code Card */}
        <View style={styles.referralCard}>
          <View style={styles.referralHeader}>
            <Text style={styles.referralTitle}>Your Referral Code</Text>
            <TouchableOpacity onPress={handleShareReferralCode}>
              <Ionicons name="share-social" size={24} color="#3498db" />
            </TouchableOpacity>
          </View>
          <View style={styles.referralCodeContainer}>
            <Text style={styles.referralCode}>{ambassador.referralCode}</Text>
          </View>
          <Text style={styles.referralHint}>
            Share your code to earn 5% commission on referrals' revenue
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#3498db" />
            <Text style={styles.statValue}>{stats?.totalReferrals || 0}</Text>
            <Text style={styles.statLabel}>Total Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={24} color="#00b894" />
            <Text style={styles.statValue}>{stats?.activeReferrals || 0}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={24} color="#f39c12" />
            <Text style={styles.statValue}>
              ${((stats?.totalCommission || 0) / 100).toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="hourglass" size={24} color="#9b59b6" />
            <Text style={styles.statValue}>
              ${((stats?.commissionPending || 0) / 100).toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {/* Academy Progress */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Growth Academy</Text>
            <TouchableOpacity onPress={() => router.push('/ambassador/academy')}>
              <Text style={styles.cardLink}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((stats?.modulesCompleted || 0) / (stats?.totalModules || 1)) * 100}%`
                  }
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {stats?.modulesCompleted || 0} of {stats?.totalModules || 8} modules completed
            </Text>
          </View>
        </View>

        {/* Compliance Score */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Compliance Score</Text>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreValue}>{stats?.complianceScore || 100}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
          </View>
          <Text style={styles.complianceText}>
            Excellent standing. Continue following ambassador guidelines.
          </Text>
        </View>

        {/* Recent Activity */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/ambassador/referrals')}>
              <Text style={styles.cardLink}>View All</Text>
            </TouchableOpacity>
          </View>
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <View key={index} style={styles.activityItem}>
                <View style={styles.activityIcon}>
                  <Ionicons
                    name={
                      activity.type === 'referral_joined'
                        ? 'person-add'
                        : activity.type === 'revenue_earned'
                        ? 'trending-up'
                        : 'cash'
                    }
                    size={20}
                    color="#3498db"
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>
                    {activity.type === 'referral_joined'
                      ? 'New Referral'
                      : activity.type === 'revenue_earned'
                      ? 'Revenue Generated'
                      : 'Commission Paid'}
                  </Text>
                  <Text style={styles.activitySubtext}>
                    {activity.username}
                    {activity.amount && ` • $${(activity.amount / 100).toFixed(2)}`}
                  </Text>
                </View>
                <Text style={styles.activityTime}>
                  {formatTimestamp(activity.timestamp)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No recent activity</Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/ambassador/referrals')}
          >
            <Ionicons name="people-outline" size={24} color="#3498db" />
            <Text style={styles.actionText}>View Referrals</Text>
            <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/ambassador/academy')}
          >
            <Ionicons name="school-outline" size={24} color="#3498db" />
            <Text style={styles.actionText}>Growth Academy</Text>
            <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShareReferralCode}
          >
            <Ionicons name="share-social-outline" size={24} color="#3498db" />
            <Text style={styles.actionText}>Share Referral Code</Text>
            <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  content: {
    padding: 16,
    paddingBottom: 32
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  badgeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fef5e7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  badgeInfo: {
    flex: 1
  },
  badgeLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50'
  },
  badgeSubtext: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 2
  },
  referralCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  referralTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50'
  },
  referralCodeContainer: {
    backgroundColor: '#ebf5fb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  referralCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3498db',
    letterSpacing: 2
  },
  referralHint: {
    fontSize: 12,
    color: '#7f8c8d',
    textAlign: 'center'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 8
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 4,
    textAlign: 'center'
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50'
  },
  cardLink: {
    fontSize: 14,
    color: '#3498db',
    fontWeight: '500'
  },
  progressContainer: {
    gap: 8
  },
  progressBar: {
    height: 8,
    backgroundColor: '#ecf0f1',
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3498db',
    borderRadius: 4
  },
  progressText: {
    fontSize: 14,
    color: '#7f8c8d'
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline'
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00b894'
  },
  scoreMax: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 2
  },
  complianceText: {
    fontSize: 14,
    color: '#7f8c8d'
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1'
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ebf5fb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  activityContent: {
    flex: 1
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50'
  },
  activitySubtext: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2
  },
  activityTime: {
    fontSize: 12,
    color: '#95a5a6'
  },
  emptyText: {
    fontSize: 14,
    color: '#95a5a6',
    textAlign: 'center',
    paddingVertical: 20
  },
  actionsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1'
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    marginLeft: 12
  }
});
