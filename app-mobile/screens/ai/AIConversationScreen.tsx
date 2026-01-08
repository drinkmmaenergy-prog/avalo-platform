/**
 * PACK 48 — AI Conversation Screen
 * Chat interface for AI companions with token-per-message billing
 * PACK 49 — Added AI memory "About You" panel
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  AIMessage,
  subscribeToAIMessages,
  sendAIMessage,
} from '../../services/aiCompanionService';
import {
  fetchAiUserMemory,
  AiUserMemory,
} from '../../services/personalizationService';

export default function AIConversationScreen() {
  const params = useLocalSearchParams();
  const auth = getAuth();
  
  const conversationId = params.conversationId as string;
  const companionId = params.companionId as string;
  const companionName = params.companionName as string;

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [aiMemory, setAiMemory] = useState<AiUserMemory | null>(null);
  const [loadingMemory, setLoadingMemory] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Subscribe to real-time messages
    const unsubscribe = subscribeToAIMessages(
      conversationId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setLoading(false);
      },
      (error) => {
        console.error('[AIConversationScreen] Subscription error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [conversationId]);

  // Load AI memory when screen opens
  useEffect(() => {
    if (auth.currentUser && companionId) {
      loadAiMemory();
    }
  }, [companionId]);

  const loadAiMemory = async () => {
    if (!auth.currentUser) return;
    
    try {
      setLoadingMemory(true);
      const memory = await fetchAiUserMemory(auth.currentUser.uid, companionId);
      setAiMemory(memory);
    } catch (error) {
      console.debug('[PACK 49] AI memory fetch failed (non-blocking)');
    } finally {
      setLoadingMemory(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || !auth.currentUser) {
      return;
    }

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendAIMessage(conversationId, companionId, messageText);
      // Message will appear via real-time listener
    } catch (error: any) {
      console.error('[AIConversationScreen] Send error:', error);
      
      if (error.message === 'INSUFFICIENT_TOKENS') {
        Alert.alert(
          'Insufficient Tokens',
          'You need tokens to send messages. Please purchase tokens to continue.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Buy Tokens',
              onPress: () => {
                // Navigate to token purchase screen
                // router.push('/tokens');
                Alert.alert('Info', 'Token purchase screen coming soon!');
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
      
      // Restore input text on error
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: AIMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isUser ? styles.userText : styles.aiText,
          ]}
        >
          {item.text}
        </Text>
        {!isUser && item.tokenCost > 0 && (
          <Text style={styles.tokenCost}>
            💎 {item.tokenCost} token{item.tokenCost !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* PACK 49: Info button to show AI memory */}
      {aiMemory && (
        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => setShowMemoryPanel(true)}
        >
          <Text style={styles.infoButtonText}>ℹ️ About You</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Start chatting with {companionName}!
            </Text>
            <Text style={styles.emptySubtext}>
              💡 Each message costs tokens
            </Text>
          </View>
        }
      />

      {/* PACK 49: AI Memory Panel Modal */}
      <Modal
        visible={showMemoryPanel}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMemoryPanel(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>What {companionName} Knows About You</Text>
              <TouchableOpacity onPress={() => setShowMemoryPanel(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {aiMemory && (
                <>
                  {aiMemory.memorySummary && (
                    <View style={styles.memorySection}>
                      <Text style={styles.memorySectionTitle}>Summary</Text>
                      <Text style={styles.memoryText}>{aiMemory.memorySummary}</Text>
                    </View>
                  )}
                  
                  {aiMemory.keyFacts.length > 0 && (
                    <View style={styles.memorySection}>
                      <Text style={styles.memorySectionTitle}>Key Facts</Text>
                      {aiMemory.keyFacts.map((fact, index) => (
                        <Text key={index} style={styles.memoryBullet}>• {fact}</Text>
                      ))}
                    </View>
                  )}
                  
                  {aiMemory.interests.length > 0 && (
                    <View style={styles.memorySection}>
                      <Text style={styles.memorySectionTitle}>Your Interests</Text>
                      <View style={styles.tagsContainer}>
                        {aiMemory.interests.map((interest, index) => (
                          <View key={index} style={styles.tag}>
                            <Text style={styles.tagText}>{interest}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  <Text style={styles.memoryFooter}>
                    Based on {aiMemory.totalMessages} messages
                  </Text>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  messagesContainer: {
    padding: 16,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#333',
  },
  tokenCost: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  sendButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  infoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
  },
  modalScroll: {
    padding: 20,
  },
  memorySection: {
    marginBottom: 20,
  },
  memorySectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  memoryText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  memoryBullet: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    color: '#1976D2',
    fontSize: 12,
    fontWeight: '500',
  },
  memoryFooter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },
});
