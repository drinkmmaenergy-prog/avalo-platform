/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Creator monetization onboarding - shown when enabling earning features
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { CREATOR_ONBOARDING_STEPS } from "@/config/onboarding";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CreatorMonetizationOnboardingScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (currentIndex < CREATOR_ONBOARDING_STEPS.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollViewRef.current?.scrollTo({
        x: nextIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const handleAccept = async () => {
    if (!accepted) {
      return;
    }

    try {
      setLoading(true);

      // Mark as accepted in backend
      const markComplete = httpsCallable(functions, 'help_markOnboardingComplete');
      await markComplete({ type: 'monetization' });

      // Navigate back (caller will enable monetization)
      router.back();
    } catch (error) {
      console.error('[CreatorMonetization] Error accepting intro:', error);
      alert('Failed to complete monetization intro. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isLastStep = currentIndex === CREATOR_ONBOARDING_STEPS.length - 1;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Ionicons name="close" size={28} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enable Earning</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {CREATOR_ONBOARDING_STEPS.map((step) => (
          <View key={step.id} style={styles.slide}>
            <View style={styles.illustrationContainer}>
              <Ionicons
                name={getIllustrationIcon(step.illustrationKey)}
                size={100}
                color="#3B82F6"
              />
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {CREATOR_ONBOARDING_STEPS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.activeDot,
            ]}
          />
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {isLastStep ? (
          <>
            {/* Acceptance Checkbox */}
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setAccepted(!accepted)}
              disabled={loading}
            >
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                {accepted && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              </View>
              <Text style={styles.checkboxLabel}>
                I understand these rules and accept the terms of earning on Avalo
              </Text>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[styles.acceptButton, !accepted && styles.acceptButtonDisabled]}
              onPress={handleAccept}
              disabled={!accepted || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept & Continue</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            disabled={loading}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function getIllustrationIcon(key?: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    creator_welcome: 'sparkles',
    creator_split: 'pie-chart',
    creator_payouts: 'wallet',
    creator_safety: 'shield-checkmark',
    creator_responsibilities: 'document-text',
  };
  return iconMap[key || ''] || 'information-circle';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 40,
    paddingTop: 40,
    alignItems: 'center',
  },
  illustrationContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#3B82F6',
    width: 24,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  acceptButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  nextButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
