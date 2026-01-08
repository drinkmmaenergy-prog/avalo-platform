/**
 * PACK 174 - Spending Safety Settings
 * Configure spending limits and fraud alerts
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { auth } from "@/lib/firebase";

interface SafetySettings {
  enabled: boolean;
  dailySpendingLimit?: number;
  requireConfirmationOver?: number;
  blockSuspiciousRequests: boolean;
  alertOnUnusualActivity: boolean;
}

export default function SpendingSafetySettings() {
  const user = auth.currentUser;
  const [settings, setSettings] = useState<SafetySettings>({
    enabled: true,
    dailySpendingLimit: 500,
    requireConfirmationOver: 100,
    blockSuspiciousRequests: true,
    alertOnUnusualActivity: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/fraud/spending-safety-settings', {
        headers: { Authorization: `Bearer ${await user?.getIdToken()}` },
      });
      const data = await response.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/fraud/spending-safety-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user?.getIdToken()}`,
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        Alert.alert('Success', 'Spending safety settings saved');
      } else {
        Alert.alert('Error', 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spending Safety</Text>
        <Text style={styles.subtitle}>
          Protect yourself from fraud and unauthorized spending
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Enable Spending Safety</Text>
            <Text style={styles.settingDescription}>
              Activate all fraud prevention features
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(value) => setSettings({ ...settings, enabled: value })}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending Limits</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Daily Spending Limit ($)</Text>
          <TextInput
            style={styles.input}
            value={settings.dailySpendingLimit?.toString() || ''}
            onChangeText={(value) =>
              setSettings({ ...settings, dailySpendingLimit: parseInt(value) || undefined })
            }
            keyboardType="numeric"
            placeholder="e.g., 500"
          />
          <Text style={styles.inputHelp}>
            Maximum amount you can spend per day. Leave empty for no limit.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Require Confirmation Over ($)</Text>
          <TextInput
            style={styles.input}
            value={settings.requireConfirmationOver?.toString() || ''}
            onChangeText={(value) =>
              setSettings({ ...settings, requireConfirmationOver: parseInt(value) || undefined })
            }
            keyboardType="numeric"
            placeholder="e.g., 100"
          />
          <Text style={styles.inputHelp}>
            Require additional confirmation for transactions above this amount.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security Options</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Block Suspicious Requests</Text>
            <Text style={styles.settingDescription}>
              Automatically block known fraud patterns
            </Text>
          </View>
          <Switch
            value={settings.blockSuspiciousRequests}
            onValueChange={(value) =>
              setSettings({ ...settings, blockSuspiciousRequests: value })
            }
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Alert on Unusual Activity</Text>
            <Text style={styles.settingDescription}>
              Get notified about suspicious transactions
            </Text>
          </View>
          <Switch
            value={settings.alertOnUnusualActivity}
            onValueChange={(value) =>
              setSettings({ ...settings, alertOnUnusualActivity: value })
            }
          />
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>🛡️</Text>
        <Text style={styles.infoText}>
          These settings help protect you from unauthorized spending, scams, and fraud.
          We recommend keeping all protections enabled.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveSettings}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  section: {
    margin: 15,
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666666',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  inputHelp: {
    fontSize: 12,
    color: '#666666',
    marginTop: 5,
  },
  infoBox: {
    margin: 15,
    padding: 15,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  saveButton: {
    margin: 15,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
