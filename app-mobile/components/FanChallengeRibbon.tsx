import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  getActiveChallenge,
  getChallengeTypeInfo,
  type Challenge,
} from '../services/fanChallengeService';

const COLORS = {
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  white: '#FFFFFF',
  lightGray: '#CCCCCC',
};

interface FanChallengeRibbonProps {
  creatorId: string;
  onPress: (challenge: Challenge) => void;
}

export default function FanChallengeRibbon({
  creatorId,
  onPress,
}: FanChallengeRibbonProps) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadChallenge();

    // Refresh every minute to update time
    const interval = setInterval(loadChallenge, 60000);
    return () => clearInterval(interval);
  }, [creatorId]);

  useEffect(() => {
    if (challenge) {
      // Pulse animation
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
    }
  }, [challenge]);

  const loadChallenge = async () => {
    try {
      setLoading(true);
      const activeChallenge = await getActiveChallenge(creatorId);
      setChallenge(activeChallenge);
    } catch (error) {
      console.error('Error loading challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (endTime: number) => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) return t('fanChallenge.expired');

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  if (loading || !challenge) {
    return null;
  }

  const typeInfo = getChallengeTypeInfo(challenge.type);

  return (
    <Animated.View style={[styles.ribbon, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        style={styles.ribbonContent}
        onPress={() => onPress(challenge)}
        activeOpacity={0.9}
      >
        <View style={styles.leftSection}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{typeInfo.icon}</Text>
          </View>
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.badge}>{t('fanChallenge.viewer.limitedTime')}</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.title}>{typeInfo.title}</Text>
            <Text style={styles.subtitle}>{typeInfo.description}</Text>
          </View>
        </View>
        
        <View style={styles.rightSection}>
          <View style={styles.timeContainer}>
            <Text style={styles.timeLabel}>{t('fanChallenge.endsIn')}</Text>
            <Text style={styles.timeValue}>{formatTimeRemaining(challenge.endTime)}</Text>
          </View>
          <View style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{t('fanChallenge.viewer.joinNow')}</Text>
            <Text style={styles.arrow}>→</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.turquoise,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  ribbonContent: {
    flexDirection: 'row',
    backgroundColor: COLORS.darkGray,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.turquoise,
    borderRadius: 18,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    marginRight: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.turquoise + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: COLORS.turquoise,
  },
  icon: {
    fontSize: 28,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.turquoise,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    marginRight: 4,
  },
  liveText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  rightSection: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeLabel: {
    fontSize: 10,
    color: COLORS.lightGray,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.turquoise,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.turquoise,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
  arrow: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
});
