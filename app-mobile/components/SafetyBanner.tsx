import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AccountStatus } from '../hooks/useAccountSafety';
import { useTranslation } from '../hooks/useTranslation';

interface SafetyBannerProps {
  status: AccountStatus;
  message: string | null;
  expiresAt: Date | null;
}

/**
 * SafetyBanner - Global notification banner for account safety status
 * Displayed at the top of every screen when status is not ACTIVE
 */
export const SafetyBanner: React.FC<SafetyBannerProps> = ({
  status,
  message,
  expiresAt,
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getBannerConfig = () => {
    switch (status) {
      case 'WARNING':
        return {
          color: '#FFA500',
          darkColor: '#CC8400',
          icon: '⚠️',
          title: t('safety.warningTitle'),
          description: message || t('safety.warningMessage'),
          button: t('safety.viewDetails'),
          route: '/safety/status',
        };
      
      case 'RESTRICTED':
        return {
          color: '#FF8C00',
          darkColor: '#CC7000',
          icon: '🔒',
          title: t('safety.restrictedTitle'),
          description: expiresAt 
            ? t('safety.restrictedUntil', { date: formatDate(expiresAt) })
            : message || t('safety.restrictedMessage'),
          button: t('safety.learnMore'),
          route: '/safety/status',
        };
      
      case 'SUSPENDED':
        return {
          color: '#FF0033',
          darkColor: '#CC0029',
          icon: '⛔',
          title: t('safety.suspendedTitle'),
          description: expiresAt
            ? t('safety.suspendedUntil', { date: formatDate(expiresAt) })
            : message || t('safety.suspendedMessage'),
          button: t('safety.learnMore'),
          route: '/safety/status',
        };
      
      case 'BANNED_PERMANENT':
        return {
          color: '#000000',
          darkColor: '#1a1a1a',
          icon: '🚫',
          title: t('safety.bannedTitle'),
          description: message || t('safety.bannedMessage'),
          button: t('safety.contactSupport'),
          route: '/safety/status',
        };
      
      case 'REVIEW':
        return {
          color: '#3B82F6',
          darkColor: '#2563EB',
          icon: '🔍',
          title: t('safety.reviewTitle'),
          description: message || t('safety.reviewMessage'),
          button: t('safety.checkStatus'),
          route: '/safety/status',
        };
      
      default:
        return null;
    }
  };

  const config = getBannerConfig();

  if (!config) {
    return null;
  }

  const backgroundColor = isDark ? config.darkColor : config.color;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{config.icon}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {config.description}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push(config.route as any)}
      >
        <Text style={styles.buttonText}>{config.button}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
  },
  button: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default SafetyBanner;
