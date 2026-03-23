/**
 * FIX 101: Frontend Rate Limiting Utilities
 *
 * At 100M+ users, Firestore reads EXPLODE without client-side throttling.
 * These utilities provide cost protection at scale:
 *
 *   A) useDebounce — debounce search input (300ms default)
 *   B) useThrottle — throttle scroll-to-load (2s default)
 *   C) profileCache — shared in-memory profile lookup cache
 *   D) ListenerManager — max 5 active onSnapshot listeners
 *   E) batchWriteHelper — batch Firestore writes for bulk ops
 *
 * PACK domain: discovery-search (cost protection).
 * INVARIANT: These are purely additive utilities — no existing code depends on them.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { getDoc, doc, writeBatch, type Firestore } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

// ============================================================================
// A) DEBOUNCE HOOK — for search input / autocomplete
// ============================================================================

/**
 * React hook: returns a debounced version of the callback.
 * @param callback The function to debounce
 * @param delayMs  Delay in milliseconds (default 300)
 */
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delayMs = 300,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callback(...args);
      }, delayMs);
    },
    [callback, delayMs],
  ) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}

/**
 * React hook: returns a debounced value.
 * Useful for search text that triggers queries.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// ============================================================================
// B) THROTTLE HOOK — for discovery scrolling / infinite load
// ============================================================================

/**
 * React hook: returns a throttled callback.
 * Won't fire more often than once per `intervalMs`.
 * @param callback   The function to throttle
 * @param intervalMs Minimum interval between calls (default 2000)
 */
export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  intervalMs = 2000,
): T {
  const lastCallRef = useRef(0);

  const throttled = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCallRef.current < intervalMs) return;
      lastCallRef.current = now;
      callback(...args);
    },
    [callback, intervalMs],
  ) as T;

  return throttled;
}

// ============================================================================
// C) PROFILE CACHE — don't re-fetch same profile from Firestore
// ============================================================================

const _profileCache = new Map<string, any>();

/**
 * In-memory profile cache.
 * Avoids redundant Firestore reads when navigating between screens.
 */
export const profileCache = {
  /** Get cached profile or fetch from Firestore. */
  async get(uid: string): Promise<any | null> {
    if (_profileCache.has(uid)) return _profileCache.get(uid);

    try {
      const snap = await getDoc(doc(requireDb(), 'public_profiles', uid));
      const data = snap.exists() ? snap.data() : null;
      if (data) _profileCache.set(uid, data);
      return data;
    } catch {
      return null;
    }
  },

  /** Check if a profile is already cached. */
  has(uid: string): boolean {
    return _profileCache.has(uid);
  },

  /** Manually set a profile in cache (e.g., from a batch query). */
  set(uid: string, data: any): void {
    _profileCache.set(uid, data);
  },

  /** Invalidate a specific profile (e.g., after editing own profile). */
  invalidate(uid: string): void {
    _profileCache.delete(uid);
  },

  /** Clear all cached profiles. */
  clear(): void {
    _profileCache.clear();
  },

  /** Current cache size. */
  get size(): number {
    return _profileCache.size;
  },
};

// ============================================================================
// D) LISTENER MANAGER — max N active onSnapshot listeners
// ============================================================================

type Unsubscribe = () => void;

/**
 * Manages onSnapshot listeners with a maximum cap.
 * When a new listener is added beyond the limit, the oldest is unsubscribed.
 */
export class ListenerManager {
  private listeners: { key: string; unsub: Unsubscribe }[] = [];
  private maxListeners: number;

  constructor(maxListeners = 5) {
    this.maxListeners = maxListeners;
  }

  /**
   * Add a new listener. Returns its unsubscribe function.
   * If at capacity, the oldest listener is automatically unsubscribed.
   */
  add(key: string, unsub: Unsubscribe): Unsubscribe {
    // Remove existing listener with same key (prevent duplicates)
    this.remove(key);

    // Evict oldest if at capacity
    while (this.listeners.length >= this.maxListeners) {
      const oldest = this.listeners.shift();
      if (oldest) {
        try { oldest.unsub(); } catch { /* ignore */ }
      }
    }

    this.listeners.push({ key, unsub });

    // Return a cleanup function that removes this specific listener
    return () => this.remove(key);
  }

  /** Remove and unsubscribe a specific listener by key. */
  remove(key: string): void {
    const idx = this.listeners.findIndex(l => l.key === key);
    if (idx !== -1) {
      const [removed] = this.listeners.splice(idx, 1);
      try { removed.unsub(); } catch { /* ignore */ }
    }
  }

  /** Unsubscribe all listeners. */
  clear(): void {
    for (const l of this.listeners) {
      try { l.unsub(); } catch { /* ignore */ }
    }
    this.listeners = [];
  }

  /** Current number of active listeners. */
  get count(): number {
    return this.listeners.length;
  }
}

/** Shared singleton listener manager — 5 max active listeners. */
export const listenerManager = new ListenerManager(5);

// ============================================================================
// E) BATCH WRITE HELPER — for bulk Firestore mutations
// ============================================================================

/**
 * Execute multiple Firestore set/update/delete operations in a single batch.
 * Firestore limits batches to 500 operations.
 *
 * @param operations Array of batch operations to execute
 * @returns Promise resolving when batch is committed
 *
 * Usage:
 *   await batchWrite([
 *     { type: 'set', ref: doc(db, 'notifications', id), data: { read: true } },
 *     { type: 'update', ref: doc(db, 'users', uid), data: { notifCount: 0 } },
 *     { type: 'delete', ref: doc(db, 'temp', id) },
 *   ]);
 */
export async function batchWrite(
  operations: Array<
    | { type: 'set'; ref: any; data: Record<string, any>; options?: { merge?: boolean } }
    | { type: 'update'; ref: any; data: Record<string, any> }
    | { type: 'delete'; ref: any }
  >,
): Promise<void> {
  if (operations.length === 0) return;

  const db = requireDb();
  const MAX_PER_BATCH = 500;

  // Split into chunks of 500
  for (let i = 0; i < operations.length; i += MAX_PER_BATCH) {
    const chunk = operations.slice(i, i + MAX_PER_BATCH);
    const batch = writeBatch(db);

    for (const op of chunk) {
      switch (op.type) {
        case 'set':
          batch.set(op.ref, op.data, op.options || {});
          break;
        case 'update':
          batch.update(op.ref, op.data);
          break;
        case 'delete':
          batch.delete(op.ref);
          break;
      }
    }

    await batch.commit();
  }
}

/**
 * Convenience: mark all notification documents as read in a single batch.
 *
 * @param notificationRefs Array of Firestore DocumentReference objects
 */
export async function markAllNotificationsRead(
  notificationRefs: any[],
): Promise<void> {
  await batchWrite(
    notificationRefs.map(ref => ({
      type: 'update' as const,
      ref,
      data: { read: true },
    })),
  );
}
