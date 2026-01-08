/**
 * PACK 279C - AI Chat Screen
 * Full AI chat interface with real-time token cost display
 * 
 * Features:
 * - Text + voice message support
 * - Real-time token cost display
 * - Auto token top-up when balance low
 * - Live pricing per bucket (100 tokens)
 * - Session exit behavior (mark inactive, not closed)
 * 
 * Uses PACK 279A logic (chatMonetization.ts)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  tokensCost: number;
  wasFree: boolean;
  wordCount: number;
}

interface ChatSession {
  chatId: string;
  botId: string;
  botName: string;
  botAvatar: string;
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED';
  tokenBalance: number;
  wordsPerToken: number; // 7 for Royal, 11 for Standard
  isRoyalMember: boolean;
}

export default function AIChatScreen() {
  const router = useRouter();
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const flatListRef = useRef<FlatList>(null);
  const appState = useRef(AppState.currentState);

  // State
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);

  useEffect(() => {
    initializeChat();
  }, [botId]);

  useEffect(() => {
    // Auto-scroll on new messages
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - mark session as inactive
        handleSessionPause();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Auto-show token modal when balance < 100
    if (session && session.tokenBalance < 100 && session.state === 'PAID_ACTIVE') {
      setShowTokenModal(true);
    }
  }, [session?.tokenBalance]);

  const initializeChat = async () => {
    try {
      // TODO: Call pack279_aiChatSendMessage logic
      // const chatSession = await initializeAIChat(botId);
      
      // Mock session for now
      const mockSession: ChatSession = {
        chatId: `chat_${botId}_${Date.now()}`,
        botId,
        botName: 'Luna',
        botAvatar: '🌙',
        state: 'FREE_ACTIVE',
        tokenBalance: 0,
        wordsPerToken: 11, // Standard tier
        isRoyalMember: false,
      };

      setSession(mockSession);

      // Welcome message
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'ai',
        content: `Hi! I'm ${mockSession.botName}. How can I help you today?`,
        timestamp: new Date(),
        tokensCost: 0,
        wasFree: true,
        wordCount: 0,
      };
      setMessages([welcomeMsg]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start chat');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !session || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
      wordCount: countWords(inputText.trim()),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSending(true);
    setIsTyping(true);

    try {
      // TODO: Call pack279_aiChatSendMessage
      // const result = await pack279_aiChatSendMessage(session.chatId, userMessage.content);

      // Mock AI response
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const aiResponseText = "That's an interesting question! Let me help you with that...";
      const wordCount = countWords(aiResponseText);
      const tokenCost = Math.round(wordCount / session.wordsPerToken);

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: aiResponseText,
        timestamp: new Date(),
        tokensCost: tokenCost,
        wasFree: false,
        wordCount,
      };

      setIsTyping(false);
      setMessages(prev => [...prev, aiMessage]);

      // Deduct tokens
      setSession(prev => prev ? {
        ...prev,
        tokenBalance: Math.max(0, prev.tokenBalance - tokenCost),
      } : null);

    } catch (error: any) {
      setIsTyping(false);
      Alert.alert('Error', error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSessionPause = async () => {
    // Mark session as inactive but not closed
    // User can resume from AI Chat List
    if (session) {
      // TODO: Update Firestore session status to 'inactive'
      console.log('Session marked as inactive:', session.chatId);
    }
  };

  const handleBackPress = () => {
    // On back press, mark as inactive
    handleSessionPause();
    router.back();
  };

  const countWords = (text: string): number => {
    // Remove URLs
    const withoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
    // Remove emojis (basic)
    const withoutEmojis = withoutUrls.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
    // Split and count
    return withoutEmojis.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    
    return (
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.aiBubble,
      ]}>
        <Text style={[
          styles.messageText,
          isUser ? styles.userText : styles.aiText,
          isDark && (isUser ? styles.userTextDark : styles.aiTextDark),
        ]}>
          {item.content}
        </Text>
        
        {!isUser && item.tokensCost > 0 && (
          <View style={styles.costIndicator}>
            <Text style={styles.costText}>
              🪙 {item.tokensCost} tokens ({item.wordCount} words)
            </Text>
          </View>
        )}
        
        {item.wasFree && (
          <View style={styles.freeBadge}>
            <Text style={styles.freeText}>FREE</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
          Connecting...
        </Text>
      </View>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.botAvatar}>{session.botAvatar}</Text>
          <View style={styles.headerText}>
            <Text style={[styles.botName, isDark && styles.textDark]}>
              {session.botName}
            </Text>
            <Text style={[styles.botStatus, isDark && styles.textSecondaryDark]}>
              {isTyping ? 'typing...' : 'online'}
            </Text>
          </View>
        </View>

        {/* Token Balance */}
        <View style={styles.walletBadge}>
          <Text style={styles.walletText}>🪙 {session.tokenBalance}</Text>
        </View>
      </View>

      {/* Pricing Info Banner */}
      <View style={[styles.pricingBanner, isDark && styles.pricingBannerDark]}>
        <Text style={[styles.pricingText, isDark && styles.textSecondaryDark]}>
          {session.isRoyalMember ? '♛ Royal' : 'Standard'}: {session.wordsPerToken} words per 100 tokens
        </Text>
      </View>

      {/* No Refund Notice */}
      <View style={[styles.noticeBanner, isDark && styles.noticeBannerDark]}>
        <Text style={[styles.noticeText, isDark && styles.textSecondaryDark]}>
          ⚠️ All AI chat usage is billed per word bucket. Unused words are not refundable.
        </Text>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing Indicator */}
      {isTyping && (
        <View style={styles.typingContainer}>
          <View style={[styles.messageBubble, styles.aiBubble]}>
            <Text style={styles.typingDots}>●●●</Text>
          </View>
        </View>
      )}

      {/* Input Bar */}
      <View style={[styles.inputBar, isDark && styles.inputBarDark]}>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Type a message..."
          placeholderTextColor="#8E8E93"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
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
          <Text style={styles.sendButtonText}>
            {sending ? '...' : '➤'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Token Store Modal (placeholder) */}
      {showTokenModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, isDark && styles.modalDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>
              Low Token Balance
            </Text>
            <Text style={[styles.modalText, isDark && styles.textSecondaryDark]}>
              You have {session.tokenBalance} tokens remaining. Add more to continue chatting.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowTokenModal(false);
                // TODO: Navigate to token store
                Alert.alert('Token Store', 'Token purchase coming soon!');
              }}
            >
              <Text style={styles.modalButtonText}>Buy Tokens</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButtonSecondary}
              onPress={() => setShowTokenModal(false)}
            >
              <Text style={styles.modalButtonSecondaryText}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  botAvatar: {
    fontSize: 32,
    marginRight: 8,
  },
  headerText: {
    flex: 1,
  },
  botName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  botStatus: {
    fontSize: 13,
    color: '#34C759',
    marginTop: 2,
  },
  walletBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  walletText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pricingBanner: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  pricingBannerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  pricingText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  noticeBanner: {
    backgroundColor: '#FFF9E6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FFD700',
  },
  noticeBannerDark: {
    backgroundColor: '#2C2416',
    borderBottomColor: '#FFD700',
  },
  noticeText: {
    fontSize: 11,
    color: '#8B7500',
    textAlign: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
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
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#000000',
  },
  userTextDark: {
    color: '#FFFFFF',
  },
  aiTextDark: {
    color: '#FFFFFF',
  },
  costIndicator: {
    marginTop: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  costText: {
    fontSize: 10,
    color: '#666666',
  },
  freeBadge: {
    marginTop: 6,
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  freeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingDots: {
    fontSize: 16,
    color: '#8E8E93',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  inputBarDark: {
    backgroundColor: '#1C1C1E',
    borderTopColor: '#38383A',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#000000',
    maxHeight: 100,
  },
  inputDark: {
    backgroundColor: '#2C2C2E',
    color: '#FFFFFF',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#8E8E93',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    width: '80%',
  },
  modalDark: {
    backgroundColor: '#1C1C1E',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalButtonSecondary: {
    paddingVertical: 14,
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});
