/**
 * VIPRoomEntryCard Component
 * Phase 33-3: VIP Room entry point for subscribers
 * 
 * Displayed inside chat for subscribers to access VIP Room content
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../hooks/useTranslation';

interface VIPRoomEntryCardProps {
  creatorId: string;
  creatorName: string;
  isSubscriber: boolean;
}

export function VIPRoomEntryCard({
  creatorId,
  creatorName,
  isSubscriber,
}: VIPRoomEntryCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [glowAnim] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    if (isSubscriber) {
      // Animated glow effect for VIP card
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [isSubscriber]);

  const handlePress = () => {
    if (isSubscriber) {
      router.push(`/creator/vip-room/${creatorId}` as any);
    }
  };

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(212, 175, 55, 0.3)', 'rgba(212, 175, 55, 0.6)'],
  });

  if (!isSubscriber) {
    return (
      <View style={styles.container}>
        <View style={styles.lockedCard}>
          <View style={styles.lockedHeader}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>
              {t('subscriptions.vipRoomLocked')}
            </Text>
          </View>
          <Text style={styles.lockedSubtitle}>
            {t('subscriptions.vipRoomSubtitle')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.vipCard,
          {
            shadowColor: glowColor,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.vipCardTouchable}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          {/* Background shimmer effect */}
          <View style={styles.shimmerOverlay} />
          
          <View style={styles.vipHeader}>
            <Text style={styles.vipIcon}>🎭</Text>
            <View style={styles.vipTitleContainer}>
              <Text style={styles.vipTitle}>
                {t('subscriptions.vipRoomTitle')}
              </Text>
              <Text style={styles.vipBadge}>VIP ONLY</Text>
            </View>
          </View>

          <Text style={styles.vipSubtitle}>
            {t('subscriptions.vipRoomUnlocked', { name: creatorName })}
          </Text>

          <View style={styles.vipFeatures}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📸</Text>
              <Text style={styles.featureText}>
                {t('subscriptions.premiumMedia')}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>💬</Text>
              <Text style={styles.featureText}>
                {t('subscriptions.exclusiveContent')}
              </Text>
            </View>
          </View>

          <View style={styles.enterButton}>
            <Text style={styles.enterButtonText}>
              {t('subscriptions.enterVIPRoom')}
            </Text>
            <Text style={styles.enterArrow}>→</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lockedCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
    opacity: 0.7,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  lockIcon: {
    fontSize: 24,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#999',
  },
  lockedSubtitle: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  vipCard: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  vipCardTouchable: {
    padding: 20,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  vipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  vipIcon: {
    fontSize: 32,
  },
  vipTitleContainer: {
    flex: 1,
  },
  vipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 2,
  },
  vipBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#D4AF37',
    letterSpacing: 1,
  },
  vipSubtitle: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
    marginBottom: 16,
  },
  vipFeatures: {
    gap: 10,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIcon: {
    fontSize: 18,
  },
  featureText: {
    fontSize: 13,
    color: '#999',
  },
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4AF37',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  enterButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  enterArrow: {
    fontSize: 18,
    color: '#0F0F0F',
    fontWeight: 'bold',
  },
});
