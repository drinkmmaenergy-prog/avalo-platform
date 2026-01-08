/**
 * PACK 51 — Discovery Feed Screen
 * Scrollable feed of personalized profiles with monetization funnel
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Text,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { DiscoveryCard } from '../../components/discovery/DiscoveryCard';
import { useTranslation } from 'react-i18next';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface DiscoveryFeedItem {
  userId: string;
  name: string;
  age: number;
  distanceKm: number | null;
  avatarUrl: string | null;
  mediaPreviewUrls: string[];
  royalTier: string | null;
  isHighRisk: boolean;
}

interface DiscoveryFeedResponse {
  ok: boolean;
  items: DiscoveryFeedItem[];
  nextCursor: string | null;
}

const CACHE_KEY = 'discovery_feed_cache_v1_';
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

export const DiscoveryFeedScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<DiscoveryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load cached feed from AsyncStorage
   */
  const loadCachedFeed = useCallback(async () => {
    if (!user?.uid) return null;

    try {
      const cacheKey = `${CACHE_KEY}${user.uid}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (!cached) return null;

      const { items: cachedItems, timestamp } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_EXPIRY;

      if (isExpired) {
        await AsyncStorage.removeItem(cacheKey);
        return null;
      }

      return cachedItems;
    } catch (error) {
      console.error('[DiscoveryFeed] Error loading cache:', error);
      return null;
    }
  }, [user?.uid]);

  /**
   * Save feed to AsyncStorage cache
   */
  const saveFeedToCache = useCallback(async (feedItems: DiscoveryFeedItem[]) => {
    if (!user?.uid) return;

    try {
      const cacheKey = `${CACHE_KEY}${user.uid}`;
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          items: feedItems,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('[DiscoveryFeed] Error saving cache:', error);
    }
  }, [user?.uid]);

  /**
   * Fetch discovery feed from backend
   */
  const fetchFeed = useCallback(async (cursor?: string | null) => {
    if (!user?.uid) return;

    try {
      const functions = getFunctions();
      const getDiscoveryFeed = httpsCallable<
        { userId: string; cursor?: string; limit?: number },
        DiscoveryFeedResponse
      >(functions, 'discovery_getFeed');

      const result = await getDiscoveryFeed({
        userId: user.uid,
        cursor: cursor || undefined,
        limit: 20,
      });

      if (!result.data.ok) {
        throw new Error('Failed to fetch discovery feed');
      }

      return result.data;
    } catch (error: any) {
      console.error('[DiscoveryFeed] Error fetching feed:', error);
      throw error;
    }
  }, [user?.uid]);

  /**
   * Load initial feed (with cache fallback)
   */
  const loadInitialFeed = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      // Try to load from cache first
      const cachedItems = await loadCachedFeed();
      if (cachedItems && cachedItems.length > 0) {
        setItems(cachedItems);
        setLoading(false);
        // Still fetch fresh data in background
        fetchFeed().then((response) => {
          if (response) {
            setItems(response.items);
            setNextCursor(response.nextCursor);
            saveFeedToCache(response.items);
          }
        });
        return;
      }

      // No cache, fetch from network
      const response = await fetchFeed();
      if (response) {
        setItems(response.items);
        setNextCursor(response.nextCursor);
        await saveFeedToCache(response.items);
      }
    } catch (error: any) {
      setError(error.message || t('discovery.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [user?.uid, loadCachedFeed, fetchFeed, saveFeedToCache, t]);

  /**
   * Refresh feed (pull-to-refresh)
   */
  const handleRefresh = useCallback(async () => {
    if (!user?.uid) return;

    setRefreshing(true);
    setError(null);

    try {
      const response = await fetchFeed();
      if (response) {
        setItems(response.items);
        setNextCursor(response.nextCursor);
        await saveFeedToCache(response.items);
      }
    } catch (error: any) {
      setError(error.message || t('discovery.errorLoading'));
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid, fetchFeed, saveFeedToCache, t]);

  /**
   * Load more items (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;

    setLoadingMore(true);

    try {
      const response = await fetchFeed(nextCursor);
      if (response) {
        setItems((prev) => [...prev, ...response.items]);
        setNextCursor(response.nextCursor);
      }
    } catch (error: any) {
      console.error('[DiscoveryFeed] Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, loading, fetchFeed]);

  /**
   * Record profile view event
   */
  const recordProfileView = useCallback(async (targetUserId: string) => {
    if (!user?.uid) return;

    try {
      const functions = getFunctions();
      const recordEvent = httpsCallable(functions, 'recordPersonalizationEvent');
      
      await recordEvent({
        userId: user.uid,
        type: 'PROFILE_VIEW',
        targetUserId,
      });
    } catch (error) {
      console.error('[DiscoveryFeed] Error recording profile view:', error);
      // Non-blocking error
    }
  }, [user?.uid]);

  /**
   * Handle card visibility (debounced profile view recording)
   */
  const handleCardVisible = useCallback((item: DiscoveryFeedItem) => {
    recordProfileView(item.userId);
  }, [recordProfileView]);

  // Load initial feed on mount
  useEffect(() => {
    loadInitialFeed();
  }, [loadInitialFeed]);

  // Render loading state
  if (loading && items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>{t('discovery.loading')}</Text>
      </View>
    );
  }

  // Render error state
  if (error && items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Render empty state
  if (items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>{t('discovery.empty')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <DiscoveryCard
            item={item}
            onVisible={() => handleCardVisible(item)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContent: {
    paddingVertical: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
