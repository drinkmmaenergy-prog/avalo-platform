/**
 * PACK 198 — Live Event Viewer
 * Real-time event participation with chat, Q&A, and translation
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { Ionicons } from '@expo/vector-icons';

interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  timestamp: Timestamp;
  hidden: boolean;
  toxicityScore: number;
}

interface Question {
  id: string;
  userId: string;
  question: string;
  upvotes: number;
  status: 'pending' | 'answered' | 'dismissed';
}

export default function LiveEvent() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [messageText, setMessageText] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'qa'>('chat');
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  useEffect(() => {
    if (!auth.currentUser) {
      router.back();
      return;
    }

    const messagesQuery = query(
      collection(db, 'event_chat_logs'),
      where('eventId', '==', id),
      where('hidden', '==', false),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];
      setMessages(messagesData);
    });

    const questionsQuery = query(
      collection(db, 'event_questions'),
      where('eventId', '==', id),
      where('status', '==', 'pending'),
      orderBy('priority', 'desc')
    );

    const unsubscribeQuestions = onSnapshot(questionsQuery, (snapshot) => {
      const questionsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Question[];
      setQuestions(questionsData);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeQuestions();
    };
  }, [id]);

  const sendMessage = async () => {
    if (!messageText.trim() || !auth.currentUser) return;

    try {
      await addDoc(collection(db, 'event_chat_logs'), {
        eventId: id,
        userId: auth.currentUser.uid,
        content: messageText.trim(),
        type: 'text',
        timestamp: Timestamp.now(),
        hidden: false,
        flagged: false,
        toxicityScore: 0,
      });

      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const submitQuestion = async () => {
    if (!questionText.trim() || !auth.currentUser) return;

    try {
      await addDoc(collection(db, 'event_questions'), {
        eventId: id,
        userId: auth.currentUser.uid,
        question: questionText.trim(),
        status: 'pending',
        upvotes: 0,
        upvotedBy: [],
        isPaid: false,
        priority: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setQuestionText('');
    } catch (error) {
      console.error('Error submitting question:', error);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <View style={styles.messageHeader}>
        <Text style={styles.messageUser}>User {item.userId.substring(0, 8)}</Text>
        <Text style={styles.messageTime}>
          {item.timestamp.toDate().toLocaleTimeString()}
        </Text>
      </View>
      <Text style={styles.messageContent}>{item.content}</Text>
    </View>
  );

  const renderQuestion = ({ item }: { item: Question }) => (
    <View style={styles.questionContainer}>
      <View style={styles.questionHeader}>
        <Text style={styles.questionUser}>User {item.userId.substring(0, 8)}</Text>
        <View style={styles.upvoteContainer}>
          <Ionicons name="arrow-up" size={16} color="#007AFF" />
          <Text style={styles.upvoteCount}>{item.upvotes}</Text>
        </View>
      </View>
      <Text style={styles.questionContent}>{item.question}</Text>
      {item.status === 'pending' && (
        <Text style={styles.questionStatus}>Waiting for answer...</Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.languageButton}>
            <Ionicons name="globe" size={20} color="#fff" />
            <Text style={styles.languageText}>{selectedLanguage.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.videoPlaceholder}>
        <Ionicons name="videocam" size={64} color="#8E8E93" />
        <Text style={styles.videoPlaceholderText}>Event Stream</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Ionicons
            name="chatbubbles"
            size={20}
            color={activeTab === 'chat' ? '#007AFF' : '#8E8E93'}
          />
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Chat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'qa' && styles.tabActive]}
          onPress={() => setActiveTab('qa')}
        >
          <Ionicons
            name="help-circle"
            size={20}
            color={activeTab === 'qa' ? '#007AFF' : '#8E8E93'}
          />
          <Text style={[styles.tabText, activeTab === 'qa' && styles.tabTextActive]}>Q&A</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'chat' ? (
        <>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.messagesList}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#8E8E93"
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!messageText.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <FlatList
            data={questions}
            keyExtractor={(item) => item.id}
            renderItem={renderQuestion}
            contentContainerStyle={styles.questionsList}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Ask a question..."
              placeholderTextColor="#8E8E93"
              value={questionText}
              onChangeText={setQuestionText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendButton, !questionText.trim() && styles.sendButtonDisabled]}
              onPress={submitQuestion}
              disabled={!questionText.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#1C1C1E',
  },
  backButton: {
    padding: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  languageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 4,
  },
  videoPlaceholder: {
    height: 200,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 6,
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 16,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageUser: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  messageTime: {
    fontSize: 10,
    color: '#8E8E93',
  },
  messageContent: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  questionsList: {
    padding: 16,
  },
  questionContainer: {
    backgroundColor: '#1C1C1E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionUser: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  upvoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upvoteCount: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
  },
  questionContent: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    marginBottom: 8,
  },
  questionStatus: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#2C2C2E',
  },
});