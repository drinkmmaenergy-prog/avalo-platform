/**
 * PACK 276 - Gender Selection Screen (Onboarding Step 1)
 * 
 * User selects their gender identity:
 * - Male
 * - Female
 * - Nonbinary
 */

import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Gender } from "@/types/profile";

export default function GenderSelectionScreen() {
  const router = useRouter();
  const [selectedGender, setSelectedGender] = useState<Gender | null>(null);

  const genderOptions: { value: Gender; label: string; emoji: string }[] = [
    { value: 'male', label: 'Male', emoji: '👨' },
    { value: 'female', label: 'Female', emoji: '👩' },
    { value: 'nonbinary', label: 'Nonbinary', emoji: '🧑' },
  ];

  const handleContinue = () => {
    if (!selectedGender) return;

    // Store selection and navigate to orientation
    // TODO: Store in local state or context
    router.push({
      pathname: '/onboarding/orientation',
      params: { gender: selectedGender },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '20%' }]} />
          </View>
          <Text style={styles.progressText}>Step 1 of 5</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>What's your gender?</Text>
          <Text style={styles.subtitle}>
            This helps us show you the right matches
          </Text>
        </View>

        {/* Gender options */}
        <View style={styles.optionsContainer}>
          {genderOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionCard,
                selectedGender === option.value && styles.optionCardSelected,
              ]}
              onPress={() => setSelectedGender(option.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionEmoji}>{option.emoji}</Text>
              <Text
                style={[
                  styles.optionLabel,
                  selectedGender === option.value && styles.optionLabelSelected,
                ]}
              >
                {option.label}
              </Text>
              {selectedGender === option.value && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Continue button */}
        <TouchableOpacity
          style={[
            styles.continueButton,
            !selectedGender && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedGender}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>

        {/* Privacy note */}
        <Text style={styles.privacyNote}>
          Your gender will be used for matchmaking and cannot be changed later.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  progressContainer: {
    marginBottom: 32,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B6B',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    marginBottom: 40,
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
    lineHeight: 24,
  },
  optionsContainer: {
    flex: 1,
    gap: 16,
  },
  optionCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#F8F8F8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionCardSelected: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FF6B6B',
  },
  optionEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  optionLabel: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  optionLabelSelected: {
    color: '#FF6B6B',
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  continueButtonDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
