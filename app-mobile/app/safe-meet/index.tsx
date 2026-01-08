/**
 * Safe-Meet Hub Screen
 * Phase 25: Main screen for Safe-Meet functionality
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTrustedContact,
  getUserSessions,
  createSession,
  TrustedContact,
  SafeMeetSession,
  getStatusLabel,
  getStatusColor,
} from "@/services/safeMeetService";

export default function SafeMeetHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [trustedContact, setTrustedContact] = useState<TrustedContact | null>(null);
  const [sessions, setSessions] = useState<SafeMeetSession[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [contact, userSessions] = await Promise.all([
        getTrustedContact(),
        getUserSessions(10),
      ]);
      setTrustedContact(contact);
      setSessions(userSessions);
    } catch (error) {
      console.error('Error loading Safe-Meet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!trustedContact) {
      Alert.alert(
        'Brak kontaktu zaufanego',
        'Najpierw ustaw kontakt zaufany, aby móc korzystać z Safe-Meet.',
        [
          {
            text: 'Ustaw teraz',
            onPress: () => router.push('/safe-meet/trusted-contact' as any),
          },
          { text: 'Anuluj', style: 'cancel' },
        ]
      );
      return;
    }

    Alert.alert(
      'Rozpocznij Safe-Meet',
      'Utworzysz kod QR, który druga osoba zeskanuje, aby potwierdzić spotkanie.',
      [
        {
          text: 'Rozpocznij',
          onPress: async () => {
            try {
              setCreatingSession(true);
              const result = await createSession({});
              
              if (result.success && result.session) {
                router.push(`/safe-meet/session/${result.session.sessionId}` as any);
              } else {
                Alert.alert('Błąd', result.error || 'Nie udało się utworzyć sesji');
              }
            } catch (error) {
              Alert.alert('Błąd', 'Wystąpił problem podczas tworzenia sesji');
            } finally {
              setCreatingSession(false);
            }
          },
        },
        { text: 'Anuluj', style: 'cancel' },
      ]
    );
  };

  const handleScanQR = () => {
    if (!trustedContact) {
      Alert.alert(
        'Brak kontaktu zaufanego',
        'Najpierw ustaw kontakt zaufany, aby móc korzystać z Safe-Meet.',
        [
          {
            text: 'Ustaw teraz',
            onPress: () => router.push('/safe-meet/trusted-contact' as any),
          },
          { text: 'Anuluj', style: 'cancel' },
        ]
      );
      return;
    }

    router.push('/safe-meet/scan' as any);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={48} color="#007AFF" />
        <Text style={styles.title}>Safe-Meet</Text>
        <Text style={styles.subtitle}>
          Bezpieczne spotkania z potwierdzeniem QR
        </Text>
      </View>

      {/* Trusted Contact Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kontakt zaufany</Text>
        {trustedContact ? (
          <View style={styles.contactCard}>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{trustedContact.name}</Text>
              <Text style={styles.contactDetail}>{trustedContact.email}</Text>
              <Text style={styles.contactDetail}>{trustedContact.phone}</Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push('/safe-meet/trusted-contact' as any)}
            >
              <Ionicons name="pencil" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.setContactButton}
            onPress={() => router.push('/safe-meet/trusted-contact' as any)}
          >
            <Ionicons name="person-add" size={24} color="#FFF" />
            <Text style={styles.setContactText}>Ustaw kontakt zaufany</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.infoText}>
          {trustedContact
            ? 'Twój kontakt zaufany zostanie powiadomiony w przypadku SOS'
            : 'Ustaw osobę, która zostanie powiadomiona w sytuacji zagrożenia'}
        </Text>
      </View>

      {/* Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bezpieczne spotkanie</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryAction]}
            onPress={handleCreateSession}
            disabled={creatingSession}
          >
            {creatingSession ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="qr-code" size={32} color="#FFF" />
                <Text style={styles.actionButtonText}>Rozpocznij spotkanie</Text>
                <Text style={styles.actionButtonSubtext}>Pokaż kod QR</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={handleScanQR}
          >
            <Ionicons name="scan" size={32} color="#007AFF" />
            <Text style={[styles.actionButtonText, styles.secondaryText]}>
              Skanuj kod
            </Text>
            <Text style={[styles.actionButtonSubtext, styles.secondaryText]}>
              Dołącz do spotkania
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Sessions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ostatnie spotkania</Text>
        {sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>Brak spotkań</Text>
          </View>
        ) : (
          sessions.slice(0, 5).map((session) => (
            <TouchableOpacity
              key={session.sessionId}
              style={styles.sessionCard}
              onPress={() => router.push(`/safe-meet/session/${session.sessionId}` as any)}
            >
              <View style={styles.sessionInfo}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(session.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusLabel(session.status)}
                  </Text>
                </View>
                <Text style={styles.sessionDate}>
                  {new Date(session.createdAt?.toMillis?.() || Date.now()).toLocaleDateString('pl-PL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {session.meetingNote && (
                  <Text style={styles.sessionNote} numberOfLines={1}>
                    {session.meetingNote}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Ionicons name="information-circle" size={24} color="#007AFF" />
        <Text style={styles.infoTitle}>Co to jest Safe-Meet?</Text>
        <Text style={styles.infoDescription}>
          Safe-Meet to funkcja bezpieczeństwa do spotkań na żywo. Przed spotkaniem
          stwórz sesję i poproś drugą osobę o zeskanowanie kodu QR. W razie
          zagrożenia możesz użyć przycisku SOS, aby powiadomić swój kontakt zaufany.
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
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFF',
    padding: 20,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  contactDetail: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 2,
  },
  editButton: {
    padding: 8,
  },
  setContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  setContactText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 12,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 12,
    minHeight: 120,
  },
  primaryAction: {
    backgroundColor: '#007AFF',
  },
  secondaryAction: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 8,
    textAlign: 'center',
  },
  actionButtonSubtext: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 4,
    opacity: 0.8,
    textAlign: 'center',
  },
  secondaryText: {
    color: '#007AFF',
  },
  sessionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  sessionInfo: {
    flex: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionDate: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  sessionNote: {
    fontSize: 13,
    color: '#6C757D',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  infoSection: {
    backgroundColor: '#E7F3FF',
    padding: 20,
    marginTop: 12,
    borderRadius: 12,
    margin: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  spacer: {
    height: 32,
  },
});
