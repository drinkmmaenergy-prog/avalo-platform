/**
 * Live Entry Paywall Component
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 * 
 * Displays paywall when viewer tries to enter LIVE without access.
 * Shows entry price with VIP discount if applicable.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { calculateEntryPrice } from '../services/liveService';

interface LiveEntryPaywallProps {
  visible: boolean;
  entryFee: number;
  isVip: boolean;
  userBalance: number;
  onClose: () => void;
  onPay: () => Promise<void>;
  creatorName?: string;
}

export function LiveEntryPaywall({
  visible,
  entryFee,
  isVip,
  userBalance,
  onClose,
  onPay,
  creatorName = 'Creator',
}: LiveEntryPaywallProps) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Calculate actual price with VIP discount
  const actualPrice = calculateEntryPrice(entryFee, isVip);
  const hasEnoughTokens = userBalance >= actualPrice;
  const discount = isVip ? Math.round((entryFee - actualPrice) / entryFee * 100) : 0;

  // Pulse animation for CTA button
  React.useEffect(() => {
    if (!visible) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [visible, pulseAnim]);

  const handlePay = async () => {
    if (!hasEnoughTokens) {
      // Navigate to token purchase
      onClose();
      router.push('/tokens/buy' as any);
      return;
    }

    try {
      setPaying(true);
      await onPay();
      onClose();
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setPaying(false);
    }
  };

  const handleBuyTokens = () => {
    onClose();
    router.push('/tokens/buy' as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>🎥</Text>
            <Text style={styles.title}>Enter LIVE Room</Text>
            <Text style={styles.subtitle}>
              Join {creatorName}'s live stream
            </Text>
          </View>

          {/* Pricing Info */}
          <View style={styles.pricingCard}>
            {isVip && discount > 0 ? (
              <>
                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeText}>VIP DISCOUNT</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.originalPrice}>{entryFee} tokens</Text>
                  <Text style={styles.discountLabel}>-{discount}%</Text>
                </View>
                <Text style={styles.finalPrice}>{actualPrice} tokens</Text>
              </>
            ) : (
              <Text style={styles.finalPrice}>{actualPrice} tokens</Text>
            )}

            <View style={styles.balanceInfo}>
              <Text style={styles.balanceLabel}>Your balance:</Text>
              <Text style={[
                styles.balanceAmount,
                !hasEnoughTokens && styles.balanceInsufficient
              ]}>
                {userBalance} tokens
              </Text>
            </View>

            {!hasEnoughTokens && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Insufficient tokens. You need {actualPrice - userBalance} more tokens.
                </Text>
              </View>
            )}
          </View>

          {/* Benefit List */}
          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTitle}>What you get:</Text>
            <View style={styles.benefit}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Full access to this LIVE session</Text>
            </View>
            <View style={styles.benefit}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Real-time interaction with creator</Text>
            </View>
            <View style={styles.benefit}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Access valid for entire session</Text>
            </View>
            {isVip && (
              <View style={styles.benefit}>
                <Text style={styles.benefitIcon}>👑</Text>
                <Text style={styles.benefitTextVip}>VIP exclusive 20% discount</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {hasEnoughTokens ? (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={styles.payButton}
                  onPress={handlePay}
                  disabled={paying}
                  activeOpacity={0.8}
                >
                  <Text style={styles.payButtonText}>
                    {paying ? 'Processing...' : `Enter LIVE for ${actualPrice} tokens`}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <TouchableOpacity
                style={styles.buyTokensButton}
                onPress={handleBuyTokens}
                activeOpacity={0.8}
              >
                <Text style={styles.buyTokensButtonText}>Buy Tokens</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Note */}
          <Text style={styles.footerNote}>
            65% goes to creator • 35% platform fee
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  pricingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  vipBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    alignSelf: 'center',
    marginBottom: 12,
  },
  vipBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  originalPrice: {
    fontSize: 16,
    color: '#888888',
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  discountLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  finalPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#D4AF37',
    textAlign: 'center',
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  balanceInsufficient: {
    color: '#FF4444',
  },
  warningBox: {
    backgroundColor: '#FF4444',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  benefitsContainer: {
    marginBottom: 24,
  },
  benefitsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitIcon: {
    fontSize: 16,
    marginRight: 8,
    color: '#40E0D0',
  },
  benefitText: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  benefitTextVip: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
  payButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  buyTokensButton: {
    backgroundColor: '#40E0D0',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buyTokensButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#AAAAAA',
  },
  footerNote: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    marginTop: 16,
  },
});
