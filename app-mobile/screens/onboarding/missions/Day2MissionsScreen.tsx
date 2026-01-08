/**
 * PACK 206C — Day 2: Start the Spark
 * Onboarding mission screen for Day 2
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
  completeDay2,
  isDay2Complete,
} from '../../../services/onboardingMissionsService';
import { OnboardingProgress } from '../../../types/onboarding';

export default function Day2MissionsScreen() {
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

      // Check if day 2 is complete
      if (isDay2Complete(progressData) && !progressData.day2Completed) {
        await completeDay2(userId);
        // Enable feed boost (no payment, no tokens - per PACK 206C rules)
        navigation.navigate('OnboardingMissionsDay3' as never);
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (progress && isDay2Complete(progress)) {
      navigation.navigate('OnboardingMissionsDay3' as never);
    }
  };

  if (loading || !progress) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF1744" />
      </View>
    );
  }

  const step1Complete = progress.likesSent >= 6;
  const step2Complete = progress.replySent;
  const step3Complete = progress.firstMessageSent;
  const allStepsComplete = step1Complete && step2Complete && step3Complete;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.dayLabel}>DAY 2</Text>
          <Text style={styles.title}>Start the Spark</Text>
          <Text style={styles.subtitle}>
            Begin meaningful interactions with others
          </Text>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  ((step1Complete ? 1 : 0) +
                    (step2Complete ? 1 : 0) +
                    (step3Complete ? 1 : 0)) *
                  33.33
                }%`,
              },
            ]}
          />
        </View>

        <View style={styles.stepsContainer}>
          <View style={[styles.stepCard, step1Complete && styles.stepCardComplete]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step1Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step1Complete ? '✓' : '1'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Like 6 profiles you find attractive
                </Text>
                <Text style={styles.stepProgress}>
                  {progress.likesSent} / 6 likes sent
                </Text>
              </View>
            </View>
            {!step1Complete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate('DiscoveryFeed' as never)}
              >
                <Text style={styles.actionButtonText}>Browse Profiles</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.stepCard, step2Complete && styles.stepCardComplete]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step2Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step2Complete ? '✓' : '2'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Reply to one person who liked you
                </Text>
                <Text style={styles.stepProgress}>
                  {step2Complete ? 'Reply sent' : 'Check your likes'}
                </Text>
              </View>
            </View>
            {!step2Complete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate('Likes' as never)}
              >
                <Text style={styles.actionButtonText}>View Likes</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.stepCard, step3Complete && styles.stepCardComplete]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, step3Complete && styles.stepIconComplete]}>
                <Text style={styles.stepIconText}>{step3Complete ? '✓' : '3'}</Text>
              </View>
              <View style={styles.stepTextContainer}>
                <Text style={styles.stepTitle}>
                  Send one first message to someone you're interested in
                </Text>
                <Text style={styles.stepProgress}>
                  {step3Complete ? 'Message sent' : 'Start a conversation'}
                </Text>
              </View>
            </View>
            {!step3Complete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate('Matches' as never)}
              >
                <Text style={styles.actionButtonText}>View Matches</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {allStepsComplete && (
          <View style={styles.completionCard}>
            <Text style={styles.completionEmoji}>💫</Text>
            <Text style={styles.completionTitle}>Amazing progress!</Text>
            <Text style={styles.completionText}>
              You're doing great — your profile becomes more visible as you complete missions.
            </Text>
          </View>
        )}
      </ScrollView>

      {allStepsComplete && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue to Day 3</Text>
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
  stepCardComplete: {
    borderColor: '#10B981',
    backgroundColor: '#0a2f1f',
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
  actionButton: {
    backgroundColor: '#FF1744',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
