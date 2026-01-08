/**
 * Rewind Button Component
 * Phase 31D-3: Undo last swipe (VIP/ROYAL only)
 * VIP: 5/day, ROYAL: 20/day
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
import { ProfileData } from '../lib/profileService';

type MembershipTier = 'free' | 'vip' | 'royal';

interface RewindButtonProps {
  membershipTier: MembershipTier;
  onRewind?: (profile: ProfileData) => void;
  lastSwipedProfile?: ProfileData | null;
}

const STORAGE_KEY_COUNT = 'rewindCount:';

// Daily limits per tier
const DAILY_LIMITS: Record<MembershipTier, number> = {
  free: 0,    // Not available for free users
  vip: 5,
  royal: 20,
};

export default function RewindButton({
  membershipTier,
  onRewind,
  lastSwipedProfile,
}: RewindButtonProps) {
  const { t } = useTranslation();
  const [rewindsUsed, setRewindsUsed] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const dailyLimit = DAILY_LIMITS[membershipTier];
  const rewindsLeft = dailyLimit - rewindsUsed;
  const isLocked = membershipTier === 'free';
  const canRewind = !isLocked && rewindsLeft > 0 && lastSwipedProfile;

  useEffect(() => {
    loadRewindCount();
  }, []);

  const loadRewindCount = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEY_COUNT}${today}`;
      const count = await AsyncStorage.getItem(key);
      setRewindsUsed(count ? parseInt(count, 10) : 0);
    } catch (error) {
      console.error('Error loading rewind count:', error);
    }
  };

  const incrementRewindCount = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEY_COUNT}${today}`;
      const newCount = rewindsUsed + 1;
      await AsyncStorage.setItem(key, newCount.toString());
      setRewindsUsed(newCount);
    } catch (error) {
      console.error('Error incrementing rewind count:', error);
    }
  };

  const handlePress = async () => {
    // FREE users see upgrade modal
    if (isLocked) {
      setShowUpgradeModal(true);
      return;
    }

    // Check if rewinds available
    if (rewindsLeft === 0) {
      Alert.alert(
        t('swipeEnhancements.rewind.limitReached'),
        `Daily limit reached (${dailyLimit} rewinds)`
      );
      return;
    }

    // Check if there's a profile to rewind
    if (!lastSwipedProfile) {
      Alert.alert('No Swipes to Undo', 'No recent swipe to rewind');
      return;
    }

    // Perform rewind
    try {
      onRewind?.(lastSwipedProfile);
      await incrementRewindCount();
      
      Alert.alert(
        '⏪ Rewind Success!',
        `Restored ${lastSwipedProfile.name} to your swipe deck`
      );
    } catch (error) {
      console.error('Error performing rewind:', error);
      Alert.alert('Error', 'Failed to rewind swipe');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          isLocked && styles.buttonLocked,
          !canRewind && !isLocked && styles.buttonDisabled,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={!canRewind && !isLocked}
      >
        <View style={styles.content}>
          <Text style={styles.icon}>⏪</Text>
          <View style={styles.textContainer}>
            <Text style={[styles.label, isLocked && styles.labelLocked]}>
              {isLocked
                ? t('swipeEnhancements.locked.free')
                : t('swipeEnhancements.rewind.activate')}
            </Text>
            <Text style={styles.sublabel}>
              {isLocked
                ? t('swipeEnhancements.locked.upgradeVip')
                : `${rewindsLeft}/${dailyLimit} remaining today`}
            </Text>
          </View>
          {isLocked && <Text style={styles.lockIcon}>🔒</Text>}
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
            <Text style={styles.modalTitle}>⏪ Rewind</Text>
            <Text style={styles.modalDescription}>
              Undo your last swipe and get a second chance!
            </Text>
            
            <View style={styles.benefitsList}>
              <Text style={styles.benefitItem}>⏪ Undo accidental swipes</Text>
              <Text style={styles.benefitItem}>🔄 Get a second look</Text>
              <Text style={styles.benefitItem}>✨ VIP: 5 rewinds/day</Text>
              <Text style={styles.benefitItem}>👑 ROYAL: 20 rewinds/day</Text>
            </View>

            <Text style={styles.upgradeText}>
              Upgrade to VIP or ROYAL to unlock Rewind!
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
    borderColor: '#40E0D0',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  buttonLocked: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    opacity: 0.6,
  },
  buttonDisabled: {
    opacity: 0.5,
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
    color: '#40E0D0',
  },
  labelLocked: {
    color: '#999',
  },
  sublabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  lockIcon: {
    fontSize: 18,
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
    color: '#40E0D0',
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
    backgroundColor: '#40E0D0',
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
