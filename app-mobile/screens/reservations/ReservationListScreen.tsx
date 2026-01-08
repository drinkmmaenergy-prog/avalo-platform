/**
 * PACK 58 — Reservation List Screen
 * Shows user's reservations as creator or client
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {
  fetchReservations,
  ReservationSummary,
  getStatusColor,
  formatTimeSlot,
  isUpcoming,
} from '../../services/reservationService';

interface Props {
  route: {
    params: {
      userId: string;
      role: 'creator' | 'client';
    };
  };
  navigation: any;
}

export default function ReservationListScreen({ route, navigation }: Props) {
  const { userId, role } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);

  useEffect(() => {
    loadReservations();
  }, []);

  const loadReservations = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const now = new Date();
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const result = await fetchReservations(
        userId,
        role,
        threeMonthsAgo.toISOString(),
        threeMonthsLater.toISOString()
      );

      setReservations(result);
    } catch (error) {
      console.error('Error loading reservations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadReservations(true);
  };

  const handleReservationPress = (reservation: ReservationSummary) => {
    navigation.navigate('ReservationDetail', {
      reservationId: reservation.reservationId,
      userId,
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading reservations...</Text>
      </View>
    );
  }

  const upcomingReservations = reservations.filter((r) =>
    ['PENDING_PAYMENT', 'CONFIRMED'].includes(r.status) &&
    new Date(r.startTimeUtc) > new Date()
  );

  const pastReservations = reservations.filter((r) =>
    !['PENDING_PAYMENT', 'CONFIRMED'].includes(r.status) ||
    new Date(r.startTimeUtc) <= new Date()
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Upcoming */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming</Text>
        {upcomingReservations.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming meetings</Text>
        ) : (
          upcomingReservations.map((reservation) => (
            <TouchableOpacity
              key={reservation.reservationId}
              style={styles.card}
              onPress={() => handleReservationPress(reservation)}
            >
              <View style={styles.cardHeader}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(reservation.status) },
                ]}>
                  <Text style={styles.statusText}>{reservation.status}</Text>
                </View>
                {isUpcoming(reservation.startTimeUtc) && (
                  <View style={styles.upcomingBadge}>
                    <Text style={styles.upcomingText}>Soon</Text>
                  </View>
                )}
              </View>
              <Text style={styles.dateText}>
                {formatTimeSlot(reservation.startTimeUtc, reservation.endTimeUtc, reservation.timezone)}
              </Text>
              <Text style={styles.priceText}>{reservation.priceTokens} tokens</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Past */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Past</Text>
        {pastReservations.length === 0 ? (
          <Text style={styles.emptyText}>No past meetings</Text>
        ) : (
          pastReservations.map((reservation) => (
            <TouchableOpacity
              key={reservation.reservationId}
              style={[styles.card, styles.cardPast]}
              onPress={() => handleReservationPress(reservation)}
            >
              <View style={styles.cardHeader}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(reservation.status) },
                ]}>
                  <Text style={styles.statusText}>{reservation.status}</Text>
                </View>
              </View>
              <Text style={styles.dateText}>
                {formatTimeSlot(reservation.startTimeUtc, reservation.endTimeUtc, reservation.timezone)}
              </Text>
              <Text style={styles.priceText}>{reservation.priceTokens} tokens</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardPast: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  upcomingBadge: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  upcomingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 4,
  },
  priceText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
  },
});
