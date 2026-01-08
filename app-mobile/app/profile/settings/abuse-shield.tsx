/**
 * PACK 173 — Abuse Shield Settings
 * Creator protection controls
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface ShieldSettings {
  enabled: boolean;
  autoFilterInsults: boolean;
  autoHideToxicComments: boolean;
  toxicCommentThreshold: number;
  allowOnlyFollowersWhenRaid: boolean;
  rateLimitDuringSpikes: boolean;
  blockFreshAccounts: boolean;
  freshAccountAgeDays: number;
  autoHideFirstNToxic: number;
  requireApprovalForNegative: boolean;
  currentlyUnderRaid: boolean;
  lastRaidDetectedAt?: any;
}

export default function AbuseShieldScreen() {
  const [settings, setSettings] = useState<ShieldSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const callable = httpsCallable(functions, 'getCreatorShieldSettings');
      const result = await callable();
      setSettings(result.data as ShieldSettings);
    } catch (error) {
      console.error('Error loading shield settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<ShieldSettings>) => {
    if (!settings) return;

    setSaving(true);
    try {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      const callable = httpsCallable(functions, 'updateCreatorShieldSettings');
      await callable(updates);
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to save settings');
      // Revert on error
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const toggleShield = async (enabled: boolean) => {
    if (enabled) {
      Alert.alert(
        'Enable Abuse Shield',
        'This will activate automatic protection against harassment, comment raids, and coordinated attacks. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => updateSettings({ enabled: true }) },
        ]
      );
    } else {
      updateSettings({ enabled: false });
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Abuse Shield',
            headerBackTitle: 'Settings',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Abuse Shield',
            headerBackTitle: 'Settings',
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load settings</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSettings}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Abuse Shield',
          headerBackTitle: 'Settings',
        }}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Shield Status */}
        {settings.currentlyUnderRaid && (
          <View style={styles.raidAlert}>
            <Ionicons name="shield-outline" size={24} color="#FF3B30" />
            <View style={styles.raidAlertText}>
              <Text style={styles.raidAlertTitle}>Raid Protection Active</Text>
              <Text style={styles.raidAlertSubtitle}>
                We detected unusual activity and enabled protection
              </Text>
            </View>
          </View>
        )}

        {/* Master Toggle */}
        <View style={styles.section}>
          <View style={styles.masterToggle}>
            <View style={styles.masterToggleInfo}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name="shield-checkmark"
                  size={32}
                  color={settings.enabled ? '#34C759' : '#8E8E93'}
                />
              </View>
              <View>
                <Text style={styles.masterToggleTitle}>Abuse Shield</Text>
                <Text style={styles.masterToggleSubtitle}>
                  {settings.enabled ? 'Protection Active' : 'Protection Disabled'}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={toggleShield}
              disabled={saving}
            />
          </View>
        </View>

        {/* Auto-Filter Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Automatic Filtering</Text>

          <SettingRow
            icon="filter-outline"
            title="Auto-Filter Insults"
            subtitle="Automatically hide insulting comments"
            value={settings.autoFilterInsults}
            onValueChange={(v) => updateSettings({ autoFilterInsults: v })}
            disabled={!settings.enabled || saving}
          />

          <SettingRow
            icon="eye-off-outline"
            title="Hide Toxic Comments"
            subtitle="Hide comments with high toxicity scores"
            value={settings.autoHideToxicComments}
            onValueChange={(v) => updateSettings({ autoHideToxicComments: v })}
            disabled={!settings.enabled || saving}
          />

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Toxicity Threshold</Text>
            <Text style={styles.sliderValue}>{settings.toxicCommentThreshold}%</Text>
          </View>
        </View>

        {/* Raid Protection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Raid Protection</Text>

          <SettingRow
            icon="people-outline"
            title="Followers Only During Raids"
            subtitle="Only allow followers to comment when raid detected"
            value={settings.allowOnlyFollowersWhenRaid}
            onValueChange={(v) => updateSettings({ allowOnlyFollowersWhenRaid: v })}
            disabled={!settings.enabled || saving}
          />

          <SettingRow
            icon="speedometer-outline"
            title="Rate Limit During Spikes"
            subtitle="Slow down comments during high activity"
            value={settings.rateLimitDuringSpikes}
            onValueChange={(v) => updateSettings({ rateLimitDuringSpikes: v })}
            disabled={!settings.enabled || saving}
          />

          <SettingRow
            icon="close-circle-outline"
            title="Block Fresh Accounts"
            subtitle={`Block accounts under ${settings.freshAccountAgeDays} days old`}
            value={settings.blockFreshAccounts}
            onValueChange={(v) => updateSettings({ blockFreshAccounts: v })}
            disabled={!settings.enabled || saving}
          />
        </View>

        {/* Comment Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comment Management</Text>

          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.infoText}>
              Auto-hide first {settings.autoHideFirstNToxic} toxic comments per post
            </Text>
          </View>

          <SettingRow
            icon="checkmark-circle-outline"
            title="Require Approval"
            subtitle="Manually approve negative feedback"
            value={settings.requireApprovalForNegative}
            onValueChange={(v) => updateSettings({ requireApprovalForNegative: v })}
            disabled={!settings.enabled || saving}
          />
        </View>

        {/* View Cases */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.viewCasesButton}
            onPress={() => router.push('/profile/settings/safety-privacy' as any)}
          >
            <View style={styles.viewCasesContent}>
              <Ionicons name="document-text-outline" size={24} color="#007AFF" />
              <View style={styles.viewCasesText}>
                <Text style={styles.viewCasesTitle}>View Abuse Cases</Text>
                <Text style={styles.viewCasesSubtitle}>
                  See reports and protection history
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Help */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>About Abuse Shield</Text>
          <Text style={styles.helpText}>
            Abuse Shield protects you from harassment, bullying, defamation, and
            coordinated attacks. It automatically detects patterns of abuse and applies
            protective measures without requiring your action.
          </Text>
          <Text style={styles.helpText}>
            • Harassment and insults are automatically hidden{'\n'}
            • Comment raids are detected and throttled{'\n'}
            • Defamatory claims require evidence{'\n'}
            • Trauma exploitation is strictly blocked{'\n'}
            • Repeat offenders face escalating sanctions
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

interface SettingRowProps {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={24} color="#007AFF" />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, disabled && styles.disabledText]}>
          {title}
        </Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scroll: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  raidAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  raidAlertText: {
    marginLeft: 12,
    flex: 1,
  },
  raidAlertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
  },
  raidAlertSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  masterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  masterToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: 16,
  },
  masterToggleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  masterToggleSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  settingIcon: {
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  disabledText: {
    color: '#C7C7CC',
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sliderLabel: {
    fontSize: 16,
    color: '#000000',
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F2F2F7',
  },
  infoText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
    flex: 1,
  },
  viewCasesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  viewCasesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  viewCasesText: {
    marginLeft: 12,
    flex: 1,
  },
  viewCasesTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  viewCasesSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  helpSection: {
    padding: 16,
    marginTop: 8,
  },
  helpTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  helpText: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 22,
    marginBottom: 12,
  },
});
