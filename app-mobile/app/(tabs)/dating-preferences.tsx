/**
 * Dating Preferences Screen
 * Allows users to set their dating preferences (who they want, age range, distance)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, updateProfile, DatingPreferences } from "@/lib/profileService";

const GENDER_OPTIONS = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'non-binary', label: 'Non-Binary' },
  { value: 'everyone', label: 'Everyone' },
];

const AGE_PRESETS = [
  { label: '18-25', value: [18, 25] },
  { label: '25-35', value: [25, 35] },
  { label: '35-45', value: [35, 45] },
  { label: '45-55', value: [45, 55] },
  { label: '18-55', value: [18, 55] },
];

const DISTANCE_PRESETS = [
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: '50 km', value: 50 },
  { label: '100 km', value: 100 },
  { label: 'Anywhere', value: 500 },
];

export default function DatingPreferencesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<DatingPreferences>({
    whoIWant: ['everyone'],
    preferredAgeRange: [18, 55],
    preferredDistanceKm: 50,
  });

  useEffect(() => {
    loadPreferences();
  }, [user?.uid]);

  const loadPreferences = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      const profile = await getProfile(user.uid);

      if (profile?.datingPreferences) {
        setPreferences(profile.datingPreferences);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      Alert.alert('Error', 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      await updateProfile(user.uid, { datingPreferences: preferences });
      Alert.alert('Success', 'Your dating preferences have been updated!');
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const toggleGenderPreference = (gender: string) => {
    setPreferences((prev) => {
      let newWhoIWant = [...prev.whoIWant];

      if (gender === 'everyone') {
        // If selecting "everyone", clear all other selections
        newWhoIWant = ['everyone'];
      } else {
        // Remove "everyone" if it exists
        newWhoIWant = newWhoIWant.filter((g) => g !== 'everyone');

        // Toggle the selected gender
        if (newWhoIWant.includes(gender as any)) {
          newWhoIWant = newWhoIWant.filter((g) => g !== gender);
        } else {
          newWhoIWant.push(gender as any);
        }

        // If no gender selected, default to "everyone"
        if (newWhoIWant.length === 0) {
          newWhoIWant = ['everyone'];
        }
      }

      return { ...prev, whoIWant: newWhoIWant as any };
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dating Preferences</Text>
        <Text style={styles.subtitle}>
          Customize who you want to see and match with
        </Text>
      </View>

      {/* Who I Want Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Show me</Text>
        <View style={styles.optionsContainer}>
          {GENDER_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                preferences.whoIWant.includes(option.value as any) &&
                  styles.optionButtonActive,
              ]}
              onPress={() => toggleGenderPreference(option.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  preferences.whoIWant.includes(option.value as any) &&
                    styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Age Range Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Age Range</Text>
        <Text style={styles.rangeValue}>
          {preferences.preferredAgeRange[0]} - {preferences.preferredAgeRange[1]} years old
        </Text>
        <View style={styles.optionsContainer}>
          {AGE_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={[
                styles.optionButton,
                preferences.preferredAgeRange[0] === preset.value[0] &&
                preferences.preferredAgeRange[1] === preset.value[1] &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                setPreferences((prev) => ({
                  ...prev,
                  preferredAgeRange: preset.value as [number, number],
                }))
              }
            >
              <Text
                style={[
                  styles.optionText,
                  preferences.preferredAgeRange[0] === preset.value[0] &&
                  preferences.preferredAgeRange[1] === preset.value[1] &&
                    styles.optionTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Distance Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Maximum Distance</Text>
        <Text style={styles.rangeValue}>
          {preferences.preferredDistanceKm === 500
            ? 'Anywhere'
            : `${preferences.preferredDistanceKm} km`}
        </Text>
        <View style={styles.optionsContainer}>
          {DISTANCE_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={[
                styles.optionButton,
                preferences.preferredDistanceKm === preset.value &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                setPreferences((prev) => ({
                  ...prev,
                  preferredDistanceKm: preset.value,
                }))
              }
            >
              <Text
                style={[
                  styles.optionText,
                  preferences.preferredDistanceKm === preset.value &&
                    styles.optionTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSavePreferences}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Preferences</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 Tip: Your preferences help us show you better matches!
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  optionButtonActive: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF5F5',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  optionTextActive: {
    color: '#FF6B6B',
  },
  rangeValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#FF6B6B',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
