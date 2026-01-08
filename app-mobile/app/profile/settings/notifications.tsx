/**
 * PACK 169 - Notification Settings Screen
 * User control over notification preferences with ethical safeguards
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface NotificationSettings {
  userId: string;
  globalEnabled: boolean;
  doNotDisturb: boolean;
  dndSchedule?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    days: number[];
  };
  snoozedUntil?: Date;
  snoozeMode?: '24h' | '7d' | '30d';
  categories: {
    [key: string]: {
      enabled: boolean;
      channels: string[];
      digestType: string;
      maxPerDay: number;
    };
  };
  maxNotificationsPerDay: number;
  burnoutProtection: {
    enabled: boolean;
    dailyEngagementLimit: number;
    cooldownPeriod: number;
  };
  frequencyCaps: {
    perHour: number;
    perDay: number;
    perWeek: number;
  };
}

const CATEGORY_LABELS: Record<string, { name: string; description: string }> = {
  content: {
    name: 'Content',
    description: 'New courses, challenges, and posts',
  },
  digital_products: {
    name: 'Products',
    description: 'Product launches and updates',
  },
  events: {
    name: 'Events',
    description: 'Workshops and livestreams',
  },
  progress: {
    name: 'Progress',
    description: 'Achievements and milestones',
  },
  clubs: {
    name: 'Clubs',
    description: 'Community activities',
  },
  messages: {
    name: 'Messages',
    description: 'Chats and calls',
  },
  system: {
    name: 'System',
    description: 'Security and account updates',
  },
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const getSettings = httpsCallable(functions, 'getNotificationSettings');
      const result = await getSettings();
      setSettings(result.data as NotificationSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    if (!settings) return;

    setSaving(true);
    try {
      const updateSettingsFunc = httpsCallable(functions, 'updateNotificationSettings');
      await updateSettingsFunc({ updates });
      setSettings({ ...settings, ...updates });
    } catch (error) {
      console.error('Failed to update settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleGlobal = async (value: boolean) => {
    await updateSettings({ globalEnabled: value });
  };

  const toggleDoNotDisturb = async (value: boolean) => {
    await updateSettings({ doNotDisturb: value });
  };

  const toggleCategory = async (category: string, value: boolean) => {
    if (!settings) return;

    const updatedCategories = {
      ...settings.categories,
      [category]: {
        ...settings.categories[category],
        enabled: value,
      },
    };

    await updateSettings({ categories: updatedCategories });
  };

  const toggleBurnoutProtection = async (value: boolean) => {
    if (!settings) return;

    await updateSettings({
      burnoutProtection: {
        ...settings.burnoutProtection,
        enabled: value,
      },
    });
  };

  const setSnoozeMode = async (duration: '24h' | '7d' | '30d' | null) => {
    try {
      const setSnoozeModeFunc = httpsCallable(functions, 'setSnoozeMode');
      await setSnoozeModeFunc({ duration });
      
      if (duration) {
        const snoozedUntil = new Date();
        switch (duration) {
          case '24h':
            snoozedUntil.setHours(snoozedUntil.getHours() + 24);
            break;
          case '7d':
            snoozedUntil.setDate(snoozedUntil.getDate() + 7);
            break;
          case '30d':
            snoozedUntil.setDate(snoozedUntil.getDate() + 30);
            break;
        }
        setSettings({
          ...settings!,
          snoozeMode: duration,
          snoozedUntil,
        });
      } else {
        setSettings({
          ...settings!,
          snoozeMode: undefined,
          snoozedUntil: undefined,
        });
      }
    } catch (error) {
      console.error('Failed to set snooze mode:', error);
      Alert.alert('Error', 'Failed to set snooze mode');
    }
  };

  const showSnoozeOptions = () => {
    Alert.alert(
      'Snooze Notifications',
      'Pause all non-urgent notifications',
      [
        { text: '24 Hours', onPress: () => setSnoozeMode('24h') },
        { text: '7 Days', onPress: () => setSnoozeMode('7d') },
        { text: '30 Days', onPress: () => setSnoozeMode('30d') },
        { text: 'Cancel Snooze', onPress: () => setSnoozeMode(null), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General Settings</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Notifications</Text>
            <Text style={styles.settingDescription}>
              Master control for all notifications
            </Text>
          </View>
          <Switch
            value={settings.globalEnabled}
            onValueChange={toggleGlobal}
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Do Not Disturb</Text>
            <Text style={styles.settingDescription}>
              Block all non-urgent notifications
            </Text>
          </View>
          <Switch
            value={settings.doNotDisturb}
            onValueChange={toggleDoNotDisturb}
            disabled={saving}
          />
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={showSnoozeOptions}>
          <Text style={styles.actionButtonText}>
            {settings.snoozeMode ? `Snoozed (${settings.snoozeMode})` : 'Snooze Notifications'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Categories</Text>
        <Text style={styles.sectionDescription}>
          Control which types of notifications you receive
        </Text>

        {Object.entries(CATEGORY_LABELS).map(([category, info]) => (
          <View key={category} style={styles.categoryRow}>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryLabel}>{info.name}</Text>
              <Text style={styles.categoryDescription}>{info.description}</Text>
            </View>
            <Switch
              value={settings.categories[category]?.enabled ?? true}
              onValueChange={(value) => toggleCategory(category, value)}
              disabled={saving || !settings.globalEnabled}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Well-being Protection</Text>
        <Text style={styles.sectionDescription}>
          Anti-addiction safeguards for healthy engagement
        </Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Burnout Protection</Text>
            <Text style={styles.settingDescription}>
              Automatically pause notifications after {settings.burnoutProtection.dailyEngagementLimit} minutes of daily engagement
            </Text>
          </View>
          <Switch
            value={settings.burnoutProtection.enabled}
            onValueChange={toggleBurnoutProtection}
            disabled={saving}
          />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Daily Limits</Text>
          <Text style={styles.infoCardText}>
            • Maximum {settings.maxNotificationsPerDay} notifications per day
          </Text>
          <Text style={styles.infoCardText}>
            • Maximum {settings.frequencyCaps.perHour} notifications per hour
          </Text>
          <Text style={styles.infoCardText}>
            • Cooldown period: {settings.burnoutProtection.cooldownPeriod} hours
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More Options</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoCardText}>
            ✓ Reminder management and notification inbox coming soon
          </Text>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#666',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  categoryInfo: {
    flex: 1,
    marginRight: 12,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 12,
    color: '#666',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bottomPadding: {
    height: 40,
  },
});
