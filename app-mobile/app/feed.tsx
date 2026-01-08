/**
 * PACK 270 - Feed Screen (Mobile)
 * Main content feed with posts, events, creators, and CTAs
 *
 * PACK 279D - AI Companion tiles integrated every 5th position
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from "@/lib/firebase";
import { collection, query, limit as firestoreLimit, getDocs, orderBy } from 'firebase/firestore';
import { FeedService, likePost, unlikePost, savePost, reportContent } from "@/shared/services/feedService";
import type { FeedItem, Post, ReportReason } from "@/shared/types/feed";
import { FeedPost } from './feed/components/feed/FeedPost';
import { CreatorHighlight } from './feed/components/feed/CreatorHighlight';
import { EventsNearYou } from './feed/components/feed/EventsNearYou';
import { CTACard } from './feed/components/feed/CTACard';
import { AICompanionTile } from './feed/components/feed/AICompanionTile';
import { AppHeader } from './feed/components/AppHeader';
import { BottomNavigation } from './feed/components/BottomNavigation';
import { QuickActionButton } from './feed/components/QuickActionButton';
import { colors } from "@/shared/theme";

const MOCK_USER_ID = 'current_user_123'; // TODO: Get from auth context

// PACK 279D - AI Companion tile interface
interface AICompanionFeedItem {
  id: string;
  type: 'ai_companion';
  score?: number;
  timestamp?: Date;
  companion: {
    id: string;
    name: string;
    avatar: string;
    style: string[];
    chatPrice: number;
    videoMinPrice: number;
  };
}

export default function FeedScreen() {
  const router = useRouter();
  const [feedService] = useState(() => new FeedService(db));
  
  // State
  const [items, setItems] = useState<FeedItem[]>([]);
  const [aiCompanions, setAiCompanions] = useState<AICompanionFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // PACK 279D - Load AI companions for feed injection
  const loadAICompanions = useCallback(async () => {
    try {
      const companionsRef = collection(db, 'aiCompanions');
      const companionsQuery = query(
        companionsRef,
        orderBy('reviewCount', 'desc'),
        firestoreLimit(10)
      );
      const snapshot = await getDocs(companionsQuery);

      const companions: AICompanionFeedItem[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: `ai_companion_${doc.id}`,
          type: 'ai_companion' as const,
          score: 0,
          timestamp: new Date(),
          companion: {
            id: doc.id,
            name: data.name || 'AI Companion',
            avatar: data.avatarUrl || '🤖',
            style: data.style || [],
            chatPrice: 100,
            videoMinPrice: 10, // Royal tier minimum
          },
        };
      });

      setAiCompanions(companions);
    } catch (error) {
      console.error('Error loading AI companions:', error);
    }
  }, []);

  // Load feed data
  const loadFeed = useCallback(async (pageNum: number, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await feedService.getFeed(MOCK_USER_ID, pageNum, {
        excludeNSFW: true,
      });

      if (isRefresh || pageNum === 1) {
        setItems(response.items);
      } else {
        setItems(prev => [...prev, ...response.items]);
      }

      setHasMore(response.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading feed:', error);
      Alert.alert('Error', 'Failed to load feed. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [feedService]);

  // Initial load
  useEffect(() => {
    loadFeed(1);
    loadAICompanions(); // PACK 279D - Load AI companions
    
    // Cleanup subscriptions on unmount
    return () => {
      feedService.cleanup();
    };
  }, [loadFeed, loadAICompanions, feedService]);

  // Refresh feed
  const handleRefresh = useCallback(() => {
    loadFeed(1, true);
  }, [loadFeed]);

  // Load more items
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      loadFeed(page + 1);
    }
  }, [loadingMore, hasMore, loading, page, loadFeed]);

  // Engagement actions
  const handleLike = useCallback(async (postId: string) => {
    // Optimistic update
    setItems(prev => prev.map(item => {
      if (item.type === 'user_post' && item.post.id === postId) {
        const post = item.post;
        const hasLiked = post.engagement.hasLiked;
        return {
          ...item,
          post: {
            ...post,
            engagement: {
              ...post.engagement,
              likes: hasLiked ? post.engagement.likes - 1 : post.engagement.likes + 1,
              hasLiked: !hasLiked,
            },
          },
        };
      }
      return item;
    }));

    // API call
    try {
      const post = items.find(item => item.type === 'user_post' && item.post.id === postId);
      if (post && post.type === 'user_post') {
        if (post.post.engagement.hasLiked) {
          await unlikePost(db, MOCK_USER_ID, postId);
        } else {
          await likePost(db, MOCK_USER_ID, postId);
        }
      }
    } catch (error) {
      console.error('Error liking post:', error);
      // Revert optimistic update
      handleRefresh();
    }
  }, [items, handleRefresh]);

  const handleComment = useCallback((postId: string) => {
    router.push(`/feed/post/${postId}` as any);
  }, [router]);

  const handleShare = useCallback((postId: string) => {
    Alert.alert('Share', 'Share functionality coming soon!');
  }, []);

  const handleSave = useCallback(async (postId: string) => {
    try {
      await savePost(db, MOCK_USER_ID, postId);
      Alert.alert('Saved', 'Post saved to your collection');
    } catch (error) {
      console.error('Error saving post:', error);
      Alert.alert('Error', 'Failed to save post');
    }
  }, []);

  const handleReport = useCallback((postId: string) => {
    Alert.alert(
      'Report Post',
      'Please select a reason',
      [
        { text: 'Spam', onPress: () => submitReport(postId, 'spam') },
        { text: 'Harassment', onPress: () => submitReport(postId, 'harassment') },
        { text: 'Inappropriate Content', onPress: () => submitReport(postId, 'nudity') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, []);

  const submitReport = useCallback(async (postId: string, reason: ReportReason) => {
    try {
      await reportContent(db, MOCK_USER_ID, postId, 'post', reason);
      Alert.alert('Reported', 'Thank you for helping keep Avalo safe');
    } catch (error) {
      console.error('Error reporting post:', error);
      Alert.alert('Error', 'Failed to submit report');
    }
  }, []);

  const handleProfilePress = useCallback((userId: string) => {
    router.push(`/profile/${userId}` as any);
  }, [router]);

  const handleCreatorPress = useCallback((userId: string) => {
    router.push(`/profile/${userId}` as any);
  }, [router]);

  const handleEventPress = useCallback((eventId: string) => {
    router.push(`/events/${eventId}` as any);
  }, [router]);

  const handleCTAPress = useCallback((route: string) => {
    router.push(route as any);
  }, [router]);

  const handleAICompanionPress = useCallback((companionId: string) => {
    router.push(`/ai/profile/${companionId}` as any);
  }, [router]);

  // PACK 279D - Inject AI companions every 5th position
  const feedItemsWithAI = useCallback(() => {
    const combinedItems: (FeedItem | AICompanionFeedItem)[] = [];
    let aiIndex = 0;

    items.forEach((item, index) => {
      combinedItems.push(item);

      // Every 5th position, inject an AI companion tile
      if ((index + 1) % 5 === 0 && aiCompanions.length > 0) {
        const aiCompanion = aiCompanions[aiIndex % aiCompanions.length];
        combinedItems.push(aiCompanion);
        aiIndex++;
      }
    });

    return combinedItems;
  }, [items, aiCompanions]);

  // Render feed item
  const renderItem = useCallback(({ item }: { item: FeedItem | AICompanionFeedItem }) => {
    switch (item.type) {
      case 'user_post':
        return (
          <FeedPost
            post={item.post}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onReport={handleReport}
            onProfilePress={handleProfilePress}
          />
        );

      case 'creator_highlight':
        return (
          <CreatorHighlight
            creators={item.creators}
            onCreatorPress={handleCreatorPress}
          />
        );

      case 'events_near_you':
        return (
          <EventsNearYou
            events={item.events}
            onEventPress={handleEventPress}
          />
        );

      case 'cta_swipe':
      case 'cta_discovery':
      case 'cta_topup':
        return (
          <CTACard
            item={item}
            onPress={() => handleCTAPress(item.actionRoute)}
          />
        );

      // PACK 279D - AI Companion tile
      case 'ai_companion':
        return (
          <AICompanionTile
            companion={(item as AICompanionFeedItem).companion}
            onPress={handleAICompanionPress}
          />
        );

      default:
        return null;
    }
  }, [
    handleLike,
    handleComment,
    handleShare,
    handleSave,
    handleReport,
    handleProfilePress,
    handleCreatorPress,
    handleEventPress,
    handleCTAPress,
    handleAICompanionPress,
  ]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }, [loadingMore]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return null;
  }, [loading]);

  return (
    <View style={styles.container}>
      <AppHeader title="Feed" />
      
      <FlatList
        data={feedItemsWithAI()}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
      />

      <QuickActionButton />
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  emptyList: {
    flexGrow: 1,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
