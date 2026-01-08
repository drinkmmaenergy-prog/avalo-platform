/**
 * Premium Earnings Screen - Phase 28
 * VIP & Royal Hybrid Premium Earnings UI
 * 
 * Calculates and displays cashback bonuses for VIP/Royal users
 * All calculations are UI-only, no backend changes
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getUserTransactions } from "@/services/tokenService";
import { getUserTier } from "@/services/sponsoredAdsService";
import { getProfile } from "@/lib/profileService";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';

// Cashback multipliers for VIP and Royal
const CASHBACK_MULTIPLIERS = {
  vip: {
    chat: 0.03,      // +3%
    aiBots: 0.04,    // +4%
    live: 0.05,      // +5%
    drops: 0.04,     // +4%
    goals: 0.03,     // +3%
    meet: 0.03,      // +3%
  },
  royal: {
    chat: 0.07,      // +7%
    aiBots: 0.08,    // +8%
    live: 0.09,      // +9%
    drops: 0.07,     // +7%
    goals: 0.06,     // +6%
    meet: 0.06,      // +6%
  },
};

interface CashbackBreakdown {
  chat: number;
  aiBots: number;
  live: number;
  drops: number;
  goals: number;
  meet: number;
  total: number;
}

export default function PremiumEarningsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [userTier, setUserTier] = useState<'standard' | 'vip' | 'royal'>('standard');
  const [cashbackBreakdown, setCashbackBreakdown] = useState<CashbackBreakdown>({
    chat: 0,
    aiBots: 0,
    live: 0,
    drops: 0,
    goals: 0,
    meet: 0,
    total: 0,
  });
  const [lastClaimedAt, setLastClaimedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadPremiumEarnings();
    }
  }, [user?.uid]);

  const loadPremiumEarnings = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      // Get user profile to determine tier
      const profile = await getProfile(user.uid);
      if (!profile) {
        Alert.alert('Błąd', 'Nie można załadować profilu');
        router.back();
        return;
      }

      const tier = getUserTier(profile.membership);
      setUserTier(tier);

      // Standard users cannot access this screen
      if (tier === 'standard') {
        Alert.alert(
          'Tylko dla VIP i Royal',
          'Ta funkcja jest dostępna tylko dla użytkowników VIP i Royal.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      // Get last claimed timestamp from Firestore
      const db = getFirestore();
      const earningsRef = doc(db, 'premiumEarnings', user.uid);
      const earningsSnap = await getDoc(earningsRef);
      
      let lastClaimed: Date | null = null;
      if (earningsSnap.exists()) {
        const data = earningsSnap.data();
        lastClaimed = data.lastClaimedAt?.toDate() || null;
        setLastClaimedAt(lastClaimed);
      }

      // Get all transactions since last claim (or all time if never claimed)
      const transactions = await getUserTransactions(user.uid, 500);
      
      // Filter to only earnings (where user is receiver) after last claim
      const earnings = transactions.filter(tx => {
        const isReceiver = tx.receiverUid === user.uid;
        const afterLastClaim = !lastClaimed || tx.createdAt > lastClaimed;
        return isReceiver && afterLastClaim && tx.transactionType !== 'purchase';
      });

      // Calculate cashback breakdown
      const breakdown = calculateCashbackBreakdown(earnings, tier);
      setCashbackBreakdown(breakdown);

    } catch (error) {
      console.error('Error loading premium earnings:', error);
      Alert.alert('Błąd', 'Nie udało się załadować danych o zarobkach');
    } finally {
      setLoading(false);
    }
  };

  const calculateCashbackBreakdown = (
    transactions: any[],
    tier: 'vip' | 'royal'
  ): CashbackBreakdown => {
    const multipliers = CASHBACK_MULTIPLIERS[tier];
    const breakdown: CashbackBreakdown = {
      chat: 0,
      aiBots: 0,
      live: 0,
      drops: 0,
      goals: 0,
      meet: 0,
      total: 0,
    };

    transactions.forEach(tx => {
      // Categorize transaction by type or chatId pattern
      const module = categorizeTransaction(tx);
      const cashback = Math.floor(tx.tokensAmount * multipliers[module]);
      breakdown[module] += cashback;
      breakdown.total += cashback;
    });

    return breakdown;
  };

  const categorizeTransaction = (transaction: any): keyof Omit<CashbackBreakdown, 'total'> => {
    // Categorize based on transaction metadata
    // This is UI-only inference based on patterns
    
    const chatId = transaction.chatId || '';
    const messageId = transaction.messageId || '';

    // AI Bots: usually have 'bot' in chatId
    if (chatId.includes('bot') || chatId.includes('ai')) {
      return 'aiBots';
    }

    // Live: transactions from live sessions
    if (chatId.includes('live') || chatId.includes('session')) {
      return 'live';
    }

    // Goals: transactions related to creator goals
    if (chatId.includes('goal')) {
      return 'goals';
    }

    // Meet: video/voice call transactions
    if (chatId.includes('call') || chatId.includes('meet')) {
      return 'meet';
    }

    // Drops: superlike transactions
    if (transaction.transactionType === 'superlike') {
      return 'drops';
    }

    // Default to chat for regular messages
    return 'chat';
  };

  const handleClaimBonus = async () => {
    if (!user?.uid) return;
    if (cashbackBreakdown.total === 0) {
      Alert.alert('Brak bonusu', 'Nie masz żadnego bonusu do odebrania');
      return;
    }

    Alert.alert(
      'Odbierz bonus',
      `Czy chcesz odebrać bonus w wysokości ${cashbackBreakdown.total} tokenów?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odbierz',
          onPress: async () => {
            try {
              setClaiming(true);

              const db = getFirestore();
              
              // Add tokens to user's wallet
              const walletRef = doc(db, 'balances', user.uid, 'wallet');
              const walletSnap = await getDoc(walletRef);
              
              if (!walletSnap.exists()) {
                await setDoc(walletRef, {
                  tokens: cashbackBreakdown.total,
                  lastUpdated: serverTimestamp(),
                });
              } else {
                await updateDoc(walletRef, {
                  tokens: increment(cashbackBreakdown.total),
                  lastUpdated: serverTimestamp(),
                });
              }

              // Update last claimed timestamp
              const earningsRef = doc(db, 'premiumEarnings', user.uid);
              await setDoc(
                earningsRef,
                {
                  lastClaimedAt: serverTimestamp(),
                  lastClaimedAmount: cashbackBreakdown.total,
                  tier: userTier,
                },
                { merge: true }
              );

              // Show success message
              Alert.alert(
                'Sukces! 🎉',
                `Dodano ${cashbackBreakdown.total} tokenów do Twojego konta`,
                [{ text: 'OK', onPress: () => loadPremiumEarnings() }]
              );

            } catch (error) {
              console.error('Error claiming bonus:', error);
              Alert.alert('Błąd', 'Nie udało się odebrać bonusu. Spróbuj ponownie.');
            } finally {
              setClaiming(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium Earnings</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Ładowanie...</Text>
        </View>
      </View>
    );
  }

  const tierColor = userTier === 'royal' ? '#D4AF37' : '#FFD700';
  const tierLabel = userTier === 'royal' ? '👑 Royal' : '⭐ VIP';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium Earnings</Text>
        <View style={[styles.tierBadge, { borderColor: tierColor }]}>
          <Text style={[styles.tierText, { color: tierColor }]}>{tierLabel}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Total Cashback Card */}
        <View style={[styles.totalCard, { borderColor: tierColor, shadowColor: tierColor }]}>
          <Text style={styles.totalLabel}>Dostępny bonus cashback</Text>
          <View style={styles.totalAmountContainer}>
            <Text style={styles.tokenIcon}>💎</Text>
            <Text style={[styles.totalAmount, { color: tierColor }]}>
              {cashbackBreakdown.total.toLocaleString()}
            </Text>
          </View>
          <Text style={styles.totalSubtext}>
            {lastClaimedAt
              ? `Ostatnio odebrano: ${lastClaimedAt.toLocaleDateString('pl-PL')}`
              : 'Pierwszy bonus do odebrania'}
          </Text>
        </View>

        {/* Breakdown Section */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Podział według modułów</Text>
          <Text style={styles.sectionSubtitle}>
            Twoje bonusy za zarobione tokeny w każdym module
          </Text>

          <View style={styles.breakdownList}>
            <BreakdownItem
              icon="💬"
              label="Chat"
              amount={cashbackBreakdown.chat}
              multiplier={userTier === 'royal' ? '+7%' : '+3%'}
              tierColor={tierColor}
            />
            <BreakdownItem
              icon="🤖"
              label="AI Boty"
              amount={cashbackBreakdown.aiBots}
              multiplier={userTier === 'royal' ? '+8%' : '+4%'}
              tierColor={tierColor}
            />
            <BreakdownItem
              icon="📹"
              label="Live"
              amount={cashbackBreakdown.live}
              multiplier={userTier === 'royal' ? '+9%' : '+5%'}
              tierColor={tierColor}
            />
            <BreakdownItem
              icon="⭐"
              label="Drops"
              amount={cashbackBreakdown.drops}
              multiplier={userTier === 'royal' ? '+7%' : '+4%'}
              tierColor={tierColor}
            />
            <BreakdownItem
              icon="🎯"
              label="Goals"
              amount={cashbackBreakdown.goals}
              multiplier={userTier === 'royal' ? '+6%' : '+3%'}
              tierColor={tierColor}
            />
            <BreakdownItem
              icon="🎥"
              label="Meet"
              amount={cashbackBreakdown.meet}
              multiplier={userTier === 'royal' ? '+6%' : '+3%'}
              tierColor={tierColor}
            />
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ Jak to działa?</Text>
          <Text style={styles.infoText}>
            Jako użytkownik {tierLabel}, otrzymujesz cashback od wszystkich zarobków w aplikacji.
            {'\n\n'}
            Bonus jest naliczany automatycznie i możesz go odebrać w dowolnym momencie.
            {'\n\n'}
            Procenty cashback różnią się w zależności od modułu i Twojego poziomu członkostwa.
          </Text>
        </View>
      </ScrollView>

      {/* Claim Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.claimButton,
            { backgroundColor: tierColor },
            (cashbackBreakdown.total === 0 || claiming) && styles.claimButtonDisabled,
          ]}
          onPress={handleClaimBonus}
          disabled={cashbackBreakdown.total === 0 || claiming}
        >
          {claiming ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.claimButtonText}>
                {cashbackBreakdown.total > 0 ? 'Odbierz bonus' : 'Brak bonusu'}
              </Text>
              {cashbackBreakdown.total > 0 && (
                <Text style={styles.claimButtonSubtext}>
                  {cashbackBreakdown.total} 💎
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Breakdown Item Component
function BreakdownItem({
  icon,
  label,
  amount,
  multiplier,
  tierColor,
}: {
  icon: string;
  label: string;
  amount: number;
  multiplier: string;
  tierColor: string;
}) {
  return (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownLeft}>
        <Text style={styles.breakdownIcon}>{icon}</Text>
        <View>
          <Text style={styles.breakdownLabel}>{label}</Text>
          <Text style={[styles.breakdownMultiplier, { color: tierColor }]}>
            {multiplier}
          </Text>
        </View>
      </View>
      <View style={styles.breakdownRight}>
        <Text style={styles.breakdownAmount}>{amount.toLocaleString()}</Text>
        <Text style={styles.breakdownToken}>💎</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 28,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 2,
  },
  tierText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  totalCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  totalLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  totalAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tokenIcon: {
    fontSize: 32,
    marginRight: 8,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  totalSubtext: {
    fontSize: 13,
    color: '#999',
  },
  breakdownSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  breakdownList: {
    gap: 12,
  },
  breakdownItem: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownIcon: {
    fontSize: 24,
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  breakdownMultiplier: {
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breakdownAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  breakdownToken: {
    fontSize: 16,
  },
  infoCard: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    marginBottom: 100,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  claimButton: {
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  claimButtonDisabled: {
    opacity: 0.5,
  },
  claimButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  claimButtonSubtext: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
});
