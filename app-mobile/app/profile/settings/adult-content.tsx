/**
 * PACK 108 — Adult Content Preferences Screen
 * User safety preferences and NSFW controls
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface SafetyPreferences {
  allowAdultContentInFeed: boolean;
  autoFilterNSFWPreviews: boolean;
  blurExplicitMediaByDefault: boolean;
  allowAdultCreatorsToDM: boolean;
  nsfwHistoryHidden: boolean;
  regionCode: string;
  nsfwLegalInRegion: boolean;
  ageVerified: boolean;
}

export default function AdultContentPreferencesScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<SafetyPreferences | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadPreferences();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadPreferences = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      const prefsDoc = await getDoc(
        doc(db, 'user_safety_preferences', user.uid)
      );

      if (prefsDoc.exists()) {
        setPreferences(prefsDoc.data() as SafetyPreferences);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      Alert.alert('Error', 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (
    key: keyof SafetyPreferences,
    value: boolean
  ) => {
    if (!user?.uid || !preferences) return;

    // Check if enabling adult content
    if (key === 'allowAdultContentInFeed' && value === true) {
      if (!preferences.ageVerified) {
        Alert.alert(
          'Age Verification Required',
          'You must verify your age before enabling adult content.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Age',
              onPress: () => router.push('/profile/settings/passport' as any),
            },
          ]
        );
        return;
      }

      if (!preferences.nsfwLegalInRegion) {
        Alert.alert(
          'Not Available',
          'Adult content is not available in your region due to local laws.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show confirmation
      Alert.alert(
        'Enable Adult Content?',
        'This will allow explicit adult content to appear in your feed. You must be 18+ to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            style: 'destructive',
            onPress: () => savePreference(key, value),
          },
        ]
      );
      return;
    }

    await savePreference(key, value);
  };

  const savePreference = async (
    key: keyof SafetyPreferences,
    value: boolean
  ) => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      await updateDoc(doc(db, 'user_safety_preferences', user.uid), {
        [key]: value,
        updatedAt: serverTimestamp(),
      });

      setPreferences(prev => (prev ? { ...prev, [key]: value } : null));
    } catch (error) {
      console.error('Error updating preference:', error);
      Alert.alert('Error', 'Failed to update preference');
    } finally {
      setSaving(false);
    }
  };

  const handlePanicHide = async () => {
    Alert.alert(
      'Hide NSFW History',
      'This will immediately hide all your NSFW content history. You can restore it anytime from settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide Now',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'user_safety_preferences', user!.uid), {
                nsfwHistoryHidden: true,
                hiddenAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              setPreferences(prev =>
                prev ? { ...prev, nsfwHistoryHidden: true } : null
              );

              Alert.alert('Success', 'NSFW history has been hidden');
            } catch (error) {
              Alert.alert('Error', 'Failed to hide history');
            }
          },
        },
      ]
    );
  };

  const handleRestoreHistory = async () => {
    try {
      await updateDoc(doc(db, 'user_safety_preferences', user!.uid), {
        nsfwHistoryHidden: false,
        hiddenAt: null,
        updatedAt: serverTimestamp(),
      });

      setPreferences(prev =>
        prev ? { ...prev, nsfwHistoryHidden: false } : null
      );

      Alert.alert('Success', 'NSFW history has been restored');
    } catch (error) {
      Alert.alert('Error', 'Failed to restore history');
    }
  };

  if (loading || !preferences) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Adult Content Settings',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Adult Content Settings',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.scrollView}>
        {/* Age Verification Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Status</Text>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Age Verified:</Text>
              <Text
                style={[
                  styles.statusValue,
                  preferences.ageVerified
                    ? styles.statusVerified
                    : styles.statusUnverified,
                ]}
              >
                {preferences.ageVerified ? 'Yes' : 'No'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Region Allows NSFW:</Text>
              <Text
                style={[
                  styles.statusValue,
                  preferences.nsfwLegalInRegion
                    ? styles.statusVerified
                    : styles.statusUnverified,
                ]}
              >
                {preferences.nsfwLegalInRegion ? 'Yes' : 'No'}
              </Text>
            </View>
            {!preferences.ageVerified && (
              <TouchableOpacity
                style={styles.verifyButton}
                onPress={() => router.push('/profile/settings/passport' as any)}
              >
                <Text style={styles.verifyButtonText}>Verify Age</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Preferences</Text>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                Allow Adult Content in Feed
              </Text>
              <Text style={styles.settingDescription}>
                Show adult content in your discovery feed (18+ only, must be
                legal in your region)
              </Text>
            </View>
            <Switch
              value={preferences.allowAdultContentInFeed}
              onValueChange={value =>
                updatePreference('allowAdultContentInFeed', value)
              }
              disabled={
                saving ||
                !preferences.ageVerified ||
                !preferences.nsfwLegalInRegion
              }
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                Auto-Filter NSFW Previews
              </Text>
              <Text style={styles.settingDescription}>
                Automatically blur NSFW content until you choose to view it
              </Text>
            </View>
            <Switch
              value={preferences.autoFilterNSFWPreviews}
              onValueChange={value =>
                updatePreference('autoFilterNSFWPreviews', value)
              }
              disabled={saving}
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                Blur Explicit Media by Default
              </Text>
              <Text style={styles.settingDescription}>
                Always blur explicit adult media until tapped
              </Text>
            </View>
            <Switch
              value={preferences.blurExplicitMediaByDefault}
              onValueChange={value =>
                updatePreference('blurExplicitMediaByDefault', value)
              }
              disabled={saving}
            />
          </View>
        </View>

        {/* Communication Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communication</Text>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                Allow Adult Creators to DM Me
              </Text>
              <Text style={styles.settingDescription}>
                Creators who post adult content can send you direct messages
              </Text>
            </View>
            <Switch
              value={preferences.allowAdultCreatorsToDM}
              onValueChange={value =>
                updatePreference('allowAdultCreatorsToDM', value)
              }
              disabled={saving}
            />
          </View>
        </View>

        {/* Emergency Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Controls</Text>

          {preferences.nsfwHistoryHidden ? (
            <TouchableOpacity
              style={[styles.panicButton, styles.restoreButton]}
              onPress={handleRestoreHistory}
              disabled={saving}
            >
              <Text style={styles.panicButtonText}>
                Restore NSFW History
              </Text>
              <Text style={styles.panicButtonDescription}>
                Your NSFW history is currently hidden
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.panicButton}
              onPress={handlePanicHide}
              disabled={saving}
            >
              <Text style={styles.panicButtonText}>Panic Hide</Text>
              <Text style={styles.panicButtonDescription}>
                Immediately hide all NSFW activity from your profile
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Information */}
        <View style={styles.section}>
          <Text style={styles.infoText}>
            These settings control how adult content appears on Avalo. You must
            be 18+ and in a region where adult content is legal to access NSFW
            features.
          </Text>
          <Text style={styles.infoText}>
            Avalo does not promote adult content. These settings provide
            containment and personal control over what you see.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusVerified: {
    color: '#4CAF50',
  },
  statusUnverified: {
    color: '#f44336',
  },
  verifyButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  settingDescription: {
    color: '#aaa',
    fontSize: 12,
  },
  panicButton: {
    backgroundColor: '#d32f2f',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  restoreButton: {
    backgroundColor: '#2196F3',
  },
  panicButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  panicButtonDescription: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  infoText: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
});
