/**
 * PHASE 31C - BottomSheetPromo Component
 * UI-only discount display component for mobile
 * Shows active discount offers with countdown timer
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DiscountOffer, ActiveDiscount } from '../../shared/types/discounts';
import { 
  getActiveDiscount, 
  formatTimeRemaining,
  clearActiveDiscount 
} from '../../shared/utils/discountEngine';

interface BottomSheetPromoProps {
  visible: boolean;
  offer: DiscountOffer | null;
  onClose: () => void;
  onActivate: () => void;
  locale?: 'en' | 'pl';
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const BottomSheetPromo: React.FC<BottomSheetPromoProps> = ({
  visible,
  offer,
  onClose,
  onActivate,
  locale = 'en',
}) => {
  const router = useRouter();
  const [slideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));
  const [activeDiscount, setActiveDiscount] = useState<ActiveDiscount | null>(null);

  // Translations
  const t = {
    en: {
      limitedTime: 'Limited Time Offer',
      expiresIn: 'Expires in',
      save: 'Save',
      oldPrice: 'Original Price',
      newPrice: 'Your Price',
      activate: 'Activate Offer',
      noThanks: 'No Thanks',
      discount: 'Discount',
    },
    pl: {
      limitedTime: 'Oferta Czasowa',
      expiresIn: 'Wygasa za',
      save: 'Oszczędź',
      oldPrice: 'Cena Oryginalna',
      newPrice: 'Twoja Cena',
      activate: 'Aktywuj Ofertę',
      noThanks: 'Nie, Dziękuję',
      discount: 'Zniżka',
    },
  };

  const translations = t[locale];

  // Update active discount info every second
  useEffect(() => {
    if (!offer) return;

    const updateDiscount = () => {
      const active = getActiveDiscount(offer);
      setActiveDiscount(active);

      if (active?.isExpired) {
        clearActiveDiscount();
        onClose();
      }
    };

    updateDiscount();
    const interval = setInterval(updateDiscount, 1000);

    return () => clearInterval(interval);
  }, [offer, onClose]);

  // Animate sheet in/out
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!offer || !activeDiscount) return null;

  const handleActivate = () => {
    onActivate();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Content */}
            <View style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.limitedTimeText}>
                  ⚡ {translations.limitedTime}
                </Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountBadgeText}>
                    {offer.discountPercent}% OFF
                  </Text>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.title}>{offer.displayText.title}</Text>
              <Text style={styles.description}>{offer.displayText.description}</Text>

              {/* Countdown Timer */}
              <View style={styles.timerContainer}>
                <Text style={styles.timerLabel}>{translations.expiresIn}</Text>
                <Text style={styles.timerValue}>
                  {formatTimeRemaining(activeDiscount.timeRemaining)}
                </Text>
              </View>

              {/* Pricing */}
              <View style={styles.pricingContainer}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{translations.oldPrice}</Text>
                  <Text style={styles.oldPrice}>
                    ${offer.originalPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{translations.newPrice}</Text>
                  <Text style={styles.newPrice}>
                    ${offer.discountedPrice.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Savings */}
              <View style={styles.savingsContainer}>
                <Text style={styles.savingsText}>
                  💰 {offer.displayText.savings}
                </Text>
              </View>

              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.activateButton}
                onPress={handleActivate}
                activeOpacity={0.8}
              >
                <Text style={styles.activateButtonText}>
                  {translations.activate}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dismissButton}
                onPress={onClose}
                activeOpacity={0.6}
              >
                <Text style={styles.dismissButtonText}>
                  {translations.noThanks}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#D4AF37',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  content: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  limitedTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#40E0D0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  discountBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  discountBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F0F0F',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 20,
    lineHeight: 20,
  },
  timerContainer: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  timerLabel: {
    fontSize: 12,
    color: '#D4AF37',
    fontWeight: '600',
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D4AF37',
    fontVariant: ['tabular-nums'],
  },
  pricingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 14,
    color: '#B0B0B0',
    fontWeight: '600',
  },
  oldPrice: {
    fontSize: 18,
    color: '#888',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  newPrice: {
    fontSize: 28,
    color: '#D4AF37',
    fontWeight: '900',
  },
  savingsContainer: {
    backgroundColor: 'rgba(64, 224, 208, 0.15)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  savingsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#40E0D0',
  },
  activateButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  activateButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F0F0F',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dismissButton: {
    padding: 12,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
});

export default BottomSheetPromo;
