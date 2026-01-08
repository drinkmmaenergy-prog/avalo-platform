/**
 * PACK 131: Affiliate Dashboard
 * Shows affiliate stats, analytics, and payout history
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface AffiliateProfile {
  affiliateId: string;
  affiliateCode: string;
  status: 'pending' | 'active' | 'suspended' | 'banned';
  canViewAnalytics: boolean;
}

interface Analytics {
  totalReferrals: number;
  verifiedReferrals: number;
  pendingVerifications: number;
  retentionDay1Count: number;
  retentionDay7Count: number;
  retentionDay30Count: number;
  totalEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  flaggedReferrals: number;
}

export default function AffiliateDashboard() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month' | 'all_time'>('week');
  const [referralUrl, setReferralUrl] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    try {
      const functions = getFunctions();
      
      // Get affiliate profile (would need to fetch from Firestore)
      // For now, mock data
      const mockProfile: AffiliateProfile = {
        affiliateId: 'aff_123',
        affiliateCode: 'ABC12345',
        status: 'active',
        canViewAnalytics: true,
      };
      setProfile(mockProfile);

      // Generate referral link
      const generateLink = httpsCallable(functions, 'affiliateGenerateLink');
      const linkResult = await generateLink({ affiliateId: mockProfile.affiliateId });
      setReferralUrl((linkResult.data as any).referralUrl);

      // Get analytics
      const getAnalytics = httpsCallable(functions, 'affiliateGetAnalytics');
      const analyticsResult = await getAnalytics({
        affiliateId: mockProfile.affiliateId,
        period: selectedPeriod,
      });
      setAnalytics(analyticsResult.data as Analytics);

    } catch (error) {
      console.error('Error loading affiliate data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRequestPayout = async () => {
    try {
      const functions = getFunctions();
      const requestPayout = httpsCallable(functions, 'affiliateRequestPayout');
      
      const result = await requestPayout({
        affiliateId: profile?.affiliateId,
      });

      alert(`Payout requested: $${(result.data as any).amount / 100} for ${(result.data as any).referralCount} referrals`);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to request payout');
    }
  };

  const handleCopyLink = () => {
    // Would use Clipboard API in production
    alert(`Link copied: ${referralUrl}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No affiliate profile found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Affiliate Dashboard</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile.status) }]}>
          <Text style={styles.statusText}>{profile.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Referral Link */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Referral Link</Text>
        <View style={styles.linkContainer}>
          <Text style={styles.linkText} numberOfLines={1}>
            {referralUrl}
          </Text>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
            <Text style={styles.copyButtonText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.affiliateCode}>Code: {profile.affiliateCode}</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['day', 'week', 'month', 'all_time'] as const).map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === period && styles.periodButtonTextActive,
              ]}
            >
              {period === 'all_time' ? 'All Time' : period.charAt(0).toUpperCase() + period.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Analytics */}
      {analytics && (
        <>
          {/* Referral Stats */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Referrals</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.totalReferrals}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.verifiedReferrals}</Text>
                <Text style={styles.statLabel}>Verified</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.pendingVerifications}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>
          </View>

          {/* Retention Stats */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Retention</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.retentionDay1Count}</Text>
                <Text style={styles.statLabel}>Day 1</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.retentionDay7Count}</Text>
                <Text style={styles.statLabel}>Day 7</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analytics.retentionDay30Count}</Text>
                <Text style={styles.statLabel}>Day 30</Text>
              </View>
            </View>
          </View>

          {/* Earnings */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earnings</Text>
            <View style={styles.earningsContainer}>
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>Total Earned</Text>
                <Text style={styles.earningsValue}>
                  ${(analytics.totalEarnings / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>Pending</Text>
                <Text style={styles.earningsValue}>{analytics.pendingPayouts}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>Completed</Text>
                <Text style={styles.earningsValue}>{analytics.completedPayouts}</Text>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={handleRequestPayout}
            >
              <Text style={styles.payoutButtonText}>Request Payout</Text>
            </TouchableOpacity>
          </View>

          {/* Fraud Stats */}
          {analytics.flaggedReferrals > 0 && (
            <View style={[styles.card, styles.warningCard]}>
              <Text style={styles.cardTitle}>⚠️ Fraud Alerts</Text>
              <Text style={styles.warningText}>
                {analytics.flaggedReferrals} referral(s) flagged for review
              </Text>
            </View>
          )}
        </>
      )}

      {/* Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          💡 Payouts are processed via CPA model at $10 per verified user. Minimum payout is $50.
        </Text>
      </View>
    </ScrollView>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#34C759';
    case 'pending':
      return '#FF9500';
    case 'suspended':
      return '#FF3B30';
    case 'banned':
      return '#8E8E93';
    default:
      return '#8E8E93';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#000000',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
  },
  copyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  affiliateCode: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  earningsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  earningsItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningsDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
  },
  earningsLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34C759',
  },
  payoutButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  payoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
  },
  notice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
});
