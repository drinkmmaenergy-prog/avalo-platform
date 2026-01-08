/**
 * PACK 110 — Submit Feedback Screen
 * 
 * User-initiated screen for submitting free-form feedback.
 * 
 * CRITICAL CONSTRAINTS:
 * - Always user-initiated, never forced
 * - No implied benefits or rewards
 * - Neutral, helpful tone only
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from "@/lib/firebase";
import { submitFreeFormFeedback } from "@/services/feedbackService";
import Constants from 'expo-constants';

export default function SubmitFeedbackScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedbackText.trim() || !user) return;

    if (feedbackText.trim().length < 10) {
      Alert.alert(
        'Feedback Too Short',
        'Please provide at least 10 characters of feedback to help us understand your thoughts.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Get app version
      const appVersion = Constants.expoConfig?.version || '1.0.0';

      // TODO: Get user's language and region from preferences/locale
      const language = 'en';
      const region = undefined;

      await submitFreeFormFeedback({
        text: feedbackText.trim(),
        language,
        appVersion,
        region,
        platform: Platform.OS as 'ios' | 'android',
      });

      // Show success and navigate back
      Alert.alert(
        'Thank You!',
        'Your feedback helps us improve Avalo.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      
      Alert.alert(
        'Submission Failed',
        error.message || 'Unable to submit feedback. Please try again later.',
        [{ text: 'OK' }]
      );
      
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Submit Feedback',
          headerShown: true,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Info */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="chatbox-ellipses" size={48} color="#3B82F6" />
            </View>
            <Text style={styles.title}>We'd love to hear from you</Text>
            <Text style={styles.description}>
              Share your thoughts, suggestions, or report issues. Your feedback helps us
              make Avalo better for everyone.
            </Text>
          </View>

          {/* Feedback Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Your Feedback</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Tell us what you think..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={10}
              maxLength={5000}
              value={feedbackText}
              onChangeText={setFeedbackText}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
            <View style={styles.inputFooter}>
              <Text style={styles.characterCount}>
                {feedbackText.length}/5000
              </Text>
              {feedbackText.trim().length > 0 && feedbackText.trim().length < 10 && (
                <Text style={styles.minLengthHint}>
                  Minimum 10 characters
                </Text>
              )}
            </View>
          </View>

          {/* Privacy Notice */}
          <View style={styles.privacyNotice}>
            <Ionicons name="shield-checkmark" size={20} color="#6B7280" />
            <Text style={styles.privacyText}>
              Your feedback is confidential and used only for product improvement.
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!feedbackText.trim() || feedbackText.trim().length < 10 || isSubmitting) &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={
              !feedbackText.trim() ||
              feedbackText.trim().length < 10 ||
              isSubmitting
            }
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Submit Feedback</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Guidelines */}
          <View style={styles.guidelines}>
            <Text style={styles.guidelinesTitle}>Feedback Guidelines</Text>
            <View style={styles.guidelineItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.guidelineText}>
                Be specific about what you like or what could be improved
              </Text>
            </View>
            <View style={styles.guidelineItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.guidelineText}>
                Keep feedback constructive and respectful
              </Text>
            </View>
            <View style={styles.guidelineItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.guidelineText}>
                Focus on your experience with the app
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    minHeight: 200,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  characterCount: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  minLengthHint: {
    fontSize: 14,
    color: '#EF4444',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  guidelines: {
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 12,
    gap: 12,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guidelineText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});
