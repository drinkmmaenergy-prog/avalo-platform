'use client';

/**
 * Chat Page — messaging with conversation list and active chat panel.
 * Layout provides AppShell wrapping.
 *
 * Architecture:
 *   Left panel  — Conversation list (realtime via useUserChats)
 *   Right panel — Active chat (ChatInterface with realtime messages)
 *   Mobile      — Toggle between list view and chat view
 *
 * Uses chatService.ts for all backend operations.
 * Uses hooks/useChat.ts for realtime Firestore subscriptions.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  Loader2,
  AlertCircle,
  Search,
  Coins,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import ChatInterface from '@/components/chat/ChatInterface';
import {
  useUserChats,
  useChatMessages,
  useActiveChat,
  useParticipantProfiles,
} from '@/hooks/useChat';
import {
  sendMessage,
  processChatDeposit,
  closeChat,
  formatLastActivity,
  getChatStatusInfo,
} from '@/lib/services/chatService';
import type { Chat as ServiceChat } from '@/lib/types';
import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Loading skeleton for conversation list */
function ConversationListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
          <div className="w-12 h-12 rounded-full skeleton flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-4 skeleton rounded w-1/3 mb-2" />
            <div className="h-3 skeleton rounded w-2/3" />
          </div>
          <div className="h-3 skeleton rounded w-12" />
        </div>
      ))}
    </div>
  );
}

/** Empty state when user has no active chats */
function EmptyChatsState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mb-4 flex items-center justify-center">
        <MessageCircle className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        No conversations yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        Start a conversation from someone&#39;s profile to see your chats here.
      </p>
    </div>
  );
}

/** Error state with retry */
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 mb-4 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        Something went wrong
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-4">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Auth-required state */
function AuthRequiredState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4 flex items-center justify-center">
        <MessageCircle className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        Sign in to chat
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        You need to be signed in to view your conversations.
      </p>
    </div>
  );
}

/** Placeholder for when no chat is selected (desktop right panel) */
function NoChatSelectedState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select a conversation to start chatting
      </p>
    </div>
  );
}

/** State badge for conversation list items */
function StateBadge({ state }: { state: ServiceChat['state'] }) {
  const config: Record<string, { label: string; className: string }> = {
    FREE_ACTIVE: {
      label: 'Free',
      className: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    },
    AWAITING_DEPOSIT: {
      label: 'Deposit',
      className: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    PAID_ACTIVE: {
      label: 'Paid',
      className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
  };

  const badge = config[state];
  if (!badge) return null;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/** Safe timestamp formatter — handles missing or non-Timestamp values */
function safeFormatTime(ts: Timestamp | any): string {
  if (!ts || typeof ts?.toMillis !== 'function') return '';
  try {
    return formatLastActivity(ts);
  } catch {
    return '';
  }
}

/** Single conversation list item */
function ConversationItem({
  chat,
  currentUserId,
  otherUserName,
  otherUserPhoto,
  isSelected,
  onSelect,
}: {
  chat: ServiceChat;
  currentUserId: string;
  otherUserName: string;
  otherUserPhoto: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const status = getChatStatusInfo(chat, currentUserId);
  const isPayer = chat.roles.payerId === currentUserId;
  const initial = otherUserName ? otherUserName.charAt(0).toUpperCase() : '?';

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
      }`}
    >
      {/* Avatar */}
      {otherUserPhoto ? (
        <img
          src={otherUserPhoto}
          alt={otherUserName}
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center font-semibold text-lg flex-shrink-0">
          {initial}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {otherUserName || 'Unknown'}
          </span>
          <StateBadge state={chat.state} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {chat.lastMessage || 'No messages yet'}
        </p>
      </div>

      {/* Right column: time + role indicator */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {safeFormatTime(chat.lastActivityAt)}
        </span>
        {isPayer ? (
          <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
            <Coins className="w-2.5 h-2.5" /> Paying
          </span>
        ) : chat.roles.earnerId === currentUserId ? (
          <span className="text-[10px] text-green-500 flex items-center gap-0.5">
            <Coins className="w-2.5 h-2.5" /> Earning
          </span>
        ) : null}
      </div>

      {/* Chevron on mobile */}
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 md:hidden" />
    </button>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function ChatPage() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();

  // Active chat selection
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Action states
  const [sending, setSending] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);

  // Data hooks
  const { chats, loading: chatsLoading, error: chatsError } = useUserChats(
    user?.uid ?? null,
  );
  const { messages, loading: messagesLoading } = useChatMessages(activeChatId);
  const { chat: activeChat } = useActiveChat(activeChatId);

  // Collect all participant IDs across all chats for profile lookup
  const allParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of chats) {
      for (const pid of c.participants) {
        if (pid !== user?.uid) {
          ids.add(pid);
        }
      }
    }
    return Array.from(ids);
  }, [chats, user?.uid]);

  const participantProfiles = useParticipantProfiles(allParticipantIds);

  // Filtered chats based on search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter((c) => {
      const otherId = c.participants.find((p) => p !== user?.uid);
      const otherProfile = otherId ? participantProfiles.get(otherId) : undefined;
      const name = otherProfile?.displayName?.toLowerCase() ?? '';
      const lastMsg = c.lastMessage?.toLowerCase() ?? '';
      return name.includes(query) || lastMsg.includes(query);
    });
  }, [chats, searchQuery, user?.uid, participantProfiles]);

  // ── Handlers ─────────────────────────────────────────────

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setMobileShowChat(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setMobileShowChat(false);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeChatId || !user?.uid) return;
      setSending(true);
      try {
        const result = await sendMessage({
          chatId: activeChatId,
          senderId: user.uid,
          text,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to send message');
        }
      } finally {
        setSending(false);
      }
    },
    [activeChatId, user?.uid],
  );

  const handleDeposit = useCallback(async () => {
    if (!activeChatId || !user?.uid) return;
    setDepositLoading(true);
    try {
      const result = await processChatDeposit({
        chatId: activeChatId,
        payerId: user.uid,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to process deposit');
      }
    } finally {
      setDepositLoading(false);
    }
  }, [activeChatId, user?.uid]);

  const handleCloseChat = useCallback(async () => {
    if (!activeChatId || !user?.uid) return;
    try {
      const result = await closeChat({
        chatId: activeChatId,
        userId: user.uid,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to close chat');
      }
      // Go back to list after closing
      setActiveChatId(null);
      setMobileShowChat(false);
    } catch (err) {
      console.error('[ChatPage] Close chat error:', err);
    }
  }, [activeChatId, user?.uid]);

  // ── Auth guard ───────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)]">
        <AuthRequiredState />
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Page title */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('placeholder.chatTitle')}
        </h1>
      </div>

      {/* Split layout container */}
      <div className="flex-1 flex overflow-hidden px-4 pb-4 gap-4">
        {/* ── Left panel: Conversation list ────────────────── */}
        <div
          className={`w-full md:w-[360px] md:flex-shrink-0 flex flex-col card overflow-hidden ${
            mobileShowChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Search bar */}
          <div className="p-3 border-b dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border-0 focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Conversation list body */}
          <div className="flex-1 overflow-y-auto">
            {chatsLoading ? (
              <ConversationListSkeleton />
            ) : chatsError ? (
              <ErrorState
                message={chatsError}
                onRetry={() => window.location.reload()}
              />
            ) : filteredChats.length === 0 ? (
              searchQuery.trim() ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No conversations matching &quot;{searchQuery}&quot;
                  </p>
                </div>
              ) : (
                <EmptyChatsState />
              )
            ) : (
              <div className="p-2 space-y-1">
                {filteredChats.map((c) => {
                  const otherId = c.participants.find((p) => p !== user.uid);
                  const otherProfile = otherId
                    ? participantProfiles.get(otherId)
                    : undefined;

                  return (
                    <ConversationItem
                      key={c.id}
                      chat={c}
                      currentUserId={user.uid}
                      otherUserName={otherProfile?.displayName ?? 'Unknown'}
                      otherUserPhoto={otherProfile?.photoURL ?? null}
                      isSelected={c.id === activeChatId}
                      onSelect={() => handleSelectChat(c.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Active chat ─────────────────────── */}
        <div
          className={`flex-1 min-w-0 ${
            mobileShowChat ? 'flex' : 'hidden md:flex'
          } flex-col`}
        >
          {activeChat && activeChatId ? (
            <ChatInterface
              chat={activeChat}
              messages={messages}
              currentUserId={user.uid}
              participantProfiles={participantProfiles}
              onSendMessage={handleSendMessage}
              onDeposit={handleDeposit}
              onCloseChat={handleCloseChat}
              onBack={handleBackToList}
              sending={sending}
              depositLoading={depositLoading}
              messagesLoading={messagesLoading}
            />
          ) : activeChatId ? (
            /* Chat selected but document not loaded yet */
            <div className="card flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            /* No chat selected */
            <div className="card flex-1 hidden md:flex">
              <NoChatSelectedState />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
