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
  addDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
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
import VoiceRecorder from '@/components/chat/VoiceRecorder';

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
  imageUrl?: string;
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
function buildSystemPrompt(avatar: AIAvatar, locale: string, sessionSummary?: string | null): string {
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

  // FIX 45: Personality sliders prompt (if available)
  const personalitySlidersPrompt = buildPersonalityPrompt(
    (avatar as any).personalitySliders ?? null
  );

  // FIX 45: Session memory — prepend previous conversation context
  const memorySection = sessionSummary
    ? `Previous conversation context: ${sessionSummary}\n\n`
    : '';

  // FIX 52: Profession base prompt (if available)
  const professionPrompt = (avatar as any).basePrompt
    ? `${(avatar as any).basePrompt}\n\n`
    : '';

  // FIX 53: Game instructions
  const gameInstructions =
    `You can play interactive games when asked:\n` +
    `- 20 Questions: Ask yes/no questions to guess what user is thinking\n` +
    `- Movie Quiz: Describe movie plots for user to guess\n` +
    `- Would You Rather: Present creative dilemma choices\n` +
    `- Trivia: Ask fun trivia questions with multiple choice\n` +
    `- Story Chain: Build a story together, alternating sentences\n` +
    `- Emoji Riddles: Describe things with only emojis\n` +
    `When playing games, stay in game mode until the user says they want to stop.\n\n`;

  // BUG 2: Character prompt from avatar data
  return (
    languageInstruction +
    memorySection +
    professionPrompt +
    `You are ${avatar.name}, a ${avatar.age} year old AI companion. ` +
    `Personality: ${personalityStr}. ` +
    (personalitySlidersPrompt ? personalitySlidersPrompt + ' ' : '') +
    `Background: ${backstoryStr}. ` +
    `Stay in character. Answer questions directly and naturally.\n\n` +
    gameInstructions +
    `Always respond in the same language the user writes in. ` +
    `Detect language from each message and mirror it exactly.`
  );
}

/**
 * FIX 45/46: Build personality-shaping prompt from slider values.
 * Sliders map: { humor, flirt, intellect, energy, empathy } each 0-10.
 */
function buildPersonalityPrompt(sliders: Record<string, number> | null): string {
  if (!sliders) return '';
  let prompt = '';
  if (sliders.humor > 7) prompt += 'You love humor, jokes, and witty remarks. ';
  else if (sliders.humor < 3) prompt += 'You are serious and straightforward. ';

  if (sliders.flirt > 7) prompt += 'You are playfully flirty but always respectful. ';
  else if (sliders.flirt < 3) prompt += 'You keep conversations purely friendly, no flirting. ';

  if (sliders.intellect > 7) prompt += 'You enjoy deep, philosophical, and intellectual discussions. ';
  else if (sliders.intellect < 3) prompt += 'You prefer simple, everyday conversation topics. ';

  if (sliders.energy > 7) prompt += 'You are enthusiastic, use exclamation marks, and radiate positive energy! ';
  else if (sliders.energy < 3) prompt += 'You are calm, measured, and speak softly. ';

  if (sliders.empathy > 7) prompt += 'You are deeply caring, always ask how the person feels. ';
  else if (sliders.empathy < 3) prompt += 'You focus on facts and topics rather than feelings. ';

  return prompt;
}

/**
 * 2.2: Get the current UI locale from the document, cookie, or fallback to navigator.
 */
function getUILocale(): string {
  if (typeof document !== 'undefined') {
    // 1. Check HTML lang attribute (set by Next.js i18n)
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang.split('-')[0];
    // 2. Check NEXT_LOCALE cookie
    const cookieMatch = document.cookie.match(/NEXT_LOCALE=(\w+)/);
    if (cookieMatch?.[1]) return cookieMatch[1];
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.split('-')[0];
  }
  return 'en';
}

/**
 * Fix 4: Generate a language-aware welcome message.
 */
function getWelcomeMessage(name: string, bio: string, locale: string): string {
  if (locale === 'pl') {
    return `Cześć! Jestem ${name}. ${bio || 'Chętnie porozmawiam!'} Jak mogę Ci pomóc?`;
  }
  return `Hi! I'm ${name}. ${bio || "I'd love to chat with you!"} How can I help you today?`;
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
  const [avatarData, setAvatarData] = useState<AIAvatar | null>(null);
  const [session, setSession] = useState<ChatSessionState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  /** 2.3: Controls visibility of disclaimer tooltip */
  const [showDisclaimerTooltip, setShowDisclaimerTooltip] = useState(false);
  /** FIX 45: Session summary from previous conversations */
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  /** FIX 51: Rating state */
  const [hasRated, setHasRated] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  /** FIX 53: Game menu state */
  const [showGameMenu, setShowGameMenu] = useState(false);
  /** FIX 54: Story mode indicator */
  const [isStoryMode, setIsStoryMode] = useState(false);
  /** Escrow system state */
  const [escrowBalance, setEscrowBalance] = useState<number>(0);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState(50);
  const [walletBalanceForDeposit, setWalletBalanceForDeposit] = useState(0);
  /** BUG 5: tracks whether resumed toast has been shown */
  const resumedToastShown = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** FIX 137: Queue for messages sent while AI is responding */
  const pendingMessages = useRef<string[]>([]);
  /** FIX 137: Ref to track if AI is currently processing (avoids stale closure issues) */
  const processingRef = useRef(false);
  /** Strict Mode guard: prevent double-invoke of initializeChat for the same avatarId */
  const initializedRef = useRef<string | null>(null);
  /** FIX 2: Prevent message duplication — track which chatId has had messages loaded */
  const messagesLoadedRef = useRef<string | null>(null);
  /** Image upload state for AI chat */
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── 2.1: Real-time wallet balance via onSnapshot — matches /wallet page field priority ──
  useEffect(() => {
    if (!user?.uid) return;
    let active = true;

    const refreshFromCallable = async () => {
      try {
        const { getTokenBalance } = await import('@/lib/services/tokenService');
        const balance = await getTokenBalance(user.uid);
        if (active) {
          setSession((prev) =>
            prev ? { ...prev, tokenBalance: balance } : prev
          );
        }
      } catch {
        // silent fallback
      }
    };

    // Seed from callable so balance reflects post-checkout even if listener is restricted
    void refreshFromCallable();

    const unsub = onSnapshot(
      doc(requireDb(), 'wallets', user.uid),
      (snap) => {
        if (snap.exists()) {
          const newBalance = snap.data().tokensBalance ?? snap.data().tokenBalance ?? snap.data().balance ?? 0;
          setSession((prev) =>
            prev ? { ...prev, tokenBalance: newBalance } : prev
          );
        } else {
          void refreshFromCallable();
        }
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.warn('[AIChatPage] Wallet listener error:', error);
        }
        void refreshFromCallable();
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user?.uid]);

  // ── Load avatar + initialize session ─────────────────────────────────
  useEffect(() => {
    if (!avatarId) return;
    initializeChat();
    return () => {
      initializedRef.current = null;  // Reset on unmount/avatarId change, NOT on every run
    };
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
    // Strict Mode guard: skip if already initialized for this avatarId
    if (initializedRef.current === avatarId) return;
    initializedRef.current = avatarId;

    try {
      setLoading(true);

      // FIX: Clear messages on re-entry to prevent duplication
      setMessages([]);

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
        conversationCount: d.conversationCount || d.totalConversations || 0,
        totalRatings: d.totalRatings || d.ratingCount || 0,
        profession: d.profession || '',
        basePrompt: d.basePrompt || '',
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
      };

      setAvatar(loadedAvatar);
      setAvatarData(loadedAvatar);

      // FIX 51: Increment conversation count on chat start
      updateDoc(doc(requireDb(), 'ai_avatars', avatarId), {
        conversationCount: increment(1),
      }).catch(() => {});

      // Load user's token balance from wallet (initial fetch; onSnapshot keeps it live)
      let tokenBalance = 0;
      if (user?.uid) {
        try {
          const walletRef = doc(requireDb(), 'wallets', user.uid);
          const walletSnap = await getDoc(walletRef);
          if (walletSnap.exists()) {
            tokenBalance = walletSnap.data().tokensBalance ?? walletSnap.data().tokenBalance ?? walletSnap.data().balance ?? 0;
          }
        } catch (walletErr) {
          console.warn('[AIChatPage] Could not load wallet:', walletErr);
        }

        // Load escrow status
        const chatId = `${user.uid}_${avatarId}`;
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const idToken = await currentUser.getIdToken();
            const escrowRes = await fetch('/api/ai/escrow', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({ action: 'status', chatId }),
            });
            const escrowData = await escrowRes.json();
            if (escrowData.success && escrowData.status === 'active' && escrowData.remainingTokens > 0) {
              setEscrowBalance(escrowData.remainingTokens);
            } else {
              // Only show deposit modal if free messages are exhausted
              // Free messages are tracked in session state after init
              // Don't show deposit modal here — let the session state determine it
              // The deposit modal will show when user tries to send after free messages run out
            }
          } else {
            // No current user — deposit modal will show when needed
          }
        } catch {
          // Escrow check failed — deposit modal will show when needed
        }

        setWalletBalanceForDeposit(tokenBalance);
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
                imageUrl: data.imageUrl ?? undefined,
                timestamp: data.timestamp?.toDate?.() || new Date(),
                tokensCost: 0,
                wasFree: idx < AI_FREE_MESSAGES * 2, // approximate: first N exchanges are free
                wordCount: countWords(data.content || ''),
              };
            });

            // Deduplicate by role+content to handle React Strict Mode double-writes
            const seen = new Set<string>();
            persistedMessages = persistedMessages.filter(msg => {
              const key = `${msg.role}:::${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            // Count how many user messages were sent (for freeMessagesUsed tracking)
            persistedTotalSent = persistedMessages.filter((m) => m.role === 'user').length;
            persistedFreeUsed = Math.min(persistedTotalSent, AI_FREE_MESSAGES);
          }
        } catch (chatErr) {
          console.warn('[AIChatPage] Could not load chat history:', chatErr);
        }

        // FIX 45: Load session summary for cross-session memory
        try {
          const chatId = `${user.uid}_${avatarId}`;
          const summaryRef = doc(requireDb(), 'ai_chats', chatId, 'meta', 'summary');
          const summarySnap = await getDoc(summaryRef);
          if (summarySnap.exists()) {
            const summaryData = summarySnap.data();
            if (summaryData?.text) {
              setSessionSummary(summaryData.text);
            }
          }
        } catch (summaryErr) {
          console.warn('[AIChatPage] Could not load session summary:', summaryErr);
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
      // FIX 2: Only set messages once per chatId to prevent duplication on re-render
      const chatIdForMessages = user?.uid ? `${user.uid}_${avatarId}` : avatarId;
      if (messagesLoadedRef.current !== chatIdForMessages) {
        messagesLoadedRef.current = chatIdForMessages;
        // Fix 4: Language-aware welcome message
        const locale = getUILocale();
        const welcomeMsg: Message = {
          id: 'welcome',
          role: 'ai',
          content: getWelcomeMessage(loadedAvatar.name, loadedAvatar.bio || '', locale),
          timestamp: new Date(),
          tokensCost: 0,
          wasFree: true,
          wordCount: 0,
        };
        setMessages(persistedMessages.length > 0 ? persistedMessages : [welcomeMsg]);
      }
    } catch (error: any) {
      console.error('[AIChatPage] Failed to initialize chat:', error);
    } finally {
      setLoading(false);
    }
  };

  // FIX 45: Save session summary on unmount (when user navigates away)
  // Uses a ref to access latest messages without triggering re-renders
  const messagesRef2 = useRef(messages);
  messagesRef2.current = messages;
  /** FIX 137: Ref for latest session state (used in processAIResponse for queue processing) */
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    return () => {
      // Cleanup: generate and save session summary
      const currentMessages = messagesRef2.current;
      const uid = user?.uid;
      if (!uid || !avatarId || currentMessages.length < 4) return;

      const chatId = `${uid}_${avatarId}`;
      const summaryPrompt = currentMessages
        .filter((m) => m.id !== 'welcome')
        .slice(-20)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      // Best-effort: save a simple summary of topics discussed
      const topicSummary = currentMessages
        .filter((m) => m.role === 'user' && m.id !== 'welcome')
        .slice(-5)
        .map((m) => m.content.slice(0, 100))
        .join('; ');

      const summaryText = `User discussed: ${topicSummary}. Total ${currentMessages.length} messages exchanged.`;

      setDoc(
        doc(requireDb(), 'ai_chats', chatId, 'meta', 'summary'),
        { text: summaryText, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch((err) => console.warn('[AIChatPage] Failed to save session summary:', err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, avatarId]);

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

  /**
   * FIX 137: Non-blocking send handler — user can type and send freely at any speed.
   * Messages appear instantly. Bot responses queue and process in order.
   */
  const handleSend = async () => {
    const isFree = (session?.freeMessagesUsed ?? 0) < AI_FREE_MESSAGES;
    if (!isFree) {
      const messageCost = (avatarData?.costPerMessage ?? 1) + (selectedImage ? 3 : 0);
      if (escrowBalance < messageCost) {
        setShowDepositModal(true);
        return;
      }
    }
    if ((!inputText.trim() && !selectedImage) || !session || !avatar) return;

    // FIX 54: Detect "end the story" to disable story mode
    if (isStoryMode && inputText.toLowerCase().includes('end the story')) {
      setIsStoryMode(false);
    }

    const content = inputText.trim();

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content || '📷 Image',
      imageUrl: imagePreview ?? undefined,
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
      wordCount: countWords(content),
    };

    // FIX 137: Show user message IMMEDIATELY (optimistic)
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      messagesRef2.current = updated; // Keep ref in sync for queue processing
      return updated;
    });
    setInputText('');

    // FIX 137: Persist user message to Firestore immediately (don't wait for bot)
    if (user?.uid) {
      const chatId = `${user.uid}_${avatarId}`;
      const messagesCol = collection(requireDb(), 'ai_chats', chatId, 'messages');
      addDoc(messagesCol, {
        role: 'user',
        content,
        imageUrl: imagePreview ?? null,
        timestamp: serverTimestamp(),
      }).catch((err) => console.warn('[AIChatPage] Failed to persist user message:', err));
    }

    // FIX 137: If bot is busy generating, queue this message and return
    if (processingRef.current) {
      pendingMessages.current.push(content);
      return;
    }

    // FIX 137: Process this message (get AI response)
    await processAIResponse(content);
  };

  /**
   * FIX 137: Process AI response for a user message, with sequential queue draining.
   * Preserves all existing business logic: free messages, token balance, "Later" mode.
   */
  const processAIResponse = async (userContent: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession || !avatar) return;

    processingRef.current = true;
    setSending(true);
    setIsTyping(true);

    try {
      // Determine if this message is free
      const isFreeMessage = currentSession.freeMessagesUsed < AI_FREE_MESSAGES;

      // BUG 4: Check if user is in "Later" extended mode
      const isLaterFreeMessage =
        !isFreeMessage &&
        currentSession.freeExtended &&
        currentSession.laterMessageCount < LATER_FREE_MESSAGE_LIMIT;

      // Check balance if not free and not in "Later" allowance
      if (!isFreeMessage && !isLaterFreeMessage && currentSession.tokenBalance < AI_COST_PER_MESSAGE) {
        setShowTokenModal(true);
        setIsTyping(false);
        setSending(false);
        processingRef.current = false;
        return;
      }

      // 2.2: Build system prompt with locale + FIX 45: session memory
      const locale = getUILocale();
      const systemPrompt = buildSystemPrompt(avatar, locale, sessionSummary);

      // BUG 3 + FIX 45: Build conversation history for Anthropic (excluding welcome messages)
      // Limit to last 20 messages to stay within context window
      const currentMessages = messagesRef2.current;
      const conversationHistory = currentMessages
        .filter((m) => m.id !== 'welcome')
        .slice(-20)
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
        processingRef.current = false;
        return;
      }

      const chatId = `${user?.uid}_${avatarId}`;
      const imageCost = selectedImage ? 3 : 0;
      const totalCost = (avatarData?.costPerMessage ?? 1) + imageCost;

      const formData = new FormData();
      formData.append('systemPrompt', systemPrompt);
      formData.append('messages', JSON.stringify(conversationHistory));
      formData.append('avatarId', currentSession.avatarId);
      formData.append('userMessage', userContent);
      formData.append('chatId', chatId ?? '');
      formData.append('tokensToDeduct', String(totalCost));
      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      clearImage();

      const data = await response.json();

      if (data.remainingTokens !== undefined) {
        setEscrowBalance(data.remainingTokens);
      }

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
        setMessages((prev) => {
          const updated = [...prev, aiMessage];
          messagesRef2.current = updated; // Keep ref in sync for queue processing
          return updated;
        });

        // FIX 137: Persist AI message to Firestore (user message already persisted in handleSend)
        if (user?.uid) {
          const chatId = `${user.uid}_${avatarId}`;
          const messagesCol = collection(requireDb(), 'ai_chats', chatId, 'messages');
          const recentMsgs = messagesRef2?.current ?? messages;
          const aiReplyText = data.reply;
          const alreadySaved = recentMsgs.slice(-3).some(
            m => m.role === 'ai' &&
            (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) ===
            (typeof aiReplyText === 'string' ? aiReplyText : JSON.stringify(aiReplyText))
          );
          if (alreadySaved) {
            // skip addDoc — message already in state, likely Strict Mode duplicate
          } else {
            addDoc(messagesCol, {
              role: 'ai',
              content: data.reply,
              timestamp: serverTimestamp(),
            }).catch((err) => console.warn('[AIChatPage] Failed to persist AI message:', err));
          }
        }

        setSession((prev) => {
          if (!prev) return null;
          const updated = {
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
                ? 'AWAITING_DEPOSIT' as const
                : isFreeMessage &&
                    prev.freeMessagesUsed + 1 >= AI_FREE_MESSAGES
                  ? 'PAID_ACTIVE' as const
                  : prev.state,
          };
          sessionRef.current = updated; // FIX 137: Keep ref in sync for queue processing
          return updated;
        });

        // BUG 4: Show paywall if "Later" messages exhausted
        if (
          isLaterFreeMessage &&
          currentSession.laterMessageCount + 1 >= LATER_FREE_MESSAGE_LIMIT
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
      processingRef.current = false;
      // Auto-focus input after sending message
      inputRef.current?.focus();

      // FIX 137: Process next queued message if any
      if (pendingMessages.current.length > 0) {
        const nextMsg = pendingMessages.current.shift()!;
        await processAIResponse(nextMsg);
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ type: 'error', title: 'Only images allowed' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ type: 'error', title: 'Image too large', description: 'Max 5MB' });
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Check if balance is sufficient for image message (only if free messages exhausted)
    const isFreeMsg = session?.freeMessagesUsed !== undefined && session.freeMessagesUsed < AI_FREE_MESSAGES;
    if (!isFreeMsg) {
      const imageCost = (avatarData?.costPerMessage ?? 1) + 3;
      if (escrowBalance < imageCost) {
        setShowDepositModal(true);
      }
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const depositToEscrow = async (amount: number) => {
    if ((session?.tokenBalance ?? 0) === 0) {
      window.location.href = `/wallet/buy?from_chat=${encodeURIComponent(avatarId ?? '')}`;
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser || !user?.uid) return;
    try {
      const idToken = await currentUser.getIdToken();
      const chatId = `${user.uid}_${avatarId}`;
      const res = await fetch('/api/ai/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'deposit', chatId, amount }),
      });
      const data = await res.json();
      if (data.success) {
        setEscrowBalance(data.remainingTokens);
        setSession(prev => prev ? { ...prev, tokenBalance: data.walletBalance } : prev);
        setShowDepositModal(false);
      } else {
        toast({ type: 'error', title: 'Deposit failed', description: data.error });
      }
    } catch {
      toast({ type: 'error', title: 'Deposit failed', description: 'Please try again' });
    }
  };

  const endChatWithRefund = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !user?.uid) return;
    try {
      const idToken = await currentUser.getIdToken();
      const chatId = `${user.uid}_${avatarId}`;
      const res = await fetch('/api/ai/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'refund', chatId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ type: 'success', title: `${data.refundedTokens} tokens returned to wallet` });
        setSession(prev => prev ? { ...prev, tokenBalance: data.walletBalance } : prev);
        setEscrowBalance(0);
        setShowDepositModal(true);
      }
    } catch {
      toast({ type: 'error', title: 'Refund failed', description: 'Please try again' });
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
   * FIX 51: Submit rating for the AI avatar.
   * Updates averageRating and totalRatings in Firestore.
   */
  const submitRating = async (rating: number) => {
    try {
      const avatarRef = doc(requireDb(), 'ai_avatars', avatarId);
      const avatarSnap = await getDoc(avatarRef);
      const data = avatarSnap.data();
      const totalRatings = (data?.totalRatings || 0) + 1;
      const currentAvg = data?.averageRating || 0;
      const newAvg = ((currentAvg * (totalRatings - 1)) + rating) / totalRatings;
      await updateDoc(avatarRef, { averageRating: newAvg, totalRatings });
      setHasRated(true);
      toast({ type: 'success', title: 'Thank you!', description: `You rated this companion ${rating}/5` });
    } catch (err) {
      console.error('[AIChatPage] Failed to submit rating:', err);
    }
  };

  /**
   * FIX 53: Send a message programmatically (used by game menu).
   * Also detects Story Chain to enable story mode (FIX 54).
   * FIX 137: Non-blocking — delegates to processAIResponse with queue support.
   */
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !session || !avatar) return;

    // FIX 54: Detect Story Chain game
    if (text.toLowerCase().includes('story chain')) {
      setIsStoryMode(true);
    }

    const content = text.trim();

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
      wordCount: countWords(content),
    };

    // FIX 137: Show user message IMMEDIATELY
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      messagesRef2.current = updated;
      return updated;
    });

    // FIX 137: Persist user message to Firestore immediately
    if (user?.uid) {
      const chatId = `${user.uid}_${avatarId}`;
      const messagesCol = collection(requireDb(), 'ai_chats', chatId, 'messages');
      addDoc(messagesCol, {
        role: 'user',
        content,
        timestamp: serverTimestamp(),
      }).catch(() => {});
    }

    // FIX 137: If bot is busy generating, queue this message
    if (processingRef.current) {
      pendingMessages.current.push(content);
      return;
    }

    // FIX 137: Process this message
    await processAIResponse(content);
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
                  {escrowBalance} tokens (in escrow)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Cost:
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {avatarData?.costPerMessage ?? 1} token{(avatarData?.costPerMessage ?? 1) > 1 ? 's' : ''} / message
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
            {escrowBalance > 0 && (
              <button
                onClick={endChatWithRefund}
                className="w-full mt-2 py-1.5 px-3 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
              >
                End Chat & Refund {escrowBalance} tokens
              </button>
            )}
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

        {/* FIX 54: Story mode indicator */}
        {isStoryMode && (
          <div className="text-center text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 py-1">
            📖 Collaborative Story Mode — say &quot;end the story&quot; to finish
          </div>
        )}

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
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="attachment"
                    className="mt-2 max-w-[200px] rounded-lg border border-white/20"
                  />
                )}

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

        {/* FIX 51: Rating prompt (after 5+ user messages) */}
        {messages.filter(m => m.role === 'user').length >= 5 && !hasRated && (
          <div className="text-center py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Rate this conversation</p>
            <div className="flex justify-center gap-1">
              {[1,2,3,4,5].map(star => (
                <button key={star}
                  onClick={() => submitRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="text-xl hover:scale-125 transition">
                  {star <= hoverRating ? '⭐' : '☆'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Escrow empty indicator */}
        {(session?.freeMessagesUsed ?? 0) >= AI_FREE_MESSAGES &&
         escrowBalance < (avatarData?.costPerMessage ?? 1) + (selectedImage ? 3 : 0) && (
          <p className="text-xs text-center text-orange-500 mb-1">
            Not enough tokens (need {(avatarData?.costPerMessage ?? 1) + (selectedImage ? 3 : 0)}, have {escrowBalance}) —{' '}
            <button onClick={() => setShowDepositModal(true)} className="underline font-medium">
              deposit tokens to continue
            </button>
          </p>
        )}

        {/* Input Bar */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 relative">
          {/* Image preview */}
          {imagePreview && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <div className="relative">
                <img src={imagePreview} alt="attachment" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                <button
                  onClick={clearImage}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs"
                >×</button>
              </div>
              <span className="text-xs text-gray-500">
                {avatarData?.costPerMessage ?? 1} + 3 = {(avatarData?.costPerMessage ?? 1) + 3} tokens total
              </span>
            </div>
          )}

          {/* Hidden file input for image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* FIX 53: Game menu popup */}
          {showGameMenu && (
            <div className="absolute bottom-16 left-4 bg-white dark:bg-gray-800 shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 p-3 z-10 w-64">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white mb-2">Play a game!</h4>
              {[
                { id: 'twenty_questions', label: '20 Questions', emoji: '❓' },
                { id: 'movie_quiz', label: 'Movie Quiz', emoji: '🎬' },
                { id: 'would_you_rather', label: 'Would You Rather', emoji: '🤔' },
                { id: 'trivia', label: 'Trivia', emoji: '🧠' },
                { id: 'story_chain', label: 'Story Chain', emoji: '📖' },
                { id: 'emoji_riddle', label: 'Emoji Riddles', emoji: '🎯' },
              ].map(game => (
                <button key={game.id} onClick={() => {
                  const gamePrompt = `Let's play ${game.label}!`;
                  handleSendMessage(gamePrompt);
                  setShowGameMenu(false);
                }}
                  className="flex items-center gap-2 w-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-left">
                  <span className="text-xl">{game.emoji}</span>
                  <span className="text-sm text-gray-900 dark:text-white">{game.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end space-x-2 sm:space-x-3">
            {/* FIX 53: Games button */}
            <button onClick={() => setShowGameMenu(!showGameMenu)}
              className="p-2 text-gray-400 hover:text-[#E4458F] transition-colors rounded-full">
              🎮
            </button>

            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-2xl bg-gray-100 dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32"
              rows={1}
              /* FIX 137: Input is ALWAYS enabled — no disabled prop */
            />

            {/* Image attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-purple-500 transition-colors"
              title="Attach image (+3 tokens)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* FIX 55: Voice recorder */}
            <VoiceRecorder onRecorded={async (blob, duration) => {
              // MVP: AI bot receives placeholder for voice messages
              // Persist voice message metadata
              if (user?.uid) {
                const chatId = `${user.uid}_${avatarId}`;
                const messagesCol = collection(requireDb(), 'ai_chats', chatId, 'messages');
                addDoc(messagesCol, {
                  role: 'user',
                  content: '[Voice message]',
                  type: 'voice',
                  voiceDuration: duration,
                  timestamp: serverTimestamp(),
                }).catch((err) => console.warn('[AIChatPage] Failed to persist voice message:', err));
              }
              // Send placeholder to AI via handleSendMessage
              handleSendMessage('[User sent a voice message]');
            }} />

            <button
              onClick={handleSend}
              disabled={sending || (
                session?.freeMessagesUsed !== undefined &&
                session.freeMessagesUsed >= AI_FREE_MESSAGES &&
                escrowBalance < (avatarData?.costPerMessage ?? 1) + (selectedImage ? 3 : 0)
              ) || (!inputText.trim() && !selectedImage)}
              className={`rounded-full p-2.5 ${
                sending || (
                  session?.freeMessagesUsed !== undefined &&
                  session.freeMessagesUsed >= AI_FREE_MESSAGES &&
                  escrowBalance < (avatarData?.costPerMessage ?? 1) + (selectedImage ? 3 : 0)
                ) || (!inputText.trim() && !selectedImage)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-500 hover:bg-purple-600'
              } text-white font-bold transition-colors`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Old paywall modal replaced by escrow deposit modal */}

      {/* Escrow Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-2">Start Chat</h2>
            <p className="text-sm text-gray-500 mb-4">
              Allocate tokens to this conversation. Unused tokens are refunded when you end the chat.
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium">Wallet balance: {session?.tokenBalance ?? walletBalanceForDeposit} tokens</label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={10}
                  max={Math.min(500, session?.tokenBalance ?? 500)}
                  value={depositAmount}
                  onChange={e => setDepositAmount(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-lg font-bold w-16 text-right">{depositAmount}</span>
              </div>
            </div>
            {(session?.tokenBalance ?? 0) === 0 ? (
              <button
                onClick={() => { window.location.href = `/wallet/buy?from_chat=${encodeURIComponent(avatarId ?? '')}`; }}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
              >
                Buy Tokens First
              </button>
            ) : (
              <button
                onClick={() => depositToEscrow(depositAmount)}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
              >
                Deposit {depositAmount} tokens
              </button>
            )}
            <button
              onClick={() => window.history.back()}
              className="w-full py-2 mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
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
