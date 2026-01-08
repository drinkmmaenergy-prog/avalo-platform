/**
 * PACK 206C — Day 3: Heat Up the Connection
 * Onboarding mission screen for Day 3
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import {
  getOnboardingProgress,
  completeDay3,
  isDay3Complete,
} from '../../../services/onboardingMissionsService';
import { OnboardingProgress } from '../../../types/onboarding';

export default function Day3MissionsScreen() {
  const navigation = useNavigation();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const auth = getAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const progressData = await getOnboardingProgress(userId);
      setProgress(progressData);

      // Check if required day 3 steps are complete
      if (isDay3Complete(progressData) && !progressData.day3Completed) {
        await completeDay3(userId);
        // Navigate to completion
        navigation.navigate('OnboardingComplete' as never);
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (progress && isDay3Complete(progress)) {
      navigation.navigate('OnboardingComplete' as never);
    }
  };

  const handleSkipOptional = (step: 'availability' | 'event') => {
    // Optional steps can be skipped per PACK 206C rules
    console.log(`Skipped optional step: ${step}`);
  };

  if (loading || !progress) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF1744" />
      </View>
    );
  }

  const step1Complete = progress.chatStarted;
  const step2Complete = progress.storiesWatched >= 3;
  const step3Complete = progress.availabilityAdded;
  const step4Complete = progress.eventSaved;
  const requiredStepsComplete = step1Complete && step2Complete;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.dayLabel}>DAY 3 — FINAL STEP</Text>
          <Text style={styles.title}>Heat Up the Connection</Text>
          <Text style={styles.subtitle}>
            Take your connections to the next level
          </Text>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  ((step1Complete ? 1 : 0) + (step2Complete ? 1 : 0)) * 50
                }%`,
              },
            ]}
          />
        </View>

        <View style={styles.stepsContainer}>
          {/* Required Step 1 */}
          <View style={[styles.stepCard, step1Complete && styles.stepCardComplete]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step1Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step1Complete ? '✓' : '1'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>Start your first chat</Text>
                <Text style={styles.stepProgress}>
                  {step1Complete ? 'Chat started' : 'Begin a conversation'}
                </Text>
              </View>
            </View>
            {!step1Complete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate('ChatList' as never)}
              >
                <Text style={styles.actionButtonText}>Open Chat</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Required Step 2 */}
          <View style={[styles.stepCard, step2Complete && styles.stepCardComplete]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step2Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step2Complete ? '✓' : '2'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Watch 3 Stories from people you find attractive
                </Text>
                <Text style={styles.stepProgress}>
                  {progress.storiesWatched} / 3 stories watched
                </Text>
              </View>
            </View>
            {!step2Complete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate('Stories' as never)}
              >
                <Text style={styles.actionButtonText}>View Stories</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Optional Step 3 */}
          <View style={[styles.stepCard, styles.optionalCard, step3Complete && styles.stepCardComplete]}>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalText}>OPTIONAL</Text>
            </View>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step3Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step3Complete ? '✓' : '3'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Add your first availability to the calendar
                </Text>
                <Text style={styles.stepProgress}>
                  {step3Complete ? 'Availability added' : 'Optional — can skip'}
                </Text>
              </View>
            </View>
            {!step3Complete && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={() => handleSkipOptional('availability')}
                >
                  <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
                    Skip
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('Calendar' as never)}
                >
                  <Text style={styles.actionButtonText}>Add Availability</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Optional Step 4 */}
          <View style={[styles.stepCard, styles.optionalCard, step4Complete && styles.stepCardComplete]}>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalText}>OPTIONAL</Text>
            </View>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step4Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step4Complete ? '✓' : '4'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Save one event or add to wishlist
                </Text>
                <Text style={styles.stepProgress}>
                  {step4Complete ? 'Event saved' : 'Optional — can skip'}
                </Text>
              </View>
            </View>
            {!step4Complete && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={() => handleSkipOptional('event')}
                >
                  <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
                    Skip
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('Events' as never)}
                >
                  <Text style={styles.actionButtonText}>Browse Events</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {requiredStepsComplete && (
          <View style={styles.completionCard}>
            <Text style={styles.completionEmoji}>🔥</Text>
            <Text style={styles.completionTitle}>You're ready!</Text>
            <Text style={styles.completionText}>
              Explore freely, flirt freely, and enjoy meeting new people — safely and confidently.
            </Text>
          </View>
        )}
      </ScrollView>

      {requiredStepsComplete && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Enter Avalo</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  header: {
    marginTop: 20,
    marginBottom: 24,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF1744',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 32,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF1744',
    borderRadius: 2,
  },
  stepsContainer: {
    gap: 16,
  },
  stepCard: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  optionalCard: {
    borderColor: '#555',
    borderStyle: 'dashed',
  },
  stepCardComplete: {
    borderColor: '#10B981',
    backgroundColor: '#0a2f1f',
    borderStyle: 'solid',
  },
  optionalBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  optionalText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  stepHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIconComplete: {
    backgroundColor: '#10B981',
  },
  stepIconText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  stepProgress: {
    fontSize: 14,
    color: '#999',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FF1744',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#555',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButtonText: {
    color: '#999',
  },
  completionCard: {
    backgroundColor: '#1a1a1a',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    marginTop: 24,
  },
  completionEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  completionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  completionText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  continueButton: {
    backgroundColor: '#FF1744',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
