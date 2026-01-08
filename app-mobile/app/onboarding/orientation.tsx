/**
 * PACK 276 - Orientation Selection Screen (Onboarding Step 2)
 * 
 * User selects their romantic/sexual orientation:
 * - Interested in women
 * - Interested in men
 * - Interested in both
 */

import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Orientation } from "@/types/profile";

export default function OrientationSelectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [selectedOrientation, setSelectedOrientation] = useState<Orientation | null>(null);

  const orientationOptions: { value: Orientation; label: string; emoji: string }[] = [
    { value: 'female', label: 'Interested in women', emoji: '👩' },
    { value: 'male', label: 'Interested in men', emoji: '👨' },
    { value: 'both', label: 'Interested in both', emoji: '💑' },
  ];

  const handleContinue = () => {
    if (!selectedOrientation) return;

    // Store selection and navigate to birthdate
    router.push({
      pathname: '/onboarding/birthdate' as any,
      params: {
        gender: params.gender,
        orientation: selectedOrientation,
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '40%' }]} />
          </View>
          <Text style={styles.progressText}>Step 2 of 5</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Who are you interested in?</Text>
          <Text style={styles.subtitle}>
            This determines who you'll see in Discovery and Swipe
          </Text>
        </View>

        {/* Orientation options */}
        <View style={styles.optionsContainer}>
          {orientationOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionCard,
                selectedOrientation === option.value && styles.optionCardSelected,
              ]}
              onPress={() => setSelectedOrientation(option.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionEmoji}>{option.emoji}</Text>
              <Text
                style={[
                  styles.optionLabel,
                  selectedOrientation === option.value && styles.optionLabelSelected,
                ]}
              >
                {option.label}
              </Text>
              {selectedOrientation === option.value && (
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
            !selectedOrientation && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedOrientation}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>

        {/* Privacy note */}
        <Text style={styles.privacyNote}>
          Your orientation affects matchmaking and can be changed in settings later.
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
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
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
    fontSize: 18,
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
