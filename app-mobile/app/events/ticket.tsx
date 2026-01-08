import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from "@/lib/firebase";
import { doc, getDoc } from 'firebase/firestore';
import { Event, EventTicket } from "@/types/events";
import QRCode from 'react-native-qrcode-svg';

export default function TicketViewScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [ticket, setTicket] = useState<EventTicket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTicketDetails();
  }, [eventId]);

  const loadTicketDetails = async () => {
    try {
      // Load event
      const eventDoc = await getDoc(doc(db, 'events', eventId as string));
      if (eventDoc.exists()) {
        setEvent({ eventId: eventDoc.id, ...eventDoc.data() } as Event);
      }

      // Load ticket (placeholder - integrate with auth)
      const userId = 'CURRENT_USER_ID'; // TODO: Get from auth
      const ticketId = `${userId}_${eventId}`;
      const ticketDoc = await getDoc(doc(db, 'eventTickets', ticketId));
      
      if (ticketDoc.exists()) {
        setTicket(ticketDoc.data() as EventTicket);
      }
    } catch (error) {
      console.error('Error loading ticket:', error);
      Alert.alert('Error', 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTicket = () => {
    Alert.alert(
      'Cancel Ticket',
      'Are you sure you want to cancel this ticket?\n\n' +
      '⚠️ NO REFUND will be issued.\n' +
      'The organizer will still receive 80% and Avalo keeps 20%.',
      [
        { text: 'Keep Ticket', style: 'cancel' },
        {
          text: 'Cancel Ticket',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call Cloud Function to cancel ticket
              Alert.alert('Cancelled', 'Your ticket has been cancelled. No refund issued.');
              router.back();
            } catch (error) {
              console.error('Error cancelling ticket:', error);
              Alert.alert('Error', 'Failed to cancel ticket');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!event || !ticket) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Ticket not found</Text>
      </View>
    );
  }

  const getStatusColor = () => {
    switch (ticket.status) {
      case 'PURCHASED':
        return '#34C759';
      case 'COMPLETED':
        return '#007AFF';
      case 'CANCELLED_BY_PARTICIPANT':
      case 'CANCELLED_BY_ORGANIZER':
        return '#FF3B30';
      case 'REFUNDED_MISMATCH':
        return '#FF9500';
      default:
        return '#8E8E93';
    }
  };

  const getStatusText = () => {
    switch (ticket.status) {
      case 'PURCHASED':
        return 'Valid';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED_BY_PARTICIPANT':
        return 'Cancelled (No Refund)';
      case 'CANCELLED_BY_ORGANIZER':
        return 'Cancelled (Full Refund)';
      case 'REFUNDED_MISMATCH':
        return 'Refunded (Mismatch)';
      case 'NO_SHOW':
        return 'No Show';
      default:
        return ticket.status;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Event Ticket</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>
        </View>

        {ticket.status === 'PURCHASED' && (
          <View style={styles.qrSection}>
            <Text style={styles.qrTitle}>Scan QR Code at Entry</Text>
            <View style={styles.qrContainer}>
              <QRCode
                value={ticket.checkIn.qrCode}
                size={250}
                backgroundColor="white"
                color="black"
              />
            </View>
            <Text style={styles.qrHelpText}>Show this to organizer at check-in</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{event.title}</Text>
          <Text style={styles.infoText}>
            📅 {new Date(event.startTime).toLocaleString()}
          </Text>
          <Text style={styles.infoText}>
            📍 {event.location.type === 'physical' ? event.location.address : 'Online event'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ticket Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ticket ID:</Text>
            <Text style={styles.infoValue}>{ticket.ticketId.substring(0, 12)}...</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Price Paid:</Text>
            <Text style={styles.infoValue}>{ticket.priceTokens} tokens</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Purchase Date:</Text>
            <Text style={styles.infoValue}>
              {new Date(ticket.timestamps.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {ticket.checkIn.checkInAt && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Check-In Details</Text>
            <View style={styles.checkInCard}>
              <Text style={styles.checkInText}>
                ✓ Checked in: {new Date(ticket.checkIn.checkInAt).toLocaleString()}
              </Text>
              <Text style={styles.checkInText}>
                ✓ Selfie verified: {ticket.checkIn.selfieVerified ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        )}

        {ticket.payment.refundedUserTokens > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Refund Details</Text>
            <View style={styles.refundCard}>
              <Text style={styles.refundText}>
                Refunded: {ticket.payment.refundedUserTokens} tokens
              </Text>
              {ticket.payment.refundedAvaloTokens > 0 && (
                <Text style={styles.refundText}>
                  (Including {ticket.payment.refundedAvaloTokens} tokens from Avalo fee)
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Breakdown</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Total Paid:</Text>
            <Text style={styles.breakdownValue}>{ticket.payment.totalTokensPaid} tokens</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Organizer Share (80%):</Text>
            <Text style={styles.breakdownValue}>{ticket.payment.organizerShareTokens} tokens</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform Fee (20%):</Text>
            <Text style={styles.breakdownValue}>{ticket.payment.avaloShareTokens} tokens</Text>
          </View>
        </View>

        {ticket.status === 'PURCHASED' && !ticket.checkIn.checkInAt && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTicket}>
            <Text style={styles.cancelButtonText}>Cancel Ticket (No Refund)</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  qrSection: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000',
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
  },
  qrHelpText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#000',
  },
  infoText: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  checkInCard: {
    backgroundColor: '#D1F2EB',
    padding: 12,
    borderRadius: 8,
  },
  checkInText: {
    fontSize: 14,
    color: '#00695C',
    marginBottom: 4,
  },
  refundCard: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
  },
  refundText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
