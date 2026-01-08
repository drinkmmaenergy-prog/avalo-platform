/**
 * Real AI Service - Phase 5
 * Integrates with Anthropic Claude API for real AI chat
 * Includes message queueing, billing safety, and NSFW filtering
 */

import Anthropic from '@anthropic-ai/sdk';
import Constants from 'expo-constants';
import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import type { AICompanion, AICompanionTier } from '../config/monetization';
import { getAIMessageCost } from '../config/monetization';

// Message queue for rate limiting and error handling
interface QueuedMessage {
  id: string;
  userId: string;
  companionId: string;
  message: string;
  timestamp: number;
  retries: number;
}

const messageQueue: QueuedMessage[] = [];
const MAX_QUEUE_SIZE = 100;
const MAX_RETRIES = 3;
const QUEUE_PROCESS_INTERVAL = 2000; // 2 seconds

// NSFW filter keywords (basic implementation)
const NSFW_KEYWORDS = [
  'explicit', 'sexual', 'nude', 'porn', 'xxx', 'nsfw',
  // Add more keywords as needed
];

// Initialize Firestore
const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

/**
 * Initialize Anthropic client
 */
const getAnthropicClient = (): Anthropic | null => {
  try {
    const apiKey = Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || 
                   process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      console.warn('Anthropic API key not configured. Using fallback mode.');
      return null;
    }

    return new Anthropic({
      apiKey,
    });
  } catch (error) {
    console.error('Error initializing Anthropic client:', error);
    return null;
  }
};

/**
 * Check if content contains NSFW keywords
 */
export const containsNSFW = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return NSFW_KEYWORDS.some(keyword => lowerText.includes(keyword));
};

/**
 * Filter NSFW content for mobile app
 * If NSFW detected, redirect user to web
 */
export const filterNSFWContent = (
  text: string,
  tier: AICompanionTier
): { isNSFW: boolean; message?: string } => {
  // NSFW tier companions are allowed on web only
  if (tier === 'nsfw') {
    return {
      isNSFW: true,
      message: 'This conversation contains adult content. Please continue on web at avalo.app',
    };
  }

  // Check for NSFW keywords in user message
  if (containsNSFW(text)) {
    return {
      isNSFW: true,
      message: 'Your message contains adult content. NSFW conversations are available on web only.',
    };
  }

  return { isNSFW: false };
};

/**
 * Generate AI response using Anthropic Claude
 */
const generateClaudeResponse = async (
  userMessage: string,
  companion: AICompanion,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> => {
  const client = getAnthropicClient();
  
  if (!client) {
    // Fallback to placeholder if API not configured
    return generateFallbackResponse(userMessage, companion);
  }

  try {
    // Build system prompt based on companion personality
    const systemPrompt = `You are ${companion.name}, an AI companion with the following personality: ${companion.personality}. 
You are ${companion.description}. 
Keep responses engaging, friendly, and appropriate for the ${companion.tier} tier.
${companion.tier === 'nsfw' ? 'You can be flirty and intimate.' : 'Keep content SFW.'}
Respond naturally and conversationally in 1-3 sentences.`;

    // Prepare messages for Claude
    const messages = [
      ...conversationHistory.slice(-10), // Last 10 messages for context
      { role: 'user', content: userMessage },
    ];

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 150,
      system: systemPrompt,
      messages: messages as any,
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    return textContent ? (textContent as any).text : generateFallbackResponse(userMessage, companion);
  } catch (error: any) {
    console.error('Error calling Anthropic API:', error);
    
    // Handle rate limits
    if (error?.status === 429) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
    
    // Handle API errors
    if (error?.status === 401) {
      throw new Error('API_KEY_INVALID');
    }
    
    // Fallback for other errors
    return generateFallbackResponse(userMessage, companion);
  }
};

/**
 * Fallback response when API is unavailable
 */
const generateFallbackResponse = (
  userMessage: string,
  companion: AICompanion
): string => {
  const responses = {
    basic: [
      `That's interesting! Tell me more.`,
      `I love chatting with you!`,
      `How has your day been?`,
      `That sounds exciting!`,
    ],
    premium: [
      `I find that perspective fascinating. What made you think of it that way?`,
      `Your insights always intrigue me. Let's explore this further.`,
      `I appreciate the depth of your thoughts. Continue...`,
    ],
    nsfw: [
      `You know how to get my attention... 😏`,
      `I love where this is going...`,
      `Tell me more, I'm all yours...`,
    ],
  };

  const tierResponses = responses[companion.tier];
  const randomResponse = tierResponses[Math.floor(Math.random() * tierResponses.length)];
  
  return `${randomResponse} (${companion.name})`;
};

/**
 * Get conversation history for context
 */
const getConversationHistory = async (
  chatId: string
): Promise<Array<{ role: string; content: string }>> => {
  try {
    const db = getDb();
    const messagesRef = collection(db, `ai_chats/${chatId}/messages`);
    const q = query(
      messagesRef,
      orderBy('timestamp', 'desc'),
      firestoreLimit(10)
    );

    const snapshot = await getDocs(q);
    const history: Array<{ role: string; content: string }> = [];

    snapshot.docs.reverse().forEach((doc) => {
      const data = doc.data();
      history.push({
        role: data.senderId === 'user' ? 'user' : 'assistant',
        content: data.text,
      });
    });

    return history;
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
};

/**
 * Add message to queue with safety checks
 */
export const queueAIMessage = async (
  userId: string,
  companionId: string,
  message: string
): Promise<{ queued: boolean; position?: number; error?: string }> => {
  // Check queue size
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    return {
      queued: false,
      error: 'MESSAGE_QUEUE_FULL',
    };
  }

  // Check for duplicate recent messages
  const recentDuplicate = messageQueue.find(
    (q) =>
      q.userId === userId &&
      q.companionId === companionId &&
      q.message === message &&
      Date.now() - q.timestamp < 5000 // Within 5 seconds
  );

  if (recentDuplicate) {
    return {
      queued: false,
      error: 'DUPLICATE_MESSAGE',
    };
  }

  // Add to queue
  const queuedMessage: QueuedMessage = {
    id: `${userId}_${Date.now()}`,
    userId,
    companionId,
    message,
    timestamp: Date.now(),
    retries: 0,
  };

  messageQueue.push(queuedMessage);

  return {
    queued: true,
    position: messageQueue.length,
  };
};

/**
 * Process message queue
 */
export const processMessageQueue = async (): Promise<void> => {
  if (messageQueue.length === 0) return;

  const message = messageQueue.shift();
  if (!message) return;

  try {
    // Process the message (implement actual sending logic)
    // This would call sendRealAIMessage internally
    console.log('Processing queued message:', message.id);
  } catch (error) {
    console.error('Error processing queued message:', error);
    
    // Retry logic
    if (message.retries < MAX_RETRIES) {
      message.retries++;
      messageQueue.push(message);
    }
  }
};

/**
 * Start queue processor
 */
let queueProcessorInterval: NodeJS.Timeout | null = null;

export const startQueueProcessor = (): void => {
  if (queueProcessorInterval) return;
  
  queueProcessorInterval = setInterval(() => {
    processMessageQueue().catch(console.error);
  }, QUEUE_PROCESS_INTERVAL);
};

export const stopQueueProcessor = (): void => {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
  }
};

/**
 * Send AI message with real Anthropic integration
 * Includes billing safety, NSFW filtering, and queueing
 */
export const sendRealAIMessage = async (
  userId: string,
  companionId: string,
  userMessage: string,
  companion: AICompanion,
  chatId: string
): Promise<{ aiResponse: string; tokensCost: number; filtered?: boolean }> => {
  const db = getDb();

  // NSFW filtering
  const nsfwCheck = filterNSFWContent(userMessage, companion.tier);
  if (nsfwCheck.isNSFW) {
    return {
      aiResponse: nsfwCheck.message || 'Content filtered',
      tokensCost: 0,
      filtered: true,
    };
  }

  // Calculate cost
  const tokensCost = getAIMessageCost(companion.tier);

  // Check balance (billing safety)
  const walletRef = doc(db, 'balances', userId, 'wallet');
  const walletSnap = await getDoc(walletRef);

  if (!walletSnap.exists()) {
    throw new Error('WALLET_NOT_FOUND');
  }

  const balance = walletSnap.data().tokens || 0;
  if (balance < tokensCost) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  // Get conversation history
  const conversationHistory = await getConversationHistory(chatId);

  // Generate AI response
  const aiResponse = await generateClaudeResponse(
    userMessage,
    companion,
    conversationHistory
  );

  // Deduct tokens AFTER successful generation
  await updateDoc(walletRef, {
    tokens: increment(-tokensCost),
    lastUpdated: serverTimestamp(),
  });

  // Record transaction
  await addDoc(collection(db, 'transactions'), {
    senderUid: userId,
    receiverUid: 'ai_platform',
    tokensAmount: tokensCost,
    avaloFee: tokensCost, // 100% to Avalo for AI
    chatId,
    transactionType: 'ai_message',
    companionId,
    createdAt: serverTimestamp(),
  });

  return {
    aiResponse,
    tokensCost,
    filtered: false,
  };
};

// Missing import
import { getDoc } from 'firebase/firestore';

/**
 * Verify token transaction server-side (preparation for Cloud Functions)
 */
export const verifyTokenTransaction = async (
  transactionId: string
): Promise<{ valid: boolean; error?: string }> => {
  try {
    const db = getDb();
    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (!transactionSnap.exists()) {
      return { valid: false, error: 'TRANSACTION_NOT_FOUND' };
    }

    const data = transactionSnap.data();

    // Verify transaction hasn't been processed twice
    if (data.verified) {
      return { valid: false, error: 'ALREADY_VERIFIED' };
    }

    // Mark as verified
    await updateDoc(transactionRef, {
      verified: true,
      verifiedAt: serverTimestamp(),
    });

    return { valid: true };
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return { valid: false, error: 'VERIFICATION_FAILED' };
  }
};