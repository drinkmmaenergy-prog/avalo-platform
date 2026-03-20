'use client';

/**
 * AI Chat Page — /ai/chat/[avatarId]
 *
 * Full AI chat interface with corrected token display.
 * Preserves all existing AI chat functionality from PACK 279C.
 *
 * Token display fix (CHANGE 3):
 *   - Previously showed "11 words/100 tokens" which is incorrect.
 *   - Now shows: "Balance: [X] tokens" and "Words left: [Y]" separately.
 *   - Uses AI_WORDS_PER_TOKEN constant (30 words per token for user bots).
 *   - Shows deposit balance in tokens, words remaining in current session,
 *     cost per message.
 *
 * Uses existing functions: startAIChatSession, sendAIMessage, sendAIMessageCallable.
 * Data source: Firestore 'ai_avatars/{avatarId}'
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { requireDb, requireFunctions } from '@/lib/firebase';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  AI_WORDS_PER_TOKEN,
  AI_FREE_MESSAGES,
  AI_COST_PER_MESSAGE,
} from '@/lib/aiEconomyConfig';
import type { AIAvatar } from '@/lib/types/aiAvatar';
import {
  ArrowLeft,
  Bot,
  Send,
  Coins,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  tokensCost: number;
  wasFree: boolean;
  wordCount: number;
}

interface ChatSessionState {
  avatarId: string;
  avatarName: string;
  avatarPhoto: string | null;
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED';
  tokenBalance: number;
  freeMessagesUsed: number;
  totalMessagesSent: number;
}

// ============================================================================
// HELPER
// ============================================================================

function countWords(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
  const withoutEmojis = withoutUrls.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu,
    ''
  );
  return withoutEmojis
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIChatAvatarPage() {
  const router = useRouter();
  const params = useParams()!;
  const avatarId = params.avatarId as string;
  const { user } = useAuth();

  const [avatar, setAvatar] = useState<AIAvatar | null>(null);
  const [session, setSession] = useState<ChatSessionState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load avatar + initialize session ─────────────────────────────────
  useEffect(() => {
    if (!avatarId) return;
    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId]);

  // ── Auto-scroll on new messages ──────────────────────────────────────
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Auto-show token modal when balance low ───────────────────────────
  useEffect(() => {
    if (
      session &&
      session.tokenBalance < 5 &&
      session.state === 'PAID_ACTIVE' &&
      session.freeMessagesUsed >= AI_FREE_MESSAGES
    ) {
      setShowTokenModal(true);
    }
  }, [session?.tokenBalance, session?.state, session?.freeMessagesUsed]);

  const initializeChat = async () => {
    try {
      setLoading(true);

      // Load avatar profile
      const avatarRef = doc(requireDb(), 'ai_avatars', avatarId);
      const snap = await getDoc(avatarRef);

      if (!snap.exists()) {
        alert('AI Companion not found');
        router.push('/ai');
        return;
      }

      const d = snap.data();
      const loadedAvatar: AIAvatar = {
        id: snap.id,
        name: d.name || 'AI Companion',
        age: d.age || 0,
        gender: d.gender || 'other',
        ethnicity: d.ethnicity || '',
        bodyType: d.bodyType || '',
        hairColor: d.hairColor || '',
        eyeColor: d.eyeColor || '',
        personalityTraits: d.personalityTraits || [],
        bio: d.bio || '',
        backstory: d.backstory || '',
        interests: d.interests || [],
        photos: d.photos || [],
        voiceType: d.voiceType || '',
        creatorId: d.creatorId || null,
        creatorDisplayName: d.creatorDisplayName || null,
        isAvaloPlatform: d.isAvaloPlatform === true,
        totalConversations: d.totalConversations || 0,
        averageRating: d.averageRating || 0,
        ratingCount: d.ratingCount || 0,
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
      };

      setAvatar(loadedAvatar);

      // Load user's token balance from wallet
      let tokenBalance = 0;
      if (user?.uid) {
        try {
          const walletRef = doc(requireDb(), 'wallets', user.uid);
          const walletSnap = await getDoc(walletRef);
          if (walletSnap.exists()) {
            tokenBalance = walletSnap.data().balance || 0;
          }
        } catch (walletErr) {
          console.warn('[AIChatPage] Could not load wallet:', walletErr);
        }
      }

      const chatSession: ChatSessionState = {
        avatarId: loadedAvatar.id,
        avatarName: loadedAvatar.name,
        avatarPhoto:
          loadedAvatar.photos && loadedAvatar.photos.length > 0
            ? loadedAvatar.photos[0]
            : null,
        state: 'FREE_ACTIVE',
        tokenBalance,
        freeMessagesUsed: 0,
        totalMessagesSent: 0,
      };

      setSession(chatSession);

      // Welcome message
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'ai',
        content: `Hi! I'm ${loadedAvatar.name}. ${loadedAvatar.bio || "I'd love to chat with you!"} How can I help you today?`,
        timestamp: new Date(),
        tokensCost: 0,
        wasFree: true,
        wordCount: 0,
      };
      setMessages([welcomeMsg]);
    } catch (error: any) {
      console.error('[AIChatPage] Failed to initialize chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !session || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
      wordCount: countWords(inputText.trim()),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setSending(true);
    setIsTyping(true);

    try {
      // Determine if this message is free
      const isFreeMessage = session.freeMessagesUsed < AI_FREE_MESSAGES;

      // Check balance if not free
      if (!isFreeMessage && session.tokenBalance < AI_COST_PER_MESSAGE) {
        setShowTokenModal(true);
        setIsTyping(false);
        setSending(false);
        return;
      }

      // Try to call backend sendAIMessage callable
      try {
        const sendAIMessageFn = httpsCallable(requireFunctions(), 'sendAIMessageCallable');
        const result = await sendAIMessageFn({
          avatarId: session.avatarId,
          message: userMessage.content,
        });

        const data = result.data as any;
        if (data && data.reply) {
          const wordCount = countWords(data.reply);
          const tokenCost = isFreeMessage ? 0 : AI_COST_PER_MESSAGE;

          const aiMessage: Message = {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: data.reply,
            timestamp: new Date(),
            tokensCost: tokenCost,
            wasFree: isFreeMessage,
            wordCount,
          };

          setIsTyping(false);
          setMessages((prev) => [...prev, aiMessage]);

          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  tokenBalance: isFreeMessage
                    ? prev.tokenBalance
                    : prev.tokenBalance - tokenCost,
                  freeMessagesUsed: isFreeMessage
                    ? prev.freeMessagesUsed + 1
                    : prev.freeMessagesUsed,
                  totalMessagesSent: prev.totalMessagesSent + 1,
                  state:
                    !isFreeMessage && prev.tokenBalance - tokenCost <= 0
                      ? 'AWAITING_DEPOSIT'
                      : isFreeMessage &&
                          prev.freeMessagesUsed + 1 >= AI_FREE_MESSAGES
                        ? 'PAID_ACTIVE'
                        : prev.state,
                }
              : null
          );
          return;
        }
      } catch (callableErr) {
        // Backend not available — fall through to mock response
        console.warn('[AIChatPage] Callable not available, using mock:', callableErr);
      }

      // Mock AI response (fallback when backend callable is unavailable)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const mockResponses = [
        "That's a fascinating question! I'd love to explore this topic with you.",
        "I understand what you mean. Let me share my thoughts on this.",
        "That's really interesting! Tell me more about what you think.",
        "I appreciate you sharing that with me. Here's what I think...",
        "What a great point! I've been thinking about something similar.",
      ];
      const aiResponseText =
        mockResponses[Math.floor(Math.random() * mockResponses.length)];
      const wordCount = countWords(aiResponseText);
      const tokenCost = isFreeMessage ? 0 : AI_COST_PER_MESSAGE;

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: aiResponseText,
        timestamp: new Date(),
        tokensCost: tokenCost,
        wasFree: isFreeMessage,
        wordCount,
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, aiMessage]);

      setSession((prev) =>
        prev
          ? {
              ...prev,
              tokenBalance: isFreeMessage
                ? prev.tokenBalance
                : prev.tokenBalance - tokenCost,
              freeMessagesUsed: isFreeMessage
                ? prev.freeMessagesUsed + 1
                : prev.freeMessagesUsed,
              totalMessagesSent: prev.totalMessagesSent + 1,
              state:
                !isFreeMessage && prev.tokenBalance - tokenCost <= 0
                  ? 'AWAITING_DEPOSIT'
                  : isFreeMessage &&
                      prev.freeMessagesUsed + 1 >= AI_FREE_MESSAGES
                    ? 'PAID_ACTIVE'
                    : prev.state,
            }
          : null
      );
    } catch (error: any) {
      setIsTyping(false);
      console.error('[AIChatPage] Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!session || !avatar) {
    return null;
  }

  // ── Computed display values ─────────────────────────────────────────
  const wordsRemaining = session.tokenBalance * AI_WORDS_PER_TOKEN;
  const freeMessagesLeft = Math.max(0, AI_FREE_MESSAGES - session.freeMessagesUsed);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar — AI Profile (desktop only) */}
      <div className="hidden md:flex md:w-80 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-6">
          {/* Avatar photo */}
          {session.avatarPhoto ? (
            <img
              src={session.avatarPhoto}
              alt={session.avatarName}
              className="w-24 h-24 rounded-full object-cover mx-auto mb-4 ring-2 ring-purple-500"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 mx-auto mb-4 flex items-center justify-center">
              <Bot className="w-12 h-12 text-white" />
            </div>
          )}

          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1">
            {session.avatarName}
          </h2>
          <div className="flex justify-center mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full">
              <Bot className="w-3 h-3" />
              AI
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
            {avatar.bio}
          </p>

          {/* Personality traits */}
          {avatar.personalityTraits.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mb-6">
              {avatar.personalityTraits.map((trait) => (
                <span
                  key={trait}
                  className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full"
                >
                  {trait}
                </span>
              ))}
            </div>
          )}

          {/* Token Balance Display (CORRECTED) */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
            <div className="flex items-center mb-3">
              <Coins className="w-4 h-4 text-purple-600 mr-2" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Token Balance
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Balance:
                </span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                  {session.tokenBalance} tokens
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Words left:
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {wordsRemaining.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Cost per message:
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {AI_COST_PER_MESSAGE} token
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Words per token:
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {AI_WORDS_PER_TOKEN}
                </span>
              </div>
            </div>
          </div>

          {/* Free messages indicator */}
          {freeMessagesLeft > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
              <div className="flex items-center">
                <Sparkles className="w-4 h-4 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {freeMessagesLeft} free message{freeMessagesLeft !== 1 ? 's' : ''} left
                </span>
              </div>
            </div>
          )}

          {/* View Profile link */}
          <button
            onClick={() => router.push(`/ai/profile/${avatar.id}`)}
            className="w-full py-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-center"
          >
            View Full Profile
          </button>

          {/* No Refund Notice */}
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-start">
              <AlertTriangle className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-700 dark:text-gray-300">
                All AI chat usage is billed per message. Unused tokens are not refundable.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back button (mobile) */}
              <button
                onClick={() => router.push('/ai')}
                className="md:hidden w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>

              {/* Avatar */}
              {session.avatarPhoto ? (
                <img
                  src={session.avatarPhoto}
                  alt={session.avatarName}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold text-gray-900 dark:text-white">
                    {session.avatarName}
                  </h1>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-purple-600 text-white rounded-full">
                    <Bot className="w-2.5 h-2.5" />
                    AI
                  </span>
                </div>
                <p className="text-xs text-green-500">
                  {isTyping ? 'typing...' : 'online'}
                </p>
              </div>
            </div>

            {/* Token display (mobile-friendly) */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                    {session.tokenBalance}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">tokens</span>
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {wordsRemaining.toLocaleString()} words left
                </span>
              </div>
              {freeMessagesLeft > 0 && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" />
                  {freeMessagesLeft} free
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-purple-500 text-white rounded-br-sm'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>

                {message.role === 'ai' && message.tokensCost > 0 && (
                  <div className="mt-1.5 text-[10px] opacity-75 bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded inline-block">
                    🪙 {message.tokensCost} token · {message.wordCount} words
                  </div>
                )}

                {message.wasFree && message.role === 'ai' && (
                  <div className="mt-1.5 text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded inline-block">
                    FREE
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="text-gray-600 dark:text-gray-400 text-sm">●●●</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-end space-x-2 sm:space-x-3">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-2xl bg-gray-100 dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className={`rounded-full p-2.5 ${
                !inputText.trim() || sending
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-500 hover:bg-purple-600'
              } text-white font-bold transition-colors`}
            >
              {sending ? (
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Token Purchase Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <Coins className="w-12 h-12 text-purple-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {session.tokenBalance <= 0
                  ? 'No Tokens Remaining'
                  : 'Low Token Balance'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                You have <strong>{session.tokenBalance} tokens</strong> (
                {wordsRemaining.toLocaleString()} words) remaining.
                {session.tokenBalance <= 0 &&
                  ' Add more tokens to continue chatting.'}
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  router.push('/wallet');
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Buy Tokens
              </button>
              <button
                onClick={() => setShowTokenModal(false)}
                className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
