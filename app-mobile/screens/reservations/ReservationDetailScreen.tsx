/**
 * PACK 58 — Reservation Detail Screen
 * Shows detailed information and actions for a specific reservation
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
  fetchReservations,
  cancelReservation,
  confirmReservationOutcome,
  ReservationSummary,
  getStatusColor,
  formatTimeSlot,
  canCancelReservation,
  canConfirmReservation,
  hasUserConfirmed,
} from '../../services/reservationService';

interface Props {
  route: {
    params: {
      reservationId: string;
      userId: string;
    };
  };
  navigation: any;
}

export default function ReservationDetailScreen({ route, navigation }: Props) {
  const { reservationId, userId } = route.params;

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadReservation();
  }, []);

  const loadReservation = async () => {
    try {
      setLoading(true);
      
      // Fetch from both lists and find the reservation
      const now = new Date();
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const creatorRes = await fetchReservations(
        userId,
        'creator',
        threeMonthsAgo.toISOString(),
        threeMonthsLater.toISOString()
      );

      const clientRes = await fetchReservations(
        userId,
        'client',
        threeMonthsAgo.toISOString(),
        threeMonthsLater.toISOString()
      );

      const allReservations = [...creatorRes, ...clientRes];
      const found = allReservations.find((r) => r.reservationId === reservationId);

      if (found) {
        setReservation(found);
      } else {
        Alert.alert('Error', 'Reservation not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error loading reservation:', error);
      Alert.alert('Error', 'Failed to load reservation');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;

    Alert.alert(
      'Cancel Meeting',
      'Are you sure you want to cancel this meeting?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              await cancelReservation(userId, reservationId);
              Alert.alert('Success', 'Meeting cancelled', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirm = async () => {
    if (!reservation) return;

    try {
      setProcessing(true);
      await confirmReservationOutcome(userId, reservationId, 'CONFIRM');
      Alert.alert('Success', 'Meeting confirmed');
      loadReservation();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to confirm');
    } finally {
      setProcessing(false);
    }
  };

  const handleNoShow = async () => {
    if (!reservation) return;

    Alert.alert(
      'Report No-Show',
      'Report that the other party did not show up for the meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report No-Show',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              await confirmReservationOutcome(userId, reservationId, 'NO_SHOW_OTHER');
              Alert.alert('Reported', 'No-show has been reported');
              loadReservation();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to report');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Reservation not found</Text>
      </View>
    );
  }

  const isCreator = reservation.creatorUserId === userId;
  const userConfirmed = hasUserConfirmed(reservation, userId);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <View style={[
          styles.statusBadge,
          { backgroundColor: getStatusColor(reservation.status) },
        ]}>
          <Text style={styles.statusText}>{reservation.status}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Date & Time</Text>
          <Text style={styles.value}>
            {formatTimeSlot(reservation.startTimeUtc, reservation.endTimeUtc, reservation.timezone)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Price</Text>
          <Text style={styles.priceValue}>{reservation.priceTokens} tokens</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{isCreator ? 'Creator (Earner)' : 'Client (Payer)'}</Text>
        </View>

        {reservation.escrowId && (
          <View style={styles.section}>
            <Text style={styles.label}>Escrow</Text>
            <Text style={styles.valueSmall}>Tokens locked in escrow</Text>
          </View>
        )}

        {reservation.status === 'CONFIRMED' && (
          <View style={styles.section}>
            <Text style={styles.label}>Confirmation Status</Text>
            {userConfirmed ? (
              <Text style={styles.successText}>✓ You confirmed</Text>
            ) : (
              <Text style={styles.warningText}>⏳ Awaiting your confirmation</Text>
            )}
            {isCreator && reservation.clientConfirmed && (
              <Text style={styles.successText}>✓ Client confirmed</Text>
            )}
            {!isCreator && reservation.creatorConfirmed && (
              <Text style={styles.successText}>✓ Creator confirmed</Text>
            )}
          </View>
        )}

        {reservation.disputeId && (
          <View style={styles.section}>
            <Text style={styles.label}>Dispute</Text>
            <Text style={styles.errorText}>This reservation is in dispute</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                /* Navigate to dispute detail */
              }}
            >
              <Text style={styles.linkText}>View Dispute →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsCard}>
        {canCancelReservation(reservation, userId) && (
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
            disabled={processing}
          >
            <Text style={styles.actionButtonText}>Cancel Meeting</Text>
          </TouchableOpacity>
        )}

        {canConfirmReservation(reservation, userId) && !userConfirmed && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={handleConfirm}
              disabled={processing}
            >
              <Text style={styles.actionButtonText}>Confirm Meeting Took Place</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.noShowButton]}
              onPress={handleNoShow}
              disabled={processing}
            >
              <Text style={styles.actionButtonText}>Report No-Show</Text>
            </TouchableOpacity>
          </>
        )}

        {processing && (
          <ActivityIndicator size="small" color="#667eea" style={{ marginTop: 16 }} />
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
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    color: '#111827',
  },
  valueSmall: {
    fontSize: 14,
    color: '#374151',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#667eea',
  },
  successText: {
    fontSize: 14,
    color: '#10b981',
    marginTop: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#f59e0b',
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginTop: 4,
  },
  linkButton: {
    marginTop: 8,
  },
  linkText: {
    color: '#667eea',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: '#ef4444',
  },
  confirmButton: {
    backgroundColor: '#10b981',
  },
  noShowButton: {
    backgroundColor: '#f59e0b',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
