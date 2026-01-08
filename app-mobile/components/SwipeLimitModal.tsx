/**
 * SwipeLimitModal Component - Phase 31D Pack 1
 * Modal displayed when user runs out of swipes
 * Shows countdown and upgrade options
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../hooks/useTranslation';

interface SwipeLimitModalProps {
  visible: boolean;
  onClose: () => void;
  nextRegenerationAt: Date | null;
  hourlyRestore: number;
}

export default function SwipeLimitModal({
  visible,
  onClose,
  nextRegenerationAt,
  hourlyRestore,
}: SwipeLimitModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Calculate time remaining (updates every minute, not every second)
  useEffect(() => {
    if (!visible || !nextRegenerationAt) return;

    const updateTimeRemaining = () => {
      const now = Date.now();
      const target = nextRegenerationAt.getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeRemaining('0m');
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${remainingMinutes}m`);
      } else {
        setTimeRemaining(`${remainingMinutes}m`);
      }
    };

    // Update immediately
    updateTimeRemaining();

    // Update every minute (not every second to avoid excessive re-renders)
    const interval = setInterval(updateTimeRemaining, 60 * 1000);

    return () => clearInterval(interval);
  }, [visible, nextRegenerationAt]);

  const handleUpgrade = () => {
    onClose();
    // Navigate to subscription/upgrade screen
    router.push('/wallet');
  };

  const handleContinueTomorrow = () => {
    onClose();
  };

  // Memoize styles based on color scheme
  const dynamicStyles = useMemo(() => ({
    modalOverlay: {
      ...styles.modalOverlay,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.7)',
    },
    modalContent: {
      ...styles.modalContent,
      backgroundColor: isDark ? '#1a1a1a' : '#fff',
    },
    title: {
      ...styles.title,
      color: isDark ? '#fff' : '#333',
    },
    description: {
      ...styles.description,
      color: isDark ? '#ccc' : '#666',
    },
    countdownContainer: {
      ...styles.countdownContainer,
      backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    },
    countdownText: {
      ...styles.countdownText,
      color: isDark ? '#fff' : '#333',
    },
    countdownLabel: {
      ...styles.countdownLabel,
      color: isDark ? '#999' : '#666',
    },
    benefitText: {
      ...styles.benefitText,
      color: isDark ? '#ddd' : '#555',
    },
    secondaryButton: {
      ...styles.secondaryButton,
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    },
    secondaryButtonText: {
      ...styles.secondaryButtonText,
      color: isDark ? '#fff' : '#333',
    },
  }), [isDark]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={dynamicStyles.modalOverlay}>
        <View style={dynamicStyles.modalContent}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⏰</Text>
          </View>

          {/* Title */}
          <Text style={dynamicStyles.title}>
            {t('swipeLimits.title')}
          </Text>

          {/* Description */}
          <Text style={dynamicStyles.description}>
            {t('swipeLimits.description')}
          </Text>

          {/* Countdown */}
          {nextRegenerationAt && (
            <View style={dynamicStyles.countdownContainer}>
              <Text style={dynamicStyles.countdownText}>
                {timeRemaining}
              </Text>
              <Text style={dynamicStyles.countdownLabel}>
                {t('swipeLimits.untilRefill', { count: hourlyRestore })}
              </Text>
            </View>
          )}

          {/* Benefits */}
          <View style={styles.benefitsContainer}>
            <Text style={dynamicStyles.benefitText}>
              ✨ {t('swipeLimits.vipBenefit')}
            </Text>
            <Text style={dynamicStyles.benefitText}>
              👑 {t('swipeLimits.royalBenefit')}
            </Text>
          </View>

          {/* Upgrade Button */}
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeButtonText}>
              {t('swipeLimits.upgradeButton')}
            </Text>
          </TouchableOpacity>

          {/* Continue Tomorrow Button */}
          <TouchableOpacity
            style={dynamicStyles.secondaryButton}
            onPress={handleContinueTomorrow}
            activeOpacity={0.7}
          >
            <Text style={dynamicStyles.secondaryButtonText}>
              {t('swipeLimits.continueTomorrow')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  countdownContainer: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  countdownText: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  countdownLabel: {
    fontSize: 14,
  },
  benefitsContainer: {
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    lineHeight: 20,
  },
  upgradeButton: {
    width: '100%',
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
