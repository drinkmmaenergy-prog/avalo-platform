import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { ChatMessageStatus } from '../types/chat';
import { useTranslation } from '../hooks/useTranslation';

interface ChatBubbleProps {
  text: string;
  isSent: boolean;
  timestamp: Timestamp;
  status?: ChatMessageStatus; // PACK 45: Message delivery status
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ text, isSent, timestamp, status }) => {
  const { t } = useTranslation();
  
  const formatTime = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (error) {
      return '';
    }
  };

  // PACK 45: Get status text and icon
  const getStatusDisplay = () => {
    if (!isSent || !status) return null;

    switch (status) {
      case 'local':
        return { text: t('chat.status.sending'), icon: '⏳' };
      case 'synced':
        return { text: t('chat.status.sent'), icon: '✓' };
      case 'delivered':
        return { text: t('chat.status.delivered'), icon: '✓✓' };
      case 'read':
        return { text: t('chat.status.read'), icon: '✓✓' };
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View style={[styles.container, isSent ? styles.sentContainer : styles.receivedContainer]}>
      <View style={[styles.bubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
        <Text style={[styles.text, isSent ? styles.sentText : styles.receivedText]}>
          {text}
        </Text>
        <View style={styles.timestampRow}>
          <Text style={[styles.timestamp, isSent ? styles.sentTimestamp : styles.receivedTimestamp]}>
            {formatTime(timestamp)}
          </Text>
          {/* PACK 45: Status indicator for sent messages */}
          {statusDisplay && (
            <Text style={[
              styles.statusIndicator,
              status === 'read' && styles.statusIndicatorRead
            ]}>
              {statusDisplay.icon}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    width: '100%',
  },
  sentContainer: {
    alignItems: 'flex-end',
  },
  receivedContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sentBubble: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentText: {
    color: '#fff',
  },
  receivedText: {
    color: '#000',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
  },
  sentTimestamp: {
    color: '#fff',
    opacity: 0.7,
    textAlign: 'right',
  },
  receivedTimestamp: {
    color: '#666',
    textAlign: 'left',
  },
  statusIndicator: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.7,
  },
  statusIndicatorRead: {
    color: '#4A90E2', // Blue color for "read" status
    opacity: 1,
  },
});
