/**
 * AI-Swipe Toggle Component
 * Phase 31D-3: Auto-swipe based on SmartMatch score
 * FREE: 10/day, VIP: 50/day, ROYAL: unlimited
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../hooks/useTranslation';
import { ProfileData } from '../lib/profileService';
import { SmartMatchResult } from '../utils/smartMatch';

type MembershipTier = 'free' | 'vip' | 'royal';

interface AISwipeToggleProps {
  membershipTier: MembershipTier;
  onAutoSwipe?: (profile: ProfileData, direction: 'left' | 'right') => void;
  currentProfile?: ProfileData;
  smartMatchScore?: SmartMatchResult | null;
  swipesLeft: number;
}

const SWIPE_INTERVAL_MS = 2500; // 2.5 seconds
const STORAGE_KEY_PREFIX = 'aiSwipe:';
const STORAGE_KEY_COUNT = 'aiSwipeCount:';

// Daily limits per tier
const DAILY_LIMITS: Record<MembershipTier, number> = {
  free: 10,
  vip: 50,
  royal: 999999, // Unlimited (very high number)
};

export default function AISwipeToggle({
  membershipTier,
  onAutoSwipe,
  currentProfile,
  smartMatchScore,
  swipesLeft,
}: AISwipeToggleProps) {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [aiSwipesUsed, setAiSwipesUsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const dailyLimit = DAILY_LIMITS[membershipTier];
  const aiSwipesLeft = dailyLimit - aiSwipesUsed;
  const isUnlimited = membershipTier === 'royal';

  useEffect(() => {
    loadAISwipeCount();
  }, []);

  useEffect(() => {
    // Stop AI-Swipe if swipes run out
    if (isActive && swipesLeft === 0) {
      handleToggle();
      Alert.alert(
        t('swipeEnhancements.aiswipe.limitReached'),
        'Regular swipes depleted. AI-Swipe stopped.'
      );
    }
  }, [swipesLeft, isActive]);

  useEffect(() => {
    // Clear interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadAISwipeCount = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEY_COUNT}${today}`;
      const count = await AsyncStorage.getItem(key);
      setAiSwipesUsed(count ? parseInt(count, 10) : 0);
    } catch (error) {
      console.error('Error loading AI-Swipe count:', error);
    }
  };

  const incrementAISwipeCount = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEY_COUNT}${today}`;
      const newCount = aiSwipesUsed + 1;
      await AsyncStorage.setItem(key, newCount.toString());
      setAiSwipesUsed(newCount);
    } catch (error) {
      console.error('Error incrementing AI-Swipe count:', error);
    }
  };

  const performAutoSwipe = () => {
    if (!currentProfile || !smartMatchScore || !onAutoSwipe) {
      return;
    }

    // Check limits
    if (swipesLeft === 0) {
      handleToggle();
      Alert.alert('Out of Swipes', 'Regular swipe limit reached');
      return;
    }

    if (!isUnlimited && aiSwipesUsed >= dailyLimit) {
      handleToggle();
      Alert.alert(
        t('swipeEnhancements.aiswipe.limitReached'),
        `Daily AI-Swipe limit reached (${dailyLimit})`
      );
      return;
    }

    // Decide swipe direction based on SmartMatch score
    const { tier, score } = smartMatchScore;
    let direction: 'left' | 'right';

    // HIGH or TOP tier = swipe right
    if (tier === 'HIGH' || tier === 'TOP' || score >= 70) {
      direction = 'right';
    } else {
      // LOW or MEDIUM = swipe left
      direction = 'left';
    }

    // Perform the swipe
    onAutoSwipe(currentProfile, direction);
    incrementAISwipeCount();
  };

  const handleToggle = () => {
    if (isActive) {
      // Stop AI-Swipe
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsActive(false);
    } else {
      // Check if can start AI-Swipe
      if (swipesLeft === 0) {
        Alert.alert('Out of Swipes', 'You have no regular swipes left');
        return;
      }

      if (!isUnlimited && aiSwipesUsed >= dailyLimit) {
        Alert.alert(
          t('swipeEnhancements.aiswipe.limitReached'),
          `Daily limit: ${dailyLimit} AI-Swipes`
        );
        return;
      }

      // Start AI-Swipe
      setIsActive(true);
      
      // Initial swipe
      performAutoSwipe();
      
      // Set up interval
      intervalRef.current = setInterval(() => {
        performAutoSwipe();
      }, SWIPE_INTERVAL_MS);

      Alert.alert(
        '🤖 AI-Swipe Activated',
        'AI will automatically swipe based on SmartMatch scores'
      );
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, isActive && styles.buttonActive]}
      onPress={handleToggle}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>🤖</Text>
        <View style={styles.textContainer}>
          <Text style={[styles.label, isActive && styles.labelActive]}>
            {isActive
              ? t('swipeEnhancements.aiswipe.active')
              : t('swipeEnhancements.aiswipe.activate')}
          </Text>
          <Text style={styles.sublabel}>
            {isUnlimited
              ? 'Unlimited AI-Swipes'
              : `${aiSwipesLeft}/${dailyLimit} remaining today`}
          </Text>
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ON</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#26D0CE',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  buttonActive: {
    backgroundColor: '#E0F7FA',
    borderColor: '#26D0CE',
    shadowColor: '#26D0CE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#26D0CE',
  },
  labelActive: {
    color: '#00ACC1',
  },
  sublabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
