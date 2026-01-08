/**
 * Priority Swipe Button Component
 * Phase 31D-3: Premium feature for VIP/ROYAL users
 * Moves user's profile to front of target's swipe queue (display-only simulation)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../hooks/useTranslation';

type MembershipTier = 'free' | 'vip' | 'royal';

interface PrioritySwipeButtonProps {
  targetUserId: string;
  membershipTier: MembershipTier;
  onActivate?: () => void;
}

const COOLDOWN_HOURS = 12;
const STORAGE_PREFIX = 'prioritySwipe:';

export default function PrioritySwipeButton({
  targetUserId,
  membershipTier,
  onActivate,
}: PrioritySwipeButtonProps) {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    checkPrioritySwipeStatus();
  }, [targetUserId]);

  const checkPrioritySwipeStatus = async () => {
    try {
      const key = `${STORAGE_PREFIX}${targetUserId}`;
      const data = await AsyncStorage.getItem(key);
      
      if (data) {
        const parsed = JSON.parse(data);
        const now = Date.now();
        const expiresAt = parsed.timestamp + (COOLDOWN_HOURS * 60 * 60 * 1000);
        
        if (expiresAt > now) {
          setIsActive(true);
          const hoursLeft = Math.ceil((expiresAt - now) / (60 * 60 * 1000));
          setCooldownRemaining(`${hoursLeft}h`);
        } else {
          // Expired, clean up
          await AsyncStorage.removeItem(key);
          setIsActive(false);
          setCooldownRemaining(null);
        }
      }
    } catch (error) {
      console.error('Error checking Priority Swipe status:', error);
    }
  };

  const handlePress = async () => {
    // FREE users see upgrade modal
    if (membershipTier === 'free') {
      setShowUpgradeModal(true);
      return;
    }

    // Check if already active
    if (isActive) {
      Alert.alert(
        t('swipeEnhancements.priority.cooldown'),
        `Priority Swipe will be available in ${cooldownRemaining}`
      );
      return;
    }

    try {
      // Store priority swipe activation
      const key = `${STORAGE_PREFIX}${targetUserId}`;
      const data = {
        timestamp: Date.now(),
        userId: targetUserId,
      };
      await AsyncStorage.setItem(key, JSON.stringify(data));
      
      setIsActive(true);
      const hoursLeft = COOLDOWN_HOURS;
      setCooldownRemaining(`${hoursLeft}h`);
      
      Alert.alert(
        '🚀 Priority Swipe Activated!',
        'Your profile will appear at the front of their swipe queue.'
      );
      
      onActivate?.();
    } catch (error) {
      console.error('Error activating Priority Swipe:', error);
      Alert.alert('Error', 'Failed to activate Priority Swipe');
    }
  };

  const isLocked = membershipTier === 'free';

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          isActive && styles.buttonActive,
          isLocked && styles.buttonLocked,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.content}>
          <Text style={styles.icon}>🚀</Text>
          <View style={styles.textContainer}>
            <Text style={[styles.label, isLocked && styles.labelLocked]}>
              {isActive
                ? t('swipeEnhancements.priority.active')
                : isLocked
                ? t('swipeEnhancements.locked.free')
                : t('swipeEnhancements.priority.activate')}
            </Text>
            {isActive && cooldownRemaining && (
              <Text style={styles.cooldownText}>
                {t('swipeEnhancements.priority.cooldown')}: {cooldownRemaining}
              </Text>
            )}
            {isLocked && (
              <Text style={styles.lockSubtext}>
                {t('swipeEnhancements.locked.upgradeVip')}
              </Text>
            )}
          </View>
          {isLocked && <Text style={styles.lockIcon}>🔒</Text>}
          {isActive && <Text style={styles.activeIcon}>✓</Text>}
        </View>
      </TouchableOpacity>

      {/* Upgrade Modal for FREE users */}
      <Modal
        visible={showUpgradeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🚀 Priority Swipe</Text>
            <Text style={styles.modalDescription}>
              Move your profile to the front of their swipe queue!
            </Text>
            
            <View style={styles.benefitsList}>
              <Text style={styles.benefitItem}>✨ Appear first in their deck</Text>
              <Text style={styles.benefitItem}>⚡ Higher visibility</Text>
              <Text style={styles.benefitItem}>🎯 Increase match probability</Text>
            </View>

            <Text style={styles.upgradeText}>
              Upgrade to VIP or ROYAL to unlock Priority Swipe!
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowUpgradeModal(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  setShowUpgradeModal(false);
                  // User would navigate to upgrade screen in real implementation
                  Alert.alert('Upgrade', 'Navigate to membership upgrade screen');
                }}
              >
                <Text style={styles.modalButtonTextPrimary}>Upgrade Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  buttonActive: {
    backgroundColor: '#FFF5E1',
    borderColor: '#D4AF37',
  },
  buttonLocked: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    opacity: 0.6,
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
    color: '#D4AF37',
  },
  labelLocked: {
    color: '#999',
  },
  cooldownText: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  lockSubtext: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  lockIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  activeIcon: {
    fontSize: 18,
    color: '#4CAF50',
    marginLeft: 8,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  benefitsList: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  benefitItem: {
    fontSize: 14,
    color: '#333',
    marginVertical: 6,
  },
  upgradeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#F5F5F5',
  },
  modalButtonPrimary: {
    backgroundColor: '#D4AF37',
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
