/**
 * PACK 144 - Royal Club Settings Panel
 * Customize Royal Club experience and privacy settings
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";

interface RoyalSettings {
  userId: string;
  showBadgeInProfile: boolean;
  showLevelInChats: boolean;
  notifyMissionUpdates: boolean;
  notifyLevelUp: boolean;
  notifyNewPerks: boolean;
  activeUiSkin?: string;
  activeProfileTheme?: string;
}

export default function RoyalClubSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<RoyalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/settings`,
        {
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof RoyalSettings, value: any) => {
    if (!settings) return;

    const updatedSettings = { ...settings, [key]: value };
    setSettings(updatedSettings);

    try {
      setSaving(true);
      const user = auth.currentUser;
      if (!user) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/settings`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ [key]: value })
        }
      );

      if (!response.ok) {
        setSettings(settings);
        Alert.alert('Error', 'Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      setSettings(settings);
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCustomizations = () => {
    Alert.alert(
      'Reset Customizations',
      'This will reset all your active UI customizations. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await updateSetting('activeUiSkin', undefined);
            await updateSetting('activeProfileTheme', undefined);
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Royal Settings</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!settings) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Royal Settings</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Settings not available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Royal Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Display</Text>
          <Text style={styles.sectionDescription}>
            Control how your Royal Club status is displayed
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Ionicons name="shield" size={20} color="#9B59B6" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Show Badge in Profile</Text>
                <Text style={styles.settingSubtitle}>
                  Display your Royal Club level on your profile
                </Text>
              </View>
            </View>
            <Switch
              value={settings.showBadgeInProfile}
              onValueChange={(value) => updateSetting('showBadgeInProfile', value)}
              disabled={saving}
              trackColor={{ false: '#D0D0D0', true: '#9B59B6' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Ionicons name="chatbubbles" size={20} color="#3498DB" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Show Level in Chats</Text>
                <Text style={styles.settingSubtitle}>
                  Display your level badge in chat conversations
                </Text>
              </View>
            </View>
            <Switch
              value={settings.showLevelInChats}
              onValueChange={(value) => updateSetting('showLevelInChats', value)}
              disabled={saving}
              trackColor={{ false: '#D0D0D0', true: '#3498DB' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#95A5A6" />
            <Text style={styles.infoText}>
              Your Royal Club status is never shown in discovery, matching, or competitive contexts to prevent elitism.
            </Text>
          </View>
        </View>

        {/* Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionDescription}>
            Choose which Royal Club updates you want to receive
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Ionicons name="trophy" size={20} color="#F39C12" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Mission Updates</Text>
                <Text style={styles.settingSubtitle}>
                  Get notified about new missions and completions
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notifyMissionUpdates}
              onValueChange={(value) => updateSetting('notifyMissionUpdates', value)}
              disabled={saving}
              trackColor={{ false: '#D0D0D0', true: '#F39C12' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Ionicons name="arrow-up-circle" size={20} color="#27AE60" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Level Up Notifications</Text>
                <Text style={styles.settingSubtitle}>
                  Celebrate when you reach a new level
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notifyLevelUp}
              onValueChange={(value) => updateSetting('notifyLevelUp', value)}
              disabled={saving}
              trackColor={{ false: '#D0D0D0', true: '#27AE60' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Ionicons name="gift" size={20} color="#E91E63" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>New Perks Available</Text>
                <Text style={styles.settingSubtitle}>
                  Get notified when you unlock new lifestyle perks
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notifyNewPerks}
              onValueChange={(value) => updateSetting('notifyNewPerks', value)}
              disabled={saving}
              trackColor={{ false: '#D0D0D0', true: '#E91E63' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Active Customizations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Customizations</Text>
          <Text style={styles.sectionDescription}>
            Currently applied themes and skins
          </Text>

          <View style={styles.customizationCard}>
            <View style={styles.customizationHeader}>
              <Ionicons name="color-palette" size={24} color="#9B59B6" />
              <Text style={styles.customizationTitle}>UI Skin</Text>
            </View>
            <Text style={styles.customizationValue}>
              {settings.activeUiSkin || 'Default'}
            </Text>
            <TouchableOpacity
              style={styles.customizationButton}
              onPress={() => router.push('/royalclub/perks' as any)}
            >
              <Text style={styles.customizationButtonText}>Change Skin</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.customizationCard}>
            <View style={styles.customizationHeader}>
              <Ionicons name="brush" size={24} color="#E91E63" />
              <Text style={styles.customizationTitle}>Profile Theme</Text>
            </View>
            <Text style={styles.customizationValue}>
              {settings.activeProfileTheme || 'Default'}
            </Text>
            <TouchableOpacity
              style={styles.customizationButton}
              onPress={() => router.push('/royalclub/perks' as any)}
            >
              <Text style={styles.customizationButtonText}>Change Theme</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetCustomizations}
          >
            <Ionicons name="refresh" size={20} color="#E74C3C" />
            <Text style={styles.resetButtonText}>Reset All Customizations</Text>
          </TouchableOpacity>
        </View>

        {/* Information */}
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>Royal Club Guidelines</Text>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
            <Text style={styles.guidelineText}>
              Royal Club is a lifestyle experience, not a performance advantage
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
            <Text style={styles.guidelineText}>
              Your level never affects token pricing or creator revenue splits
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
            <Text style={styles.guidelineText}>
              All perks are purely cosmetic and do not influence discovery or matching
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50'
  },
  scrollView: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32
  },
  emptyText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 20
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  sectionDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 16
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1'
  },
  settingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  settingText: {
    flex: 1
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 2
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 10
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#7F8C8D',
    lineHeight: 18
  },
  customizationCard: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12
  },
  customizationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8
  },
  customizationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50'
  },
  customizationValue: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 12
  },
  customizationButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECF0F1'
  },
  customizationButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9B59B6'
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E74C3C',
    marginTop: 8
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E74C3C'
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 20,
    gap: 12
  },
  infoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18
  }
});
