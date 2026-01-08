/**
 * PACK 58 — Reservation Booking Screen
 * Allows clients to view creator's availability and book meetings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  fetchCreatorAvailability,
  createReservation,
  TimeSlot,
  CreatorAvailability,
  formatTimeSlot,
} from '../../services/reservationService';

interface Props {
  route: {
    params: {
      creatorUserId: string;
      currentUserId: string;
    };
  };
  navigation: any;
}

export default function ReservationBookingScreen({ route, navigation }: Props) {
  const { creatorUserId, currentUserId } = route.params;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [availability, setAvailability] = useState<CreatorAvailability | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const result = await fetchCreatorAvailability(
        creatorUserId,
        now.toISOString(),
        twoWeeksLater.toISOString()
      );

      setAvailability(result.availability);
      setSlots(result.slots);
    } catch (error) {
      console.error('Error loading availability:', error);
      Alert.alert('Error', 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  const handleBooking = async () => {
    if (!selectedSlot || !availability) return;

    try {
      setBooking(true);

      await createReservation({
        clientUserId: currentUserId,
        creatorUserId,
        startTimeUtc: selectedSlot.startTimeUtc,
        endTimeUtc: selectedSlot.endTimeUtc,
      });

      Alert.alert('Success', 'Meeting booked successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error booking reservation:', error);
      Alert.alert('Error', error.message || 'Failed to book meeting');
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading availability...</Text>
      </View>
    );
  }

  if (!availability) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No availability set</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.price}>{availability.defaultPriceTokens} tokens</Text>
        <Text style={styles.mode}>{availability.meetingMode}</Text>
        {availability.locationHint && (
          <Text style={styles.location}>{availability.locationHint}</Text>
        )}
      </View>

      <ScrollView style={styles.slotsList}>
        <Text style={styles.slotsTitle}>Available Time Slots</Text>
        {slots.length === 0 ? (
          <Text style={styles.emptyText}>No available slots</Text>
        ) : (
          slots.map((slot, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.slotCard,
                selectedSlot === slot && styles.slotCardSelected,
              ]}
              onPress={() => setSelectedSlot(slot)}
            >
              <Text style={[
                styles.slotText,
                selectedSlot === slot && styles.slotTextSelected,
              ]}>
                {formatTimeSlot(slot.startTimeUtc, slot.endTimeUtc, availability.timezone)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {selectedSlot && (
        <TouchableOpacity
          style={[styles.bookButton, booking && styles.bookButtonDisabled]}
          onPress={handleBooking}
          disabled={booking}
        >
          {booking ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.bookButtonText}>
              Book for {availability.defaultPriceTokens} tokens
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 20,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 4,
  },
  mode: {
    fontSize: 14,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  location: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
  },
  slotsList: {
    flex: 1,
    padding: 16,
  },
  slotsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  slotCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  slotCardSelected: {
    borderColor: '#667eea',
    backgroundColor: '#eef2ff',
  },
  slotText: {
    fontSize: 16,
    color: '#374151',
  },
  slotTextSelected: {
    color: '#667eea',
    fontWeight: '600',
  },
  bookButton: {
    margin: 16,
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
