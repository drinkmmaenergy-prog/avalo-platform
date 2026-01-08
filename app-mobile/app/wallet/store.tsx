/**
 * PACK 321 — Token Store Screen
 * Display and purchase token packs
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
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface TokenPack {
  id: string;
  name: string;
  tokens: number;
  pricePLN: number;
  priceUSD?: number;
  priceEUR?: number;
  active: boolean;
  order: number;
  bestValue?: boolean;
}

// PACK 341 — FINAL Token Packs
const FINAL_TOKEN_PACKS: TokenPack[] = [
  { id: 'mini', name: 'Mini', tokens: 100, pricePLN: 31.99, active: true, order: 1 },
  { id: 'basic', name: 'Basic', tokens: 300, pricePLN: 85.99, active: true, order: 2 },
  { id: 'standard', name: 'Standard', tokens: 500, pricePLN: 134.99, active: true, order: 3 },
  { id: 'premium', name: 'Premium', tokens: 1000, pricePLN: 244.99, active: true, order: 4 },
  { id: 'pro', name: 'Pro', tokens: 2000, pricePLN: 469.99, active: true, order: 5 },
  { id: 'elite', name: 'Elite', tokens: 5000, pricePLN: 1125.99, active: true, order: 6 },
  { id: 'royal', name: 'Royal', tokens: 10000, pricePLN: 2149.99, active: true, order: 7, bestValue: true },
];

export default function TokenStoreScreen() {
  const router = useRouter();
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadTokenPacks();
  }, []);

  const loadTokenPacks = async () => {
    try {
      setLoading(true);
      
      // Use FINAL_TOKEN_PACKS from PACK 341 spec
      // Backend can still be called to get dynamic pricing if needed
      setPacks(FINAL_TOKEN_PACKS);
      
    } catch (err) {
      console.error('Load token packs error:', err);
      Alert.alert('Error', 'Failed to load token packs');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pack: TokenPack) => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Please sign in', 'You must be signed in to purchase tokens');
      return;
    }

    Alert.alert(
      'Purchase Tokens',
      `Buy ${pack.tokens} tokens for ${pack.pricePLN} PLN?\n\n` +
      `Important:\n` +
      `• 18+ only\n` +
      `• No refunds (except where required by law)\n` +
      `• Payout rate: 0.20 PLN/token`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: () => processPurchase(pack),
        },
      ]
    );
  };

  const processPurchase = async (pack: TokenPack) => {
    try {
      setPurchasing(pack.id);

      // TODO: Integrate with actual payment provider (Stripe, IAP)
      // For now, show placeholder
      Alert.alert(
        'Payment Gateway',
        'Payment integration coming soon. This will redirect to Stripe or use in-app purchase.',
        [{ text: 'OK' }]
      );

      // Example: Call purchase endpoint
      // const purchaseTokens = httpsCallable(functions, 'pack277_purchaseTokens');
      // await purchaseTokens({ packId: pack.id, platform: 'mobile' });
    } catch (err: any) {
      console.error('Purchase error:', err);
      Alert.alert('Purchase Failed', err.message || 'Failed to complete purchase');
    } finally {
      setPurchasing(null);
    }
  };

  const PackCard = ({ pack }: { pack: TokenPack }) => (
    <View style={[styles.packCard, pack.bestValue && styles.packCardBestValue]}>
      {pack.bestValue && (
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueBadgeText}>⭐ Best Value</Text>
        </View>
      )}

      <View style={styles.packHeader}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packTokens}>{pack.tokens.toLocaleString()}</Text>
        <Text style={styles.packTokensLabel}>tokens</Text>
      </View>

      <View style={styles.packDetails}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price:</Text>
          <Text style={styles.priceValue}>{pack.pricePLN.toFixed(2)} PLN</Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.valueLabel}>Payout value:</Text>
          <Text style={styles.valueValue}>
            {(pack.tokens * 0.20).toFixed(2)} PLN
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            💡 {((pack.pricePLN / pack.tokens) * 1000).toFixed(2)} PLN per 1000 tokens
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.purchaseButton,
          purchasing === pack.id && styles.purchaseButtonDisabled,
        ]}
        onPress={() => handlePurchase(pack)}
        disabled={purchasing === pack.id}
      >
        {purchasing === pack.id ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.purchaseButtonText}>Buy Now</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Token Store"
          rightAction={
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title="Token Store"
        rightAction={
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💎 Buy Tokens</Text>
          <Text style={styles.headerSubtitle}>
            Choose a pack that fits your needs
          </Text>
        </View>

        <View style={styles.packsGrid}>
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Important Information</Text>
          <Text style={styles.infoText}>
            ✓ Secure payment via Stripe{'\n'}
            ✓ Instant token delivery{'\n'}
            ✓ 18+ required{'\n'}
            ✓ Payout rate: 0.20 PLN/token{'\n'}
            ⚠️ No refunds on token purchases{'\n'}
            ⚠️ Terms &amp; Conditions apply
          </Text>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  header: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  headerSubtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  packsGrid: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  packCard: {
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 20,
    padding: spacing.xl,
    position: 'relative',
  },
  packCardBestValue: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  bestValueBadgeText: {
    color: colors.background,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  packHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  packName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  packTokens: {
    fontSize: 42,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  packTokensLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  packDetails: {
    marginBottom: spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary + '20',
  },
  priceLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  valueLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  valueValue: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  infoRow: {
    paddingTop: spacing.sm,
  },
  infoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  purchaseButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: colors.background,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  infoSection: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
  },
  infoTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});
