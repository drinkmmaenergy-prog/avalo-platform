/**
 * Individual AI Chat Screen
 * Real-time chat interface with AI companion
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCompanionById,
  sendAIMessage,
  subscribeToAIMessages,
  AIMessage,
  AICompanion,
} from '../../services/aiChatService';
import { getAIMessageCost } from '../../config/monetization';
import { getTokenBalance } from '../../services/tokenService';
import { TokenBadge } from '../../components/TokenBadge';
import { TokenPurchaseModal } from '../../components/TokenPurchaseModal';

export default function AIChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const [companion, setCompanion] = useState<AICompanion | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showTokenModal, setShowTokenModal] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id || !user?.uid) return;

    // Load companion details
    const companionData = getCompanionById(id);
    if (!companionData) {
      Alert.alert('Error', 'AI Companion not found');
      router.back();
      return;
    }
    setCompanion(companionData);
    setLoading(false);

    // Load token balance
    loadTokenBalance();

    // Subscribe to messages
    const chatId = `ai_${user.uid}_${id}`;
    const unsubscribe = subscribeToAIMessages(
      chatId,
      (newMessages) => {
        setMessages(newMessages);
        // Scroll to bottom when new messages arrive
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (error) => {
        console.error('Error in messages subscription:', error);
      }
    );

    return () => unsubscribe();
  }, [id, user?.uid]);

  const loadTokenBalance = async () => {
    if (!user?.uid) return;
    try {
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !companion || !user?.uid || sending) return;

    const messageCost = getAIMessageCost(companion.tier);
    
    // Check balance
    if (tokenBalance < messageCost) {
      setShowTokenModal(true);
      return;
    }

    setSending(true);
    const messageText = inputText.trim();
    setInputText('');

    try {
      await sendAIMessage(user.uid, companion.id, messageText);
      await loadTokenBalance();
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      if (error.message === 'INSUFFICIENT_BALANCE') {
        setShowTokenModal(true);
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
    const isUser = item.senderId === 'user';
    
    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.aiMessage,
        ]}
      >
        <Text style={[styles.messageText, isUser && styles.userMessageText]}>
          {item.text}
        </Text>
        {item.tokensCost && item.tokensCost > 0 && (
          <Text style={styles.costLabel}>-{item.tokensCost} tokens</Text>
        )}
      </View>
    );
  };

  if (loading || !companion) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  const messageCost = getAIMessageCost(companion.tier);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.companionAvatar}>{companion.avatar}</Text>
          <View>
            <Text style={styles.companionName}>{companion.name}</Text>
            <Text style={styles.tierLabel}>
              {companion.tier.toUpperCase()} • {messageCost} token{messageCost > 1 ? 's' : ''}/msg
            </Text>
          </View>
        </View>
        <TokenBadge />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Message ${companion.name}...`}
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showTokenModal}
        onClose={() => {
          setShowTokenModal(false);
          loadTokenBalance();
        }}
        reason={`You need ${messageCost} tokens to send a message to ${companion.name}`}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 28,
    color: '#FF6B6B',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  companionAvatar: {
    fontSize: 36,
    marginRight: 12,
  },
  companionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  tierLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF6B6B',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  userMessageText: {
    color: '#fff',
  },
  costLabel: {
    fontSize: 10,
    color: '#fff',
    marginTop: 4,
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 16,
    color: '#000',
  },
  sendButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});