/**
 * PACK 111 — Support Chat Screen
 * Chat interface for interacting with support agents
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
  Alert
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { auth, db } from '../../lib/firebase';
import { doc, onSnapshot, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

interface SupportMessage {
  messageId: string;
  fromUserId: string | null;
  fromAgentId: string | null;
  message: string;
  originalLanguage: string;
  timestamp: any;
  isInternal?: boolean;
}

interface SupportCase {
  caseId: string;
  userId: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  messages: SupportMessage[];
  createdAt: any;
  resolution: any;
}

export default function SupportChatScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        router.replace('/auth/login' as any);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!caseId || !userId) return;

    const caseRef = doc(db, 'support_cases', caseId);
    const unsubscribe = onSnapshot(caseRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SupportCase;
        
        // Verify user owns this case
        if (data.userId !== userId) {
          Alert.alert('Error', 'You do not have access to this case');
          router.back();
          return;
        }
        
        setSupportCase({ caseId: snapshot.id, ...data });
        setLoading(false);
        
        // Scroll to bottom when new messages arrive
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Error', 'Support case not found');
        router.back();
      }
    });

    return () => unsubscribe();
  }, [caseId, userId]);

  const handleSendMessage = async () => {
    if (!message.trim() || !supportCase || !userId) return;
    if (supportCase.status === 'CLOSED') {
      Alert.alert('Case Closed', 'This case has been closed. You cannot send new messages.');
      return;
    }

    setSending(true);
    
    try {
      const messageId = `${caseId}_msg_${supportCase.messages.length + 1}`;
      
      const newMessage: SupportMessage = {
        messageId,
        fromUserId: userId,
        fromAgentId: null,
        message: message.trim(),
        originalLanguage: 'en',
        timestamp: serverTimestamp() as any,
        isInternal: false
      };

      const caseRef = doc(db, 'support_cases', caseId);
      await updateDoc(caseRef, {
        messages: [...supportCase.messages, newMessage],
        lastUserMessage: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'WAITING_FOR_AGENT'
      });

      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleReopenCase = async () => {
    if (!supportCase || !userId) return;
    
    Alert.alert(
      'Reopen Case',
      'Would you like to reopen this case?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            try {
              const messageId = `${caseId}_msg_${supportCase.messages.length + 1}`;
              
              const reopenMessage: SupportMessage = {
                messageId,
                fromUserId: userId,
                fromAgentId: null,
                message: 'Case reopened by user',
                originalLanguage: 'en',
                timestamp: serverTimestamp() as any,
                isInternal: false
              };

              const caseRef = doc(db, 'support_cases', caseId);
              await updateDoc(caseRef, {
                status: 'OPEN',
                messages: [...supportCase.messages, reopenMessage],
                lastUserMessage: serverTimestamp(),
                updatedAt: serverTimestamp(),
                resolution: null
              });

              Alert.alert('Success', 'Case has been reopened');
            } catch (error) {
              console.error('Error reopening case:', error);
              Alert.alert('Error', 'Failed to reopen case. Please try again.');
            }
          }
        }
      ]
    );
  };

  const renderMessage = ({ item, index }: { item: SupportMessage; index: number }) => {
    const isUser = item.fromUserId !== null;
    const isInternal = item.isInternal;
    
    // Don't show internal notes to users
    if (isInternal) return null;
    
    const showTimestamp = index === 0 || 
      (supportCase?.messages[index - 1]?.timestamp?.toMillis() || 0) + 300000 < (item.timestamp?.toMillis() || 0);

    return (
      <View style={styles.messageContainer}>
        {showTimestamp && item.timestamp && (
          <Text style={styles.timestamp}>
            {formatMessageTime(item.timestamp)}
          </Text>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.agentMessage
        ]}>
          {!isUser && (
            <Text style={styles.agentLabel}>Support Agent</Text>
          )}
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.agentMessageText
          ]}>
            {item.message}
          </Text>
        </View>
      </View>
    );
  };

  const formatMessageTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate();
    const now = new Date();
    
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'ASSIGNED':
        return '#FF6B00';
      case 'WAITING_FOR_AGENT':
        return '#FFB800';
      case 'WAITING_FOR_USER':
        return '#00A8E8';
      case 'RESOLVED':
        return '#00C853';
      case 'CLOSED':
        return '#757575';
      default:
        return '#666';
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B00" />
      </View>
    );
  }

  if (!supportCase) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Case not found</Text>
      </View>
    );
  }

  const canSendMessage = supportCase.status !== 'CLOSED';
  const canReopen = supportCase.status === 'RESOLVED' && supportCase.resolution;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {supportCase.subject}
          </Text>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(supportCase.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(supportCase.status) }]}>
              {supportCase.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={supportCase.messages.filter(m => !m.isInternal)}
        renderItem={renderMessage}
        keyExtractor={(item, index) => item.messageId || index.toString()}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Resolution Notice */}
      {supportCase.resolution && (
        <View style={styles.resolutionNotice}>
          <Ionicons name="checkmark-circle" size={20} color="#00C853" />
          <Text style={styles.resolutionText}>
            Case resolved: {supportCase.resolution.resolutionCategory}
          </Text>
          {canReopen && (
            <TouchableOpacity onPress={handleReopenCase}>
              <Text style={styles.reopenLink}>Reopen</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Input */}
      {canSendMessage ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#666"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedNotice}>
          <Text style={styles.closedText}>This case has been closed</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000'
  },
  errorText: {
    color: '#FFF',
    fontSize: 16
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333'
  },
  backButton: {
    marginRight: 12
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize'
  },
  messagesContent: {
    padding: 16,
    gap: 8
  },
  messageContainer: {
    width: '100%'
  },
  timestamp: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginVertical: 12
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 2
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF6B00',
    borderBottomRightRadius: 4
  },
  agentMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderBottomLeftRadius: 4
  },
  agentLabel: {
    fontSize: 12,
    color: '#FF6B00',
    fontWeight: '600',
    marginBottom: 4
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20
  },
  userMessageText: {
    color: '#FFF'
  },
  agentMessageText: {
    color: '#FFF'
  },
  resolutionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A1A',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#00C853'
  },
  resolutionText: {
    flex: 1,
    color: '#00C853',
    fontSize: 14
  },
  reopenLink: {
    color: '#FF6B00',
    fontSize: 14,
    fontWeight: '600'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 12
  },
  input: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
    maxHeight: 100
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B00',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#333'
  },
  closedNotice: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center'
  },
  closedText: {
    color: '#999',
    fontSize: 14
  }
});