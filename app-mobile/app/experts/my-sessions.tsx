/**
 * PACK 136: My Sessions Screen
 * View booked mentorship sessions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from "@/lib/firebase";
import {
  MentorSession,
  SessionStatus,
  getUserSessions,
  cancelMentorshipSession,
  formatSessionStatus,
  getSessionStatusColor,
} from "@/services/expertMarketplaceService";

export default function MySessionsScreen() {
  const [sessions, setSessions] = useState<MentorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

  useEffect(() => {
    loadSessions();
  }, [filter]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      let allSessions = await getUserSessions(userId);

      // Filter based on selection
      if (filter === 'upcoming') {
        allSessions = allSessions.filter((s) =>
          [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(s.status)
        );
      } else if (filter === 'completed') {
        allSessions = allSessions.filter((s) => s.status === SessionStatus.COMPLETED);
      }

      setSessions(allSessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSession = (session: MentorSession) => {
    Alert.alert(
      'Cancel Session',
      'Are you sure you want to cancel this session?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelMentorshipSession(session.sessionId);
              Alert.alert('Success', 'Session cancelled successfully');
              loadSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel session');
            }
          },
        },
      ]
    );
  };

  const renderSession = ({ item }: { item: MentorSession }) => {
    const canCancel = item.status === SessionStatus.SCHEDULED;
    const statusColor = getSessionStatusColor(item.status);

    return (
      <View style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionTitle}>{item.offerTitle}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{formatSessionStatus(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.expertName}>with {item.expertName}</Text>

        <View style={styles.sessionDetails}>
          <Text style={styles.detailText}>
            📅 {new Date(item.scheduledTime.toMillis()).toLocaleDateString()}
          </Text>
          <Text style={styles.detailText}>
            🕐 {new Date(item.scheduledTime.toMillis()).toLocaleTimeString()}
          </Text>
          <Text style={styles.detailText}>⏱️ {item.duration} minutes</Text>
        </View>

        <View style={styles.sessionFooter}>
          <Text style={styles.priceText}>{item.tokensAmount} 🪙</Text>
          {canCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancelSession(item)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Sessions</Text>
      </View>

      <View style={styles.filterContainer}>
        {['all', 'upcoming', 'completed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f as any)}
          >
            <Text
              style={[styles.filterText, filter === f && styles.filterTextActive]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No sessions found</Text>
          <Text style={styles.emptySubtext}>
            Browse the expert marketplace to book your first session
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderSession}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  sessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  expertName: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  sessionDetails: {
    marginBottom: 12,
  },
  detailText: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 4,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
});
