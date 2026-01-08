/**
 * PACK 423 — NPS Survey Modal
 * "How likely are you to recommend Avalo?" (0-10 scale)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface NpsModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export const NpsModal: React.FC<NpsModalProps> = ({
  visible,
  onClose,
  onComplete,
}) => {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (score === null) {
      Alert.alert('Required', 'Please select a score');
      return;
    }

    try {
      setIsSubmitting(true);

      const functions = getFunctions();
      const createNps = httpsCallable(functions, 'pack423_createNpsResponse');

      await createNps({
        score,
        comment: comment.trim() || undefined,
        channel: 'IN_APP_MODAL',
        locale: 'en',
        platform: 'IOS', // TODO: detect platform
      });

      Alert.alert('Thank you!', 'Your feedback helps us improve');
      onComplete?.();
      onClose();
    } catch (error: any) {
      console.error('Error submitting NPS:', error);
      Alert.alert('Error', error.message || 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScoreColor = (s: number) => {
    if (s <= 6) return '#F44336'; // Detractor
    if (s <= 8) return '#FF9800'; // Passive
    return '#4CAF50'; // Promoter
  };

  const getScoreLabel = () => {
    if (score === null) return '';
    if (score <= 6) return 'Not likely';
    if (score <= 8) return 'Somewhat likely';
    return 'Very likely';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>

          <ScrollView>
            <Text style={styles.title}>
              How likely are you to recommend Avalo to a friend?
            </Text>

            <View style={styles.scaleContainer}>
              <View style={styles.scaleRow}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.scoreButton,
                      score === num && {
                        backgroundColor: getScoreColor(num),
                        borderColor: getScoreColor(num),
                      },
                    ]}
                    onPress={() => setScore(num)}
                  >
                    <Text
                      style={[
                        styles.scoreText,
                        score === num && styles.scoreTextSelected,
                      ]}
                    >
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.scaleLabelRow}>
                <Text style={styles.scaleLabel}>Not at all likely</Text>
                <Text style={styles.scaleLabel}>Extremely likely</Text>
              </View>

              {score !== null && (
                <Text style={[styles.scoreLabel, { color: getScoreColor(score) }]}>
                  {getScoreLabel()}
                </Text>
              )}
            </View>

            <View style={styles.commentSection}>
              <Text style={styles.commentLabel}>
                What's the main reason for your score? (Optional)
              </Text>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Tell us more..."
                placeholderTextColor="#999999"
                multiline
                maxLength={300}
              />
              <Text style={styles.charCount}>{comment.length}/300</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (score === null || isSubmitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={score === null || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Feedback</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.laterButtonText}>Maybe later</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    color: '#000000',
  },
  scaleContainer: {
    marginBottom: 24,
  },
  scaleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scoreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  scoreTextSelected: {
    color: '#FFFFFF',
  },
  scaleLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  scaleLabel: {
    fontSize: 12,
    color: '#666666',
  },
  scoreLabel: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  commentSection: {
    marginBottom: 24,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000000',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
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
  laterButton: {
    padding: 16,
    alignItems: 'center',
  },
  laterButtonText: {
    color: '#999999',
    fontSize: 16,
  },
});
