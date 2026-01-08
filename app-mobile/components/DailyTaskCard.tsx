/**
 * Daily Task Card Component
 * Displays a single daily task with icon, title, description, and CTA
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { DailyTask, DailyTaskType } from '../services/dailyTasksService';
import { useTranslation } from '../hooks/useTranslation';

export interface DailyTaskCardProps {
  task: DailyTask;
  onPressCTANavigate: () => void;
  onCompleted?: () => void;
}

/**
 * Get emoji icon for task type
 */
function getTaskIcon(type: DailyTaskType): string {
  const icons: Record<DailyTaskType, string> = {
    ADD_PHOTO: '📸',
    SEND_MESSAGE_PROFILE_VISITED: '💬',
    REPLY_UNREAD: '💌',
    DO_10_SWIPES: '👆',
    OPEN_SMART_SUGGESTIONS: '✨',
    OPEN_LIVE_TAB: '🔴',
    BROWSE_PPV_GALLERY: '🖼️',
    OPEN_AI_COMPANION: '🤖',
    VISIT_PROFILE_WHO_VISITED_YOU: '👀',
    EDIT_PROFILE_SECTION: '✏️',
    OPEN_EXPLORE_TRENDING: '🔥',
    SET_MOOD_STATUS: '😊',
  };
  return icons[type] || '📋';
}

export default function DailyTaskCard({
  task,
  onPressCTANavigate,
  onCompleted,
}: DailyTaskCardProps) {
  const { t } = useTranslation();
  
  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Animate when task is completed
  useEffect(() => {
    if (task.completed) {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.6,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [task.completed, scaleAnim, opacityAnim]);

  const icon = getTaskIcon(task.type);
  const title = t(task.titleKey);
  const description = t(task.descriptionKey);

  return (
    <Animated.View
      style={[
        styles.container,
        task.completed && styles.containerCompleted,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Left Icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, task.completed && styles.titleCompleted]}>
          {title}
        </Text>
        <Text style={[styles.description, task.completed && styles.descriptionCompleted]}>
          {description}
        </Text>
      </View>

      {/* Right Side: CTA or Done Badge */}
      {task.completed ? (
        <View style={styles.completedBadge}>
          <Text style={styles.completedBadgeText}>✓ {t('common.done').toUpperCase()}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={onPressCTANavigate}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaButtonText}>{t('dailyTasks.buttonOpen')}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(64, 224, 208, 0.3)',
    padding: 16,
    marginBottom: 12,
  },
  containerCompleted: {
    borderColor: 'rgba(100, 100, 100, 0.3)',
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 32,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  titleCompleted: {
    color: '#888888',
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  descriptionCompleted: {
    color: '#666666',
  },
  ctaButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  completedBadge: {
    borderWidth: 1.5,
    borderColor: 'rgba(64, 224, 208, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(64, 224, 208, 0.9)',
    letterSpacing: 0.5,
  },
});
