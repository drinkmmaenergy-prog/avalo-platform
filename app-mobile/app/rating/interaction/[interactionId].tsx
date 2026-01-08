/**
 * PACK 423 — Interaction Rating Screen
 * Post-interaction rating flow
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StarRatingBar } from '../../../components/rating/StarRatingBar';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

export default function InteractionRatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { interactionId, interactionType, targetUserId, targetCompanionId } = params;

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        Alert.alert('Error', 'You must be logged in to rate');
        return;
      }

      const functions = getFunctions();
      const createRating = httpsCallable(functions, 'pack423_createInteractionRating');

      await createRating({
        interactionType,
        interactionId,
        raterUserId: user.uid,
        targetUserId: targetUserId || undefined,
        targetCompanionId: targetCompanionId || undefined,
        rating,
        comment: comment.trim() || undefined,
        isAnonymous,
        source: 'POST_FLOW',
        locale: 'en',
        platform: 'IOS', // TODO: detect platform
      });

      Alert.alert('Thank you!', 'Your rating has been submitted', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error('Error submitting rating:', error);
      Alert.alert('Error', error.message || 'Failed to submit rating');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Rate Your Experience</Text>
        <Text style={styles.subtitle}>
          Help us improve by sharing your feedback
        </Text>

        <View style={styles.ratingSection}>
          <Text style={styles.label}>How was your experience?</Text>
          <StarRatingBar
            rating={rating}
            onRatingChange={setRating}
          />
        </View>

        <View style={styles.commentSection}>
          <Text style={styles.label}>
            Any additional comments? (Optional)
          </Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Share your thoughts..."
            placeholderTextColor="#999999"
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        <TouchableOpacity
          style={styles.anonymousButton}
          onPress={() => setIsAnonymous(!isAnonymous)}
        >
          <View style={[styles.checkbox, isAnonymous && styles.checkboxChecked]}>
            {isAnonymous && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.anonymousText}>Submit anonymously</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Rating</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={isSubmitting}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#000000',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    marginBottom: 32,
  },
  ratingSection: {
    marginBottom: 32,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#000000',
  },
  commentSection: {
    marginBottom: 24,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#000000',
  },
  charCount: {
    textAlign: 'right',
    marginTop: 8,
    fontSize: 12,
    color: '#999999',
  },
  anonymousButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  anonymousText: {
    fontSize: 16,
    color: '#000000',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    padding: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#999999',
    fontSize: 16,
  },
});
