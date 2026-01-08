/**
 * Boost Hub Screen
 * Central hub for token purchases, ads, and membership upgrades
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getTokenBalance } from "@/services/tokenService";
import { TokenPurchaseModal } from "@/components/TokenPurchaseModal";
import { fetchUserBoosts, UserBoost } from "@/services/boostService";

export default function BoostHubScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [boosts, setBoosts] = useState<UserBoost[]>([]);
  const [loadingBoosts, setLoadingBoosts] = useState(false);
  const [boostsError, setBoostsError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadBalance();
      loadBoosts();
    }
  }, [user?.uid]);

  const loadBalance = async () => {
    if (!user?.uid) return;
    try {
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const loadBoosts = async () => {
    if (!user?.uid) return;
    setLoadingBoosts(true);
    setBoostsError(null);
    try {
      const userBoosts = await fetchUserBoosts(20);
      setBoosts(userBoosts);
    } catch (error) {
      console.error('Error loading boosts:', error);
      setBoostsError('Nie udało się pobrać historii boostów. Spróbuj ponownie.');
    } finally {
      setLoadingBoosts(false);
    }
  };

  const formatBoostTime = (timestamp?: { seconds: number; nanoseconds: number }) => {
    if (!timestamp) return '';
    const date = new Date(timestamp.seconds * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}, ${hours}:${minutes}`;
  };

  const getBoostTypeLabel = (type: string) => {
    switch (type) {
      case 'DISCOVERY_PROFILE':
        return 'Boost profilu';
      case 'CHAT_RETARGET':
        return 'Przypomnienie czatu';
      default:
        return type;
    }
  };

  const getBoostStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Aktywny';
      case 'EXPIRED':
        return 'Zakończony';
      case 'CANCELLED':
        return 'Anulowany';
      default:
        return status;
    }
  };

  const getBoostStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#4CAF50';
      case 'EXPIRED':
        return '#9E9E9E';
      case 'CANCELLED':
        return '#FF6B6B';
      default:
        return '#9E9E9E';
    }
  };

  const handleBuyTokens = () => {
    setShowTokenModal(true);
  };

  const handleEarnTokens = () => {
    // TODO: Implement rewarded ads
    Alert.alert('Coming Soon', 'Watch ads to earn tokens - launching soon!');
  };

  const handleVIPUpgrade = () => {
    // TODO: Navigate to VIP subscription screen
    Alert.alert('VIP Upgrade', 'VIP membership screen coming soon!');
  };

  const handleRoyalUpgrade = () => {
    // TODO: Navigate to Royal subscription screen
    Alert.alert('Royal Upgrade', 'Royal membership screen coming soon!');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚀 Boost Hub</Text>
        <View style={styles.tokenBadge}>
          <Text style={styles.tokenText}>💎 {tokenBalance}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Boost your Avalo experience with tokens and premium features
        </Text>

        {/* VIP/Royal Boost Tooltip */}
        <View style={styles.tooltipContainer}>
          <Text style={styles.tooltipIcon}>ℹ️</Text>
          <Text style={styles.tooltipText}>
            💡 Tip: VIP & Royal otrzymują dłuższe boosty
          </Text>
        </View>

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

        {/* Buy Tokens Card */}
        <TouchableOpacity style={styles.card} onPress={handleBuyTokens}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>💎</Text>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Buy Tokens</Text>
              <Text style={styles.cardSubtitle}>Get instant tokens for premium features</Text>
            </View>
          </View>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Unlock premium chats & AI bots</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Send SuperLikes & boosts</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Access exclusive features</Text>
            </View>
          </View>

          <View style={styles.ctaGradient}>
            <Text style={styles.ctaText}>Buy Tokens Now</Text>
          </View>
        </TouchableOpacity>

        {/* Earn Tokens Card */}
        <TouchableOpacity style={styles.card} onPress={handleEarnTokens}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📺</Text>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Earn Tokens by Watching Ads</Text>
              <Text style={styles.cardSubtitle}>Free tokens for your time</Text>
            </View>
          </View>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Watch short video ads</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Earn 5-10 tokens per ad</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>No purchase required</Text>
            </View>
          </View>

          <View style={styles.ctaGradient}>
            <Text style={styles.ctaText}>Start Earning</Text>
          </View>
        </TouchableOpacity>

        {/* VIP Upgrade Card */}
        <TouchableOpacity style={styles.card} onPress={handleVIPUpgrade}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>👑</Text>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>VIP Upgrade</Text>
              <Text style={styles.cardSubtitle}>Premium features & perks</Text>
            </View>
          </View>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Unlimited likes & matches</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>See who liked you</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Priority in discovery</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>50% fewer ads</Text>
            </View>
          </View>

          <View style={styles.ctaGradient}>
            <Text style={styles.ctaText}>Upgrade to VIP</Text>
          </View>
        </TouchableOpacity>

        {/* Royal Upgrade Card */}
        <TouchableOpacity style={styles.card} onPress={handleRoyalUpgrade}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>💫</Text>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Royal Upgrade</Text>
              <Text style={styles.cardSubtitle}>Ultimate Avalo experience</Text>
            </View>
          </View>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>All VIP features included</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Completely ad-free experience</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>500 bonus tokens monthly</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Exclusive Royal badge</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Premium AI companions access</Text>
            </View>
          </View>

          <View style={styles.ctaGradient}>
            <Text style={styles.ctaText}>Upgrade to Royal</Text>
          </View>
        </TouchableOpacity>

        {/* Boost History Section */}
        <View style={styles.boostHistorySection}>
          <Text style={styles.boostHistoryTitle}>Twoje ostatnie boosty</Text>
          <Text style={styles.boostHistorySubtitle}>
            Historia wyróżnień profilu i przypomnień o czacie
          </Text>

          {loadingBoosts ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#40E0D0" />
              <Text style={styles.loadingText}>Ładowanie...</Text>
            </View>
          ) : boostsError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{boostsError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadBoosts}>
                <Text style={styles.retryButtonText}>Spróbuj ponownie</Text>
              </TouchableOpacity>
            </View>
          ) : boosts.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>⚡</Text>
              <Text style={styles.emptyStateTitle}>Brak boostów</Text>
              <Text style={styles.emptyStateDescription}>
                Wyróżnij swój profil lub przypomnij o czacie, aby szybciej zdobywać tokeny.
              </Text>
            </View>
          ) : (
            <View style={styles.boostsList}>
              {boosts.slice(0, 5).map((boost) => (
                <View key={boost.id} style={styles.boostCard}>
                  <View style={styles.boostCardLeft}>
                    <Text style={styles.boostTypeLabel}>
                      {getBoostTypeLabel(boost.type)}
                    </Text>
                    <Text style={styles.boostTimeLabel}>
                      {formatBoostTime(boost.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.boostCardRight}>
                    <View style={styles.boostTokens}>
                      <Text style={styles.boostTokenIcon}>💎</Text>
                      <Text style={styles.boostTokenAmount}>{boost.tokensCharged}</Text>
                    </View>
                    <View
                      style={[
                        styles.boostStatusPill,
                        { borderColor: getBoostStatusColor(boost.status) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.boostStatusText,
                          { color: getBoostStatusColor(boost.status) },
                        ]}
                      >
                        {getBoostStatusLabel(boost.status)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showTokenModal}
        onClose={() => {
          setShowTokenModal(false);
          loadBalance();
        }}
        reason="Boost your Avalo experience"
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  tokenBadge: {
    backgroundColor: '#FFF5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  tokenText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  benefitsList: {
    marginBottom: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitIcon: {
    fontSize: 16,
    color: '#4CAF50',
    marginRight: 12,
    fontWeight: 'bold',
  },
  benefitText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  ctaGradient: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  academyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2A2A',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 20,
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
  tooltipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  tooltipIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  tooltipText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  boostHistorySection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  boostHistoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  boostHistorySubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  boostsList: {
    gap: 12,
  },
  boostCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  boostCardLeft: {
    flex: 1,
  },
  boostTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  boostTimeLabel: {
    fontSize: 13,
    color: '#666',
  },
  boostCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  boostTokens: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  boostTokenIcon: {
    fontSize: 14,
  },
  boostTokenAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  boostStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  boostStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
