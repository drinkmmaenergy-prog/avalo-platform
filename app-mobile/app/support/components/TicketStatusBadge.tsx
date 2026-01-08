/**
 * PACK 300A - Ticket Status Badge Component
 * Visual indicator for ticket status
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TicketStatus, TICKET_STATUS_LABELS, getStatusColor } from "@/shared/types/support";

interface TicketStatusBadgeProps {
  status: TicketStatus;
  locale?: string;
}

export default function TicketStatusBadge({ status, locale = 'en' }: TicketStatusBadgeProps) {
  const label = locale === 'pl' 
    ? TICKET_STATUS_LABELS[status].pl 
    : TICKET_STATUS_LABELS[status].en;
  
  const color = getStatusColor(status);

  return (
    <View style={[styles.container, { backgroundColor: color + '20' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
