/**
 * Live Streaming Lobby - Avalo Mobile
 * 
 * Shows list of currently live rooms
 * Allows hosts to go live
 * Viewers can browse and join live streams
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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { getAuth } from 'firebase/auth';
import { LiveRoom, getHostLiveDashboard, createOrGetRoom, startSession } from "@/services/liveService";

export default function LiveLobbyScreen() {
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canGoLive, setCanGoLive] = useState(false);
  const [goingLive, setGoingLive] = useState(false);

  // Load live rooms
  useEffect(() => {
    const q = query(
      collection(db, 'liveRooms'),
      where('status', '==', 'live'),
      orderBy('viewerCount', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rooms: LiveRoom[] = [];
      snapshot.forEach((doc) => {
        rooms.push({ ...doc.data(), roomId: doc.id } as LiveRoom);
      });
      setLiveRooms(rooms);
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsubscribe();
  }, []);

  // Check if current user can go live
  useEffect(() => {
    if (!currentUser) return;

    const checkEligibility = async () => {
      try {
        const dashboard = await getHostLiveDashboard();
        setCanGoLive(dashboard.canGoLive.canGoLive);
      } catch (error) {
        console.error('Error checking live eligibility:', error);
      }
    };

    checkEligibility();
  }, [currentUser]);

  const handleRefresh = () => {
    setRefreshing(true);
  };

  const handleGoLive = async () => {
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to go live');
      return;
    }

    try {
      setGoingLive(true);

      // Create or get room
      const room = await createOrGetRoom();

      // Start session
      const { sessionId } = await startSession(room.roomId);

      // Navigate to live room as host
      router.push({
        pathname: '/live/[roomId]',
        params: { roomId: room.roomId, sessionId, isHost: 'true' },
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start live session');
      console.error('Error going live:', error);
    } finally {
      setGoingLive(false);
    }
  };

  const handleJoinRoom = (room: LiveRoom) => {
    router.push({
      pathname: '/live/[roomId]',
      params: { roomId: room.roomId },
    });
  };

  const renderLiveRoom = ({ item }: { item: LiveRoom }) => (
    <TouchableOpacity
      style={styles.roomCard}
      onPress={() => handleJoinRoom(item)}
      activeOpacity={0.7}
    >
      <View style={styles.roomHeader}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.viewerCount}>
          <Text style={styles.viewerCountText}>👁️ {item.viewerCount}</Text>
        </View>
      </View>

      <Text style={styles.roomTitle} numberOfLines={2}>
        {item.title || 'Live Stream'}
      </Text>

      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.roomFooter}>
        <Text style={styles.giftsText}>💎 {item.totalGiftsTokens} tokens</Text>
        {item.is18Plus && (
          <View style={styles.adultBadge}>
            <Text style={styles.adultBadgeText}>18+</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎥</Text>
      <Text style={styles.emptyTitle}>No Live Streams</Text>
      <Text style={styles.emptyText}>
        Be the first to go live!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Streaming</Text>
        {canGoLive && (
          <TouchableOpacity
            style={[styles.goLiveButton, goingLive && styles.goLiveButtonDisabled]}
            onPress={handleGoLive}
            disabled={goingLive}
          >
            {goingLive ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.goLiveButtonText}>🔴 Go Live</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Live Rooms List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF0050" />
        </View>
      ) : (
        <FlatList
          data={liveRooms}
          renderItem={renderLiveRoom}
          keyExtractor={(item) => item.roomId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF0050"
            />
          }
          ListEmptyComponent={renderEmpty}
          numColumns={2}
          columnWrapperStyle={styles.row}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  goLiveButton: {
    backgroundColor: '#FF0050',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  goLiveButtonDisabled: {
    opacity: 0.6,
  },
  goLiveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-between',
  },
  roomCard: {
    flex: 1,
    margin: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    minHeight: 160,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0050',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 4,
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  viewerCount: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewerCountText: {
    color: '#fff',
    fontSize: 12,
  },
  roomTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    minHeight: 40,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  tag: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  tagText: {
    color: '#aaa',
    fontSize: 10,
  },
  roomFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  giftsText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  adultBadge: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adultBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
