/**
 * PACK 394 — Viral Growth Engine
 * Invite Screen - Generate and share referral links
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

interface ReferralLink {
  linkId: string;
  code: string;
  deepLink: string;
  qrCodeUrl?: string;
  currentUses: number;
  maxUses?: number;
}

interface ReferralStats {
  totalLinks: number;
  activeLinks: number;
  totalInvites: number;
  verified: number;
  firstPurchases: number;
  conversionRate: number;
}

export default function InviteScreen() {
  const router = useRouter();
  const functions = getFunctions();

  const [loading, setLoading] = useState(false);
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);

  useEffect(() => {
    loadReferralStats();
  }, []);

  const loadReferralStats = async () => {
    try {
      const getUserStats = httpsCallable(functions, 'getUserReferralStats');
      const result = await getUserStats({});
      setStats((result.data as any).stats);
    } catch (error) {
      console.error('Error loading referral stats:', error);
    }
  };

  const generateReferralLink = async (type: 'direct' | 'qr' = 'direct') => {
    setLoading(true);
    try {
      const generateLink = httpsCallable(functions, 'generateReferralLink');
      const result = await generateLink({
        referralType: type === 'qr' ? 'qr_invite' : 'direct_invite',
        campaignName: 'User Generated Invite',
      });

      const link = (result.data as any).referralLink;
      setReferralLink(link);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate referral link');
    } finally {
      setLoading(false);
    }
  };

  const shareReferralLink = async (platform: string) => {
    if (!referralLink) return;

    const message = `Join me on Avalo! 💎 Use my invite link: ${referralLink.deepLink}`;

    try {
      await Share.share({
        message,
        url: referralLink.deepLink,
      });

      // Track share event
      const createShare = httpsCallable(functions, 'createShareEvent');
      await createShare({
        contentType: 'referral_campaign',
        contentId: referralLink.linkId,
        platform: platform.toLowerCase(),
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyToClipboard = async () => {
    if (!referralLink) return;

    await Clipboard.setStringAsync(referralLink.deepLink);
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Invite Friends</Text>
        <Text style={styles.subtitle}>
          Earn rewards when your friends join and verify!
        </Text>
      </View>

      {/* Stats Card */}
      {stats && (
        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalInvites}</Text>
              <Text style={styles.statLabel}>Invites Sent</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.verified}</Text>
              <Text style={styles.statLabel}>Verified</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.firstPurchases}</Text>
              <Text style={styles.statLabel}>Paying</Text>
            </View>
          </View>
          <View style={styles.conversionRate}>
            <Text style={styles.conversionLabel}>Conversion Rate:</Text>
            <Text style={styles.conversionValue}>
              {stats.conversionRate.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}

      {/* Generate Link Buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Generate Invite Link</Text>
        
        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => generateReferralLink('direct')}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.generateButtonText}>📱 Generate Link</Text>
              <Text style={styles.generateButtonSubtext}>
                Share via messaging apps
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.generateButton, styles.qrButton]}
          onPress={() => generateReferralLink('qr')}
          disabled={loading}
        >
          <Text style={styles.generateButtonText}>📷 Generate QR Code</Text>
          <Text style={styles.generateButtonSubtext}>
            Show in person
          </Text>
        </TouchableOpacity>
      </View>

      {/* Referral Link Display */}
      {referralLink && (
        <View style={styles.linkCard}>
          <Text style={styles.linkTitle}>Your Invite Link</Text>
          
          {/* QR Code */}
          {referralLink.qrCodeUrl && (
            <View style={styles.qrContainer}>
              <QRCode value={referralLink.deepLink} size={200} />
            </View>
          )}

          {/* Link Text */}
          <View style={styles.linkContainer}>
            <Text style={styles.linkText} numberOfLines={1}>
              {referralLink.deepLink}
            </Text>
            <TouchableOpacity onPress={copyToClipboard}>
              <Text style={styles.copyButton}>Copy</Text>
            </TouchableOpacity>
          </View>

          {/* Usage Stats */}
          <Text style={styles.linkStats}>
            Used: {referralLink.currentUses}
            {referralLink.maxUses && ` / ${referralLink.maxUses}`}
          </Text>

          {/* Share Buttons */}
          <View style={styles.shareButtons}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReferralLink('whatsapp')}
            >
              <Text style={styles.shareButtonText}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReferralLink('instagram')}
            >
              <Text style={styles.shareButtonText}>Instagram</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReferralLink('sms')}
            >
              <Text style={styles.shareButtonText}>SMS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReferralLink('link')}
            >
              <Text style={styles.shareButtonText}>More</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Rewards Info */}
      <View style={styles.rewardsCard}>
        <Text style={styles.rewardsTitle}>Earn Rewards! 🎁</Text>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>✅ Friend verifies account</Text>
          <Text style={styles.rewardValue}>+50 Tokens</Text>
        </View>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>✅ Friend makes first chat</Text>
          <Text style={styles.rewardValue}>+100 Tokens</Text>
        </View>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>✅ Friend makes first purchase</Text>
          <Text style={styles.rewardValue}>+500 Tokens</Text>
        </View>
      </View>

      {/* View Rewards Button */}
      <TouchableOpacity
        style={styles.viewRewardsButton}
        onPress={() => router.push('/referral/rewards')}
      >
        <Text style={styles.viewRewardsText}>View My Rewards →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  statsCard: {
    backgroundColor: '#1a1a1a',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  conversionRate: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  conversionLabel: {
    fontSize: 14,
    color: '#999',
    marginRight: 8,
  },
  conversionValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  generateButton: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  qrButton: {
    backgroundColor: '#8E44AD',
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  generateButtonSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  linkCard: {
    backgroundColor: '#1a1a1a',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  linkTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkText: {
    flex: 1,
    color: '#007AFF',
    fontSize: 14,
  },
  copyButton: {
    color: '#007AFF',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  linkStats: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  shareButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  shareButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
    width: '48%',
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  rewardsCard: {
    backgroundColor: '#1a1a1a',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  rewardsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
    textAlign: 'center',
  },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  rewardText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  rewardValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  viewRewardsButton: {
    backgroundColor: '#007AFF',
    margin: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  viewRewardsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
