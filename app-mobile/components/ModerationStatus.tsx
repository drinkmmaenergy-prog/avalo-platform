/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * Mobile UI Components for Upload Status and Blocking
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export type ModerationStatusType = 'uploading' | 'pending' | 'approved' | 'blocked';

interface ModerationStatusProps {
  status: ModerationStatusType;
  reason?: string;
}

/**
 * Component to show moderation status during and after upload
 */
export const ModerationStatus: React.FC<ModerationStatusProps> = ({ status, reason }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          color: '#3B82F6', // blue
          icon: <ActivityIndicator color="#3B82F6" />,
          title: 'Uploading...',
          message: 'Your content is being uploaded',
        };
      case 'pending':
        return {
          color: '#F59E0B', // amber
          icon: '⏳',
          title: 'Pending Review',
          message: 'Your content is being reviewed and will be available soon',
        };
      case 'approved':
        return {
          color: '#10B981', // green
          icon: '✓',
          title: 'Approved',
          message: 'Your content has been posted successfully',
        };
      case 'blocked':
        return {
          color: '#EF4444', // red
          icon: '✗',
          title: 'Content Blocked',
          message: reason || 'This content violates our community guidelines',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={[styles.container, { borderLeftColor: config.color }]}>
      <View style={styles.iconContainer}>
        {typeof config.icon === 'string' ? (
          <Text style={[styles.iconText, { color: config.color }]}>{config.icon}</Text>
        ) : (
          config.icon
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: config.color }]}>{config.title}</Text>
        <Text style={styles.message}>{config.message}</Text>
      </View>
    </View>
  );
};

/**
 * Inline status badge (for lists)
 */
interface StatusBadgeProps {
  status: ModerationStatusType;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getConfig = () => {
    switch (status) {
      case 'uploading':
        return { bg: '#DBEAFE', text: '#1E40AF', label: 'Uploading' };
      case 'pending':
        return { bg: '#FEF3C7', text: '#92400E', label: 'Pending Review' };
      case 'approved':
        return { bg: '#D1FAE5', text: '#065F46', label: 'Live' };
      case 'blocked':
        return { bg: '#FEE2E2', text: '#991B1B', label: 'Blocked' };
    }
  };

  const config = getConfig();

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
};

/**
 * Full-screen blocked content message
 */
interface BlockedContentScreenProps {
  reason: string;
  onDismiss: () => void;
}

export const BlockedContentScreen: React.FC<BlockedContentScreenProps> = ({ reason, onDismiss }) => {
  return (
    <View style={styles.blockedScreen}>
      <View style={styles.blockedContainer}>
        <Text style={styles.blockedIcon}>🚫</Text>
        <Text style={styles.blockedTitle}>Content Blocked</Text>
        <Text style={styles.blockedReason}>{reason}</Text>
        <Text style={styles.blockedHint}>
          This content violates our community guidelines and cannot be posted.
        </Text>
        <View style={styles.blockedButton}>
          <Text style={styles.blockedButtonText} onPress={onDismiss}>
            Understood
          </Text>
        </View>
      </View>
    </View>
  );
};

/**
 * Pending review overlay (for content waiting approval)
 */
export const PendingReviewOverlay: React.FC = () => {
  return (
    <View style={styles.overlay}>
      <View style={styles.overlayContent}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.overlayText}>Pending Review</Text>
        <Text style={styles.overlaySubtext}>
          Your content is being reviewed. It will be visible once approved.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  blockedScreen: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blockedContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  blockedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  blockedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 12,
  },
  blockedReason: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  blockedHint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  blockedButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  blockedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 200,
  },
  overlayText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F59E0B',
    marginTop: 16,
    marginBottom: 8,
  },
  overlaySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
