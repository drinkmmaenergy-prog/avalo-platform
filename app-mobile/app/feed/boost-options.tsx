/**
 * PACK 325 — Feed Boost Options Screen
 * Allows users to select boost tier and promote their posts/reels
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from "@/hooks/useAuth";
import { callFunction } from "@/lib/firebase";
import { colors } from "@/shared/theme";

type BoostSize = 'SMALL' | 'MEDIUM' | 'LARGE';

interface BoostTier {
  size: BoostSize;
  tokens: number;
  duration: string;
  label: string;
  description: string;
  popular?: boolean;
}

const BOOST_TIERS: BoostTier[] = [
  {
    size: 'SMALL',
    tokens: 200,
    duration: '24 hours',
    label: 'Small Boost',
    description: '1 day of increased visibility',
  },
  {
    size: 'MEDIUM',
    tokens: 500,
    duration: '3 days',
    label: 'Medium Boost',
    description: '3 days of increased visibility',
    popular: true,
  },
  {
    size: 'LARGE',
    tokens: 1000,
    duration: '7 days',
    label: 'Large Boost',
    description: '1 week of increased visibility',
  },
];

export default function BoostOptionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  
  const contentId = params.contentId as string;
  const contentType = params.contentType as 'POST' | 'REEL';

  const [selectedTier, setSelectedTier] = useState<BoostSize>('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Load wallet balance
  useEffect(() => {
    loadWalletBalance();
  }, []);

  const loadWalletBalance = async () => {
    try {
      setLoadingBalance(true);
      const result = await callFunction('pack277_getBalance', {});
      
      if (result.success) {
        setWalletBalance(result.balance || 0);
      }
    } catch (error) {
      console.error('Error loading wallet balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleBoost = async () => {
    const tier = BOOST_TIERS.find(t => t.size === selectedTier);
    if (!tier) return;

    // Check balance
    if (walletBalance < tier.tokens) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${tier.tokens} tokens to boost this content. You currently have ${walletBalance} tokens.\n\nWould you like to buy more tokens?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Tokens',
            onPress: () => router.push('/wallet/purchase'),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Confirm Boost',
      `Boost your ${contentType.toLowerCase()} for ${tier.duration}?\n\nCost: ${tier.tokens} tokens\nNew balance: ${walletBalance - tier.tokens} tokens`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => createBoost(),
        },
      ]
    );
  };

  const createBoost = async () => {
    try {
      setLoading(true);

      const result = await callFunction('pack325_createFeedBoost_callable', {
        contentType,
        contentId,
        boostSize: selectedTier,
        targeting: {}, // Can be extended for advanced targeting
      });

      if (result.success) {
        Alert.alert(
          'Boost Active! 🚀',
          `Your ${contentType.toLowerCase()} is now being promoted for ${BOOST_TIERS.find(t => t.size === selectedTier)?.duration}.`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        throw new Error(result.error || 'Failed to create boost');
      }
    } catch (error: any) {
      console.error('Error creating boost:', error);
      Alert.alert('Error', error.message || 'Failed to boost content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingBalance) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Boost Your {contentType === 'POST' ? 'Post' : 'Reel'}</Text>
          <Text style={styles.subtitle}>
            Increase visibility and reach more people
          </Text>
        </View>

        {/* Wallet Balance */}
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>Your Balance</Text>
          <Text style={styles.walletBalance}>{walletBalance} tokens</Text>
        </View>

        {/* Boost Tiers */}
        <View style={styles.tiersContainer}>
          <Text style={styles.sectionTitle}>Select Boost Duration</Text>
          
          {BOOST_TIERS.map((tier) => {
            const isSelected = selectedTier === tier.size;
            const canAfford = walletBalance >= tier.tokens;

            return (
              <TouchableOpacity
                key={tier.size}
                style={[
                  styles.tierCard,
                  isSelected && styles.tierCardSelected,
                  !canAfford && styles.tierCardDisabled,
                ]}
                onPress={() => canAfford && setSelectedTier(tier.size)}
                disabled={!canAfford}
              >
                {tier.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>POPULAR</Text>
                  </View>
                )}
                
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierLabel, !canAfford && styles.tierLabelDisabled]}>
                    {tier.label}
                  </Text>
                  <Text style={[styles.tierTokens, !canAfford && styles.tierTokensDisabled]}>
                    {tier.tokens} tokens
                  </Text>
                </View>
                
                <Text style={[styles.tierDuration, !canAfford && styles.tierDurationDisabled]}>
                  {tier.duration}
                </Text>
                
                <Text style={[styles.tierDescription, !canAfford && styles.tierDescriptionDisabled]}>
                  {tier.description}
                </Text>

                {!canAfford && (
                  <Text style={styles.insufficientText}>Insufficient balance</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How Boosts Work</Text>
          <Text style={styles.infoText}>
            • Your content will appear higher in feeds{'\n'}
            • Increased visibility for the boost duration{'\n'}
            • Track impressions, clicks, and profile visits{'\n'}
            • No refunds once boost is activated
          </Text>
        </View>
      </ScrollView>

      {/* Boost Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.boostButton,
            loading && styles.boostButtonDisabled,
          ]}
          onPress={handleBoost}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.boostButtonText}>
              Boost for {BOOST_TIERS.find(t => t.size === selectedTier)?.tokens} tokens
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  walletCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  walletBalance: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  tiersContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  tierCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  tierCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight || colors.surface,
  },
  tierCardDisabled: {
    opacity: 0.5,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    backgroundColor: colors.accent || colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  tierLabelDisabled: {
    color: colors.textSecondary,
  },
  tierTokens: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
  },
  tierTokensDisabled: {
    color: colors.textSecondary,
  },
  tierDuration: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  tierDurationDisabled: {
    color: colors.textSecondary,
  },
  tierDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tierDescriptionDisabled: {
    color: colors.textTertiary || colors.textSecondary,
  },
  insufficientText: {
    fontSize: 12,
    color: colors.error || '#ff4444',
    marginTop: 8,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e0e0e0',
  },
  boostButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  boostButtonDisabled: {
    opacity: 0.6,
  },
  boostButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
