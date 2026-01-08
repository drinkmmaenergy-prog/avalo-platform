import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

type MeetStatus = 'booked' | 'waiting' | 'completed' | 'cancelled' | 'dispute';

interface Booking {
  bookingId: string;
  meetType: 'real_meet' | 'social_meet';
  hostId: string;
  guestId: string;
  price: number;
  escrowAmount: number;
  avaloFee: number;
  status: MeetStatus;
  scheduledDate: { _seconds: number };
  location?: string;
  notes?: string;
  cancelledBy?: string;
  disputeId?: string;
}

export default function BookingStatus() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [userRole, setUserRole] = useState<'host' | 'guest' | null>(null);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    try {
      const auth = getAuth(getApp());
      if (!auth.currentUser) return;

      const functions = getFunctions(getApp());
      const getBookingFunc = httpsCallable(functions, 'meet_getBooking');
      
      const result = await getBookingFunc({ bookingId });
      const data = result.data as { success: boolean; booking?: Booking };
      
      if (data.success && data.booking) {
        setBooking(data.booking);
        
        if (data.booking.hostId === auth.currentUser.uid) {
          setUserRole('host');
        } else if (data.booking.guestId === auth.currentUser.uid) {
          setUserRole('guest');
        }
      }
    } catch (error) {
      console.error('Error loading booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmComplete = async () => {
    Alert.alert(
      'Potwierdź zakończenie',
      'Czy spotkanie się odbyło? Środki zostaną przetrzymane przez 12h, gość może zgłosić spór.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Potwierdź',
          onPress: async () => {
            setProcessing(true);
            try {
              const functions = getFunctions(getApp());
              const confirmFunc = httpsCallable(functions, 'meet_confirm');
              
              const result = await confirmFunc({ bookingId });
              const data = result.data as { success: boolean; error?: string };
              
              if (data.success) {
                Alert.alert('Sukces', 'Spotkanie oznaczone jako zakończone. Środki zostaną przekazane za 12h.');
                loadBooking();
              } else {
                Alert.alert('Błąd', data.error || 'Nie udało się potwierdzić');
              }
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = async () => {
    const isHost = userRole === 'host';
    const refundMessage = isHost
      ? 'Gość otrzyma pełny zwrot środków.'
      : 'Nie otrzymasz zwrotu. 100% środków trafi do Avalo.';

    Alert.alert(
      'Anuluj spotkanie',
      `Czy na pewno chcesz anulować? ${refundMessage}`,
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: 'Anuluj spotkanie',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const functions = getFunctions(getApp());
              const cancelFunc = httpsCallable(functions, 'meet_cancel');
              
              const result = await cancelFunc({
                bookingId,
                reason: 'Anulowane przez użytkownika',
              });
              
              const data = result.data as { success: boolean; error?: string };
              
              if (data.success) {
                Alert.alert('Anulowano', 'Spotkanie zostało anulowane', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } else {
                Alert.alert('Błąd', data.error || 'Nie udało się anulować');
              }
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleDispute = async () => {
    Alert.prompt(
      'Zgłoś spór',
      'Opisz problem ze spotkaniem:',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zgłoś',
          onPress: async (reason) => {
            if (!reason || !reason.trim()) {
              Alert.alert('Błąd', 'Musisz podać powód sporu');
              return;
            }

            setProcessing(true);
            try {
              const functions = getFunctions(getApp());
              const disputeFunc = httpsCallable(functions, 'meet_dispute');
              
              const result = await disputeFunc({
                bookingId,
                reason: reason.trim(),
              });
              
              const data = result.data as { success: boolean; disputeId?: string; error?: string };
              
              if (data.success) {
                Alert.alert('Zgłoszono', 'Spór został zgłoszony. Moderator rozpatrzy sprawę.');
                loadBooking();
              } else {
                Alert.alert('Błąd', data.error || 'Nie udało się zgłosić sporu');
              }
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const getStatusColor = (status: MeetStatus): string => {
    switch (status) {
      case 'booked':
        return '#40E0D0';
      case 'waiting':
        return '#FFA500';
      case 'completed':
        return '#4CAF50';
      case 'cancelled':
        return '#FF6B6B';
      case 'dispute':
        return '#FF3B30';
      default:
        return '#A0A0A0';
    }
  };

  const getStatusText = (status: MeetStatus): string => {
    switch (status) {
      case 'booked':
        return 'Zarezerwowane';
      case 'waiting':
        return 'Oczekiwanie (12h)';
      case 'completed':
        return 'Zakończone';
      case 'cancelled':
        return 'Anulowane';
      case 'dispute':
        return 'Spór';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Nie znaleziono rezerwacji</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const scheduledDate = new Date(booking.scheduledDate._seconds * 1000);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Rezerwacja #{booking.bookingId.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
          <Text style={styles.statusText}>{getStatusText(booking.status)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Szczegóły</Text>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Typ:</Text>
          <Text style={styles.detailValue}>
            {booking.meetType === 'real_meet' ? 'Real Meet' : 'Social Meet'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Data:</Text>
          <Text style={styles.detailValue}>
            {scheduledDate.toLocaleDateString('pl-PL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {booking.location && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Lokalizacja:</Text>
            <Text style={styles.detailValue}>{booking.location}</Text>
          </View>
        )}

        {booking.notes && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Notatki:</Text>
            <Text style={styles.detailValue}>{booking.notes}</Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Rola:</Text>
          <Text style={styles.detailValue}>
            {userRole === 'host' ? 'Host' : 'Gość'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Płatność</Text>
        
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Cena całkowita:</Text>
          <Text style={styles.paymentValue}>{booking.price} 🪙</Text>
        </View>

        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Prowizja Avalo (20%):</Text>
          <Text style={styles.paymentValue}>{booking.avaloFee} 🪙</Text>
        </View>

        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Dla hosta (80%):</Text>
          <Text style={[styles.paymentValue, styles.escrowValue]}>
            {booking.escrowAmount} 🪙
          </Text>
        </View>
      </View>

      {booking.status === 'booked' && userRole === 'host' && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.confirmButton]}
            onPress={handleConfirmComplete}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.actionButtonText}>Potwierdź zakończenie</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
            disabled={processing}
          >
            <Text style={styles.cancelButtonText}>Anuluj spotkanie</Text>
          </TouchableOpacity>
        </View>
      )}

      {booking.status === 'booked' && userRole === 'guest' && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
            disabled={processing}
          >
            <Text style={styles.cancelButtonText}>Anuluj (brak zwrotu)</Text>
          </TouchableOpacity>
        </View>
      )}

      {booking.status === 'waiting' && userRole === 'guest' && (
        <View style={styles.actionSection}>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Masz 12 godzin na zgłoszenie sporu. Po tym czasie środki zostaną automatycznie przekazane hostowi.
            </Text>
          </View>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.disputeButton]}
            onPress={handleDispute}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>Zgłoś spór</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {booking.status === 'waiting' && userRole === 'host' && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ⏳ Oczekiwanie na automatyczne rozliczenie (12h). Gość może zgłosić spór w tym czasie.
          </Text>
        </View>
      )}

      {booking.status === 'completed' && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            ✅ Spotkanie zakończone. Środki zostały rozliczone.
          </Text>
        </View>
      )}

      {booking.status === 'cancelled' && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ❌ Spotkanie anulowane przez {booking.cancelledBy === 'host' ? 'hosta' : 'gościa'}.
          </Text>
        </View>
      )}

      {booking.status === 'dispute' && (
        <View style={styles.disputeBox}>
          <Text style={styles.disputeText}>
            ⚠️ Spór w trakcie rozpatrywania przez moderatora.
            {booking.disputeId && `\n\nID sporu: ${booking.disputeId.slice(0, 12)}...`}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  statusBadge: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 18,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  detailValue: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentLabel: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  escrowValue: {
    color: '#40E0D0',
  },
  actionSection: {
    padding: 20,
  },
  actionButton: {
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButton: {
    backgroundColor: '#40E0D0',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  disputeButton: {
    backgroundColor: '#FF6B6B',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  infoBox: {
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A2A2A',
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  infoText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  successBox: {
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A2A1A',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  successText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  warningBox: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2A2A1A',
    borderWidth: 1,
    borderColor: '#FFA500',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  disputeBox: {
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  disputeText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
});