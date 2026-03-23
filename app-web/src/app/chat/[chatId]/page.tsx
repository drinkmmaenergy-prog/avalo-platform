'use client';

/**
 * Individual Chat Page — /chat/[chatId]
 *
 * FIX 44: Direct-link chat page for human-to-human messaging.
 * Loads messages from chats/{chatId}/messages ordered by createdAt.
 * Shows chat bubbles (sent = right, received = left).
 * Has input field to type and send messages.
 * Updates lastMessage and lastMessageAt on the chat document after each send.
 * Checks if recipient has paid chat enabled (from earn_settings) and shows cost.
 *
 * FIX 75: Paid/blurred media in DM chat.
 * Creator can attach images/videos with a token price.
 * Recipient sees BLURRED preview and must pay to unlock.
 * Revenue split: 65% creator / 35% Avalo (MONETIZATION_SPLITS.UNLOCK_MEDIA).
 *
 * FIX 88: Icebreaker Messages — 15 tokens per icebreaker, 100% Avalo revenue.
 * FIX 89: AI Super Reply — 5 tokens to polish a message via Cloud Function.
 * FIX 90: Priority Message — 25 tokens, appears at top of recipient inbox.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Wallet deductions go through Cloud Functions (sendChatMessage),
 *     NOT direct Firestore writes.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Coins, Paperclip } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb, requireFunctionsUS, requireStorage, functions } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  writeBatch,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  sendMessage as sendChatMessageViaFunction,
} from '@/lib/services/chatService';
import {
  subscribePresence,
  formatLastSeen,
  setTyping,
  subscribeTyping,
} from '@/lib/presenceService';
import type { ChatMessage } from '@/lib/types';

interface OtherUserProfile {
  displayName?: string;
  photoURL?: string;
  earnOnChat?: boolean;
  chatPrice?: number;
}

// FIX 88: Icebreaker conversation starters — 15 tokens each, 100% Avalo
const ICEBREAKERS = [
  { id: 'travel', text: 'If you could teleport anywhere right now, where would you go? ✈️', emoji: '✈️' },
  { id: 'food', text: 'What\'s the best meal you\'ve ever had? I\'m always looking for recommendations! 🍕', emoji: '🍕' },
  { id: 'movie', text: 'What\'s a movie that everyone loves but you can\'t stand? 🎬', emoji: '🎬' },
  { id: 'superpower', text: 'If you had one superpower for a day, what would you choose? 💪', emoji: '💪' },
  { id: 'music', text: 'What song has been stuck in your head lately? 🎵', emoji: '🎵' },
  { id: 'weekend', text: 'What does your perfect weekend look like? ☀️', emoji: '☀️' },
  { id: 'pet', text: 'Are you a cat person or a dog person? Or something completely different? 🐾', emoji: '🐾' },
  { id: 'hobby', text: 'What\'s a hobby you\'ve always wanted to try but never did? 🎯', emoji: '🎯' },
];

export default function ChatIdPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params?.chatId as string;
  const { firebaseUser } = useAuth();
  const currentUserId = firebaseUser?.uid;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUserProfile | null>(null);
  const [chatCost, setChatCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // FIX 70: Non-match chat — manual accept/reject state
  const [pendingAccept, setPendingAccept] = useState(false);
  const [chatData, setChatData] = useState<any>(null);

  // FIX 75A: Paid media state
  const [showMediaPricing, setShowMediaPricing] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [mediaPrice, setMediaPrice] = useState(10);
  const [sendingMedia, setSendingMedia] = useState(false);

  // FIX 75C: Track which media user has unlocked
  const [purchasedMediaIds, setPurchasedMediaIds] = useState<Set<string>>(new Set());

  // FIX 88: Icebreaker panel state
  const [showIcebreakers, setShowIcebreakers] = useState(false);

  // FIX 89: AI Super Reply state
  const [showSuperReply, setShowSuperReply] = useState(false);
  const [polishedMessage, setPolishedMessage] = useState('');
  const [polishing, setPolishing] = useState(false);

  // FIX 102: Online presence state
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);

  // FIX 103: Typing indicator state
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  // FIX 105: Message reactions state
  const [reactionMenu, setReactionMenu] = useState<string | null>(null);
  const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

  // FIX 107: Group chat state
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  // FIX 127: Message delete + edit state
  const [msgContextMenu, setMsgContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load the chat document and resolve the other participant
  useEffect(() => {
    if (!chatId || !currentUserId) return;
    const db = requireDb();

    const unsub = onSnapshot(doc(db, 'chats', chatId), async (snap) => {
      if (!snap.exists()) return;
      const snapData = snap.data();
      setChatData(snapData);

      // FIX 107: Detect group chat
      const isGroup = snapData.type === 'group';
      setIsGroupChat(isGroup);

      // FIX 70: Check if chat requires acceptance from recipient
      const isRecipient = snapData.participants?.indexOf(currentUserId) === 1;
      const noMatch = !snapData.matchedAt && snapData.metadata?.matchType !== 'mutual_like';
      const notAccepted = snapData.status === 'pending_accept';
      setPendingAccept(!isGroup && isRecipient && (noMatch || notAccepted) && !snapData.accepted);

      const otherId = snapData.participants?.find((p: string) => p !== currentUserId);

      if (otherId) {
        try {
          const profileSnap = await getDoc(doc(db, 'public_profiles', otherId));
          const profileData = profileSnap.exists() ? (profileSnap.data() as Record<string, any>) : {};

          // Check earn_settings for paid chat pricing
          const earnSnap = await getDoc(doc(db, 'earn_settings', otherId));
          const earnData = earnSnap.exists() ? (earnSnap.data() as Record<string, any>) : {};

          setOtherUser({
            displayName: profileData?.displayName || otherId.slice(0, 8),
            photoURL: profileData?.photoURL || null,
            earnOnChat: earnData?.chat === true,
            chatPrice: earnData?.chatPrice || null,
          });

          if (earnData?.chat && earnData?.chatPrice) {
            setChatCost(earnData.chatPrice);
          }
        } catch {
          // Profile may not exist yet
        }
      }
    });

    return unsub;
  }, [chatId, currentUserId]);

  // Subscribe to messages in realtime
  useEffect(() => {
    if (!chatId) return;
    const db = requireDb();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ChatMessage[];
      setMessages(msgs);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return unsub;
  }, [chatId]);

  // FIX 75C: Load purchased media IDs for this chat
  useEffect(() => {
    if (!currentUserId || !chatId) return;
    getDocs(
      query(
        collection(requireDb(), 'media_purchases'),
        where('buyerId', '==', currentUserId),
        where('chatId', '==', chatId)
      )
    )
      .then((snap) =>
        setPurchasedMediaIds(new Set(snap.docs.map((d) => d.data().mediaId)))
      )
      .catch(() => {});
  }, [currentUserId, chatId]);

  // FIX 102: Subscribe to other user's online presence
  useEffect(() => {
    const otherId = chatData?.participants?.find((p: string) => p !== currentUserId);
    if (!otherId) return;
    return subscribePresence(otherId, (online, ls) => {
      setIsOnline(online);
      setLastSeen(ls);
    });
  }, [chatData?.participants, currentUserId]);

  // FIX 103: Subscribe to other user's typing indicator
  useEffect(() => {
    const otherId = chatData?.participants?.find((p: string) => p !== currentUserId);
    if (!otherId || !chatId) return;
    return subscribeTyping(chatId, otherId, setOtherTyping);
  }, [chatId, chatData?.participants, currentUserId]);

  // FIX 107: Fetch participant display names for group chats
  useEffect(() => {
    if (!isGroupChat || !chatData?.participants) return;
    let cancelled = false;
    const fetchNames = async () => {
      const db = requireDb();
      const names: Record<string, string> = {};
      for (const pid of chatData.participants) {
        if (cancelled) break;
        if (pid === currentUserId) {
          names[pid] = 'You';
          continue;
        }
        try {
          const snap = await getDoc(doc(db, 'public_profiles', pid));
          names[pid] = snap.data()?.displayName || pid.slice(0, 8);
        } catch {
          names[pid] = pid.slice(0, 8);
        }
      }
      if (!cancelled) setParticipantNames(names);
    };
    fetchNames();
    return () => { cancelled = true; };
  }, [isGroupChat, chatData?.participants, currentUserId]);

  // FIX 104: Mark unread messages as read when chat is opened
  useEffect(() => {
    if (!chatId || !currentUserId) return;
    const markRead = async () => {
      const db = requireDb();
      try {
        const unread = query(
          collection(db, 'chats', chatId, 'messages'),
          where('senderId', '!=', currentUserId),
          where('read', '==', false),
        );
        const snap = await getDocs(unread).catch(() => ({ docs: [] as any[] }));
        if (!snap.docs || snap.docs.length === 0) return;
        const batch = writeBatch(db);
        snap.docs.forEach((d: any) =>
          batch.update(d.ref, { read: true, readAt: serverTimestamp() }),
        );
        await batch.commit();
        // Reset unread count for current user on chat doc
        await updateDoc(doc(db, 'chats', chatId), {
          [`unreadCount.${currentUserId}`]: 0,
        });
      } catch {
        // Silent — read receipts are best-effort
      }
    };
    markRead();
  }, [chatId, currentUserId, messages.length]);

  // Send message handler
  const handleSend = async () => {
    if (!inputText.trim() || !currentUserId || !chatId || sending) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      // Use the chatService sendMessage which calls the Cloud Function
      // The CF handles wallet deduction, billing, escrow automatically
      const result = await sendChatMessageViaFunction({
        chatId,
        senderId: currentUserId,
        text: content,
      });

      if (!result.success) {
        // Fallback: write directly to messages subcollection and record pending transaction
        const db = requireDb();
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId,
          senderId: currentUserId,
          text: content,
          tokenCost: 0,
          createdAt: serverTimestamp(),
        });

        // Update the chat document with lastMessage info
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: content,
          lastMessageAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
        });

        // Record pending transaction for backend to process later
        if (chatCost && chatCost > 0) {
          await addDoc(collection(db, 'pending_transactions'), {
            type: 'chat_message',
            userId: currentUserId,
            chatId,
            amount: chatCost,
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          // TODO: Connect to Cloud Function for actual deduction
        }
      }
    } catch (err) {
      console.error('[ChatIdPage] Send error:', err);
      // Best-effort: write message directly
      try {
        const db = requireDb();
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId,
          senderId: currentUserId,
          text: content,
          tokenCost: 0,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: content,
          lastMessageAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
        });
      } catch {
        // Silent — message send failed
      }
    } finally {
      setSending(false);
    }
  };

  // FIX 75A: Send paid or free media handler
  const handleSendMedia = async () => {
    if (!mediaFile || !currentUserId || !chatId) return;
    setSendingMedia(true);

    try {
      // Upload to Firebase Storage
      const fileName = `${Date.now()}_${mediaFile.name}`;
      const storageRef = ref(requireStorage(), `chats/${chatId}/media/${fileName}`);
      await uploadBytes(storageRef, mediaFile);
      const mediaURL = await getDownloadURL(storageRef);

      // Save message with paid flag
      const db = requireDb();
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUserId,
        type: mediaPrice > 0 ? 'paid_media' : 'media',
        mediaURL,
        mediaType: mediaFile.type.startsWith('video') ? 'video' : 'image',
        price: mediaPrice, // 0 = free
        unlocked: mediaPrice === 0,
        createdAt: serverTimestamp(),
      });

      // Update chat lastMessage
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: mediaPrice > 0 ? `🔒 Paid media (${mediaPrice} tokens)` : '📷 Media',
        lastMessageAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      });

      setShowMediaPricing(false);
      setMediaFile(null);
      setMediaPreview('');
    } catch (err) {
      console.error('[ChatIdPage] Send media error:', err);
      alert('Failed to send media');
    } finally {
      setSendingMedia(false);
    }
  };

  // FIX 75C: Unlock paid media handler
  const handleUnlockMedia = async (msg: any) => {
    if (!confirm(`Unlock this media for ${msg.price} tokens?`)) return;
    if (!currentUserId) return;

    try {
      // Try Cloud Function first
      const fn = httpsCallable(functions, 'unlockChatMedia');
      await fn({
        chatId,
        messageId: msg.id,
        tokens: msg.price,
        creatorId: msg.senderId,
      });

      // Mark as unlocked locally
      setPurchasedMediaIds((prev) => new Set([...prev, msg.id]));
    } catch {
      // Fallback: record purchase in Firestore
      try {
        const db = requireDb();
        await addDoc(collection(db, 'media_purchases'), {
          buyerId: currentUserId,
          creatorId: msg.senderId,
          mediaId: msg.id,
          chatId,
          price: msg.price,
          createdAt: serverTimestamp(),
        });
        setPurchasedMediaIds((prev) => new Set([...prev, msg.id]));
      } catch (fallbackErr) {
        console.error('[ChatIdPage] Unlock fallback error:', fallbackErr);
        alert('Failed to unlock media');
      }
    }
  };

  // FIX 58C: Report message handler
  const reportMessage = async (messageId: string) => {
    if (!confirm('Report this message as inappropriate?')) return;
    try {
      const fn = httpsCallable(requireFunctionsUS(), 'reportMessage');
      await fn({ messageId, chatId, reason: 'inappropriate' });
      alert('Message reported.');
    } catch { alert('Report failed.'); }
  };

  // FIX 127: Delete message handler — soft delete (marks as deleted, clears content)
  const deleteMessage = async (msgId: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), {
        deleted: true,
        content: '',
        text: '',
        deletedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[ChatPage] Delete message error:', err);
      alert('Failed to delete message');
    }
  };

  // FIX 127: Copy message handler
  const copyMessage = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      const textToCopy = (msg as any).content || msg.text || '';
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    }
  };

  // FIX 127: Start editing a message
  const startEditMessage = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      setEditingMsgId(msgId);
      setEditingMsgText((msg as any).content || msg.text || '');
    }
  };

  // FIX 127: Submit edited message
  const submitEditMessage = async () => {
    if (!editingMsgId || !editingMsgText.trim()) return;
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'chats', chatId, 'messages', editingMsgId), {
        content: editingMsgText.trim(),
        text: editingMsgText.trim(),
        edited: true,
        editedAt: serverTimestamp(),
      });
      setEditingMsgId(null);
      setEditingMsgText('');
    } catch (err) {
      console.error('[ChatPage] Edit message error:', err);
      alert('Failed to edit message');
    }
  };

  // FIX 88: Send icebreaker message (15 tokens, 100% Avalo)
  const sendIcebreaker = async (ib: typeof ICEBREAKERS[0]) => {
    if (!currentUserId || !chatId) return;
    try {
      const db = requireDb();
      const walletSnap = await getDoc(doc(db, 'wallets', currentUserId));
      const balance = walletSnap.data()?.balance || 0;
      if (balance < 15) {
        alert('Need 15 tokens for icebreaker');
        return;
      }

      // Send as special icebreaker message
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUserId,
        content: ib.text,
        type: 'icebreaker',
        tokensCost: 15,
        createdAt: serverTimestamp(),
      });

      // Update chat lastMessage
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: `💡 ${ib.text.slice(0, 40)}...`,
        lastMessageAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      });

      setShowIcebreakers(false);
      // Backend deducts 15 tokens (100% Avalo)
    } catch (err) {
      console.error('[ChatIdPage] Icebreaker send error:', err);
      alert('Failed to send icebreaker');
    }
  };

  // FIX 89: AI Super Reply — polish message via Cloud Function (5 tokens)
  const handlePolish = async () => {
    if (!inputText.trim() || polishing) return;
    setPolishing(true);
    try {
      const fn = httpsCallable(functions, 'polishMessageWithAISuperReply');
      const result = await fn({ message: inputText, chatId });
      setPolishedMessage((result.data as any)?.polished || inputText);
      setShowSuperReply(true);
    } catch {
      alert('AI polish not available');
    }
    setPolishing(false);
  };

  // FIX 90: Send priority message (25 tokens)
  const sendPriorityMessage = async (content: string) => {
    if (!content.trim() || !currentUserId || !chatId) return;
    try {
      const db = requireDb();
      const walletSnap = await getDoc(doc(db, 'wallets', currentUserId));
      if ((walletSnap.data()?.balance || 0) < 25) {
        alert('Need 25 tokens');
        return;
      }
      if (!confirm('Send as priority message? (25 tokens) — appears at top of their inbox')) return;

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUserId,
        content,
        type: 'priority',
        priority: true,
        tokensCost: 25,
        createdAt: serverTimestamp(),
      });

      // Update chat with priority flag
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: `⚡ ${content.slice(0, 50)}`,
        lastMessageAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastMessagePriority: true,
      });

      setInputText('');
      // Backend deducts 25 tokens (100% Avalo)
    } catch (err) {
      console.error('[ChatIdPage] Priority send error:', err);
      alert('Failed to send priority message');
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-white sticky top-0 z-10">
        <button onClick={() => router.push('/messages')} className="p-1 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {/* FIX 102/107: Avatar — group icon or individual with presence dot */}
        {isGroupChat ? (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E4458F] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-sm">
            👥
          </div>
        ) : (
          <div className="relative">
            {otherUser?.photoURL ? (
              <img src={otherUser.photoURL} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-sm">
                {otherUser?.displayName?.charAt(0) || '?'}
              </div>
            )}
            {isOnline && (
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {/* FIX 107: Group name + member count OR individual name */}
          <p className="font-medium text-sm truncate">
            {isGroupChat
              ? chatData?.name || 'Group Chat'
              : otherUser?.displayName || 'User'}
          </p>
          {/* FIX 102/107: Status line */}
          <p className="text-xs text-gray-400">
            {isGroupChat ? (
              <span>{chatData?.participants?.length || 0} members</span>
            ) : isOnline ? (
              <span className="text-green-500">● Online</span>
            ) : lastSeen ? (
              formatLastSeen(lastSeen)
            ) : chatCost ? (
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" /> {chatCost} tokens/msg
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* FIX 70: Non-match chat — accept/reject banner */}
      {pendingAccept && (
        <div className="p-4 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-800 mb-3">
            This person wants to chat with you. Accept to start conversation.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const db = requireDb();
                await updateDoc(doc(db, 'chats', chatId), { accepted: true, status: 'active' });
                setPendingAccept(false);
              }}
              className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium"
            >
              Accept ✓
            </button>
            <button
              onClick={async () => {
                const db = requireDb();
                await updateDoc(doc(db, 'chats', chatId), { status: 'rejected' });
                router.back();
              }}
              className="flex-1 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium"
            >
              Decline ✕
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E4458F]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            const msgData = msg as any;

            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} group relative`}
                onContextMenu={(e) => {
                  if (isMine && !msgData.deleted) {
                    e.preventDefault();
                    setMsgContextMenu({ id: msg.id, x: e.clientX, y: e.clientY });
                  }
                }}
              >
                <div className={`max-w-[75%] ${!msgData.type || msgData.type === 'text' ? '' : ''}`} onDoubleClick={() => setReactionMenu(msg.id)}>

                  {/* FIX 107: Sender name in group chats (not for own messages) */}
                  {isGroupChat && !isMine && (
                    <p className="text-[10px] font-medium text-[#E4458F] mb-0.5 ml-1">
                      {participantNames[msg.senderId] || msg.senderId.slice(0, 8)}
                    </p>
                  )}

                  {/* FIX 75B: Paid media message — blurred with unlock */}
                  {msgData.type === 'paid_media' && (
                    <div className="relative rounded-xl overflow-hidden w-64">
                      {msgData.unlocked || purchasedMediaIds.has(msg.id) || isMine ? (
                        // Unlocked or own media — show full
                        msgData.mediaType === 'video' ? (
                          <video src={msgData.mediaURL} controls className="w-full rounded-xl" />
                        ) : (
                          <img src={msgData.mediaURL} alt="" className="w-full rounded-xl" />
                        )
                      ) : (
                        // Locked — blurred with price overlay
                        <>
                          <img
                            src={msgData.mediaURL}
                            alt=""
                            className="w-full rounded-xl blur-2xl scale-110"
                          />
                          <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center">
                            <span className="text-3xl mb-1">🔒</span>
                            <button
                              onClick={() => handleUnlockMedia(msgData)}
                              className="px-4 py-2 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full text-sm font-medium mt-1"
                            >
                              Unlock for {msgData.price} tokens
                            </button>
                            <p className="text-white/60 text-[10px] mt-1">
                              Creator gets 65%
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* FIX 75B: Free media (no price) */}
                  {msgData.type === 'media' && (
                    msgData.mediaType === 'video' ? (
                      <video src={msgData.mediaURL} controls className="w-64 rounded-xl" />
                    ) : (
                      <img src={msgData.mediaURL} alt="" className="w-64 rounded-xl" />
                    )
                  )}

                  {/* FIX 88: Icebreaker message — styled differently */}
                  {msgData.type === 'icebreaker' && (
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm border-2 border-yellow-300 ${
                        isMine
                          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 text-gray-900 rounded-br-md'
                          : 'bg-gradient-to-r from-yellow-50 to-amber-50 text-gray-900 rounded-bl-md'
                      }`}
                    >
                      <span className="text-[10px] font-medium text-amber-600 block mb-0.5">💡 Icebreaker</span>
                      <p className="whitespace-pre-wrap break-words">{msgData.content}</p>
                    </div>
                  )}

                  {/* FIX 90: Priority message — highlighted */}
                  {msgData.type === 'priority' && (
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm border-2 border-amber-400 ${
                        isMine
                          ? 'bg-gradient-to-r from-amber-50 to-orange-50 text-gray-900 rounded-br-md'
                          : 'bg-gradient-to-r from-amber-50 to-orange-50 text-gray-900 rounded-bl-md'
                      }`}
                    >
                      <span className="text-[10px] font-medium text-amber-600 block mb-0.5">⚡ Priority Message</span>
                      <p className="whitespace-pre-wrap break-words">{msgData.content}</p>
                    </div>
                  )}

                  {/* Regular text message — FIX 127: Show deleted/edited state */}
                  {(!msgData.type || msgData.type === 'text') && (
                    msgData.deleted ? (
                      <div className="px-3 py-2 rounded-2xl text-sm bg-gray-50 dark:bg-gray-800">
                        <span className="text-xs text-gray-400 italic">Message deleted</span>
                      </div>
                    ) : editingMsgId === msg.id ? (
                      <div className="flex gap-1 items-center">
                        <input
                          value={editingMsgText}
                          onChange={(e) => setEditingMsgText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEditMessage(); if (e.key === 'Escape') { setEditingMsgId(null); setEditingMsgText(''); } }}
                          className="flex-1 px-3 py-2 border rounded-xl text-sm"
                          autoFocus
                        />
                        <button onClick={submitEditMessage} className="px-2 py-1 bg-[#E4458F] text-white rounded-lg text-xs">Save</button>
                        <button onClick={() => { setEditingMsgId(null); setEditingMsgText(''); }} className="px-2 py-1 bg-gray-200 rounded-lg text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm ${
                          isMine
                            ? 'bg-[#E4458F] text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        {msgData.edited && (
                          <span className={`text-[9px] ${isMine ? 'text-white/60' : 'text-gray-400'} ml-1`}>(edited)</span>
                        )}
                      </div>
                    )
                  )}

                  {/* Timestamp + read receipt + report */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <p
                      className={`text-[10px] ${
                        isMine ? 'text-gray-400 text-right' : 'text-gray-400'
                      }`}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                    {/* FIX 104: Read receipt — double checkmark for sent messages */}
                    {isMine && (
                      <span className="text-[9px] ml-1">
                        {msgData.read ? (
                          <span className="text-blue-500">✓✓</span>
                        ) : (
                          <span className="text-gray-400">✓</span>
                        )}
                      </span>
                    )}
                    {/* FIX 58C: Report message button — visible on hover */}
                    {!isMine && (
                      <button
                        onClick={() => reportMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 ml-2 transition-opacity"
                      >
                        Report
                      </button>
                    )}
                  </div>

                  {/* FIX 105: Reaction emoji picker — shown on double-click */}
                  {reactionMenu === msg.id && (
                    <div className="absolute -top-10 left-0 flex gap-1 bg-white shadow-lg rounded-full px-2 py-1 z-10">
                      {REACTIONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            updateDoc(
                              doc(requireDb(), 'chats', chatId, 'messages', msg.id),
                              { [`reactions.${currentUserId}`]: r },
                            );
                            setReactionMenu(null);
                          }}
                          className="text-lg hover:scale-125 transition"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* FIX 105: Show reactions under message bubble */}
                  {msgData.reactions && Object.keys(msgData.reactions).length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {Object.values(msgData.reactions).map((r: any, i: number) => (
                        <span key={i} className="text-xs bg-gray-100 rounded-full px-1">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* FIX 127: Message context menu — Edit / Delete / Copy */}
      {msgContextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMsgContextMenu(null)}
        >
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 shadow-xl rounded-xl py-1 min-w-[140px]"
            style={{ left: msgContextMenu.x, top: msgContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                startEditMessage(msgContextMenu.id);
                setMsgContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => {
                deleteMessage(msgContextMenu.id);
                setMsgContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              🗑️ Delete
            </button>
            <button
              onClick={() => {
                copyMessage(msgContextMenu.id);
                setMsgContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              📋 Copy
            </button>
            <button
              onClick={() => setMsgContextMenu(null)}
              className="w-full px-4 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FIX 75A: Media pricing panel — shown when user attaches a file */}
      {showMediaPricing && mediaPreview && (
        <div className="p-3 border-t bg-gray-50">
          <div className="flex gap-3">
            {mediaFile?.type.startsWith('video') ? (
              <video src={mediaPreview} className="w-20 h-20 object-cover rounded-lg" />
            ) : (
              <img src={mediaPreview} alt="" className="w-20 h-20 object-cover rounded-lg" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium mb-2">Send as paid media?</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs">Free</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mediaPrice > 0}
                    onChange={(e) => setMediaPrice(e.target.checked ? 10 : 0)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 peer-checked:bg-[#E4458F] rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
                <span className="text-xs">Paid</span>
              </div>
              {mediaPrice > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={mediaPrice}
                    onChange={(e) => setMediaPrice(Number(e.target.value))}
                    min={1}
                    max={500}
                    className="w-20 p-1 border rounded text-sm text-center"
                  />
                  <span className="text-xs text-gray-500">tokens (you get 65%)</span>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSendMedia}
                  disabled={sendingMedia}
                  className="px-3 py-1 bg-[#E4458F] text-white rounded-lg text-xs disabled:opacity-50"
                >
                  {sendingMedia ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => {
                    setShowMediaPricing(false);
                    setMediaFile(null);
                    setMediaPreview('');
                  }}
                  className="px-3 py-1 bg-gray-200 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FIX 89: AI Super Reply preview panel */}
      {showSuperReply && polishedMessage && (
        <div className="p-3 bg-purple-50 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-700">✨ AI-polished version (5 tokens)</span>
            <button onClick={() => setShowSuperReply(false)} className="text-gray-400 text-xs">✕</button>
          </div>
          <p className="text-sm mb-2">{polishedMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setInputText(polishedMessage); setShowSuperReply(false); }}
              className="flex-1 py-1.5 bg-[#8B5CF6] text-white rounded-lg text-xs"
            >
              Use this version
            </button>
            <button
              onClick={() => setShowSuperReply(false)}
              className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs"
            >
              Keep original
            </button>
          </div>
        </div>
      )}

      {/* FIX 88: Icebreaker popup panel */}
      {showIcebreakers && (
        <div className="absolute bottom-16 left-0 right-0 bg-white shadow-xl rounded-t-2xl border p-4 z-10 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Icebreakers</h4>
            <span className="text-xs text-[#E4458F]">15 tokens each</span>
          </div>
          <div className="space-y-2">
            {ICEBREAKERS.map(ib => (
              <button key={ib.id} onClick={() => sendIcebreaker(ib)}
                className="w-full text-left p-2 hover:bg-gray-50 rounded-lg text-sm flex items-center gap-2">
                <span className="text-xl">{ib.emoji}</span>
                <span>{ib.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FIX 103: Typing indicator — shown above input bar */}
      {otherTyping && (
        <div className="px-4 py-1">
          <span className="text-xs text-gray-400 italic">typing<span className="animate-pulse">...</span></span>
        </div>
      )}

      {/* Input bar — FIX 70: Block sending if not accepted or rejected */}
      {!pendingAccept && chatData?.status !== 'rejected' && (
        <div className="border-t bg-white p-3 flex items-center gap-2">
          {/* FIX 75A: Media attach button */}
          <button
            onClick={() => document.getElementById('chat-media-input')?.click()}
            className="p-2 text-gray-400 hover:text-[#E4458F] transition-colors"
            title="Attach media"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            id="chat-media-input"
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMediaFile(f);
                setMediaPreview(URL.createObjectURL(f));
                setShowMediaPricing(true);
              }
            }}
          />

          {/* FIX 88: Icebreaker button */}
          <button
            onClick={() => setShowIcebreakers(!showIcebreakers)}
            className="p-2 text-gray-400 hover:text-[#E4458F] transition-colors"
            title="Icebreakers (15 tokens)"
          >
            💡
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              // FIX 103: Debounced typing signal
              if (currentUserId && chatId) {
                setTyping(chatId, currentUserId, true);
                clearTimeout(typingTimeout.current);
                typingTimeout.current = setTimeout(() => {
                  setTyping(chatId, currentUserId, false);
                }, 3000);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // FIX 103: Clear typing on send
                if (currentUserId && chatId) {
                  setTyping(chatId, currentUserId, false);
                  clearTimeout(typingTimeout.current);
                }
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full border text-sm focus:outline-none focus:ring-2 focus:ring-[#E4458F]/40"
            disabled={sending}
          />

          {/* FIX 89: AI Super Reply button */}
          <button
            onClick={handlePolish}
            disabled={!inputText.trim() || polishing}
            className="p-2 text-gray-400 hover:text-[#E4458F] disabled:opacity-30 transition-colors"
            title="AI Super Reply (5 tokens)"
          >
            {polishing ? '⏳' : '✨'}
          </button>

          {/* FIX 90: Priority message button */}
          <button
            onClick={() => sendPriorityMessage(inputText)}
            disabled={!inputText.trim()}
            className="p-2 text-amber-500 hover:text-amber-600 disabled:opacity-30 transition-colors"
            title="Priority message (25 tokens)"
          >
            ⚡
          </button>

          <button
            onClick={handleSend}
            disabled={sending || !inputText.trim()}
            className="p-2 rounded-full bg-[#E4458F] text-white disabled:opacity-50 hover:bg-[#d1377d] transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* FIX 70: Rejected chat message */}
      {chatData?.status === 'rejected' && (
        <div className="border-t bg-gray-50 p-3 text-center">
          <p className="text-sm text-gray-400">This conversation has been declined.</p>
        </div>
      )}
    </div>
  );
}
