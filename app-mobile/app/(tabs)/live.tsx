/**
 * Live Rooms Screen
 * Phase 27: Optimized with skeleton loaders and Polish UX
 * Phase 32-4: FTUX mission tracking for LIVE tab visits
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 */

import React, { useState, useEffect, memo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { TokenBadge } from "@/components/TokenBadge";
import { getActiveLiveSessions, LiveSession } from "@/services/liveService";
import { LiveRoomSkeleton } from "@/components/SkeletonLoader";
import { EmptyState, EmptyStates } from "@/components/EmptyState";
import { useFtuxMissions } from "@/hooks/useFtuxMissions";
import { getProfile } from "@/lib/profileService";

export default function LiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Phase 32-4: FTUX missions hook
  const ftuxMissions = useFtuxMissions(
    userProfile
      ? {
          gender: userProfile.gender as 'male' | 'female' | 'other',
          createdAt: userProfile.createdAt instanceof Date
            ? userProfile.createdAt.getTime()
            : typeof userProfile.createdAt === 'number'
            ? userProfile.createdAt
            : null,
        }
      : undefined
  );

  useEffect(() => {
    loadRooms();
    if (user?.uid) {
      loadUserProfile();
      trackLiveTabVisit();
    }
  }, [user?.uid]);
  
  const loadUserProfile = async () => {
    if (!user?.uid) return;
    try {
      const profile = await getProfile(user.uid);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };
  
  // Phase 32-4: Track first visit to LIVE tab for FTUX missions
  const trackLiveTabVisit = async () => {
    try {
      const visited = await AsyncStorage.getItem('ftux_live_visited');
      if (!visited) {
        await AsyncStorage.setItem('ftux_live_visited', 'true');
        ftuxMissions.registerEvent({ type: 'LIVE_TAB_VISITED' });
      }
    } catch (error) {
      console.error('Error tracking LIVE tab visit:', error);
    }
  };

  const loadRooms = async () => {
    try {
      const liveRooms = await getActiveLiveSessions();
      setRooms(liveRooms);
    } catch (error) {
      console.error('Error loading live rooms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRooms();
  };

  const handleRoomPress = (room: LiveSession) => {
    router.push(`/live/${room.liveId}` as any);
  };

  const handleGoLive = () => {
    router.push('/live/create' as any);
  };

  const renderRoom = ({ item }: { item: LiveSession }) => (
    <TouchableOpacity
      style={styles.roomCard}
      onPress={() => handleRoomPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.roomThumbnail}>
        <Text style={styles.thumbnailEmoji}>📹</Text>
        {item.isActive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
      </View>
      
      <View style={styles.roomInfo}>
        <View style={styles.roomHeader}>
          <Text style={styles.roomTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.entryFee > 0 && (
            <View style={styles.entryFeeBadge}>
              <Text style={styles.entryFeeText}>{item.entryFee}🪙</Text>
            </View>
          )}
        </View>
        <Text style={styles.creatorName} numberOfLines={1}>
          {item.creatorName}
        </Text>
        <View style={styles.roomStats}>
          <View style={styles.viewerCount}>
            <Text style={styles.viewerEmoji}>👁️</Text>
            <Text style={styles.viewerText}>{item.viewerCount}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (!user) {
    return (
      <View style={styles.container}>
        <EmptyState
          emoji="🔐"
          title="Wymagane logowanie"
          description="Zaloguj się, aby oglądać transmisje na żywo"
          actionLabel="Zaloguj się"
          onAction={() => router.push('/(onboarding)/login' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LIVE Streaming</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.goLiveButton}
            onPress={handleGoLive}
            activeOpacity={0.8}
          >
            <Text style={styles.goLiveButtonText}>🔴 Go Live</Text>
          </TouchableOpacity>
          <TokenBadge />
        </View>
      </View>

      {loading ? (
        <LiveRoomSkeleton />
      ) : rooms.length === 0 ? (
        <EmptyState
          {...EmptyStates.noLiveRooms}
          actionLabel="Rozpocznij transmisję"
          onAction={() => {}}
        />
      ) : (
        <FlatList
          data={rooms}
          renderItem={renderRoom}
          keyExtractor={(item) => item.liveId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#FF6B6B']}
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    backgroundColor: '#0F0F0F',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goLiveButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  goLiveButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  listContent: {
    padding: 16,
  },
  roomCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  roomThumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#000',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  thumbnailEmoji: {
    fontSize: 40,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  roomInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  roomTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  creatorName: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 8,
  },
  entryFeeBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  entryFeeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  roomStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewerEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  viewerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
