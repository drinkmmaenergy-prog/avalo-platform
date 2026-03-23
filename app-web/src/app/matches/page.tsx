'use client';

/**
 * Matches Page — /matches
 *
 * FIX 69: Matching system UI with two sections:
 *   1. "Nowe dopasowania" — horizontal scroll of matched profiles with "Pomachaj" button
 *   2. "Konwersacje" — list of active chats from matches
 *
 * Reads from Firestore collections: matches, chats, public_profiles.
 * Uses real-time onSnapshot for conversations.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - matches collection is server-only write (created by likeUserV1).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { MatchCardSkeleton, ConversationSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import WhoLikedMe from '@/components/matches/WhoLikedMe';

// ============================================================================
// HELPERS
// ============================================================================

const formatTimeAgo = (ts: any) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return d.toLocaleDateString([], { weekday: 'short' });
};

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function MatchesPage() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);

  // ── Load matches ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();

    const load = async () => {
      try {
        // Query matches where user is participant (userId1 or userId2)
        const q1 = query(
          collection(db, 'matches'),
          where('userId1', '==', firebaseUser.uid),
          orderBy('matchedAt', 'desc'),
          limit(20)
        );
        const q2 = query(
          collection(db, 'matches'),
          where('userId2', '==', firebaseUser.uid),
          orderBy('matchedAt', 'desc'),
          limit(20)
        );

        const [s1, s2] = await Promise.all([
          getDocs(q1).catch(() => ({ docs: [] })),
          getDocs(q2).catch(() => ({ docs: [] })),
        ]);

        const allMatches = [
          ...s1.docs.map((d) => ({ ...d.data(), otherId: d.data().userId2 })),
          ...s2.docs.map((d) => ({ ...d.data(), otherId: d.data().userId1 })),
        ];

        // Load profiles for each match
        const enriched = await Promise.all(
          allMatches.map(async (m) => {
            const profileSnap = await getDoc(
              doc(db, 'public_profiles', m.otherId)
            ).catch(() => null);
            return { ...m, profile: profileSnap?.data() || null };
          })
        );

        setMatches(enriched.filter((m) => m.profile));
      } catch (err) {
        console.error('[MatchesPage] Load matches error:', err);
      } finally {
        setLoadingMatches(false);
      }
    };

    void load();
  }, [firebaseUser?.uid]);

  // ── Load conversations (chats with messages) — realtime ──────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', firebaseUser.uid),
      orderBy('lastActivityAt', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const chats = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            const otherId = data.participants?.find(
              (p: string) => p !== firebaseUser.uid
            );
            const profileSnap = otherId
              ? await getDoc(doc(db, 'public_profiles', otherId)).catch(
                  () => null
                )
              : null;
            return {
              id: d.id,
              ...data,
              profile: profileSnap?.data(),
              otherId,
            } as any;
          })
        );
        setConversations(
          chats.filter((c) => c.lastMessage || c.freeMessagesRemaining)
        );
      },
      (err) => {
        console.error('[MatchesPage] Conversations snapshot error:', err);
      }
    );

    return unsub;
  }, [firebaseUser?.uid]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-24">
      <h1 className="text-2xl font-bold p-4">Dopasowania</h1>

      {/* FIX 111: Who liked me section — VIP upsell driver */}
      <div className="px-4">
        <WhoLikedMe />
      </div>

      {/* New Matches — horizontal scroll */}
      {loadingMatches ? (
        <div className="px-4 mb-6">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-24 text-center">
                <div className="w-20 h-20 rounded-full mx-auto bg-gray-200 animate-pulse" />
                <div className="h-3 bg-gray-200 rounded mt-2 mx-4 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : matches.length > 0 ? (
        <div className="px-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            Nowe dopasowania
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {matches.map((m) => (
              <div key={m.otherId} className="flex-shrink-0 w-24 text-center">
                <div className="relative">
                  <div className="mx-auto border-2 border-[#E4458F] rounded-full">
                    <Avatar src={m.profile?.photoURL} name={m.profile?.displayName} size={80} />
                  </div>
                  {/* Online indicator */}
                  <div className="absolute bottom-0 right-3 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                </div>
                <p className="text-xs font-medium mt-1 truncate">
                  {m.profile?.displayName}
                </p>
                <button
                  onClick={() => router.push(`/chat/${m.chatId}`)}
                  className="text-[10px] bg-gray-100 rounded-full px-2 py-0.5 mt-0.5 hover:bg-[#E4458F] hover:text-white transition"
                >
                  Pomachaj 👋
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Conversations */}
      <div className="px-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">
          Konwersacje
        </h2>
        {conversations.length === 0 ? (
          <EmptyState
            icon="❤️"
            title="No matches yet"
            description="Like profiles you find interesting. When they like you back — it's a match!"
            actionLabel="Start Swiping"
            actionHref="/discover"
          />
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => router.push(`/chat/${c.id}`)}
              className="flex items-center gap-3 py-3 border-b cursor-pointer hover:bg-gray-50 rounded-lg px-2"
            >
              <div className="relative">
                <Avatar src={c.profile?.photoURL} name={c.profile?.displayName} size={56} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">
                    {c.profile?.displayName || 'User'}
                  </p>
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(c.lastActivityAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {c.lastMessage || 'New match — say hello!'}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <span className="w-5 h-5 bg-[#E4458F] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {c.unreadCount}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
