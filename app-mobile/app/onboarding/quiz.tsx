/**
 * FTUX Quiz Screen
 * Multi-step onboarding quiz to understand user preferences
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { QuizAnswers, saveQuizAnswers } from "@/services/onboardingProfileService";

const { width } = Dimensions.get('window');

type QuizStep = 1 | 2 | 3 | 4 | 5;

export default function QuizScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<QuizStep>(1);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({
    goals: [],
    lifestyle: [],
    values: [],
    weekend: '',
    peopleType: [],
  });

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Animate transition between steps
  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    setTimeout(callback, 200);
  };

  const handleNext = async () => {
    if (currentStep < 5) {
      animateTransition(() => setCurrentStep((currentStep + 1) as QuizStep));
    } else {
      // Save and navigate to profile suggestions
      await saveQuizAnswers(quizAnswers);
      router.replace('/onboarding/profile-suggestions' as any);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      animateTransition(() => setCurrentStep((currentStep - 1) as QuizStep));
    }
  };

  const handleSkipAll = async () => {
    // Save empty answers and go to profile suggestions
    await saveQuizAnswers({});
    router.replace('/onboarding/profile-suggestions' as any);
  };

  const handleSkipQuestion = () => {
    handleNext();
  };

  // Toggle chip selection
  const toggleChip = (field: keyof QuizAnswers, value: string) => {
    setQuizAnswers(prev => {
      const currentArray = (prev[field] as string[]) || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(v => v !== value)
        : [...currentArray, value];
      return { ...prev, [field]: newArray };
    });
  };

  // Render chip button
  const renderChip = (field: keyof QuizAnswers, value: string, label: string, max?: number) => {
    const currentArray = (quizAnswers[field] as string[]) || [];
    const isSelected = currentArray.includes(value);
    const isDisabled = max && !isSelected && currentArray.length >= max;

    return (
      <TouchableOpacity
        key={value}
        style={[
          styles.chip,
          isSelected && styles.chipSelected,
          isDisabled && styles.chipDisabled,
        ]}
        onPress={() => !isDisabled && toggleChip(field, value)}
        disabled={isDisabled}
      >
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('ftuxQuiz.step1.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('ftuxQuiz.step1.subtitle')}</Text>
            <View style={styles.chipsContainer}>
              {renderChip('goals', 'Serious relationship', t('ftuxQuiz.step1.options.serious'))}
              {renderChip('goals', 'Something casual', t('ftuxQuiz.step1.options.casual'))}
              {renderChip('goals', 'New friends', t('ftuxQuiz.step1.options.friends'))}
              {renderChip('goals', 'Networking', t('ftuxQuiz.step1.options.networking'))}
              {renderChip('goals', "I'm not sure yet", t('ftuxQuiz.step1.options.notSure'))}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('ftuxQuiz.step2.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('ftuxQuiz.step2.subtitle')}</Text>
            <View style={styles.chipsContainer}>
              {renderChip('lifestyle', 'Ambitious', t('ftuxQuiz.step2.options.ambitious'))}
              {renderChip('lifestyle', 'Chill', t('ftuxQuiz.step2.options.chill'))}
              {renderChip('lifestyle', 'Adventurous', t('ftuxQuiz.step2.options.adventurous'))}
              {renderChip('lifestyle', 'Family-oriented', t('ftuxQuiz.step2.options.family'))}
              {renderChip('lifestyle', 'Nightlife lover', t('ftuxQuiz.step2.options.nightlife'))}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('ftuxQuiz.step3.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('ftuxQuiz.step3.subtitle')}</Text>
            <View style={styles.chipsContainer}>
              {renderChip('values', 'Career', t('ftuxQuiz.step3.options.career'), 3)}
              {renderChip('values', 'Health', t('ftuxQuiz.step3.options.health'), 3)}
              {renderChip('values', 'Travel', t('ftuxQuiz.step3.options.travel'), 3)}
              {renderChip('values', 'Luxury', t('ftuxQuiz.step3.options.luxury'), 3)}
              {renderChip('values', 'Stability', t('ftuxQuiz.step3.options.stability'), 3)}
              {renderChip('values', 'Creativity', t('ftuxQuiz.step3.options.creativity'), 3)}
              {renderChip('values', 'Family', t('ftuxQuiz.step3.options.family'), 3)}
              {renderChip('values', 'Freedom', t('ftuxQuiz.step3.options.freedom'), 3)}
            </View>
            {quizAnswers.values && quizAnswers.values.length > 0 && (
              <Text style={styles.counterText}>
                {quizAnswers.values.length}/3
              </Text>
            )}
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('ftuxQuiz.step4.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('ftuxQuiz.step4.subtitle')}</Text>
            <TextInput
              style={styles.textInput}
              placeholder={t('ftuxQuiz.step4.placeholder')}
              placeholderTextColor="#666"
              value={quizAnswers.weekend || ''}
              onChangeText={(text) => setQuizAnswers(prev => ({ ...prev, weekend: text }))}
              multiline
              numberOfLines={4}
              maxLength={200}
            />
            {quizAnswers.weekend && (
              <Text style={styles.charCounter}>
                {quizAnswers.weekend.length}/200
              </Text>
            )}
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('ftuxQuiz.step5.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('ftuxQuiz.step5.subtitle')}</Text>
            <View style={styles.chipsContainer}>
              {renderChip('peopleType', 'Calm', t('ftuxQuiz.step5.options.calm'))}
              {renderChip('peopleType', 'Dominant', t('ftuxQuiz.step5.options.dominant'))}
              {renderChip('peopleType', 'Playful', t('ftuxQuiz.step5.options.playful'))}
              {renderChip('peopleType', 'Deep thinkers', t('ftuxQuiz.step5.options.deepThinkers'))}
              {renderChip('peopleType', 'Spontaneous', t('ftuxQuiz.step5.options.spontaneous'))}
            </View>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Skip All Button */}
        <TouchableOpacity style={styles.skipAllButton} onPress={handleSkipAll}>
          <Text style={styles.skipAllText}>{t('ftuxQuiz.buttons.skipAll')}</Text>
        </TouchableOpacity>

        {/* Progress Dots */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5].map((step) => (
            <View
              key={step}
              style={[
                styles.progressDot,
                step === currentStep && styles.progressDotActive,
                step < currentStep && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {renderStep()}
          </Animated.View>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navigationContainer}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.navButton, styles.backButton, currentStep === 1 && styles.navButtonDisabled]}
              onPress={handleBack}
              disabled={currentStep === 1}
            >
              <Text style={[styles.navButtonText, currentStep === 1 && styles.navButtonTextDisabled]}>
                {t('ftuxQuiz.buttons.back')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkipQuestion}
            >
              <Text style={styles.skipButtonText}>{t('ftuxQuiz.buttons.skipQuestion')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navButton, styles.nextButton]}
              onPress={handleNext}
            >
              <Text style={styles.nextButtonText}>
                {currentStep === 5 ? t('ftuxQuiz.buttons.finish') : t('ftuxQuiz.buttons.next')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  skipAllButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipAllText: {
    fontSize: 16,
    color: '#40E0D0',
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
    gap: 8,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(64, 224, 208, 0.3)',
  },
  progressDotActive: {
    backgroundColor: '#D4AF37',
  },
  progressDotCompleted: {
    backgroundColor: '#40E0D0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
  },
  stepContainer: {
    minHeight: 400,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 36,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#40E0D0',
    marginBottom: 32,
    opacity: 0.9,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
  },
  chipSelected: {
    backgroundColor: 'rgba(64, 224, 208, 0.2)',
    borderColor: '#40E0D0',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#40E0D0',
    fontWeight: '600',
  },
  counterText: {
    fontSize: 14,
    color: '#40E0D0',
    marginTop: 16,
    textAlign: 'center',
  },
  textInput: {
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
    borderRadius: 18,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCounter: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  navigationContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
  },
  nextButton: {
    backgroundColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  skipButton: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    fontSize: 16,
    color: '#40E0D0',
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: '#666',
  },
  nextButtonText: {
    fontSize: 16,
    color: '#0F0F0F',
    fontWeight: '600',
  },
  skipButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});
