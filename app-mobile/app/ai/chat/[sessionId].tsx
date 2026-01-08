/**
 * PACK 340 - AI Chat Screen (Mobile)
 * Live chat interface with token tracking
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getAIChatSession,
  sendAIChatMessage,
  endAIChatSession,
  type AIChatSession,
  type AIChatMessage,
  formatTokens,
  formatDuration,
} from '@/types/aiCompanion';

export default function AIChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<AIChatSession | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [startTime] = useState(Date.now());
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Animated token counter
  const tokenAnim = useRef(new Animated.Value(0)).current;

  // Timer for session duration
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId]);

  // Animate token counter when tokensSpent changes
  useEffect(() => {
    if (session) {
      Animated.spring(tokenAnim, {
        toValue: session.tokensSpent,
        useNativeDriver: true,
        friction: 5,
      }).start();
    }
  }, [session?.tokensSpent]);

  const loadSession = async () => {
    try {
      setLoading(true);
      const data = await getAIChatSession(sessionId);
      setSession(data);
      setMessages(data.messages);
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load chat session');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !session || sending) return;

    const messageContent = inputText.trim();
    setInputText('');

    try {
      setSending(true);

      // Optimistically add user message
      const tempUserMessage: AIChatMessage = {
        messageId: `temp-${Date.now()}`,
        sessionId,
        sender: 'USER',
        content: messageContent,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      // Send to backend
      const result = await sendAIChatMessage(sessionId, messageContent);

      // Replace temp message and add AI response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.messageId !== tempUserMessage.messageId);
        return [...filtered, result.userMessage, result.aiResponse];
      });

      // Update session tokens
      setSession((prev) =>
        prev
          ? {
              ...prev,
              tokensSpent: prev.tokensSpent + result.tokensUsed,
              remainingWords: result.remaining,
            }
          : null
      );
    } catch (error: any) {
      console.error('Error sending message:', error);

      // Check for specific errors
      if (error.code === 'INSUFFICIENT_TOKENS') {
        Alert.alert(
          'Insufficient Tokens',
          'You need more tokens to continue this conversation.',
          [
            { text: 'End Session', onPress: handleEndSession },
            { text: 'Buy Tokens', onPress: () => router.push('/wallet' as any) },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to send message');
      }

      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => !m.messageId.startsWith('temp-')));
    } finally {
      setSending(false);
    }
  };

  const handleEndSession = () => {
    Alert.alert(
      'End Session',
      'Are you sure you want to end this chat session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              const summary = await endAIChatSession(sessionId);
              
              // Show summary
              Alert.alert(
                'Session Ended',
                `Tokens spent: ${formatTokens(summary.tokensSpent)}\nDuration: ${formatDuration(summary.durationSeconds)}\nMessages: ${summary.messageCount}`,
                [
                  {
                    text: 'Rate Experience',
                    onPress: () => {
                      // TODO: Navigate to rating screen
                      router.back();
                    },
                  },
                ]
              );
            } catch (error) {
              console.error('Error ending session:', error);
              router.back();
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item }: { item: AIChatMessage }) => {
    const isUser = item.sender === 'USER';

    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
          {item.content}
        </Text>
        {item.tokensUsed && (
          <Text style={styles.tokenUsage}>
            {formatTokens(item.tokensUsed)} tokens
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Session not found</Text>
      </View>
    );
  }

  const durationSeconds = Math.floor((currentTime - startTime) / 1000);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header with token counter */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>AI Chat Session</Text>
          <Text style={styles.headerSubtitle}>{formatDuration(durationSeconds)}</Text>
        </View>

        <View style={styles.tokenCounter}>
          <Text style={styles.tokenLabel}>Tokens Spent</Text>
          <Text style={styles.tokenValue}>{formatTokens(session.tokensSpent)}</Text>
          {session.remainingWords !== undefined && (
            <Text style={styles.remainingWords}>
              {session.remainingWords} words left
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.endButton} onPress={handleEndSession}>
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.messageId}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        inverted={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Start the conversation...</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          placeholderTextColor="#8E8E93"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          editable={!sending}
        />

        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* No refund warning */}
      <View style={styles.warningBanner}>
        <Text style={styles.warningText}>
          ⚠️ No refunds after session start · Tokens deducted per message
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  tokenCounter: {
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
  },
  tokenLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 4,
  },
  tokenValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  remainingWords: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
  },
  endButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
  },
  endButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#000000',
  },
  tokenUsage: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    fontSize: 15,
    color: '#000000',
    marginRight: 8,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningBanner: {
    padding: 8,
    backgroundColor: '#FFF3CD',
  },
  warningText: {
    fontSize: 11,
    color: '#856404',
    textAlign: 'center',
  },
});
