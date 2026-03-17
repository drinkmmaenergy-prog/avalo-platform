'use client';

/**
 * Chat Hooks — Realtime subscriptions for chat page.
 * Follows the onSnapshot pattern from lib/moderation/realtime.ts.
 *
 * Hooks:
 *   useUserChats(userId)           — Realtime list of user's active chats
 *   useChatMessages(chatId)        — Realtime messages for a chat
 *   useActiveChat(chatId)          — Realtime single chat document
 *   useParticipantProfiles(ids)    — Cached participant profile lookup
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import type { Chat as ServiceChat, ChatMessage } from '@/lib/types';
import {
  subscribeToMessages,
  subscribeToChat,
} from '@/lib/services/chatService';
import sdk from '@/lib/sdk';
import type { User } from '@/types';

// ============================================================================
// useUserChats — Realtime subscription to current user's active chats
// ============================================================================

/**
 * Mirrors the query in chatService.getUserChats but uses onSnapshot for
 * live updates. Follows the same hook shape as useRealtimeIncidents.
 */
export function useUserChats(userId: string | null) {
  const [chats, setChats] = useState<ServiceChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setChats([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(requireDb(), 'chats'),
      where('participants', 'array-contains', userId),
      where('state', '!=', 'CLOSED'),
      orderBy('state'),
      orderBy('lastActivityAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ServiceChat[];
        setChats(items);
        setLoading(false);
      },
      (err) => {
        console.error('[useUserChats] Snapshot error:', err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [userId]);

  return { chats, loading, error };
}

// ============================================================================
// useChatMessages — Realtime messages subscription
// ============================================================================

/**
 * Uses subscribeToMessages from chatService for realtime message updates.
 */
export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsub = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsub();
  }, [chatId]);

  return { messages, loading };
}

// ============================================================================
// useActiveChat — Realtime single chat document
// ============================================================================

/**
 * Uses subscribeToChat from chatService for realtime chat document updates.
 */
export function useActiveChat(chatId: string | null) {
  const [chat, setChat] = useState<ServiceChat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) {
      setChat(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsub = subscribeToChat(chatId, (c) => {
      setChat(c);
      setLoading(false);
    });

    return () => unsub();
  }, [chatId]);

  return { chat, loading };
}

// ============================================================================
// useParticipantProfiles — Cached participant profile lookup
// ============================================================================

/**
 * Fetches and caches participant profiles by UID using sdk.getUserProfile.
 * Only fetches new UIDs that haven't been cached yet.
 */
export function useParticipantProfiles(participantIds: string[]) {
  const [profiles, setProfiles] = useState<Map<string, User>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  // Stable key for dependency tracking
  const idsKey = participantIds.slice().sort().join(',');

  useEffect(() => {
    const toFetch = participantIds.filter(
      (id) => id && !fetchedRef.current.has(id),
    );
    if (toFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      const fetched: Array<[string, User]> = [];

      for (const uid of toFetch) {
        if (cancelled) break;
        try {
          const profile = await sdk.getUserProfile(uid);
          fetched.push([uid, profile]);
          fetchedRef.current.add(uid);
        } catch (err) {
          console.error(`[useParticipantProfiles] Failed to fetch ${uid}:`, err);
        }
      }

      if (!cancelled && fetched.length > 0) {
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const [uid, profile] of fetched) {
            next.set(uid, profile);
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return profiles;
}
