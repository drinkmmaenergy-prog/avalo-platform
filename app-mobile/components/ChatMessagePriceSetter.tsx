/**
 * Chat Message Price Setter Component
 * Phase 33-2: Monetized Chat - Dynamic Pricing
 * 
 * Modal allowing creators to set per-message pricing for a specific chat.
 * Only accessible to creators with earnFromChat === true.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  getChatPrice,
  setChatPrice,
  getAvailablePriceOptions,
} from '../services/messagePricingService';

interface ChatMessagePriceSetterProps {
  visible: boolean;
  onClose: () => void;
  chatId: string;
  userId: string;
  onPriceSet?: (price: number) => void;
}

export const ChatMessagePriceSetter: React.FC<ChatMessagePriceSetterProps> = ({
  visible,
  onClose,
  chatId,
  userId,
  onPriceSet,
}) => {
  const { t } = useTranslation();
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

  const priceOptions = getAvailablePriceOptions();

  // Load current price when modal opens
  useEffect(() => {
    if (visible) {
      loadCurrentPrice();
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animations
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [visible]);

  const loadCurrentPrice = async () => {
    try {
      const price = await getChatPrice(chatId);
      setCurrentPrice(price);
      setSelectedPrice(price);
    } catch (error) {
      console.error('Error loading current price:', error);
    }
  };

  const handleSavePrice = async () => {
    setLoading(true);
    try {
      const success = await setChatPrice(chatId, selectedPrice, userId);
      if (success) {
        setCurrentPrice(selectedPrice);
        if (onPriceSet) {
          onPriceSet(selectedPrice);
        }
        onClose();
      } else {
        console.error('Failed to set price');
      }
    } catch (error) {
      console.error('Error saving price:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriceLabel = (price: number): string => {
    if (price === 0) {
      return t('monetizedChat.free');
    }
    return t(`monetizedChat.priceOption${price}`);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('monetizedChat.setPriceTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('monetizedChat.setPriceSubtitle')}
            </Text>
          </View>

          {/* Current Price Display */}
          <View style={styles.currentPriceContainer}>
            <Text style={styles.currentPriceLabel}>
              {t('monetizedChat.currentPrice', { tokens: currentPrice })}
            </Text>
          </View>

          {/* Price Options */}
          <View style={styles.optionsContainer}>
            {priceOptions.map((price) => (
              <TouchableOpacity
                key={price}
                style={[
                  styles.priceOption,
                  selectedPrice === price && styles.priceOptionSelected,
                ]}
                onPress={() => setSelectedPrice(price)}
                activeOpacity={0.7}
              >
                <View style={styles.priceOptionContent}>
                  <Text
                    style={[
                      styles.priceValue,
                      selectedPrice === price && styles.priceValueSelected,
                    ]}
                  >
                    {price === 0 ? '💰 0' : `💰 ${price}`}
                  </Text>
                  <Text
                    style={[
                      styles.priceLabel,
                      selectedPrice === price && styles.priceLabelSelected,
                    ]}
                  >
                    {getPriceLabel(price)}
                  </Text>
                </View>
                {selectedPrice === price && (
                  <View style={styles.selectedIndicator}>
                    <Text style={styles.selectedCheck}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                loading && styles.saveButtonDisabled,
              ]}
              onPress={handleSavePrice}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.saveButtonText}>
                {loading ? t('common.loading') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#D4AF37',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  currentPriceContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  currentPriceLabel: {
    fontSize: 14,
    color: '#40E0D0',
    textAlign: 'center',
    fontWeight: '600',
  },
  optionsContainer: {
    marginBottom: 24,
    gap: 12,
  },
  priceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  priceOptionSelected: {
    backgroundColor: '#1F2A28',
    borderColor: '#40E0D0',
  },
  priceOptionContent: {
    flex: 1,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  priceValueSelected: {
    color: '#40E0D0',
  },
  priceLabel: {
    fontSize: 13,
    color: '#999',
  },
  priceLabelSelected: {
    color: '#CCC',
  },
  selectedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  selectedCheck: {
    fontSize: 16,
    color: '#0F0F0F',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#40E0D0',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F0F',
  },
});
