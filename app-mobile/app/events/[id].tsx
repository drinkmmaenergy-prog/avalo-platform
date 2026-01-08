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
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Event, EventTicket } from '../../types/events';

export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasTicket, setHasTicket] = useState(false);

  useEffect(() => {
    loadEventDetails();
  }, [id]);

  const loadEventDetails = async () => {
    try {
      const eventDoc = await getDoc(doc(db, 'events', id as string));
      
      if (eventDoc.exists()) {
        setEvent({ eventId: eventDoc.id, ...eventDoc.data() } as Event);
        
        // Check if user has ticket (placeholder - integrate with auth)
        const userId = 'CURRENT_USER_ID'; // TODO: Get from auth
        const ticketId = `${userId}_${id}`;
        const ticketDoc = await getDoc(doc(db, 'eventTickets', ticketId));
        setHasTicket(ticketDoc.exists());
      }
    } catch (error) {
      console.error('Error loading event:', error);
      Alert.alert('Error', 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseTicket = () => {
    if (!event) return;
    
    router.push({
      pathname: '/events/purchase',
      params: { eventId: event.eventId },
    });
  };

  const handleViewTicket = () => {
    if (!event) return;
    
    router.push({
      pathname: '/events/ticket',
      params: { eventId: event.eventId },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  const isSoldOut = event.stats.ticketsSold >= event.maxParticipants;
  const availableTickets = event.maxParticipants - event.stats.ticketsSold;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{event.title}</Text>
        
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{event.status}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <Text style={styles.infoText}>Start: {new Date(event.startTime).toLocaleString()}</Text>
          <Text style={styles.infoText}>End: {new Date(event.endTime).toLocaleString()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.infoText}>Type: {event.location.type}</Text>
          {event.location.address && (
            <Text style={styles.infoText}>Address: {event.location.address}</Text>
          )}
          {event.location.onlineUrl && (
            <Text style={styles.infoText}>URL: {event.location.onlineUrl}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ticket Information</Text>
          <Text style={styles.priceText}>{event.priceTokens} Tokens</Text>
          <Text style={styles.infoText}>
            Available: {availableTickets} / {event.maxParticipants}
          </Text>
          <Text style={styles.infoText}>
            Sold: {event.stats.ticketsSold}
          </Text>
          <Text style={styles.infoText}>
            Check-ins: {event.stats.checkIns}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Features</Text>
          <Text style={styles.infoText}>
            ✓ Selfie verification: {event.safety.requireSelfieCheck ? 'Required' : 'Optional'}
          </Text>
          <Text style={styles.infoText}>
            ✓ Panic mode: {event.safety.allowPanicMode ? 'Enabled' : 'Disabled'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Refund Policy</Text>
          <Text style={styles.infoText}>• Participant cancellation: No refund</Text>
          <Text style={styles.infoText}>• Organizer cancellation: Full refund</Text>
          <Text style={styles.infoText}>• Appearance mismatch: Full refund</Text>
        </View>

        {event.status === 'PUBLISHED' && !hasTicket && (
          <TouchableOpacity
            style={[styles.purchaseButton, isSoldOut && styles.buttonDisabled]}
            onPress={handlePurchaseTicket}
            disabled={isSoldOut}
          >
            <Text style={styles.purchaseButtonText}>
              {isSoldOut ? 'Sold Out' : 'Purchase Ticket'}
            </Text>
          </TouchableOpacity>
        )}

        {hasTicket && (
          <TouchableOpacity style={styles.viewTicketButton} onPress={handleViewTicket}>
            <Text style={styles.viewTicketButtonText}>View My Ticket</Text>
          </TouchableOpacity>
        )}

        {event.status === 'CANCELLED' && (
          <View style={styles.cancelledNotice}>
            <Text style={styles.cancelledText}>This event has been cancelled</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#000',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  infoText: {
    fontSize: 16,
    marginBottom: 4,
    color: '#333',
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  purchaseButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  viewTicketButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  viewTicketButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelledNotice: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 8,
    marginTop: 24,
  },
  cancelledText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});