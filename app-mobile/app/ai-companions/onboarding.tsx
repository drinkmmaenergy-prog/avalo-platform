/**
 * PACK 141 - AI Companion Onboarding
 * Set preferences and safety opt-outs
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

export default function AICompanionOnboarding() {
  const [step, setStep] = useState(1);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [communicationStyle, setCommunicationStyle] = useState<'DIRECT' | 'SOFT' | 'MOTIVATIONAL'>('DIRECT');
  const [notificationFrequency, setNotificationFrequency] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'PRODUCTIVITY',
    'FITNESS_WELLNESS',
    'ENTERTAINMENT',
  ]);
  
  // Safety opt-outs
  const [disableEmotionalTopics, setDisableEmotionalTopics] = useState(false);
  const [disableVoiceMessages, setDisableVoiceMessages] = useState(false);
  const [disableAvatarImages, setDisableAvatarImages] = useState(false);
  
  const [saving, setSaving] = useState(false);

  const goals = [
    'Improve productivity',
    'Get fit and healthy',
    'Learn new skills',
    'Stay organized',
    'Practice languages',
    'Creative projects',
    'Personal growth',
  ];

  const categories = [
    { id: 'PRODUCTIVITY', label: 'Productivity', icon: '📊' },
    { id: 'FITNESS_WELLNESS', label: 'Fitness & Wellness', icon: '💪' },
    { id: 'MENTAL_CLARITY', label: 'Mental Clarity', icon: '🧘' },
    { id: 'LANGUAGE_LEARNING', label: 'Language Learning', icon: '🗣️' },
    { id: 'ENTERTAINMENT', label: 'Entertainment', icon: '🎮' },
    { id: 'KNOWLEDGE', label: 'Knowledge', icon: '📚' },
    { id: 'CREATIVITY', label: 'Creativity', icon: '🎨' },
    { id: 'FASHION_BEAUTY', label: 'Fashion & Style', icon: '👗' },
  ];

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleComplete = async () => {
    if (selectedGoals.length === 0) {
      Alert.alert('Select Goals', 'Please select at least one goal to continue.');
      return;
    }

    if (selectedCategories.length === 0) {
      Alert.alert('Select Categories', 'Please select at least one companion category.');
      return;
    }

    try {
      setSaving(true);
      const completeOnboarding = httpsCallable(functions, 'completeAICompanionOnboarding');
      
      await completeOnboarding({
        selectedGoals,
        communicationStyle,
        notificationFrequency,
        allowedCategories: selectedCategories,
        disableEmotionalTopics,
        disableVoiceMessages,
        disableAvatarImages,
      });

      Alert.alert(
        'Setup Complete!',
        'Your AI companion preferences have been saved. Let\'s start!',
        [{ text: 'OK', onPress: () => router.replace('/ai-companions' as any) }]
      );
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What are your goals?</Text>
      <Text style={styles.stepDescription}>
        Select the areas where you'd like support from AI companions
      </Text>

      {goals.map((goal) => (
        <TouchableOpacity
          key={goal}
          style={[
            styles.optionButton,
            selectedGoals.includes(goal) && styles.optionButtonSelected,
          ]}
          onPress={() => toggleGoal(goal)}
        >
          <Text
            style={[
              styles.optionText,
              selectedGoals.includes(goal) && styles.optionTextSelected,
            ]}
          >
            {selectedGoals.includes(goal) ? '✓ ' : ''}
            {goal}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choose Companion Categories</Text>
      <Text style={styles.stepDescription}>
        Select the types of AI companions you want access to
      </Text>

      {categories.map((category) => (
        <TouchableOpacity
          key={category.id}
          style={[
            styles.categoryButton,
            selectedCategories.includes(category.id) && styles.categoryButtonSelected,
          ]}
          onPress={() => toggleCategory(category.id)}
        >
          <Text style={styles.categoryIcon}>{category.icon}</Text>
          <Text
            style={[
              styles.categoryLabel,
              selectedCategories.includes(category.id) && styles.categoryLabelSelected,
            ]}
          >
            {category.label}
          </Text>
          {selectedCategories.includes(category.id) && (
            <Text style={styles.checkmark}>✓</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Communication Style</Text>
      <Text style={styles.stepDescription}>
        How would you like your AI companion to communicate?
      </Text>

      {[
        { value: 'DIRECT', label: 'Direct', description: 'Clear and straightforward' },
        { value: 'SOFT', label: 'Gentle', description: 'Warm and encouraging' },
        { value: 'MOTIVATIONAL', label: 'Motivational', description: 'Energizing and inspiring' },
      ].map((style) => (
        <TouchableOpacity
          key={style.value}
          style={[
            styles.styleButton,
            communicationStyle === style.value && styles.styleButtonSelected,
          ]}
          onPress={() => setCommunicationStyle(style.value as any)}
        >
          <Text
            style={[
              styles.styleLabel,
              communicationStyle === style.value && styles.styleLabelSelected,
            ]}
          >
            {style.label}
          </Text>
          <Text style={styles.styleDescription}>{style.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Safety Preferences</Text>
      <Text style={styles.stepDescription}>
        Control your AI companion experience (optional)
      </Text>

      <View style={styles.safetyNotice}>
        <Text style={styles.safetyNoticeTitle}>✓ Always Safe</Text>
        <Text style={styles.safetyNoticeText}>
          • Zero romance or flirting{'\n'}
          • Zero NSFW content{'\n'}
          • Zero emotional dependency{'\n'}
          • 100% focused on your goals
        </Text>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Disable Emotional Topics</Text>
          <Text style={styles.settingDescription}>
            Avoid discussing feelings or emotions
          </Text>
        </View>
        <Switch
          value={disableEmotionalTopics}
          onValueChange={setDisableEmotionalTopics}
        />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Disable Voice Messages</Text>
          <Text style={styles.settingDescription}>
            Text-only communication
          </Text>
        </View>
        <Switch
          value={disableVoiceMessages}
          onValueChange={setDisableVoiceMessages}
        />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Disable Avatar Images</Text>
          <Text style={styles.settingDescription}>
            Hide companion avatars
          </Text>
        </View>
        <Switch
          value={disableAvatarImages}
          onValueChange={setDisableAvatarImages}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
     <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              step >= i && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navigation}>
        {step > 1 && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setStep(step - 1)}
          >
            <Text style={styles.navButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonPrimary]}
          onPress={() => {
            if (step < 4) {
              setStep(step + 1);
            } else {
              handleComplete();
            }
          }}
          disabled={saving}
        >
          <Text style={styles.navButtonTextPrimary}>
            {step === 4 ? (saving ? 'Saving...' : 'Complete') : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
  },
  progressDot: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  optionButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  optionText: {
    fontSize: 16,
    color: '#333333',
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  categoryButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
  },
  categoryLabelSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 20,
    color: '#007AFF',
  },
  styleButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  styleButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  styleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  styleLabelSelected: {
    color: '#007AFF',
  },
  styleDescription: {
    fontSize: 13,
    color: '#666666',
  },
  safetyNotice: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  safetyNoticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 8,
  },
  safetyNoticeText: {
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666666',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    marginHorizontal: 8,
  },
  navButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  navButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
