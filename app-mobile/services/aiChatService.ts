/**
 * AI Chat Service
 * Manages AI companion chats with token-based billing
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  AICompanionTier,
  getAIMessageCost,
} from '../config/monetization';
import type { AICompanion } from '../config/monetization';

// Re-export for convenience
export type { AICompanion, AICompanionTier };

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

export interface AIMessage {
  id: string;
  companionId: string;
  senderId: 'user' | 'ai';
  text: string;
  timestamp: Timestamp;
  tokensCost?: number;
}

export interface AIChat {
  id: string;
  userId: string;
  companionId: string;
  lastMessage: string;
  lastTimestamp: Timestamp;
  totalTokensSpent: number;
  messageCount: number;
}

/**
 * Available AI Companions
 */
export const AI_COMPANIONS: AICompanion[] = [
  {
    id: 'companion_basic_emma',
    name: 'Emma',
    avatar: '👩',
    description: 'Friendly and supportive companion',
    tier: 'basic',
    personality: 'warm, friendly, supportive',
  },
  {
    id: 'companion_basic_alex',
    name: 'Alex',
    avatar: '👨',
    description: 'Adventurous and fun companion',
    tier: 'basic',
    personality: 'adventurous, playful, energetic',
  },
  {
    id: 'companion_premium_sophia',
    name: 'Sophia',
    avatar: '👱‍♀️',
    description: 'Intelligent and engaging premium companion',
    tier: 'premium',
    personality: 'intelligent, witty, engaging',
  },
  {
    id: 'companion_premium_marcus',
    name: 'Marcus',
    avatar: '👨‍💼',
    description: 'Sophisticated premium companion',
    tier: 'premium',
    personality: 'sophisticated, charming, articulate',
  },
  {
    id: 'companion_nsfw_jessica',
    name: 'Jessica',
    avatar: '💋',
    description: 'Flirty and intimate NSFW companion',
    tier: 'nsfw',
    personality: 'flirty, intimate, playful',
  },
  {
    id: 'companion_nsfw_ryan',
    name: 'Ryan',
    avatar: '😏',
    description: 'Bold and passionate NSFW companion',
    tier: 'nsfw',
    personality: 'bold, passionate, confident',
  },
];

/**
 * Get companion details by ID
 */
export const getCompanionById = (companionId: string): AICompanion | undefined => {
  return AI_COMPANIONS.find((c) => c.id === companionId);
};

/**
 * Get all companions by tier
 */
export const getCompanionsByTier = (tier: AICompanionTier): AICompanion[] => {
  return AI_COMPANIONS.filter((c) => c.tier === tier);
};

/**
 * Get or create AI chat
 */
export const getOrCreateAIChat = async (
  userId: string,
  companionId: string
): Promise<string> => {
  try {
    const db = getDb();
    const chatId = `ai_${userId}_${companionId}`;
    const chatRef = doc(db, 'ai_chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      return chatId;
    }

    // Create new AI chat
    await setDoc(chatRef, {
      userId,
      companionId,
      lastMessage: 'Chat started',
      lastTimestamp: serverTimestamp(),
      totalTokensSpent: 0,
      messageCount: 0,
    });

    return chatId;
  } catch (error) {
    console.error('Error getting/creating AI chat:', error);
    throw error;
  }
};

/**
 * Send message to AI and get response
 */
export const sendAIMessage = async (
  userId: string,
  companionId: string,
  userMessage: string
): Promise<{ aiResponse: string; tokensCost: number }> => {
  try {
    const db = getDb();
    const companion = getCompanionById(companionId);
    
    if (!companion) {
      throw new Error('COMPANION_NOT_FOUND');
    }

    const tokensCost = getAIMessageCost(companion.tier);

    // Check user balance
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const balance = walletSnap.data().tokens || 0;
    if (balance < tokensCost) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // Get or create chat
    const chatId = await getOrCreateAIChat(userId, companionId);
    const chatRef = doc(db, 'ai_chats', chatId);
    const messagesRef = collection(db, `ai_chats/${chatId}/messages`);

    // Generate AI response (placeholder - should call actual AI service)
    const aiResponse = await generateAIResponse(userMessage, companion);

    // Deduct tokens and save messages
    await updateDoc(walletRef, {
      tokens: increment(-tokensCost),
      lastUpdated: serverTimestamp(),
    });

    // Add user message
    await addDoc(messagesRef, {
      companionId,
      senderId: 'user',
      text: userMessage,
      timestamp: serverTimestamp(),
      tokensCost: 0,
    });

    // Add AI response
    await addDoc(messagesRef, {
      companionId,
      senderId: 'ai',
      text: aiResponse,
      timestamp: serverTimestamp(),
      tokensCost,
    });

    // Update chat metadata
    await updateDoc(chatRef, {
      lastMessage: aiResponse,
      lastTimestamp: serverTimestamp(),
      totalTokensSpent: increment(tokensCost),
      messageCount: increment(2),
    });

    // Record transaction
    const transactionRef = doc(collection(db, 'transactions'));
    await setDoc(transactionRef, {
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
    };
  } catch (error) {
    console.error('Error sending AI message:', error);
    throw error;
  }
};

/**
 * Generate AI response using real AI service
 * Falls back to placeholder if real AI unavailable
 */
const generateAIResponse = async (
  userMessage: string,
  companion: AICompanion,
  chatId?: string
): Promise<string> => {
  // Try to use real AI service (Phase 5)
  try {
    const realAI = await import('./realAIService');
    
    // NSFW filter check
    const nsfwCheck = realAI.filterNSFWContent(userMessage, companion.tier);
    if (nsfwCheck.isNSFW) {
      return nsfwCheck.message || 'Content filtered. Please use web for NSFW content.';
    }
    
    // Use real AI if chat ID provided
    if (chatId) {
      const result = await realAI.sendRealAIMessage(
        userMessage.split('_')[0], // Extract userId from chatId pattern
        companion.id,
        userMessage,
        companion,
        chatId
      );
      return result.aiResponse;
    }
  } catch (error) {
    console.log('Real AI service not available, using fallback:', error);
  }
  
  // Fallback to placeholder responses
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
 * Subscribe to AI chat messages
 */
export const subscribeToAIMessages = (
  chatId: string,
  onMessagesUpdate: (messages: AIMessage[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const db = getDb();
    const messagesRef = collection(db, `ai_chats/${chatId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messages: AIMessage[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as AIMessage));

        onMessagesUpdate(messages);
      },
      (error) => {
        console.error('Error in AI messages subscription:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to AI messages:', error);
    throw error;
  }
};

/**
 * Get user's AI chats
 */
export const getUserAIChats = async (userId: string): Promise<AIChat[]> => {
  try {
    const db = getDb();
    const chatsRef = collection(db, 'ai_chats');
    const q = query(chatsRef);

    const snapshot = await getDocs(q);
    const chats: AIChat[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.userId === userId) {
        chats.push({
          id: doc.id,
          ...data,
        } as AIChat);
      }
    });

    return chats.sort((a, b) => 
      b.lastTimestamp?.toMillis() - a.lastTimestamp?.toMillis()
    );
  } catch (error) {
    console.error('Error getting user AI chats:', error);
    return [];
  }
};

/**
 * Delete AI chat
 */
export const deleteAIChat = async (chatId: string): Promise<void> => {
  try {
    const db = getDb();
    const chatRef = doc(db, 'ai_chats', chatId);
    await updateDoc(chatRef, {
      lastMessage: 'Chat deleted',
      lastTimestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error deleting AI chat:', error);
    throw error;
  }
};
