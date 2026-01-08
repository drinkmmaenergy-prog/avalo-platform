/**
 * Questions Feed Screen
 * Main Q&A feed with questions sorted by boost score and recency
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import * as questionsService from "@/services/questionsService";
import type { Question } from "@/services/questionsService";

export default function QuestionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [askModalVisible, setAskModalVisible] = useState(false);
  
  // Ask question form state
  const [questionText, setQuestionText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isNSFW, setIsNSFW] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      const result = await questionsService.getQuestionsFeed({ limit: 50 });
      setQuestions(result.questions);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load questions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed();
  };

  const handleAskQuestion = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please log in to ask a question');
      return;
    }

    const validation = questionsService.validateQuestionText(questionText);
    if (!validation.valid) {
      Alert.alert('Invalid Question', validation.error);
      return;
    }

    // Confirm if anonymous (costs tokens)
    if (isAnonymous) {
      Alert.alert(
        'Ask Anonymously',
        `This will cost ${questionsService.QUESTIONS_PRICING.ANONYMOUS_QUESTION} tokens. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Pay & Ask',
            onPress: submitQuestion,
          },
        ]
      );
    } else {
      submitQuestion();
    }
  };

  const submitQuestion = async () => {
    setSubmitting(true);
    try {
      const result = await questionsService.createQuestion({
        text: questionText,
        isAnonymous,
        isNSFW,
      });

      // Close modal and reset form
      setAskModalVisible(false);
      setQuestionText('');
      setIsAnonymous(false);
      setIsNSFW(false);

      if (result.tokensCharged > 0) {
        Alert.alert(
          'Question Posted!',
          `Your anonymous question has been posted. ${result.tokensCharged} tokens charged.`
        );
      } else {
        Alert.alert('Success', 'Your question has been posted!');
      }

      // Refresh feed
      loadFeed();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to post question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuestionPress = (questionId: string) => {
    router.push(`/questions/${questionId}`);
  };

  const renderQuestion = ({ item }: { item: Question }) => (
    <TouchableOpacity
      style={styles.questionCard}
      onPress={() => handleQuestionPress(item.id)}
    >
      <View style={styles.questionHeader}>
        <Text style={styles.authorText}>
          {item.isAnonymous ? '🎭 Anonymous' : item.authorName || 'User'}
        </Text>
        <Text style={styles.timeText}>
          {questionsService.getQuestionAge(item.createdAt)}
        </Text>
      </View>

      {item.targetUserName && (
        <Text style={styles.targetText}>→ Asked to {item.targetUserName}</Text>
      )}

      <Text style={styles.questionText}>{item.text}</Text>

      <View style={styles.badges}>
        {item.isNSFW && <Text style={styles.badge}>🔞 18+</Text>}
        {item.boostScore > 0 && (
          <Text style={styles.badge}>🚀 Boosted {item.boostScore}</Text>
        )}
        {item.tags.map(tag => (
          <Text key={tag} style={styles.badge}>
            #{tag}
          </Text>
        ))}
      </View>

      <View style={styles.questionFooter}>
        <Text style={styles.stat}>💬 {item.answerCount} answers</Text>
        <Text style={styles.stat}>🔓 {item.unlockCount} unlocks</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Questions</Text>
        <TouchableOpacity
          style={styles.askButton}
          onPress={() => {
            if (!user) {
              Alert.alert('Login Required', 'Please log in to ask a question');
              return;
            }
            setAskModalVisible(true);
          }}
        >
          <Text style={styles.askButtonText}>+ Ask</Text>
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <FlatList
        data={questions}
        renderItem={renderQuestion}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No questions yet</Text>
            <Text style={styles.emptySubtext}>Be the first to ask!</Text>
          </View>
        }
      />

      {/* Ask Question Modal */}
      <Modal
        visible={askModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ask a Question</Text>
              <TouchableOpacity onPress={() => setAskModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="What would you like to know?"
              placeholderTextColor="#999"
              value={questionText}
              onChangeText={setQuestionText}
              multiline
              maxLength={500}
              autoFocus
            />

            <Text style={styles.charCount}>
              {questionText.length}/500 characters
            </Text>

            {/* Options */}
            <View style={styles.options}>
              <TouchableOpacity
                style={styles.option}
                onPress={() => setIsAnonymous(!isAnonymous)}
              >
                <Text style={styles.checkbox}>
                  {isAnonymous ? '☑' : '☐'}
                </Text>
                <Text style={styles.optionText}>
                  Ask anonymously ({questionsService.QUESTIONS_PRICING.ANONYMOUS_QUESTION}{' '}
                  tokens)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => setIsNSFW(!isNSFW)}
              >
                <Text style={styles.checkbox}>{isNSFW ? '☑' : '☐'}</Text>
                <Text style={styles.optionText}>Mark as 18+ (NSFW)</Text>
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!questionText.trim() || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleAskQuestion}
              disabled={!questionText.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isAnonymous ? 'Pay & Ask' : 'Ask Question'}
                </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  askButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  askButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  questionCard: {
    backgroundColor: '#FFF',
    padding: 16,
    marginVertical: 4,
    marginHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  timeText: {
    fontSize: 12,
    color: '#999',
  },
  targetText: {
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 16,
    color: '#000',
    marginBottom: 12,
    lineHeight: 22,
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
  questionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    fontSize: 13,
    color: '#666',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
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
    minHeight: 120,
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
