/**
 * PACK 328B — Chat Timeout Indicator
 * 
 * Mobile component to display chat activity status and timeout warnings.
 * Shows last activity time and auto-expiration countdown.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChatTimeoutIndicatorProps {
  chatId: string;
  lastMessageAt?: string;
  isPaid: boolean;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'CANCELLED';
  onEndChat?: () => void;
}

export function ChatTimeoutIndicator({
  chatId,
  lastMessageAt,
  isPaid,
  status,
  onEndChat,
}: ChatTimeoutIndicatorProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!lastMessageAt || status !== 'ACTIVE') {
      return;
    }

    const updateTimer = () => {
      const lastActivity = new Date(lastMessageAt);
      const now = new Date();
      const hoursElapsed = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      const timeoutHours = isPaid ? 72 : 48;
      const hoursLeft = Math.max(0, timeoutHours - hoursElapsed);
      
      // Show warning if less than 12 hours remaining
      setShowWarning(hoursLeft < 12);
      
      if (hoursLeft === 0) {
        setTimeRemaining('Expired');
      } else if (hoursLeft < 1) {
        const minutesLeft = Math.floor(hoursLeft * 60);
        setTimeRemaining(`${minutesLeft}m left`);
      } else {
        setTimeRemaining(`${Math.floor(hoursLeft)}h left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastMessageAt, isPaid, status]);

  if (status !== 'ACTIVE') {
    return null;
  }

  const formatLastActivity = () => {
    if (!lastMessageAt) return 'Just now';
    
    const lastActivity = new Date(lastMessageAt);
    const now = new Date();
    const diff = now.getTime() - lastActivity.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoRow}>
        <Ionicons 
          name="time-outline" 
          size={16} 
          color={showWarning ? '#f59e0b' : '#6b7280'} 
        />
        <Text style={[
          styles.infoText,
          showWarning && styles.warningText
        ]}>
          Last message {formatLastActivity()}
        </Text>
      </View>
      
      {showWarning && (
        <View style={styles.warningBox}>
          <Ionicons name="alert-circle" size={16} color="#f59e0b" />
          <Text style={styles.warningTextLarge}>
            Chat expires in {timeRemaining}
          </Text>
        </View>
      )}
      
      <Text style={styles.helperText}>
        This chat will auto-end after {isPaid ? '72h' : '48h'} of inactivity. 
        Unused tokens will be refunded.
      </Text>
      
      {isPaid && onEndChat && (
        <TouchableOpacity 
          style={styles.endChatButton}
          onPress={onEndChat}
        >
          <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
          <Text style={styles.endChatText}>End Chat & Refund</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoText: {
    marginLeft: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  warningText: {
    color: '#f59e0b',
    fontWeight: '500',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  warningTextLarge: {
    marginLeft: 6,
    fontSize: 14,
    color: '#92400e',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    lineHeight: 16,
  },
  endChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
  },
  endChatText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
});
