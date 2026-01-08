/**
 * PACK 355 - Referral & Invite Engine
 * Influencer Referral Analytics
 * 
 * Features:
 * - Total installs driven
 * - Active users
 * - Revenue originated from referrals
 * - Regional breakdown
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
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface InfluencerReferralCode {
  userId: string;
  code: string;
  type: string;
  trackingLink: string;
  createdAt: any;
  active: boolean;
}

interface InfluencerAnalytics {
  totalInstalls: number;
  activeUsers: number;
  revenueOriginated: number;
  regionalBreakdown: Record<string, number>;
  activeUsersByRegion: Record<string, number>;
}

export default function InfluencerReferralsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<InfluencerReferralCode | null>(null);
  const [analytics, setAnalytics] = useState<InfluencerAnalytics | null>(null);

  useEffect(() => {
    loadInfluencerData();
  }, []);

  const loadInfluencerData = async () => {
    try {
      setLoading(true);

      // Get influencer referral code
      const getCodeFn = httpsCallable(functions, 'getInfluencerReferralCode');
      const codeResult = await getCodeFn({});
      setReferralCode((codeResult.data as any).code);

      // Get analytics
      const getAnalyticsFn = httpsCallable(functions, 'getInfluencerReferralAnalytics');
      const analyticsResult = await getAnalyticsFn({});
      setAnalytics((analyticsResult.data as any).analytics);
    } catch (error) {
      console.error('Error loading influencer data:', error);
      Alert.alert('Error', 'Failed to load influencer referral data');
    } finally {
      setLoading(false);
    }
  };

  const shareReferralLink = async () => {
    if (!referralCode) return;

    try {
      await Share.share({
        message: `Join me on Avalo! Follow my exclusive influencer link:\n\n${referralCode.trackingLink}`,
        url: referralCode.trackingLink,
        title: 'Join Avalo with My Influencer Code',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyToClipboard = async () => {
    if (!referralCode) return;

    await Clipboard.setStringAsync(referralCode.trackingLink);
    Alert.alert('Copied!', 'Influencer referral link copied to clipboard');
  };

  const copyCode = async () => {
    if (!referralCode) return;

    await Clipboard.setStringAsync(referralCode.code);
    Alert.alert('Copied!', 'Influencer code copied to clipboard');
  };

  const getTopRegions = () => {
    if (!analytics?.regionalBreakdown) return [];

    const sorted = Object.entries(analytics.regionalBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return sorted;
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
          <Text style={styles.loadingText}>Loading influencer analytics...</Text>
        </View>
      </View>
    );
  }

  const conversionRate =
    analytics && analytics.totalInstalls > 0
      ? (analytics.activeUsers / analytics.totalInstalls) * 100
      : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Influencer Referrals</Text>
        <Ionicons name="star" size={24} color="#FFD700" />
      </View>

      {/* Key Metrics */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Ionicons name="download" size={32} color="#E91E63" />
          <Text style={styles.metricValue}>{analytics?.totalInstalls || 0}</Text>
          <Text style={styles.metricLabel}>Total Installs</Text>
        </View>

        <View style={styles.metricCard}>
          <Ionicons name="people" size={32} color="#4CAF50" />
          <Text style={styles.metricValue}>{analytics?.activeUsers || 0}</Text>
          <Text style={styles.metricLabel}>Active Users</Text>
        </View>

        <View style={styles.metricCard}>
          <Ionicons name="trending-up" size={32} color="#2196F3" />
          <Text style={styles.metricValue}>{conversionRate.toFixed(1)}%</Text>
          <Text style={styles.metricLabel}>Conversion Rate</Text>
        </View>

        <View style={styles.metricCard}>
          <Ionicons name="cash" size={32} color="#FFD700" />
          <Text style={styles.metricValue}>
            {formatCurrency(analytics?.revenueOriginated || 0)}
          </Text>
          <Text style={styles.metricLabel}>Revenue Impact</Text>
        </View>
      </View>

      {/* Influencer Code Section */}
      <View style={styles.codeSection}>
        <Text style={styles.sectionTitle}>Your Influencer Code</Text>
        <View style={styles.codeCard}>
          <View style={styles.codeHeader}>
            <Ionicons name="shield-checkmark" size={24} color="#FFD700" />
            <Text style={styles.influencerBadge}>INFLUENCER</Text>
          </View>

          <View style={styles.codeDisplay}>
            <Text style={styles.codeText}>{referralCode?.code || 'Loading...'}</Text>
            <TouchableOpacity onPress={copyCode} style={styles.copyButton}>
              <Ionicons name="copy-outline" size={20} color="#E91E63" />
            </TouchableOpacity>
          </View>

          <View style={styles.linkDisplay}>
            <Text style={styles.linkText} numberOfLines={1}>
              {referralCode?.trackingLink || 'Loading...'}
            </Text>
            <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
              <Ionicons name="copy-outline" size={20} color="#E91E63" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.shareButton} onPress={shareReferralLink}>
            <Ionicons name="share-social" size={20} color="#fff" />
            <Text style={styles.shareButtonText}>Share Influencer Link</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* QR Code */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>Influencer QR Code</Text>
        <View style={styles.qrContainer}>
          {referralCode && (
            <QRCode
              value={referralCode.trackingLink}
              size={180}
              backgroundColor="white"
              color="black"
            />
          )}
        </View>
        <Text style={styles.qrHint}>Share this QR code on your social media</Text>
      </View>

      {/* Regional Breakdown */}
      <View style={styles.regionalSection}>
        <Text style={styles.sectionTitle}>Top Regions</Text>
        {getTopRegions().map(([country, count], index) => {
          const activeCount = analytics?.activeUsersByRegion[country] || 0;
          const regionConversion = count > 0 ? (activeCount / count) * 100 : 0;

          return (
            <View key={country} style={styles.regionCard}>
              <View style={styles.regionHeader}>
                <View style={styles.regionRank}>
                  <Text style={styles.regionRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.regionInfo}>
                  <Text style={styles.regionCountry}>{country}</Text>
                  <Text style={styles.regionStats}>
                    {count} installs • {activeCount} active
                  </Text>
                </View>
                <View style={styles.regionConversion}>
                  <Text style={styles.regionConversionText}>
                    {regionConversion.toFixed(0)}%
                  </Text>
                </View>
              </View>
              <View style={styles.regionBar}>
                <View
                  style={[
                    styles.regionBarFill,
                    { width: `${regionConversion}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}

        {getTopRegions().length === 0 && (
          <View style={styles.emptyRegions}>
            <Ionicons name="globe-outline" size={48} color="#666" />
            <Text style={styles.emptyText}>No regional data yet</Text>
          </View>
        )}
      </View>

      {/* Impact Summary */}
      <View style={styles.impactSection}>
        <Text style={styles.sectionTitle}>Your Impact</Text>
        <View style={styles.impactCard}>
          <Ionicons name="trophy" size={48} color="#FFD700" />
          <Text style={styles.impactTitle}>Influencer Status</Text>
          <Text style={styles.impactDescription}>
            You've helped onboard {analytics?.activeUsers || 0} active users to Avalo! Your
            influence has contributed to the platform's growth and generated{' '}
            {formatCurrency(analytics?.revenueOriginated || 0)} in platform revenue.
          </Text>
          {analytics && analytics.activeUsers >= 100 && (
            <View style={styles.achievementBadge}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.achievementText}>100+ Users Milestone!</Text>
            </View>
          )}
          {analytics && analytics.activeUsers >= 1000 && (
            <View style={styles.achievementBadge}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.achievementText}>1000+ Users - Elite Influencer!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Best Practices */}
      <View style={styles.tipsSection}>
        <Text style={styles.sectionTitle}>Maximize Your Impact</Text>
        <View style={styles.tip}>
          <Ionicons name="bulb" size={20} color="#FFD700" />
          <Text style={styles.tipText}>
            Share your QR code on Instagram, TikTok, and YouTube
          </Text>
        </View>
        <View style={styles.tip}>
          <Ionicons name="bulb" size={20} color="#FFD700" />
          <Text style={styles.tipText}>
            Include your code in video descriptions and pinned comments
          </Text>
        </View>
        <View style={styles.tip}>
          <Ionicons name="bulb" size={20} color="#FFD700" />
          <Text style={styles.tipText}>
            Create content showcasing Avalo features to drive quality signups
          </Text>
        </View>
        <View style={styles.tip}>
          <Ionicons name="bulb" size={20} color="#FFD700" />
          <Text style={styles.tipText}>
            Track your regional performance to optimize content strategy
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#252525',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  metricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  codeSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  codeCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  influencerBadge: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 8,
    letterSpacing: 1,
  },
  codeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  codeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E91E63',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
  },
  linkDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  linkText: {
    fontSize: 12,
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
    padding: 12,
    borderRadius: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  qrSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  qrHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  regionalSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  regionCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  regionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  regionRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  regionRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  regionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  regionCountry: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  regionStats: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  regionConversion: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  regionConversionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  regionBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  regionBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  emptyRegions: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  impactSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  impactCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  impactTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    marginBottom: 8,
  },
  impactDescription: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD70020',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  achievementText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 8,
  },
  tipsSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    backgroundColor: '#252525',
    padding: 12,
    borderRadius: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    marginLeft: 12,
    lineHeight: 20,
  },
});

