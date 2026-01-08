import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useFanIdentity } from '../../hooks/useFanIdentity';
import {
  getCompanionSettings,
  getConversation,
  storeConversation,
  generateAIResponse,
  chargeForMessage,
  AIMessage,
  RESPONSE_PRICING,
  calculatePrice,
} from '../../services/creatorAICompanionService';
import { getTokenBalance } from '../../services/tokenService';
import {
  isVoiceEnabled,
  calculateVoicePrice,
  requestVoiceReply,
  VoiceMessage,
} from '../../services/aiVoiceService';
import AiVoiceMessageBubble from '../../components/AiVoiceMessageBubble';
import FanIdentityBadge from '../../components/FanIdentityBadge';
import { registerFanEvent } from '../../services/fanIdentityService';
import { registerChallengeProgress } from '../../services/fanChallengeService';

export default function AICompanionChatScreen() {
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [creatorName, setCreatorName] = useState('AI Companion');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isVIP, setIsVIP] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [requestingVoice, setRequestingVoice] = useState(false);
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pack 33-13: Fan Identity Engine
  const fanIdentity = useFanIdentity(creatorId || null);

  // Calculate message cost (always 5 tokens for first message, then 5 for each)
  const messageCost = calculatePrice(RESPONSE_PRICING.message, isVIP);
  const voiceCost = calculateVoicePrice(isVIP);

  useEffect(() => {
    loadData();
    startPulseAnimation();
  }, []);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const loadData = async () => {
    if (!user?.uid || !creatorId) return;

    try {
      // Load conversation history
      const conversation = await getConversation(user.uid, creatorId);
      if (conversation) {
        setMessages(conversation.messages);
      }

      // Load creator settings for name
      const settings = await getCompanionSettings(creatorId);
      if (settings && !settings.enabled) {
        router.back();
        return;
      }

      // Load token balance
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);

      // TODO: Check if user is VIP subscriber
      // For now, hardcoded to false
      setIsVIP(false);

      // Check if voice is available
      const voiceEnabled = await isVoiceEnabled(creatorId);
      setVoiceAvailable(voiceEnabled);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !user?.uid || !creatorId || sending) return;

    // Check balance
    if (tokenBalance < messageCost) {
      // TODO: Show token purchase modal
      alert(t('aiCompanion.chat.insufficientTokens'));
      return;
    }

    setSending(true);
    const userMessage = inputText.trim();
    setInputText('');

    try {
      // Create user message
      const userMsg: AIMessage = {
        id: Date.now().toString(),
        senderId: 'user',
        content: userMessage,
        responseType: 'message',
        timestamp: new Date().toISOString(),
        cost: messageCost,
      };

      // Add to UI immediately
      setMessages((prev) => [...prev, userMsg]);

      // Charge for message
      const chargeResult = await chargeForMessage(user.uid, creatorId, 'message', isVIP);

      if (!chargeResult.success) {
        alert(chargeResult.message || t('aiCompanion.chat.paymentFailed'));
        // Remove the message if payment failed
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        return;
      }

      // Update balance
      setTokenBalance((prev) => prev - messageCost);

      // Pack 33-13: Register AI companion session event
      registerFanEvent({
        type: 'AI_COMPANION_SESSION',
        viewerId: user.uid,
        targetId: creatorId,
        tokensSpentApprox: messageCost,
      }).catch(err => console.error('Error registering AI session:', err));

      // Pack 33-15: Register challenge progress for AI session
      if (messages.length === 0) {
        // Only register on first message of the session
        await registerChallengeProgress(creatorId, user.uid, 'AI_SESSION');
      }

      // Generate AI response (deterministic, no API)
      const aiResponseText = await generateAIResponse(user.uid, creatorId, userMessage);

      const aiMsg: AIMessage = {
        id: (Date.now() + 1).toString(),
        senderId: 'ai',
        content: aiResponseText,
        responseType: 'message',
        timestamp: new Date().toISOString(),
        cost: 0,
      };

      // Add AI response
      setMessages((prev) => [...prev, aiMsg]);

      // Store conversation
      const updatedMessages = [...messages, userMsg, aiMsg];
      await storeConversation(user.uid, creatorId, updatedMessages);

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      alert(t('errors.unknownError'));
    } finally {
      setSending(false);
    }
  };

  const handleVoiceReply = async () => {
    if (!user?.uid || !creatorId || requestingVoice || !inputText.trim()) return;

    // Check balance
    if (tokenBalance < voiceCost) {
      alert(t('aiVoice.insufficientTokens'));
      return;
    }

    setRequestingVoice(true);
    const userMessage = inputText.trim();
    setInputText('');

    try {
      // Request voice reply
      const result = await requestVoiceReply(user.uid, creatorId, userMessage, isVIP);

      if (!result.success) {
        alert(result.message || t('aiVoice.requestFailed'));
        setInputText(userMessage); // Restore input
        return;
      }

      // Update balance
      setTokenBalance((prev) => prev - voiceCost);

      // Add voice message to list
      if (result.voiceMessage) {
        setVoiceMessages((prev) => [...prev, result.voiceMessage!]);
      }

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error requesting voice reply:', error);
      alert(t('errors.unknownError'));
    } finally {
      setRequestingVoice(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{creatorName}</Text>
            {/* Pack 33-13: Fan Identity Badge */}
            {!fanIdentity.loading && fanIdentity.fanIdentity && (
              <FanIdentityBadge tag={fanIdentity.relationshipTag} size="small" />
            )}
          </View>
          <Text style={styles.headerSubtitle}>{t('aiCompanion.chat.aiPersona')}</Text>
          {/* Pack 33-13: Highlight text */}
          {!fanIdentity.loading && fanIdentity.highlightText && (
            <Text style={styles.headerHighlight}>{fanIdentity.highlightText}</Text>
          )}
        </View>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceText}>{tokenBalance}</Text>
          <Text style={styles.balanceLabel}>{t('common.tokens')}</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>{t('aiCompanion.chat.welcome')}</Text>
            <Text style={styles.emptyStateText}>{t('aiCompanion.chat.firstMessageCost', { tokens: messageCost })}</Text>
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageRow,
              message.senderId === 'user' ? styles.messageRowUser : styles.messageRowAI,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                message.senderId === 'user' ? styles.messageBubbleUser : styles.messageBubbleAI,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.senderId === 'user' ? styles.messageTextUser : styles.messageTextAI,
                ]}
              >
                {message.content}
              </Text>
              {message.senderId === 'user' && message.cost > 0 && (
                <Text style={styles.costBadge}>-{message.cost} {t('common.tokens')}</Text>
              )}
            </View>
          </View>
        ))}

        {sending && (
          <View style={[styles.messageRow, styles.messageRowAI]}>
            <View style={[styles.messageBubble, styles.messageBubbleAI]}>
              <ActivityIndicator size="small" color="#40E0D0" />
            </View>
          </View>
        )}

        {/* Voice Messages */}
        {voiceMessages.map((voiceMsg) => (
          <View key={voiceMsg.id} style={styles.voiceMessageContainer}>
            <AiVoiceMessageBubble voiceMessage={voiceMsg} />
          </View>
        ))}

        {requestingVoice && (
          <View style={styles.voiceMessageContainer}>
            <View style={styles.voiceLoadingBubble}>
              <ActivityIndicator size="small" color="#40E0D0" />
              <Text style={styles.voiceLoadingText}>{t('aiVoice.generating')}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Voice Reply Button */}
      {voiceAvailable && (
        <View style={styles.voiceButtonContainer}>
          <TouchableOpacity
            style={[
              styles.voiceButton,
              (!inputText.trim() || requestingVoice || sending) && styles.voiceButtonDisabled,
            ]}
            onPress={handleVoiceReply}
            disabled={!inputText.trim() || requestingVoice || sending}
          >
            <Text style={styles.voiceButtonIcon}>🎧</Text>
            <View style={styles.voiceButtonContent}>
              <Text style={styles.voiceButtonText}>{t('aiVoice.voiceReply')}</Text>
              <Text style={styles.voiceButtonCost}>
                {voiceCost} {t('common.tokens')}
              </Text>
            </View>
          </TouchableOpacity>

          {isVIP && (
            <View style={styles.vipDiscountBadge}>
              <Text style={styles.vipDiscountText}>
                -10% {t('aiVoice.vipDiscount')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <Animated.View style={[styles.priceIndicator, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.priceIndicatorText}>{messageCost}</Text>
          <Text style={styles.priceIndicatorLabel}>{t('common.tokens')}</Text>
        </Animated.View>

        <TextInput
          style={styles.input}
          placeholder={t('aiCompanion.chat.typeMessage')}
          placeholderTextColor="#666"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || sending}
        >
          <Text style={styles.sendButtonText}>
            {sending ? '...' : '→'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info Footer */}
      {isVIP && (
        <View style={styles.vipBanner}>
          <Text style={styles.vipBannerText}>
            ✨ {t('aiCompanion.chat.vipDiscount', { discount: '5%' })}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#40E0D0',
    fontWeight: 'bold',
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  headerHighlight: {
    fontSize: 12,
    color: '#40E0D0',
    marginTop: 4,
    fontStyle: 'italic',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#999',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  messageRow: {
    marginBottom: 12,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowAI: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
  },
  messageBubbleUser: {
    backgroundColor: '#40E0D0',
  },
  messageBubbleAI: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#0F0F0F',
  },
  messageTextAI: {
    color: '#FFF',
  },
  costBadge: {
    fontSize: 12,
    color: '#0F0F0F',
    fontWeight: 'bold',
    marginTop: 6,
    opacity: 0.7,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 8,
  },
  priceIndicator: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  priceIndicatorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  priceIndicatorLabel: {
    fontSize: 10,
    color: '#0F0F0F',
    fontWeight: '600',
  },
  voiceMessageContainer: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  voiceLoadingBubble: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceLoadingText: {
    fontSize: 14,
    color: '#FFF',
  },
  voiceButtonContainer: {
    padding: 12,
    paddingTop: 8,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  voiceButton: {
    backgroundColor: '#0F0F0F',
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  voiceButtonDisabled: {
    borderColor: '#333',
    opacity: 0.5,
    shadowOpacity: 0,
  },
  voiceButtonIcon: {
    fontSize: 28,
  },
  voiceButtonContent: {
    flex: 1,
  },
  voiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  voiceButtonCost: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  vipDiscountBadge: {
    backgroundColor: '#D4AF3722',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
    alignSelf: 'center',
  },
  vipDiscountText: {
    fontSize: 12,
    color: '#D4AF37',
    fontWeight: '600',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
    shadowOpacity: 0,
  },
  sendButtonText: {
    fontSize: 24,
    color: '#0F0F0F',
    fontWeight: 'bold',
  },
  vipBanner: {
    backgroundColor: '#D4AF3722',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
    alignItems: 'center',
  },
  vipBannerText: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '600',
  },
});