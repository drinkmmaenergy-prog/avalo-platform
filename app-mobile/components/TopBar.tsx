/**
 * TopBar Component - Phase 5 Updated
 * Reusable top bar with Wallet, Filters, and Settings icons
 * Long-press for 8 seconds to open Dev Menu
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DevMenu } from './DevMenu';

interface TopBarProps {
  tokenBalance: number;
  onWalletPress?: () => void;
  onFiltersPress?: () => void;
  onSettingsPress?: () => void;
}

export default function TopBar({
  tokenBalance,
  onWalletPress,
  onFiltersPress,
  onSettingsPress,
}: TopBarProps) {
  const router = useRouter();
  const [devMenuVisible, setDevMenuVisible] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleWalletPress = () => {
    if (onWalletPress) {
      onWalletPress();
    } else {
      router.push('/(tabs)/wallet' as any);
    }
  };

  const handleFiltersPress = () => {
    if (onFiltersPress) {
      onFiltersPress();
    } else {
      router.push('/(tabs)/dating-preferences' as any);
    }
  };

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      router.push('/(tabs)/profile' as any);
    }
  };

  // Long-press handler for Dev Menu (8 seconds)
  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      if (__DEV__) {
        setDevMenuVisible(true);
      }
    }, 8000); // 8 seconds
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Logo/Brand (with hidden dev menu trigger) */}
      <TouchableWithoutFeedback
        onPressIn={handleLongPressStart}
        onPressOut={handleLongPressEnd}
      >
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>avalo</Text>
        </View>
      </TouchableWithoutFeedback>

      {/* Wallet Balance */}
      <TouchableOpacity
        style={styles.walletButton}
        onPress={handleWalletPress}
        activeOpacity={0.7}
      >
        <Text style={styles.walletIcon}>💰</Text>
        <Text style={styles.walletBalance}>{tokenBalance}</Text>
      </TouchableOpacity>

      {/* Right Side Actions */}
      <View style={styles.rightActions}>
        {/* Filters Icon */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleFiltersPress}
          activeOpacity={0.7}
        >
          <Text style={styles.iconText}>🔍</Text>
        </TouchableOpacity>

        {/* Settings Icon */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleSettingsPress}
          activeOpacity={0.7}
        >
          <Text style={styles.iconText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Dev Menu (Phase 5) */}
      <DevMenu
        visible={devMenuVisible}
        onClose={() => setDevMenuVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  logoContainer: {
    padding: 8,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    fontStyle: 'italic',
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletIcon: {
    fontSize: 22,
  },
  walletBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconText: {
    fontSize: 22,
  },
});
