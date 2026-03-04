"use client";

/**
 * PACK 323 - Feed Page (Web)
 * Main feed view with posts, reels, and stories
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { requireDb, requireFunctions } from '@/lib/firebase';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Heart, MessageCircle, Eye, Plus } from 'lucide-react';

interface FeedItem {
  id: string;
  type: 'post' | 'reel';
  data: Record<string, unknown>;
}

interface Story {
  id: string;
  ownerUserId: string;
  mediaUrl: string;
  expiresAt: unknown;
}

export default function FeedPage() {
  const { t } = useI18n();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFeed();
    loadStories();
  }, []);

  const loadFeed = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch posts
      const postsQuery = query(
        collection(requireDb(), 'feedPosts'),
        where('visibility', '==', 'PUBLIC'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        firestoreLimit(20)
      );

      // Fetch reels
      const reelsQuery = query(
        collection(requireDb(), 'feedReels'),
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
        type: 'post',
        data: { id: doc.id, ...doc.data() },
      }));

      const reels: FeedItem[] = reelsSnap.docs.map(doc => ({
        id: doc.id,
        type: 'reel',
        data: { id: doc.id, ...doc.data() },
      }));

      // Mix and sort by time
      const mixed = [...posts, ...reels].sort((a, b) => {
        const aTime = typeof (a.data.createdAt as { toMillis?: () => number })?.toMillis === 'function'
          ? (a.data.createdAt as { toMillis: () => number }).toMillis()
          : 0;
        const bTime = typeof (b.data.createdAt as { toMillis?: () => number })?.toMillis === 'function'
          ? (b.data.createdAt as { toMillis: () => number }).toMillis()
          : 0;
        return bTime - aTime;
      });

      setFeedItems(mixed);
    } catch (err) {
      console.error('Error loading feed:', err);
      setError('Could not load feed. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  };

  const loadStories = async () => {
    try {
      const now = Timestamp.now();
      const storiesQuery = query(
        collection(requireDb(), 'feedStories'),
        where('isDeleted', '==', false),
        where('expiresAt', '>', now),
        orderBy('expiresAt', 'asc'),
        orderBy('createdAt', 'desc'),
        firestoreLimit(20)
      );

      const storiesSnap = await getDocs(storiesQuery);
      const storiesData = storiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Story[];

      setStories(storiesData);
    } catch (err) {
      console.error('Error loading stories:', err);
    }
  };

  const handleLike = async (contentId: string, contentType: string) => {
    try {
      const likeContent = httpsCallable(requireFunctions(), 'pack323_likeContent');
      await likeContent({ contentId, contentType });
      
      // Optimistic update
      setFeedItems(prev => prev.map(item => {
        if (item.id === contentId) {
          return {
            ...item,
            data: {
              ...item.data,
              liked: !(item.data.liked as boolean),
              likes: (item.data.liked as boolean)
                ? ((item.data.likes as number) || 0) - 1
                : ((item.data.likes as number) || 0) + 1,
            },
          };
        }
        return item;
      }));
    } catch (err) {
      console.error('Error liking content:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t('placeholder.feedTitle')}</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {t('placeholder.feedTitle')}
      </h1>

      {/* Stories Row */}
      {stories.length > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex gap-4 overflow-x-auto">
            {stories.map(story => (
              <Link
                key={story.id}
                href={`/feed/story/${story.ownerUserId}`}
                className="flex-shrink-0"
              >
                <div className="w-16 h-16 rounded-full ring-2 ring-primary-500 ring-offset-2 overflow-hidden cursor-pointer hover:scale-105 transition-transform">
                  <Image
                    src={story.mediaUrl}
                    alt="Story"
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-6 mb-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={loadFeed} className="btn btn-outline mt-3 text-sm px-4 py-2">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Feed Grid */}
      {feedItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedItems.map(item => (
            <div key={item.id} className="card overflow-hidden">
              {item.type === 'post' ? (
                <div>
                  {(item.data.mediaUrls as string[])?.length > 0 && (
                    <Link href={`/feed/post/${item.id}`}>
                      <div className="relative aspect-square cursor-pointer hover:opacity-90 transition-opacity">
                        <Image
                          src={(item.data.mediaUrls as string[])[0]}
                          alt="Post"
                          fill
                          className="object-cover"
                        />
                      </div>
                    </Link>
                  )}
                  <div className="p-4">
                    <p className="text-gray-800 dark:text-gray-200 mb-3 text-sm">
                      {item.data.caption as string}
                    </p>
                    <div className="flex gap-4 text-gray-500 dark:text-gray-400 text-sm">
                      <button
                        onClick={() => handleLike(item.id, 'FEED_POST')}
                        className="flex items-center gap-1 hover:text-red-500 transition-colors"
                      >
                        <Heart className={`w-4 h-4 ${(item.data.liked as boolean) ? 'fill-red-500 text-red-500' : ''}`} />
                        {(item.data.likes as number) || 0}
                      </button>
                      <Link
                        href={`/feed/post/${item.id}`}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        {(item.data.comments as number) || 0}
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <Link href={`/feed/reel/${item.id}`}>
                  <div className="relative aspect-[9/16] cursor-pointer group">
                    <Image
                      src={(item.data.thumbnailUrl as string) || (item.data.videoUrl as string) || ''}
                      alt="Reel"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
                      <div className="text-white text-4xl opacity-0 group-hover:opacity-100 transition-opacity">
                        ▶
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                      <p className="text-white text-xs">{item.data.caption as string}</p>
                      <div className="flex gap-3 text-white/80 text-xs mt-1">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {(item.data.views as number) || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> {(item.data.likes as number) || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
            <Plus className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('placeholder.feedTitle')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            {t('placeholder.feedDesc')}
          </p>
        </div>
      )}
    </div>
  );
}


