/**
 * PACK 335 - Support Tickets List Screen
 * User's ticket list with filtering and status tracking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { auth, db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

// PACK 335 Types
interface SupportTicket {
  id: string;
  userId: string;
  type: 'TECHNICAL' | 'PAYMENT' | 'REFUND_DISPUTE' | 'IDENTITY_VERIFICATION' | 'SAFETY' | 'ACCOUNT_ACCESS' | 'OTHER';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdAt: any;
  updatedAt: any;
  lastUserMessageAt?: any;
  lastAgentMessageAt?: any;
}

const formatTicketId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

type FilterType = 'all' | 'open' | 'closed';

export default function SupportTicketsScreen() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        router.replace('/auth/login' as any);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    let q = query(
      collection(db, 'supportTickets'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    // Apply filter
    if (filter === 'open') {
      q = query(
        collection(db, 'supportTickets'),
        where('userId', '==', userId),
        where('status', 'in', ['OPEN', 'IN_PROGRESS']),
        orderBy('updatedAt', 'desc')
      );
    } else if (filter === 'closed') {
      q = query(
        collection(db, 'supportTickets'),
        where('userId', '==', userId),
        where('status', 'in', ['RESOLVED', 'REJECTED', 'CLOSED']),
        orderBy('updatedAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as SupportTicket[];
      
      setTickets(ticketsData);
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsubscribe();
  }, [userId, filter]);

  const handleRefresh = () => {
    setRefreshing(true);
  };

  const handleOpenTicket = (id: string) => {
    router.push(`/support/${id}` as any);
  };

  const handleNewTicket = () => {
    router.push('/support/new' as any);
  };

  const formatRelativeTime = (timestamp: any) => {
    const now = Date.now();
    const time = timestamp?.toMillis ? timestamp.toMillis() : new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(time).toLocaleDateString();
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      TECHNICAL: 'Technical',
      PAYMENT: 'Payment',
      REFUND_DISPUTE: 'Refund Dispute',
      IDENTITY_VERIFICATION: 'ID Verification',
      SAFETY: 'Safety',
      ACCOUNT_ACCESS: 'Account Access',
      OTHER: 'Other',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      OPEN: '#f59e0b',
      IN_PROGRESS: '#3b82f6',
      RESOLVED: '#10b981',
      REJECTED: '#ef4444',
      CLOSED: '#6b7280',
    };
    return colors[status] || '#6b7280';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      LOW: '#6b7280',
      NORMAL: '#3b82f6',
      HIGH: '#f59e0b',
      CRITICAL: '#ef4444',
    };
    return colors[priority] || '#6b7280';
  };

  const renderTicket = ({ item }: { item: SupportTicket }) => {
    return (
      <TouchableOpacity
        style={styles.ticketCard}
        onPress={() => handleOpenTicket(item.id)}
      >
        <View style={styles.ticketHeader}>
          <View style={styles.ticketHeaderLeft}>
            <Text style={styles.ticketId}>{formatTicketId(item.id)}</Text>
            <Text style={styles.ticketType} numberOfLines={1}>
              {getTypeLabel(item.type)}
            </Text>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
            <Text style={styles.priorityText}>{item.priority}</Text>
          </View>
        </View>

        <View style={styles.ticketFooter}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
          <Text style={styles.ticketTime}>
            {formatRelativeTime(item.updatedAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Support Tickets</Text>
          <TouchableOpacity style={styles.newButton} onPress={handleNewTicket}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newButtonText}>New Ticket</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'open' && styles.filterTabActive]}
            onPress={() => setFilter('open')}
          >
            <Text style={[styles.filterTabText, filter === 'open' && styles.filterTabTextActive]}>
              Open
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'closed' && styles.filterTabActive]}
            onPress={() => setFilter('closed')}
          >
            <Text style={[styles.filterTabText, filter === 'closed' && styles.filterTabTextActive]}>
              Closed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="ticket-outline" size={64} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No Tickets Found</Text>
          <Text style={styles.emptyText}>
            {filter === 'all' 
              ? "You haven't created any support tickets yet."
              : `No ${filter} tickets found.`}
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleNewTicket}>
            <Text style={styles.emptyButtonText}>Create New Ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tickets}
          renderItem={renderTicket}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#6366f1"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  filterTabActive: {
    backgroundColor: '#6366f1',
  },
  filterTabText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  ticketId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    textTransform: 'uppercase',
  },
  ticketType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
