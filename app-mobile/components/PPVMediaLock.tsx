/**
 * PPV Media Lock Component
 * Phase 33-4: Overlay for locked PPV media
 * 
 * Features:
 * - Blurred thumbnail with lock icon
 * - Token price display with gold badge
 * - CTA button: "Unlock for X tokens"
 * - Insufficient tokens modal showing "Buy tokens" option
 * - VIP subscriber discount indicator
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Image,
  Dimensions,
  ImageSourcePropType,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { 
  unlock, 
  getEffectivePrice,
  calculateVIPPrice,
} from '../services/ppvService';

const { width } = Dimensions.get('window');

interface PPVMediaLockProps {
  mediaId: string;
  creatorId: string;
  basePrice: number;
  isVIPSubscriber: boolean;
  userBalance: number;
  thumbnailUrl: string | ImageSourcePropType;
  onUnlock?: () => void;
  onBuyTokens?: () => void;
}

export function PPVMediaLock({
  mediaId,
  creatorId,
  basePrice,
  isVIPSubscriber,
  userBalance,
  thumbnailUrl,
  onUnlock,
  onBuyTokens,
}: PPVMediaLockProps) {
  const { t } = useTranslation();
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [effectivePrice, setEffectivePrice] = useState(basePrice);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadEffectivePrice();
    startPulseAnimation();
  }, [basePrice, isVIPSubscriber]);

  const loadEffectivePrice = async () => {
    const price = await getEffectivePrice(mediaId, isVIPSubscriber);
    setEffectivePrice(price);
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleUnlockPress = async () => {
    if (userBalance < effectivePrice) {
      setShowInsufficientModal(true);
      return;
    }

    setUnlocking(true);
    const result = await unlock(creatorId, mediaId, creatorId, effectivePrice);
    
    if (result.success && onUnlock) {
      onUnlock();
    }
    setUnlocking(false);
  };

  const handleBuyTokens = () => {
    setShowInsufficientModal(false);
    if (onBuyTokens) {
      onBuyTokens();
    }
  };

  const vipDiscount = isVIPSubscriber ? basePrice - effectivePrice : 0;

  return (
    <>
      <View style={styles.container}>
        {/* Blurred thumbnail background */}
        <Image
          source={typeof thumbnailUrl === 'string' ? { uri: thumbnailUrl } : thumbnailUrl}
          style={styles.thumbnail}
          blurRadius={20}
        />

        {/* Blur overlay */}
        <View style={styles.blurOverlay}>
          {/* Lock icon */}
          <View style={styles.lockIcon}>
            <Text style={styles.lockIconText}>🔒</Text>
          </View>

          {/* Price badge */}
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>{effectivePrice} 💎</Text>
          </View>

          {/* VIP discount indicator */}
          {isVIPSubscriber && vipDiscount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>
                −{vipDiscount} 💎 VIP
              </Text>
            </View>
          )}

          {/* Unlock button */}
          <Animated.View
            style={[
              styles.unlockButtonContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={handleUnlockPress}
              disabled={unlocking}
              activeOpacity={0.8}
            >
              <Text style={styles.unlockButtonText}>
                {unlocking 
                  ? t('ppv.unlocking') 
                  : t('ppv.unlockFor', { tokens: effectivePrice })
                }
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Insufficient tokens modal */}
      <Modal
        visible={showInsufficientModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInsufficientModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalIcon}>💎</Text>
            <Text style={styles.modalTitle}>
              {t('ppv.insufficientTokens')}
            </Text>
            <Text style={styles.modalMessage}>
              {t('ppv.needMoreTokens', { 
                required: effectivePrice, 
                balance: userBalance 
              })}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowInsufficientModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelButtonText}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBuyButton}
                onPress={handleBuyTokens}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBuyButtonText}>
                  {t('ppv.buyTokens')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F0F0F',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  blurOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lockIconText: {
    fontSize: 40,
  },
  priceBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  discountBadge: {
    backgroundColor: 'rgba(64, 224, 208, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  discountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  unlockButtonContainer: {
    width: '80%',
    maxWidth: 280,
  },
  unlockButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  unlockButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
  },
  modalBuyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
  },
  modalBuyButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
