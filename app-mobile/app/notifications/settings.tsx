/**
 * PACK 92 — Notification Settings Screen
 * Manage user notification preferences
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationSettings } from "@/hooks/useNotificationSettings";

export default function NotificationSettingsScreen() {
  const {
    settings,
    loading,
    error,
    saving,
    togglePush,
    toggleEmail,
    toggleInApp,
    toggleCategory,
  } = useNotificationSettings();

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (error || !settings) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#dc3545" />
        <Text style={styles.errorText}>
          {error || 'Failed to load settings'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        {/* Delivery Channels */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Channels</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive notifications on your device
                </Text>
              </View>
            </View>
            <Switch
              value={settings.pushEnabled}
              onValueChange={togglePush}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="mail-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Email Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive notifications via email
                </Text>
              </View>
            </View>
            <Switch
              value={settings.emailEnabled}
              onValueChange={toggleEmail}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="phone-portrait-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>In-App Notifications</Text>
                <Text style={styles.settingDescription}>
                  Show notifications in the app
                </Text>
              </View>
            </View>
            <Switch
              value={settings.inAppEnabled}
              onValueChange={toggleInApp}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>
        </View>

        {/* Notification Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Types</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="cash-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Earnings</Text>
                <Text style={styles.settingDescription}>
                  When you earn tokens from gifts, stories, etc.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.categories.EARNINGS}
              onValueChange={() => toggleCategory('EARNINGS')}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="wallet-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Payouts</Text>
                <Text style={styles.settingDescription}>
                  Updates on your payout requests
                </Text>
              </View>
            </View>
            <Switch
              value={settings.categories.PAYOUT}
              onValueChange={() => toggleCategory('PAYOUT')}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="megaphone-outline" size={24} color="#667eea" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Marketing</Text>
                <Text style={styles.settingDescription}>
                  Tips, features, and promotional content
                </Text>
              </View>
            </View>
            <Switch
              value={settings.categories.MARKETING}
              onValueChange={() => toggleCategory('MARKETING')}
              disabled={saving}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          {/* Mandatory Categories */}
          <View style={[styles.settingItem, styles.mandatoryItem]}>
            <View style={styles.settingLeft}>
              <Ionicons name="heart-outline" size={24} color="#999" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Safety Alerts</Text>
                <Text style={styles.settingDescription}>
                  Critical safety notifications (required)
                </Text>
              </View>
            </View>
            <Switch
              value={settings.categories.SAFETY}
              disabled={true}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>

          <View style={[styles.settingItem, styles.mandatoryItem]}>
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={24} color="#999" />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Legal Updates</Text>
                <Text style={styles.settingDescription}>
                  Terms and policy changes (required)
                </Text>
              </View>
            </View>
            <Switch
              value={settings.categories.LEGAL}
              disabled={true}
              trackColor={{ false: '#ccc', true: '#667eea' }}
            />
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#667eea" />
          <Text style={styles.infoText}>
            Some notifications like safety alerts and legal updates cannot be
            disabled due to security and compliance requirements.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  mandatoryItem: {
    opacity: 0.6,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f8f9ff',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 24,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    marginTop: 16,
    textAlign: 'center',
  },
});
