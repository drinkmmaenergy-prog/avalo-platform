/**
 * Academy Progress Bar Component
 * Shows overall Academy completion progress
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

interface AcademyProgressBarProps {
  completedModules: number;
  totalModules: number;
}

export default function AcademyProgressBar({
  completedModules,
  totalModules,
}: AcademyProgressBarProps) {
  const progress = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
  const isComplete = completedModules === totalModules;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Overall Progress</Text>
        <Text style={styles.count}>
          {completedModules}/{totalModules} modules
        </Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: isComplete ? '#4CAF50' : '#40E0D0',
              },
            ]}
          />
        </View>
      </View>

      <Text style={[styles.statusText, isComplete && styles.statusTextComplete]}>
        {isComplete
          ? '🎉 Academy Completed! Claim your reward!'
          : `${Math.round(progress)}% complete - Keep learning!`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  count: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  statusTextComplete: {
    color: '#4CAF50',
    fontWeight: '600',
  },
});
