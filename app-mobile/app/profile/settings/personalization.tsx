/**
 * PACK 134 — Personalization Settings Screen
 * 
 * Allows users to control personalization level and data usage
 * Full transparency about what data is collected and why
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

interface PersonalizationSettings {
  userId: string;
  personalizationLevel: 'FULL' | 'MODERATE' | 'MINIMAL' | 'OFF';
  allowTimeOfDay: boolean;
  allowInterestTracking: boolean;
  allowBehaviorAnalysis: boolean;
  dataRetentionDays: number;
  updatedAt: any;
}

interface PersonalizationDashboard {
  userId: string;
  topInterests: Array<{ category: string; score: number }>;
  timeOfDayPattern: string;
  dataPointsUsed: number;
  lastUpdated: any;
  dataRetentionInfo: string;
  optOutAvailable: boolean;
}

export default function PersonalizationSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PersonalizationSettings | null>(null);
  const [dashboard, setDashboard] = useState<PersonalizationDashboard | null>(null);

  useEffect(() => {
    loadSettings();
    loadDashboard();
  }, []);

  const loadSettings = async () => {
    try {
      const getSettings = httpsCallable<{}, PersonalizationSettings>(
        functions,
        'getPersonalizationSettings'
      );
      const result = await getSettings({});
      setSettings(result.data);
    } catch (error) {
      console.error('Failed to load personalization settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const getDashboard = httpsCallable<{}, PersonalizationDashboard>(
        functions,
        'getPersonalizationDashboard'
      );
      const result = await getDashboard({});
      setDashboard(result.data);
    } catch (error) {
      console.error('Failed to load personalization dashboard:', error);
    }
  };

  const updateSettings = async (updates: Partial<PersonalizationSettings>) => {
    if (!settings) return;

    setSaving(true);
    try {
      const updateSettingsFn = httpsCallable<
        Partial<PersonalizationSettings>,
        PersonalizationSettings
      >(functions, 'updatePersonalizationSettings');

      const result = await updateSettingsFn(updates);
      setSettings(result.data);
      Alert.alert('Success', 'Settings updated');
    } catch (error) {
      console.error('Failed to update settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePersonalizationLevelChange = (
    level: 'FULL' | 'MODERATE' | 'MINIMAL' | 'OFF'
  ) => {
    Alert.alert(
      'Change Personalization Level',
      getPersonalizationLevelDescription(level),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateSettings({ personalizationLevel: level }),
        },
      ]
    );
  };

  const getPersonalizationLevelDescription = (level: string): string => {
    switch (level) {
      case 'FULL':
        return 'Full personalization with all features enabled. Best user experience.';
      case 'MODERATE':
        return 'Balanced personalization. Uses interests and time patterns without detailed behavior tracking.';
      case 'MINIMAL':
        return 'Basic personalization. Only uses explicit follows and likes.';
      case 'OFF':
        return 'No personalization. You will see chronological content only.';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personalization</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personalization</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Failed to load settings</Text>
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
        <Text style={styles.headerTitle}>Personalization</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color="#007AFF" />
          <Text style={styles.infoBannerText}>
            Control how we personalize your experience. Your data stays private and secure.
          </Text>
        </View>

        {/* Current Level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalization Level</Text>
          <View style={styles.levelSelector}>
            {(['FULL', 'MODERATE', 'MINIMAL', 'OFF'] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.levelOption,
                  settings.personalizationLevel === level && styles.levelOptionActive,
                ]}
                onPress={() => handlePersonalizationLevelChange(level)}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.levelOptionText,
                    settings.personalizationLevel === level && styles.levelOptionTextActive,
                  ]}
                >
                  {level.charAt(0) + level.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.levelDescription}>
            {getPersonalizationLevelDescription(settings.personalizationLevel)}
          </Text>
        </View>

        {/* Detailed Controls */}
        {settings.personalizationLevel !== 'OFF' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personalization Features</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Interest Tracking</Text>
                  <Text style={styles.settingDescription}>
                    Learn from what you like and view
                  </Text>
                </View>
                <Switch
                  value={settings.allowInterestTracking}
                  onValueChange={(value) =>
                    updateSettings({ allowInterestTracking: value })
                  }
                  disabled={saving}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Time-of-Day Patterns</Text>
                  <Text style={styles.settingDescription}>
                    Show relevant content based on when you're active
                  </Text>
                </View>
                <Switch
                  value={settings.allowTimeOfDay}
                  onValueChange={(value) => updateSettings({ allowTimeOfDay: value })}
                  disabled={saving}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Behavior Analysis</Text>
                  <Text style={styles.settingDescription}>
                    Improve recommendations from your interactions
                  </Text>
                </View>
                <Switch
                  value={settings.allowBehaviorAnalysis}
                  onValueChange={(value) =>
                    updateSettings({ allowBehaviorAnalysis: value })
                  }
                  disabled={saving}
                />
              </View>
            </View>

            {/* Your Data */}
            {dashboard && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Personalization Data</Text>

                {dashboard.topInterests.length > 0 && (
                  <View style={styles.dataCard}>
                    <Text style={styles.dataCardTitle}>Top Interests</Text>
                    <View style={styles.interestList}>
                      {dashboard.topInterests.slice(0, 5).map((interest, index) => (
                        <View key={index} style={styles.interestItem}>
                          <Text style={styles.interestName}>
                            {interest.category.replace(/_/g, ' ')}
                          </Text>
                          <View style={styles.interestBar}>
                            <View
                              style={[
                                styles.interestBarFill,
                                { width: `${interest.score * 100}%` },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {dashboard.timeOfDayPattern && (
                  <View style={styles.dataCard}>
                    <Text style={styles.dataCardTitle}>Activity Pattern</Text>
                    <Text style={styles.dataCardText}>{dashboard.timeOfDayPattern}</Text>
                  </View>
                )}

                <View style={styles.dataCard}>
                  <Text style={styles.dataCardTitle}>Data Usage</Text>
                  <Text style={styles.dataCardText}>
                    {dashboard.dataPointsUsed} interactions analyzed
                  </Text>
                  <Text style={styles.dataCardSubtext}>{dashboard.dataRetentionInfo}</Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Privacy Guarantees */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Guarantees</Text>
          <View style={styles.guaranteeBox}>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
              <Text style={styles.guaranteeText}>No appearance or beauty bias</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
              <Text style={styles.guaranteeText}>No demographic profiling</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
              <Text style={styles.guaranteeText}>No monetization influence</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
              <Text style={styles.guaranteeText}>Full transparency</Text>
            </View>
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
    backgroundColor: '#E3F2FD',
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#007AFF',
    lineHeight: 20,
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
    marginBottom: 16,
  },
  levelSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  levelOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  levelOptionActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  levelOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  levelOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  levelDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    paddingHorizontal: 16,
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
  dataCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  dataCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dataCardText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  dataCardSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  interestList: {
    marginTop: 8,
  },
  interestItem: {
    marginBottom: 12,
  },
  interestName: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  interestBar: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  interestBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  guaranteeBox: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#E8F8F5',
    borderRadius: 8,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  guaranteeText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#27AE60',
    fontWeight: '500',
  },
});
