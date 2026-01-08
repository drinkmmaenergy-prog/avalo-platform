/**
 * PACK 270 - Feed Page (Web)
 * Main content feed for web application
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { FeedService, likePost, unlikePost, savePost, reportContent } from '../../../shared/services/feedService';
import type { FeedItem, ReportReason } from '../../../shared/types/feed';
import { FeedPost } from '@/components/feed/FeedPost';
import { CreatorHighlight } from '@/components/feed/CreatorHighlight';
import { EventsNearYou } from '@/components/feed/EventsNearYou';
import { CTACard } from '@/components/feed/CTACard';

const MOCK_USER_ID = 'current_user_123'; // TODO: Get from auth context

export default function FeedPage() {
  const [feedService] = useState(() => new FeedService(db));
  
  // State
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

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
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [feedService]);

  // Initial load
  useEffect(() => {
    loadFeed(1);
    
    return () => {
      feedService.cleanup();
    };
  }, [loadFeed, feedService]);

  // Infinite scroll detection
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500 &&
        !loadingMore &&
        hasMore &&
        !loading
      ) {
        loadFeed(page + 1);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, loading, page, loadFeed]);

  // Engagement actions
  const handleLike = useCallback(async (postId: string) => {
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
      loadFeed(1, true);
    }
  }, [items, loadFeed]);

  const handleComment = useCallback((postId: string) => {
    window.location.href = `/feed/post/${postId}`;
  }, []);

  const handleShare = useCallback((postId: string) => {
    alert('Share functionality coming soon!');
  }, []);

  const handleSave = useCallback(async (postId: string) => {
    try {
      await savePost(db, MOCK_USER_ID, postId);
      alert('Post saved to your collection');
    } catch (error) {
      console.error('Error saving post:', error);
    }
  }, []);

  const handleReport = useCallback((postId: string, reason: ReportReason) => {
    reportContent(db, MOCK_USER_ID, postId, 'post', reason)
      .then(() => alert('Thank you for helping keep Avalo safe'))
      .catch(err => console.error('Error reporting:', err));
  }, []);

  // Render feed item
  const renderItem = (item: FeedItem) => {
    switch (item.type) {
      case 'user_post':
        return (
          <FeedPost
            key={item.id}
            post={item.post}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onReport={handleReport}
          />
        );

      case 'creator_highlight':
        return (
          <CreatorHighlight
            key={item.id}
            creators={item.creators}
          />
        );

      case 'events_near_you':
        return (
          <EventsNearYou
            key={item.id}
            events={item.events}
          />
        );

      case 'cta_swipe':
      case 'cta_discovery':
      case 'cta_topup':
        return (
          <CTACard
            key={item.id}
            item={item}
          />
        );

      default:
        return null;
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8">
        {/* Header */}
        <div className="px-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Feed</h1>
        </div>

        {/* Feed Items */}
        <div className="space-y-4">
          {items.map(renderItem)}
        </div>

        {/* Loading More */}
        {loadingMore && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        {/* No More Items */}
        {!hasMore && items.length > 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">You're all caught up! 🎉</p>
          </div>
        )}

        {/* Empty State */}
        {items.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📰</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No posts yet</h2>
            <p className="text-gray-600">Start following people to see their posts here</p>
          </div>
        )}
      </div>
    </div>
  );
}