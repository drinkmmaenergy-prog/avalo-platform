/**
 * PACK 130 — Frozen Conversation Banner (Mobile)
 * 
 * Displays neutral, non-accusatory messaging when conversation is frozen
 * De-escalation UX to avoid trauma
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface FrozenConversationBannerProps {
  message?: string;
  estimatedMinutes?: number;
  showSupportLink?: boolean;
  onContactSupport?: () => void;
}

export const FrozenConversationBanner: React.FC<FrozenConversationBannerProps> = ({
  message = 'Some recent actions triggered a safety review; we\'ve paused messaging temporarily while we verify.',
  estimatedMinutes,
  showSupportLink = true,
  onContactSupport,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={24} color="#007AFF" />
        <Text style={styles.title}>Safety Review in Progress</Text>
      </View>
      
      <Text style={styles.message}>{message}</Text>
      
      {estimatedMinutes && (
        <Text style={styles.estimate}>
          Estimated time: {estimatedMinutes} {estimatedMinutes === 1 ? 'minute' : 'minutes'}
        </Text>
      )}
      
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color="#666" />
        <Text style={styles.infoText}>
          No action is required from you right now. We'll notify you when messaging is restored.
        </Text>
      </View>
      
      {showSupportLink && (
        <TouchableOpacity 
          style={styles.supportButton}
          onPress={onContactSupport}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#007AFF" />
          <Text style={styles.supportText}>Contact Support</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  estimate: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    lineHeight: 18,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  supportText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 6,
  },
});
