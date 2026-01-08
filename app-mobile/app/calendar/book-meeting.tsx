/**
 * PACK 274 - Guest Booking Screen
 * Allows guests to book calendar slots with clear pricing breakdown
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface CalendarSlot {
  slotId: string;
  start: string;
  end: string;
  priceTokens: number;
  status: string;
}

interface Calendar {
  userId: string;
  timeZone: string;
  availableSlots: CalendarSlot[];
}

export default function BookMeetingScreen() {
  const params = useLocalSearchParams();
  const hostId = params.hostId as string;
  const slotId = params.slotId as string;

  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [userBalance, setUserBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  const userId = auth.currentUser?.uid;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!userId || !hostId) return;

    try {
      // Load calendar
      const calendarRef = doc(db, 'calendars', hostId);
      const calendarSnap = await getDoc(calendarRef);
      
      if (calendarSnap.exists()) {
        const calendarData = calendarSnap.data() as Calendar;
        setCalendar(calendarData);

        // Find selected slot
        const slot = calendarData.availableSlots.find(s => s.slotId === slotId);
        if (slot) {
          setSelectedSlot(slot);
        } else {
          Alert.alert('Error', 'Slot not found');
          router.back();
        }
      }

      // Load user balance
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setUserBalance(userSnap.data().tokens || 0);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const calculatePaymentBreakdown = (price: number) => {
    const avaloFee = Math.floor(price * 0.20);
    const hostReceives = price - avaloFee;

    return {
      total: price,
      hostReceives,
      avaloFee,
    };
  };

  const getRefundPolicy = () => {
    return [
      { time: '>72 hours before', refund: '100% refund (minus Avalo fee)', highlight: true },
      { time: '24-72 hours before', refund: '50% refund' },
      { time: '<24 hours before', refund: 'No refund' },
      { time: 'Host cancels', refund: '100% full refund (including fee)', highlight: true },
      { time: 'Appearance mismatch', refund: '100% full refund (including fee)', highlight: true },
    ];
  };

  const handleBooking = async () => {
    if (!selectedSlot || !userId || !hostId) return;

    if (userBalance < selectedSlot.priceTokens) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${selectedSlot.priceTokens} tokens but only have ${userBalance} tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/wallet/buy-tokens') },
        ]
      );
      return;
    }

    Alert.alert(
      'Confirm Booking',
      `Book this meeting for ${selectedSlot.priceTokens} tokens?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setBooking(true);
            try {
              const functions = getFunctions();
              const createBooking = httpsCallable(functions, 'createCalendarBooking');

              const result = await createBooking({
                hostId,
                guestId: userId,
                slotId: selectedSlot.slotId,
                start: selectedSlot.start,
                end: selectedSlot.end,
                priceTokens: selectedSlot.priceTokens,
              });

              if (result.data.success) {
                Alert.alert(
                  'Booking Confirmed! 🎉',
                  'Your meeting has been booked. Check your email for details.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.push('/calendar/my-bookings'),
                    },
                  ]
                );
              } else {
                throw new Error('Booking failed');
              }
            } catch (error: any) {
              console.error('Error creating booking:', error);
              Alert.alert('Error', error.message || 'Failed to create booking');
            } finally {
              setBooking(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  if (!selectedSlot) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Slot not found</Text>
      </SafeAreaView>
    );
  }

  const breakdown = calculatePaymentBreakdown(selectedSlot.priceTokens);
  const hasEnoughBalance = userBalance >= selectedSlot.priceTokens;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Book Meeting</Text>
        </View>

        {/* Meeting Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Meeting Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>
              {new Date(selectedSlot.start).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time:</Text>
            <Text style={styles.detailValue}>
              {new Date(selectedSlot.start).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' - '}
              {new Date(selectedSlot.end).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>
              {Math.round(
                (new Date(selectedSlot.end).getTime() - new Date(selectedSlot.start).getTime()) /
                  (1000 * 60)
              )}{' '}
              minutes
            </Text>
          </View>
        </View>

        {/* Pricing Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Pricing Breakdown</Text>

          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Total Cost:</Text>
            <Text style={styles.pricingValue}>{breakdown.total} tokens</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.pricingRow}>
            <Text style={styles.pricingSubLabel}>• Host receives (80%):</Text>
            <Text style={styles.pricingSubValue}>{breakdown.hostReceives} tokens</Text>
          </View>

          <View style={styles.pricingRow}>
            <Text style={styles.pricingSubLabel}>• Avalo service fee (20%):</Text>
            <Text style={styles.pricingSubValue}>{breakdown.avaloFee} tokens</Text>
          </View>

          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Your Balance:</Text>
              <Text
                style={[
                  styles.balanceValue,
                  { color: hasEnoughBalance ? '#4CAF50' : '#F44336' },
                ]}
              >
                {userBalance} tokens
              </Text>
            </View>

            {!hasEnoughBalance && (
              <View style={styles.insufficientCard}>
                <Text style={styles.insufficientText}>
                  ⚠️ You need {selectedSlot.priceTokens - userBalance} more tokens
                </Text>
                <TouchableOpacity
                  style={styles.buyTokensButton}
                  onPress={() => router.push('/wallet/buy-tokens')}
                >
                  <Text style={styles.buyTokensText}>Buy Tokens</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Refund Policy */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔄 Cancellation & Refund Policy</Text>

          {getRefundPolicy().map((policy, index) => (
            <View
              key={index}
              style={[
                styles.policyRow,
                policy.highlight && styles.policyRowHighlight,
              ]}
            >
              <Text style={styles.policyTime}>{policy.time}</Text>
              <Text style={styles.policyRefund}>{policy.refund}</Text>
            </View>
          ))}

          <View style={styles.policyNote}>
            <Text style={styles.policyNoteText}>
              💡 Cancel early for better refunds. Avalo fee is only refunded for host cancellations and verified mismatches.
            </Text>
          </View>
        </View>

        {/* Safety Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛡️ Safety Features</Text>
          <Text style={styles.safetyText}>✓ QR code check-in required</Text>
          <Text style={styles.safetyText}>✓ Selfie verification at meeting</Text>
          <Text style={styles.safetyText}>✓ Report mismatch within 15 minutes for full refund</Text>
          <Text style={styles.safetyText}>✓ Active safety tracking during meeting</Text>
        </View>

        {/* Book Button */}
        <TouchableOpacity
          style={[
            styles.bookButton,
            (!hasEnoughBalance || booking) && styles.bookButtonDisabled,
          ]}
          onPress={handleBooking}
          disabled={!hasEnoughBalance || booking}
        >
          {booking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.bookButtonText}>
              {hasEnoughBalance ? 'Confirm Booking' : 'Insufficient Balance'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 30 }} />
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
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#F44336',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 10,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pricingLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  pricingValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 10,
  },
  pricingSubLabel: {
    fontSize: 14,
    color: '#666',
  },
  pricingSubValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  balanceCard: {
    backgroundColor: '#F5F5F5',
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  insufficientCard: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 5,
  },
  insufficientText: {
    fontSize: 14,
    color: '#F57C00',
    marginBottom: 10,
    fontWeight: '600',
  },
  buyTokensButton: {
    backgroundColor: '#FF9800',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  buyTokensText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  policyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  policyRowHighlight: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 5,
  },
  policyTime: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  policyRefund: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  policyNote: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
  },
  policyNoteText: {
    fontSize: 13,
    color: '#1976D2',
    lineHeight: 18,
  },
  safetyText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  bookButton: {
    backgroundColor: '#4CAF50',
    padding: 18,
    margin: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
