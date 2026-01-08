/**
 * Media Earning Badge Component
 * Phase 33-4: Displays creator earnings for unlocked PPV posts
 * 
 * Features:
 * - Shows "+X tokens • 65% after commission"
 * - Gold text with fade + slide animation
 * - Only visible to creators viewing their own unlocked media
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { calculateCreatorEarnings } from '../services/ppvService';

interface MediaEarningBadgeProps {
  salePrice: number;
  unlockCount?: number;
  showAnimation?: boolean;
}

export function MediaEarningBadge({
  salePrice,
  unlockCount = 1,
  showAnimation = true,
}: MediaEarningBadgeProps) {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (showAnimation) {
      // Fade in + slide up animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }
  }, [showAnimation]);

  const creatorEarnings = calculateCreatorEarnings(salePrice);
  const totalEarnings = creatorEarnings * unlockCount;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.badge}>
        <View style={styles.earningsRow}>
          <Text style={styles.plusIcon}>+</Text>
          <Text style={styles.earningsAmount}>{totalEarnings}</Text>
          <Text style={styles.tokenIcon}>💎</Text>
        </View>
        <Text style={styles.commissionText}>
          {t('ppv.afterCommission')}
        </Text>
      </View>
      
      {unlockCount > 1 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {unlockCount}× {t('ppv.unlocks')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  plusIcon: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginRight: 2,
  },
  earningsAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginRight: 4,
  },
  tokenIcon: {
    fontSize: 14,
  },
  commissionText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: 'rgba(64, 224, 208, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#40E0D0',
  },
});
