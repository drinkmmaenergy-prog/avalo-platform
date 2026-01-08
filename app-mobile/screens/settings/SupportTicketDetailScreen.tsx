/**
 * Support Ticket Detail Screen
 * 
 * Shows ticket conversation and allows replying.
 * Part of PACK 68 - In-App Support Center & Ticketing.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  SupportTicketDetail,
  SupportTicketMessage,
  getTicketDetail,
  replyToTicket,
  markTicketAsViewed,
  getStatusDisplayName,
  getStatusColor,
  getCategoryDisplayName,
  formatTicketDate,
} from '../../services/supportService';

const SupportTicketDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const params = route.params as { ticketId: string };
  const ticketId = params?.ticketId;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');

  const locale = 'en'; // TODO: Get from user settings
  const userId = 'current-user-id'; // TODO: Get from auth context

  useEffect(() => {
    if (ticketId) {
      loadTicketDetail();
      markTicketAsViewed(userId, ticketId);
    }
  }, [ticketId]);

  const loadTicketDetail = async () => {
    try {
      setLoading(true);
      const result = await getTicketDetail(userId, ticketId);
      setTicket(result.ticket);
      setMessages(result.messages);
      
      // Scroll to bottom after loading
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error: any) {
      console.error('[TicketDetail] Error loading ticket:', error);
      Alert.alert('Error', 'Failed to load ticket details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;

    try {
      setSending(true);
      await replyToTicket(userId, ticketId, replyText.trim());
      
      // Reload ticket to show new message
      await loadTicketDetail();
      setReplyText('');
    } catch (error: any) {
      console.error('[TicketDetail] Error sending reply:', error);
      Alert.alert('Error', 'Failed to send reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!ticket) {
    return null;
  }

  const statusColor = getStatusColor(ticket.status);
  const statusText = getStatusDisplayName(ticket.status, locale);
  const categoryText = getCategoryDisplayName(ticket.category, locale);

  const canReply = ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Ticket Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
          <Text style={styles.categoryText}>{categoryText}</Text>
        </View>
        <Text style={styles.subject}>{ticket.subject}</Text>
        <Text style={styles.ticketId}>Ticket #{ticketId.slice(-8)}</Text>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message, index) => {
          const isUser = message.senderType === 'USER';
          const isFirstInGroup = index === 0 || messages[index - 1].senderType !== message.senderType;
          
          return (
            <View
              key={message.messageId}
              style={[
                styles.messageBubble,
                isUser ? styles.userMessage : styles.adminMessage,
                isFirstInGroup && { marginTop: 16 },
              ]}
            >
              {isFirstInGroup && (
                <Text style={styles.messageSender}>
                  {isUser ? 'You' : 'Support Team'}
                </Text>
              )}
              <Text style={[
                styles.messageText,
                isUser ? styles.userMessageText : styles.adminMessageText,
              ]}>
                {message.body}
              </Text>
              <Text style={[
                styles.messageTime,
                isUser ? styles.userMessageTime : styles.adminMessageTime,
              ]}>
                {formatTicketDate(message.createdAt, locale)}
              </Text>
            </View>
          );
        })}

        {!canReply && (
          <View style={styles.closedNotice}>
            <Ionicons name="lock-closed" size={20} color="#8E8E93" />
            <Text style={styles.closedNoticeText}>
              This ticket is {ticket.status.toLowerCase()}. You cannot reply anymore.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Reply Input */}
      {canReply && (
        <View style={styles.replyContainer}>
          <TextInput
            style={styles.replyInput}
            placeholder="Write a reply to support..."
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!replyText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendReply}
            disabled={!replyText.trim() || sending}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  categoryText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  subject: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  ticketId: {
    fontSize: 12,
    color: '#8E8E93',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    maxWidth: '80%',
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  adminMessage: {
    alignSelf: 'flex-start',
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    padding: 12,
    borderRadius: 16,
  },
  userMessageText: {
    backgroundColor: '#007AFF',
    color: '#FFFFFF',
  },
  adminMessageText: {
    backgroundColor: '#FFFFFF',
    color: '#000000',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  userMessageTime: {
    color: '#8E8E93',
    textAlign: 'right',
  },
  adminMessageTime: {
    color: '#8E8E93',
    textAlign: 'left',
  },
  closedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  closedNoticeText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
    flex: 1,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'ios' ? 10 : 10,
    fontSize: 15,
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
    opacity: 0.4,
  },
});

export default SupportTicketDetailScreen;
