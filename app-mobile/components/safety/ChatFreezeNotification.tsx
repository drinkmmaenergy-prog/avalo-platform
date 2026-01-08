/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Chat Freeze Notification UI
 * 
 * Displayed when a chat is frozen due to stalking behavior detection.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface ChatFreezeNotificationProps {
  reason?: string;
  duration?: number; // Minutes
  expiresAt?: Date;
  onContactSupport?: () => void;
  onDismiss?: () => void;
}

export const ChatFreezeNotification: React.FC<ChatFreezeNotificationProps> = ({
  reason,
  duration,
  expiresAt,
  onContactSupport,
  onDismiss,
}) => {
  const formatTimeRemaining = () => {
    if (!expiresAt) return 'temporarily';
    
    const now = new Date().getTime();
    const expiry = expiresAt.getTime();
    const remaining = expiry - now;
    
    if (remaining <= 0) return 'expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Conversation Frozen</Text>
      </View>
      
      <Text style={styles.message}>
        This conversation has been temporarily frozen due to detected safety concerns.
      </Text>
      
      {duration && (
        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>Time Remaining:</Text>
          <Text style={styles.timeValue}>{formatTimeRemaining()}</Text>
        </View>
      )}
      
      {reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reason:</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      )}
      
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          This automatic protection helps ensure all interactions remain safe and respectful.
        </Text>
      </View>
      
      <View style={styles.actions}>
        {onContactSupport && (
          <TouchableOpacity 
            style={styles.supportButton}
            onPress={onContactSupport}
          >
            <Text style={styles.supportButtonText}>Contact Support</Text>
          </TouchableOpacity>
        )}
        
        {onDismiss && (
          <TouchableOpacity 
            style={styles.dismissButton}
            onPress={onDismiss}
          >
            <Text style={styles.dismissButtonText}>Understood</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991B1B',
  },
  message: {
    fontSize: 15,
    color: '#7F1D1D',
    lineHeight: 22,
    marginBottom: 16,
  },
  timeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  timeValue: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '700',
  },
  reasonBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  reasonText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  supportButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  supportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  dismissButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
