'use client';

/**
 * Chat Interface Component
 * Renders the active chat: message history, input, status bar, deposit prompts.
 * Extended from placeholder to full implementation.
 *
 * INVARIANTS:
 *   - Token cost display respects payer/earner roles from chat.roles.
 *   - Deposit prompt shown when chat.state === 'AWAITING_DEPOSIT'.
 *   - Free message count sourced from chat.billing.freeMessagesRemaining.
 *   - estimateTokenCost uses chat.billing.wordsPerToken for accuracy.
 */

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import {
  Send,
  ArrowLeft,
  Coins,
  Loader2,
  AlertCircle,
  Lock,
  MessageCircle,
  XCircle,
} from 'lucide-react';
import type { Chat as ServiceChat, ChatMessage } from '@/lib/types';
import type { User } from '@/types';
import type { Timestamp } from 'firebase/firestore';
import {
  getChatStatusInfo,
  estimateTokenCost,
  getDepositAmount,
} from '@/lib/services/chatService';
import { Avatar } from '@/components/ui/Avatar';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatInterfaceProps {
  /** The active chat document (realtime) */
  chat: ServiceChat;
  /** Messages in the chat (realtime) */
  messages: ChatMessage[];
  /** Current authenticated user's UID */
  currentUserId: string;
  /** Map of participant UID → User profile */
  participantProfiles: Map<string, User>;
  /** Send message handler */
  onSendMessage: (text: string) => Promise<void>;
  /** Process deposit handler */
  onDeposit: () => Promise<void>;
  /** Close chat handler */
  onCloseChat: () => Promise<void>;
  /** Mobile back navigation */
  onBack?: () => void;
  /** Whether a message is currently being sent */
  sending: boolean;
  /** Whether a deposit is being processed */
  depositLoading: boolean;
  /** Whether messages are still loading */
  messagesLoading: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMessageTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp || typeof timestamp?.toDate !== 'function') return '';
  const date = timestamp.toDate();
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (isToday) return time;

  const month = date.toLocaleString('en', { month: 'short' });
  return `${month} ${date.getDate()}, ${time}`;
}

function getStateBadgeConfig(state: ServiceChat['state']): {
  label: string;
  className: string;
} {
  switch (state) {
    case 'FREE_ACTIVE':
      return {
        label: 'Free',
        className:
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'AWAITING_DEPOSIT':
      return {
        label: 'Deposit Required',
        className:
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 'PAID_ACTIVE':
      return {
        label: 'Paid',
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 'CLOSED':
      return {
        label: 'Closed',
        className:
          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      };
    default:
      return { label: String(state), className: 'bg-gray-100 text-gray-500' };
  }
}

function getAvatarInitial(name: string | null | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Avatar circle — shows photoURL or initial fallback */
function UserAvatar({
  user,
  size = 'sm',
}: {
  user: User | undefined;
  size?: 'sm' | 'md';
}) {
  const sizeClass = size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';

  const pixelSize = size === 'md' ? 40 : 32;

  return (
    <Avatar src={user?.photoURL} name={user?.displayName} size={pixelSize} />
  );
}

/** Token cost badge shown on each message */
function TokenCostBadge({
  tokenCost,
  isPayer,
}: {
  tokenCost: number;
  isPayer: boolean;
}) {
  if (tokenCost === 0) return null;

  if (isPayer) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-600 dark:text-orange-400">
        <Coins className="w-3 h-3" />
        <span>-{tokenCost}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
      <Coins className="w-3 h-3" />
      <span>+{tokenCost}</span>
    </span>
  );
}

/** Single message bubble */
function MessageBubble({
  message,
  isOwnMessage,
  isPayer,
  senderProfile,
}: {
  message: ChatMessage;
  isOwnMessage: boolean;
  isPayer: boolean;
  senderProfile: User | undefined;
}) {
  return (
    <div
      className={`flex gap-2 mb-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <UserAvatar user={senderProfile} size="sm" />

      <div
        className={`max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'}`}
      >
        {/* Sender name for other user's messages */}
        {!isOwnMessage && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5 px-1">
            {senderProfile?.displayName ?? 'User'}
          </p>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isOwnMessage
              ? 'bg-primary-500 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
          }`}
        >
          {message.text}
        </div>

        {/* Timestamp + token cost row */}
        <div
          className={`flex items-center gap-2 mt-0.5 px-1 ${
            isOwnMessage ? 'justify-end' : 'justify-start'
          }`}
        >
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatMessageTime(message.createdAt)}
          </span>
          <TokenCostBadge tokenCost={message.tokenCost} isPayer={isPayer} />
        </div>
      </div>
    </div>
  );
}

/** Deposit prompt overlay */
function DepositPrompt({
  onDeposit,
  depositLoading,
}: {
  onDeposit: () => Promise<void>;
  depositLoading: boolean;
}) {
  const deposit = getDepositAmount();

  return (
    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Free messages used up
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
            Deposit {deposit.total} tokens to continue chatting.
            {' '}{deposit.escrow} tokens go to escrow, {deposit.platformFee} platform fee.
          </p>
          <button
            onClick={onDeposit}
            disabled={depositLoading}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {depositLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Coins className="w-3 h-3" />
            )}
            {depositLoading ? 'Processing...' : `Deposit ${deposit.total} Tokens`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Chat status bar showing free messages, escrow, mode */
function ChatStatusBar({
  chat,
  currentUserId,
}: {
  chat: ServiceChat;
  currentUserId: string;
}) {
  const status = getChatStatusInfo(chat, currentUserId);
  const badge = getStateBadgeConfig(chat.state);
  const isPayer = chat.roles.payerId === currentUserId;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-700 text-[11px] flex-wrap">
      <span className={`px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
        {badge.label}
      </span>

      {status.freeMessagesRemaining > 0 && (
        <span className="text-gray-500 dark:text-gray-400">
          {status.freeMessagesRemaining} free messages left
        </span>
      )}

      {chat.state === 'PAID_ACTIVE' && isPayer && (
        <span className="text-gray-500 dark:text-gray-400">
          Escrow: {status.escrowBalance} tokens
        </span>
      )}

      {chat.state === 'PAID_ACTIVE' && !isPayer && chat.roles.earnerId === currentUserId && (
        <span className="text-green-600 dark:text-green-400">
          Earning mode
        </span>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ChatInterface({
  chat,
  messages,
  currentUserId,
  participantProfiles,
  onSendMessage,
  onDeposit,
  onCloseChat,
  onBack,
  sending,
  depositLoading,
  messagesLoading,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived state
  const isPayer = chat.roles.payerId === currentUserId;
  const otherParticipantId = chat.participants.find((p) => p !== currentUserId);
  const otherProfile = otherParticipantId
    ? participantProfiles.get(otherParticipantId)
    : undefined;
  const estimatedCost = inputText.trim()
    ? estimateTokenCost(inputText, chat.billing.wordsPerToken)
    : 0;
  const canSendMessage =
    chat.state !== 'AWAITING_DEPOSIT' && chat.state !== 'CLOSED';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input when chat opens
  useEffect(() => {
    if (canSendMessage) {
      inputRef.current?.focus();
    }
  }, [chat.id, canSendMessage]);

  // Send message handler
  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = inputText.trim();
      if (!text || sending) return;

      setSendError(null);
      setInputText('');

      try {
        await onSendMessage(text);
      } catch (err: any) {
        setSendError(err?.message ?? 'Failed to send message');
        setInputText(text); // Restore text on error
      }
    },
    [inputText, sending, onSendMessage],
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 p-3 border-b dark:border-gray-700">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <UserAvatar user={otherProfile} size="md" />

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {otherProfile?.displayName ?? 'Chat'}
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {isPayer ? 'You are paying' : chat.roles.earnerId === currentUserId ? 'You are earning' : 'Chat'}
          </p>
        </div>

        <button
          onClick={onCloseChat}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Close chat"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* ── Status bar ──────────────────────────────────────── */}
      <ChatStatusBar chat={chat} currentUserId={currentUserId} />

      {/* ── Messages area ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwnMessage={msg.senderId === currentUserId}
                isPayer={isPayer}
                senderProfile={participantProfiles.get(msg.senderId)}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* ── Send error ──────────────────────────────────────── */}
      {sendError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{sendError}</span>
            <button
              onClick={() => setSendError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Deposit prompt (shown when AWAITING_DEPOSIT) ───── */}
      {chat.state === 'AWAITING_DEPOSIT' && isPayer && (
        <DepositPrompt onDeposit={onDeposit} depositLoading={depositLoading} />
      )}

      {chat.state === 'AWAITING_DEPOSIT' && !isPayer && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Waiting for the other participant to deposit tokens to continue.
          </p>
        </div>
      )}

      {/* ── Closed chat notice ──────────────────────────────── */}
      {chat.state === 'CLOSED' && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This chat has been closed.
          </p>
        </div>
      )}

      {/* ── Input area ──────────────────────────────────────── */}
      {canSendMessage && (
        <form
          onSubmit={handleSend}
          className="border-t dark:border-gray-700 p-3"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 px-3 py-2 text-sm rounded-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border-0 focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="p-2 rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Token cost estimate */}
          {inputText.trim() && isPayer && estimatedCost > 0 && (
            <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-1 px-3 flex items-center gap-1">
              <Coins className="w-3 h-3" />
              Estimated cost: ~{estimatedCost} token{estimatedCost !== 1 ? 's' : ''}
            </p>
          )}

          {inputText.trim() && !isPayer && chat.roles.earnerId === currentUserId && estimatedCost > 0 && (
            <p className="text-[10px] text-green-500 dark:text-green-400 mt-1 px-3 flex items-center gap-1">
              <Coins className="w-3 h-3" />
              Estimated earning: ~{estimatedCost} token{estimatedCost !== 1 ? 's' : ''}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
