/**
 * Academy Card Component
 * Displays a module card with progress in the Creator Academy
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

export interface AcademyModule {
  id: string;
  title: string;
  icon: string;
  description: string;
  completed: boolean;
  progress: number; // 0-100
}

interface AcademyCardProps {
  module: AcademyModule;
  onPress: () => void;
}

export default function AcademyCard({ module, onPress }: AcademyCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, module.completed && styles.cardCompleted]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{module.icon}</Text>
        {module.completed && (
          <View style={styles.completeBadge}>
            <Text style={styles.completeBadgeText}>✓</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{module.title}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {module.description}
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${module.progress}%`,
                  backgroundColor: module.completed ? '#4CAF50' : '#40E0D0',
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {module.completed ? 'Completed' : `${Math.round(module.progress)}%`}
          </Text>
        </View>
      </View>

      <View style={styles.arrow}>
        <Text style={styles.arrowText}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  cardCompleted: {
    borderColor: '#4CAF50',
    backgroundColor: '#1A2A1A',
  },
  iconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  icon: {
    fontSize: 48,
  },
  completeBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeBadgeText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
    lineHeight: 18,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
    minWidth: 70,
    textAlign: 'right',
  },
  arrow: {
    marginLeft: 12,
  },
  arrowText: {
    fontSize: 32,
    color: '#666',
    fontWeight: '300',
  },
});
