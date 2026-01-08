/**
 * PACK 73 — Safety Banner Component
 * Displays contextual safety warnings in chat based on risk level
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SafetyHintLevel } from '../../services/safetyService';

interface SafetyBannerProps {
  level: SafetyHintLevel;
  onBlock?: () => void;
  onReport?: () => void;
  onSupport?: () => void;
}

export function SafetyBanner({
  level,
  onBlock,
  onReport,
  onSupport,
}: SafetyBannerProps) {
  const { t } = useTranslation();

  if (level === 'NONE') {
    return null;
  }

  const getBannerStyle = () => {
    switch (level) {
      case 'HIGH':
        return styles.bannerHigh;
      case 'MEDIUM':
        return styles.bannerMedium;
      case 'LOW':
        return styles.bannerLow;
      default:
        return styles.bannerLow;
    }
  };

  const getMessageKey = () => {
    switch (level) {
      case 'HIGH':
        return 'safety.chat.banner.high';
      case 'MEDIUM':
        return 'safety.chat.banner.medium';
      case 'LOW':
        return 'safety.chat.banner.low';
      default:
        return 'safety.chat.banner.low';
    }
  };

  const showActions = level === 'MEDIUM' || level === 'HIGH';

  return (
    <View style={[styles.container, getBannerStyle()]}>
      <Text style={styles.message}>{t(getMessageKey())}</Text>

      {showActions && (
        <View style={styles.actionsContainer}>
          {onBlock && (
            <TouchableOpacity style={styles.actionButton} onPress={onBlock}>
              <Text style={styles.actionText}>
                {t('safety.chat.action.block')}
              </Text>
            </TouchableOpacity>
          )}

          {onReport && (
            <TouchableOpacity style={styles.actionButton} onPress={onReport}>
              <Text style={styles.actionText}>
                {t('safety.chat.action.report')}
              </Text>
            </TouchableOpacity>
          )}

          {onSupport && level === 'HIGH' && (
            <TouchableOpacity style={styles.actionButton} onPress={onSupport}>
              <Text style={styles.actionText}>
                {t('safety.chat.action.support')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  bannerLow: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  bannerMedium: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  bannerHigh: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1A1A1A',
    marginBottom: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
  },
});
