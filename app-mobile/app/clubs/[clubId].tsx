/**
 * PACK 139: Club Profile Screen
 * View club details, posts, and members
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getClubDetails,
  getClubPosts,
  joinClub,
  leaveClub,
  Club,
  ClubPost,
  formatClubCategory,
  getCategoryIcon,
  getCategoryColor,
  formatMemberCount,
  formatAccessType,
  isClubOwner,
} from '../../services/clubsService';

export default function ClubProfileScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');

  // Mock current user ID (replace with actual auth)
  const currentUserId = 'current-user-id';

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

  const loadClubData = async () => {
    try {
      setLoading(true);
      const [clubData, postsData] = await Promise.all([
        getClubDetails(clubId as string),
        getClubPosts(clubId as string, 50),
      ]);
      setClub(clubData);
      setPosts(postsData);
    } catch (error) {
      console.error('Error loading club:', error);
      Alert.alert('Error', 'Failed to load club details');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadClubData();
    setRefreshing(false);
  };

  const handleJoinClub = async () => {
    if (!club) return;

    if (club.accessType === 'TOKEN_GATED') {
      Alert.alert(
        'Join Club',
        `This club costs ${club.entryTokens} tokens to join. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Join',
            onPress: async () => {
              await performJoin();
            },
          },
        ]
      );
    } else {
      await performJoin();
    }
  };

  const performJoin = async () => {
    try {
      setJoining(true);
      await joinClub(clubId as string);
      Alert.alert('Success', 'Successfully joined club!');
      await loadClubData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join club');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveClub = async () => {
    Alert.alert(
      'Leave Club',
      'Are you sure you want to leave this club? No refund will be provided for paid clubs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveClub(clubId as string);
              Alert.alert('Success', 'Left club successfully');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to leave club');
            }
          },
        },
      ]
    );
  };

  const handleCreatePost = () => {
    // Navigate to create post screen
    Alert.alert('Create Post', 'Post creation UI coming soon');
  };

  if (loading || !club) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const categoryColor = getCategoryColor(club.category);
  const categoryIcon = getCategoryIcon(club.category);
  const isOwner = isClubOwner(club, currentUserId);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Club Header */}
      <View style={[styles.header, { backgroundColor: categoryColor + '20' }]}>
        <Text style={styles.categoryIcon}>{categoryIcon}</Text>
        <Text style={styles.clubName}>{club.name}</Text>
        <Text style={styles.category}>{formatClubCategory(club.category)}</Text>

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatMemberCount(club.memberCount)}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatAccessType(club.accessType)}</Text>
            <Text style={styles.statLabel}>Access</Text>
          </View>
          {club.accessType === 'TOKEN_GATED' && (
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{club.entryTokens} 🪙</Text>
              <Text style={styles.statLabel}>Entry</Text>
            </View>
          )}
        </View>
      </View>

      {/* Safety Notice */}
      <View style={styles.safetyNotice}>
        <Text style={styles.safetyText}>
          🛡️ SAFE community space • No dating/NSFW content
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {isOwner ? (
          <>
            <TouchableOpacity style={[styles.actionButton, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Manage Club</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Analytics</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={handleJoinClub}
              disabled={joining}
            >
              <Text style={styles.primaryButtonText}>
                {joining ? 'Joining...' : 'Join Club'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={handleLeaveClub}
            >
              <Text style={styles.secondaryButtonText}>Leave</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
          onPress={() => setActiveTab('posts')}
        >
          <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>
            Posts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'about' && styles.tabActive]}
          onPress={() => setActiveTab('about')}
        >
          <Text style={[styles.tabText, activeTab === 'about' && styles.tabTextActive]}>
            About
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'posts' ? (
        <View style={styles.postsContainer}>
          <TouchableOpacity style={styles.createPostButton} onPress={handleCreatePost}>
            <Text style={styles.createPostText}>+ Create Post</Text>
          </TouchableOpacity>

          {posts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No posts yet</Text>
              <Text style={styles.emptySubtext}>Be the first to post!</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.postId} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.postAuthor}>{post.userName}</Text>
                  <Text style={styles.postTime}>
                    {new Date(post.createdAt.seconds * 1000).toLocaleDateString()}
                  </Text>
                </View>
                {post.content && (
                  <Text style={styles.postContent}>{post.content}</Text>
                )}
                {post.mediaUrl && (
                  <View style={styles.mediaPlaceholder}>
                    <Text>📷 Media</Text>
                  </View>
                )}
                <View style={styles.postFooter}>
                  <Text style={styles.postStat}>❤️ {post.likesCount}</Text>
                  <Text style={styles.postStat}>💬 {post.commentsCount}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : (
        <View style={styles.aboutContainer}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionText}>{club.description}</Text>
          </View>

          {club.rules && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Club Rules</Text>
              <Text style={styles.sectionText}>{club.rules}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Club Info</Text>
            <Text style={styles.infoText}>Owner: {club.ownerName}</Text>
            <Text style={styles.infoText}>
              Created: {new Date(club.createdAt.seconds * 1000).toLocaleDateString()}
            </Text>
            {club.maxMembers && (
              <Text style={styles.infoText}>
                Capacity: {club.memberCount}/{club.maxMembers}
              </Text>
            )}
          </View>

          {club.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagContainer}>
                {club.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  clubName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  category: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  safetyNotice: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  safetyText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  postsContainer: {
    padding: 16,
  },
  createPostButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  createPostText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  postCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  postAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  postTime: {
    fontSize: 12,
    color: '#999',
  },
  postContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  mediaPlaceholder: {
    backgroundColor: '#F5F5F5',
    padding: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  postStat: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#BBB',
  },
  aboutContainer: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
  },
});