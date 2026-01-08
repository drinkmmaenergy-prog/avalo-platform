/**
 * PACK 269 - App Header Component
 * Top bar with wallet balance, likes, notifications, and dynamic page titles
 * Features:
 * - Real-time sync with Firebase
 * - Skeleton loaders on refresh
 * - Safe area handling
 * - Hidden on Swipe and Story/Video full-screen modes
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { colors, spacing, fontSizes, fontWeights } from '../../shared/theme';
import { useAuth } from '../contexts/AuthContext';

interface AppHeaderProps {
  title?: string;
  hideOnSwipe?: boolean;
}

export function AppHeader({ title, hideOnSwipe = false }: AppHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  
  // Real-time state
  const [tokenBalance, setTokenBalance] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const db = getFirestore();

    // Subscribe to token balance
    const tokenUnsub = onSnapshot(
      doc(db, 'users', user.uid, 'wallet', 'balance'),
      (snapshot) => {
        if (snapshot.exists()) {
          setTokenBalance(snapshot.data()?.tokens || 0);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching token balance:', error);
        setLoading(false);
      }
    );

    // Subscribe to likes count
    const likesUnsub = onSnapshot(
      doc(db, 'users', user.uid, 'stats', 'likes'),
      (snapshot) => {
        if (snapshot.exists()) {
          setLikesCount(snapshot.data()?.count || 0);
        }
      },
      (error) => {
        console.error('Error fetching likes:', error);
      }
    );

    // Subscribe to unread notifications
    const notificationsUnsub = onSnapshot(
      doc(db, 'users', user.uid, 'stats', 'notifications'),
      (snapshot) => {
        if (snapshot.exists()) {
          setUnreadNotifications(snapshot.data()?.unread || 0);
        }
      },
      (error) => {
        console.error('Error fetching notifications:', error);
      }
    );

    return () => {
      tokenUnsub();
      likesUnsub();
      notificationsUnsub();
    };
  }, [user?.uid]);

  if (hideOnSwipe) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.sm,
        },
      ]}
    >
      {/* Left: Page Title or Logo */}
      <View style={styles.leftSection}>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <Text style={styles.logo}>avalo</Text>
        )}
      </View>

      {/* Right: Wallet, Likes, Notifications */}
      <View style={styles.rightSection}>
        {/* Wallet Balance */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push('/wallet' as any)}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Text style={styles.iconEmoji}>💰</Text>
              <Text style={styles.iconLabel}>{tokenBalance}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Likes */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push('/likes' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.iconEmoji}>❤️</Text>
          {likesCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {likesCount > 99 ? '99+' : likesCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push('/notifications' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.iconEmoji}>🔔</Text>
          {unreadNotifications > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftSection: {
    flex: 1,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  logo: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.extrabold,
    color: colors.primary,
    fontStyle: 'italic',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    gap: spacing.xs,
    position: 'relative',
    minWidth: 60,
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  iconEmoji: {
    fontSize: 20,
  },
  iconLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: fontSizes.xs - 2,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
