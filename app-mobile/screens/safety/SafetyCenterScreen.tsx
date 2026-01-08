/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Safety Center Screen - Main hub for safety timers and panic button
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafetyTimers, useSafetyAlerts } from '../../hooks/useSafetyTimers';
import { PanicButton } from '../../components/safety/PanicButton';
import { SafetyTimerSummary } from '../../types/safetyTimer';

export default function SafetyCenterScreen() {
  const router = useRouter();
  const {
    activeTimer,
    archivedTimers,
    loading,
    error,
    checkIn,
    cancelTimer,
    refreshTimers,
    remainingSeconds,
  } = useSafetyTimers();

  const { alerts, refreshAlerts } = useSafetyAlerts();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshTimers(), refreshAlerts()]);
    setRefreshing(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'completed_ok':
        return '#6B7280';
      case 'expired_no_checkin':
        return '#EF4444';
      case 'cancelled':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'active':
        return 'Aktywny';
      case 'completed_ok':
        return 'Zakończony OK';
      case 'expired_no_checkin':
        return 'Wygasł - brak check-in';
      case 'cancelled':
        return 'Anulowany';
      default:
        return status;
    }
  };

  const handleCheckIn = async () => {
    if (!activeTimer) return;
    try {
      await checkIn(activeTimer.timerId);
    } catch (error) {
      console.error('Check-in failed:', error);
    }
  };

  const handleCancelTimer = async () => {
    if (!activeTimer) return;
    try {
      await cancelTimer(activeTimer.timerId);
    } catch (error) {
      console.error('Cancel failed:', error);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Centrum Bezpieczeństwa</Text>
        <Text style={styles.headerSubtitle}>
          Timery spotkań i przycisk panic
        </Text>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Alerts for Trusted Contacts */}
      {alerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>🚨 Alerty Bezpieczeństwa</Text>
          <TouchableOpacity
            style={styles.alertsBanner}
            onPress={() => router.push('/safety/alerts')}
          >
            <Text style={styles.alertsText}>
              Masz {alerts.length} aktywny{alerts.length === 1 ? '' : 'ch'} alert
              {alerts.length === 1 ? '' : 'ów'}
            </Text>
            <Text style={styles.alertsArrow}>→</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Timer */}
      {activeTimer && (
        <View style={styles.activeTimerCard}>
          <View style={styles.activeTimerHeader}>
            <Text style={styles.activeTimerTitle}>Timer Aktywny</Text>
            <View style={styles.activeTimerBadge}>
              <Text style={styles.activeTimerBadgeText}>
                {getStatusText(activeTimer.status)}
              </Text>
            </View>
          </View>

          <View style={styles.countdownContainer}>
            <Text style={styles.countdownLabel}>Pozostały czas</Text>
            <Text style={styles.countdownTime}>{formatTime(remainingSeconds)}</Text>
          </View>

          <View style={styles.timerInfo}>
            <Text style={styles.timerNote}>📝 {activeTimer.note}</Text>
            <Text style={styles.timerMeta}>
              Zaufani kontakty: {activeTimer.trustedContactsCount}
            </Text>
            <Text style={styles.timerMeta}>
              Wygasa: {formatDate(activeTimer.expiresAt)}
            </Text>
          </View>

          <View style={styles.activeTimerActions}>
            <TouchableOpacity
              style={styles.checkInButton}
              onPress={handleCheckIn}
              disabled={loading}
            >
              <Text style={styles.checkInButtonText}>✓ Jestem bezpieczny</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelTimer}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Anuluj timer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Create Timer Button */}
      {!activeTimer && (
        <TouchableOpacity
          style={styles.createTimerButton}
          onPress={() => router.push('/safety/create-timer')}
          disabled={loading}
        >
          <Text style={styles.createTimerIcon}>⏱️</Text>
          <Text style={styles.createTimerText}>Ustaw Timer Bezpieczeństwa</Text>
          <Text style={styles.createTimerSubtext}>
            Przed spotkaniem offline
          </Text>
        </TouchableOpacity>
      )}

      {/* Panic Button */}
      <View style={styles.panicSection}>
        <Text style={styles.sectionTitle}>Przycisk Panic</Text>
        <PanicButton variant="full" />
        <Text style={styles.panicInfo}>
          Użyj tylko w nagłych wypadkach. Twoi zaufani kontakty otrzymają natychmiast
          powiadomienie z Twoją ostatnią lokalizacją.
        </Text>
      </View>

      {/* Archived Timers */}
      {archivedTimers.length > 0 && (
        <View style={styles.archivedSection}>
          <Text style={styles.sectionTitle}>Ostatnie Timery</Text>
          {archivedTimers.map((timer) => (
            <ArchivedTimerCard key={timer.timerId} timer={timer} />
          ))}
        </View>
      )}

      {/* Educational Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Jak to działa?</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Timer Bezpieczeństwa</Text>
          <Text style={styles.infoCardText}>
            • Ustaw timer przed spotkaniem offline{'\n'}
            • Wybierz zaufane kontakty z Avalo{'\n'}
            • Otrzymasz powiadomienia przed wygaśnięciem{'\n'}
            • Potwierdź "OK" aby zamknąć timer{'\n'}
            • Jeśli nie potwierdzisz, zaufane kontakty zostaną powiadomione
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Czego NIE robimy</Text>
          <Text style={styles.infoCardText}>
            • NIE kontaktujemy się z policją{'\n'}
            • NIE wysyłamy SMS do numerów zewnętrznych{'\n'}
            • NIE dzwonimy na numery alarmowe{'\n'}
            • Wszystko pozostaje w aplikacji Avalo
          </Text>
        </View>

        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerText}>
            ⚠️ <Text style={styles.disclaimerBold}>Ważne:</Text> To narzędzie NIE zastępuje
            służb ratunkowych. W prawdziwej sytuacji zagrożenia zawsze dzwoń na numer
            alarmowy (112 w UE, 911 w USA).
          </Text>
        </View>
      </View>

      {/* Loading State */}
      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}
    </ScrollView>
  );
}

interface ArchivedTimerCardProps {
  timer: SafetyTimerSummary;
}

function ArchivedTimerCard({ timer }: ArchivedTimerCardProps) {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed_ok':
        return '#10B981';
      case 'expired_no_checkin':
        return '#EF4444';
      case 'cancelled':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'completed_ok':
        return 'OK';
      case 'expired_no_checkin':
        return 'Wygasł';
      case 'cancelled':
        return 'Anulowany';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.archivedCard}>
      <View style={styles.archivedCardHeader}>
        <Text style={styles.archivedCardNote} numberOfLines={1}>
          {timer.note}
        </Text>
        <View
          style={[
            styles.archivedStatusBadge,
            { backgroundColor: getStatusColor(timer.status) },
          ]}
        >
          <Text style={styles.archivedStatusText}>
            {getStatusText(timer.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.archivedCardDate}>
        {formatDate(timer.createdAt)} • {timer.durationMinutes} min
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
  },
  alertsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  alertsBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  alertsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  alertsArrow: {
    fontSize: 20,
    color: '#92400E',
    fontWeight: '700',
  },
  activeTimerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  activeTimerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeTimerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  activeTimerBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activeTimerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  countdownContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 16,
  },
  countdownLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  countdownTime: {
    fontSize: 48,
    fontWeight: '800',
    color: '#10B981',
    fontVariant: ['tabular-nums'],
  },
  timerInfo: {
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  timerNote: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 8,
    fontWeight: '500',
  },
  timerMeta: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  activeTimerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  checkInButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  createTimerButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  createTimerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  createTimerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  createTimerSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  panicSection: {
    marginBottom: 24,
  },
  panicInfo: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  archivedSection: {
    marginBottom: 24,
  },
  archivedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  archivedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  archivedCardNote: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  archivedStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  archivedStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  archivedCardDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  infoSection: {
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  disclaimerCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  disclaimerText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  disclaimerBold: {
    fontWeight: '700',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
