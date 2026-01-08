/**
 * PACK 234: Anniversary System Settings
 * User preferences for anniversary celebrations
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { db, functions } from "@/lib/firebase";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from "@/hooks/useAuth";

export default function AnniversarySettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'anniversary');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        setEnabled(settingsDoc.data().enabled !== false);
      }
    } catch (error) {
      console.error('Error loading anniversary settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (!user) return;

    try {
      setSaving(true);

      // Call Cloud Function to toggle
      const toggleFunction = httpsCallable(functions, 'toggleAnniversarySystem');
      await toggleFunction({ enabled: value });

      setEnabled(value);

      Alert.alert(
        'Settings Updated',
        value
          ? 'Anniversary celebrations are now enabled. You\'ll receive notifications for milestones.'
          : 'Anniversary celebrations disabled. You can re-enable them anytime.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error toggling anniversary system:', error);
      Alert.alert('Error', 'Failed to update settings. Please try again.');
      // Revert toggle
      setEnabled(!value);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Anniversary System</Text>
      </View>

      {/* Main Toggle */}
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Enable Anniversary Celebrations</Text>
            <Text style={styles.toggleDescription}>
              Receive beautiful notifications when you reach relationship milestones
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            disabled={saving}
            trackColor={{ false: '#D1D5DB', true: '#FFB3C6' }}
            thumbColor={enabled ? '#C44569' : '#F3F4F6'}
          />
        </View>
      </View>

      {/* What You'll Receive */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What You'll Receive</Text>
        
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🎉</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Anniversary Notifications</Text>
            <Text style={styles.featureDescription}>
              Beautiful reminders on 7, 30, 60, 90, 180, and 365-day milestones
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>💫</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Special Chat Themes</Text>
            <Text style={styles.featureDescription}>
              24-hour exclusive themes during anniversary celebrations
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🏆</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Streak Rewards</Text>
            <Text style={styles.featureDescription}>
              Unlock cosmetic rewards by engaging during anniversary windows
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>📸</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Memory Log Highlights</Text>
            <Text style={styles.featureDescription}>
              Automatic frames for special moments you've captured together
            </Text>
          </View>
        </View>
      </View>

      {/* Anniversary Types */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracked Milestones</Text>
        
        <View style={styles.milestoneCard}>
          <Text style={styles.milestoneIcon}>💞</Text>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>Match Anniversary</Text>
            <Text style={styles.milestoneDescription}>
              Celebrates the day you first connected on Avalo
            </Text>
          </View>
        </View>

        <View style={styles.milestoneCard}>
          <Text style={styles.milestoneIcon}>💬</Text>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>First Chat Anniversary</Text>
            <Text style={styles.milestoneDescription}>
              Commemorates your first message exchange
            </Text>
          </View>
        </View>

        <View style={styles.milestoneCard}>
          <Text style={styles.milestoneIcon}>📞</Text>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>First Call Anniversary</Text>
            <Text style={styles.milestoneDescription}>
              Marks when you first heard each other's voice
            </Text>
          </View>
        </View>

        <View style={styles.milestoneCard}>
          <Text style={styles.milestoneIcon}>📸</Text>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>First Memory Anniversary</Text>
            <Text style={styles.milestoneDescription}>
              Celebrates your first shared Memory Log entry
            </Text>
          </View>
        </View>

        <View style={styles.milestoneCard}>
          <Text style={styles.milestoneIcon}>🤝</Text>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>First Meeting Anniversary</Text>
            <Text style={styles.milestoneDescription}>
              Remembers the day you first met in person
            </Text>
          </View>
        </View>
      </View>

      {/* Privacy & Control */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy & Control</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            • You can disable anniversaries at any time
          </Text>
          <Text style={styles.infoText}>
            • Anniversaries automatically pause during Sleep Mode
          </Text>
          <Text style={styles.infoText}>
            • No celebrations during Breakup Recovery
          </Text>
          <Text style={styles.infoText}>
            • All milestone history is preserved
          </Text>
          <Text style={styles.infoText}>
            • Streak rewards are cosmetic only (no free tokens)
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Anniversary celebrations are designed to naturally increase emotional connection,
          which organically drives paid interactions without discounts or giveaways.
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#C44569',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  milestoneCard: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  milestoneIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  milestoneDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 24,
    marginBottom: 4,
  },
  footer: {
    padding: 20,
    marginTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
