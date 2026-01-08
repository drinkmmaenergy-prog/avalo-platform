/**
 * Achievements Modal Component - Phase 31D-4
 * Displays all achievements with unlock status
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import AchievementBadge from './AchievementBadge';
import {
  getAchievementProgress,
  type Achievement,
} from '../utils/achievementsEngine';

type AchievementsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export default function AchievementsModal({
  visible,
  onClose,
}: AchievementsModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [totalSwipes, setTotalSwipes] = useState(0);
  const [unlockedCount, setUnlockedCount] = useState(0);

  useEffect(() => {
    if (visible) {
      loadAchievements();
    }
  }, [visible]);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const progress = await getAchievementProgress();
      setAchievements(progress.achievements);
      setTotalSwipes(progress.totalSwipes);
      setUnlockedCount(progress.unlockedCount);
    } catch (error) {
      console.error('[AchievementsModal] Error loading achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                🏆 {t('gamification.swipe.achievements.title')}
              </Text>
              <Text style={styles.subtitle}>
                {unlockedCount} / {achievements.length} {t('gamification.swipe.achievements.unlocked')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalSwipes}</Text>
              <Text style={styles.statLabel}>
                {t('gamification.swipe.achievements.totalSwipes')}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{unlockedCount}</Text>
              <Text style={styles.statLabel}>
                {t('gamification.swipe.achievements.unlockedBadges')}
              </Text>
            </View>
          </View>

          {/* Achievements Grid */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#40E0D0" />
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.achievementsGrid}
              showsVerticalScrollIndicator={false}
            >
              {achievements.map((achievement) => (
                <View key={achievement.id} style={styles.achievementItem}>
                  <AchievementBadge
                    tier={achievement.tier}
                    name={achievement.name}
                    description={achievement.description}
                    unlocked={achievement.unlocked}
                    size="medium"
                  />
                  {!achievement.unlocked && (
                    <View style={styles.requirementBadge}>
                      <Text style={styles.requirementText}>
                        {achievement.swipesRequired} {t('gamification.swipe.achievements.swipes')}
                      </Text>
                    </View>
                  )}
                  {achievement.unlocked && achievement.unlockedAt && (
                    <Text style={styles.unlockedDate}>
                      {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('gamification.swipe.achievements.keepSwiping')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  scrollView: {
    flex: 1,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
  achievementItem: {
    width: '48%',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  requirementBadge: {
    marginTop: 8,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  requirementText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F57C00',
  },
  unlockedDate: {
    marginTop: 8,
    fontSize: 10,
    color: '#999',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
