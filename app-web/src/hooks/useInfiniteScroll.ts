'use client';

/**
 * useInfiniteScroll — FIX 115
 *
 * Virtual scrolling / infinite scroll hook for large Firestore collections.
 * Uses IntersectionObserver on a sentinel element to trigger loading
 * the next page. Throttles loads to max 1 per 2 seconds.
 *
 * Usage:
 *   const { items, loading, hasMore, sentinelRef } = useInfiniteScroll(
 *     'posts',
 *     [orderBy('createdAt', 'desc')],
 *     20
 *   );
 *
 *   {items.map((item, i) => (
 *     <div key={item.id} ref={i === items.length - 1 ? sentinelRef : undefined}>
 *       <PostCard post={item} />
 *     </div>
 *   ))}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

export interface InfiniteScrollResult<T = Record<string, unknown>> {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  /** Attach to the last rendered element to trigger next page load. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Manually trigger the next page load. */
  loadMore: () => Promise<void>;
  /** Reset the list (e.g. when filters change). */
  reset: () => void;
}

export function useInfiniteScroll<T = Record<string, unknown>>(
  collectionPath: string,
  constraints: QueryConstraint[],
  pageSize: number = 20
): InfiniteScrollResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const throttleRef = useRef(0);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    // Throttle: max 1 load per 2 seconds
    if (Date.now() - throttleRef.current < 2000) return;
    if (!hasMore || loadingRef.current) return;

    throttleRef.current = Date.now();
    loadingRef.current = true;
    setLoading(true);

    try {
      const db = requireDb();
      const baseConstraints = [...constraints];

      const q = lastDocRef.current
        ? query(
            collection(db, collectionPath),
            ...baseConstraints,
            startAfter(lastDocRef.current),
            limit(pageSize)
          )
        : query(collection(db, collectionPath), ...baseConstraints, limit(pageSize));

      const snap = await getDocs(q);
      const newItems = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));

      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length === pageSize);
      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('[useInfiniteScroll] Load more failed:', err);
    }

    loadingRef.current = false;
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, hasMore, pageSize]);

  // Sentinel ref — attach to last rendered item
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: '200px' }
      );
      observerRef.current.observe(node);
    },
    [loadMore, hasMore]
  );

  // Reset helper — call when filters change
  const reset = useCallback(() => {
    setItems([]);
    setHasMore(true);
    setLoading(true);
    lastDocRef.current = null;
    loadingRef.current = false;
    throttleRef.current = 0;
  }, []);

  // Initial load
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  return { items, loading, hasMore, sentinelRef, loadMore, reset };
}
