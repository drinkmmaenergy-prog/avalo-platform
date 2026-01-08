/**
 * PACK 126 — Harassment Shield Banner
 * 
 * Visual indicator when harassment shield is active
 * Shows protection level and available actions
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ShieldLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface HarassmentShieldBannerProps {
  level: ShieldLevel;
  onDismiss?: () => void;
  onContactSupport?: () => void;
}

export default function HarassmentShieldBanner({
  level,
  onDismiss,
  onContactSupport,
}: HarassmentShieldBannerProps) {
  if (level === 'NONE') {
    return null;
  }

  const config = getBannerConfig(level);

  return (
    <View style={[styles.banner, { backgroundColor: config.backgroundColor }]}>
      <View style={styles.iconContainer}>
        <Ionicons name={config.icon} size={24} color={config.iconColor} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: config.textColor }]}>
          {config.title}
        </Text>
        <Text style={[styles.message, { color: config.textColor }]}>
          {config.message}
        </Text>

        {(level === 'MEDIUM' || level === 'HIGH' || level === 'CRITICAL') && (
          <View style={styles.actions}>
            {level === 'CRITICAL' && onContactSupport && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: config.buttonColor }]}
                onPress={onContactSupport}
              >
                <Ionicons name="help-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionText}>Contact Support</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {onDismiss && level === 'LOW' && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Ionicons name="close" size={20} color={config.textColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function getBannerConfig(level: ShieldLevel) {
  switch (level) {
    case 'LOW':
      return {
        backgroundColor: '#dbeafe',
        textColor: '#1e40af',
        iconColor: '#3b82f6',
        icon: 'information-circle' as const,
        buttonColor: '#3b82f6',
        title: 'Slow Mode Active',
        message: 'Messages are being rate-limited for your protection',
      };

    case 'MEDIUM':
      return {
        backgroundColor: '#fef3c7',
        textColor: '#92400e',
        iconColor: '#f59e0b',
        icon: 'shield-half' as const,
        buttonColor: '#f59e0b',
        title: 'Reply-Only Mode',
        message: 'This user can only send messages when you reply first',
      };

    case 'HIGH':
      return {
        backgroundColor: '#fee2e2',
        textColor: '#991b1b',
        iconColor: '#ef4444',
        icon: 'shield' as const,
        buttonColor: '#ef4444',
        title: 'Protection Activated',
        message: 'We\'ve activated additional protections. Contact support if you need help.',
      };

    case 'CRITICAL':
      return {
        backgroundColor: '#fecaca',
        textColor: '#7f1d1d',
        iconColor: '#dc2626',
        icon: 'shield-checkmark' as const,
        buttonColor: '#dc2626',
        title: 'Maximum Protection',
        message: 'Communication has been blocked for your safety. Our team is reviewing this case.',
      };

    default:
      return {
        backgroundColor: '#f3f4f6',
        textColor: '#374151',
        iconColor: '#6b7280',
        icon: 'shield-outline' as const,
        buttonColor: '#6b7280',
        title: 'Protected',
        message: 'Safety systems active',
      };
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  iconContainer: {
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dismissButton: {
    padding: 4,
  },
});
