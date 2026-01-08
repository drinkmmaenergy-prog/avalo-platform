/**
 * Referrals Screen
 * Shows user's referral code, stats, and sharing options
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Clipboard } from 'react-native';
import {
  getMyReferralCode,
  getMyReferralStats,
  shareReferralCode,
  type ReferralStats,
} from "@/services/referralService";

export default function ReferralsScreen() {
  const [loading, setLoading] = useState(true);
  const [referralData, setReferralData] = useState<ReferralStats | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      setLoading(true);
      const data = await getMyReferralStats();
      setReferralData(data);
    } catch (error) {
      console.error('Error loading referral data:', error);
      Alert.alert('Error', 'Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!referralData?.code) return;

    try {
      setCopying(true);
      Clipboard.setString(referralData.code);
      Alert.alert('Copied!', 'Referral code copied to clipboard');
    } catch (error) {
      console.error('Error copying code:', error);
      Alert.alert('Error', 'Failed to copy code');
    } finally {
      setCopying(false);
    }
  };

  const handleShare = async () => {
    if (!referralData?.code) return;

    try {
      await shareReferralCode(referralData.code);
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Referrals' }} />
        <ActivityIndicator size="large" color="#FF1493" />
      </View>
    );
  }

  const stats = referralData;

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Referrals' }} />

      {/* Referral Code Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Referral Code</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.code}>{referralData?.code || 'Loading...'}</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.buttonCopy]}
            onPress={handleCopyCode}
            disabled={copying || !referralData?.code}
          >
            <Text style={styles.buttonText}>
              {copying ? 'Copying...' : 'Copy Code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonShare]}
            onPress={handleShare}
            disabled={!referralData?.code}
          >
            <Text style={styles.buttonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Referral Stats</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.totalInvites || 0}</Text>
            <Text style={styles.statLabel}>Total Invites</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.verifiedInvites || 0}</Text>
            <Text style={styles.statLabel}>Verified Users</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.payingInvites || 0}</Text>
            <Text style={styles.statLabel}>Paying Users</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.totalRewardsEarned || 0}</Text>
            <Text style={styles.statLabel}>Tokens Earned</Text>
          </View>
        </View>
      </View>


      {/* How It Works Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How It Works</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>
            • Share your referral code with friends
          </Text>
          <Text style={styles.infoItem}>
            • Earn 50 tokens when they verify their account
          </Text>
          <Text style={styles.infoItem}>
            • Earn 100 tokens when they make their first payment
          </Text>
          <Text style={styles.infoItem}>
            • Become an affiliate with 5+ paying referrals
          </Text>
        </View>
      </View>

      {/* Recent Referrals */}
      {referralData && referralData.recentReferrals && referralData.recentReferrals.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Referrals</Text>
          {referralData.recentReferrals.map((referral, index) => (
            <View key={index} style={styles.referralItem}>
              <View style={styles.referralInfo}>
                <Text style={styles.referralStatus}>
                  {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                </Text>
                <Text style={styles.referralDate}>
                  {new Date(referral.joinedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  codeContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  code: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF1493',
    letterSpacing: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonCopy: {
    backgroundColor: '#3B82F6',
  },
  buttonShare: {
    backgroundColor: '#10B981',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF1493',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  affiliateCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  affiliateLevel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F59E0B',
    textAlign: 'center',
    marginBottom: 8,
  },
  affiliateStats: {
    marginTop: 8,
  },
  affiliateStatText: {
    fontSize: 14,
    color: '#78350F',
    textAlign: 'center',
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  referralItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  referralInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referralStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  referralDate: {
    fontSize: 12,
    color: '#6B7280',
  },
});
