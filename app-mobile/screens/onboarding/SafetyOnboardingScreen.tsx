/**
 * PACK 73 — Safety Onboarding Screen
 * Multi-step onboarding for safety education
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { markSafetyUxEvent, markSafetyOnboardingCompletedLocally } from '../../services/safetyService';

const { width } = Dimensions.get('window');

interface SafetySlide {
  titleKey: string;
  bodyKey: string;
}

const SAFETY_SLIDES: SafetySlide[] = [
  {
    titleKey: 'onboarding.step1Title',
    bodyKey: 'onboarding.step1Description',
  },
  {
    titleKey: 'onboarding.step2Title',
    bodyKey: 'onboarding.step2Description',
  },
  {
    titleKey: 'onboarding.step3Title',
    bodyKey: 'onboarding.step3Description',
  },
];

interface SafetyOnboardingScreenProps {
  onComplete: () => void;
}

export default function SafetyOnboardingScreen({ onComplete }: SafetyOnboardingScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = () => {
    if (currentSlide < SAFETY_SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleFinish = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Mark as completed on backend
      await markSafetyUxEvent('ONBOARDING_COMPLETED');

      // Mark as completed locally for resilience
      if (user?.uid) {
        await markSafetyOnboardingCompletedLocally(user.uid);
      }

      // Complete onboarding
      onComplete();
    } catch (error) {
      console.error('Error completing safety onboarding:', error);
      // Still complete locally even if backend fails
      if (user?.uid) {
        await markSafetyOnboardingCompletedLocally(user.uid);
      }
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const slide = SAFETY_SLIDES[currentSlide];
  const isLastSlide = currentSlide === SAFETY_SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress Indicators */}
        <View style={styles.progressContainer}>
          {SAFETY_SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === currentSlide && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {/* Slide Content */}
        <ScrollView
          style={styles.slideContainer}
          contentContainerStyle={styles.slideContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
          <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          {currentSlide > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handlePrevious}
              disabled={isSubmitting}
            >
              <Text style={styles.buttonSecondaryText}>
                {t('common.back')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonPrimary,
              currentSlide === 0 && styles.buttonFull,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={isLastSlide ? handleFinish : handleNext}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonPrimaryText}>
              {isLastSlide
                ? t('safety.onboarding.finish')
                : t('common.next')}
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: '#FF69B4',
    width: 24,
  },
  slideContainer: {
    flex: 1,
  },
  slideContent: {
    paddingVertical: 20,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 24,
    textAlign: 'center',
  },
  slideBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A4A4A',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#FF69B4',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#F5F5F5',
  },
  buttonSecondaryText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
