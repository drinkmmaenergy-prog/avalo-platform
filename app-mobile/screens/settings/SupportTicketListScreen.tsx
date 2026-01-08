/**
 * Support Ticket List Screen
 * 
 * Shows user's support tickets with status and filtering.
 * Part of PACK 68 - In-App Support Center & Ticketing.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  SupportTicketSummary,
  listMyTickets,
  getStatusDisplayName,
  getStatusColor,
  getCategoryDisplayName,
  formatTicketDate,
} from '../../services/supportService';

const SupportTicketListScreen: React.FC = () => {
  const navigation = useNavigation();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const locale = 'en'; // TODO: Get from user settings
  const userId = 'current-user-id'; // TODO: Get from auth context

  const loadTickets = async (refresh: boolean = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await listMyTickets(userId, 20);
      setTickets(result.tickets);
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch (error) {
      console.error('[TicketList] Error loading tickets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;

    try {
      setLoadingMore(true);
      const result = await listMyTickets(userId, 20, cursor || undefined);
      setTickets([...tickets, ...result.tickets]);
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch (error) {
      console.error('[TicketList] Error loading more tickets:', error);
    } finally {
       setLoadingMore(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [])
  );

  const handleTicketPress = (ticketId: string) => {
    navigation.navigate('SupportTicketDetail' as never, { ticketId } as never);
  };

  const handleNewTicket = () => {
    navigation.navigate('SupportNewTicket' as never);
  };

  const renderTicket = ({ item }: { item: SupportTicketSummary }) => {
    const statusColor = getStatusColor(item.status);
    const statusText = getStatusDisplayName(item.status, locale);
    const categoryText = getCategoryDisplayName(item.category, locale);
    const dateText = formatTicketDate(item.updatedAt, locale);

    return (
      <TouchableOpacity
        style={styles.ticketCard}
        onPress={() => handleTicketPress(item.ticketId)}
        activeOpacity={0.7}
      >
        <View style={styles.ticketHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
          <Text style={styles.ticketDate}>{dateText}</Text>
        </View>

        <Text style={styles.ticketSubject} numberOfLines={2}>
          {item.subject}
        </Text>

        <View style={styles.ticketFooter}>
          <Text style={styles.categoryText}>{categoryText}</Text>
          <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="mail-open-outline" size={64} color="#8E8E93" />
      <Text style={styles.emptyTitle}>No Support Tickets</Text>
      <Text style={styles.emptyText}>
        You haven't created any support tickets yet.
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={handleNewTicket}
        activeOpacity={0.7}
      >
        <Text style={styles.emptyButtonText}>Create Ticket</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator color="#007AFF" />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item.ticketId}
        contentContainerStyle={[
          styles.listContent,
          tickets.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets(true)}
            tintColor="#007AFF"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
      />

      {/* Floating Action Button */}
      {tickets.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleNewTicket}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flex: 1,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ticketDate: {
    fontSize: 13,
    color: '#8E8E93',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
    lineHeight: 22,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});

export default SupportTicketListScreen;
