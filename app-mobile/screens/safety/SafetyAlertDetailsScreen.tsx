/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Safety Alert Details Screen - For trusted contacts to view alerts
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Circle } from 'react-native-maps';
import { SafetyAlertDetails } from '../../types/safetyTimer';

export default function SafetyAlertDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ alertId: string }>();

  // In production, fetch alert details from backend using alertId
  const [alert] = React.useState<SafetyAlertDetails | null>(null);
  const [loading] = React.useState(false);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Ładowanie szczegółów alertu...</Text>
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Nie znaleziono alertu</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Powrót</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString('pl-PL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openInMaps = () => {
    if (!alert.lastKnownLocation) return;

    const { latitude, longitude } = alert.lastKnownLocation;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const callEmergency = () => {
    Alert.alert(
      'Zadzwoń na numer alarmowy?',
      'To otworzy aplikację telefonu. Wybierz odpowiedni numer dla swojego regionu (112 w UE, 911 w USA).',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Kontynuuj',
          onPress: () => {
            // Open phone dialer (user must manually dial)
            Linking.openURL('tel:');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => router.back()}
        >
          <Text style={styles.headerBackText}>← Wstecz</Text>
        </TouchableOpacity>
        
        <View style={styles.alertTypeBadge}>
          <Text style={styles.alertTypeBadgeText}>
            {alert.type === 'panic_button' ? '🚨 Przycisk Panic' : '⏱️ Timer wygasł'}
          </Text>
        </View>
      </View>

      {/* User Info */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          {alert.userProfilePicture ? (
            <Text>User Photo</Text>
          ) : (
            <Text style={styles.userAvatarText}>👤</Text>
          )}
        </View>
        
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{alert.userName}</Text>
          <Text style={styles.alertTime}>{formatDate(alert.createdAt)}</Text>
        </View>
      </View>

      {/* Alert Message */}
      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>
          {alert.type === 'panic_button'
            ? 'Użytkownik uruchomił przycisk bezpieczeństwa'
            : 'Użytkownik nie potwierdził bezpieczeństwa po spotkaniu'}
        </Text>
        
        {alert.note && (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Notatka ze spotkania:</Text>
            <Text style={styles.noteText}>"{alert.note}"</Text>
          </View>
        )}
      </View>

      {/* Location Map */}
      {alert.lastKnownLocation && (
        <View style={styles.mapSection}>
          <Text style={styles.mapTitle}>Ostatnia znana lokalizacja</Text>
          
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: alert.lastKnownLocation.latitude,
                longitude: alert.lastKnownLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: alert.lastKnownLocation.latitude,
                  longitude: alert.lastKnownLocation.longitude,
                }}
                title={alert.userName}
                description="Ostatnia znana lokalizacja"
              />
              
              {alert.lastKnownLocation.accuracy && (
                <Circle
                  center={{
                    latitude: alert.lastKnownLocation.latitude,
                    longitude: alert.lastKnownLocation.longitude,
                  }}
                  radius={alert.lastKnownLocation.accuracy}
                  fillColor="rgba(59, 130, 246, 0.2)"
                  strokeColor="rgba(59, 130, 246, 0.5)"
                  strokeWidth={2}
                />
              )}
            </MapView>
          </View>

          <View style={styles.locationDetails}>
            <Text style={styles.locationLabel}>Współrzędne:</Text>
            <Text style={styles.locationCoords}>
              {alert.lastKnownLocation.latitude.toFixed(6)}, {alert.lastKnownLocation.longitude.toFixed(6)}
            </Text>
            
            {alert.lastKnownLocation.accuracy && (
              <Text style={styles.locationAccuracy}>
                Dokładność: ±{Math.round(alert.lastKnownLocation.accuracy)}m
              </Text>
            )}
            
            <Text style={styles.locationTime}>
              Timestamp: {formatDate(alert.lastKnownLocation.timestamp)}
            </Text>
          </View>

          <TouchableOpacity style={styles.openMapsButton} onPress={openInMaps}>
            <Text style={styles.openMapsButtonText}>
              📍 Otwórz w Mapach Google
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!alert.lastKnownLocation && (
        <View style={styles.noLocationCard}>
          <Text style={styles.noLocationText}>
            Brak danych o lokalizacji dla tego alertu
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <Text style={styles.actionsTitle}>Co należy zrobić?</Text>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            // In production, open chat with the user
            Alert.alert('Funkcja niedostępna', 'Czat zostanie otwarty w pełnej wersji aplikacji');
          }}
        >
          <Text style={styles.actionButtonIcon}>💬</Text>
          <View style={styles.actionButtonText}>
            <Text style={styles.actionButtonTitle}>Napisz do użytkownika</Text>
            <Text style={styles.actionButtonSubtitle}>Sprawdź czy wszystko OK</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={callEmergency}
        >
          <Text style={styles.actionButtonIcon}>📞</Text>
          <View style={styles.actionButtonText}>
            <Text style={styles.actionButtonTitle}>Zadzwoń na numer alarmowy</Text>
            <Text style={styles.actionButtonSubtitle}>W przypadku prawdziwego zagrożenia</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Important Notice */}
      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerTitle}>⚠️ Ważne informacje</Text>
        <Text style={styles.disclaimerText}>
          • To powiadomienie jest wewnątrz aplikacji Avalo{'\n'}
          • Avalo NIE kontaktuje się automatycznie z policją{'\n'}
          • Jeśli podejrzewasz prawdziwe zagrożenie, dzwoń na 112 (UE) lub 911 (USA){'\n'}
          • Lokalizacja może nie być dokładna (±{alert.lastKnownLocation?.accuracy || 50}m)
        </Text>
      </View>
    </ScrollView>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    marginBottom: 20,
  },
  headerBackButton: {
    marginBottom: 12,
  },
  headerBackText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  alertTypeBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  alertTypeBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userAvatarText: {
    fontSize: 32,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 14,
    color: '#6B7280',
  },
  messageCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 12,
    lineHeight: 22,
  },
  noteContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 15,
    color: '#111827',
    fontStyle: 'italic',
  },
  mapSection: {
    marginBottom: 16,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  mapContainer: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  map: {
    flex: 1,
  },
  locationDetails: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  locationAccuracy: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  locationTime: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  openMapsButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openMapsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  noLocationCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  noLocationText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  actionsSection: {
    marginBottom: 16,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  actionButtonText: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  actionButtonSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  disclaimerCard: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
});
