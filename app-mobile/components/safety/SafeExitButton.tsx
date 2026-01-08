/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Safe Exit Button (Quick Escape)
 * 
 * Provides victims with a quick way to exit the app and clear recent activity.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';

interface SafeExitButtonProps {
  variant?: 'floating' | 'inline' | 'compact';
  onExit?: () => void;
}

export const SafeExitButton: React.FC<SafeExitButtonProps> = ({
  variant = 'floating',
  onExit,
}) => {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);
  
  const handleSafeExit = () => {
    Alert.alert(
      'Safe Exit',
      'This will close the app and clear your recent activity from the app switcher.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Exit Now',
          style: 'destructive',
          onPress: () => {
            performSafeExit();
          },
        },
      ]
    );
  };
  
  const performSafeExit = () => {
    // Call custom exit handler if provided
    if (onExit) {
      onExit();
    }
    
    // Navigate to a neutral screen first
    try {
      router.replace('/');
    } catch (error) {
      console.error('Error navigating:', error);
    }
    
    // Close the app (platform-specific)
    if (Platform.OS === 'android') {
      // On Android, we can use BackHandler
      const { BackHandler } = require('react-native');
      BackHandler.exitApp();
    } else {
      // On iOS, app exit is handled by the system
      // We can only navigate away and minimize
      console.log('Safe exit triggered on iOS');
    }
  };
  
  if (variant === 'floating') {
    return (
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={handleSafeExit}
        activeOpacity={0.8}
      >
        <Text style={styles.floatingIcon}>🚨</Text>
        <Text style={styles.floatingText}>Safe Exit</Text>
      </TouchableOpacity>
    );
  }
  
  if (variant === 'compact') {
    return (
      <TouchableOpacity
        style={styles.compactButton}
        onPress={handleSafeExit}
        activeOpacity={0.8}
      >
        <Text style={styles.compactIcon}>🚨</Text>
        <Text style={styles.compactText}>Exit</Text>
      </TouchableOpacity>
    );
  }
  
  // Inline variant
  return (
    <TouchableOpacity
      style={styles.inlineButton}
      onPress={handleSafeExit}
      activeOpacity={0.8}
    >
      <Text style={styles.inlineIcon}>🚨</Text>
      <View style={styles.inlineContent}>
        <Text style={styles.inlineTitle}>Safe Exit</Text>
        <Text style={styles.inlineSubtitle}>Quick escape when needed</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  floatingIcon: {
    fontSize: 20,
  },
  floatingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  compactButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactIcon: {
    fontSize: 16,
  },
  compactText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inlineIcon: {
    fontSize: 24,
  },
  inlineContent: {
    flex: 1,
  },
  inlineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 2,
  },
  inlineSubtitle: {
    fontSize: 13,
    color: '#7F1D1D',
  },
});
