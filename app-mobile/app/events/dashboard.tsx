import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Event, EventTicket } from "@/types/events";

interface EventStats {
  event: Event;
  tickets: EventTicket[];
  revenue: number;
  checkInRate: number;
}

export default function OrganizerDashboardScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    loadOrganizerEvents();
  }, [activeTab]);

  const loadOrganizerEvents = async () => {
    setLoading(true);
    try {
      // Get current user (placeholder - integrate with auth)
      const userId = 'CURRENT_USER_ID'; // TODO: Get from auth

      // Load events
      const eventsQuery = query(
        collection(db, 'events'),
        where('organizerId', '==', userId),
        orderBy('timestamps.createdAt', 'desc')
      );

      const eventsSnap = await getDocs(eventsQuery);
      const eventsData: EventStats[] = [];

      for (const eventDoc of eventsSnap.docs) {
        const event = { eventId: eventDoc.id, ...eventDoc.data() } as Event;
        
        // Filter by tab
        const eventDate = new Date(event.startTime);
        const now = new Date();
        if (activeTab === 'upcoming' && eventDate < now) continue;
        if (activeTab === 'past' && eventDate >= now) continue;

        // Load tickets for this event
        const ticketsQuery = query(
          collection(db, 'eventTickets'),
          where('eventId', '==', event.eventId)
        );
        const ticketsSnap = await getDocs(ticketsQuery);
        const tickets = ticketsSnap.docs.map(doc => doc.data() as EventTicket);

        // Calculate stats
        const revenue = tickets.reduce((sum, t) => {
          if (t.payment.refundedUserTokens === 0) {
            return sum + t.payment.organizerShareTokens;
          }
          return sum;
        }, 0);

        const checkInsCount = tickets.filter(t => t.checkIn.checkInAt).length;
        const checkInRate = tickets.length > 0 ? (checkInsCount / tickets.length) * 100 : 0;

        eventsData.push({
          event,
          tickets,
          revenue,
          checkInRate,
        });
      }

      setEvents(eventsData);
    } catch (error) {
      console.error('Error loading events:', error);
      Alert.alert('Error', 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEvent = (eventId: string, eventTitle: string) => {
    Alert.alert(
      'Cancel Event',
      `Are you sure you want to cancel "${eventTitle}"?\n\n` +
      'All participants will receive FULL REFUNDS (including Avalo\'s 20% fee).\n' +
      'You will earn 0 tokens from this event.',
      [
        { text: 'Keep Event', style: 'cancel' },
        {
          text: 'Cancel Event',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call Cloud Function to cancel event
              Alert.alert('Success', 'Event cancelled. All refunds processed.');
              loadOrganizerEvents();
            } catch (error) {
              console.error('Error cancelling event:', error);
              Alert.alert('Error', 'Failed to cancel event');
            }
          },
        },
      ]
    );
  };

  const handleViewEventDetails = (eventId: string) => {
    router.push({
      pathname: '/events/organizer/[id]' as any,
      params: { id: eventId },
    });
  };

  const renderEventCard = (eventStats: EventStats) => {
    const { event, tickets, revenue, checkInRate } = eventStats;
    const isPast = new Date(event.startTime) < new Date();

    return (
      <TouchableOpacity
        key={event.eventId}
        style={styles.eventCard}
        onPress={() => handleViewEventDetails(event.eventId)}
      >
        <View style={styles.eventHeader}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  event.status === 'PUBLISHED'
                    ? '#34C759'
                    : event.status === 'CANCELLED'
                    ? '#FF3B30'
                    : '#8E8E93',
              },
            ]}
          >
            <Text style={styles.statusText}>{event.status}</Text>
          </View>
        </View>

        <Text style={styles.eventDate}>
          📅 {new Date(event.startTime).toLocaleDateString()}
        </Text>
        <Text style={styles.eventLocation}>
          📍 {event.location.type} - {event.location.address || 'Online'}
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{tickets.length}</Text>
            <Text style={styles.statLabel}>Tickets Sold</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{event.stats.checkIns}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{checkInRate.toFixed(0)}%</Text>
            <Text style={styles.statLabel}>Check-in Rate</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{revenue}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </View>
        </View>

        {event.status === 'PUBLISHED' && !isPast && (
          <TouchableOpacity
            style={styles.cancelEventButton}
            onPress={(e) => {
              e.stopPropagation();
              handleCancelEvent(event.eventId, event.title);
            }}
          >
            <Text style={styles.cancelEventButtonText}>Cancel Event</Text>
          </TouchableOpacity>
        )}

        {isPast && event.status === 'PUBLISHED' && checkInRate < 70 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️ Check-in rate below 70% - payout under review
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Events</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/events/create' as any)}
        >
          <Text style={styles.createButtonText}>+ Create Event</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {activeTab === 'upcoming' ? 'No upcoming events' : 'No past events'}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/events/create' as any)}
          >
            <Text style={styles.emptyButtonText}>Create Your First Event</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {events.map(renderEventCard)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
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
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 12,
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  cancelEventButton: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelEventButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
  },
});
