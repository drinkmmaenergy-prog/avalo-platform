/**
 * Calendar Screen
 * Displays bookings and meetups with escrow management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'expo-router';
import {
  getUserBookings,
  markBookingCompleted,
  cancelBooking,
  Booking,
} from "@/services/bookingService";
import { getProfile, ProfileData } from "@/lib/profileService";

export default function CalendarScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'booker' | 'creator'>('booker');
  const [profiles, setProfiles] = useState<{ [key: string]: ProfileData }>({});
  const router = useRouter();

  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) {
      loadBookings();
    }
  }, [currentUser, activeTab]);

  const loadBookings = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const userBookings = await getUserBookings(currentUser.uid, activeTab);
      setBookings(userBookings);

      // Load profiles for all bookings
      const profileIds = new Set<string>();
      userBookings.forEach((booking) => {
        profileIds.add(booking.bookerId);
        profileIds.add(booking.creatorId);
      });

      const loadedProfiles: { [key: string]: ProfileData } = {};
      for (const userId of Array.from(profileIds)) {
        if (userId !== currentUser.uid) {
          const profile = await getProfile(userId);
          if (profile) {
            loadedProfiles[userId] = profile;
          }
        }
      }
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('Error loading bookings:', error);
      Alert.alert('Error', 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  };

  const handleMarkCompleted = async (bookingId: string) => {
    if (!currentUser) return;

    Alert.alert(
      'Confirm Completion',
      'Mark this meetup as completed? This will release the escrow payment to the creator.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const result = await markBookingCompleted(
              bookingId,
              currentUser.uid,
              activeTab
            );

            if (result.success) {
              Alert.alert(
                'Success',
                result.escrowReleased
                  ? 'Booking completed and payment released!'
                  : 'Your confirmation has been recorded'
              );
              loadBookings();
            } else {
              Alert.alert('Error', result.error || 'Failed to mark as completed');
            }
          },
        },
      ]
    );
  };

  const handleCancelBooking = async (bookingId: string, dateTime: Date) => {
    if (!currentUser) return;

    const hoursUntil = (dateTime.getTime() - Date.now()) / (1000 * 60 * 60);
    const refundMessage =
      activeTab === 'creator'
        ? 'The booker will receive a full refund of the booking amount.'
        : hoursUntil > 24
        ? 'You will receive a 50% refund.'
        : 'No refund available (less than 24h until meetup).';

    Alert.alert(
      'Cancel Booking',
      `Are you sure you want to cancel this booking?\n\n${refundMessage}`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelBooking(bookingId, currentUser.uid, activeTab);

            if (result.success) {
              Alert.alert(
                'Booking Cancelled',
                result.refundAmount
                  ? `Refund: ${result.refundAmount} tokens`
                  : 'No refund issued'
              );
              loadBookings();
            } else {
              Alert.alert('Error', result.error || 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  };

  const renderBookingCard = (booking: Booking) => {
    const otherUserId =
      activeTab === 'booker' ? booking.creatorId : booking.bookerId;
    const otherProfile = profiles[otherUserId];
    const isPast = booking.dateTime < new Date();
    const canComplete =
      booking.status === 'pending' && isPast;
    const canCancel = booking.status === 'pending' && !isPast;

    return (
      <View key={booking.id} style={styles.bookingCard}>
        {/* Status Badge */}
        <View
          style={[
            styles.statusBadge,
            booking.status === 'completed' && styles.statusCompleted,
            booking.status === 'cancelled' && styles.statusCancelled,
            booking.status === 'confirmed' && styles.statusConfirmed,
          ]}
        >
          <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
        </View>

        {/* User Info */}
        <View style={styles.bookingHeader}>
          <Text style={styles.bookingUser}>
            {activeTab === 'booker' ? '👤 Meeting with: ' : '📅 Booked by: '}
            {otherProfile?.name || 'Unknown'}
          </Text>
          <Text style={styles.bookingPrice}>{booking.bookingPrice} tokens</Text>
        </View>

        {/* Date & Time */}
        <Text style={styles.bookingDateTime}>
          📆 {booking.dateTime.toLocaleDateString()} at{' '}
          {booking.dateTime.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>

        {/* Location */}
        {booking.location && (
          <Text style={styles.bookingLocation}>📍 {booking.location}</Text>
        )}

        {/* Notes */}
        {booking.notes && (
          <Text style={styles.bookingNotes}>📝 {booking.notes}</Text>
        )}

        {/* Financial Breakdown */}
        <View style={styles.breakdown}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Total Paid:</Text>
            <Text style={styles.breakdownValue}>{booking.bookingPrice} tokens</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform Fee (instant):</Text>
            <Text style={styles.breakdownValue}>{booking.avaloFeeAmount} tokens</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              {booking.status === 'completed' ? 'Released to creator:' : 'In Escrow:'}
            </Text>
            <Text style={[styles.breakdownValue, styles.escrowValue]}>
              {booking.escrowAmount} tokens
            </Text>
          </View>
        </View>

        {/* Confirmation Status */}
        {booking.status === 'pending' && (
          <View style={styles.confirmationStatus}>
            <Text style={styles.confirmationText}>
              ✓ Booker: {booking.bookerConfirmed ? '✅' : '⏳'}
            </Text>
            <Text style={styles.confirmationText}>
              ✓ Creator: {booking.creatorConfirmed ? '✅' : '⏳'}
            </Text>
          </View>
        )}

        {/* Actions */}
        {booking.status === 'pending' && (
          <View style={styles.actions}>
            {canComplete && (
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => handleMarkCompleted(booking.id!)}
              >
                <Text style={styles.completeButtonText}>Mark as Completed</Text>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelBooking(booking.id!, booking.dateTime)}
              >
                <Text style={styles.cancelButtonText}>Cancel Booking</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading bookings...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📅 Calendar & Meetups</Text>
        <Text style={styles.headerSubtitle}>Manage your bookings with escrow protection</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'booker' && styles.tabActive]}
          onPress={() => setActiveTab('booker')}
        >
          <Text
            style={[styles.tabText, activeTab === 'booker' && styles.tabTextActive]}
          >
            My Bookings
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'creator' && styles.tabActive]}
          onPress={() => setActiveTab('creator')}
        >
          <Text
            style={[styles.tabText, activeTab === 'creator' && styles.tabTextActive]}
          >
            Booked with Me
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bookings List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Bookings Yet</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'booker'
                ? 'Book a meetup with a creator to see it here'
                : 'When someone books with you, it will appear here'}
            </Text>
          </View>
        ) : (
          bookings.map(renderBookingCard)
        )}
      </ScrollView>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          💡 Escrow Protection: Payments are held securely until both parties confirm completion
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#FF6B6B',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFA500',
  },
  statusCompleted: {
    backgroundColor: '#4CAF50',
  },
  statusCancelled: {
    backgroundColor: '#F44336',
  },
  statusConfirmed: {
    backgroundColor: '#2196F3',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 80,
  },
  bookingUser: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  bookingPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  bookingDateTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  bookingLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  bookingNotes: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  breakdown: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  escrowValue: {
    color: '#4CAF50',
  },
  confirmationStatus: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginBottom: 12,
  },
  confirmationText: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  completeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F44336',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
  },
  infoBannerText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center',
  },
});
