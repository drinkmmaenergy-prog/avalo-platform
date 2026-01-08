/**
 * PACK 185 - Create Custom AI Companion
 * 
 * Generate a custom AI companion based on user preferences
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { aiCharacters, CharacterGenerationOptions } from "@/lib/aiCharacters";

const PERSONALITY_OPTIONS = [
  { value: 'playful', label: 'Playful', emoji: '😊' },
  { value: 'dominant', label: 'Dominant', emoji: '💪' },
  { value: 'shy', label: 'Shy', emoji: '🥰' },
  { value: 'clever', label: 'Clever', emoji: '🤓' },
  { value: 'poetic', label: 'Poetic', emoji: '📖' },
  { value: 'chaotic_good', label: 'Chaotic Good', emoji: '🎭' },
  { value: 'nurturing', label: 'Nurturing', emoji: '🌸' },
  { value: 'mysterious', label: 'Mysterious', emoji: '🌙' },
  { value: 'energetic', label: 'Energetic', emoji: '⚡' },
  { value: 'calm', label: 'Calm', emoji: '🍃' },
];

const COMMUNICATION_OPTIONS = [
  { value: 'sensual', label: 'Sensual', emoji: '💋' },
  { value: 'funny', label: 'Funny', emoji: '😄' },
  { value: 'nerdy', label: 'Nerdy', emoji: '🤓' },
  { value: 'poetic', label: 'Poetic', emoji: '✍️' },
  { value: 'dry_humor', label: 'Dry Humor', emoji: '😏' },
  { value: 'warm', label: 'Warm', emoji: '☀️' },
  { value: 'direct', label: 'Direct', emoji: '🎯' },
  { value: 'thoughtful', label: 'Thoughtful', emoji: '💭' },
];

const INTEREST_OPTIONS = [
  'technology', 'travel', 'philosophy', 'fitness', 'gaming',
  'psychology', 'photography', 'music', 'art', 'cooking',
  'reading', 'hiking', 'yoga', 'dancing', 'writing',
  'astronomy', 'fashion', 'architecture', 'cinema', 'meditation',
];

const AGE_RANGES = [
  { min: 18, max: 22, label: '18-22' },
  { min: 23, max: 27, label: '23-27' },
  { min: 28, max: 32, label: '28-32' },
  { min: 33, max: 35, label: '33-35' },
];

export default function CreateAICompanionScreen() {
  const router = useRouter();
  
  const [selectedPersonality, setSelectedPersonality] = useState<string | null>(null);
  const [selectedCommunication, setSelectedCommunication] = useState<string | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedAgeRange, setSelectedAgeRange] = useState<{ min: number; max: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      if (selectedInterests.length < 7) {
        setSelectedInterests([...selectedInterests, interest]);
      } else {
        Alert.alert('Limit Reached', 'You can select up to 7 interests');
      }
    }
  };

  const handleCreate = async () => {
    if (!selectedPersonality) {
      Alert.alert('Selection Required', 'Please select a personality style');
      return;
    }

    if (!selectedCommunication) {
      Alert.alert('Selection Required', 'Please select a communication vibe');
      return;
    }

    if (selectedInterests.length < 3) {
      Alert.alert('Selection Required', 'Please select at least 3 interests');
      return;
    }

    if (!selectedAgeRange) {
      Alert.alert('Selection Required', 'Please select an age range');
      return;
    }

    try {
      setCreating(true);

      const options: CharacterGenerationOptions = {
        personalityPreference: selectedPersonality,
        communicationStyle: selectedCommunication,
        interests: selectedInterests,
        ageRange: selectedAgeRange,
      };

      const result = await aiCharacters.generateCharacter(options);

      if (result.success) {
        Alert.alert(
          'Companion Created!',
          `Meet ${result.character.name}! Your new AI companion is ready.`,
          [
            {
              text: 'View Profile',
              onPress: () => router.replace(`/ai-companion/${result.characterId}` as any),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error creating character:', error);
      Alert.alert(
        'Creation Failed',
        error.message || 'Failed to create AI companion. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const canCreate = selectedPersonality && selectedCommunication && 
                    selectedInterests.length >= 3 && selectedAgeRange;

  if (creating) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Creating your AI companion...</Text>
        <Text style={styles.loadingSubtext}>This may take a few moments</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Companion</Text>
        <Text style={styles.subtitle}>Customize your perfect match</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Personality Style */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personality Style</Text>
          <Text style={styles.sectionSubtitle}>How do you want them to behave?</Text>
          
          <View style={styles.optionGrid}>
            {PERSONALITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  selectedPersonality === option.value && styles.optionCardSelected,
                ]}
                onPress={() => setSelectedPersonality(option.value)}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={[
                  styles.optionLabel,
                  selectedPersonality === option.value && styles.optionLabelSelected,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Communication Vibe */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communication Vibe</Text>
          <Text style={styles.sectionSubtitle}>How should they talk?</Text>
          
          <View style={styles.optionGrid}>
            {COMMUNICATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  selectedCommunication === option.value && styles.optionCardSelected,
                ]}
                onPress={() => setSelectedCommunication(option.value)}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={[
                  styles.optionLabel,
                  selectedCommunication === option.value && styles.optionLabelSelected,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <Text style={styles.sectionSubtitle}>
            Select 3-7 topics they're passionate about ({selectedInterests.length}/7)
          </Text>
          
          <View style={styles.interestGrid}>
            {INTEREST_OPTIONS.map((interest) => (
              <TouchableOpacity
                key={interest}
                style={[
                  styles.interestChip,
                  selectedInterests.includes(interest) && styles.interestChipSelected,
                ]}
                onPress={() => toggleInterest(interest)}
              >
                <Text style={[
                  styles.interestText,
                  selectedInterests.includes(interest) && styles.interestTextSelected,
                ]}>
                  {interest}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Age Range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Age Range</Text>
          <Text style={styles.sectionSubtitle}>Select their age range (18-35)</Text>
          
          <View style={styles.ageGrid}>
            {AGE_RANGES.map((range) => (
              <TouchableOpacity
                key={range.label}
                style={[
                  styles.ageCard,
                  selectedAgeRange?.min === range.min && styles.ageCardSelected,
                ]}
                onPress={() => setSelectedAgeRange(range)}
              >
                <Text style={[
                  styles.ageLabel,
                  selectedAgeRange?.min === range.min && styles.ageLabelSelected,
                ]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Safety Notice */}
        <View style={styles.safetyNotice}>
          <Text style={styles.safetyTitle}>🛡️ Safety First</Text>
          <Text style={styles.safetyText}>
            All AI companions are generated with strict safety guidelines. They are fictional
            characters designed for healthy, respectful interactions. No real identities are used.
          </Text>
        </View>
      </ScrollView>

      {/* Create Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createButton, !canCreate && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={!canCreate}
        >
          <Text style={styles.createButtonText}>
            ✨ Create My Companion
          </Text>
        </TouchableOpacity>
      </View>
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
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    fontSize: 16,
    color: '#7C3AED',
    fontWeight: '600',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  optionCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    margin: 6,
    alignItems: 'center',
  },
  optionCardSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  optionLabelSelected: {
    color: '#7C3AED',
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  interestChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  interestChipSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  interestText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  interestTextSelected: {
    color: '#7C3AED',
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  ageCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 20,
    margin: 6,
    alignItems: 'center',
  },
  ageCardSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  ageLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  ageLabelSelected: {
    color: '#7C3AED',
  },
  safetyNotice: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 8,
  },
  safetyText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
  },
  createButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
