/**
 * PACK 112 — Select Profile Badges Screen
 * Allows users to choose up to 3 badges to display on their profile
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Achievement {
  id: string;
  title: string;
  description: string;
  iconKey: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
}

const TIER_COLORS = {
  BRONZE: '#CD7F32',
  SILVER: '#C0C0C0',
  GOLD: '#FFD700',
  PLATINUM: '#E5E4E2',
  DIAMOND: '#B9F2FF',
};

const MAX_BADGES = 3;

export default function SelectBadgesScreen() {
  const router = useRouter();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<Achievement[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [initialSelection, setInitialSelection] = useState<string[]>([]);

  useEffect(() => {
    loadUnlockedAchievements();
  }, []);

  const loadUnlockedAchievements = async () => {
    try {
      const getUserAchievements = httpsCallable(functions, 'getUserAchievements');
      const result = await getUserAchievements({});
      
      const data = result.data as any;
      const achievedIds = data.achievements.achievedIds || [];
      const catalog = data.catalog || [];
      
      // Filter to only unlocked achievements
      const unlocked = catalog.filter((a: Achievement) =>
        achievedIds.includes(a.id)
      );
      
      setUnlockedAchievements(unlocked);
      
      // Load current selection
      const currentSelection = data.achievements.selectedBadges || [];
      setSelectedBadges(currentSelection);
      setInitialSelection(currentSelection);
    } catch (error) {
      console.error('Error loading achievements:', error);
      Alert.alert('Error', 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  const toggleBadge = (badgeId: string) => {
    if (selectedBadges.includes(badgeId)) {
      // Remove badge
      setSelectedBadges(selectedBadges.filter(id => id !== badgeId));
    } else {
      // Add badge if under limit
      if (selectedBadges.length >= MAX_BADGES) {
        Alert.alert(
          'Maximum Badges',
          `You can only select up to ${MAX_BADGES} badges to display on your profile.`
        );
        return;
      }
      setSelectedBadges([...selectedBadges, badgeId]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const selectProfileBadges = httpsCallable(functions, 'selectProfileBadges');
      await selectProfileBadges({ badgeIds: selectedBadges });
      
      Alert.alert(
        'Success',
        'Your profile badges have been updated!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error saving badges:', error);
      Alert.alert('Error', error.message || 'Failed to save badges');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    if (selectedBadges.length !== initialSelection.length) return true;
    return !selectedBadges.every(id => initialSelection.includes(id));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading badges...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Profile Badges</Text>
        <Text style={styles.headerSubtitle}>
          Choose up to {MAX_BADGES} badges to display on your profile
        </Text>
        <Text style={styles.selectionCounter}>
          {selectedBadges.length} / {MAX_BADGES} selected
        </Text>
      </View>

      <ScrollView style={styles.badgesScroll}>
        {unlockedAchievements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🎯</Text>
            <Text style={styles.emptyStateTitle}>No Badges Yet</Text>
            <Text style={styles.emptyStateText}>
              Unlock achievements to earn badges that you can display on your profile!
            </Text>
          </View>
        ) : (
          <View style={styles.badgesList}>
            {unlockedAchievements.map((achievement) => {
              const isSelected = selectedBadges.includes(achievement.id);
              const selectionIndex = selectedBadges.indexOf(achievement.id);

              return (
                <TouchableOpacity
                  key={achievement.id}
                  style={[
                    styles.badgeCard,
                    isSelected && styles.badgeCardSelected,
                  ]}
                  onPress={() => toggleBadge(achievement.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.badgeIcon}>
                    <View
                      style={[
                        styles.tierBadge,
                        { backgroundColor: TIER_COLORS[achievement.tier] },
                      ]}
                    >
                      <Text style={styles.tierText}>
                        {achievement.tier.charAt(0)}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.selectionBadge}>
                        <Text style={styles.selectionNumber}>
                          {selectionIndex + 1}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.badgeContent}>
                    <Text style={styles.badgeTitle}>{achievement.title}</Text>
                    <Text style={styles.badgeDescription}>
                      {achievement.description}
                    </Text>
                    <View style={styles.badgeTier}>
                      <View
                        style={[
                          styles.tierDot,
                          { backgroundColor: TIER_COLORS[achievement.tier] },
                        ]}
                      />
                      <Text style={styles.tierLabel}>{achievement.tier}</Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkIcon}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {unlockedAchievements.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasChanges() || saving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {hasChanges() ? 'Save Selection' : 'No Changes'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6C757D',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 12,
  },
  selectionCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  badgesScroll: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 20,
  },
  badgesList: {
    padding: 16,
  },
  badgeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E9ECEF',
  },
  badgeCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  badgeIcon: {
    marginRight: 16,
    position: 'relative',
  },
  tierBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  selectionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  selectionNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  badgeContent: {
    flex: 1,
    justifyContent: 'center',
  },
  badgeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  badgeDescription: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 8,
  },
  badgeTier: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  tierLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
  },
  checkmark: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  checkmarkIcon: {
    fontSize: 24,
    color: '#28A745',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#ADB5BD',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6C757D',
  },
});
