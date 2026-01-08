/**
 * PACK 310 — AI Companions & Avatar Builder
 * User UI: AI Avatar Profile & Chat
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../lib/firebase';
import type { AIAvatar, AIChatMessage } from '../../types/aiCompanion';

export default function AIAvatarProfile() {
  const router = useRouter();
  const { avatarId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState<AIAvatar | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    loadAvatar();
  }, [avatarId]);

  const loadAvatar = async () => {
    setLoading(true);
    try {
      // In real implementation, fetch avatar from Firestore
      // For now, we'll show the structure
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading avatar:', error);
      Alert.alert('Error', 'Failed to load AI avatar');
      setLoading(false);
    }
  };

  const startChat = async () => {
    try {
      const startSession = httpsCallable(functions, 'startAIChatSession');
      const result = await startSession({ avatarId });
      const data = result.data as any;
      
      setSessionId(data.sessionId);
      setShowChat(true);
      
      // Load existing messages if any
      // In real implementation, fetch from Firestore
      
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start chat');
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !sessionId) return;

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    // Add user message to UI immediately
    const userMessage: AIChatMessage = {
      messageId: `temp-${Date.now()}`,
      chatId: sessionId,
      sessionId,
      senderId: auth.currentUser?.uid || '',
      text: messageText,
      isAI: false,
      numWords: 0,
      tokensCharged: 0,
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const sendAI = httpsCallable(functions, 'sendAIMessage');
      const result = await sendAI({
        sessionId,
        message: messageText,
        language: 'en' // In real app, detect from user profile
      });

      const data = result.data as any;

      // Add AI response to UI
      const aiMessage: AIChatMessage = {
        messageId: `ai-${Date.now()}`,
        chatId: sessionId,
        sessionId,
        senderId: avatar?.avatarId || '',
        text: data.aiResponse,
        isAI: true,
        avatarId: avatar?.avatarId,
        numWords: 0,
        tokensCharged: data.tokensCharged,
        createdAt: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send message');
      // Remove the temporary user message
      setMessages(prev => prev.filter(m => m.messageId !== userMessage.messageId));
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: AIChatMessage }) => {
    const isUser = !item.isAI;
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.aiMessageContainer
      ]}>
        {!isUser && (
          <Image
            source={{ uri: avatar?.media.primaryPhotoId }}
            style={styles.messageAvatar}
          />
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.aiBubble
        ]}>
          {!isUser && (
            <View style={styles.aiIndicator}>
              <Text style={styles.aiIndicatorText}>🤖 AI</Text>
            </View>
          )}
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.aiMessageText
          ]}>
            {item.text}
          </Text>
          {item.tokensCharged > 0 && (
            <Text style={styles.tokensCost}>
              {item.tokensCharged} tokens
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF10F0" />
        </View>
      </View>
    );
  }

  if (!avatar) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Avatar not found</Text>
        </View>
      </View>
    );
  }

  if (showChat && sessionId) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setShowChat(false)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Image
              source={{ uri: avatar.media.primaryPhotoId }}
              style={styles.chatHeaderAvatar}
            />
            <View>
              <Text style={styles.chatHeaderName}>{avatar.displayName}</Text>
              <View style={styles.aiLabelChat}>
                <Text style={styles.aiLabelTextChat}>🤖 AI Companion</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={() => {
            Alert.alert(
              'Close Chat',
              'Are you sure you want to close this chat?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Close',
                  onPress: async () => {
                    try {
                      const closeSession = httpsCallable(functions, 'closeAISession');
                      await closeSession({ sessionId });
                      setShowChat(false);
                      setSessionId(null);
                      setMessages([]);
                    } catch (error) {
                      console.error('Error closing session:', error);
                    }
                  }
                }
              ]
            );
          }}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.messageId}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          inverted={false}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor="#888"
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={sending || !inputText.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileContent}>
        <Image
          source={{ uri: avatar.media.primaryPhotoId }}
          style={styles.profileImage}
        />

        <View style={styles.aiLabelLarge}>
          <Text style={styles.aiLabelLargeText}>🤖 AI COMPANION</Text>
          <Text style={styles.aiLabelSubtext}>Not a real person</Text>
        </View>

        <Text style={styles.displayName}>{avatar.displayName}</Text>
        <Text style={styles.tagline}>{avatar.shortTagline}</Text>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Age Range:</Text>
            <Text style={styles.infoValue}>{avatar.personaProfile.ageRange}</Text>
          </View>
          {avatar.personaProfile.locationHint && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location:</Text>
              <Text style={styles.infoValue}>{avatar.personaProfile.locationHint}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Languages:</Text>
            <Text style={styles.infoValue}>
              {avatar.languageCodes.map(l => l.toUpperCase()).join(', ')}
            </Text>
          </View>
        </View>

        <View style={styles.vibeSection}>
          <Text style={styles.sectionTitle}>Personality</Text>
          <View style={styles.chipContainer}>
            {avatar.personaProfile.vibe.map(v => (
              <View key={v} style={styles.vibeChip}>
                <Text style={styles.vibeChipText}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.topicsSection}>
          <Text style={styles.sectionTitle}>Topics</Text>
          <View style={styles.chipContainer}>
            {avatar.personaProfile.topics.map(t => (
              <View key={t} style={styles.topicChip}>
                <Text style={styles.topicChipText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.pricingSection}>
          <Text style={styles.pricingTitle}>💬 Chat Pricing</Text>
          <Text style={styles.pricingText}>
            Same as standard paid chat. Words from AI count towards tokens.
            65% goes to creator, 35% to Avalo.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.startChatButton}
          onPress={startChat}
        >
          <Text style={styles.startChatButtonText}>Start Chat with AI {avatar.displayName}</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          ⚠️ This is an AI-powered companion. All conversations are generated by AI
          and not by a real person. The avatar owner receives 65% of earnings.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    padding: 32,
  },
  errorText: {
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
  },
  profileHeader: {
    padding: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#FF10F0',
    fontSize: 16,
  },
  profileContent: {
    padding: 16,
    alignItems: 'center',
  },
  profileImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 16,
  },
  aiLabelLarge: {
    backgroundColor: '#FF10F0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  aiLabelLargeText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  aiLabelSubtext: {
    color: '#000',
    fontSize: 12,
    marginTop: 2,
  },
  displayName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tagline: {
    color: '#CCC',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  infoSection: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  vibeSection: {
    width: '100%',
    marginBottom: 16,
  },
  topicsSection: {
    width: '100%',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vibeChip: {
    backgroundColor: '#FF10F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  vibeChipText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  topicChip: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topicChipText: {
    color: '#FFF',
    fontSize: 14,
  },
  pricingSection: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pricingTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pricingText: {
    color: '#CCC',
    fontSize: 14,
    lineHeight: 20,
  },
  startChatButton: {
    width: '100%',
    backgroundColor: '#FF10F0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  startChatButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disclaimer: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Chat UI
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chatHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 16,
  },
  chatHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  chatHeaderName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  aiLabelChat: {
    backgroundColor: '#FF10F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  aiLabelTextChat: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  closeText: {
    color: '#FF3333',
    fontSize: 14,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#FF10F0',
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: '#1A1A1A',
    alignSelf: 'flex-start',
  },
  aiIndicator: {
    backgroundColor: '#FF10F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  aiIndicatorText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#000',
  },
  aiMessageText: {
    color: '#FFF',
  },
  tokensCost: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
    maxHeight: 100,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: '#FF10F0',
    width: 60,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});