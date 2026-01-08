/**
 * PACK 197 — Vibe Preferences Screen
 * Match by Vibe, Not by Demographics
 * 
 * Collects user signals:
 * - Photo energy preferences
 * - Chat tone style
 * - Interests and personality
 * - Attraction preferences (NO SHAMING)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from "@/contexts/AuthContext";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

interface PhotoEnergy {
  smile: number;
  nightlife: number;
  glamour: number;
  serious: number;
}

interface VibePreferences {
  photoEnergy?: PhotoEnergy;
  interests?: string[];
  personalityLabels?: string[];
  chatTone?: 'playful' | 'serious' | 'emotional' | 'mixed';
  travelPlans?: string[];
}

interface AttractionPreferences {
  physical?: {
    height?: 'any' | 'short' | 'average' | 'tall' | 'very_tall';
    build?: string[];
    beard?: 'any' | 'yes' | 'no' | 'prefer';
    tattoos?: 'any' | 'yes' | 'no' | 'prefer';
    hairLength?: string[];
    gymFrequency?: 'any' | 'never' | 'sometimes' | 'regularly' | 'daily';
  };
  style?: string[];
  lifestyle?: {
    nightlife?: 'any' | 'love_it' | 'sometimes' | 'rarely';
    travel?: 'any' | 'frequent' | 'occasional' | 'rare';
    music?: string[];
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function VibePreferencesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Vibe preferences
  const [photoEnergy, setPhotoEnergy] = useState<PhotoEnergy>({
    smile: 50,
    nightlife: 50,
    glamour: 50,
    serious: 50,
  });
  const [chatTone, setChatTone] = useState<'playful' | 'serious' | 'emotional' | 'mixed'>('mixed');
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  
  // Attraction preferences
  const [attractionPrefs, setAttractionPrefs] = useState<AttractionPreferences>({
    physical: {
      height: 'any',
      build: [],
      beard: 'any',
      tattoos: 'any',
      gymFrequency: 'any',
    },
    style: [],
    lifestyle: {
      nightlife: 'any',
      travel: 'any',
      music: [],
    },
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    // For now, just initialize with defaults
    // In production, would fetch from Firebase
    setLoading(false);
  };

  const saveVibePreferences = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      const updateVibe = httpsCallable(functions, 'pack197_updateVibeProfile');
      
      await updateVibe({
        photoEnergy,
        interests,
        chatTone,
      });

      Alert.alert('Success', 'Your vibe preferences have been updated!');
    } catch (error: any) {
      console.error('Error saving vibe preferences:', error);
      Alert.alert('Error', 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const saveAttractionPreferences = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      const updateAttraction = httpsCallable(functions, 'pack197_updateAttractionPreferences');
      
      await updateAttraction(attractionPrefs);

      Alert.alert('Success', 'Your attraction preferences have been updated!');
    } catch (error: any) {
      console.error('Error saving attraction preferences:', error);
      Alert.alert('Error', 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const addInterest = () => {
    if (newInterest.trim() && interests.length < 20) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const toggleBuild = (build: string) => {
    const builds = attractionPrefs.physical?.build || [];
    const newBuilds = builds.includes(build)
      ? builds.filter(b => b !== build)
      : [...builds, build];
    
    setAttractionPrefs({
      ...attractionPrefs,
      physical: {
        ...attractionPrefs.physical,
        build: newBuilds,
      },
    });
  };

  const toggleStyle = (style: string) => {
    const styles = attractionPrefs.style || [];
    const newStyles = styles.includes(style)
      ? styles.filter(s => s !== style)
      : [...styles, style];
    
    setAttractionPrefs({
      ...attractionPrefs,
      style: newStyles,
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF3B5C" />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vibe Preferences</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>💕</Text>
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>Match by Chemistry</Text>
            <Text style={styles.infoBannerText}>
              We match you based on vibe and chemistry, not demographics. All preferences are private and valid — NO SHAMING.
            </Text>
          </View>
        </View>

        {/* SECTION 1: Photo Energy Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photo Energy</Text>
          <Text style={styles.sectionDescription}>
            What vibe attracts you in photos? Adjust to match your preferences.
          </Text>

          <SliderPreference
            label="Smile Energy"
            icon="😊"
            value={photoEnergy.smile}
            onValueChange={(val) => setPhotoEnergy({ ...photoEnergy, smile: val })}
          />

          <SliderPreference
            label="Nightlife Vibe"
            icon="🌃"
            value={photoEnergy.nightlife}
            onValueChange={(val) => setPhotoEnergy({ ...photoEnergy, nightlife: val })}
          />

          <SliderPreference
            label="Glamour Level"
            icon="✨"
            value={photoEnergy.glamour}
            onValueChange={(val) => setPhotoEnergy({ ...photoEnergy, glamour: val })}
          />

          <SliderPreference
            label="Serious Tone"
            icon="🎯"
            value={photoEnergy.serious}
            onValueChange={(val) => setPhotoEnergy({ ...photoEnergy, serious: val })}
          />
        </View>

        {/* SECTION 2: Chat Tone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chat Tone</Text>
          <Text style={styles.sectionDescription}>
            What communication style do you prefer?
          </Text>

          {(['playful', 'serious', 'emotional', 'mixed'] as const).map((tone) => (
            <TouchableOpacity
              key={tone}
              style={[
                styles.toneOption,
                chatTone === tone && styles.toneOptionActive,
              ]}
              onPress={() => setChatTone(tone)}
            >
              <Text style={styles.toneLabel}>
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </Text>
              {chatTone === tone && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* SECTION 3: Interests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests & Passions</Text>
          <Text style={styles.sectionDescription}>
            Add interests to find people who share your vibe (max 20)
          </Text>

          <View style={styles.interestInput}>
            <TextInput
              style={styles.textInput}
              placeholder="Add an interest..."
              value={newInterest}
              onChangeText={setNewInterest}
              maxLength={30}
            />
            <TouchableOpacity
              style={styles.addButton}
              onPress={addInterest}
              disabled={!newInterest.trim() || interests.length >= 20}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.interestsContainer}>
            {interests.map((interest) => (
              <TouchableOpacity
                key={interest}
                style={styles.interestBadge}
                onPress={() => removeInterest(interest)}
              >
                <Text style={styles.interestText}>{interest}</Text>
                <Text style={styles.interestRemove}>×</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SECTION 4: Physical Attraction Preferences (NO SHAMING) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attraction Preferences</Text>
          <Text style={styles.sectionDescription}>
            All preferences are valid and private. NO SHAMING ZONE.
          </Text>

          {/* Height */}
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Height Preference</Text>
            {(['any', 'short', 'average', 'tall', 'very_tall'] as const).map((height) => (
              <TouchableOpacity
                key={height}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.physical?.height === height && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    physical: { ...attractionPrefs.physical, height },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {height === 'any' ? 'Any' : height.charAt(0).toUpperCase() + height.slice(1).replace('_', ' ')}
                </Text>
                {attractionPrefs.physical?.height === height && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Build */}
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Build Preference (Multi-select)</Text>
            {['slim', 'athletic', 'curvy', 'muscular', 'average'].map((build) => (
              <TouchableOpacity
                key={build}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.physical?.build?.includes(build) && styles.preferenceOptionActive,
                ]}
                onPress={() => toggleBuild(build)}
              >
                <Text style={styles.preferenceOptionText}>
                  {build.charAt(0).toUpperCase() + build.slice(1)}
                </Text>
                {attractionPrefs.physical?.build?.includes(build) && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Beard */}
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Beard Preference</Text>
            {(['any', 'yes', 'no', 'prefer'] as const).map((beard) => (
              <TouchableOpacity
                key={beard}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.physical?.beard === beard && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    physical: { ...attractionPrefs.physical, beard },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {beard.charAt(0).toUpperCase() + beard.slice(1)}
                </Text>
                {attractionPrefs.physical?.beard === beard && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Tattoos */}
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Tattoos Preference</Text>
            {(['any', 'yes', 'no', 'prefer'] as const).map((tattoos) => (
              <TouchableOpacity
                key={tattoos}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.physical?.tattoos === tattoos && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    physical: { ...attractionPrefs.physical, tattoos },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {tattoos.charAt(0).toUpperCase() + tattoos.slice(1)}
                </Text>
                {attractionPrefs.physical?.tattoos === tattoos && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Gym Frequency */}
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Gym Frequency</Text>
            {(['any', 'never', 'sometimes', 'regularly', 'daily'] as const).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.physical?.gymFrequency === freq && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    physical: { ...attractionPrefs.physical, gymFrequency: freq },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
                {attractionPrefs.physical?.gymFrequency === freq && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SECTION 5: Style Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Style Preferences</Text>
          <Text style={styles.sectionDescription}>
            What styles attract you? (Multi-select)
          </Text>

          {['casual', 'sporty', 'elegant', 'alternative', 'glamorous'].map((style) => (
            <TouchableOpacity
              key={style}
              style={[
                styles.preferenceOption,
                attractionPrefs.style?.includes(style) && styles.preferenceOptionActive,
              ]}
              onPress={() => toggleStyle(style)}
            >
              <Text style={styles.preferenceOptionText}>
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </Text>
              {attractionPrefs.style?.includes(style) && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* SECTION 6: Lifestyle Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifestyle Preferences</Text>
          
          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Nightlife</Text>
            {(['any', 'love_it', 'sometimes', 'rarely'] as const).map((nightlife) => (
              <TouchableOpacity
                key={nightlife}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.lifestyle?.nightlife === nightlife && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    lifestyle: { ...attractionPrefs.lifestyle, nightlife },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {nightlife === 'any' ? 'Any' : nightlife.replace('_', ' ').charAt(0).toUpperCase() + nightlife.slice(1).replace('_', ' ')}
                </Text>
                {attractionPrefs.lifestyle?.nightlife === nightlife && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.preferenceGroup}>
            <Text style={styles.preferenceLabel}>Travel Frequency</Text>
            {(['any', 'frequent', 'occasional', 'rare'] as const).map((travel) => (
              <TouchableOpacity
                key={travel}
                style={[
                  styles.preferenceOption,
                  attractionPrefs.lifestyle?.travel === travel && styles.preferenceOptionActive,
                ]}
                onPress={() =>
                  setAttractionPrefs({
                    ...attractionPrefs,
                    lifestyle: { ...attractionPrefs.lifestyle, travel },
                  })
                }
              >
                <Text style={styles.preferenceOptionText}>
                  {travel.charAt(0).toUpperCase() + travel.slice(1)}
                </Text>
                {attractionPrefs.lifestyle?.travel === travel && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Buttons */}
        <View style={styles.saveSection}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveVibePreferences}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving Vibe...' : 'Save Vibe Preferences'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveAttractionPreferences}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving Attraction...' : 'Save Attraction Preferences'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Notice */}
        <View style={styles.privacyNotice}>
          <Ionicons name="lock-closed" size={20} color="#666" />
          <Text style={styles.privacyText}>
            All preferences are completely private. They only affect your matches — never shown publicly.
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SliderPreference({
  label,
  icon,
  value,
  onValueChange,
}: {
  label: string;
  icon: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderIcon}>{icon}</Text>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{value}%</Text>
      </View>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${value}%` }]} />
        <View
          style={[styles.sliderThumb, { left: `${value}%` }]}
          {...{
            onTouchStart: () => {},
            onTouchMove: (e: any) => {
              // Simple touch-based slider
              const newValue = Math.round((e.nativeEvent.pageX / 300) * 100);
              onValueChange(Math.max(0, Math.min(100, newValue)));
            },
          }}
        />
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabelText}>Less</Text>
        <Text style={styles.sliderLabelText}>More</Text>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerSpacer: {
    width: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF0F5',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD9E8',
  },
  infoBannerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B5C',
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  sliderContainer: {
    marginBottom: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  sliderLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B5C',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 6,
    backgroundColor: '#FF3B5C',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    backgroundColor: '#FF3B5C',
    borderRadius: 10,
    marginLeft: -10,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sliderLabelText: {
    fontSize: 12,
    color: '#999',
  },
  toneOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toneOptionActive: {
    backgroundColor: '#FFF0F5',
    borderColor: '#FF3B5C',
  },
  toneLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  checkmark: {
    fontSize: 18,
    color: '#FF3B5C',
    fontWeight: 'bold',
  },
  interestInput: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    marginRight: 8,
  },
  addButton: {
    backgroundColor: '#FF3B5C',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B5C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  interestText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  interestRemove: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  preferenceGroup: {
    marginBottom: 20,
  },
  preferenceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  preferenceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  preferenceOptionActive: {
    backgroundColor: '#FFF0F5',
    borderColor: '#FF3B5C',
  },
  preferenceOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  saveSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#FF3B5C',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#CCC',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    gap: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  bottomPadding: {
    height: 40,
  },
});
