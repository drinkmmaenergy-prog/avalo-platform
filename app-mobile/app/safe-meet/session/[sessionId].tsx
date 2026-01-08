/**
 * Safe-Meet Session Screen
 * Phase 25: Session detail with QR code and SOS functionality
 * 
 * Note: Requires react-native-qrcode-svg and react-native-svg
 * Install with: npx expo install react-native-svg react-native-qrcode-svg
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getUserSessions,
  endSession,
  triggerSOS,
  SafeMeetSession,
  getStatusLabel,
  getStatusColor,
} from '../../../services/safeMeetService';

// QR Code component - will use react-native-qrcode-svg when installed
// For now, create a placeholder that can be replaced
const QRCodePlaceholder = ({ value, size }: { value: string; size: number }) => {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#DEE2E6',
      }}
    >
      <Text style={{ fontSize: 16, color: '#6C757D', textAlign: 'center', padding: 20 }}>
        Kod QR: {value}
      </Text>
      <Text style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
        (Wymaga react-native-qrcode-svg)
      </Text>
    </View>
  );
};

// Try to import QRCode, fall back to placeholder
let QRCode: any;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch {
  QRCode = QRCodePlaceholder;
}

export default function SessionDetail() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SafeMeetSession | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (sessionId) {
      loadSession();
      // Refresh every 10 seconds for status updates
      const interval = setInterval(loadSession, 10000);
      return () => clearInterval(interval);
    }
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const sessions = await getUserSessions(50);
      const found = sessions.find((s) => s.sessionId === sessionId);
      setSession(found || null);
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = () => {
    if (!session) return;

    Alert.alert(
      'Zakończ spotkanie',
      'Czy na pewno chcesz zakończyć to spotkanie?',
      [
        {
          text: 'Tak, zakończ',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              const result = await endSession(sessionId!);
              
              if (result.success) {
                Alert.alert(
                  'Zakończono',
                  'Spotkanie zostało bezpiecznie zakończone',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.back(),
                    },
                  ]
                );
              } else {
                Alert.alert('Błąd', result.error || 'Nie udało się zakończyć spotkania');
              }
            } catch (error) {
              Alert.alert('Błąd', 'Wystąpił problem podczas kończenia spotkania');
            } finally {
              setProcessing(false);
            }
          },
        },
        { text: 'Anuluj', style: 'cancel' },
      ]
    );
  };

  const handleTriggerSOS = () => {
    if (!session) return;

    Alert.alert(
      '⚠️ ALARM SOS',
      'UWAGA: To uruchomi alarm bezpieczeństwa i powiadomi Twój kontakt zaufany.\n\nCzy na pewno chcesz uruchomić SOS?',
      [
        {
          text: 'TAK, URUCHOM SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              const result = await triggerSOS(sessionId!, 'SOS_BUTTON');
              
              if (result.success) {
                // Show subtle confirmation (per requirements - no panic UI)
                Alert.alert(
                  'OK',
                  'Zamknięto spotkanie',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.back(),
                    },
                  ]
                );
              } else {
                Alert.alert('Błąd', result.error || 'Nie udało się uruchomić SOS');
              }
            } catch (error) {
              Alert.alert('Błąd', 'Wystąpił problem podczas uruchamiania SOS');
            } finally {
              setProcessing(false);
            }
          },
        },
        { text: 'Anuluj', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#DC3545" />
        <Text style={styles.errorTitle}>Nie znaleziono sesji</Text>
        <Text style={styles.errorText}>
          Ta sesja nie istnieje lub nie masz do niej dostępu
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Powrót</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canEnd = session.status === 'ACTIVE' || session.status === 'PENDING';
  const canSOS = session.status === 'ACTIVE' || session.status === 'PENDING';

  return (
    <ScrollView style={styles.container}>
      {/* Status Header */}
      <View style={styles.statusHeader}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(session.status) },
          ]}
        >
          <Text style={styles.statusText}>{getStatusLabel(session.status)}</Text>
        </View>
        <Text style={styles.sessionId}>ID: {session.sessionId.slice(-8)}</Text>
      </View>

      {/* QR Code Section (for host in PENDING status) */}
      {session.status === 'PENDING' && (
        <View style={styles.qrSection}>
          <Text style={styles.sectionTitle}>Kod QR do zeskanowania</Text>
          <Text style={styles.qrInstruction}>
            Pokaż ten kod drugiej osobie, aby potwierdzić spotkanie
          </Text>
          <View style={styles.qrContainer}>
            <QRCode
              value={session.sessionToken}
              size={240}
              backgroundColor="#FFFFFF"
            />
          </View>
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>Lub podaj kod:</Text>
            <Text style={styles.tokenValue}>{session.sessionToken}</Text>
          </View>
        </View>
      )}

      {/* Session Info */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Informacje o spotkaniu</Text>
        
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={20} color="#6C757D" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Utworzono</Text>
            <Text style={styles.infoValue}>
              {new Date(session.createdAt?.toMillis?.() || Date.now()).toLocaleString('pl-PL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {session.startedAt && (
          <View style={styles.infoRow}>
            <Ionicons name="play-circle-outline" size={20} color="#6C757D" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Rozpoczęto</Text>
              <Text style={styles.infoValue}>
                {new Date(session.startedAt?.toMillis?.() || Date.now()).toLocaleString('pl-PL', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}

        {session.endedAt && (
          <View style={styles.infoRow}>
            <Ionicons name="stop-circle-outline" size={20} color="#6C757D" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Zakończono</Text>
              <Text style={styles.infoValue}>
                {new Date(session.endedAt?.toMillis?.() || Date.now()).toLocaleString('pl-PL', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}

        {session.approxLocation && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#6C757D" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Lokalizacja</Text>
              <Text style={styles.infoValue}>
                {session.approxLocation.city}, {session.approxLocation.country}
              </Text>
            </View>
          </View>
        )}

        {session.meetingNote && (
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={20} color="#6C757D" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Notatka</Text>
              <Text style={styles.infoValue}>{session.meetingNote}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {(canEnd || canSOS) && (
        <View style={styles.actionsSection}>
          {canEnd && (
            <TouchableOpacity
              style={[styles.actionButton, styles.endButton]}
              onPress={handleEndSession}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                  <Text style={styles.actionButtonText}>Zakończ spotkanie</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canSOS && (
            <TouchableOpacity
              style={[styles.actionButton, styles.sosButton]}
              onPress={handleTriggerSOS}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="warning" size={24} color="#FFF" />
                  <Text style={styles.actionButtonText}>SOS - ALARM</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Safety Info */}
      <View style={styles.safetyInfo}>
        <Ionicons name="shield-checkmark" size={24} color="#28A745" />
        <Text style={styles.safetyText}>
          To spotkanie jest zabezpieczone przez Safe-Meet. W razie zagrożenia
          użyj przycisku SOS, aby powiadomić swój kontakt zaufany.
        </Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#6C757D',
    marginTop: 8,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusHeader: {
    backgroundColor: '#FFF',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionId: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 8,
  },
  qrSection: {
    backgroundColor: '#FFF',
    padding: 24,
    marginTop: 12,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  qrInstruction: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    marginBottom: 24,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    marginBottom: 20,
  },
  tokenBox: {
    backgroundColor: '#E7F3FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  tokenLabel: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  tokenValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 2,
  },
  infoSection: {
    backgroundColor: '#FFF',
    padding: 20,
    marginTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#212529',
  },
  actionsSection: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  endButton: {
    backgroundColor: '#28A745',
  },
  sosButton: {
    backgroundColor: '#DC3545',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  safetyInfo: {
    flexDirection: 'row',
    backgroundColor: '#D1F2EB',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12,
  },
  safetyText: {
    flex: 1,
    fontSize: 14,
    color: '#155724',
    lineHeight: 20,
  },
  spacer: {
    height: 32,
  },
});