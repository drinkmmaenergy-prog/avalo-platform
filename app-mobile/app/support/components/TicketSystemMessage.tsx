/**
 * PACK 300A - Ticket System Message Component
 * Displays system-generated messages in ticket conversation (status changes, assignments, etc.)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TicketSystemMessageProps {
  message: string;
  timestamp: string;
  type?: 'status_change' | 'assignment' | 'priority_change' | 'general';
}

export default function TicketSystemMessage({ 
  message, 
  timestamp,
  type = 'general' 
}: TicketSystemMessageProps) {
  const getIcon = () => {
    switch (type) {
      case 'status_change':
        return 'checkmark-circle-outline';
      case 'assignment':
        return 'person-outline';
      case 'priority_change':
        return 'alert-circle-outline';
      default:
        return 'information-circle-outline';
    }
  };

  const getColor = () => {
    switch (type) {
      case 'status_change':
        return '#10b981';
      case 'assignment':
        return '#3b82f6';
      case 'priority_change':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const color = getColor();

  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={[styles.content, { borderColor: color }]}>
        <Ionicons name={getIcon() as any} size={16} color={color} />
        <Text style={[styles.message, { color }]}>{message}</Text>
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#f9fafb',
  },
  message: {
    fontSize: 12,
    fontWeight: '500',
  },
});
