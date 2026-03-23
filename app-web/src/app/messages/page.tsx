'use client';

/**
 * Messages Inbox Page — /messages
 *
 * FIX 44: Lists all conversations the current user is a participant in.
 * Ordered by lastMessageAt descending. Each row navigates to /chat/{chatId}.
 *
 * FIX 90: Priority messages appear with highlight (amber bg, ⚡ icon).
 *
 * FIX 102: Green dot for online presence on conversation avatars.
 * FIX 106: Conversation management — pin, archive, mute, delete via context menu.
 *          Pinned conversations sort first. Archived hidden by default.
 * FIX 107: "New Group" button to create group conversations.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { subscribePresence } from '@/lib/presenceService';
import { Avatar } from '@/components/ui/Avatar';
import { ConversationSkeleton, SkeletonList } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

// ============================================================================
// FIX 106: Chat Settings Type
// ============================================================================

interface ChatSetting {
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  deleted?: boolean;
  updatedAt?: any;
}

// ============================================================================
// FIX 107: Group Creation Modal Component
// ============================================================================

function GroupCreationModal({
  open,
  onClose,
  userId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  onCreated: (chatId: string) => void;
}) {
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [searchResults, setSearchResults] = useState<Array<{ uid: string; displayName: string; photoURL?: string }>>([]);
  const [creating, setCreating] = useState(false);

  // Search matches/contacts for group members
  useEffect(() => {
    if (!memberSearch.trim() || !userId) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const search = async () => {
      try {
        const db = requireDb();
        // Search from user's existing chat participants
        const chatsSnap = await getDocs(
          query(collection(db, 'chats'), where('participants', 'array-contains', userId)),
        );
        const contactIds = new Set<string>();
        chatsSnap.docs.forEach((d) => {
          const participants = d.data().participants || [];
          participants.forEach((p: string) => {
            if (p !== userId) contactIds.add(p);
          });
        });

        // Fetch profiles for contacts matching search
        const results: typeof searchResults = [];
        for (const cid of contactIds) {
          if (cancelled) break;
          if (selectedMembers.some((m) => m.uid === cid)) continue;
          try {
            const profileSnap = await getDoc(doc(db, 'public_profiles', cid));
            const data = profileSnap.data();
            const name = data?.displayName || cid.slice(0, 8);
            if (name.toLowerCase().includes(memberSearch.toLowerCase())) {
              results.push({ uid: cid, displayName: name, photoURL: data?.photoURL });
            }
          } catch {
            // Skip
          }
          if (results.length >= 10) break;
        }
        if (!cancelled) setSearchResults(results);
      } catch {
        // Silent
      }
    };
    const debounce = setTimeout(search, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [memberSearch, userId, selectedMembers]);

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || creating) return;
    setCreating(true);
    try {
      const db = requireDb();
      const groupRef = doc(collection(db, 'chats'));
      await setDoc(groupRef, {
        chatId: groupRef.id,
        type: 'group',
        name: groupName.trim(),
        participants: [userId, ...selectedMembers.map((m) => m.uid)],
        admins: [userId],
        createdBy: userId,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastMessage: 'Group created',
        lastMessageAt: serverTimestamp(),
      });
      onCreated(groupRef.id);
    } catch (err) {
      console.error('[GroupCreationModal] Error:', err);
      alert('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">New Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Group name */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E4458F]/40"
              maxLength={50}
            />
          </div>

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                {selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected (max 50)
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedMembers.map((m) => (
                  <span
                    key={m.uid}
                    className="inline-flex items-center gap-1 bg-[#E4458F]/10 text-[#E4458F] px-2 py-0.5 rounded-full text-xs"
                  >
                    {m.displayName}
                    <button
                      onClick={() => setSelectedMembers((prev) => prev.filter((p) => p.uid !== m.uid))}
                      className="hover:text-red-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Member search */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Add Members</label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E4458F]/40"
            />
            {searchResults.length > 0 && (
              <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.uid}
                    onClick={() => {
                      if (selectedMembers.length < 49) {
                        setSelectedMembers((prev) => [...prev, { uid: r.uid, displayName: r.displayName }]);
                        setMemberSearch('');
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-sm"
                  >
                    <Avatar src={r.photoURL} name={r.displayName} size={28} />
                    <span>{r.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedMembers.length === 0 || creating}
            className="w-full py-2.5 bg-[#E4458F] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#d1377d] transition-colors"
          >
            {creating ? 'Creating...' : `Create Group (${selectedMembers.length + 1} members)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FIX 102: PresenceDot Component — subscribes to individual user's presence
// ============================================================================

function PresenceDot({ uid }: { uid: string }) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return subscribePresence(uid, (isOnline) => setOnline(isOnline));
  }, [uid]);

  if (!online) return null;
  return (
    <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />
  );
}

// ============================================================================
// Main Messages Page
// ============================================================================

export default function MessagesPage() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // FIX 106: Conversation management state
  const [chatSettings, setChatSettings] = useState<Record<string, ChatSetting>>({});
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // FIX 107: Group creation modal
  const [showNewGroup, setShowNewGroup] = useState(false);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const db = requireDb();
    // Query all chats where user is a participant
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const chats = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        // Find the other participant
        const otherId = data.participants?.find((p: string) => p !== uid);
        let otherUser: Record<string, any> | null = null;
        if (otherId) {
          try {
            const profileSnap = await getDoc(doc(db, 'public_profiles', otherId));
            otherUser = profileSnap.exists() ? (profileSnap.data() as Record<string, any>) : null;
          } catch {
            // Profile may not exist yet
          }
        }
        return {
          id: d.id,
          ...data,
          otherUser,
          otherId,
        };
      }));
      setConversations(chats);
      setLoading(false);
    }, (err) => {
      console.error('[MessagesPage] onSnapshot error:', err);
      setLoading(false);
    });

    return unsub;
  }, [firebaseUser?.uid]);

  // FIX 106: Load chat settings (pin, mute, archive) from user subcollection
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const db = requireDb();
    const q = query(collection(db, 'users', uid, 'chat_settings'));

    const unsub = onSnapshot(q, (snap) => {
      const settings: Record<string, ChatSetting> = {};
      snap.docs.forEach((d) => {
        settings[d.id] = d.data() as ChatSetting;
      });
      setChatSettings(settings);
    });

    return unsub;
  }, [firebaseUser?.uid]);

  // FIX 106: Toggle pin
  const togglePin = useCallback(
    async (chatId: string) => {
      const uid = firebaseUser?.uid;
      if (!uid) return;
      const current = chatSettings[chatId]?.pinned || false;
      await setDoc(
        doc(requireDb(), 'users', uid, 'chat_settings', chatId),
        { pinned: !current, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setContextMenu(null);
    },
    [firebaseUser?.uid, chatSettings],
  );

  // FIX 106: Toggle mute
  const toggleMute = useCallback(
    async (chatId: string) => {
      const uid = firebaseUser?.uid;
      if (!uid) return;
      const current = chatSettings[chatId]?.muted || false;
      await setDoc(
        doc(requireDb(), 'users', uid, 'chat_settings', chatId),
        { muted: !current, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setContextMenu(null);
    },
    [firebaseUser?.uid, chatSettings],
  );

  // FIX 106: Archive conversation
  const archiveConv = useCallback(
    async (chatId: string) => {
      const uid = firebaseUser?.uid;
      if (!uid) return;
      await setDoc(
        doc(requireDb(), 'users', uid, 'chat_settings', chatId),
        { archived: true, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setContextMenu(null);
    },
    [firebaseUser?.uid],
  );

  // FIX 106: Delete conversation (soft — archive + mark deleted)
  const deleteConv = useCallback(
    async (chatId: string) => {
      if (!confirm('Delete this conversation? It will be permanently hidden.')) return;
      const uid = firebaseUser?.uid;
      if (!uid) return;
      await setDoc(
        doc(requireDb(), 'users', uid, 'chat_settings', chatId),
        { archived: true, deleted: true, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setContextMenu(null);
    },
    [firebaseUser?.uid],
  );

  // FIX 106: Unarchive conversation
  const unarchiveConv = useCallback(
    async (chatId: string) => {
      const uid = firebaseUser?.uid;
      if (!uid) return;
      await setDoc(
        doc(requireDb(), 'users', uid, 'chat_settings', chatId),
        { archived: false, deleted: false, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setContextMenu(null);
    },
    [firebaseUser?.uid],
  );

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // FIX 106: Sort conversations — pinned first, then by lastMessageAt desc
  // Filter: archived hidden by default, shown in "Archived" tab
  const sortedConversations = conversations
    .filter((conv) => {
      const settings = chatSettings[conv.id];
      const isArchived = settings?.archived || false;
      const isDeleted = settings?.deleted || false;
      if (isDeleted) return false;
      return showArchived ? isArchived : !isArchived;
    })
    .sort((a, b) => {
      const aPinned = chatSettings[a.id]?.pinned ? 1 : 0;
      const bPinned = chatSettings[b.id]?.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      // Existing sort by lastMessageAt is already applied by Firestore query
      return 0;
    });

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-bold">Messages</h1>
        <div className="flex items-center gap-2">
          {/* FIX 107: New Group button */}
          <button
            onClick={() => setShowNewGroup(true)}
            className="px-3 py-1.5 bg-[#E4458F] text-white rounded-full text-xs hover:bg-[#d1377d] transition-colors"
          >
            + Group
          </button>
        </div>
      </div>

      {/* FIX 106: Active / Archived tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setShowArchived(false)}
          className={`flex-1 py-2 text-sm font-medium text-center ${
            !showArchived ? 'text-[#E4458F] border-b-2 border-[#E4458F]' : 'text-gray-400'
          }`}
        >
          Conversations
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`flex-1 py-2 text-sm font-medium text-center ${
            showArchived ? 'text-[#E4458F] border-b-2 border-[#E4458F]' : 'text-gray-400'
          }`}
        >
          📦 Archived
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E4458F]" />
        </div>
      ) : sortedConversations.length === 0 ? (
        showArchived ? (
          <EmptyState
            icon="📦"
            title="No archived conversations"
            description="Archived conversations will appear here."
          />
        ) : (
          <EmptyState
            icon="💬"
            title="No messages yet"
            description="Like someone to start chatting! Matched users get 4 free messages."
            actionLabel="Discover People"
            actionHref="/discover"
          />
        )
      ) : (
        <div>
          {sortedConversations.map((conv) => {
            const settings = chatSettings[conv.id] || {};
            const isGroup = conv.type === 'group';
            const displayName = isGroup
              ? conv.name || 'Group Chat'
              : conv.otherUser?.displayName || conv.otherId?.slice(0, 8) || 'User';
            const displayInitial = displayName.charAt(0);

            return (
              <div
                key={conv.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b relative ${
                  conv.lastMessagePriority ? 'bg-amber-50 border-amber-200' : ''
                } ${settings.pinned ? 'bg-blue-50/30' : ''}`}
                onClick={() => router.push(`/chat/${conv.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu(conv.id);
                }}
              >
                {/* Avatar with FIX 102 green dot */}
                <div className="relative flex-shrink-0">
                  {isGroup ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E4458F] to-[#8B5CF6] flex items-center justify-center text-white font-bold">
                      {'\uD83D\uDC65'}
                    </div>
                  ) : (
                    <Avatar src={conv.otherUser?.photoURL} name={conv.otherUser?.displayName || displayInitial} size={48} />
                  )}
                  {/* FIX 102: Online presence dot */}
                  {conv.otherId && !isGroup && <PresenceDot uid={conv.otherId} />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">
                      {/* FIX 106: Pin indicator */}
                      {settings.pinned && <span className="text-blue-400 mr-1">📌</span>}
                      {/* FIX 106: Mute indicator */}
                      {settings.muted && <span className="text-gray-400 mr-1">🔇</span>}
                      {/* FIX 90: Priority message icon */}
                      {conv.lastMessagePriority && (
                        <span className="text-amber-500 mr-1">⚡</span>
                      )}
                      {/* FIX 107: Group indicator */}
                      {isGroup && <span className="mr-1">👥</span>}
                      {displayName}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {conv.lastMessage || 'Start chatting...'}
                  </p>
                </div>

                {/* Unread badge */}
                {conv.unreadCount > 0 && !settings.muted && (
                  <span className="w-5 h-5 bg-[#E4458F] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}

                {/* FIX 106: Context menu */}
                {contextMenu === conv.id && (
                  <div
                    className="absolute right-2 top-2 bg-white shadow-xl rounded-xl z-20 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {showArchived ? (
                      <button
                        onClick={() => unarchiveConv(conv.id)}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                      >
                        📦 Unarchive
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => togglePin(conv.id)}
                          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                        >
                          📌 {settings.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          onClick={() => toggleMute(conv.id)}
                          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                        >
                          🔇 {settings.muted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                          onClick={() => archiveConv(conv.id)}
                          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                        >
                          📦 Archive
                        </button>
                        <button
                          onClick={() => deleteConv(conv.id)}
                          className="w-full px-4 py-2 text-sm text-left text-red-500 hover:bg-red-50"
                        >
                          🗑️ Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FIX 107: Group creation modal */}
      {firebaseUser?.uid && (
        <GroupCreationModal
          open={showNewGroup}
          onClose={() => setShowNewGroup(false)}
          userId={firebaseUser.uid}
          onCreated={(chatId) => {
            setShowNewGroup(false);
            router.push(`/chat/${chatId}`);
          }}
        />
      )}
    </div>
  );
}
