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
 * BUG FIXES APPLIED:
 *   BUG 1 — Language mirroring: system prompt instructs AI to detect and mirror user language.
 *   BUG 2 — Avatar personality: loads ai_avatars/{avatarId} fields and builds character prompt.
 *   BUG 3 — Direct Anthropic API: replaces sendAIMessageCallable with /api/ai/chat proxy.
 *           Stores messages in Firestore: ai_chats/{chatId}/messages/{messageId}.
 *   BUG 4 — "Later" button token gate: allows exactly 3 more messages after dismiss, then paywall again.
 *   BUG 5 — Post-purchase return: detects ?resumed=true param and shows welcome-back toast.
 *
 * OVERHAUL FIXES (2.x):
 *   2.1 — Token bridge: real-time wallet balance via onSnapshot on wallets/{uid}.
 *   2.2 — AI bot language detection: locale passed to system prompt.
 *   2.3 — Simplified Token Balance panel: removed "Words left" / "Words per token", added tooltip.
 *   2.5 — Auto-focus input after AI response.
 *   2.6 — Buy tokens: use wallet first (primary), buy more (secondary).
 *   2.7 — Post-purchase return: passes avatarId to checkout flow.
 *   2.8 — Chat history persistence: loads persisted messages from ai_chats/{chatId}/messages on init.
 *
 * Data source: Firestore 'ai_avatars/{avatarId}'
 */

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';
import {
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
  Info,
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
  /** BUG 4: true when user clicked "Later" on the paywall modal */
  freeExtended: boolean;
  /** BUG 4: count of messages sent after clicking "Later" (max 3) */
  laterMessageCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** BUG 4: maximum messages allowed after clicking "Later" on paywall */
const LATER_FREE_MESSAGE_LIMIT = 3;

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

/**
 * BUG 1 + BUG 2 + 2.2: Build system prompt from avatar data with language detection.
 *
 * - Loads avatar fields: name, age, personalityTraits, bio, backstory.
 * - Instructs the AI to stay in character.
 * - 2.2: Prepends critical language detection instruction with UI locale.
 * - BUG 1: Instructs the AI to mirror the user's language.
 */
function buildSystemPrompt(avatar: AIAvatar, locale: string): string {
  const personalityStr =
    avatar.personalityTraits.length > 0
      ? avatar.personalityTraits.join(', ')
      : 'Friendly and conversational';

  const backstoryStr = avatar.backstory || 'A thoughtful AI companion.';

  // 2.2: Language detection instruction prepended
  const languageInstruction =
    `CRITICAL: Detect the user's language. The UI locale is: ${locale}. ` +
    `Your FIRST message must be in the UI language. For all subsequent messages, ` +
    `respond in whatever language the user writes in. Never default to English ` +
    `unless the user writes in English.\n\n`;

  // BUG 2: Character prompt from avatar data
  return (
    languageInstruction +
    `You are ${avatar.name}, a ${avatar.age} year old AI companion. ` +
    `Personality: ${personalityStr}. ` +
    `Background: ${backstoryStr}. ` +
    `Stay in character. Answer questions directly and naturally.\n\n` +
    `Always respond in the same language the user writes in. ` +
    `Detect language from each message and mirror it exactly.`
  );
}

/**
 * 2.2: Get the current UI locale from the document or fallback to navigator.
 */
function getUILocale(): string {
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}

// ============================================================================
// INNER COMPONENT (needs useSearchParams inside Suspense)
// ============================================================================

function AIChatAvatarPageInner() {
  const router = useRouter();
  const params = useParams()!;
  const searchParams = useSearchParams();
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
  /** 2.3: Controls visibility of disclaimer tooltip */
  const [showDisclaimerTooltip, setShowDisclaimerTooltip] = useState(false);
  /** BUG 5: tracks whether resumed toast has been shown */
  const resumedToastShown = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── BUG 5 + 2.7: Detect ?resumed=true or ?purchased=true and show toast ──
  useEffect(() => {
    if (resumedToastShown.current) return;
    const resumed = searchParams?.get('resumed');
    const purchased = searchParams?.get('purchased');
    if (resumed === 'true' || purchased === 'true') {
      resumedToastShown.current = true;
      toast({
        type: 'success',
        title: 'Welcome back!',
        description: 'Your tokens have been added.',
      });
      // Clean up the URL param without navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('resumed');
      url.searchParams.delete('purchased');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // ── 2.1: Real-time wallet balance via onSnapshot ─────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(requireDb(), 'wallets', user.uid), (snap) => {
      const newBalance = snap.exists() ? snap.data().balance || 0 : 0;
      setSession((prev) =>
        prev ? { ...prev, tokenBalance: newBalance } : prev
      );
    });
    return unsub;
  }, [user]);

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

  // ── 2.5: Auto-focus input after AI response ──────────────────────────
  useEffect(() => {
    if (
      messages.length > 0 &&
      (messages[messages.length - 1].role === 'ai')
    ) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages]);

  // ── Auto-show token modal when balance low ───────────────────────────
  useEffect(() => {
    if (
      session &&
      session.tokenBalance < 5 &&
      session.state === 'PAID_ACTIVE' &&
      session.freeMessagesUsed >= AI_FREE_MESSAGES &&
      // BUG 4: Don't auto-show if within "Later" allowance
      !(session.freeExtended && session.laterMessageCount < LATER_FREE_MESSAGE_LIMIT)
    ) {
      setShowTokenModal(true);
    }
  }, [session?.tokenBalance, session?.state, session?.freeMessagesUsed, session?.freeExtended, session?.laterMessageCount]);

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

      // Load user's token balance from wallet (initial fetch; onSnapshot keeps it live)
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

      // 2.8: Load persisted messages from ai_chats/{chatId}/messages
      let persistedMessages: Message[] = [];
      let persistedFreeUsed = 0;
      let persistedTotalSent = 0;

      if (user?.uid) {
        try {
          const chatId = `${user.uid}_${avatarId}`;
          const messagesRef = collection(requireDb(), 'ai_chats', chatId, 'messages');
          const q = query(messagesRef, orderBy('timestamp', 'asc'));
          const msgSnapshot = await getDocs(q);

          if (!msgSnapshot.empty) {
            persistedMessages = msgSnapshot.docs.map((docSnap, idx) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                role: data.role === 'user' ? 'user' as const : 'ai' as const,
                content: data.content || '',
                timestamp: data.timestamp?.toDate?.() || new Date(),
                tokensCost: 0,
                wasFree: idx < AI_FREE_MESSAGES * 2, // approximate: first N exchanges are free
                wordCount: countWords(data.content || ''),
              };
            });

            // Count how many user messages were sent (for freeMessagesUsed tracking)
            persistedTotalSent = persistedMessages.filter((m) => m.role === 'user').length;
            persistedFreeUsed = Math.min(persistedTotalSent, AI_FREE_MESSAGES);
          }
        } catch (chatErr) {
          console.warn('[AIChatPage] Could not load chat history:', chatErr);
        }
      }

      const chatSession: ChatSessionState = {
        avatarId: loadedAvatar.id,
        avatarName: loadedAvatar.name,
        avatarPhoto:
          loadedAvatar.photos && loadedAvatar.photos.length > 0
            ? loadedAvatar.photos[0]
            : null,
        state:
          persistedFreeUsed >= AI_FREE_MESSAGES
            ? tokenBalance > 0
              ? 'PAID_ACTIVE'
              : 'AWAITING_DEPOSIT'
            : 'FREE_ACTIVE',
        tokenBalance,
        freeMessagesUsed: persistedFreeUsed,
        totalMessagesSent: persistedTotalSent,
        freeExtended: false,
        laterMessageCount: 0,
      };

      setSession(chatSession);

      // 2.8: If persisted messages exist, use them; otherwise show welcome message
      if (persistedMessages.length > 0) {
        setMessages(persistedMessages);
      } else {
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
      }
    } catch (error: any) {
      console.error('[AIChatPage] Failed to initialize chat:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get Firebase ID token for the current user.
   * Used to authenticate requests to the /api/ai/chat route.
   */
  const getIdToken = useCallback(async (): Promise<string | null> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      return await currentUser.getIdToken();
    } catch {
      return null;
    }
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || !session || !avatar || sending) return;

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

      // BUG 4: Check if user is in "Later" extended mode
      const isLaterFreeMessage =
        !isFreeMessage &&
        session.freeExtended &&
        session.laterMessageCount < LATER_FREE_MESSAGE_LIMIT;

      // Check balance if not free and not in "Later" allowance
      if (!isFreeMessage && !isLaterFreeMessage && session.tokenBalance < AI_COST_PER_MESSAGE) {
        setShowTokenModal(true);
        setIsTyping(false);
        setSending(false);
        return;
      }

      // 2.2: Build system prompt with locale
      const locale = getUILocale();
      const systemPrompt = buildSystemPrompt(avatar, locale);

      // BUG 3: Build conversation history for Anthropic (excluding welcome messages)
      const conversationHistory = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        }));

      // BUG 3: Call server-side Anthropic proxy instead of httpsCallable
      const idToken = await getIdToken();
      if (!idToken) {
        toast({ type: 'error', title: 'Authentication required', description: 'Please sign in to chat.' });
        setIsTyping(false);
        setSending(false);
        return;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          systemPrompt,
          messages: conversationHistory,
          avatarId: session.avatarId,
          userMessage: userMessage.content,
        }),
      });

      const data = await response.json();

      if (data.success && data.reply) {
        const wordCount = countWords(data.reply);
        const effectivelyFree = isFreeMessage || isLaterFreeMessage;
        const tokenCost = effectivelyFree ? 0 : AI_COST_PER_MESSAGE;

        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: 'ai',
          content: data.reply,
          timestamp: new Date(),
          tokensCost: tokenCost,
          wasFree: effectivelyFree,
          wordCount,
        };

        setIsTyping(false);
        setMessages((prev) => [...prev, aiMessage]);

        setSession((prev) =>
          prev
            ? {
                ...prev,
                tokenBalance: effectivelyFree
                  ? prev.tokenBalance
                  : prev.tokenBalance - tokenCost,
                freeMessagesUsed: isFreeMessage
                  ? prev.freeMessagesUsed + 1
                  : prev.freeMessagesUsed,
                totalMessagesSent: prev.totalMessagesSent + 1,
                // BUG 4: Track "Later" message count
                laterMessageCount: isLaterFreeMessage
                  ? prev.laterMessageCount + 1
                  : prev.laterMessageCount,
                state:
                  !effectivelyFree && prev.tokenBalance - tokenCost <= 0
                    ? 'AWAITING_DEPOSIT'
                    : isFreeMessage &&
                        prev.freeMessagesUsed + 1 >= AI_FREE_MESSAGES
                      ? 'PAID_ACTIVE'
                      : prev.state,
              }
            : null
        );

        // BUG 4: Show paywall if "Later" messages exhausted
        if (
          isLaterFreeMessage &&
          session.laterMessageCount + 1 >= LATER_FREE_MESSAGE_LIMIT
        ) {
          setShowTokenModal(true);
        }

        return;
      }

      // If the API call failed, show the error
      const errorMsg = data.error || 'Failed to get AI response';
      console.error('[AIChatPage] API error:', errorMsg);
      toast({ type: 'error', title: 'AI Error', description: errorMsg });
      setIsTyping(false);
    } catch (error: any) {
      setIsTyping(false);
      console.error('[AIChatPage] Failed to send message:', error);
      toast({ type: 'error', title: 'Error', description: 'Failed to send message. Please try again.' });
    } finally {
      setSending(false);
      // Auto-focus input after sending message
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * BUG 4: Handle "Later" button click on the paywall modal.
   * Sets freeExtended=true and allows exactly 3 more messages.
   * If already extended, do not allow further bypass.
   */
  const handleLaterClick = () => {
    setShowTokenModal(false);

    if (session && !session.freeExtended) {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              freeExtended: true,
              laterMessageCount: 0,
            }
          : null
      );
    }
    // If already extended (freeExtended === true), just close the modal.
    // The user has exhausted their 3 extra messages and will be prompted again on next send.
  };

  /**
   * 2.6: Handle "Use tokens from wallet" button — dismiss gate, let user continue.
   */
  const handleUseWalletTokens = () => {
    setShowTokenModal(false);
    // No special action needed — tokens are deducted per-message from wallets/{uid}
    // by the backend (onSnapshot keeps balance in sync).
    inputRef.current?.focus();
  };

  /**
   * BUG 5 + 2.7: Handle "Buy Tokens" button click in the paywall modal.
   * Stores return-to info in sessionStorage and navigates to wallet buy with from_chat param.
   */
  const handleBuyTokensClick = () => {
    setShowTokenModal(false);

    // BUG 5: Store return path so wallet/success can redirect back
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(
        'ai_chat_return_to',
        `/ai/chat/${avatarId}?purchased=true`
      );
    }

    // 2.7: Pass avatarId as from_chat param so checkout success_url includes it
    router.push(`/wallet/buy?from_chat=${encodeURIComponent(avatarId)}`);
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
  const freeMessagesLeft = Math.max(0, AI_FREE_MESSAGES - session.freeMessagesUsed);
  // BUG 4: Show remaining "Later" messages if in extended mode
  const laterMessagesLeft =
    session.freeExtended
      ? Math.max(0, LATER_FREE_MESSAGE_LIMIT - session.laterMessageCount)
      : 0;

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

          {/* 2.3: Simplified Token Balance Display */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
            <div className="flex items-center mb-3">
              <Coins className="w-4 h-4 text-purple-600 mr-2" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Token Balance
              </h3>
              {/* 2.3: ℹ️ icon tooltip for disclaimer */}
              <div className="relative ml-auto">
                <button
                  type="button"
                  aria-label="Billing information"
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  onMouseEnter={() => setShowDisclaimerTooltip(true)}
                  onMouseLeave={() => setShowDisclaimerTooltip(false)}
                  onClick={() => setShowDisclaimerTooltip((prev) => !prev)}
                >
                  <Info className="w-4 h-4" />
                </button>
                {showDisclaimerTooltip && (
                  <div className="absolute right-0 top-6 z-50 w-56 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg">
                    All AI chat usage is billed per message. Unused tokens are not refundable.
                    <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
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
                  Cost:
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {AI_COST_PER_MESSAGE} token / message
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Free messages left:
                </span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                  {freeMessagesLeft}
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

          {/* BUG 4: "Later" extended messages indicator */}
          {session.freeExtended && laterMessagesLeft > 0 && freeMessagesLeft === 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
              <div className="flex items-center">
                <Sparkles className="w-4 h-4 text-yellow-600 mr-2" />
                <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  {laterMessagesLeft} extended free message{laterMessagesLeft !== 1 ? 's' : ''} left
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
                  {freeMessagesLeft > 0 ? `${freeMessagesLeft} free left` : `${AI_COST_PER_MESSAGE} token/msg`}
                </span>
              </div>
              {freeMessagesLeft > 0 && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" />
                  {freeMessagesLeft} free
                </span>
              )}
              {/* BUG 4: Show "Later" allowance badge on mobile */}
              {session.freeExtended && laterMessagesLeft > 0 && freeMessagesLeft === 0 && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" />
                  {laterMessagesLeft} extra
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
              ref={inputRef}
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

      {/* 2.6: Token Purchase / Use Wallet Modal */}
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
                You have <strong>{session.tokenBalance} tokens</strong> remaining.
                {session.tokenBalance <= 0 &&
                  ' Add more tokens to continue chatting.'}
              </p>
              {/* BUG 4: Show "Later" allowance info if not yet extended */}
              {!session.freeExtended && (
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-2">
                  You can dismiss this once and get {LATER_FREE_MESSAGE_LIMIT} more free messages.
                </p>
              )}
              {session.freeExtended && session.laterMessageCount >= LATER_FREE_MESSAGE_LIMIT && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-2">
                  You&apos;ve used all {LATER_FREE_MESSAGE_LIMIT} extended free messages. Please purchase tokens to continue.
                </p>
              )}
            </div>
            <div className="space-y-3">
              {/* 2.6: If wallet has tokens, show "Use tokens" as PRIMARY */}
              {session.tokenBalance > 0 ? (
                <>
                  <button
                    onClick={handleUseWalletTokens}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    Use tokens from wallet ({session.tokenBalance} available)
                  </button>
                  <button
                    onClick={handleBuyTokensClick}
                    className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-xl transition-colors text-sm"
                  >
                    Buy more tokens
                  </button>
                </>
              ) : (
                /* 2.6: If wallet is empty, show only "Buy tokens" */
                <button
                  onClick={handleBuyTokensClick}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Buy Tokens
                </button>
              )}
              {/* BUG 4: "Later" button — only allows bypass if not already exhausted */}
              <button
                onClick={handleLaterClick}
                disabled={session.freeExtended && session.laterMessageCount >= LATER_FREE_MESSAGE_LIMIT}
                className={`w-full font-semibold py-3 rounded-xl transition-colors ${
                  session.freeExtended && session.laterMessageCount >= LATER_FREE_MESSAGE_LIMIT
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                }`}
              >
                {session.freeExtended && session.laterMessageCount >= LATER_FREE_MESSAGE_LIMIT
                  ? 'No more free messages'
                  : 'Later'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EXPORT (wraps inner component in Suspense for useSearchParams)
// ============================================================================

export default function AIChatAvatarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Connecting...</p>
          </div>
        </div>
      }
    >
      <AIChatAvatarPageInner />
    </Suspense>
  );
}
