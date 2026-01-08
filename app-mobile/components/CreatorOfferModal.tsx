/**
 * Creator Offer Modal Component
 * Pack 33-6 — Display and purchase creator offers
 * Shows offer details and handles simulated token purchase
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
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  CreatorOffer,
  purchaseOffer,
} from '../services/creatorOfferService';
import { getTokenBalance, deductTokens } from '../services/tokenService';

interface CreatorOfferModalProps {
  visible: boolean;
  offer: CreatorOffer | null;
  viewerId: string;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
}

export default function CreatorOfferModal({
  visible,
  offer,
  viewerId,
  onClose,
  onPurchaseSuccess,
}: CreatorOfferModalProps) {
  const { t } = useTranslation();
  const [purchasing, setPurchasing] = useState(false);

  if (!offer) return null;

  const creatorEarnings = Math.floor(offer.tokenPrice * 0.65);
  const avaloFee = Math.floor(offer.tokenPrice * 0.35);

  const getTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return t('creatorOffers.expired') || 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return t('creatorOffers.viewer_expiresIn', { time: `${hours}h ${minutes}m` });
  };

  const getPerkIcon = (type: string): string => {
    switch (type) {
      case 'PPV_UNLOCK_PACK':
        return '🎥';
      case 'VIP_ROOM_ACCESS':
        return '👑';
      case 'COSMETIC_BOOST':
        return '✨';
      default:
        return '🎁';
    }
  };

  const getOfferTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'BUNDLE':
        return '#D4AF37';
      case 'LAUNCH':
        return '#40E0D0';
      case 'FLASH':
        return '#FF6B6B';
      default:
        return '#D4AF37';
    }
  };

  const handlePurchase = async () => {
    if (!offer || !viewerId) return;

    setPurchasing(true);

    try {
      // Check token balance
      const balance = await getTokenBalance(viewerId);
      
      if (balance < offer.tokenPrice) {
        Alert.alert(
          t('tokenPurchase.insufficientTitle') || 'Insufficient Tokens',
          t('tokenPurchase.insufficientMessage') || 'You need more tokens to unlock this offer.',
          [
            { text: t('common.cancel') || 'Cancel', style: 'cancel' },
            {
              text: t('tokenPurchase.buyTokens') || 'Buy Tokens',
              onPress: () => {
                onClose();
                // Navigate to token purchase (would be handled by caller)
              },
            },
          ]
        );
        return;
      }

      // Simulate token deduction
      await deductTokens(viewerId, offer.tokenPrice);

      // Record the purchase
      await purchaseOffer(offer.creatorId, viewerId, offer.id);

      // Success feedback
      Alert.alert(
        t('creatorOffers.toast_offerUnlocked') || 'Offer Unlocked!',
        t('creatorOffers.unlockSuccess') || 'You now have access to all perks included in this offer.',
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
    } catch (error: any) {
      console.error('Error purchasing offer:', error);
      Alert.alert(
        t('common.error') || 'Error',
        error.message || t('creatorOffers.purchaseError') || 'Failed to purchase offer. Please try again.'
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
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: getOfferTypeBadgeColor(offer.type) },
                ]}
              >
                <Text style={styles.typeBadgeText}>
                  {t(`creatorOffers.offerType_${offer.type.toLowerCase()}`) || offer.type}
                </Text>
              </View>
              
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={styles.title}>{offer.title}</Text>

            {/* Time Remaining */}
            <View style={styles.timeCard}>
              <Text style={styles.timeIcon}>⏰</Text>
              <Text style={styles.timeText}>{getTimeRemaining(offer.expiresAt)}</Text>
            </View>

            {/* Description */}
            <Text style={styles.description}>{offer.description}</Text>

            {/* Perks Section */}
            <View style={styles.perksSection}>
              <Text style={styles.sectionTitle}>
                {t('creatorOffers.perksIncluded') || 'What you get:'}
              </Text>
              
              {offer.perks.map((perk, index) => (
                <View key={index} style={styles.perkItem}>
                  <Text style={styles.perkIcon}>{getPerkIcon(perk.type)}</Text>
                  <View style={styles.perkInfo}>
                    <Text style={styles.perkLabel}>{perk.label}</Text>
                    {perk.durationHours && (
                      <Text style={styles.perkDuration}>
                        {perk.durationHours >= 24
                          ? `${Math.floor(perk.durationHours / 24)} ${t('common.days') || 'days'}`
                          : `${perk.durationHours} ${t('common.hours') || 'hours'}`}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Pricing Summary */}
            <View style={styles.pricingCard}>
              <Text style={styles.pricingTitle}>
                {t('creatorOffers.pricingDetails') || 'Pricing Details'}
              </Text>
              
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {t('creatorOffers.viewer_youPay') || 'You pay:'}
                </Text>
                <Text style={styles.pricingValue}>
                  {offer.tokenPrice} {t('common.tokens') || 'tokens'}
                </Text>
              </View>

              <View style={styles.pricingDivider} />

              <View style={styles.pricingRow}>
                <Text style={styles.pricingSubLabel}>
                  {t('creatorOffers.creatorEarns') || 'Creator gets (65%):'}
                </Text>
                <Text style={styles.pricingSubValue}>
                  {creatorEarnings} {t('common.tokens') || 'tokens'}
                </Text>
              </View>

              <View style={styles.pricingRow}>
                <Text style={styles.pricingSubLabel}>
                  {t('creatorOffers.avaloFee') || 'Avalo fee (35%):'}
                </Text>
                <Text style={styles.pricingSubValue}>
                  {avaloFee} {t('common.tokens') || 'tokens'}
                </Text>
              </View>
            </View>

            {/* CTA Buttons */}
            <TouchableOpacity
              style={[styles.unlockButton, purchasing && styles.unlockButtonDisabled]}
              onPress={handlePurchase}
              disabled={purchasing}
              activeOpacity={0.8}
            >
              <Text style={styles.unlockButtonText}>
                {purchasing
                  ? t('common.processing') || 'Processing...'
                  : t('creatorOffers.viewer_unlockNow') || 'Unlock Now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={purchasing}
            >
              <Text style={styles.cancelButtonText}>
                {t('creatorOffers.viewer_maybeLater') || 'Maybe Later'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
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
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1610',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
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
  description: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
    marginBottom: 24,
  },
  perksSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#D4AF37',
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
    marginBottom: 2,
  },
  perkDuration: {
    fontSize: 12,
    color: '#A0A0A0',
  },
  pricingCard: {
    backgroundColor: '#1A1610',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
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
  pricingValue: {
    fontSize: 20,
    color: '#D4AF37',
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
  unlockButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  unlockButtonDisabled: {
    opacity: 0.6,
  },
  unlockButtonText: {
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
