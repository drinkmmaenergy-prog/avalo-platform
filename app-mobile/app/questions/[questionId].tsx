/**
 * Question Detail Screen
 * Shows full question, answers, and allows answering/unlocking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import * as questionsService from '../../services/questionsService';
import type { QuestionDetailResult, Answer } from '../../services/questionsService';

export default function QuestionDetailScreen() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<QuestionDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerModalVisible, setAnswerModalVisible] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [isPaidAnswer, setIsPaidAnswer] = useState(true);
  const [isNSFWAnswer, setIsNSFWAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (questionId) {
      loadQuestion();
    }
  }, [questionId]);

  const loadQuestion = async () => {
    try {
      const result = await questionsService.getQuestionDetail(questionId);
      setData(result);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load question');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAnswer = async (answerId: string) => {
    if (!user) {
      Alert.alert('Login Required', 'Please log in to unlock answers');
      return;
    }

    Alert.alert(
      'Unlock Answer',
      `This will cost ${questionsService.QUESTIONS_PRICING.ANSWER_UNLOCK} tokens. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock',
          onPress: async () => {
            try {
              await questionsService.unlockAnswer({
                answerId,
                questionId,
              });

              Alert.alert('Success', 'Answer unlocked!');
              loadQuestion(); // Refresh to show unlocked answer
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to unlock answer');
            }
          },
        },
      ]
    );
  };

  const handleBoost = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please log in to boost questions');
      return;
    }

    Alert.alert(
      'Boost Question',
      `This will cost ${questionsService.QUESTIONS_PRICING.BOOST} tokens and increase visibility. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Boost',
          onPress: async () => {
            try {
              const result = await questionsService.boostQuestion({
                questionId,
              });

              Alert.alert(
                'Success',
                `Question boosted! New boost score: ${result.newBoostScore}`
              );
              loadQuestion(); // Refresh to show new boost score
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to boost question');
            }
          },
        },
      ]
    );
  };

  const handleSubmitAnswer = async () => {
    const validation = questionsService.validateAnswerText(answerText);
    if (!validation.valid) {
      Alert.alert('Invalid Answer', validation.error);
      return;
    }

    setSubmitting(true);
    try {
      await questionsService.answerQuestion({
        questionId,
        text: answerText,
        isPaid: isPaidAnswer,
        isNSFW: isNSFWAnswer,
      });

      setAnswerModalVisible(false);
      setAnswerText('');
      setIsPaidAnswer(true);
      setIsNSFWAnswer(false);

      Alert.alert('Success', 'Your answer has been posted!');
      loadQuestion(); // Refresh to show new answer
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to post answer');
    } finally {
      setSubmitting(false);
    }
  };

  const renderAnswer = (answer: Answer) => {
    const isUnlocked = answer.isUnlocked || !answer.isPaid;
    const canView = isUnlocked || data?.userAnswerUnlocks.includes(answer.id);

    return (
      <View key={answer.id} style={styles.answerCard}>
        <View style={styles.answerHeader}>
          <Text style={styles.answerAuthor}>{answer.authorName}</Text>
          <Text style={styles.answerTime}>
            {questionsService.getQuestionAge(answer.createdAt)}
          </Text>
        </View>

        {canView ? (
          <Text style={styles.answerText}>{answer.text}</Text>
        ) : (
          <View>
            <Text style={styles.answerSnippet}>{answer.snippet}</Text>
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={() => handleUnlockAnswer(answer.id)}
            >
              <Text style={styles.unlockButtonText}>
                🔒 Unlock Answer ({questionsService.QUESTIONS_PRICING.ANSWER_UNLOCK} tokens)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.answerFooter}>
          {answer.isPaid && <Text style={styles.answerBadge}>💰 Paid</Text>}
          {answer.isNSFW && <Text style={styles.answerBadge}>🔞 18+</Text>}
          <Text style={styles.answerStat}>
            🔓 {answer.unlockCount} unlocks
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Question not found</Text>
      </View>
    );
  }

  const { question, canAnswer, canBoost } = data;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        {canBoost && (
          <TouchableOpacity onPress={handleBoost} style={styles.boostButton}>
            <Text style={styles.boostButtonText}>
              🚀 Boost ({questionsService.QUESTIONS_PRICING.BOOST} tokens)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Question */}
        <View style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.authorText}>
              {question.isAnonymous ? '🎭 Anonymous' : question.authorName || 'User'}
            </Text>
            <Text style={styles.timeText}>
              {questionsService.getQuestionAge(question.createdAt)}
            </Text>
          </View>

          {question.targetUserName && (
            <Text style={styles.targetText}>
              → Asked to {question.targetUserName}
            </Text>
          )}

          <Text style={styles.questionText}>{question.text}</Text>

          <View style={styles.badges}>
            {question.isNSFW && <Text style={styles.badge}>🔞 18+</Text>}
            {question.boostScore > 0 && (
              <Text style={styles.badge}>🚀 Boosted {question.boostScore}</Text>
            )}
            {question.tags.map(tag => (
              <Text key={tag} style={styles.badge}>
                #{tag}
              </Text>
            ))}
          </View>

          <View style={styles.questionStats}>
            <Text style={styles.stat}>💬 {question.answerCount} answers</Text>
            <Text style={styles.stat}>🔓 {question.unlockCount} unlocks</Text>
          </View>
        </View>

        {/* Answer Button */}
        {canAnswer && (
          <TouchableOpacity
            style={styles.answerPromptButton}
            onPress={() => {
              if (!user) {
                Alert.alert('Login Required', 'Please log in to answer');
                return;
              }
              setAnswerModalVisible(true);
            }}
          >
            <Text style={styles.answerPromptButtonText}>✍️ Write an answer</Text>
          </TouchableOpacity>
        )}

        {/* Answers Section */}
        <View style={styles.answersSection}>
          <Text style={styles.sectionTitle}>
            Answers ({question.answerCount})
          </Text>

          {question.answers.length === 0 ? (
            <View style={styles.noAnswers}>
              <Text style={styles.noAnswersText}>No answers yet</Text>
              <Text style={styles.noAnswersSubtext}>Be the first to answer!</Text>
            </View>
          ) : (
            question.answers.map(renderAnswer)
          )}
        </View>
      </ScrollView>

      {/* Answer Modal */}
      <Modal
        visible={answerModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAnswerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Write Your Answer</Text>
              <TouchableOpacity onPress={() => setAnswerModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Share your knowledge..."
              placeholderTextColor="#999"
              value={answerText}
              onChangeText={setAnswerText}
              multiline
              maxLength={2000}
              autoFocus
            />

            <Text style={styles.charCount}>
              {answerText.length}/2000 characters
            </Text>

            {/* Options */}
            <View style={styles.options}>
              <TouchableOpacity
                style={styles.option}
                onPress={() => setIsPaidAnswer(!isPaidAnswer)}
              >
                <Text style={styles.checkbox}>{isPaidAnswer ? '☑' : '☐'}</Text>
                <Text style={styles.optionText}>
                  Paid answer (viewers pay to unlock)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => setIsNSFWAnswer(!isNSFWAnswer)}
              >
                <Text style={styles.checkbox}>{isNSFWAnswer ? '☑' : '☐'}</Text>
                <Text style={styles.optionText}>Mark as 18+ (NSFW)</Text>
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!answerText.trim() || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitAnswer}
              disabled={!answerText.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Post Answer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  boostButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  boostButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  questionCard: {
    backgroundColor: '#FFF',
    padding: 16,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  timeText: {
    fontSize: 13,
    color: '#999',
  },
  targetText: {
    fontSize: 13,
    color: '#007AFF',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    color: '#000',
    marginBottom: 12,
    lineHeight: 26,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  badge: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  questionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    fontSize: 13,
    color: '#666',
  },
  answerPromptButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  answerPromptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  answersSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  noAnswers: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noAnswersText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  noAnswersSubtext: {
    fontSize: 14,
    color: '#999',
  },
  answerCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginBottom: 12,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  answerAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  answerTime: {
    fontSize: 12,
    color: '#999',
  },
  answerText: {
    fontSize: 15,
    color: '#000',
    lineHeight: 22,
    marginBottom: 12,
  },
  answerSnippet: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  unlockButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  unlockButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  answerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  answerBadge: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  answerStat: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 150,
    textAlignVertical: 'top',
    color: '#000',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  options: {
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    fontSize: 20,
    marginRight: 8,
    color: '#007AFF',
  },
  optionText: {
    fontSize: 15,
    color: '#000',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});