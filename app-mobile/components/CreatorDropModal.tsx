/**
 * Creator Drop Modal Component - Pack 33-7
 * Display and purchase creator drops
 * Shows drop details and handles simulated token purchase
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  CreatorDrop,
  joinDrop,
  calculateVIPPrice,
  getPerkInfo,
  formatTimeRemaining,
  hasUserPurchased,
} from '../services/creatorDropsService';
import { getTokenBalance, deductTokens } from '../services/tokenService';

interface CreatorDropModalProps {
  visible: boolean;
  drop: CreatorDrop | null;
  viewerId: string;
  isVip?: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
}

export default function CreatorDropModal({
  visible,
  drop,
  viewerId,
  isVip = false,
  onClose,
  onPurchaseSuccess,
}: CreatorDropModalProps) {
  const { t } = useTranslation();
  const [purchasing, setPurchasing] = useState(false);

  if (!drop) return null;

  const finalPrice = isVip ? calculateVIPPrice(drop.price) : drop.price;
  const seatsLeft = drop.seats - drop.purchasedBy.length;
  const timeLeft = formatTimeRemaining(drop.expiresAt);

  // Calculate earnings breakdown
  const creatorEarns = Math.floor(finalPrice * 0.65);
  const avaloFee = Math.floor(finalPrice * 0.35);

  const handlePurchase = async () => {
    if (!drop || !viewerId) return;

    setPurchasing(true);

    try {
      // Check if already purchased
      const alreadyPurchased = await hasUserPurchased(viewerId, drop.dropId);
      if (alreadyPurchased) {
        Alert.alert(
          t('common.error') || 'Error',
          t('creatorDrops.alreadyPurchased') || 'You have already purchased this drop.'
        );
        setPurchasing(false);
        return;
      }

      // Check token balance (UI simulation)
      const balance = await getTokenBalance(viewerId);
      
      if (balance < finalPrice) {
        Alert.alert(
          t('tokens.insufficientTokens') || 'Insufficient Tokens',
          t('creatorDrops.notEnoughTokensMessage') ||
            `You need ${finalPrice} tokens to purchase this drop. Your balance: ${balance} tokens.`,
          [
            { text: t('common.cancel') || 'Cancel', style: 'cancel' },
            {
              text: t('tokens.buyTokens') || 'Buy Tokens',
              onPress: () => {
                onClose();
                // Navigate to token purchase would be handled by caller
              },
            },
          ]
        );
        setPurchasing(false);
        return;
      }

      // Check if sold out
      if (seatsLeft <= 0) {
        Alert.alert(
          t('common.error') || 'Error',
          t('creatorDrops.soldOut') || 'This drop is sold out.'
        );
        setPurchasing(false);
        return;
      }

      // Simulate token deduction (UI only)
      await deductTokens(viewerId, finalPrice);

      // Record the purchase
      const result = await joinDrop(viewerId, drop.dropId, isVip);

      if (result.success) {
        // Success feedback
        Alert.alert(
          t('creatorDrops.successPurchase') || 'Purchase Successful!',
          t('creatorDrops.purchaseSuccessMessage') ||
            'You now have access to all perks included in this drop!',
          [
            {
              text: 'OK',
              onPress: () => {
                onClose();
                if (onPurchaseSuccess) {
                  onPurchaseSuccess();
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          t('common.error') || 'Error',
          result.error || t('creatorDrops.purchaseFailed') || 'Failed to purchase drop.'
        );
      }
    } catch (error: any) {
      console.error('Error purchasing drop:', error);
      Alert.alert(
        t('common.error') || 'Error',
        error.message || t('creatorDrops.purchaseFailed') || 'Failed to purchase drop. Please try again.'
      );
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerIcon}>🎁</Text>
                <View>
                  <Text style={styles.headerTitle}>
                    {t('creatorDrops.limitedDrop') || 'Limited Drop'}
                  </Text>
                  <Text style={styles.headerSubtitle}>
                    {seatsLeft} {t('creatorDrops.seatsLeft') || 'seats left'}
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Time Remaining Banner */}
            <View style={styles.timeCard}>
              <Text style={styles.timeIcon}>⏰</Text>
              <Text style={styles.timeText}>
                {t('creatorDrops.endsIn') || 'Ends in'}: {timeLeft}
              </Text>
            </View>

            {/* Perks Section */}
            <View style={styles.perksSection}>
              <Text style={styles.sectionTitle}>
                {t('creatorDrops.perks') || 'Included Perks'}
              </Text>
              
              {drop.perks.map((perk, index) => {
                const perkInfo = getPerkInfo(perk);
                return (
                  <View key={index} style={styles.perkItem}>
                    <Text style={styles.perkIcon}>{perkInfo.icon}</Text>
                    <View style={styles.perkInfo}>
                      <Text style={styles.perkLabel}>
                        {t(`creatorDrops.perk_${perkInfo.key}`) || perkInfo.key}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* VIP Discount Badge */}
            {isVip && (
              <View style={styles.vipBadge}>
                <Text style={styles.vipBadgeIcon}>👑</Text>
                <Text style={styles.vipBadgeText}>
                  {t('creatorDrops.vipDiscount') || 'VIP 5% Discount Applied'}
                </Text>
              </View>
            )}

            {/* Pricing Summary */}
            <View style={styles.pricingCard}>
              <Text style={styles.pricingTitle}>
                {t('creatorDrops.pricingDetails') || 'Pricing Details'}
              </Text>
              
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {t('creatorDrops.youPay') || 'You pay:'}
                </Text>
                <View style={styles.priceContainer}>
                  {isVip && drop.price !== finalPrice && (
                    <Text style={styles.originalPrice}>
                      {drop.price} 💎
                    </Text>
                  )}
                  <Text style={styles.pricingValue}>
                    {finalPrice} 💎
                  </Text>
                </View>
              </View>

              <View style={styles.pricingDivider} />

              <View style={styles.pricingRow}>
                <Text style={styles.pricingSubLabel}>
                  {t('creatorDrops.creatorShare') || 'Creator gets (65%):'}
                </Text>
                <Text style={styles.pricingSubValue}>
                  {creatorEarns} 💎
                </Text>
              </View>

              <View style={styles.pricingRow}>
                <Text style={styles.pricingSubLabel}>
                  {t('creatorDrops.avaloFee') || 'Avalo fee (35%):'}
                </Text>
                <Text style={styles.pricingSubValue}>
                  {avaloFee} 💎
                </Text>
              </View>
            </View>

            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoText}>
                💎 {t('creatorDrops.tokenDeductionInfo') ||
                  'Tokens will be deducted from your balance'}
              </Text>
              <Text style={styles.infoText}>
                ⚡ {t('creatorDrops.perksActivateInfo') ||
                  'Perks activate immediately after purchase'}
              </Text>
            </View>

            {/* CTA Buttons */}
            <TouchableOpacity
              style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
              onPress={handlePurchase}
              disabled={purchasing}
              activeOpacity={0.8}
            >
              {purchasing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.purchaseButtonText}>
                  {t('creatorDrops.buyNow') || 'Buy Now'} • {finalPrice} 💎
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={purchasing}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.cancel') || 'Cancel'}
              </Text>
            </TouchableOpacity>

            <View style={styles.bottomPadding} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#40E0D0',
    fontWeight: '600',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1610',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B6B',
  },
  timeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  timeText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  perksSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#40E0D0',
  },
  perkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  perkInfo: {
    flex: 1,
  },
  perkLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1A10',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  vipBadgeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  vipBadgeText: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '700',
  },
  pricingCard: {
    backgroundColor: '#1A1610',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 16,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pricingLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  originalPrice: {
    fontSize: 14,
    color: '#888',
    textDecorationLine: 'line-through',
  },
  pricingValue: {
    fontSize: 20,
    color: '#40E0D0',
    fontWeight: 'bold',
  },
  pricingDivider: {
    height: 1,
    backgroundColor: '#3A3A3A',
    marginVertical: 12,
  },
  pricingSubLabel: {
    fontSize: 13,
    color: '#A0A0A0',
  },
  pricingSubValue: {
    fontSize: 13,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#A0A0A0',
    lineHeight: 18,
  },
  purchaseButton: {
    backgroundColor: '#40E0D0',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 0.5,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3A3A3A',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  bottomPadding: {
    height: 20,
  },
});
