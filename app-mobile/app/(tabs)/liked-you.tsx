/**
 * Liked You Screen
 * Shows users who have liked you (VIP/Royal feature)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'expo-router';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getProfile, ProfileData } from "@/lib/profileService";
import { getMembershipStatus } from "@/services/membershipService";
import { StatusBadges } from "@/components/StatusBadges";

interface LikeData {
  fromUserId: string;
  toUserId: string;
  timestamp: Date;
  isSuperLike: boolean;
}

export default function LikedYouScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [likes, setLikes] = useState<LikeData[]>([]);
  const [profiles, setProfiles] = useState<{ [key: string]: ProfileData }>({});
  const [membershipType, setMembershipType] = useState<'none' | 'vip' | 'royal'>('none');
  const router = useRouter();

  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) {
      checkAccessAndLoadLikes();
    }
  }, [currentUser]);

  const checkAccessAndLoadLikes = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);

      // Check membership status
      const membership = await getMembershipStatus(currentUser.uid);
      setMembershipType(membership.type);

      // VIP or Royal can access
      if (membership.type === 'vip' || membership.type === 'royal') {
        setHasAccess(true);
        await loadLikes();
      } else {
        setHasAccess(false);
      }
    } catch (error) {
      console.error('Error checking access:', error);
      Alert.alert('Error', 'Failed to load likes');
    } finally {
      setLoading(false);
    }
  };

  const loadLikes = async () => {
    if (!currentUser) return;

    try {
      const db = getFirestore();
      const interactionsRef = collection(db, 'interactions');

      // Get all likes to current user
      const q = query(
        interactionsRef,
        where('toUserId', '==', currentUser.uid),
        where('action', '==', 'like')
      );

      const snapshot = await getDocs(q);
      const likesData: LikeData[] = [];
      const userIds = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        likesData.push({
          fromUserId: data.fromUserId,
          toUserId: data.toUserId,
          timestamp: data.createdAt?.toDate() || new Date(),
          isSuperLike: data.isSuperLike || false,
        });
        userIds.add(data.fromUserId);
      });

      // Sort by timestamp (most recent first)
      likesData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setLikes(likesData);

      // Load profiles
      const loadedProfiles: { [key: string]: ProfileData } = {};
      for (const userId of Array.from(userIds)) {
        const profile = await getProfile(userId);
        if (profile) {
          loadedProfiles[userId] = profile;
        }
      }
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('Error loading likes:', error);
      Alert.alert('Error', 'Failed to load likes');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkAccessAndLoadLikes();
    setRefreshing(false);
  };

  const handleProfilePress = (userId: string) => {
    // Navigate to profile view (using existing profile route structure)
    router.push(`/profile/${userId}` as any);
  };

  const handleUpgradePress = () => {
    Alert.alert(
      'Upgrade to VIP',
      'Get VIP membership to see who liked you and unlock more features!',
      [
        { text: 'Maybe Later', style: 'cancel' },
        {
          text: 'View Plans',
          onPress: () => {
            // Navigate to membership/upgrade screen (to be implemented)
            Alert.alert('Coming Soon', 'VIP membership purchase will be available soon!');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Show paywall if no access
  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <View style={styles.paywallContainer}>
          <View style={styles.paywallIcon}>
            <Text style={styles.paywallIconText}>👑</Text>
          </View>
          <Text style={styles.paywallTitle}>VIP Feature</Text>
          <Text style={styles.paywallMessage}>
            Upgrade to VIP or Royal membership to see who liked you!
          </Text>
          
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>✓</Text>
              <Text style={styles.featureText}>See who liked you</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>✓</Text>
              <Text style={styles.featureText}>5 free SuperLikes per day</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>✓</Text>
              <Text style={styles.featureText}>5 free Rewinds per day</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>✓</Text>
              <Text style={styles.featureText}>2× Discovery Priority</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>✓</Text>
              <Text style={styles.featureText}>50% off Video/Voice calls</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgradePress}>
            <Text style={styles.upgradeButtonText}>Upgrade to VIP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show likes
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💝 Who Liked You</Text>
        <Text style={styles.headerSubtitle}>
          {likes.length} {likes.length === 1 ? 'person has' : 'people have'} liked you
        </Text>
      </View>

      {/* Likes List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {likes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💔</Text>
            <Text style={styles.emptyTitle}>No Likes Yet</Text>
            <Text style={styles.emptyText}>
              Don't worry! Keep swiping and your matches will show up here.
            </Text>
          </View>
        ) : (
          likes.map((like, index) => {
            const profile = profiles[like.fromUserId];
            if (!profile) return null;

            return (
              <TouchableOpacity
                key={`${like.fromUserId}-${index}`}
                style={styles.likeCard}
                onPress={() => handleProfilePress(like.fromUserId)}
                activeOpacity={0.7}
              >
                {/* Profile Photo */}
                <Image
                  source={{ uri: profile.photos[0] }}
                  style={styles.profilePhoto}
                />

                {/* SuperLike Badge */}
                {like.isSuperLike && (
                  <View style={styles.superLikeBadge}>
                    <Text style={styles.superLikeBadgeText}>⭐ SUPER LIKE</Text>
                  </View>
                )}

                {/* Profile Info */}
                <View style={styles.profileInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName}>
                      {profile.name}, {profile.age}
                    </Text>
                    <StatusBadges
                      membership={profile.membership}
                      isVIP={profile.isVIP}
                      isBoosted={false}
                      size="small"
                    />
                  </View>
                  <Text style={styles.profileLocation}>📍 {profile.city}</Text>
                  {profile.bio && (
                    <Text style={styles.profileBio} numberOfLines={2}>
                      {profile.bio}
                    </Text>
                  )}
                  <Text style={styles.likeTimestamp}>
                    Liked you {getTimeAgo(like.timestamp)}
                  </Text>
                </View>

                {/* Like Icon */}
                <View style={styles.likeIcon}>
                  <Text style={styles.likeIconText}>
                    {like.isSuperLike ? '⭐' : '💖'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* VIP Badge */}
      <View style={styles.vipBadge}>
        <Text style={styles.vipBadgeText}>
          {membershipType === 'royal' ? '♛ ROYAL' : '👑 VIP'} Feature
        </Text>
      </View>
    </View>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  likeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profilePhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  superLikeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  superLikeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  profileLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  profileBio: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  likeTimestamp: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  likeIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  likeIconText: {
    fontSize: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  vipBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFC700',
    alignItems: 'center',
  },
  vipBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  // Paywall styles
  paywallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  paywallIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  paywallIconText: {
    fontSize: 48,
  },
  paywallTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  paywallMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  featuresList: {
    width: '100%',
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    color: '#4CAF50',
    marginRight: 12,
    width: 24,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
  },
  upgradeButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  backButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#666',
  },
});
