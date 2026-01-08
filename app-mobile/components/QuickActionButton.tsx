/**
 * PACK 269 - Quick Action Floating Button
 * Floating action button on Feed screen with quick access to:
 * - Create Event
 * - Add Post
 * - Open Calendar
 * - Create AI Avatar
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSizes, fontWeights, radius } from '../../shared/theme';

interface QuickAction {
  icon: string;
  label: string;
  route: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: '📅',
    label: 'Create Event',
    route: '/events/create',
    color: colors.primary,
  },
  {
    icon: '✍️',
    label: 'Add Post',
    route: '/feed/create',
    color: colors.accent,
  },
  {
    icon: '🗓️',
    label: 'Calendar',
    route: '/calendar',
    color: colors.info,
  },
  {
    icon: '🤖',
    label: 'AI Avatar',
    route: '/profile/ai-avatar',
    color: colors.gold,
  },
];

export function QuickActionButton() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(true);
    });
  };

  const handleActionPress = (route: string) => {
    setModalVisible(false);
    setTimeout(() => {
      router.push(route as any);
    }, 300);
  };

  return (
    <>
      {/* Floating Action Button */}
      <Animated.View
        style={[
          styles.fabContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Action Menu Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Actions</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeIcon}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionsGrid}>
              {QUICK_ACTIONS.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.actionItem}
                  onPress={() => handleActionPress(action.route)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.actionIconContainer,
                      { backgroundColor: action.color + '20' },
                    ]}
                  >
                    <Text style={styles.actionIcon}>{action.icon}</Text>
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 80, // Above bottom navigation
    right: spacing.lg,
    zIndex: 1000,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabIcon: {
    fontSize: 40,
    color: colors.background,
    fontWeight: fontWeights.light,
    lineHeight: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxxl,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionItem: {
    width: '47%',
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  actionIcon: {
    fontSize: 36,
  },
  actionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
