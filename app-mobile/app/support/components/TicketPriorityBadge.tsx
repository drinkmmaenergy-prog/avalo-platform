/**
 * PACK 300A - Ticket Priority Badge Component
 * Visual indicator for ticket priority level
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TicketPriority, TICKET_PRIORITY_LABELS, getPriorityColor } from "@/shared/types/support";
import { Ionicons } from '@expo/vector-icons';

interface TicketPriorityBadgeProps {
  priority: TicketPriority;
  locale?: string;
  showIcon?: boolean;
}

export default function TicketPriorityBadge({ 
  priority, 
  locale = 'en', 
  showIcon = true 
}: TicketPriorityBadgeProps) {
  const label = locale === 'pl' 
    ? TICKET_PRIORITY_LABELS[priority].pl 
    : TICKET_PRIORITY_LABELS[priority].en;
  
  const color = getPriorityColor(priority);

  const getIcon = () => {
    switch (priority) {
      case 'CRITICAL':
        return 'alert-circle';
      case 'HIGH':
        return 'arrow-up-circle';
      case 'NORMAL':
        return 'ellipse';
      case 'LOW':
        return 'arrow-down-circle';
      default:
        return 'ellipse';
    }
  };

  return (
    <View style={[styles.container, { borderColor: color }]}>
      {showIcon && (
        <Ionicons name={getIcon() as any} size={14} color={color} />
      )}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
