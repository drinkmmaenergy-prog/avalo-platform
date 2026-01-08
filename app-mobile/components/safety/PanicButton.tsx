/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Panic Button Component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { usePanicButton } from '../../hooks/usePanicButton';

export interface PanicButtonProps {
  variant?: 'full' | 'compact' | 'icon';
  style?: any;
  onPanicTriggered?: () => void;
}

export function PanicButton({ variant = 'full', style, onPanicTriggered }: PanicButtonProps) {
  const { triggering, triggerPanic } = usePanicButton();

  const handlePress = async () => {
    try {
      await triggerPanic();
      onPanicTriggered?.();
    } catch (error) {
      // Error already handled in hook
    }
  };

  if (variant === 'icon') {
    return (
      <TouchableOpacity
        style={[styles.iconButton, style]}
        onPress={handlePress}
        disabled={triggering}
        activeOpacity={0.8}
      >
        {triggering ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.iconText}>🚨</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <TouchableOpacity
        style={[styles.compactButton, style]}
        onPress={handlePress}
        disabled={triggering}
        activeOpacity={0.8}
      >
        {triggering ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={styles.compactIcon}>🚨</Text>
            <Text style={styles.compactText}>Panic</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  // Full variant (default)
  return (
    <TouchableOpacity
      style={[styles.fullButton, style]}
      onPress={handlePress}
      disabled={triggering}
      activeOpacity={0.8}
    >
      {triggering ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Sending alert...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.fullIcon}>🚨</Text>
          <Text style={styles.fullTitle}>Emergency Panic Button</Text>
          <Text style={styles.fullSubtitle}>
            Tap to immediately alert your trusted contacts
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Full variant
  fullButton: {
    backgroundColor: '#EF4444',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fullIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  fullTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  fullSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 12,
    fontWeight: '600',
  },

  // Compact variant
  compactButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  compactIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  compactText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Icon variant
  iconButton: {
    backgroundColor: '#EF4444',
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  iconText: {
    fontSize: 32,
  },
});
