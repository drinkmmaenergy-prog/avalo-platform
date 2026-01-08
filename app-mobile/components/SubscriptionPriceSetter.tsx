/**
 * SubscriptionPriceSetter Component
 * Phase 33-3: Creator-only subscription price setter
 * 
 * Allows creators to set monthly subscription pricing.
 * Price presets: 49, 79, 119, 159, 199, 249 tokens/month
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  setCreatorPrice,
  getCreatorPrice,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  SUBSCRIPTION_PRESETS,
} from '../services/subscriptionService';

interface SubscriptionPriceSetterProps {
  visible: boolean;
  onClose: () => void;
  creatorId: string;
  onPriceSet?: (price: number) => void;
}

export function SubscriptionPriceSetter({
  visible,
  onClose,
  creatorId,
  onPriceSet,
}: SubscriptionPriceSetterProps) {
  const { t } = useTranslation();
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(300));

  useEffect(() => {
    loadCurrentPrice();
  }, [creatorId]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const loadCurrentPrice = async () => {
    const price = await getCreatorPrice(creatorId);
    setCurrentPrice(price);
    setSelectedPrice(price);
  };

  const handleSetPrice = async () => {
    const success = await setCreatorPrice(creatorId, selectedPrice);
    
    if (success) {
      setCurrentPrice(selectedPrice);
      onPriceSet?.(selectedPrice);
      onClose();
    }
  };

  const renderPriceOption = (price: number) => {
    const isSelected = selectedPrice === price;
    const creatorEarnings = calculateCreatorEarnings(price);
    const avaloCommission = calculateAvaloCommission(price);

    return (
      <TouchableOpacity
        key={price}
        style={[styles.priceOption, isSelected && styles.priceOptionSelected]}
        onPress={() => setSelectedPrice(price)}
      >
        <View style={styles.priceHeader}>
          <Text style={[styles.priceAmount, isSelected && styles.priceAmountSelected]}>
            {price} {t('subscriptions.tokensPerMonth')}
          </Text>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>✓</Text>
            </View>
          )}
        </View>
        
        {price > 0 && (
          <View style={styles.revenueBreakdown}>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>
                {t('subscriptions.youEarn')}:
              </Text>
              <Text style={styles.revenueCreator}>
                {creatorEarnings} tokens (65%)
              </Text>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>
                {t('subscriptions.avaloFee')}:
              </Text>
              <Text style={styles.revenueAvalo}>
                {avaloCommission} tokens (35%)
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

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
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <Text style={styles.headerTitle}>
              {t('subscriptions.setPrice')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t('subscriptions.setPriceSubtitle')}
            </Text>
          </View>

          {/* Current Price Info */}
          {currentPrice > 0 && (
            <View style={styles.currentPriceInfo}>
              <Text style={styles.currentPriceLabel}>
                {t('subscriptions.currentPrice')}
              </Text>
              <Text style={styles.currentPriceAmount}>
                {currentPrice} tokens/month
              </Text>
            </View>
          )}

          {/* Price Options */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {SUBSCRIPTION_PRESETS.map(renderPriceOption)}
          </ScrollView>

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>💡</Text>
            <Text style={styles.infoBannerText}>
              {t('subscriptions.benefits')}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.confirmButton,
                selectedPrice === currentPrice && styles.confirmButtonDisabled,
              ]}
              onPress={handleSetPrice}
              disabled={selectedPrice === currentPrice}
            >
              <Text style={styles.confirmButtonText}>
                {t('subscriptions.setPrice')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 40,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  currentPriceInfo: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  currentPriceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  currentPriceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
  },
  priceOption: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  priceOptionSelected: {
    backgroundColor: '#1F2A2E',
    borderColor: '#40E0D0',
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  priceAmountSelected: {
    color: '#40E0D0',
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    fontSize: 16,
    color: '#0F0F0F',
    fontWeight: 'bold',
  },
  revenueBreakdown: {
    gap: 8,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 13,
    color: '#999',
  },
  revenueCreator: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
  },
  revenueAvalo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    gap: 12,
  },
  infoBannerIcon: {
    fontSize: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#2A4A48',
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
