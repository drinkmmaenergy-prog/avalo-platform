/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Safety Alerts List route
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafetyAlerts } from "@/hooks/useSafetyTimers";

export default function SafetyAlertsScreen() {
  const router = useRouter();
  const { alerts, loading, refreshAlerts } = useSafetyAlerts();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAlerts();
    setRefreshing(false);
  };

  const formatDate = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('pl-PL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Wstecz</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alerty Bezpieczeństwa</Text>
        <Text style={styles.headerSubtitle}>
          Powiadomienia od osób, których wspierasz
        </Text>
      </View>

      {alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>Brak alertów</Text>
          <Text style={styles.emptyText}>
            Nie masz żadnych aktywnych alertów bezpieczeństwa
          </Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          {alerts.map((alert) => (
            <TouchableOpacity
              key={alert.id}
              style={styles.alertCard}
              onPress={() => router.push(`/safety/alert/${alert.id}` as any)}
            >
              <View style={styles.alertHeader}>
                <Text style={styles.alertIcon}>
                  {alert.type === 'panic_button' ? '🚨' : '⏱️'}
                </Text>
                <View style={styles.alertInfo}>
                  <Text style={styles.alertUserName}>{alert.userName}</Text>
                  <Text style={styles.alertType}>
                    {alert.type === 'panic_button'
                      ? 'Przycisk Panic'
                      : 'Timer wygasł'}
                  </Text>
                </View>
              </View>

              {alert.note && (
                <Text style={styles.alertNote} numberOfLines={2}>
                  📝 {alert.note}
                </Text>
              )}

              <Text style={styles.alertTime}>{formatDate(alert.createdAt)}</Text>

              {alert.lastKnownLocation && (
                <View style={styles.locationBadge}>
                  <Text style={styles.locationBadgeText}>
                    📍 Lokalizacja dostępna
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  alertsList: {
    gap: 12,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  alertInfo: {
    flex: 1,
  },
  alertUserName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  alertType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  alertNote: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  alertTime: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  locationBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  locationBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
});
