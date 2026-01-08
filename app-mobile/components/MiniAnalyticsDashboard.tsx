/**
 * Mini Analytics Dashboard Component
 * Shows user engagement stats: swipes, matches, tokens earned
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

interface AnalyticsData {
  totalSwipes: number;
  totalMatches: number;
  tokensEarned: number;
  tokensSpent: number;
  callEarnings: number;
  totalCalls: number;
}

interface MiniAnalyticsDashboardProps {
  userId: string;
}

export default function MiniAnalyticsDashboard({ userId }: MiniAnalyticsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AnalyticsData>({
    totalSwipes: 0,
    totalMatches: 0,
    tokensEarned: 0,
    tokensSpent: 0,
    callEarnings: 0,
    totalCalls: 0,
  });

  useEffect(() => {
    loadAnalytics();
  }, [userId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const db = getDb();

      // Calculate 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get swipe count (likes + skips)
      const likesQuery = query(
        collection(db, 'likes'),
        where('likerUid', '==', userId)
      );
      const skipsQuery = query(
        collection(db, 'skips'),
        where('skipperUid', '==', userId)
      );

      const [likesSnap, skipsSnap] = await Promise.all([
        getDocs(likesQuery),
        getDocs(skipsQuery),
      ]);

      const totalSwipes = likesSnap.size + skipsSnap.size;

      // Get match count
      const matchesQuery = query(
        collection(db, 'matches'),
        where('users', 'array-contains', userId)
      );
      const matchesSnap = await getDocs(matchesQuery);
      const totalMatches = matchesSnap.size;

      // Get tokens earned (as receiver)
      const earningsQuery = query(
        collection(db, 'transactions'),
        where('receiverUid', '==', userId)
      );
      const earningsSnap = await getDocs(earningsQuery);
      
      let tokensEarned = 0;
      earningsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.transactionType !== 'purchase') {
          tokensEarned += (data.tokensAmount - data.avaloFee) || 0;
        }
      });

      // Get tokens spent (as sender)
      const spendingQuery = query(
        collection(db, 'transactions'),
        where('senderUid', '==', userId)
      );
      const spendingSnap = await getDocs(spendingQuery);
      
      let tokensSpent = 0;
      spendingSnap.forEach((doc) => {
        const data = doc.data();
        if (data.transactionType !== 'purchase') {
          tokensSpent += data.tokensAmount || 0;
        }
      });

      // Get call earnings
      let callEarnings = 0;
      let totalCalls = 0;
      
      try {
        const callEarningsQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
          where('type', '==', 'call_earning')
        );
        const callEarningsSnap = await getDocs(callEarningsQuery);
        
        callEarningsSnap.forEach((doc) => {
          const data = doc.data();
          callEarnings += data.amount || 0;
          totalCalls++;
        });
      } catch (error) {
        console.error('Error loading call earnings:', error);
      }

      setStats({
        totalSwipes,
        totalMatches,
        tokensEarned,
        tokensSpent,
        callEarnings,
        totalCalls,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📊 Your Stats (Last 30 Days)</Text>
      
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalSwipes}</Text>
          <Text style={styles.statLabel}>Swipes</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalMatches}</Text>
          <Text style={styles.statLabel}>Matches</Text>
        </View>

        <View style={[styles.statCard, styles.earnedCard]}>
          <Text style={[styles.statValue, styles.earnedValue]}>
            +{stats.tokensEarned}
          </Text>
          <Text style={styles.statLabel}>Tokens Earned</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>-{stats.tokensSpent}</Text>
          <Text style={styles.statLabel}>Tokens Spent</Text>
        </View>
      </View>

      {/* Call Earnings Section */}
      {stats.callEarnings > 0 && (
        <View style={styles.callSection}>
          <Text style={styles.callSectionTitle}>📞 Połączenia</Text>
          <View style={styles.callStats}>
            <View style={styles.callStat}>
              <Text style={styles.callStatValue}>{stats.totalCalls}</Text>
              <Text style={styles.callStatLabel}>Liczba połączeń</Text>
            </View>
            <View style={styles.callStat}>
              <Text style={[styles.callStatValue, styles.callEarnings]}>
                +{stats.callEarnings}
              </Text>
              <Text style={styles.callStatLabel}>Zarobione tokeny</Text>
            </View>
          </View>
        </View>
      )}

      {stats.totalMatches > 0 && (
        <Text style={styles.matchRate}>
          Match Rate: {((stats.totalMatches / stats.totalSwipes) * 100).toFixed(1)}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  earnedCard: {
    backgroundColor: '#E8F5E9',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  earnedValue: {
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  matchRate: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  callSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  callSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  callStats: {
    flexDirection: 'row',
    gap: 12,
  },
  callStat: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  callStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  callEarnings: {
    color: '#40E0D0',
  },
  callStatLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
});
