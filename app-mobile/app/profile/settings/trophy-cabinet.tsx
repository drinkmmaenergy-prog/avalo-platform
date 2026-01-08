/**
 * Trophy Cabinet Settings Screen
 * 
 * User preferences for Trophy Cabinet system:
 * - Enable/disable trophy system
 * - Control trophy visibility on profile
 * - View trophy statistics
 * 
 * PACK 235 - Trophy Cabinet Settings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { db, functions } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from "@/hooks/useAuth"; // Assumed hook

interface TrophySettings {
  enabled: boolean;
  showOnProfile: boolean;
  updatedAt: any;
}

export default function TrophyCabinetSettingsScreen() {
  const { user } = useAuth(); // Get current user
  const [settings, setSettings] = useState<TrophySettings>({
    enabled: true,
    showOnProfile: false,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    if (!user?.uid) return;

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'trophies');
    
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as TrophySettings);
      } else {
        // Default settings if none exist
        setSettings({
          enabled: true,
          showOnProfile: false,
          updatedAt: null,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleToggleSystem = async (enabled: boolean) => {
    if (!user?.uid) return;

    // Show confirmation dialog when disabling
    if (!enabled) {
      Alert.alert(
        'Disable Trophy Cabinet?',
        'Your trophies will be preserved, but no new trophies will be earned. You can re-enable this anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => updateSystemStatus(enabled),
          },
        ]
      );
    } else {
      updateSystemStatus(enabled);
    }
  };

  const updateSystemStatus = async (enabled: boolean) => {
    setSaving(true);
    
    try {
      const toggleSystem = httpsCallable(functions, 'toggleTrophySystem');
      await toggleSystem({ enabled });
      
      // Update local state
      setSettings(prev => ({ ...prev, enabled }));
    } catch (error) {
      console.error('Error toggling trophy system:', error);
      Alert.alert('Error', 'Failed to update settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProfileVisibility = async (show: boolean) => {
    if (!user?.uid) return;

    // Show info dialog about visibility
    if (show) {
      Alert.alert(
        'Show Trophies on Profile?',
        'Your trophy count will be visible to other users. Your partner must also enable this for trophies to appear.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Show',
            onPress: () => updateProfileVisibility(show),
          },
        ]
      );
    } else {
      updateProfileVisibility(show);
    }
  };

  const updateProfileVisibility = async (show: boolean) => {
    if (!user?.uid) return;
    
    setSaving(true);
    
    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'trophies');
      await setDoc(settingsRef, {
        showOnProfile: show,
        updatedAt: new Date(),
      }, { merge: true });
      
      setSettings(prev => ({ ...prev, showOnProfile: show }));
    } catch (error) {
      console.error('Error updating profile visibility:', error);
      Alert.alert('Error', 'Failed to update settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏆 Trophy Cabinet Settings</Text>
        <Text style={styles.headerSubtitle}>
          Manage your trophy preferences and visibility
        </Text>
      </View>

      {/* Main Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System</Text>
        
        <View style={styles.settingCard}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Enable Trophy Cabinet</Text>
            <Text style={styles.settingDescription}>
              Automatically earn trophies for achievements with your partner
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={handleToggleSystem}
            disabled={saving}
            trackColor={{ false: '#D1D5DB', true: '#10B981' }}
            thumbColor={settings.enabled ? '#FFFFFF' : '#F3F4F6'}
          />
        </View>

        {!settings.enabled && (
          <View style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              Trophy Cabinet is disabled. Your existing trophies are preserved, but new
              achievements will not be tracked.
            </Text>
          </View>
        )}
      </View>

      {/* Visibility Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visibility</Text>
        
        <View style={styles.settingCard}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Show on Profile</Text>
            <Text style={styles.settingDescription}>
              Display trophy count on your public profile (requires partner to enable too)
            </Text>
          </View>
          <Switch
            value={settings.showOnProfile}
            onValueChange={handleToggleProfileVisibility}
            disabled={saving || !settings.enabled}
            trackColor={{ false: '#D1D5DB', true: '#10B981' }}
            thumbColor={settings.showOnProfile ? '#FFFFFF' : '#F3F4F6'}
          />
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Trophy Cabinet</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🎯 How It Works</Text>
          <Text style={styles.infoText}>
            The Trophy Cabinet automatically tracks meaningful milestones in your
            relationship - from meetings and events to chat milestones and celebrations.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>💎 Cosmetic Rewards</Text>
          <Text style={styles.infoText}>
            Unlock exclusive visual enhancements as you earn more trophies together.
            These are purely cosmetic and don't affect pricing or provide discounts.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔒 Privacy & Safety</Text>
          <Text style={styles.infoText}>
            Trophies are always private unless you enable profile visibility. The system
            automatically pauses during Sleep Mode or Breakup Recovery.
          </Text>
        </View>
      </View>

      {/* Trophy Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trophy Categories</Text>
        
        <View style={styles.categoryGrid}>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>🤝</Text>
            <Text style={styles.categoryLabel}>Meetings</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>🎉</Text>
            <Text style={styles.categoryLabel}>Events</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>✈️</Text>
            <Text style={styles.categoryLabel}>Travel</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>💬</Text>
            <Text style={styles.categoryLabel}>Chat</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>📞</Text>
            <Text style={styles.categoryLabel}>Calls</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>🎊</Text>
            <Text style={styles.categoryLabel}>Celebrations</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>🎁</Text>
            <Text style={styles.categoryLabel}>Gifts</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>🏆</Text>
            <Text style={styles.categoryLabel}>Challenges</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>👑</Text>
            <Text style={styles.categoryLabel}>Premium</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryIcon}>📸</Text>
            <Text style={styles.categoryLabel}>Photos</Text>
          </View>
        </View>
      </View>

      {/* Footer Notice */}
      <View style={styles.footerCard}>
        <Text style={styles.footerText}>
          Trophy Cabinet reinforces your emotional connection without affecting
          tokenomics or pricing. All rewards are cosmetic enhancements only.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    textAlign: 'center',
    padding: 24,
    color: '#7F8C8D',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#FFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7F8C8D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  categoryLabel: {
    fontSize: 11,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  footerCard: {
    backgroundColor: '#EBF5FF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  footerText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
});
