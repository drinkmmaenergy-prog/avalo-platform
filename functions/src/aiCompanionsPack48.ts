/**
 * PACK 48 — Server-Side AI Chat Companions (Subscription + Token Billing)
 * Revenue: 100% Avalo
 * Billing: Monthly subscription tiers + token-per-message consumption
 * LLM: OpenAI / Anthropic with NSFW support
 * NO free tokens, NO discounts, NO refunds
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db, serverTimestamp, increment, admin } from './init.js';

// ============================================================================
// LLM CONFIGURATION
// ============================================================================

interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
}

const LLM_CONFIGS: Record<'sfw' | 'nsfw', LLMConfig> = {
  sfw: {
    provider: 'anthropic',
    model: 'claude-haiku-3.5',
    maxTokens: 350,
  },
  nsfw: {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    maxTokens: 350,
  },
};

// Token costs per message (deterministic)
const TOKEN_COST_PER_MESSAGE = {
  sfw: 2,    // 2 tokens per SFW AI message
  nsfw: 5,   // 5 tokens per NSFW AI message
};

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

interface SubscriptionTier {
  tier: 'Free' | 'Plus' | 'Premium';
  priceMonthly: number;
  dailyFreeMessages: number;
  nsfwAccess: boolean;
}

const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  Free: {
    tier: 'Free',
    priceMonthly: 0,
    dailyFreeMessages: 0, // NO free messages
    nsfwAccess: false,
  },
  Plus: {
    tier: 'Plus',
    priceMonthly: 39, // PLN
    dailyFreeMessages: 0, // NO free messages
    nsfwAccess: false,
  },
  Premium: {
    tier: 'Premium',
    priceMonthly: 79, // PLN
    dailyFreeMessages: 0, // NO free messages
    nsfwAccess: true,
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface AICompanion {
  companionId: string;
  displayName: string;
  avatarUrl: string;
  shortBio: string;
  personalityPreset: string;
  language: string;
  isNsfw: boolean;
  basePrompt: string;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

interface AIConversation {
  conversationId: string;
  userId: string;
  companionId: string;
  lastMessageAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

interface AIMessage {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  tokenCost: number;
  model: string;
  nsfwIncluded?: boolean;
}

interface AISubscription {
  userId: string;
  companionId: string;
  tier: 'Free' | 'Plus' | 'Premium';
  priceMonthly: number;
  dailyFreeMessages: number;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  renewedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  expiresAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get or create AI subscription for user+companion
 */
async function getOrCreateAISubscription(
  userId: string,
  companionId: string
): Promise<AISubscription> {
  const subDocId = `${userId}_${companionId}`;
  const subRef = db.collection('ai_subscriptions').doc(subDocId);
  const subSnap = await subRef.get();

  if (subSnap.exists) {
    return subSnap.data() as AISubscription;
  }

  // Create Free tier subscription
  const now = admin.firestore.Timestamp.now();
  const newSub: AISubscription = {
    userId,
    companionId,
    tier: 'Free',
    priceMonthly: 0,
    dailyFreeMessages: 0,
    createdAt: now,
    renewedAt: now,
    expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
  };

  await subRef.set(newSub);
  return newSub;
}

/**
 * Check if user has sufficient tokens
 */
async function checkTokenBalance(userId: string, required: number): Promise<boolean> {
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();

  if (!walletSnap.exists) {
    return false;
  }

  const balance = walletSnap.data()?.balance || 0;
  return balance >= required;
}

/**
 * Deduct tokens from user wallet
 */
async function deductTokens(
  userId: string,
  amount: number,
  reason: string,
  metadata: any
): Promise<void> {
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');

  await db.runTransaction(async (transaction) => {
    const walletSnap = await transaction.get(walletRef);

    if (!walletSnap.exists) {
      throw new HttpsError('failed-precondition', 'Wallet not found');
    }

    const balance = walletSnap.data()?.balance || 0;

    if (balance < amount) {
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_TOKENS');
    }

    transaction.update(walletRef, {
      balance: increment(-amount),
      spent: increment(amount),
      updatedAt: serverTimestamp(),
    });

    // Log transaction
    const txRef = db.collection('transactions').doc();
    transaction.set(txRef, {
      txId: txRef.id,
      uid: userId,
      type: 'ai_companion',
      amountTokens: amount,
      status: 'completed',
      reason,
      metadata,
      createdAt: serverTimestamp(),
    });
  });
}

/**
 * Call LLM for AI response
 */
async function callLLM(
  basePrompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
  isNsfw: boolean
): Promise<string> {
  const config = isNsfw ? LLM_CONFIGS.nsfw : LLM_CONFIGS.sfw;

  // TODO: Integrate with actual OpenAI/Anthropic API
  // For now, return mock response
  // In production, uncomment and configure:
  
  /*
  if (config.provider === 'openai') {
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: basePrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ],
      max_tokens: config.maxTokens,
    });

    return response.choices[0].message.content || '';
  }

  if (config.provider === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: basePrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ],
    });

    return response.content[0].text || '';
  }
  */

  // Mock response for development
  const responses = [
    "That's really interesting! Tell me more about that.",
    "I love hearing your thoughts on this. What else is on your mind?",
    "You have such a unique perspective! I'd love to explore this further with you.",
    "I'm really enjoying our conversation. What would you like to talk about next?",
    "That's fascinating! I hadn't thought about it that way before.",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * /ai/start-conversation
 * Create or return existing AI conversation
 */
export const startConversation = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Not authenticated');
    }

    const userId = request.auth.uid;
    const schema = z.object({
      companionId: z.string().min(1),
    });

    try {
      const { companionId } = schema.parse(request.data);

      // Get companion
      const companionRef = db.collection('ai_companions').doc(companionId);
      const companionSnap = await companionRef.get();

      if (!companionSnap.exists) {
        throw new HttpsError('not-found', 'AI companion not found');
      }

      const companion = companionSnap.data() as AICompanion;

      // Check subscription access
      const subscription = await getOrCreateAISubscription(userId, companionId);

      if (companion.isNsfw && subscription.tier !== 'Premium') {
        throw new HttpsError(
          'permission-denied',
          'NSFW companions require Premium subscription'
        );
      }

      // Check for existing conversation
      const existingConvSnap = await db
        .collection('ai_conversations')
        .where('userId', '==', userId)
        .where('companionId', '==', companionId)
        .limit(1)
        .get();

      if (!existingConvSnap.empty) {
        const conversationId = existingConvSnap.docs[0].id;
        return { ok: true, conversationId };
      }

      // Create new conversation
      const convRef = db.collection('ai_conversations').doc();
      const now = serverTimestamp();

      const newConversation: Omit<AIConversation, 'conversationId'> = {
        userId,
        companionId,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      };

      await convRef.set(newConversation);

      return { ok: true, conversationId: convRef.id };
    } catch (error: any) {
      console.error('[startConversation] Error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * /ai/send-message
 * Send message to AI and get response (with token billing)
 */
export const sendMessage = onCall(
  { region: 'europe-west3', memory: '1GiB', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Not authenticated');
    }

    const userId = request.auth.uid;
    const schema = z.object({
      conversationId: z.string().min(1),
      companionId: z.string().min(1),
      userMessage: z.string().min(1).max(1000),
    });

    try {
      const { conversationId, companionId, userMessage } = schema.parse(request.data);

      // Verify conversation ownership
      const convRef = db.collection('ai_conversations').doc(conversationId);
      const convSnap = await convRef.get();

      if (!convSnap.exists) {
        throw new HttpsError('not-found', 'Conversation not found');
      }

      const conversation = convSnap.data() as AIConversation;

      if (conversation.userId !== userId || conversation.companionId !== companionId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      // Get companion
      const companionSnap = await db.collection('ai_companions').doc(companionId).get();
      if (!companionSnap.exists) {
        throw new HttpsError('not-found', 'Companion not found');
      }

      const companion = companionSnap.data() as AICompanion;

      // Calculate token cost
      const tokenCost = companion.isNsfw
        ? TOKEN_COST_PER_MESSAGE.nsfw
        : TOKEN_COST_PER_MESSAGE.sfw;

      // Check token balance
      const hasBalance = await checkTokenBalance(userId, tokenCost);
      if (!hasBalance) {
        throw new HttpsError(
          'failed-precondition',
          'INSUFFICIENT_TOKENS',
          { required: tokenCost }
        );
      }

      // Get conversation history
      const historySnap = await db
        .collection('ai_conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const history = historySnap.docs
        .reverse()
        .map((doc) => {
          const msg = doc.data();
          return { role: msg.role, content: msg.text };
        });

      // Store user message
      const userMsgRef = db
        .collection('ai_conversations')
        .doc(conversationId)
        .collection('messages')
        .doc();

      const now = serverTimestamp();

      await userMsgRef.set({
        messageId: userMsgRef.id,
        role: 'user',
        text: userMessage,
        createdAt: now,
        tokenCost: 0,
        model: 'user',
      });

      // Call LLM
      const aiResponse = await callLLM(
        companion.basePrompt,
        history,
        userMessage,
        companion.isNsfw
      );

      // Store AI message
      const aiMsgRef = db
        .collection('ai_conversations')
        .doc(conversationId)
        .collection('messages')
        .doc();

      const config = companion.isNsfw ? LLM_CONFIGS.nsfw : LLM_CONFIGS.sfw;

      await aiMsgRef.set({
        messageId: aiMsgRef.id,
        role: 'assistant',
        text: aiResponse,
        createdAt: now,
        tokenCost,
        model: config.model,
        nsfwIncluded: companion.isNsfw,
      });

      // Deduct tokens (AFTER successful AI generation)
      await deductTokens(userId, tokenCost, 'ai_message', {
        conversationId,
        companionId,
        messageId: aiMsgRef.id,
        isNsfw: companion.isNsfw,
      });

      // Update conversation
      await convRef.update({
        lastMessageAt: now,
        updatedAt: now,
      });

      return {
        ok: true,
        userMessageId: userMsgRef.id,
        aiMessageId: aiMsgRef.id,
        aiResponse,
        tokenCost,
      };
    } catch (error: any) {
      console.error('[sendMessage] Error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * /ai/get-conversations
 * Get user's AI conversations
 */
export const getConversations = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Not authenticated');
    }

    const userId = request.auth.uid;

    try {
      const conversationsSnap = await db
        .collection('ai_conversations')
        .where('userId', '==', userId)
        .orderBy('lastMessageAt', 'desc')
        .limit(50)
        .get();

      const conversations = await Promise.all(
        conversationsSnap.docs.map(async (doc) => {
          const conv = doc.data() as AIConversation;

          // Get companion details
          const companionSnap = await db
            .collection('ai_companions')
            .doc(conv.companionId)
            .get();

          const companion = companionSnap.exists
            ? {
                companionId: companionSnap.id,
                displayName: companionSnap.data()?.displayName,
                avatarUrl: companionSnap.data()?.avatarUrl,
              }
            : null;

          return {
            conversationId: doc.id,
            ...conv,
            companion,
          };
        })
      );

      return { ok: true, conversations };
    } catch (error: any) {
      console.error('[getConversations] Error:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * /ai/get-messages
 * Get messages from a conversation (paginated)
 */
export const getMessages = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Not authenticated');
    }

    const userId = request.auth.uid;
    const schema = z.object({
      conversationId: z.string().min(1),
      limit: z.number().optional().default(50),
    });

    try {
      const { conversationId, limit } = schema.parse(request.data);

      // Verify conversation ownership
      const convRef = db.collection('ai_conversations').doc(conversationId);
      const convSnap = await convRef.get();

      if (!convSnap.exists) {
        throw new HttpsError('not-found', 'Conversation not found');
      }

      const conversation = convSnap.data() as AIConversation;

      if (conversation.userId !== userId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      // Get messages
      const messagesSnap = await db
        .collection('ai_conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const messages = messagesSnap.docs
        .map((doc) => ({
          messageId: doc.id,
          ...doc.data(),
        }))
        .reverse();

      return { ok: true, messages };
    } catch (error: any) {
      console.error('[getMessages] Error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message);
    }
  }
);

console.log('✅ PACK 48 — AI Companion functions initialized');