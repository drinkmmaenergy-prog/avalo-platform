'use client';

/**
 * Live Session Page — Real-time text chat room with gift economy
 * Route: /live/[sessionId]
 *
 * FIX 41: Text-based live chat room where:
 *   - Creator "goes live" — starts a live session
 *   - Fans join the room and see messages in real-time
 *   - Fans send gifts (tokens) that appear as animations
 *   - Creator sees gift total in real-time
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Live session document schema: { hostId, hostName, hostPhotoURL, title,
 *       status, viewerCount, totalGiftsTokens, createdAt, endedAt }
 *   - Messages stored in subcollection: live_sessions/{sessionId}/messages/{msgId}
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

// ============================================================================
// GIFT OPTIONS — token-priced gift economy
// ============================================================================

const GIFT_OPTIONS = [
  { id: 'heart', emoji: '❤️', name: 'Heart', tokens: 1 },
  { id: 'star', emoji: '⭐', name: 'Star', tokens: 5 },
  { id: 'fire', emoji: '🔥', name: 'Fire', tokens: 10 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', tokens: 25 },
  { id: 'crown', emoji: '👑', name: 'Crown', tokens: 50 },
  { id: 'rocket', emoji: '🚀', name: 'Rocket', tokens: 100 },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function LiveSessionPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { user, firebaseUser } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [totalGifts, setTotalGifts] = useState(0);
  const [giftAnimation, setGiftAnimation] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUserId = firebaseUser?.uid || user?.uid || null;
  const isHost = session?.hostId === currentUserId;

  // ==========================================================================
  // Load session (real-time)
  // ==========================================================================
  useEffect(() => {
    if (!sessionId) return;
    const db = requireDb();
    const unsub = onSnapshot(doc(db, 'live_sessions', sessionId as string), (snap) => {
      if (snap.exists()) {
        setSession(snap.data());
        setViewerCount(snap.data().viewerCount || 0);
        setTotalGifts(snap.data().totalGiftsTokens || 0);
      }
    });
    return unsub;
  }, [sessionId]);

  // ==========================================================================
  // Load messages (real-time)
  // ==========================================================================
  useEffect(() => {
    if (!sessionId) return;
    const db = requireDb();
    const q = query(
      collection(db, 'live_sessions', sessionId as string, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return unsub;
  }, [sessionId]);

  // ==========================================================================
  // Join/leave tracking
  // ==========================================================================
  useEffect(() => {
    if (!sessionId || !currentUserId) return;
    const db = requireDb();
    updateDoc(doc(db, 'live_sessions', sessionId as string), {
      viewerCount: increment(1),
    }).catch(() => {});

    return () => {
      updateDoc(doc(db, 'live_sessions', sessionId as string), {
        viewerCount: increment(-1),
      }).catch(() => {});
    };
  }, [sessionId, currentUserId]);

  // ==========================================================================
  // Send message
  // ==========================================================================
  const sendMessage = async () => {
    if (!newMsg.trim() || !currentUserId) return;
    const db = requireDb();
    const displayName =
      firebaseUser?.displayName || user?.displayName || 'User';

    await addDoc(collection(db, 'live_sessions', sessionId as string, 'messages'), {
      userId: currentUserId,
      userName: displayName,
      type: 'message',
      content: newMsg,
      timestamp: serverTimestamp(),
    });
    setNewMsg('');
  };

  // ==========================================================================
  // Send gift
  // ==========================================================================
  const sendGift = async (gift: (typeof GIFT_OPTIONS)[0]) => {
    if (!currentUserId) return;
    const db = requireDb();

    // Check balance
    const walletSnap = await getDoc(doc(db, 'wallets', currentUserId));
    const balance =
      walletSnap.data()?.tokensBalance ??
      walletSnap.data()?.tokenBalance ??
      walletSnap.data()?.balance ??
      walletSnap.data()?.tokens ??
      0;

    if (balance < gift.tokens) {
      alert('Insufficient tokens!');
      return;
    }

    const displayName =
      firebaseUser?.displayName || user?.displayName || 'User';

    // Send gift message
    await addDoc(collection(db, 'live_sessions', sessionId as string, 'messages'), {
      userId: currentUserId,
      userName: displayName,
      type: 'gift',
      giftEmoji: gift.emoji,
      giftName: gift.name,
      giftTokens: gift.tokens,
      timestamp: serverTimestamp(),
    });

    // Update total gifts
    await updateDoc(doc(db, 'live_sessions', sessionId as string), {
      totalGiftsTokens: increment(gift.tokens),
    });

    // Show animation
    setGiftAnimation(gift.emoji);
    setTimeout(() => setGiftAnimation(null), 2000);

    // NOTE: Token deduction should be handled via Cloud Function.
    // The gift is recorded; backend scheduled job or trigger handles wallet deduction.
  };

  // ==========================================================================
  // End session (host only)
  // ==========================================================================
  const endSession = async () => {
    if (!confirm('End live session?')) return;
    const db = requireDb();
    await updateDoc(doc(db, 'live_sessions', sessionId as string), {
      status: 'ended',
      endedAt: serverTimestamp(),
    });

    // FIX 57A: Remove from active_lives so followers stop seeing the LIVE indicator
    if (currentUserId) {
      await deleteDoc(doc(db, 'active_lives', currentUserId)).catch(() => {
        // Silent — best-effort cleanup
      });
    }

    router.push('/profile');
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-sm font-medium">LIVE</span>
          <span className="text-white/60 text-xs">{viewerCount} watching</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 text-sm">💎 {totalGifts} tokens</span>
          {isHost && (
            <button
              onClick={endSession}
              className="px-3 py-1 bg-red-600 text-white rounded-full text-xs"
            >
              End Live
            </button>
          )}
          {!isHost && (
            <button onClick={() => router.back()} className="text-white/60 text-sm">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Host area — placeholder for future video */}
      <div className="flex-shrink-0 h-48 bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-3xl font-bold mx-auto">
            {session?.hostName?.charAt(0) || '?'}
          </div>
          <p className="text-white font-medium mt-2">{session?.hostName || 'Host'}</p>
          <p className="text-white/50 text-xs">{session?.title || 'Live Session'}</p>
        </div>
      </div>

      {/* Gift animation */}
      {giftAnimation && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-6xl animate-bounce z-50">
          {giftAnimation}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${m.type === 'gift' ? 'bg-yellow-500/20 rounded-lg px-2 py-1' : ''}`}
          >
            <span className="text-[#E4458F] text-xs font-medium">{m.userName}</span>
            {m.type === 'gift' ? (
              <span className="text-yellow-300 text-sm ml-1">
                sent {m.giftEmoji} {m.giftName} ({m.giftTokens} tokens)
              </span>
            ) : (
              <span className="text-white text-sm ml-1">{m.content}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input + Gifts */}
      <div className="p-3 bg-black/50">
        {/* Gift buttons */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {GIFT_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => sendGift(g)}
              className="flex-shrink-0 flex flex-col items-center px-3 py-1 bg-white/10 rounded-xl hover:bg-white/20"
            >
              <span className="text-xl">{g.emoji}</span>
              <span className="text-white/60 text-[10px]">{g.tokens}</span>
            </button>
          ))}
        </div>
        {/* Message input */}
        <div className="flex gap-2">
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Say something..."
            className="flex-1 px-3 py-2 bg-white/10 rounded-full text-white text-sm placeholder-white/40 outline-none"
          />
          <button
            onClick={sendMessage}
            className="px-4 py-2 bg-[#E4458F] rounded-full text-white text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
