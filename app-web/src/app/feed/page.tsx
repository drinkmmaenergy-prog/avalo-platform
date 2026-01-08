/**
 * PACK 323 - Feed Page (Web)
 * Main feed view with posts, reels, and stories
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { db, functions } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';

interface FeedItem {
  id: string;
  type: 'post' | 'reel';
  data: any;
}

interface Story {
  id: string;
  ownerUserId: string;
  mediaUrl: string;
  expiresAt: any;
}

export default function FeedPage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
    loadStories();
  }, []);

  const loadFeed = async () => {
    try {
      setLoading(true);

      // Fetch posts
      const postsQuery = query(
        collection(db, 'feedPosts'),
        where('visibility', '==', 'PUBLIC'),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        firestoreLimit(20)
      );

      // Fetch reels
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
        const aTime = a.data.createdAt?.toMillis?.() || 0;
        const bTime = b.data.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setFeedItems(mixed);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStories = async () => {
    try {
      const now = Timestamp.now();
      const storiesQuery = query(
        collection(db, 'feedStories'),
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
    } catch (error) {
      console.error('Error loading stories:', error);
    }
  };

  const handleLike = async (contentId: string, contentType: string) => {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Feed</h1>

        {/* Stories Row */}
        {stories.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex gap-4 overflow-x-auto">
              {stories.map(story => (
                <Link
                  key={story.id}
                  href={`/feed/story/${story.ownerUserId}`}
                  className="flex-shrink-0"
                >
                  <div className="w-20 h-20 rounded-full ring-4 ring-purple-600 ring-offset-2 overflow-hidden cursor-pointer hover:scale-105 transition-transform">
                    <Image
                      src={story.mediaUrl}
                      alt="Story"
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Feed Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feedItems.map(item => (
            <div key={item.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              {item.type === 'post' ? (
                <div>
                  {item.data.mediaUrls?.length > 0 && (
                    <Link href={`/feed/post/${item.id}`}>
                      <div className="relative aspect-square cursor-pointer hover:opacity-90 transition-opacity">
                        <Image
                          src={item.data.mediaUrls[0]}
                          alt="Post"
                          fill
                          className="object-cover"
                        />
                      </div>
                    </Link>
                  )}
                  <div className="p-4">
                    <p className="text-gray-800 mb-3">{item.data.caption}</p>
                    <div className="flex gap-4 text-gray-600">
                      <button
                        onClick={() => handleLike(item.id, 'FEED_POST')}
                        className="hover:text-red-500 transition-colors"
                      >
                        {item.data.liked ? '❤️' : '🤍'} {item.data.likes || 0}
                      </button>
                      <Link
                        href={`/feed/post/${item.id}`}
                        className="hover:text-purple-600 transition-colors"
                      >
                        💬 {item.data.comments || 0}
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <Link href={`/feed/reel/${item.id}`}>
                  <div className="relative aspect-[9/16] cursor-pointer group">
                    <Image
                      src={item.data.thumbnailUrl || item.data.videoUrl}
                      alt="Reel"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
                      <div className="text-white text-4xl opacity-0 group-hover:opacity-100 transition-opacity">
                        ▶️
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                      <p className="text-white text-sm">{item.data.caption}</p>
                      <div className="flex gap-3 text-white text-xs mt-2">
                        <span>👁️ {item.data.views || 0}</span>
                        <span>❤️ {item.data.likes || 0}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>

        {feedItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No posts yet. Be the first to share!</p>
          </div>
        )}
      </div>
    </div>
  );
}