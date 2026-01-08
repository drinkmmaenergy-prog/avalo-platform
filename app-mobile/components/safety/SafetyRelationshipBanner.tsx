/**
 * PACK 74 — Safety Relationship Banner
 * 
 * Displays red flag warnings in chat screens based on relationship risk level
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RiskLevel } from '../../services/safetyRelationshipService';

// ============================================================================
// TYPES
// ============================================================================

interface SafetyRelationshipBannerProps {
  level: RiskLevel;
  onBlock?: () => void;
  onReport?: () => void;
  onSupport?: () => void;
  onSafetyTips?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const SafetyRelationshipBanner: React.FC<SafetyRelationshipBannerProps> = ({
  level,
  onBlock,
  onReport,
  onSupport,
  onSafetyTips,
}) => {
  // Don't render anything for NONE level
  if (level === 'NONE') {
    return null;
  }

  // Get appropriate styling and content based on level
  const config = getBannerConfig(level);

  return (
    <View style={[styles.container, { backgroundColor: config.backgroundColor }]}>
      <View style={styles.content}>
        <Text style={[styles.message, { color: config.textColor }]}>
          {config.message}
        </Text>

        {level !== 'LOW' && (
          <View style={styles.actions}>
            {onSafetyTips && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={onSafetyTips}
              >
                <Text style={styles.secondaryButtonText}>Safety tips</Text>
              </TouchableOpacity>
            )}

            {onBlock && (
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={onBlock}
              >
                <Text style={styles.primaryButtonText}>Block</Text>
              </TouchableOpacity>
            )}

            {onReport && (
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={onReport}
              >
                <Text style={styles.primaryButtonText}>Report</Text>
              </TouchableOpacity>
            )}

            {level === 'HIGH' && onSupport && (
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={onSupport}
              >
                <Text style={styles.primaryButtonText}>Contact support</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

interface BannerConfig {
  backgroundColor: string;
  textColor: string;
  message: string;
}

function getBannerConfig(level: RiskLevel): BannerConfig {
  switch (level) {
    case 'HIGH':
      return {
        backgroundColor: '#fee',
        textColor: '#c00',
        message: 'Some patterns in this chat may be manipulative. Trust your intuition.',
      };
    case 'MEDIUM':
      return {
        backgroundColor: '#fff3cd',
        textColor: '#856404',
        message: 'Be careful if someone pressures you to move too fast or share personal details.',
      };
    case 'LOW':
      return {
        backgroundColor: '#d4edda',
        textColor: '#155724',
        message: 'Remember to take things at your own pace.',
      };
    default:
      return {
        backgroundColor: '#f8f9fa',
        textColor: '#495057',
        message: '',
      };
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  content: {
    gap: 12,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#dc3545',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6c757d',
  },
  secondaryButtonText: {
    color: '#6c757d',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default SafetyRelationshipBanner;
