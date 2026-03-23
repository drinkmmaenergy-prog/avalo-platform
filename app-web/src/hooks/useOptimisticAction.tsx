'use client';

/**
 * useOptimisticAction — FIX 116
 *
 * Generic hook for optimistic UI updates. Applies the optimistic state
 * immediately, then runs the async action. Reverts on error.
 *
 * Also provides specialised helpers:
 *   - useOptimisticLike()  — instant like/unlike toggle
 *   - useOptimisticSend()  — instant message with sending/sent/failed status
 *   - useOptimisticToggle() — instant follow/unfollow toggle
 */

import React, { useCallback, useRef, useState } from 'react';

/* ─── Generic Optimistic Action ─────────────────────────────────────── */

interface UseOptimisticActionOptions<T> {
  /** Current state value. */
  initial: T;
  /** Function that computes the optimistic (immediate) state. */
  optimistic: (current: T) => T;
  /** Async action to execute after optimistic update. */
  action: (current: T) => Promise<void>;
  /** Optional: compute the rollback state (defaults to pre-optimistic value). */
  rollback?: (current: T) => T;
}

export function useOptimisticAction<T>({
  initial,
  optimistic,
  action,
  rollback,
}: UseOptimisticActionOptions<T>) {
  const [state, setState] = useState<T>(initial);
  const prevRef = useRef<T>(initial);

  const execute = useCallback(async () => {
    const before = state;
    prevRef.current = before;

    // Apply optimistic update immediately
    const next = optimistic(before);
    setState(next);

    try {
      await action(next);
    } catch {
      // Revert on failure
      setState(rollback ? rollback(before) : before);
    }
  }, [state, optimistic, action, rollback]);

  return { state, setState, execute };
}

/* ─── Like / Unlike ─────────────────────────────────────────────────── */

export function useOptimisticLike() {
  const [likedProfiles, setLikedProfiles] = useState<Set<string>>(new Set());

  const toggleLike = useCallback(
    async (targetId: string, likeAction: (targetId: string) => Promise<void>) => {
      const wasLiked = likedProfiles.has(targetId);

      // Optimistic: toggle immediately
      setLikedProfiles((prev) => {
        const next = new Set(prev);
        if (wasLiked) {
          next.delete(targetId);
        } else {
          next.add(targetId);
        }
        return next;
      });

      try {
        await likeAction(targetId);
      } catch {
        // Revert on error
        setLikedProfiles((prev) => {
          const next = new Set(prev);
          if (wasLiked) {
            next.add(targetId);
          } else {
            next.delete(targetId);
          }
          return next;
        });
      }
    },
    [likedProfiles]
  );

  return { likedProfiles, setLikedProfiles, toggleLike };
}

/* ─── Send Message ──────────────────────────────────────────────────── */

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface OptimisticMessage {
  id: string;
  content: string;
  senderId: string;
  status: MessageStatus;
  createdAt: Date;
  mediaURL?: string;
  [key: string]: unknown;
}

export function useOptimisticMessages() {
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);

  const sendOptimistic = useCallback(
    async (
      content: string,
      senderId: string,
      sendAction: (tempMsg: OptimisticMessage) => Promise<string | null>
    ) => {
      const tempId = `temp_${Date.now()}`;
      const tempMsg: OptimisticMessage = {
        id: tempId,
        content,
        senderId,
        status: 'sending',
        createdAt: new Date(),
      };

      // Show immediately
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const realId = await sendAction(tempMsg);
        // Replace temp message with real one
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, id: realId || tempId, status: 'sent' as const } : m
          )
        );
      } catch {
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
        );
      }

      return tempId;
    },
    []
  );

  const retrySend = useCallback(
    async (
      msgId: string,
      sendAction: (msg: OptimisticMessage) => Promise<string | null>
    ) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'sending' as const } : m))
      );

      try {
        const realId = await sendAction(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, id: realId || msgId, status: 'sent' as const } : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' as const } : m))
        );
      }
    },
    [messages]
  );

  return { messages, setMessages, sendOptimistic, retrySend };
}

/* ─── Follow / Unfollow Toggle ──────────────────────────────────────── */

export function useOptimisticToggle() {
  const [activeSet, setActiveSet] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    async (id: string, action: (id: string, isActive: boolean) => Promise<void>) => {
      const wasActive = activeSet.has(id);

      // Optimistic toggle
      setActiveSet((prev) => {
        const next = new Set(prev);
        if (wasActive) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

      try {
        await action(id, !wasActive);
      } catch {
        // Revert
        setActiveSet((prev) => {
          const next = new Set(prev);
          if (wasActive) {
            next.add(id);
          } else {
            next.delete(id);
          }
          return next;
        });
      }
    },
    [activeSet]
  );

  return { activeSet, setActiveSet, toggle };
}

/* ─── Message Status Indicator ──────────────────────────────────────── */

/**
 * Render inline status indicator for optimistic messages.
 * Usage: <MessageStatusIndicator status={msg.status} onRetry={() => retrySend(msg.id, ...)} />
 */
export function MessageStatusIndicator({
  status,
  onRetry,
}: {
  status: MessageStatus;
  onRetry?: () => void;
}) {
  if (status === 'sending') {
    return <span className="text-[9px] text-gray-400 ml-1">{'\u23F3'}</span>;
  }
  if (status === 'failed') {
    return (
      <span
        className="text-[9px] text-red-400 cursor-pointer ml-1"
        onClick={onRetry}
        role="button"
        tabIndex={0}
      >
        {'\u26A0\uFE0F'} Retry
      </span>
    );
  }
  return null;
}
