import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface CalendarItem {
  id: string;
  date: Date;
  type: string;
  category: string;
  title: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  preparationTime: number;
}

interface ContentPlan {
  id: string;
  contentCalendar: CalendarItem[];
  period: {
    start: Date;
    end: Date;
    type: string;
  };
  formatMix: {
    shortForm: number;
    longForm: number;
    livestreams: number;
    stories: number;
  };
}

export default function CalendarView() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'planned' | 'in_progress' | 'completed'>('all');
  const user = auth.currentUser;

  useEffect(() => {
    loadCalendar();
  }, []);

  const loadCalendar = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const getCalendar = httpsCallable(functions, 'getContentCalendar');
      const result = await getCalendar({ planId: user.uid });
      
      if (result.data && (result.data as any).success) {
        const planData = (result.data as any).plan;
        planData.contentCalendar = planData.contentCalendar.map((item: any) => ({
          ...item,
          date: new Date(item.date),
        }));
        setPlan(planData);
      }
    } catch (error: any) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCalendar();
    setRefreshing(false);
  };

  const updateItemStatus = async (itemId: string, status: string) => {
    if (!plan || !user) return;

    try {
      const updateStatus = httpsCallable(functions, 'updateCalendarItemStatus');
      await updateStatus({
        planId: plan.id,
        itemId,
        status,
      });

      const updatedCalendar = plan.contentCalendar.map(item =>
        item.id === itemId ? { ...item, status: status as any } : item
      );
      setPlan({ ...plan, contentCalendar: updatedCalendar });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getFilteredItems = () => {
    if (!plan) return [];
    if (selectedFilter === 'all') return plan.contentCalendar;
    return plan.contentCalendar.filter(item => item.status === selectedFilter);
  };

  const getStatusStats = () => {
    if (!plan) return { planned: 0, inProgress: 0, completed: 0 };
    return plan.contentCalendar.reduce((acc, item) => {
      if (item.status === 'planned') acc.planned++;
      if (item.status === 'in_progress') acc.inProgress++;
      if (item.status === 'completed') acc.completed++;
      return acc;
    }, { planned: 0, inProgress: 0, completed: 0 });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your calendar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Calendar Yet</Text>
          <Text style={styles.emptyText}>
            Create your first content calendar to start planning
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/brand-strategy/create-calendar' as any)}
          >
            <Text style={styles.primaryButtonText}>Create Calendar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const stats = getStatusStats();
  const filteredItems = getFilteredItems();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Content Calendar</Text>
        <TouchableOpacity onPress={() => router.push('/brand-strategy/create-calendar' as any)}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.statsCard}>
          <StatItem label="Planned" value={stats.planned} color="#F59E0B" />
          <StatItem label="In Progress" value={stats.inProgress} color="#007AFF" />
          <StatItem label="Completed" value={stats.completed} color="#10B981" />
        </View>

        {plan.formatMix && (
          <View style={styles.mixCard}>
            <Text style={styles.mixTitle}>Content Mix</Text>
            <View style={styles.mixBars}>
              <MixBar label="Short Form" value={plan.formatMix.shortForm} color="#8B5CF6" />
              <MixBar label="Long Form" value={plan.formatMix.longForm} color="#EC4899" />
              <MixBar label="Livestreams" value={plan.formatMix.livestreams} color="#F59E0B" />
              <MixBar label="Stories" value={plan.formatMix.stories} color="#10B981" />
            </View>
          </View>
        )}

        <View style={styles.filterContainer}>
          <FilterButton
            label="All"
            active={selectedFilter === 'all'}
            onPress={() => setSelectedFilter('all')}
          />
          <FilterButton
            label="Planned"
            active={selectedFilter === 'planned'}
            onPress={() => setSelectedFilter('planned')}
          />
          <FilterButton
            label="In Progress"
            active={selectedFilter === 'in_progress'}
            onPress={() => setSelectedFilter('in_progress')}
          />
          <FilterButton
            label="Completed"
            active={selectedFilter === 'completed'}
            onPress={() => setSelectedFilter('completed')}
          />
        </View>

        <View style={styles.itemsContainer}>
          {filteredItems.map(item => (
            <CalendarItemCard
              key={item.id}
              item={item}
              onStatusChange={updateItemStatus}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MixBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.mixBar}>
      <Text style={styles.mixLabel}>{label}</Text>
      <View style={styles.mixBarContainer}>
        <View style={[styles.mixBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.mixValue}>{value}%</Text>
    </View>
  );
}

function FilterButton({ label, active, onPress }: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CalendarItemCard({ item, onStatusChange }: {
  item: CalendarItem;
  onStatusChange: (itemId: string, status: string) => void;
}) {
  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      short_form: 'play-circle',
      long_form: 'film',
      livestream: 'videocam',
      story: 'flash',
    };
    return icons[type] || 'document';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planned: '#F59E0B',
      in_progress: '#007AFF',
      completed: '#10B981',
      cancelled: '#EF4444',
    };
    return colors[status] || '#9CA3AF';
  };

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemIcon}>
          <Ionicons name={getTypeIcon(item.type) as any} size={20} color="#007AFF" />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemCategory}>{item.category}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <Text style={styles.itemDescription}>{item.description}</Text>

      <View style={styles.itemFooter}>
        <View style={styles.itemMeta}>
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <Text style={styles.itemMetaText}>
            {new Date(item.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Ionicons name="time-outline" size={16} color="#6B7280" style={{ marginLeft: 12 }} />
          <Text style={styles.itemMetaText}>{item.preparationTime} min</Text>
        </View>

        {item.status !== 'completed' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onStatusChange(
              item.id,
              item.status === 'planned' ? 'in_progress' : 'completed'
            )}
          >
            <Text style={styles.actionButtonText}>
              {item.status === 'planned' ? 'Start' : 'Complete'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  statsCard: {
    flexDirection: 'row',
    margin: 20,
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  mixCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mixTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  mixBars: {
    gap: 12,
  },
  mixBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mixLabel: {
    width: 80,
    fontSize: 14,
    color: '#6B7280',
  },
  mixBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  mixBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  mixValue: {
    width: 40,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FFF',
  },
  itemsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  itemCard: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itemDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemMetaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
});
