/**
 * AI Chat Screen
 * Instagram DM-style chat interface with AI bot
 * 
 * Aggressive Monetization Rules:
 * - 3 free welcome messages (5 for Royal)
 * - Auto-show deposit modal after free messages
 * - Real-time token balance counter
 * - Low balance warnings at 20 tokens
 * - Auto reminder at 15 tokens
 * - Token cost visible on each bot message
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  startAiChat,
  sendAiMessage,
  processAiChatDeposit,
  closeAiChat,
  getBotInfo,
  AIBot,
} from '../../../services/aiBotService';
import AIChatBubble from '../../../components/AIChatBubble';
import DepositRequiredModal from '../../../components/DepositRequiredModal';
import {
  AI_CHAT_DEPOSIT,
  getFreeMessageCount,
  calculateAIMessageCost,
} from '../../../config/aiMonetization';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  tokensCost: number;
  wasFree: boolean;
}

export default function AIChatScreen() {
  const router = useRouter();
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const flatListRef = useRef<FlatList>(null);

  // State
  const [bot, setBot] = useState<AIBot | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  // Monetization state
  const [freeMessagesRemaining, setFreeMessagesRemaining] = useState(3);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [hasDeposited, setHasDeposited] = useState(false);
  const [isRoyal, setIsRoyal] = useState(false); // TODO: Get from user context

  useEffect(() => {
    initialize();
  }, [botId]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    // Show low balance warning
    if (hasDeposited && tokenBalance > 0 && tokenBalance <= AI_CHAT_DEPOSIT.LOW_BALANCE_WARNING) {
      Alert.alert(
        '⚠️ Low Balance',
        `You have ${tokenBalance} tokens remaining. Consider depositing more to continue chatting.`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Deposit Now',
            onPress: () => setShowDepositModal(true),
          },
        ]
      );
    }
  }, [tokenBalance]);

  const initialize = async () => {
    try {
      // Load bot info
      const botData = await getBotInfo(botId);
      setBot(botData);

      // Start or resume chat
      const { chatId: newChatId, existing } = await startAiChat(botId);
      setChatId(newChatId);

      // Set free messages count based on membership
      const freeCount = getFreeMessageCount(isRoyal);
      setFreeMessagesRemaining(freeCount);

      // Add welcome message
      if (!existing) {
        const welcomeMessage: Message = {
          id: 'welcome',
          role: 'bot',
          content: `Hi! I'm ${botData.name}. ${botData.personality.substring(0, 100)}... Feel free to chat with me!`,
          timestamp: new Date(),
          tokensCost: 0,
          wasFree: true,
        };
        setMessages([welcomeMessage]);
        setFreeMessagesRemaining(prev => prev - 1);
      }

      // TODO: Load existing messages from Firestore if resuming
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start chat');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !chatId || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSending(true);
    setIsTyping(true);

    try {
      // Send message to backend
      const result = await sendAiMessage(chatId, userMessage.content);

      if (result.error === 'DEPOSIT_REQUIRED') {
        // Show deposit modal - user must deposit to continue
        setIsTyping(false);
        setSending(false);
        setShowDepositModal(true);
        return;
      }

      if (result.error === 'INSUFFICIENT_BALANCE') {
        setIsTyping(false);
        setSending(false);
        Alert.alert(
          'Insufficient Balance',
          `You need ${result.required} tokens to continue. Your balance: ${tokenBalance} tokens.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Deposit',
              onPress: () => setShowDepositModal(true),
            },
          ]
        );
        return;
      }

      if (result.error === 'BOT_UNAVAILABLE') {
        setIsTyping(false);
        setSending(false);
        Alert.alert('Bot Unavailable', 'This bot is currently paused or unavailable.');
        return;
      }

      // Success - add bot response
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'bot',
        content: result.response || 'Sorry, I couldn\'t respond right now.',
        timestamp: new Date(),
        tokensCost: result.tokensCost,
        wasFree: result.wasFree,
      };

      setIsTyping(false);
      setMessages(prev => [...prev, botMessage]);

      // Update state
      if (result.wasFree) {
        setFreeMessagesRemaining(prev => prev - 1);
        
        // If no more free messages, auto-show deposit modal
        if (freeMessagesRemaining <= 1) {
          setTimeout(() => {
            setShowDepositModal(true);
          }, 500);
        }
      } else {
        // Deduct tokens from balance
        setTokenBalance(prev => prev - result.tokensCost);
        
        // Auto-show deposit reminder if balance is low
        if (tokenBalance - result.tokensCost <= AI_CHAT_DEPOSIT.AUTO_DEPOSIT_REMINDER) {
          setTimeout(() => {
            setShowDepositModal(true);
          }, 1000);
        }
      }
    } catch (error: any) {
      setIsTyping(false);
      Alert.alert('Error', error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleDeposit = async () => {
    if (!chatId) return;

    try {
      const result = await processAiChatDeposit(chatId);
      
      // Update balance with escrow amount
      setTokenBalance(result.escrowAmount);
      setHasDeposited(true);
      setShowDepositModal(false);

      Alert.alert(
        'Deposit Successful!',
        `${result.escrowAmount} tokens added to your chat balance.\nPlatform fee: ${result.platformFee} tokens`,
        [{ text: 'Continue Chatting' }]
      );
    } catch (error: any) {
      Alert.alert('Deposit Failed', error.message || 'Failed to process deposit');
    }
  };

  const handleClose = async () => {
    if (!chatId) {
      router.back();
      return;
    }

    Alert.alert(
      'Close Chat',
      'Are you sure? Unused tokens will be refunded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await closeAiChat(chatId);
              Alert.alert(
                'Chat Closed',
                result.refunded > 0
                  ? `${result.refunded} tokens refunded to your wallet.`
                  : 'Chat closed successfully.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error) {
              router.back();
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.textDark]}>
          Connecting to {bot?.name || 'bot'}...
        </Text>
      </View>
    );
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
          onPress={handleClose}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={[styles.botName, isDark && styles.textDark]}>
            {bot?.name}
          </Text>
          <Text style={[styles.botStatus, isDark && styles.textSecondaryDark]}>
            {isTyping ? 'typing...' : 'online'}
          </Text>
        </View>

        {/* Token Balance Indicator */}
        {hasDeposited && (
          <View
            style={[
              styles.balanceBadge,
              tokenBalance <= AI_CHAT_DEPOSIT.LOW_BALANCE_WARNING && styles.balanceBadgeLow,
            ]}
          >
            <Text style={styles.balanceText}>🪙 {tokenBalance}</Text>
          </View>
        )}

        {/* Free Messages Indicator */}
        {!hasDeposited && freeMessagesRemaining > 0 && (
          <View style={styles.freeBadge}>
            <Text style={styles.freeText}>{freeMessagesRemaining} FREE</Text>
          </View>
        )}
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AIChatBubble
            role={item.role}
            content={item.content}
            timestamp={item.timestamp}
            tokensCost={item.tokensCost}
            wasFree={item.wasFree}
          />
        )}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing Indicator */}
      {isTyping && (
        <View style={styles.typingContainer}>
          <AIChatBubble
            role="bot"
            content=""
            timestamp={new Date()}
            isTyping
          />
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

      {/* Deposit Required Modal */}
      <DepositRequiredModal
        visible={showDepositModal}
        onContinue={handleDeposit}
        onBuyTokens={() => {
          setShowDepositModal(false);
          // TODO: Navigate to token purchase screen
          Alert.alert('Buy Tokens', 'Token purchase screen coming soon!');
        }}
        onUpgrade={(tier) => {
          setShowDepositModal(false);
          // TODO: Navigate to upgrade screen
          Alert.alert('Upgrade', `${tier.toUpperCase()} upgrade coming soon!`);
        }}
        onCancel={() => {
          setShowDepositModal(false);
          Alert.alert(
            'Cannot Continue',
            'Deposit required to continue chatting with this bot.',
            [{ text: 'OK' }]
          );
        }}
        currentBalance={tokenBalance}
        botName={bot?.name || 'Bot'}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
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
  },
  botName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  botStatus: {
    fontSize: 13,
    color: '#34C759',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  balanceBadgeLow: {
    backgroundColor: '#FF3B30',
  },
  balanceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  freeBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  freeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});