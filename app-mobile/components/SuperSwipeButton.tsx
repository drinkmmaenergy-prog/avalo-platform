/**
 * SuperSwipeButton Component
 * ==========================
 * Premium feature for boosted visibility
 * NO token consumption, NO backend calls
 * 
 * Features:
 * - Gold gradient styling
 * - Tier-specific text and icons
 * - Cooldown tracking via AsyncStorage
 * - Usage limits per tier (FREE: 1/24h, VIP: 3/24h, ROYAL: 8/24h)
 */

import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MembershipTier } from '../utils/smartMatch';

const STORAGE_PREFIX = 'superswipe:';
const USAGE_KEY = 'superswipe:usage';

interface SuperSwipeButtonProps {
  targetUserId: string;
  membershipTier: MembershipTier;
  onActivate: () => void;
  disabled?: boolean;
}

interface SuperSwipeUsage {
  count: number;
  resetAt: number; // Unix timestamp
}

export default function SuperSwipeButton({
  targetUserId,
  membershipTier,
  onActivate,
  disabled = false,
}: SuperSwipeButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingUses, setRemainingUses] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Get usage limits by tier
  const getUsageLimit = (): number => {
    switch (membershipTier) {
      case 'ROYAL':
        return 8;
      case 'VIP':
        return 3;
      case 'FREE':
      default:
        return 1;
    }
  };

  // Get button text by tier
  const getButtonText = (): string => {
    if (isActive) {
      return '⏳ SuperSwipe Active';
    }
    
    switch (membershipTier) {
      case 'ROYAL':
        return '👑 Royal SuperSwipe';
      case 'VIP':
        return '✨ VIP SuperSwipe';
      case 'FREE':
      default:
        return '🔥 SuperSwipe Boost';
    }
  };

  // Check if SuperSwipe is already active for this user
  const checkActiveStatus = async () => {
    try {
      const key = `${STORAGE_PREFIX}${targetUserId}`;
      const data = await AsyncStorage.getItem(key);
      
      if (data) {
        const parsed = JSON.parse(data);
        const now = Date.now();
        
        if (parsed.expiresAt > now) {
          setIsActive(true);
          setExpiresAt(parsed.expiresAt);
        } else {
          // Expired, clean up
          await AsyncStorage.removeItem(key);
          setIsActive(false);
          setExpiresAt(null);
        }
      }
    } catch (error) {
      console.error('Error checking SuperSwipe status:', error);
    }
  };

  // Check remaining uses for today
  const checkRemainingUses = async () => {
    try {
      const data = await AsyncStorage.getItem(USAGE_KEY);
      const now = Date.now();
      
      if (data) {
        const usage: SuperSwipeUsage = JSON.parse(data);
        
        // Check if we need to reset (24 hours passed)
        if (now >= usage.resetAt) {
          // Reset usage
          const newUsage: SuperSwipeUsage = {
            count: 0,
            resetAt: now + 24 * 60 * 60 * 1000, // 24 hours from now
          };
          await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
          setRemainingUses(getUsageLimit());
        } else {
          // Calculate remaining
          const limit = getUsageLimit();
          const remaining = Math.max(0, limit - usage.count);
          setRemainingUses(remaining);
        }
      } else {
        // No usage data yet
        const newUsage: SuperSwipeUsage = {
          count: 0,
          resetAt: now + 24 * 60 * 60 * 1000,
        };
        await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
        setRemainingUses(getUsageLimit());
      }
    } catch (error) {
      console.error('Error checking remaining uses:', error);
      setRemainingUses(getUsageLimit());
    }
  };

  // Activate SuperSwipe
  const activateSuperSwipe = async () => {
    try {
      // Check if we have uses left
      if (remainingUses === 0) {
        return; // Should not happen due to disabled state
      }

      const now = Date.now();
      const expiryTime = now + 30 * 60 * 1000; // 30 minutes

      // Store activation
      const key = `${STORAGE_PREFIX}${targetUserId}`;
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ expiresAt: expiryTime })
      );

      // Update usage count
      const usageData = await AsyncStorage.getItem(USAGE_KEY);
      if (usageData) {
        const usage: SuperSwipeUsage = JSON.parse(usageData);
        usage.count += 1;
        await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
      }

      setIsActive(true);
      setExpiresAt(expiryTime);
      setRemainingUses((prev) => Math.max(0, (prev ?? 1) - 1));
      setShowModal(false);
      
      // Trigger callback
      onActivate();

      // Start pulse animation
      startPulseAnimation();
    } catch (error) {
      console.error('Error activating SuperSwipe:', error);
    }
  };

  // Pulse animation for active state
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

  useEffect(() => {
    checkActiveStatus();
    checkRemainingUses();
  }, [targetUserId]);

  useEffect(() => {
    if (isActive && expiresAt) {
      const timer = setTimeout(() => {
        setIsActive(false);
        setExpiresAt(null);
      }, expiresAt - Date.now());

      return () => clearTimeout(timer);
    }
  }, [isActive, expiresAt]);

  const isDisabled = disabled || isActive || remainingUses === 0;

  return (
    <>
      <Animated.View style={{ transform: [{ scale: isActive ? pulseAnim : 1 }] }}>
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          disabled={isDisabled}
          activeOpacity={0.8}
          style={[
            styles.button,
            isActive ? styles.buttonActive : styles.buttonGold,
            isDisabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.icon}>⚡</Text>
          <Text style={styles.buttonText}>{getButtonText()}</Text>
          {remainingUses !== null && !isActive && (
            <Text style={styles.usageText}>
              {remainingUses}/{getUsageLimit()}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Confirmation Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowModal(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>⚡</Text>
              <Text style={styles.modalTitle}>Activate SuperSwipe?</Text>
            </View>

            <Text style={styles.modalSubtitle}>
              Your profile will be highlighted with boosted visibility for this person.
            </Text>

            <View style={styles.modalDetails}>
              <Text style={styles.modalDetailText}>
                ✨ Highlighted profile card
              </Text>
              <Text style={styles.modalDetailText}>
                🎯 Higher match probability
              </Text>
              <Text style={styles.modalDetailText}>
                ⏱️ Active for 30 minutes
              </Text>
            </View>

            {remainingUses !== null && (
              <Text style={styles.modalUsage}>
                Remaining today: {remainingUses}/{getUsageLimit()}
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={activateSuperSwipe}
              >
                <Text style={styles.modalConfirmText}>Activate Now</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 18,
    minWidth: 180,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonGold: {
    backgroundColor: '#D4AF37',
  },
  buttonActive: {
    backgroundColor: '#4A5568',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  usageText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
    marginLeft: 4,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1A202C',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalDetails: {
    backgroundColor: '#2D3748',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  modalDetailText: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  modalUsage: {
    fontSize: 13,
    color: '#D4AF37',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#2D3748',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#A0AEC0',
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
