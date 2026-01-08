import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

type MeetStatus = 'booked' | 'waiting' | 'completed' | 'cancelled' | 'dispute';

interface Meeting {
  bookingId: string;
  meetType: 'real_meet' | 'social_meet';
  hostId: string;
  guestId: string;
  price: number;
  status: MeetStatus;
  scheduledDate: { _seconds: number };
  createdAt: { _seconds: number };
}

export default function MeetingsHistory() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'host' | 'guest'>('guest');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, [activeTab]);

  const loadMeetings = async () => {
    try {
      const auth = getAuth(getApp());
      if (!auth.currentUser) return;

      const functions = getFunctions(getApp());
      const getUserMeetingsFunc = httpsCallable(functions, 'meet_getUserMeetings');
      
      const result = await getUserMeetingsFunc({
        role: activeTab,
        limit: 50,
      });

      const data = result.data as { success: boolean; meetings?: Meeting[] };
      
      if (data.success && data.meetings) {
        setMeetings(data.meetings);
      }
    } catch (error) {
      console.error('Error loading meetings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMeetings();
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
        return 'Oczekiwanie';
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

  const renderMeeting = ({ item }: { item: Meeting }) => {
    const scheduledDate = new Date(item.scheduledDate._seconds * 1000);
    
    return (
      <TouchableOpacity
        style={styles.meetingCard}
        onPress={() => router.push(`/meet/booking/${item.bookingId}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.meetingHeader}>
          <View style={styles.typeContainer}>
            <Text style={styles.typeText}>
              {item.meetType === 'real_meet' ? '📍 Real Meet' : '💬 Social Meet'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          {scheduledDate.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>

        <View style={styles.meetingFooter}>
          <Text style={styles.priceText}>{item.price} 🪙</Text>
          <Text style={styles.idText}>#{item.bookingId.slice(0, 8)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>Ładowanie spotkań...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Moje Spotkania</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'guest' && styles.tabActive]}
          onPress={() => setActiveTab('guest')}
        >
          <Text style={[styles.tabText, activeTab === 'guest' && styles.tabTextActive]}>
            Jako gość
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'host' && styles.tabActive]}
          onPress={() => setActiveTab('host')}
        >
          <Text style={[styles.tabText, activeTab === 'host' && styles.tabTextActive]}>
            Jako host
          </Text>
        </TouchableOpacity>
      </View>

      {meetings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {activeTab === 'host'
              ? 'Nie masz jeszcze żadnych spotkań jako host'
              : 'Nie zarezerwowałeś jeszcze żadnych spotkań'}
          </Text>
          {activeTab === 'host' && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/meet/create' as any)}
            >
              <Text style={styles.createButtonText}>Utwórz profil hosta</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'guest' && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/meet' as any)}
            >
              <Text style={styles.createButtonText}>Przeglądaj hostów</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={meetings}
          renderItem={renderMeeting}
          keyExtractor={(item) => item.bookingId}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#40E0D0"
            />
          }
        />
      )}

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {meetings.filter((m) => m.status === 'completed').length}
          </Text>
          <Text style={styles.statLabel}>Zakończone</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {meetings.filter((m) => m.status === 'booked').length}
          </Text>
          <Text style={styles.statLabel}>Nadchodzące</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {meetings.reduce((sum, m) => sum + (m.status === 'completed' ? m.price : 0), 0)}
          </Text>
          <Text style={styles.statLabel}>
            {activeTab === 'host' ? 'Zarobione' : 'Wydane'} 🪙
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1A1A1A',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#40E0D0',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  tabTextActive: {
    color: '#0A0A0A',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  meetingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeContainer: {
    flex: 1,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: 14,
    color: '#A0A0A0',
    marginBottom: 12,
  },
  meetingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  idText: {
    fontSize: 12,
    color: '#666666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#A0A0A0',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 12,
  },
});
