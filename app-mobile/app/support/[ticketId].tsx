/**
 * PACK 300A - Support Ticket Conversation Screen
 * Two-way conversation interface between user and support team
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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { auth, db, functions } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Ionicons } from '@expo/vector-icons';
import {
  SupportTicket,
  SupportTicketMessage,
  AddMessageRequest,
  AddMessageResponse,
  UpdateTicketRequest,
  UpdateTicketResponse,
  formatTicketId,
} from '../../../shared/types/support';
import TicketStatusBadge from './components/TicketStatusBadge';
import TicketPriorityBadge from './components/TicketPriorityBadge';
import TicketSystemMessage from './components/TicketSystemMessage';

export default function TicketConversationScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
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
    if (!ticketId || !userId) return;

    // Subscribe to ticket updates
    const ticketRef = doc(db, 'supportTickets', ticketId);
    const unsubscribeTicket = onSnapshot(ticketRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SupportTicket;
        
        // Verify user owns this ticket
        if (data.userId !== userId) {
          Alert.alert('Error', 'You do not have access to this ticket');
          router.back();
          return;
        }
        
        setTicket({ ticketId: snapshot.id, ...data });
        setLoading(false);
      } else {
        Alert.alert('Error', 'Ticket not found');
        router.back();
      }
    });

    // Subscribe to messages
    const messagesQuery = query(
      collection(db, 'supportTicketMessages'),
      where('ticketId', '==', ticketId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs
        .map(doc => doc.data() as SupportTicketMessage)
        .filter(msg => !msg.internal); // Filter out internal messages
      
      setMessages(messagesData);
      
      // Scroll to bottom when new messages arrive
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      unsubscribeTicket();
      unsubscribeMessages();
    };
  }, [ticketId, userId]);

  const handleSendMessage = async () => {
    if (!message.trim() || !ticket || !userId) return;
    
    if (ticket.status === 'CLOSED') {
      Alert.alert('Ticket Closed', 'This ticket has been closed. Please create a new ticket for additional assistance.');
      return;
    }

    setSending(true);
    
    try {
      const addMessageFunction = httpsCallable<AddMessageRequest, AddMessageResponse>(
        functions,
        'addMessage'
      );

      const request: AddMessageRequest = {
        ticketId: ticket.ticketId,
        body: message.trim(),
        internal: false,
      };

      const result = await addMessageFunction(request);

      if (result.data.success) {
        setMessage('');
      } else {
        throw new Error(result.data.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!ticket || !userId) return;
    
    Alert.alert(
      'Mark as Resolved',
      'Are you satisfied with the resolution? This will close the ticket.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Resolved',
          onPress: async () => {
            try {
              const updateTicketFunction = httpsCallable<UpdateTicketRequest, UpdateTicketResponse>(
                functions,
                'updateTicket'
              );

              const request: UpdateTicketRequest = {
                ticketId: ticket.ticketId,
                status: 'CLOSED',
              };

              const result = await updateTicketFunction(request);

              if (result.data.success) {
                Alert.alert('Success', 'Ticket has been marked as resolved and closed.');
              } else {
                throw new Error(result.data.error || 'Failed to update ticket');
              }
            } catch (error: any) {
              console.error('Error updating ticket:', error);
              Alert.alert('Error', 'Failed to update ticket. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item, index }: { item: SupportTicketMessage; index: number }) => {
    const isUser = item.authorType === 'USER';
    
    // Show timestamp if it's the first message or 5+ minutes since last message
    const showTimestamp = index === 0 || 
      (messages[index - 1] && 
       new Date(item.createdAt).getTime() - new Date(messages[index - 1].createdAt).getTime() > 300000);

    return (
      <View style={styles.messageContainer}>
        {showTimestamp && (
          <Text style={styles.timestamp}>
            {formatMessageTime(item.createdAt)}
          </Text>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.supportMessage,
        ]}>
          {!isUser && (
            <Text style={styles.supportLabel}>Support Team</Text>
          )}
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.supportMessageText,
          ]}>
            {item.body}
          </Text>
        </View>
      </View>
    );
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + 
             date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Ticket not found</Text>
      </View>
    );
  }

  const canSendMessage = ticket.status !== 'CLOSED';
  const canMarkResolved = ticket.status === 'RESOLVED';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.ticketId}>{formatTicketId(ticket.ticketId)}</Text>
          <Text style={styles.ticketSubject} numberOfLines={1}>
            {ticket.subject}
          </Text>
          <View style={styles.headerBadges}>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} showIcon={false} />
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => item.messageId || index.toString()}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
      />

      {/* Resolved Notice */}
      {ticket.status === 'RESOLVED' && (
        <View style={styles.resolvedNotice}>
          <Ionicons name="checkmark-circle" size={20} color="#10b981" />
          <Text style={styles.resolvedText}>
            This ticket has been marked as resolved by our support team
          </Text>
          <TouchableOpacity onPress={handleMarkResolved} style={styles.confirmButton}>
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {canSendMessage ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#9ca3af"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedNotice}>
          <Ionicons name="lock-closed" size={20} color="#6b7280" />
          <Text style={styles.closedText}>This ticket has been closed</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  errorText: {
    color: '#6b7280',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  ticketId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    textTransform: 'uppercase',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  messagesContent: {
    padding: 16,
    gap: 8,
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  messageContainer: {
    width: '100%',
  },
  timestamp: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginVertical: 12,
    fontWeight: '500',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 2,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  supportMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  supportLabel: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  supportMessageText: {
    color: '#111827',
  },
  resolvedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#10b981',
  },
  resolvedText: {
    flex: 1,
    color: '#047857',
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  closedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8,
  },
  closedText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
});