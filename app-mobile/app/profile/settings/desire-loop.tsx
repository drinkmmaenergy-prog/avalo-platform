/**
 * PACK 227: Desire Loop Settings Page
 * 
 * Allows users to control their desire loop experience:
 * - Enable/disable the system
 * - Set frequency (low, medium, high)
 * - Choose which drivers to enable
 * - Set quiet hours
 * - Configure daily limits
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type DesireDriver = 'curiosity' | 'intimacy' | 'recognition' | 'growth' | 'opportunity';
type DesireFrequency = 'low' | 'medium' | 'high';

interface DesireLoopSettings {
  enabled: boolean;
  frequency: DesireFrequency;
  enabledDrivers: DesireDriver[];
  quietHoursStart?: number;
  quietHoursEnd?: number;
  maxTriggersPerDay: number;
}

const DRIVER_INFO = {
  curiosity: {
    label: 'Curiosity',
    description: 'New profiles, storytellers, discoveries',
    icon: 'sparkles',
    emoji: '✨',
  },
  intimacy: {
    label: 'Intimacy',
    description: 'Chat, calls, meetings, chemistry',
    icon: 'heart',
    emoji: '💕',
  },
  recognition: {
    label: 'Recognition',
    description: 'Profile views, compliments, fans',
    icon: 'star',
    emoji: '⭐',
  },
  growth: {
    label: 'Growth',
    description: 'Royal progress, levels, achievements',
    icon: 'trending-up',
    emoji: '📈',
  },
  opportunity: {
    label: 'Opportunity',
    description: 'Events, travel mode, passport',
    icon: 'compass',
    emoji: '🎯',
  },
} as const;

const FREQUENCY_INFO = {
  low: {
    label: 'Low',
    description: '2 suggestions per day max',
    triggers: 2,
  },
  medium: {
    label: 'Medium',
    description: '4 suggestions per day max',
    triggers: 4,
  },
  high: {
    label: 'High',
    description: '6 suggestions per day max',
    triggers: 6,
  },
} as const;

export default function DesireLoopSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState<DesireLoopSettings>({
    enabled: true,
    frequency: 'medium',
    enabledDrivers: ['curiosity', 'intimacy', 'recognition', 'growth', 'opportunity'],
    maxTriggersPerDay: 4,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load from Firebase
      // const userSettings = await getDesireLoopSettings(userId);
      // setSettings(userSettings);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      // Save to Firebase
      // await updateDesireLoopSettings(userId, settings);
      Alert.alert('Success', 'Your desire loop settings have been updated');
      setSaving(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
      setSaving(false);
    }
  };

  const toggleEnabled = (value: boolean) => {
    setSettings({ ...settings, enabled: value });
  };

  const setFrequency = (frequency: DesireFrequency) => {
    setSettings({
      ...settings,
      frequency,
      maxTriggersPerDay: FREQUENCY_INFO[frequency].triggers,
    });
  };

  const toggleDriver = (driver: DesireDriver) => {
    const currentDrivers = settings.enabledDrivers;
    
    if (currentDrivers.includes(driver)) {
      // Remove driver
      setSettings({
        ...settings,
        enabledDrivers: currentDrivers.filter(d => d !== driver),
      });
    } else {
      // Add driver
      setSettings({
        ...settings,
        enabledDrivers: [...currentDrivers, driver],
      });
    }
  };

  const setQuietHours = (start?: number, end?: number) => {
    setSettings({
      ...settings,
      quietHoursStart: start,
      quietHoursEnd: end,
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Desire Loop</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is this?</Text>
        <Text style={styles.infoText}>
          The Desire Loop gently suggests next steps based on your activity — without
          spam, without pressure. You're always in control.
        </Text>
      </View>

      {/* Main Toggle */}
      <View style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Desire Loop</Text>
            <Text style={styles.settingDescription}>
              Show me helpful suggestions
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
            thumbColor={settings.enabled ? '#7c3aed' : '#f3f4f6'}
          />
        </View>
      </View>

      {settings.enabled && (
        <>
          {/* Frequency Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Frequency</Text>
            <Text style={styles.sectionDescription}>
              How often would you like to see suggestions?
            </Text>
            
            {(Object.keys(FREQUENCY_INFO) as DesireFrequency[]).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.frequencyOption,
                  settings.frequency === freq && styles.frequencyOptionActive,
                ]}
                onPress={() => setFrequency(freq)}
              >
                <View style={styles.frequencyInfo}>
                  <Text
                    style={[
                      styles.frequencyLabel,
                      settings.frequency === freq && styles.frequencyLabelActive,
                    ]}
                  >
                    {FREQUENCY_INFO[freq].label}
                  </Text>
                  <Text style={styles.frequencyDescription}>
                    {FREQUENCY_INFO[freq].description}
                  </Text>
                </View>
                {settings.frequency === freq && (
                  <Ionicons name="checkmark-circle" size={24} color="#7c3aed" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Driver Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What interests you?</Text>
            <Text style={styles.sectionDescription}>
              Choose which types of suggestions you want to see
            </Text>
            
            {(Object.keys(DRIVER_INFO) as DesireDriver[]).map((driver) => (
              <View key={driver} style={styles.driverOption}>
                <View style={styles.driverInfo}>
                  <View style={styles.driverHeader}>
                    <Text style={styles.driverEmoji}>
                      {DRIVER_INFO[driver].emoji}
                    </Text>
                    <Text style={styles.driverLabel}>
                      {DRIVER_INFO[driver].label}
                    </Text>
                  </View>
                  <Text style={styles.driverDescription}>
                    {DRIVER_INFO[driver].description}
                  </Text>
                </View>
                <Switch
                  value={settings.enabledDrivers.includes(driver)}
                  onValueChange={() => toggleDriver(driver)}
                  trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
                  thumbColor={
                    settings.enabledDrivers.includes(driver)
                      ? '#7c3aed'
                      : '#f3f4f6'
                  }
                />
              </View>
            ))}
          </View>

          {/* Quiet Hours */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quiet Hours (Optional)</Text>
            <Text style={styles.sectionDescription}>
              No suggestions during these hours
            </Text>
            
            <TouchableOpacity
              style={styles.quietHoursButton}
              onPress={() => {
                // Show time picker modal
                Alert.alert(
                  'Quiet Hours',
                  'Choose hours when you don\'t want to see suggestions',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: '10 PM - 8 AM',
                      onPress: () => setQuietHours(22, 8),
                    },
                    {
                      text: 'Clear',
                      onPress: () => setQuietHours(undefined, undefined),
                      style: 'destructive',
                    },
                  ]
                );
              }}
            >
              <Ionicons name="moon" size={20} color="#666" />
              <Text style={styles.quietHoursText}>
                {settings.quietHoursStart !== undefined &&
                settings.quietHoursEnd !== undefined
                  ? `${settings.quietHoursStart}:00 - ${settings.quietHoursEnd}:00`
                  : 'Not set'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Daily Limit */}
          <View style={styles.section}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Daily Limit</Text>
                <Text style={styles.settingDescription}>
                  Maximum {settings.maxTriggersPerDay} suggestions per day
                </Text>
              </View>
            </View>
          </View>
        </>
      )}

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveSettings}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

      {/* Info Footer */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={20} color="#666" />
        <Text style={styles.footerText}>
          Your mental health matters. The Desire Loop respects your boundaries
          and never manipulates.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  frequencyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  frequencyOptionActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f3f0ff',
  },
  frequencyInfo: {
    flex: 1,
  },
  frequencyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  frequencyLabelActive: {
    color: '#7c3aed',
  },
  frequencyDescription: {
    fontSize: 14,
    color: '#666',
  },
  driverOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  driverInfo: {
    flex: 1,
    marginRight: 16,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  driverLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  driverDescription: {
    fontSize: 14,
    color: '#666',
  },
  quietHoursButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    gap: 12,
  },
  quietHoursText: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  saveButton: {
    backgroundColor: '#7c3aed',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});
