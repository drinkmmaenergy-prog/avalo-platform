'use client';

/**
 * ActiveLivesBanner — FIX 57B
 *
 * Horizontal scrollable row of live creator avatars with LIVE badge.
 * Listens in real-time to the `active_lives` collection for creators
 * the current user follows.
 *
 * Usage:
 *   <ActiveLivesBanner uid={currentUserId} />
 *
 * Placed at the top of /feed and /discover pages.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Reads from `follows` collection (followerId == uid) to get followed IDs.
 *   - Listens to `active_lives` collection where hostId is in followed IDs.
 *   - Firestore 'in' query supports max 30 items — sliced to 30.
 *   - Self-contained component; does NOT modify existing feed/discover logic.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

interface ActiveLive {
  sessionId: string;
  hostId: string;
  hostName: string;
  hostPhotoURL: string;
  title: string;
}

interface ActiveLivesBannerProps {
  uid: string | null;
}

export default function ActiveLivesBanner({ uid }: ActiveLivesBannerProps) {
  const [activeLives, setActiveLives] = useState<ActiveLive[]>([]);

  useEffect(() => {
    if (!uid) return;

    let unsubscribe: (() => void) | undefined;
    let active = true;

    const loadLives = async () => {
      try {
        const db = requireDb();

        // Get list of followed user IDs
        const followsSnap = await getDocs(
          query(collection(db, 'follows'), where('followerId', '==', uid))
        );
        const followedIds = followsSnap.docs.map((d) => d.data().followeeId as string);
        if (!active || followedIds.length === 0) return;

        // Firestore 'in' query supports max 30 items
        const idsToQuery = followedIds.slice(0, 30);

        unsubscribe = onSnapshot(
          query(collection(db, 'active_lives'), where('hostId', 'in', idsToQuery)),
          (snap) => {
            if (!active) return;
            setActiveLives(
              snap.docs.map((d) => {
                const data = d.data();
                return {
                  sessionId: data.sessionId || d.id,
                  hostId: data.hostId || d.id,
                  hostName: data.hostName || '',
                  hostPhotoURL: data.hostPhotoURL || '',
                  title: data.title || '',
                };
              })
            );
          },
          (error) => {
            if (error?.code !== 'permission-denied') {
              console.error('[ActiveLivesBanner] Snapshot error:', error);
            }
          }
        );
      } catch (err) {
        console.debug('[ActiveLivesBanner] Load error:', err);
      }
    };

    loadLives();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [uid]);

  if (activeLives.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-3 mb-4">
      <div className="flex gap-3">
        {activeLives.map((live) => (
          <Link
            href={`/live/${live.sessionId}`}
            key={live.hostId}
            className="flex-shrink-0 w-20 text-center group"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full mx-auto overflow-hidden ring-2 ring-red-500 ring-offset-2 dark:ring-offset-gray-900">
                {live.hostPhotoURL ? (
                  <img
                    src={live.hostPhotoURL}
                    alt={live.hostName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-lg">
                    {live.hostName?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                LIVE
              </span>
            </div>
            <p className="text-xs mt-1 truncate text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
              {live.hostName}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
