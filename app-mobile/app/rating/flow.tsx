/**
 * PACK 411 — In-App Rating Flow (Mobile)
 * UI component for rating prompts and feedback collection
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { RatingPromptDecision } from "@/shared/types/pack411-reviews";
import {
  logRatingPrompt,
  createFeedbackTicket,
} from './trigger';

interface RatingFlowProps {
  decision: RatingPromptDecision;
  onClose: () => void;
}

export function RatingFlow({ decision, onClose }: RatingFlowProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRatingSelect = async (rating: number) => {
    setSelectedRating(rating);

    // Log selection
    await logRatingPrompt(
      decision,
      `RATED_${rating}` as any,
      false
    );

    // High ratings (4-5) -> redirect to store
    if (rating >= 4) {
      setTimeout(() => {
        redirectToStore(rating);
      }, 500);
    }
  };

  const redirectToStore = async (rating: number) => {
    try {
      // Log redirect
      await logRatingPrompt(
        decision,
        `RATED_${rating}` as any,
        true
      );

      // Platform-specific store URLs
      const storeUrl = Platform.select({
        ios: 'itms-apps://apps.apple.com/app/idYOUR_APP_ID', // Replace with actual App ID
        android: 'market://details?id=com.avalo.app', // Replace with actual package name
      });

      if (storeUrl) {
        await Linking.openURL(storeUrl);
      }

      onClose();
    } catch (error) {
      console.error('Error opening store:', error);
      Alert.alert('Error', 'Could not open app store');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!selectedRating || selectedRating >= 4) {
      return;
    }

    setSubmitting(true);

    try {
      const ticketId = await createFeedbackTicket(
        selectedRating as 1 | 2 | 3,
        feedback
      );

      if (ticketId) {
        await logRatingPrompt(
          decision,
          'FEEDBACK',
          false,
          ticketId
        );

        Alert.alert(
          'Thank you!',
          'Your feedback has been submitted. We\'ll work on improving your experience.',
          [{ text: 'OK', onPress: onClose }]
        );
      } else {
        throw new Error('Failed to create ticket');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      Alert.alert(
        'Error',
        'Could not submit feedback. Please try again later.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    await logRatingPrompt(decision, 'DISMISSED', false);
    onClose();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <Text style={styles.title}>Enjoying Avalo?</Text>
        <Text style={styles.subtitle}>
          {selectedRating && selectedRating < 4
            ? 'We\'re sorry to hear that. Please tell us what we can improve.'
            : 'Rate your experience with us!'}
        </Text>

        {/* Star Rating */}
        {!selectedRating && (
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                style={styles.star}
                onPress={() => handleRatingSelect(star)}
              >
                <Text style={styles.starIcon}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Feedback form for low ratings */}
        {selectedRating && selectedRating < 4 && (
          <View style={styles.feedbackContainer}>
            <Text style={styles.feedbackLabel}>
              What can we do better?
            </Text>
            <TextInput
              style={styles.feedbackInput}
              multiline
              numberOfLines={4}
              placeholder="Tell us what went wrong..."
              value={feedback}
              onChangeText={setFeedback}
              editable={!submitting}
            />
            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitFeedback}
              disabled={submitting || !feedback.trim()}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dismiss button */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
        >
          <Text style={styles.dismissButtonText}>
            {selectedRating && selectedRating < 4 ? 'Skip' : 'Not Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  star: {
    padding: 8,
  },
  starIcon: {
    fontSize: 40,
    color: '#FFD700',
  },
  feedbackContainer: {
    marginBottom: 16,
  },
  feedbackLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#D0D0D0',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dismissButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#999999',
  },
});

