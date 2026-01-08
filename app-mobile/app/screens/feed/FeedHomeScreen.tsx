/**
 * PACK 323 - Feed Home Screen
 * Main feed with posts, reels, and stories
 * Vertical scroll feed with ranking strategy
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from "@/lib/firebase";
import { collection, query, orderBy, limit as firestoreLimit, where, getDocs } from 'firebase/firestore';

const { width } = Dimensions.get('window');

interface FeedItem {
  id: string;
  type: 'post' | 'reel' | 'story' | 'ai_companion' | 'event';
  data: any;
}

interface Story {
  id: string;
  ownerUserId: string;
  mediaUrl: string;
  expiresAt: any;
}

export default function FeedHomeScreen() {
  const router = useRouter();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load feed items
  const loadFeed = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Fetch posts and reels (mixed)
      const postsQuery = query(
        collection(db, 'feedPosts'),
        where('visibility', '==', 'PUBLIC'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        firestoreLimit(20)
      );

      const reelsQuery = query(
        collection(db, 'feedReels'),
        where('visibility', '==', 'PUBLIC'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        firestoreLimit(10)
      );

      const [postsSnap, reelsSnap] = await Promise.all([
        getDocs(postsQuery),
        getDocs(reelsQuery),
      ]);

      const posts: FeedItem[] = postsSnap.docs.map(doc => ({
        id: doc.id,
        type: 'post' as const,
        data: { id: doc.id, ...doc.data() },
      }));

      const reels: FeedItem[] = reelsSnap.docs.map(doc => ({
        id: doc.id,
        type: 'reel' as const,
        data: { id: doc.id, ...doc.data() },
      }));

      // Mix posts and reels (ranking strategy: newest first, boosted by engagement)
      const mixed = [...posts, ...reels].sort((a, b) => {
        const aTime = a.data.createdAt?.toMillis?.() || 0;
        const bTime = b.data.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      // Every 5th item, inject AI companion card (from PACK 279D integration)
      const withAICards = injectAICompanionCards(mixed);

      setFeedItems(withAICards);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load stories
  const loadStories = useCallback(async () => {
    try {
      const storiesQuery = query(
        collection(db, 'feedStories'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        firestoreLimit(20)
      );

      const storiesSnap = await getDocs(storiesQuery);
      const storiesData = storiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Story[];

      // Filter out expired stories (client-side failsafe)
      const now = Date.now();
      const activeStories = storiesData.filter(story => {
        const expiresAt = story.expiresAt?.toMillis?.() || 0;
        return expiresAt > now;
      });

      setStories(activeStories);
    } catch (error) {
      console.error('Error loading stories:', error);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadStories();
  }, [loadFeed, loadStories]);

  const handleRefresh = useCallback(() => {
    loadFeed(true);
    loadStories();
  }, [loadFeed, loadStories]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !loading) {
      setLoadingMore(true);
      // TODO: Implement pagination
      setLoadingMore(false);
    }
  }, [loadingMore, loading]);

  const handleLike = useCallback(async (contentId: string, contentType: string) => {
    try {
      const likeContent = httpsCallable(functions, 'pack323_likeContent');
      await likeContent({ contentId, contentType });
      
      // Optimistic update
      setFeedItems(prev => prev.map(item => {
        if (item.id === contentId) {
          return {
            ...item,
            data: {
              ...item.data,
              liked: !item.data.liked,
              likes: item.data.liked ? (item.data.likes || 0) - 1 : (item.data.likes || 0) + 1,
            },
          };
        }
        return item;
      }));
    } catch (error) {
      console.error('Error liking content:', error);
    }
  }, []);

  const handleComment = useCallback((contentId: string, contentType: string) => {
    if (contentType === 'FEED_POST') {
      router.push(`/screens/feed/FeedPostViewerScreen?postId=${contentId}` as any);
    } else if (contentType === 'FEED_REEL') {
      router.push(`/screens/feed/FeedReelViewerScreen?reelId=${contentId}` as any);
    }
  }, [router]);

  const handleStoryPress = useCallback((userId: string) => {
    router.push(`/screens/feed/FeedStoryViewerScreen?userId=${userId}` as any);
  }, [router]);

  const renderStoryItem = useCallback(({ item }: { item: Story }) => (
    <TouchableOpacity
      style={styles.storyItem}
      onPress={() => handleStoryPress(item.ownerUserId)}
    >
      <View style={styles.storyRing}>
        <Image
          source={{ uri: item.mediaUrl }}
          style={styles.storyAvatar}
        />
      </View>
    </TouchableOpacity>
  ), [handleStoryPress]);

  const renderFeedItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item.type === 'post') {
      return (
        <View style={styles.postCard}>
          <Text style={styles.caption}>{item.data.caption}</Text>
          {item.data.mediaUrls?.length > 0 && (
            <Image
              source={{ uri: item.data.mediaUrls[0] }}
              style={styles.postImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleLike(item.id, 'FEED_POST')}
            >
              <Text style={styles.actionText}>
                {item.data.liked ? '❤️' : '🤍'} {item.data.likes || 0}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleComment(item.id, 'FEED_POST')}
            >
              <Text style={styles.actionText}>💬 {item.data.comments || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (item.type === 'reel') {
      return (
        <TouchableOpacity
          style={styles.reelCard}
          onPress={() => router.push(`/screens/feed/FeedReelViewerScreen?reelId=${item.id}` as any)}
        >
          <Image
            source={{ uri: item.data.thumbnailUrl || item.data.videoUrl }}
            style={styles.reelThumbnail}
            resizeMode="cover"
          />
          <View style={styles.reelOverlay}>
            <Text style={styles.reelCaption}>{item.data.caption}</Text>
            <Text style={styles.reelStats}>
              👁️ {item.data.views || 0} • ❤️ {item.data.likes || 0}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'ai_companion') {
      return (
        <View style={styles.aiCard}>
          <Text style={styles.aiTitle}>🤖 AI Companion</Text>
          <Text style={styles.aiSubtitle}>Discover AI-powered connections</Text>
        </View>
      );
    }

    return null;
  }, [handleLike, handleComment, router]);

  const ListHeaderComponent = useCallback(() => (
    <View>
      {stories.length > 0 && (
        <View style={styles.storiesContainer}>
          <FlatList
            data={stories}
            renderItem={renderStoryItem}
            keyExtractor={item => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesList}
          />
        </View>
      )}
    </View>
  ), [stories, renderStoryItem]);

  if (loading && feedItems.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feedItems}
        renderItem={renderFeedItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeaderComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6C63FF"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Helper function to inject AI companion cards every 5th position
function injectAICompanionCards(items: FeedItem[]): FeedItem[] {
  const result: FeedItem[] = [];
  
  items.forEach((item, index) => {
    result.push(item);
    
    // Every 5th position, inject AI companion card
    if ((index + 1) % 5 === 0) {
      result.push({
        id: `ai_companion_${index}`,
        type: 'ai_companion',
        data: {},
      });
    }
  });
  
  return result;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storiesContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  storiesList: {
    paddingHorizontal: 12,
  },
  storyItem: {
    marginRight: 12,
  },
  storyRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#6C63FF',
    padding: 3,
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 16,
  },
  caption: {
    fontSize: 15,
    color: '#333',
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: width * 0.75,
    borderRadius: 8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
  reelCard: {
    backgroundColor: '#000',
    marginBottom: 12,
    height: width * 1.33,
    position: 'relative',
  },
  reelThumbnail: {
    width: '100%',
    height: '100%',
  },
  reelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reelCaption: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 4,
  },
  reelStats: {
    color: '#FFF',
    fontSize: 12,
  },
  aiCard: {
    backgroundColor: '#6C63FF',
    marginBottom: 12,
    padding: 24,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  aiTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  aiSubtitle: {
    color: '#FFF',
    fontSize: 14,
    opacity: 0.9,
  },
});
