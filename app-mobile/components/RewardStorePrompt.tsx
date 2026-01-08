/**
 * Reward Store Prompt - Phase 32-5
 * Shows after FTUX missions completion to prompt reward activation
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';

interface RewardStorePromptProps {
  visible: boolean;
  onClose: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export function RewardStorePrompt({ visible, onClose, t }: RewardStorePromptProps) {
  const router = useRouter();
  const [fadeAnim] = React.useState(new Animated.Value(0));
  const [slideAnim] = React.useState(new Animated.Value(50));

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleClaimRewards = () => {
    onClose();
    router.push('/rewards' as any);
  };

  if (!visible) return null;

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
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🎁</Text>
              <View style={styles.sparkles}>
                <Text style={styles.sparkle}>✨</Text>
                <Text style={styles.sparkle}>✨</Text>
                <Text style={styles.sparkle}>✨</Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.title}>{t('rewardHub.claimYourRewards')}</Text>
            
            {/* Description */}
            <Text style={styles.description}>
              {t('rewardHub.subtitle')}
            </Text>

            {/* Rewards Preview */}
            <View style={styles.rewardsPreview}>
              <RewardPreviewItem icon="⭐" text="Profile Spotlight" />
              <RewardPreviewItem icon="✨" text="x2 SmartMatch" />
              <RewardPreviewItem icon="👑" text="VIP Trial" />
              <Text style={styles.moreText}>+ 2 more rewards...</Text>
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={styles.claimButton}
              onPress={handleClaimRewards}
              activeOpacity={0.8}
            >
              <Text style={styles.claimButtonText}>
                {t('rewardHub.activate')} Rewards
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.laterButtonText}>
                {t('rewardHub.dismissButton')}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

function RewardPreviewItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.previewItem}>
      <Text style={styles.previewIcon}>{icon}</Text>
      <Text style={styles.previewText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#0F0F0F',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  icon: {
    fontSize: 64,
  },
  sparkles: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontWeight: '400',
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  rewardsPreview: {
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  previewIcon: {
    fontSize: 20,
  },
  previewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  moreText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#40E0D0',
    textAlign: 'center',
    marginTop: 4,
  },
  claimButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  claimButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  laterButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
});
