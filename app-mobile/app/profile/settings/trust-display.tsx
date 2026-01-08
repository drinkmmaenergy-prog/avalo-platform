/**
 * Trust Display Settings Screen
 * 
 * Allows users to control trust badge visibility
 * PACK 115 - Public Reputation & Trust Score Display
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import TrustBadge, { ReputationLevel } from "@/components/TrustBadge";
import TrustBadgeLearnMoreModal from "@/components/TrustBadgeLearnMoreModal";

export default function TrustDisplaySettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  
  const [reputationLevel, setReputationLevel] = useState<ReputationLevel>('MODERATE');
  const [displayBadge, setDisplayBadge] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Get user's reputation profile
      const getProfile = httpsCallable(functions, 'reputation_getPublicProfile');
      const result = await getProfile({});
      const data = result.data as any;

      if (data.success && data.profile) {
        setReputationLevel(data.profile.level);
        setDisplayBadge(data.profile.displayBadge !== false);
      }
    } catch (error: any) {
      console.error('Error loading trust settings:', error);
      Alert.alert('Error', 'Failed to load trust settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDisplay = async (newValue: boolean) => {
    try {
      setSaving(true);

      const updateSettings = httpsCallable(functions, 'reputation_updateDisplaySettings');
      const result = await updateSettings({ displayBadge: newValue });
      const data = result.data as any;

      if (data.success) {
        setDisplayBadge(newValue);
        Alert.alert(
          'Success',
          newValue
            ? 'Your Trust badge is now visible on your profile'
            : 'Your Trust badge is now hidden from your profile'
        );
      }
    } catch (error: any) {
      console.error('Error updating display settings:', error);
      Alert.alert('Error', 'Failed to update settings. Please try again.');
      // Revert the toggle
      setDisplayBadge(!newValue);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Trust Display',
            headerBackTitle: 'Back',
          }}
        />
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Trust Display',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Trust Level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Trust Level</Text>
          <View style={styles.badgePreview}>
            <TrustBadge
              level={reputationLevel}
              size="large"
              showLabel={true}
              visible={displayBadge}
            />
            {!displayBadge && (
              <Text style={styles.hiddenNote}>(Currently hidden)</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.learnMoreButton}
            onPress={() => setShowLearnMore(true)}
          >
            <Text style={styles.learnMoreButtonText}>Learn how Trust Level works</Text>
          </TouchableOpacity>
        </View>

        {/* Display Control */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Show Trust Badge</Text>
              <Text style={styles.settingDescription}>
                Display your Trust badge on your profile for others to see
              </Text>
            </View>
            <Switch
              value={displayBadge}
              onValueChange={handleToggleDisplay}
              disabled={saving}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={displayBadge ? '#3B82F6' : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Information */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📌 Important Information</Text>
          <Text style={styles.infoText}>
            • Hiding your badge does not affect your actual trust level{'\n'}
            • Your trust level does not affect discovery ranking{'\n'}
            • Your trust level does not affect earnings{'\n'}
            • Trust level is based only on verified safe behaviour
          </Text>
        </View>

        {/* What Affects Trust */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Affects Trust Level</Text>
          <View style={styles.factorsList}>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>✅</Text>
              <Text style={styles.factorText}>Identity verification (KYC)</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>✅</Text>
              <Text style={styles.factorText}>Profile completeness</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>✅</Text>
              <Text style={styles.factorText}>Respectful conduct</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>✅</Text>
              <Text style={styles.factorText}>Response quality</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>✅</Text>
              <Text style={styles.factorText}>Safety compliance</Text>
            </View>
          </View>
        </View>

        {/* What Does NOT Affect Trust */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Does NOT Affect Trust</Text>
          <View style={styles.factorsList}>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>❌</Text>
              <Text style={styles.factorText}>Premium membership</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>❌</Text>
              <Text style={styles.factorText}>Token spending</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>❌</Text>
              <Text style={styles.factorText}>Earnings amount</Text>
            </View>
            <View style={styles.factorItem}>
              <Text style={styles.factorIcon}>❌</Text>
              <Text style={styles.factorText}>Number of messages</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Learn More Modal */}
      <TrustBadgeLearnMoreModal
        visible={showLearnMore}
        onClose={() => setShowLearnMore(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  badgePreview: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
  },
  hiddenNote: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  learnMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  learnMoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1E40AF',
  },
  factorsList: {
    gap: 12,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factorIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
  },
  factorText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
});
