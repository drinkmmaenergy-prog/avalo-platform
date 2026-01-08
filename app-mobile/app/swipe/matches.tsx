import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface Match {
  matchId: string;
  userId: string;
  displayName: string;
  photo: string | null;
  age: number;
  city: string;
  verified: boolean;
  chatId: string | null;
  createdAt: number;
}

export default function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const getMatchesFn = httpsCallable(functions, 'pack284_getMatches');
      const result: any = await getMatchesFn({ limit: 50 });

      if (result.data.success) {
        setMatches(result.data.matches || []);
      } else {
        throw new Error('Failed to fetch matches');
      }
    } catch (err: any) {
      console.error('Fetch matches error:', err);
      setError(err.message || 'Failed to load matches');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleRefresh = () => {
    fetchMatches(true);
  };

  const handleMatchPress = (match: Match) => {
    if (match.chatId) {
      router.push(`/chat/${match.chatId}` as any);
    } else {
      router.push(`/profile/${match.userId}` as any);
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const renderMatch = ({ item }: { item: Match }) => (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={() => handleMatchPress(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.photo || 'https://via.placeholder.com/150' }}
        style={styles.matchPhoto}
      />
      <View style={styles.matchInfo}>
        <View style={styles.matchNameRow}>
          <Text style={styles.matchName}>
            {item.displayName}, {item.age}
          </Text>
          {item.verified && (
            <Ionicons name="checkmark-circle" size={18} color="#4A90E2" />
          )}
        </View>
        <Text style={styles.matchLocation}>
          <Ionicons name="location-outline" size={14} color="#666" />
          {' '}{item.city}
        </Text>
        <Text style={styles.matchTime}>
          Matched {formatTimeAgo(item.createdAt)}
        </Text>
      </View>
      <View style={styles.matchActions}>
        {item.chatId ? (
          <View style={styles.chatBadge}>
            <Ionicons name="chatbubble" size={16} color="#00d68f" />
          </View>
        ) : (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-dislike-outline" size={64} color="#999" />
      <Text style={styles.emptyText}>No matches yet</Text>
      <Text style={styles.emptySubtext}>
        Keep swiping to find your match!
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/swipe' as any)}
      >
        <Text style={styles.emptyButtonText}>Start Swiping</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && matches.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Matches</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff4458" />
          <Text style={styles.loadingText}>Loading matches...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Matches</Text>
        <Text style={styles.matchCount}>{matches.length}</Text>
      </View>

      {/* Matches List */}
      <FlatList
        data={matches}
        renderItem={renderMatch}
        keyExtractor={(item) => item.matchId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#ff4458']}
            tintColor="#ff4458"
          />
        }
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  matchCount: {
    backgroundColor: '#ff4458',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 32,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  matchCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  matchPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  matchInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  matchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  matchName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  matchLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  matchTime: {
    fontSize: 12,
    color: '#999',
  },
  matchActions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chatBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e8f9f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadge: {
    backgroundColor: '#ff4458',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 20,
    backgroundColor: '#ff4458',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#ffe0e0',
    padding: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4458',
    fontSize: 14,
  },
});
