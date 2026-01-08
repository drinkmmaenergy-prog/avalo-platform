/**
 * PACK 187 — Dating Intention & Chemistry Declaration System
 * Dating Intentions Settings Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

enum DatingIntentionBadge {
  ROMANTIC_VIBE = 'romantic_vibe',
  OPEN_TO_FLIRTING = 'open_to_flirting',
  SERIOUS_DATING = 'serious_dating',
  CASUAL_DATING = 'casual_dating',
  SPOIL_DYNAMIC = 'spoil_dynamic',
  VIBING = 'vibing',
}

interface DatingPreferences {
  showBadgeToMatches?: boolean;
  allowIntentionFiltering?: boolean;
  minCompatibilityScore?: number;
  onlyShowCompatibleUsers?: boolean;
  notifyOnHighCompatibility?: boolean;
  notifyOnIntentionUpdate?: boolean;
}

interface UserDatingIntention {
  userId: string;
  badges: DatingIntentionBadge[];
  preferences: DatingPreferences;
  createdAt: any;
  lastUpdated: any;
  matchesGenerated?: number;
  conversationsStarted?: number;
}

const BADGE_METADATA: Record<DatingIntentionBadge, {
  displayName: string;
  description: string;
  icon: string;
  color: string;
}> = {
  [DatingIntentionBadge.ROMANTIC_VIBE]: {
    displayName: 'Looking for romantic vibe',
    description: 'Seeking romantic connection and chemistry',
    icon: '💕',
    color: '#FF6B9D',
  },
  [DatingIntentionBadge.OPEN_TO_FLIRTING]: {
    displayName: 'Open to flirting',
    description: 'Comfortable with flirtatious interactions',
    icon: '😊',
    color: '#FF8C42',
  },
  [DatingIntentionBadge.SERIOUS_DATING]: {
    displayName: 'Open to serious dating',
    description: 'Interested in long-term relationship potential',
    icon: '💑',
    color: '#9B59B6',
  },
  [DatingIntentionBadge.CASUAL_DATING]: {
    displayName: 'Open to casual dating',
    description: 'Interested in casual romantic connections',
    icon: '🎉',
    color: '#3498DB',
  },
  [DatingIntentionBadge.SPOIL_DYNAMIC]: {
    displayName: 'Looking for someone to spoil / someone to spoil me',
    description: 'Sugar dating dynamic interest',
    icon: '💎',
    color: '#F39C12',
  },
  [DatingIntentionBadge.VIBING]: {
    displayName: 'Vibing - lets see where it goes',
    description: 'Open to organic connection development',
    icon: '✨',
    color: '#1ABC9C',
  },
};

export default function DatingIntentionsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intentions, setIntentions] = useState<UserDatingIntention | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<Set<DatingIntentionBadge>>(new Set());

  useEffect(() => {
    loadIntentions();
  }, []);

  const loadIntentions = async () => {
    try {
      setLoading(true);
      const getIntentions = httpsCallable<{}, UserDatingIntention>(
        functions,
        'getDatingIntentions'
      );
      const result = await getIntentions({});
      setIntentions(result.data);
      setSelectedBadges(new Set(result.data.badges));
    } catch (error) {
      console.error('Failed to load dating intentions:', error);
      Alert.alert('Error', 'Failed to load dating intentions');
    } finally {
      setLoading(false);
    }
  };

  const toggleBadge = (badge: DatingIntentionBadge) => {
    const newSelection = new Set(selectedBadges);
    
    if (newSelection.has(badge)) {
      newSelection.delete(badge);
    } else {
      if (newSelection.size >= 4) {
        Alert.alert('Maximum Reached', 'You can select up to 4 dating intentions.');
        return;
      }
      newSelection.add(badge);
    }
    
    setSelectedBadges(newSelection);
  };

  const saveIntentions = async () => {
    setSaving(true);
    try {
      const updateIntentions = httpsCallable<
        { badges: DatingIntentionBadge[] },
        UserDatingIntention
      >(functions, 'updateDatingIntentions');

      const result = await updateIntentions({
        badges: Array.from(selectedBadges),
      });

      setIntentions(result.data);
      Alert.alert('Success', 'Your dating intentions have been updated!');
    } catch (error) {
      console.error('Failed to update intentions:', error);
      Alert.alert('Error', 'Failed to update dating intentions');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = async (key: keyof DatingPreferences, value: any) => {
    if (!intentions) return;

    setSaving(true);
    try {
      const updateIntentions = httpsCallable<
        { preferences: Partial<DatingPreferences> },
        UserDatingIntention
      >(functions, 'updateDatingIntentions');

      const result = await updateIntentions({
        preferences: { [key]: value },
      });

      setIntentions(result.data);
    } catch (error) {
      console.error('Failed to update preference:', error);
      Alert.alert('Error', 'Failed to update preference');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    if (!intentions) return false;
    const currentBadges = new Set(intentions.badges);
    
    if (currentBadges.size !== selectedBadges.size) return true;
    
    for (const badge of selectedBadges) {
      if (!currentBadges.has(badge)) return true;
    }
    
    return false;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dating Intentions</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#FF6B9D" />
        </View>
      </View>
    );
  }

  if (!intentions) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dating Intentions</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Failed to load intentions</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dating Intentions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>💕</Text>
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>Your Dating Intentions</Text>
            <Text style={styles.infoBannerText}>
              These badges are PRIVATE and only used to improve your matches. They are never
              displayed publicly on your profile.
            </Text>
          </View>
        </View>

        {/* Badge Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Select Your Intentions (Choose up to 4)
          </Text>
          <Text style={styles.sectionSubtitle}>
            {selectedBadges.size}/4 selected
          </Text>

          {Object.entries(BADGE_METADATA).map(([badge, meta]) => {
            const isSelected = selectedBadges.has(badge as DatingIntentionBadge);
            return (
              <TouchableOpacity
                key={badge}
                style={[
                  styles.badgeCard,
                  isSelected && { ...styles.badgeCardSelected, borderColor: meta.color },
                ]}
                onPress={() => toggleBadge(badge as DatingIntentionBadge)}
                disabled={saving}
              >
                <View style={styles.badgeIcon}>
                  <Text style={styles.badgeIconText}>{meta.icon}</Text>
                </View>
                <View style={styles.badgeInfo}>
                  <Text style={[styles.badgeName, isSelected && { color: meta.color }]}>
                    {meta.displayName}
                  </Text>
                  <Text style={styles.badgeDescription}>{meta.description}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={meta.color} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Save Button */}
        {hasChanges() && (
          <View style={styles.saveButtonContainer}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveIntentions}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Matching</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Intention-Based Matching</Text>
              <Text style={styles.settingDescription}>
                Let others find you based on compatible dating intentions
              </Text>
            </View>
            <Switch
              value={intentions.preferences.allowIntentionFiltering !== false}
              onValueChange={(value) => updatePreference('allowIntentionFiltering', value)}
              disabled={saving}
              trackColor={{ false: '#767577', true: '#FF6B9D' }}
              thumbColor="#FFF"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Badges After Matching</Text>
              <Text style={styles.settingDescription}>
                Reveal your intentions to users after you match
              </Text>
            </View>
            <Switch
              value={intentions.preferences.showBadgeToMatches === true}
              onValueChange={(value) => updatePreference('showBadgeToMatches', value)}
              disabled={saving}
              trackColor={{ false: '#767577', true: '#FF6B9D' }}
              thumbColor="#FFF"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Only Show Compatible Users</Text>
              <Text style={styles.settingDescription}>
                Filter discovery feed to users with compatible intentions
              </Text>
            </View>
            <Switch
              value={intentions.preferences.onlyShowCompatibleUsers === true}
              onValueChange={(value) => updatePreference('onlyShowCompatibleUsers', value)}
              disabled={saving}
              trackColor={{ false: '#767577', true: '#FF6B9D' }}
              thumbColor="#FFF"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>High Compatibility Alerts</Text>
              <Text style={styles.settingDescription}>
                Get notified when you have an excellent match (80+ compatibility)
              </Text>
            </View>
            <Switch
              value={intentions.preferences.notifyOnHighCompatibility !== false}
              onValueChange={(value) => updatePreference('notifyOnHighCompatibility', value)}
              disabled={saving}
              trackColor={{ false: '#767577', true: '#FF6B9D' }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        {/* Stats */}
        {(intentions.matchesGenerated || intentions.conversationsStarted) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Impact</Text>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{intentions.matchesGenerated || 0}</Text>
                <Text style={styles.statLabel}>Intention Matches</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{intentions.conversationsStarted || 0}</Text>
                <Text style={styles.statLabel}>Conversations Started</Text>
              </View>
            </View>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How Dating Intentions Work</Text>
          <View style={styles.infoItem}>
            <Ionicons name="lock-closed" size={20} color="#4ECDC4" />
            <Text style={styles.infoText}>
              Your intentions are completely private and never shown on your public profile
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="heart" size={20} color="#4ECDC4" />
            <Text style={styles.infoText}>
              Our algorithm uses them to find users with compatible dating goals
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="people" size={20} color="#4ECDC4" />
            <Text style={styles.infoText}>
              Get better matches and more meaningful connections
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="refresh" size={20} color="#4ECDC4" />
            <Text style={styles.infoText}>
              Change your intentions anytime as your goals evolve
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#E74C3C',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF0F5',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B9D',
  },
  infoBannerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  section: {
    backgroundColor: '#FFF',
    marginBottom: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#999',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFF',
  },
  badgeCardSelected: {
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 4,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    backgroundColor: '#F8F9FA',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeIconText: {
    fontSize: 24,
  },
  badgeInfo: {
    flex: 1,
    marginRight: 12,
  },
  badgeName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  badgeDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  saveButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#FF6B9D',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 20,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B9D',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  infoSection: {
    backgroundColor: '#FFF',
    padding: 20,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
