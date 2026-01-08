/**
 * PACK 74 — Post-Reservation Safety Follow-up Banner
 * 
 * Displays safety assistance options after completing a reservation/meeting
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// ============================================================================
// TYPES
// ============================================================================

interface PostReservationSafetyBannerProps {
  visible: boolean;
  onBlock?: () => void;
  onReport?: () => void;
  onSupport?: () => void;
  onDismiss?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Safety follow-up banner shown after first IRL reservation
 * 
 * Usage after reservation rating:
 * ```tsx
 * <PostReservationSafetyBanner
 *   visible={showSafetyFollowup}
 *   onBlock={handleBlock}
 *   onReport={handleReport}
 *   onSupport={handleSupport}
 *   onDismiss={() => setShowSafetyFollowup(false)}
 * />
 * ```
 */
export const PostReservationSafetyBanner: React.FC<PostReservationSafetyBannerProps> = ({
  visible,
  onBlock,
  onReport,
  onSupport,
  onDismiss,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Your safety matters</Text>
        <Text style={styles.message}>
          If anything made you feel unsafe, you can block, report or contact support anytime.
        </Text>

        <View style={styles.actions}>
          {onBlock && (
            <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={onBlock}>
              <Text style={styles.actionButtonText}>Block user</Text>
            </TouchableOpacity>
          )}

          {onReport && (
            <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={onReport}>
              <Text style={styles.actionButtonText}>Report</Text>
            </TouchableOpacity>
          )}

          {onSupport && (
            <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={onSupport}>
              <Text style={styles.actionButtonText}>Contact support</Text>
            </TouchableOpacity>
          )}
        </View>

        {onDismiss && (
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>I'm OK, dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  content: {
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#495057',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#6c757d',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PostReservationSafetyBanner;
