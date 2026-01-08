/**
 * PACK 179 — Reputation Display Settings
 * Control what reputation information is displayed publicly
 * 
 * Public Trust Without Shaming · Positive Achievements Only
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ReputationDisplaySettings,
  ReputationPrivacyLevel
} from "@/types/reputation";

export default function ReputationSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReputationDisplaySettings | null>(null);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settingsDoc = await getDoc(
        doc(db, 'reputation_display_settings', user!.uid)
      );

      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as ReputationDisplaySettings);
      } else {
        const defaultSettings: Partial<ReputationDisplaySettings> = {
          userId: user!.uid,
          displayBadges: true,
          displayMilestones: true,
          displayAchievements: true,
          badgeOrder: [],
          privacyLevel: ReputationPrivacyLevel.PUBLIC,
          highlightedBadges: []
        };
        setSettings(defaultSettings as ReputationDisplaySettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<ReputationDisplaySettings>) => {
    try {
      setSaving(true);
      const newSettings = { ...settings, ...updates } as ReputationDisplaySettings;
      
      const updateSettingsFn = httpsCallable(functions, 'updateReputationDisplaySettings');
      const result = await updateSettingsFn({
        userId: user!.uid,
        settings: updates
      });

      const data = result.data as any;
      if (data.success) {
        setSettings(newSettings);
      } else {
        Alert.alert('Error', data.error || 'Failed to update settings');
      }
    } catch (error: any) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Settings...</Text>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load settings</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadSettings}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reputation Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Options</Text>
          <Text style={styles.sectionDescription}>
            Control what information is shown on your public profile
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Badges</Text>
              <Text style={styles.settingHint}>Display earned badges on your profile</Text>
            </View>
            <Switch
              value={settings.displayBadges}
              onValueChange={(value) => updateSettings({ displayBadges: value })}
              disabled={saving}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Milestones</Text>
              <Text style={styles.settingHint}>Display achievement milestones</Text>
            </View>
            <Switch
              value={settings.displayMilestones}
              onValueChange={(value) => updateSettings({ displayMilestones: value })}
              disabled={saving}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Achievements</Text>
              <Text style={styles.settingHint}>Display recent achievements</Text>
            </View>
            <Switch
              value={settings.displayAchievements}
              onValueChange={(value) => updateSettings({ displayAchievements: value })}
              disabled={saving}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Level</Text>
          <Text style={styles.sectionDescription}>
            Choose who can see your reputation information
          </Text>

          <TouchableOpacity
            style={[
              styles.privacyOption,
              settings.privacyLevel === ReputationPrivacyLevel.PUBLIC && styles.privacyOptionActive
            ]}
            onPress={() => updateSettings({ privacyLevel: ReputationPrivacyLevel.PUBLIC })}
            disabled={saving}
          >
            <View style={styles.privacyOptionContent}>
              <Text style={styles.privacyOptionIcon}>🌍</Text>
              <View style={styles.privacyOptionInfo}>
                <Text style={styles.privacyOptionLabel}>Public</Text>
                <Text style={styles.privacyOptionHint}>
                  Anyone can see your reputation and achievements
                </Text>
              </View>
            </View>
            {settings.privacyLevel === ReputationPrivacyLevel.PUBLIC && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.privacyOption,
              settings.privacyLevel === ReputationPrivacyLevel.FRIENDS_ONLY && styles.privacyOptionActive
            ]}
            onPress={() => updateSettings({ privacyLevel: ReputationPrivacyLevel.FRIENDS_ONLY })}
            disabled={saving}
          >
            <View style={styles.privacyOptionContent}>
              <Text style={styles.privacyOptionIcon}>👥</Text>
              <View style={styles.privacyOptionInfo}>
                <Text style={styles.privacyOptionLabel}>Friends Only</Text>
                <Text style={styles.privacyOptionHint}>
                  Only your connections can see your reputation
                </Text>
              </View>
            </View>
            {settings.privacyLevel === ReputationPrivacyLevel.FRIENDS_ONLY && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.privacyOption,
              settings.privacyLevel === ReputationPrivacyLevel.PRIVATE && styles.privacyOptionActive
            ]}
            onPress={() => updateSettings({ privacyLevel: ReputationPrivacyLevel.PRIVATE })}
            disabled={saving}
          >
            <View style={styles.privacyOptionContent}>
              <Text style={styles.privacyOptionIcon}>🔒</Text>
              <View style={styles.privacyOptionInfo}>
                <Text style={styles.privacyOptionLabel}>Private</Text>
                <Text style={styles.privacyOptionHint}>
                  Keep your reputation information private
                </Text>
              </View>
            </View>
            {settings.privacyLevel === ReputationPrivacyLevel.PRIVATE && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>🔒 What's Always Private</Text>
          <View style={styles.infoList}>
            <Text style={styles.infoItem}>• Safety scores and risk levels</Text>
            <Text style={styles.infoItem}>• Moderation and suspension history</Text>
            <Text style={styles.infoItem}>• Financial transactions and balances</Text>
            <Text style={styles.infoItem}>• Abuse reports and investigations</Text>
            <Text style={styles.infoItem}>• Personal verification details</Text>
          </View>
          <Text style={styles.infoNote}>
            These are never visible to anyone except you and authorized moderators
          </Text>
        </View>

        <View style={styles.philosophySection}>
          <Text style={styles.philosophyTitle}>Reputation Philosophy</Text>
          <Text style={styles.philosophyText}>
            Avalo reputation reflects what value you add to the platform through positive 
            contributions, effort-driven achievements, and community participation.
          </Text>
          <Text style={styles.philosophyText}>
            We never rate people on attractiveness, wealth, popularity, or personal 
            characteristics. Your reputation is built on your actions and accomplishments.
          </Text>
        </View>
      </ScrollView>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  retryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  backButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000'
  },
  content: {
    flex: 1
  },
  section: {
    backgroundColor: '#FFF',
    marginTop: 16,
    padding: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  settingInfo: {
    flex: 1,
    marginRight: 12
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2
  },
  settingHint: {
    fontSize: 13,
    color: '#999'
  },
  privacyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    backgroundColor: '#FFF'
  },
  privacyOptionActive: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF'
  },
  privacyOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  privacyOptionIcon: {
    fontSize: 32,
    marginRight: 12
  },
  privacyOptionInfo: {
    flex: 1
  },
  privacyOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2
  },
  privacyOptionHint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18
  },
  checkmark: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: '700'
  },
  infoSection: {
    backgroundColor: '#FFF3CD',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107'
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 12
  },
  infoList: {
    marginBottom: 12
  },
  infoItem: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 6,
    lineHeight: 20
  },
  infoNote: {
    fontSize: 13,
    color: '#856404',
    fontStyle: 'italic',
    lineHeight: 18
  },
  philosophySection: {
    backgroundColor: '#E3F2FD',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3'
  },
  philosophyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 12
  },
  philosophyText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
    marginBottom: 8
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  savingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600'
  }
});
