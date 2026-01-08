import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from "@/lib/firebase";
import { doc, getDoc } from 'firebase/firestore';
import { Event } from "@/types/events";

export default function PurchaseTicketScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async () => {
    try {
      const eventDoc = await getDoc(doc(db, 'events', eventId as string));
      
      if (eventDoc.exists()) {
        setEvent({ eventId: eventDoc.id, ...eventDoc.data() } as Event);
      }
    } catch (error) {
      console.error('Error loading event:', error);
      Alert.alert('Error', 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!event) return;

    Alert.alert(
      'Confirm Purchase',
      `Purchase ticket for ${event.priceTokens} tokens?\n\n` +
      `You'll pay: ${event.priceTokens} tokens\n` +
      `Organizer gets: ${Math.floor(event.priceTokens * 0.8)} tokens (80%)\n` +
      `Platform fee: ${Math.floor(event.priceTokens * 0.2)} tokens (20%)\n\n` +
      'No refund if you cancel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            setPurchasing(true);
            
            try {
              // TODO: Call Cloud Function to purchase ticket
              // const result = await purchaseEventTicket(event.eventId, userId);
              
              // Simulated success
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              Alert.alert('Success', 'Ticket purchased successfully!', [
                {
                  text: 'View Ticket',
                  onPress: () => {
                    router.replace({
                      pathname: '/events/ticket' as any,
                      params: { eventId: event.eventId },
                    });
                  },
                },
              ]);
            } catch (error) {
              console.error('Error purchasing ticket:', error);
              Alert.alert('Error', 'Failed to purchase ticket. Please try again.');
            } finally {
              setPurchasing(false);
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

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  const organizerShare = Math.floor(event.priceTokens * 0.8);
  const avaloShare = Math.floor(event.priceTokens * 0.2);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Purchase Ticket</Text>
        
        <View style={styles.eventCard}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventDate}>
            {new Date(event.startTime).toLocaleDateString()}
          </Text>
          <Text style={styles.eventLocation}>{event.location.type} event</Text>
          {event.location.address && (
            <Text style={styles.eventAddress}>{event.location.address}</Text>
          )}
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Ticket Price</Text>
          <Text style={styles.priceValue}>{event.priceTokens} Tokens</Text>
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Payment Breakdown</Text>
          
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>You pay:</Text>
            <Text style={styles.breakdownValue}>{event.priceTokens} tokens</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Organizer receives:</Text>
            <Text style={styles.breakdownValue}>{organizerShare} tokens (80%)</Text>
          </View>
          
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform fee:</Text>
            <Text style={styles.breakdownValue}>{avaloShare} tokens (20%)</Text>
          </View>
        </View>

        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>📋 Refund Policy</Text>
          <Text style={styles.policyText}>• No refund if you cancel</Text>
          <Text style={styles.policyText}>• Full refund if organizer cancels</Text>
          <Text style={styles.policyText}>• Full refund if appearance mismatch</Text>
        </View>

        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>🛡️ Safety Features</Text>
          {event.safety.requireSelfieCheck && (
            <Text style={styles.safetyText}>✓ Selfie verification required at entry</Text>
          )}
          {event.safety.allowPanicMode && (
            <Text style={styles.safetyText}>✓ Panic mode available during event</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.purchaseButton, purchasing && styles.buttonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          <Text style={styles.purchaseButtonText}>
            {purchasing ? 'Processing...' : `Purchase for ${event.priceTokens} Tokens`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
  },
  eventCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  eventDate: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  eventAddress: {
    fontSize: 14,
    color: '#666',
  },
  priceCard: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  breakdownCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#000',
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
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  policyCard: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  policyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  policyText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  safetyCard: {
    backgroundColor: '#D1F2EB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  safetyText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  purchaseButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
