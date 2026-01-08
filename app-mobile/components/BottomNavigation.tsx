/**
 * PACK 269 - Bottom Navigation Component
 * 5-tab navigation system: Feed, Discovery, Swipe, Messages, Profile
 * Features:
 * - Platform-consistent icons
 * - State persistence between tabs
 * - Safe area handling
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSizes, fontWeights } from '../../shared/theme';

interface NavTab {
  name: string;
  label: string;
  icon: string;
  route: string;
}

const TABS: NavTab[] = [
  { name: 'feed', label: 'Feed', icon: '📰', route: '/feed' },
  { name: 'discovery', label: 'Discovery', icon: '✨', route: '/discovery' },
  { name: 'swipe', label: 'Swipe', icon: '🔥', route: '/swipe' },
  { name: 'messages', label: 'Messages', icon: '💬', route: '/messages' },
  { name: 'profile', label: 'Profile', icon: '👤', route: '/profile' },
];

export function BottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isTabActive = (route: string): boolean => {
    // Handle root paths and nested paths
    if (route === '/feed' && (pathname === '/' || pathname === '/feed')) return true;
    return pathname.startsWith(route);
  };

  const handleTabPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = isTabActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.route)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
              <Text style={[styles.icon, isActive && styles.iconActive]}>
                {tab.icon}
              </Text>
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    position: 'relative',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs / 2,
  },
  iconContainerActive: {
    backgroundColor: colors.hover,
  },
  icon: {
    fontSize: 24,
  },
  iconActive: {
    fontSize: 26,
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
