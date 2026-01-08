/**
 * PACK 218: Unified Schedule View (Mobile)
 * Combines meetings + events into single schedule interface
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
interface ScheduleItem {
  id: string;
  type: 'meeting' | 'event';
  role: 'host' | 'guest' | 'attendee';
  title: string;
  startTime: { seconds: number };
  endTime: { seconds: number };
  location: {
    name: string;
    address?: string;
  };
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  safetyModeEnabled: boolean;
  hasPanicButton: boolean;
  paymentStatus: string;
  tokensAmount: number;
  sourceId: string;
  sourceCollection: string;
}

// Helper functions to replace date-fns
const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const isTomorrow = (date: Date): boolean => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
};

const isPast = (date: Date): boolean => {
  return date < new Date();
};

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function MyScheduleScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('upcoming');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  }, [filter]);

  const loadSchedule = async () => {
    try {
      const functions = getFunctions();
      const getMySchedule = httpsCallable(functions, 'getMySchedule');
      
      const result = await getMySchedule({
        status: filter === 'all' ? undefined : filter,
        limit: 50,
      });
      
      const data = result.data as any;
      
      if (data.success) {
        setItems(data.items || []);
        setError(null);
      } else {
        setError('Failed to load schedule');
      }
    } catch (err: any) {
      console.error('Error loading schedule:', err);
      setError(err.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSchedule();
  };

  const getTimeLabel = (item: ScheduleItem) => {
    const date = new Date(item.startTime.seconds * 1000);
    
    if (isToday(date)) {
      return `Today, ${formatTime(date)}`;
    } else if (isTomorrow(date)) {
      return `Tomorrow, ${formatTime(date)}`;
    } else {
      return `${formatDate(date)}, ${formatTime(date)}`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming':
        return '#3B82F6';
      case 'active':
        return '#10B981';
      case 'completed':
        return '#6B7280';
      case 'cancelled':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'meeting' ? 'people' : 'calendar';
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'host':
        return 'Hosting';
      case 'guest':
        return 'Attending';
      case 'attendee':
        return 'Attended';
      default:
        return '';
    }
  };

  const handleItemPress = (item: ScheduleItem) => {
    if (item.type === 'meeting') {
      router.push(`/meet` as any);
    } else {
      router.push(`/events` as any);
    }
  };

  const renderScheduleItem = (item: ScheduleItem) => {
    const statusColor = getStatusColor(item.status);
    const isPastItem = isPast(new Date(item.startTime.seconds * 1000));

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemCard, isPastItem && styles.pastItem]}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTypeRow}>
            <Ionicons
              name={getTypeIcon(item.type) as any}
              size={20}
              color={statusColor}
            />
            <Text style={[styles.itemType, { color: statusColor }]}>
              {item.type === 'meeting' ? 'Meeting' : 'Event'} • {getRoleText(item.role)}
            </Text>
          </View>
          
          <View style={styles.statusBadge}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <Text style={styles.itemTitle}>{item.title}</Text>

        <View style={styles.itemDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{getTimeLabel(item)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.location.name}</Text>
          </View>

          {item.tokensAmount > 0 && (
            <View style={styles.detailRow}>
              <Ionicons name="diamond-outline" size={16} color="#F59E0B" />
              <Text style={styles.detailText}>{item.tokensAmount} tokens</Text>
            </View>
          )}
        </View>

        <View style={styles.itemFooter}>
          {item.safetyModeEnabled && (
            <View style={styles.safetyBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" />
              <Text style={styles.safetyText}>Safety Mode ON</Text>
            </View>
          )}

          {item.hasPanicButton && item.status === 'active' && (
            <TouchableOpacity style={styles.panicButton}>
              <Ionicons name="warning" size={14} color="#FFF" />
              <Text style={styles.panicText}>Panic Button</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading your schedule...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/notifications' as any)}
        >
          <Ionicons name="notifications-outline" size={24} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'upcoming' && styles.activeTab]}
          onPress={() => setFilter('upcoming')}
        >
          <Text style={[styles.filterText, filter === 'upcoming' && styles.activeFilterText]}>
            Upcoming
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filter === 'completed' && styles.activeTab]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.activeFilterText]}>
            Past
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.activeTab]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
            All
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Schedule List */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No scheduled items</Text>
            <Text style={styles.emptyText}>
              {filter === 'upcoming'
                ? 'You have no upcoming meetings or events'
                : 'No items found for this filter'}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {items.map(renderScheduleItem)}
          </View>
        )}
      </ScrollView>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/events' as any)}
        >
          <Ionicons name="search" size={20} color="#FFF" />
          <Text style={styles.actionText}>Discover Events</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => router.push('/meet' as any)}
        >
          <Ionicons name="people" size={20} color="#3B82F6" />
          <Text style={[styles.actionText, styles.secondaryActionText]}>
            Book Meeting
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerButton: {
    padding: 8,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeFilterText: {
    color: '#FFF',
  },
  errorContainer: {
    margin: 16,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  itemCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pastItem: {
    opacity: 0.6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemType: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  itemDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#D1FAE5',
  },
  safetyText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  panicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  panicText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  quickActions: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#EFF6FF',
  },
  actionText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryActionText: {
    color: '#3B82F6',
  },
});
