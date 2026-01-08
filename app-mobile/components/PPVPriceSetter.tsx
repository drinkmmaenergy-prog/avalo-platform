/**
 * PPV Price Setter Component
 * Phase 33-4: Creator-only modal to set PPV price per media item
 * 
 * Features:
 * - 6 price presets: 15, 25, 40, 60, 80, 120 tokens
 * - Revenue breakdown: 65% creator / 35% Avalo
 * - Gold/turquoise theme with 18px border radius
 * - Slide-up modal animation
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { 
  setPrice, 
  getPrice,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  PPV_PRESETS 
} from '../services/ppvService';

const { height } = Dimensions.get('window');

interface PPVPriceSetterProps {
  visible: boolean;
  onClose: () => void;
  mediaId: string;
  onPriceSet?: (price: number) => void;
}

export function PPVPriceSetter({
  visible,
  onClose,
  mediaId,
  onPriceSet,
}: PPVPriceSetterProps) {
  const { t } = useTranslation();
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [slideAnim] = useState(new Animated.Value(height));
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      loadCurrentPrice();
      // Slide up + fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide down + fade out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const loadCurrentPrice = async () => {
    const price = await getPrice(mediaId);
    setCurrentPrice(price);
    setSelectedPrice(price);
  };

  const handleSave = async () => {
    const success = await setPrice(mediaId, selectedPrice);
    if (success && onPriceSet) {
      onPriceSet(selectedPrice);
    }
    onClose();
  };

  const handlePriceSelect = (price: number) => {
    setSelectedPrice(price);
  };

  const renderPriceOption = (price: number) => {
    const isSelected = selectedPrice === price;
    const creatorEarns = calculateCreatorEarnings(price);
    const avaloFee = calculateAvaloCommission(price);

    return (
      <TouchableOpacity
        key={price}
        style={[
          styles.priceOption,
          isSelected && styles.priceOptionSelected,
        ]}
        onPress={() => handlePriceSelect(price)}
        activeOpacity={0.7}
      >
        <View style={styles.priceOptionHeader}>
          <Text style={[
            styles.priceOptionPrice,
            isSelected && styles.priceOptionPriceSelected,
          ]}>
            {price} 💎
          </Text>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>✓</Text>
            </View>
          )}
        </View>
        <View style={styles.revenueBreakdown}>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>
              {t('ppv.youEarn')}:
            </Text>
            <Text style={styles.revenueCreator}>
              {creatorEarns} 💎
            </Text>
          </View>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabelSmall}>
              {t('ppv.avaloFee')}:
            </Text>
            <Text style={styles.revenueAvalo}>
              {avaloFee} 💎
            </Text>
          </View>
        </View>
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
          { opacity: fadeAnim }
        ]}
      >
        <TouchableOpacity 
          style={styles.overlayTouchable} 
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
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('ppv.setPrice')}</Text>
            <Text style={styles.subtitle}>
              {t('ppv.setPriceSubtitle')}
            </Text>
          </View>

          {/* Current price indicator */}
          {currentPrice > 0 && (
            <View style={styles.currentPriceCard}>
              <Text style={styles.currentPriceLabel}>
                {t('ppv.currentPrice')}
              </Text>
              <Text style={styles.currentPriceValue}>
                {currentPrice} 💎 {t('ppv.perUnlock')}
              </Text>
            </View>
          )}

          {/* Price options */}
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.priceGrid}>
              {PPV_PRESETS.map(price => renderPriceOption(price))}
            </View>

            {/* Commission info */}
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>ℹ️</Text>
              <Text style={styles.infoText}>
                {t('ppv.commissionInfo')}
              </Text>
            </View>

            {/* VIP discount note */}
            <View style={styles.discountNote}>
              <Text style={styles.discountNoteIcon}>⭐</Text>
              <Text style={styles.discountNoteText}>
                {t('ppv.vipDiscount')}
              </Text>
            </View>
          </ScrollView>

          {/* Action buttons */}
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
                selectedPrice === 0 && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={selectedPrice === 0}
              activeOpacity={0.7}
            >
              <Text style={styles.saveButtonText}>
                {t('common.save')}
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
  modalContainer: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: height * 0.85,
    paddingBottom: 34,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  currentPriceCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  currentPriceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  currentPriceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  priceGrid: {
    gap: 12,
  },
  priceOption: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  priceOptionSelected: {
    borderColor: '#D4AF37',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  priceOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceOptionPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  priceOptionPriceSelected: {
    color: '#D4AF37',
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  revenueBreakdown: {
    gap: 6,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 14,
    color: '#999',
  },
  revenueLabelSmall: {
    fontSize: 12,
    color: '#666',
  },
  revenueCreator: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  revenueAvalo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    padding: 16,
    borderRadius: 18,
    marginTop: 20,
    gap: 12,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#40E0D0',
    lineHeight: 18,
  },
  discountNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    padding: 16,
    borderRadius: 18,
    marginTop: 12,
    gap: 12,
  },
  discountNoteIcon: {
    fontSize: 20,
  },
  discountNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#D4AF37',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
