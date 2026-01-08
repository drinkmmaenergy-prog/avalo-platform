/**
 * Referrals Screen - Phase 32-6
 * Main referrals hub with code display, sharing, and rewards
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { getReferralState, addReferral, type ReferralState } from "@/services/referralService";
import ReferralRewardsCard from "@/components/ReferralRewardsCard";
import ReferralLeaderboardCard from "@/components/ReferralLeaderboardCard";
import ShareReferralModal from "@/components/ShareReferralModal";

export default function ReferralsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [state, setState] = useState<ReferralState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    loadReferralState();
  }, []);

  const loadReferralState = async () => {
    try {
      setLoading(true);
      const referralState = await getReferralState();
      setState(referralState);
    } catch (error) {
      console.error('Error loading referral state:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReferralState();
    setRefreshing(false);
  };

  const handleTestAddReferral = async () => {
    try {
      const newState = await addReferral();
      setState(newState);
    } catch (error) {
      console.error('Error adding referral:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load referral data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadReferralState}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{t('referrals.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('referrals.subtitle')}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Referral Code Card */}
        <View style={styles.codeCard}>
          <View style={styles.codeCardHeader}>
            <Text style={styles.codeCardTitle}>{t('referrals.myCode')}</Text>
            <Text style={styles.codeCardSubtitle}>
              {t('referrals.referralsCount', { count: state.invitedCount })}
            </Text>
          </View>

          <View style={styles.codeDisplay}>
            <Text style={styles.codeText}>{state.code}</Text>
          </View>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => setShowShareModal(true)}
          >
            <Text style={styles.shareButtonText}>
              📤 {t('referrals.inviteButton')}
            </Text>
          </TouchableOpacity>

          {/* Test Button (for demo purposes) */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.testButton}
              onPress={handleTestAddReferral}
            >
              <Text style={styles.testButtonText}>
                🧪 Test: Add Referral (Dev Only)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Empty State */}
        {state.invitedCount === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>💎</Text>
            <Text style={styles.emptyStateTitle}>{t('referrals.noReferrals')}</Text>
            <Text style={styles.emptyStateText}>
              {t('referrals.startInviting')}
            </Text>
          </View>
        )}

        {/* Rewards Card */}
        <ReferralRewardsCard state={state} />

        {/* Leaderboard Card */}
        <ReferralLeaderboardCard state={state} />

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>{t('referrals.howItWorks')}</Text>
          <View style={styles.infoSteps}>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.stepText}>{t('referrals.step1')}</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.stepText}>{t('referrals.step2')}</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.stepText}>{t('referrals.step3')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Share Modal */}
      <ShareReferralModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        referralCode={state.code}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 18,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0F0F0F',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  codeCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  codeCardHeader: {
    marginBottom: 16,
  },
  codeCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  codeCardSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  codeDisplay: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  codeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#D4AF37',
    letterSpacing: 6,
  },
  shareButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 8,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  testButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoSteps: {
    gap: 12,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
});
