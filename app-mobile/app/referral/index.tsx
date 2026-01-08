/**
 * PACK 355 - Referral & Invite Engine
 * Main Referral Screen
 * 
 * Features:
 * - Share referral link (QR + URL)
 * - Quick stats overview
 * - Navigation to detailed stats
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface ReferralCode {
  userId: string;
  code: string;
  type: string;
  trackingLink: string;
  createdAt: any;
  active: boolean;
}

interface ReferralStats {
  userId: string;
  totalInvites: number;
  convertedInvites: number;
  totalRewardsTokens: number;
  flaggedAttempts: number;
  viralCoefficient?: number;
}

export default function ReferralScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      setLoading(true);

      // Get referral code
      const getReferralCodeFn = httpsCallable(functions, 'getReferralCode');
      const codeResult = await getReferralCodeFn({ type: 'USER' });
      setReferralCode((codeResult.data as any).code);

      // Get stats
      const getStatsFn = httpsCallable(functions, 'getMyReferralStats');
      const statsResult = await getStatsFn({});
      setStats((statsResult.data as any).stats);
    } catch (error) {
      console.error('Error loading referral data:', error);
      Alert.alert('Error', 'Failed to load referral information');
    } finally {
      setLoading(false);
    }
  };

  const shareReferralLink = async () => {
    if (!referralCode) return;

    try {
      await Share.share({
        message: `Join me on Avalo! Use my referral code: ${referralCode.code}\n\n${referralCode.trackingLink}`,
        url: referralCode.trackingLink,
        title: 'Join Avalo',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyToClipboard = async () => {
    if (!referralCode) return;

    await Clipboard.setStringAsync(referralCode.trackingLink);
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  const copyCode = async () => {
    if (!referralCode) return;

    await Clipboard.setStringAsync(referralCode.code);
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
          <Text style={styles.loadingText}>Loading referral data...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <TouchableOpacity onPress={() => router.push('/referral/stats')} style={styles.statsButton}>
          <Ionicons name="stats-chart" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.totalInvites || 0}</Text>
          <Text style={styles.statLabel}>Invites Sent</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.convertedInvites || 0}</Text>
          <Text style={styles.statLabel}>Active Referrals</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.totalRewardsTokens || 0}</Text>
          <Text style={styles.statLabel}>Tokens Earned</Text>
        </View>
      </View>

      {/* QR Code Section */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>Your Referral QR Code</Text>
        <View style={styles.qrContainer}>
          {referralCode && (
            <QRCode
              value={referralCode.trackingLink}
              size={200}
              backgroundColor="white"
              color="black"
            />
          )}
        </View>
        <Text style={styles.qrHint}>Have someone scan this to sign up</Text>
      </View>

      {/* Referral Code */}
      <View style={styles.codeSection}>
        <Text style={styles.sectionTitle}>Your Referral Code</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{referralCode?.code || 'Loading...'}</Text>
          <TouchableOpacity onPress={copyCode} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={20} color="#E91E63" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Share Link */}
      <View style={styles.linkSection}>
        <Text style={styles.sectionTitle}>Referral Link</Text>
        <View style={styles.linkContainer}>
          <Text style={styles.linkText} numberOfLines={1}>
            {referralCode?.trackingLink || 'Loading...'}
          </Text>
          <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={20} color="#E91E63" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Share Button */}
      <TouchableOpacity style={styles.shareButton} onPress={shareReferralLink}>
        <Ionicons name="share-social" size={24} color="#fff" />
        <Text style={styles.shareButtonText}>Share Referral Link</Text>
      </TouchableOpacity>

      {/* How It Works */}
      <View style={styles.howItWorks}>
        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.stepText}>Share your referral link or code with friends</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.stepText}>They sign up and complete verification</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={styles.stepText}>They send their first paid message</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>4</Text>
          </View>
          <Text style={styles.stepText}>You earn 100 tokens as a reward! 🎉</Text>
        </View>
      </View>

      {/* Fraud Warning */}
      {stats && stats.flaggedAttempts > 0 && (
        <View style={styles.warningContainer}>
          <Ionicons name="warning" size={24} color="#FF9800" />
          <Text style={styles.warningText}>
            {stats.flaggedAttempts} suspicious referral attempt(s) detected. Please ensure you're
            following our referral guidelines.
          </Text>
        </View>
      )}
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
  statsButton: {
    padding: 8,
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  statCard: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  qrSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginVertical: 16,
  },
  qrHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  codeSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'space-between',
  },
  codeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E91E63',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
  },
  linkSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'space-between',
  },
  linkText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 16,
    borderRadius: 12,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  howItWorks: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
    paddingTop: 6,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 16,
    borderRadius: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    marginLeft: 12,
    lineHeight: 20,
  },
});

