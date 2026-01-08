/**
 * Discovery Screen
 * Main discovery interface with filtering, priority ranking, and badges
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, ProfileData } from "@/lib/profileService";
import { getTokenBalance } from "@/services/tokenService";
import { getMiniDiscoveryProfiles } from "@/services/discoveryService";
import {
  recordLike,
  processSuperLike,
} from "@/services/interactionService";
import { isProfileBoosted } from "@/services/boostService";

export default function DiscoveryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [boostedProfiles, setBoostedProfiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user?.uid) {
      loadData();
    }
  }, [user?.uid]);

  const loadData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      const [profile, balance] = await Promise.all([
        getProfile(user.uid),
        getTokenBalance(user.uid),
      ]);

      setUserProfile(profile);
      setTokenBalance(balance);

      if (profile) {
        let discoveryProfiles = await getMiniDiscoveryProfiles(user.uid, profile, 50);
        
        // Check which profiles are boosted
        const boostedSet = new Set<string>();
        await Promise.all(
          discoveryProfiles.map(async (p) => {
            const isBoosted = await isProfileBoosted(p.uid);
            if (isBoosted) {
              boostedSet.add(p.uid);
            }
          })
        );
        setBoostedProfiles(boostedSet);

        // Sort profiles: boosted first, then regular
        discoveryProfiles = discoveryProfiles.sort((a, b) => {
          const aBoost = boostedSet.has(a.uid) ? 1 : 0;
          const bBoost = boostedSet.has(b.uid) ? 1 : 0;
          return bBoost - aBoost; // Boosted profiles first
        });

        setProfiles(discoveryProfiles);
      }
    } catch (error) {
      console.error('Error loading discovery:', error);
      Alert.alert('Error', 'Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleProfilePress = (profile: ProfileData) => {
    router.push(`/profile/${profile.uid}` as any);
  };

  const handleLike = async (profile: ProfileData) => {
    try {
      const result = await recordLike(user!.uid, profile.uid, false);
      
      if (result.matchCreated) {
        Alert.alert(
          '🎉 It\'s a Match!',
          `You and ${profile.name} liked each other!`,
          [
            { text: 'Keep Browsing', style: 'cancel' },
            {
              text: 'Send Message',
              onPress: () => router.push(`/chat/${result.chatId}` as any),
            },
          ]
        );
      }

      // Remove from list
      setProfiles(profiles.filter(p => p.uid !== profile.uid));
    } catch (error) {
      console.error('Error recording like:', error);
      Alert.alert('Error', 'Failed to like profile. Please try again.');
    }
  };

  const handleSuperLike = async (profile: ProfileData) => {
    const SUPERLIKE_COST = 50;

    if (tokenBalance < SUPERLIKE_COST) {
      Alert.alert(
        'Insufficient Tokens',
        `SuperLike costs ${SUPERLIKE_COST} tokens. You have ${tokenBalance} tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/(tabs)/wallet' as any) },
        ]
      );
      return;
    }

    try {
      const result = await processSuperLike(user!.uid, profile.uid);

      if (result.success) {
        if (result.matchCreated) {
          Alert.alert(
            '⭐ Super Match!',
            `${profile.name} will see you sent a SuperLike!`,
            [
              { text: 'Keep Browsing', style: 'cancel' },
              {
                text: 'Send Message',
                onPress: () => router.push(`/chat/${result.chatId}` as any),
              },
            ]
          );
        } else {
          Alert.alert('⭐ SuperLike wysłany!', `${profile.name} zobaczy, że jesteś zainteresowany!`);
        }

        // Update balance and remove from list
        const newBalance = await getTokenBalance(user!.uid);
        setTokenBalance(newBalance);
        setProfiles(profiles.filter(p => p.uid !== profile.uid));
      }
    } catch (error) {
      console.error('Error sending SuperLike:', error);
      Alert.alert('Błąd', 'Nie udało się wysłać SuperLike. Spróbuj ponownie.');
    }
  };

  const renderProfile = ({ item }: { item: ProfileData }) => {
    const isBoosted = boostedProfiles.has(item.uid);
    
    return (
      <View style={[styles.card, isBoosted && styles.cardBoosted]}>
        {/* Boost Badge */}
        {isBoosted && (
          <View style={styles.boostBadge}>
            <Text style={styles.boostBadgeText}>⚡ BOOST</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => handleProfilePress(item)}
          activeOpacity={0.9}
        >
          {/* Photo */}
          {item.photos && item.photos.length > 0 ? (
            <Image
              source={{ uri: item.photos[0] }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.photo, styles.placeholderPhoto]}>
              <Text style={styles.placeholderText}>📷</Text>
            </View>
          )}

          {/* Gradient Overlay */}
          <View style={styles.gradientOverlay} />

        {/* Profile Info */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.name}</Text>
            {item.age && <Text style={styles.age}>, {item.age}</Text>}
          </View>

          {item.city && (
            <Text style={styles.location}>📍 {item.city}</Text>
          )}

          {item.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => handleLike(item)}
        >
          <Text style={styles.likeIcon}>❤️</Text>
          <Text style={styles.actionText}>Like</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.superLikeButton}
          onPress={() => handleSuperLike(item)}
        >
          <Text style={styles.superLikeIcon}>⭐</Text>
          <Text style={styles.actionText}>SuperLike</Text>
          <Text style={styles.costText}>50 tokens</Text>
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading profiles...</Text>
      </View>
    );
  }

  if (!userProfile?.profileComplete) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Complete Your Profile</Text>
        <Text style={styles.emptyText}>
          Finish setting up your profile to start discovering!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💫 Discovery</Text>
        <TouchableOpacity
          style={styles.walletButton}
          onPress={() => router.push('/(tabs)/wallet' as any)}
        >
          <Text style={styles.walletIcon}>💰</Text>
          <Text style={styles.walletBalance}>{tokenBalance}</Text>
        </TouchableOpacity>
      </View>

      {/* Profile List */}
      <FlatList
        data={profiles}
        renderItem={renderProfile}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#FF6B6B']}
            tintColor="#FF6B6B"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>😊</Text>
            <Text style={styles.emptyTitle}>No profiles right now</Text>
            <Text style={styles.emptyText}>Check back later for more matches!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  walletIcon: {
    fontSize: 18,
  },
  walletBalance: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  cardBoosted: {
    borderWidth: 2,
    borderColor: '#40E0D0',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  boostBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#40E0D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  boostBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  photo: {
    width: '100%',
    height: 400,
  },
  placeholderPhoto: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 80,
    opacity: 0.3,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    padding: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  age: {
    fontSize: 24,
    color: '#fff',
  },
  location: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 6,
  },
  bio: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  likeButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  likeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  superLikeButton: {
    flex: 1,
    backgroundColor: '#4A90E2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  superLikeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  costText: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.9,
    marginTop: 2,
  },
});

