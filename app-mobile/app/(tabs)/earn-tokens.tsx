/**
 * Earn Tokens Screen - Phase 17
 * Dedicated screen for earning tokens by watching rewarded ads
 * 
 * Features:
 * - Daily progress tracking (20 ads/day max)
 * - Bonus progress (10 tokens per ad, +10 bonus every 10 ads)
 * - Real-time status updates
 * - Simulated ad watching (ready for real SDK integration)
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
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdRewardsStatus,
  simulateAdWatch,
  calculateBonusProgress,
  getRemainingForBonus,
  formatEarningMessage,
  canWatchMoreAds,
  formatDailyLimitMessage,
  calculatePotentialEarnings,
  type AdRewardsStatus,
} from "@/services/adRewardsService";

export default function EarnTokensScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [status, setStatus] = useState<AdRewardsStatus | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadStatus();
    } else {
      setLoading(false);
    }
  }, [user?.uid]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const adStatus = await getAdRewardsStatus();
      setStatus(adStatus);
    } catch (error: any) {
      console.error('Error loading ad rewards status:', error);
      Alert.alert('Error', error.message || 'Failed to load ad rewards');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStatus();
    setRefreshing(false);
  };

  const handleWatchAd = async () => {
    if (!user?.uid) {
      Alert.alert('Wymagane logowanie', 'Zaloguj się, aby zarabiać tokeny z reklam');
      return;
    }

    if (!status || !canWatchMoreAds(status)) {
      Alert.alert(
        'Unable to Watch Ad',
        status?.reasonIfBlocked || 'You cannot watch more ads right now'
      );
      return;
    }

    setWatchingAd(true);

    try {
      // Simulate ad watch (in production, this would trigger real ad SDK)
      const result = await simulateAdWatch(user.uid);
      
      if (result.success) {
        Alert.alert(
          'Tokens Earned! 🎉',
          formatEarningMessage(result),
          [{ text: 'Great!', onPress: () => loadStatus() }]
        );
      } else {
        Alert.alert('Error', 'Failed to process ad reward');
      }
    } catch (error: any) {
      console.error('Error watching ad:', error);
      Alert.alert('Error', error.message || 'Failed to watch ad');
    } finally {
      setWatchingAd(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Earn Tokens' }} />
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Earn Tokens' }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to earn tokens</Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/(auth)/sign-in' as any)}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Earn Tokens' }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load ad rewards</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadStatus}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const bonusProgress = calculateBonusProgress(status);
  const remainingForBonus = getRemainingForBonus(status);
  const potentialEarnings = calculatePotentialEarnings(status);
  const canWatch = canWatchMoreAds(status);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Stack.Screen options={{ title: 'Earn Tokens' }} />

      {/* Creator Academy CTA */}
      <TouchableOpacity
        style={styles.academyCta}
        onPress={() => router.push('/creator/academy' as any)}
      >
        <Text style={styles.academyCtaIcon}>🎓</Text>
        <View style={styles.academyCtaContent}>
          <Text style={styles.academyCtaTitle}>
            Learn How to Maximize Earnings
          </Text>
          <Text style={styles.academyCtaSubtitle}>Creator Academy →</Text>
        </View>
      </TouchableOpacity>

      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.headerEmoji}>📺</Text>
        <Text style={styles.headerTitle}>Watch Ads, Earn Tokens!</Text>
        <Text style={styles.headerSubtitle}>
          Get {status.tokensPerAd} tokens per ad with bonus rewards
        </Text>
      </View>

      {/* Daily Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Today's Progress</Text>
          <Text style={styles.progressCount}>
            {status.rewardedAdsWatchedToday} / {status.dailyLimit}
          </Text>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(status.rewardedAdsWatchedToday / status.dailyLimit) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {formatDailyLimitMessage(status)}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{status.tokensEarnedFromAdsToday}</Text>
            <Text style={styles.statLabel}>Tokens Today</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{status.remainingAdsToday}</Text>
            <Text style={styles.statLabel}>Ads Left</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{status.tokensEarnedFromAdsLifetime}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
        </View>
      </View>

      {/* Bonus Progress Card */}
      <View style={styles.bonusCard}>
        <View style={styles.bonusHeader}>
          <Text style={styles.bonusTitle}>Bonus Progress</Text>
          <Text style={styles.bonusEmoji}>🎁</Text>
        </View>
        <Text style={styles.bonusSubtitle}>
          Watch {remainingForBonus} more ads for +{status.bonusTokens} bonus tokens!
        </Text>
        
        <View style={styles.bonusBarContainer}>
          <View style={styles.bonusBar}>
            <View
              style={[styles.bonusFill, { width: `${bonusProgress}%` }]}
            />
          </View>
          <Text style={styles.bonusText}>
            {status.tenAdCycleCount} / {status.bonusEvery} ads
          </Text>
        </View>
      </View>

      {/* Watch Ad Button */}
      <View style={styles.watchAdContainer}>
        <TouchableOpacity
          style={[
            styles.watchAdButton,
            (!canWatch || watchingAd) && styles.watchAdButtonDisabled,
          ]}
          onPress={handleWatchAd}
          disabled={!canWatch || watchingAd}
        >
          {watchingAd ? (
            <>
              <ActivityIndicator color="#fff" style={{ marginRight: 12 }} />
              <View>
                <Text style={styles.watchAdButtonText}>Watching Ad...</Text>
                <Text style={styles.watchAdButtonSubtext}>Please wait</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.watchAdButtonEmoji}>▶️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.watchAdButtonText}>
                  {canWatch ? 'Watch Ad & Earn' : 'Daily Limit Reached'}
                </Text>
                <Text style={styles.watchAdButtonSubtext}>
                  {canWatch
                    ? `+${status.tokensPerAd} tokens per ad`
                    : status.reasonIfBlocked || 'Come back tomorrow!'}
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {!canWatch && status.reasonIfBlocked && (
          <View style={styles.blockedNotice}>
            <Text style={styles.blockedText}>ℹ️ {status.reasonIfBlocked}</Text>
          </View>
        )}
      </View>

      {/* Potential Earnings */}
      {status.remainingAdsToday > 0 && (
        <View style={styles.potentialCard}>
          <Text style={styles.potentialTitle}>Potential Earnings Today</Text>
          <View style={styles.potentialRow}>
            <Text style={styles.potentialLabel}>Base tokens:</Text>
            <Text style={styles.potentialValue}>
              {potentialEarnings.baseTokens} 🪙
            </Text>
          </View>
          {potentialEarnings.bonusTokens > 0 && (
            <View style={styles.potentialRow}>
              <Text style={styles.potentialLabel}>Bonus tokens:</Text>
              <Text style={[styles.potentialValue, styles.bonusValue]}>
                +{potentialEarnings.bonusTokens} 🎁
              </Text>
            </View>
          )}
          <View style={[styles.potentialRow, styles.potentialTotalRow]}>
            <Text style={styles.potentialTotalLabel}>Total possible:</Text>
            <Text style={styles.potentialTotalValue}>
              {potentialEarnings.totalTokens} tokens
            </Text>
          </View>
        </View>
      )}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How It Works</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>1️⃣</Text>
          <Text style={styles.infoText}>
            Watch ads and earn {status.tokensPerAd} tokens each
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>2️⃣</Text>
          <Text style={styles.infoText}>
            Get +{status.bonusTokens} bonus tokens every {status.bonusEvery} ads
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>3️⃣</Text>
          <Text style={styles.infoText}>
            Maximum {status.dailyLimit} ads per day
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoIcon}>4️⃣</Text>
          <Text style={styles.infoText}>
            Use earned tokens anywhere in the app!
          </Text>
        </View>
      </View>

      {/* Development Note */}
      {__DEV__ && (
        <View style={styles.devNote}>
          <Text style={styles.devNoteText}>
            🚧 Development Mode: Simulated ads (2.5s delay)
          </Text>
          <Text style={styles.devNoteText}>
            Production will integrate real ad SDK (AdMob, etc.)
          </Text>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  signInButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: '#4CAF50',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  progressCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  progressCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
  },
  bonusCard: {
    backgroundColor: '#FEF3C7',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
  },
  bonusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bonusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400E',
  },
  bonusEmoji: {
    fontSize: 24,
  },
  bonusSubtitle: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 12,
  },
  bonusBarContainer: {
    marginTop: 8,
  },
  bonusBar: {
    height: 6,
    backgroundColor: '#FDE68A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  bonusFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  bonusText: {
    fontSize: 12,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '600',
  },
  watchAdContainer: {
    margin: 16,
    marginTop: 0,
  },
  watchAdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  watchAdButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0.1,
  },
  watchAdButtonEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  watchAdButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  watchAdButtonSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  blockedNotice: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  blockedText: {
    fontSize: 13,
    color: '#991B1B',
    textAlign: 'center',
  },
  potentialCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  potentialTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 12,
  },
  potentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  potentialLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  potentialValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  bonusValue: {
    color: '#F59E0B',
  },
  potentialTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  potentialTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  potentialTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  infoCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  devNote: {
    backgroundColor: '#FEF2F2',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  devNoteText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginBottom: 4,
  },
  academyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2A2A',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  academyCtaIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  academyCtaContent: {
    flex: 1,
  },
  academyCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  academyCtaSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
});
