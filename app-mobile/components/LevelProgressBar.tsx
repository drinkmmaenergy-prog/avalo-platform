/**
 * Level Progress Bar Component - Phase 31D-4
 * Displays XP level and progress
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';

type LevelProgressBarProps = {
  level: number;
  xpInCurrentLevel: number;
  xpNeededForNext: number;
  progressPercent: number;
};

export default function LevelProgressBar({
  level,
  xpInCurrentLevel,
  xpNeededForNext,
  progressPercent,
}: LevelProgressBarProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Level Badge */}
      <View style={styles.levelBadge}>
        <Text style={styles.levelText}>✨ {level}</Text>
      </View>

      {/* Progress Info */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {t('gamification.swipe.xp.level')} {level}
          </Text>
          <Text style={styles.progressXP}>
            {xpInCurrentLevel} / {xpInCurrentLevel + xpNeededForNext} XP
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercent}%` },
            ]}
          />
        </View>

        <Text style={styles.progressSubtext}>
          {xpNeededForNext} XP {t('gamification.swipe.xp.toNextLevel')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  levelBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressContainer: {
    flex: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressXP: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E0F7FA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 11,
    color: '#999',
  },
});
