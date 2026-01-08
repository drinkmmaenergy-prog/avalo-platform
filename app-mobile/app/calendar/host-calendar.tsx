/**
 * PACK 274 - Host Calendar Management Screen
 * Allows hosts to manage their calendar slots, view bookings, and earnings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import type { Calendar, CalendarSlot, CalendarBooking } from "@/shared/src/types/calendar";

export default function HostCalendarScreen() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSlot, setShowAddSlot] = useState(false);

  // New slot form
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');
  const [newSlotPrice, setNewSlotPrice] = useState('');

  const userId = auth.currentUser?.uid;

  useEffect(() => {
    if (userId) {
      loadCalendar();
      loadBookings();
    }
  }, [userId]);

  const loadCalendar = async () => {
    if (!userId) return;

    try {
      const calendarRef = doc(db, 'calendars', userId);
      const calendarSnap = await getDoc(calendarRef);

      if (calendarSnap.exists()) {
        setCalendar(calendarSnap.data() as Calendar);
      } else {
        // Create default calendar
        const defaultCalendar: Calendar = {
          userId,
          timeZone: 'Europe/Warsaw',
          availableSlots: [],
          settings: {
            autoAccept: true,
            minAdvanceHours: 24,
            maxAdvanceDays: 30,
          },
        };
        await setDoc(calendarRef, defaultCalendar);
        setCalendar(defaultCalendar);
      }
    } catch (error) {
      console.error('Error loading calendar:', error);
      Alert.alert('Error', 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    if (!userId) return;

    try {
      const bookingsQuery = query(
        collection(db, 'calendarBookings'),
        where('hostId', '==', userId)
      );
      const bookingsSnap = await getDocs(bookingsQuery);
      
      const bookingsList = bookingsSnap.docs.map(doc => ({
        ...doc.data(),
        bookingId: doc.id,
      })) as CalendarBooking[];

      // Sort by start date
      bookingsList.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      setBookings(bookingsList);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const addSlot = async () => {
    if (!calendar || !userId) return;

    if (!newSlotStart || !newSlotEnd || !newSlotPrice) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const priceTokens = parseInt(newSlotPrice);
    if (isNaN(priceTokens) || priceTokens < 1) {
      Alert.alert('Error', 'Invalid price');
      return;
    }

    try {
      const newSlot: CalendarSlot = {
        slotId: `slot_${Date.now()}`,
        start: new Date(newSlotStart).toISOString(),
        end: new Date(newSlotEnd).toISOString(),
        priceTokens,
        maxGuests: 1,
        status: 'available',
      };

      const updatedCalendar = {
        ...calendar,
        availableSlots: [...calendar.availableSlots, newSlot],
      };

      await setDoc(doc(db, 'calendars', userId), updatedCalendar);
      setCalendar(updatedCalendar);
      
      // Reset form
      setNewSlotStart('');
      setNewSlotEnd('');
      setNewSlotPrice('');
      setShowAddSlot(false);

      Alert.alert('Success', 'Slot added successfully');
    } catch (error) {
      console.error('Error adding slot:', error);
      Alert.alert('Error', 'Failed to add slot');
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!calendar || !userId) return;

    Alert.alert(
      'Delete Slot',
      'Are you sure you want to delete this slot?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedCalendar = {
                ...calendar,
                availableSlots: calendar.availableSlots.filter(s => s.slotId !== slotId),
              };

              await setDoc(doc(db, 'calendars', userId), updatedCalendar);
              setCalendar(updatedCalendar);
              Alert.alert('Success', 'Slot deleted');
            } catch (error) {
              console.error('Error deleting slot:', error);
              Alert.alert('Error', 'Failed to delete slot');
            }
          },
        },
      ]
    );
  };

  const calculateEarnings = () => {
    return bookings
      .filter(b => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + b.payment.userShareTokens, 0);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return '#4CAF50';
      case 'COMPLETED':
        return '#2196F3';
      case 'CANCELLED_BY_GUEST':
      case 'CANCELLED_BY_HOST':
        return '#FF9800';
      case 'MISMATCH_REFUND':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Calendar</Text>
          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Total Earnings</Text>
            <Text style={styles.earningsAmount}>{calculateEarnings()} tokens</Text>
          </View>
        </View>

        {/* Available Slots */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Available Slots</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddSlot(!showAddSlot)}
            >
              <Text style={styles.addButtonText}>+ Add Slot</Text>
            </TouchableOpacity>
          </View>

          {showAddSlot && (
            <View style={styles.addSlotForm}>
              <TextInput
                style={styles.input}
                placeholder="Start (YYYY-MM-DD HH:MM)"
                value={newSlotStart}
                onChangeText={setNewSlotStart}
              />
              <TextInput
                style={styles.input}
                placeholder="End (YYYY-MM-DD HH:MM)"
                value={newSlotEnd}
                onChangeText={setNewSlotEnd}
              />
              <TextInput
                style={styles.input}
                placeholder="Price (tokens)"
                value={newSlotPrice}
                onChangeText={setNewSlotPrice}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.submitButton} onPress={addSlot}>
                <Text style={styles.submitButtonText}>Add Slot</Text>
              </TouchableOpacity>
            </View>
          )}

          {calendar?.availableSlots.map(slot => (
            <View key={slot.slotId} style={styles.slotCard}>
              <View style={styles.slotInfo}>
                <Text style={styles.slotDate}>
                  {new Date(slot.start).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.slotPrice}>{slot.priceTokens} tokens</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteSlot(slot.slotId)}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}

          {calendar?.availableSlots.length === 0 && (
            <Text style={styles.emptyText}>No available slots. Add one to start!</Text>
          )}
        </View>

        {/* Bookings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bookings</Text>

          {bookings.map(booking => (
            <View key={booking.bookingId} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Text style={styles.bookingDate}>
                  {new Date(booking.start).toLocaleDateString()}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(booking.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{booking.status}</Text>
                </View>
              </View>

              <Text style={styles.bookingTime}>
                {new Date(booking.start).toLocaleTimeString()} - 
                {new Date(booking.end).toLocaleTimeString()}
              </Text>

              <View style={styles.bookingDetails}>
                <Text style={styles.detailLabel}>Price:</Text>
                <Text style={styles.detailValue}>{booking.priceTokens} tokens</Text>
              </View>

              <View style={styles.bookingDetails}>
                <Text style={styles.detailLabel}>Your Earnings:</Text>
                <Text style={styles.detailValue}>
                  {booking.payment.userShareTokens} tokens (80%)
                </Text>
              </View>

              {booking.status === 'COMPLETED' && (
                <Text style={styles.completedNote}>✓ Earnings paid out</Text>
              )}
            </View>
          ))}

          {bookings.length === 0 && (
            <Text style={styles.emptyText}>No bookings yet</Text>
          )}
        </View>

        {/* Revenue Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>💰 Revenue Split</Text>
          <Text style={styles.infoText}>• You receive: 80% of booking price</Text>
          <Text style={styles.infoText}>• Avalo service fee: 20%</Text>
          <Text style={styles.infoText}>
            • Example: 1000 tokens → You earn 800 tokens
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  loading: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  earningsCard: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
  },
  earningsLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.9,
  },
  earningsAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 5,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addSlotForm: {
    backgroundColor: '#F5F5F5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  slotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 10,
  },
  slotInfo: {
    flex: 1,
  },
  slotDate: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  slotPrice: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bookingCard: {
    backgroundColor: '#F9F9F9',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bookingDate: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bookingTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  bookingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  completedNote: {
    marginTop: 10,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    margin: 20,
    borderRadius: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
    lineHeight: 20,
  },
});
