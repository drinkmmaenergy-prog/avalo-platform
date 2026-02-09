/**
 * PACK 452 — Premium Offer Screen
 * Allows payers to create premium offers and earners to respond to them.
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { colors, spacing, fontSizes, fontWeights, radius } from '@/shared/theme';
import { getFunctions, httpsCallable } from 'firebase/functions';

const MULTIPLIERS = [2, 3, 5, 10, 15, 20] as const;
const EXCLUSIVE_MIN_MULTIPLIER = 10;

interface PremiumOffer {
  offerId: string;
  chatId: string;
  payerId: string;
  earnerId: string;
  multiplier: number;
  exclusive: boolean;
  status: string;
  reserveTokens: number;
  baseChatEntryTokens: number;
  createdAt: any;
  expiresAt: any;
}

export default function PremiumOfferScreen() {
  const router = useRouter();
  const { chatId, role } = useLocalSearchParams<{ chatId: string; role: 'payer' | 'earner' }>();
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(2);
  const [exclusive, setExclusive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingOffers, setPendingOffers] = useState<PremiumOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);

  const functions = getFunctions();

  useEffect(() => {
    loadPendingOffers();
  }, [chatId]);

  async function loadPendingOffers() {
    try {
      setLoadingOffers(true);
      const getPremiumOffers = httpsCallable(functions, 'pack452_getPremiumOffers');
      const result = await getPremiumOffers({ chatId, status: 'PENDING' });
      const data = result.data as { success: boolean; offers: PremiumOffer[] };
      if (data.success) {
        setPendingOffers(data.offers || []);
      }
    } catch (error) {
      console.error('Failed to load offers:', error);
    } finally {
      setLoadingOffers(false);
    }
  }

  async function handleCreateOffer() {
    if (!chatId) return;

    setLoading(true);
    try {
      const createOffer = httpsCallable(functions, 'pack452_createPremiumOffer');
      const result = await createOffer({
        chatId,
        multiplier: selectedMultiplier,
        exclusive,
      });
      const data = result.data as { success: boolean; offerId?: string; reserveTokens?: number; error?: string };

      if (data.success) {
        Alert.alert(
          'Offer Created',
          `Premium ${selectedMultiplier}x offer sent! ${data.reserveTokens} tokens reserved.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to create offer');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create offer');
    } finally {
      setLoading(false);
    }
  }

  async function handleRespondToOffer(offerId: string, accept: boolean) {
    setLoading(true);
    try {
      const respondToOffer = httpsCallable(functions, 'pack452_respondToPremiumOffer');
      const result = await respondToOffer({ offerId, accept });
      const data = result.data as { success: boolean; error?: string };

      if (data.success) {
        Alert.alert(
          accept ? 'Offer Accepted' : 'Offer Declined',
          accept ? 'Premium mode is now active!' : 'Tokens have been returned to the payer.',
          [{ text: 'OK', onPress: () => { loadPendingOffers(); router.back(); } }]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to respond to offer');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to respond to offer');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelOffer(offerId: string) {
    setLoading(true);
    try {
      const cancelOffer = httpsCallable(functions, 'pack452_cancelPremiumOffer');
      const result = await cancelOffer({ offerId });
      const data = result.data as { success: boolean; refundedTokens?: number; error?: string };

      if (data.success) {
        Alert.alert('Offer Cancelled', `${data.refundedTokens} tokens returned.`);
        loadPendingOffers();
      } else {
        Alert.alert('Error', data.error || 'Failed to cancel offer');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to cancel offer');
    } finally {
      setLoading(false);
    }
  }

  const canBeExclusive = selectedMultiplier >= EXCLUSIVE_MIN_MULTIPLIER;

  return (
    <View style={styles.container}>
      <AppHeader title="Premium Offer" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

        {/* Pending Offers Section */}
        {loadingOffers ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : pendingOffers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Offers</Text>
            {pendingOffers.map((offer) => (
              <View key={offer.offerId} style={styles.offerCard}>
                <View style={styles.offerHeader}>
                  <Text style={styles.offerMultiplier}>{offer.multiplier}x</Text>
                  {offer.exclusive && (
                    <View style={styles.exclusiveBadge}>
                      <Text style={styles.exclusiveBadgeText}>EXCLUSIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.offerDetail}>
                  Reserved: {offer.reserveTokens} tokens
                </Text>
                <Text style={styles.offerDetail}>
                  Base entry: {offer.baseChatEntryTokens} tokens
                </Text>

                {role === 'earner' ? (
                  <View style={styles.offerActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleRespondToOffer(offer.offerId, true)}
                      disabled={loading}
                    >
                      <Text style={styles.actionButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.declineButton]}
                      onPress={() => handleRespondToOffer(offer.offerId, false)}
                      disabled={loading}
                    >
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => handleCancelOffer(offer.offerId)}
                    disabled={loading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Offer</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {/* Create Offer Section (payer only) */}
        {role === 'payer' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Premium Offer</Text>
            <Text style={styles.description}>
              Send a premium offer to boost the burn rate. Higher multipliers mean more tokens per message.
            </Text>

            <Text style={styles.label}>Select Multiplier</Text>
            <View style={styles.multiplierGrid}>
              {MULTIPLIERS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.multiplierButton,
                    selectedMultiplier === m && styles.multiplierButtonSelected,
                  ]}
                  onPress={() => {
                    setSelectedMultiplier(m);
                    if (m < EXCLUSIVE_MIN_MULTIPLIER) {
                      setExclusive(false);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.multiplierText,
                      selectedMultiplier === m && styles.multiplierTextSelected,
                    ]}
                  >
                    {m}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Exclusive Toggle */}
            <TouchableOpacity
              style={[
                styles.exclusiveToggle,
                !canBeExclusive && styles.exclusiveToggleDisabled,
                exclusive && styles.exclusiveToggleActive,
              ]}
              onPress={() => canBeExclusive && setExclusive(!exclusive)}
              disabled={!canBeExclusive}
            >
              <View style={styles.exclusiveToggleContent}>
                <Text style={styles.exclusiveToggleIcon}>👑</Text>
                <View style={styles.exclusiveToggleTextContainer}>
                  <Text style={[
                    styles.exclusiveToggleTitle,
                    !canBeExclusive && styles.exclusiveToggleTextDisabled,
                  ]}>
                    Exclusive Mode
                  </Text>
                  <Text style={styles.exclusiveToggleDescription}>
                    {canBeExclusive
                      ? 'Earner focuses only on your chat'
                      : `Requires ${EXCLUSIVE_MIN_MULTIPLIER}x+ multiplier`}
                  </Text>
                </View>
                <View style={[
                  styles.toggleIndicator,
                  exclusive && styles.toggleIndicatorActive,
                ]} />
              </View>
            </TouchableOpacity>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createButton, loading && styles.createButtonDisabled]}
              onPress={handleCreateOffer}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.createButtonText}>
                  Send {selectedMultiplier}x {exclusive ? 'Exclusive ' : ''}Offer
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  label: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  multiplierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  multiplierButton: {
    width: '30%',
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  multiplierButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  multiplierText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.secondary,
  },
  multiplierTextSelected: {
    color: colors.primary,
  },
  exclusiveToggle: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  exclusiveToggleDisabled: {
    opacity: 0.5,
  },
  exclusiveToggleActive: {
    borderColor: '#FFD700',
    backgroundColor: '#FFD70015',
  },
  exclusiveToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exclusiveToggleIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  exclusiveToggleTextContainer: {
    flex: 1,
  },
  exclusiveToggleTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  exclusiveToggleTextDisabled: {
    color: colors.secondary,
  },
  exclusiveToggleDescription: {
    fontSize: fontSizes.xs,
    color: colors.secondary,
  },
  toggleIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  toggleIndicatorActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 24,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.background,
  },
  offerCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  offerMultiplier: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  exclusiveBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: spacing.sm,
  },
  exclusiveBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#000',
  },
  offerDetail: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    marginBottom: 2,
  },
  offerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: colors.primary,
  },
  declineButton: {
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#FF4444',
    marginTop: spacing.sm,
  },
  actionButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.background,
  },
  declineButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.secondary,
  },
  cancelButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#FF4444',
  },
});
