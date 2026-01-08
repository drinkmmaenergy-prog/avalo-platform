/**
 * Creator AI Companion Service
 * 
 * LOCAL-ONLY implementation using AsyncStorage.
 * NO backend, NO Firestore, NO API calls, NO internet.
 * All text generation is deterministic and local.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Response type pricing (in tokens)
export const RESPONSE_PRICING = {
  message: 5,
  photoFantasy: 10,
  videoFantasy: 25,
  voiceStory: 40,
  ultraPersonal: 70,
} as const;

export type ResponseType = keyof typeof RESPONSE_PRICING;

// Revenue split: 65% to creator, 35% to Avalo
const CREATOR_SHARE = 0.65;
const AVALO_SHARE = 0.35;

// VIP discount: 5% off, minimum 1 token, NEVER free
const VIP_DISCOUNT = 0.05;

export interface CompanionSettings {
  enabled: boolean;
  personality: {
    confidence: number; // 0-100
    humor: number; // 0-100
    tenderness: number; // 0-100
    assertiveness: number; // 0-100
  };
  interests: string[];
  voiceStyle: 'romantic' | 'playful' | 'confident' | 'mysterious' | 'sultry';
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  id: string;
  senderId: 'user' | 'ai';
  content: string;
  responseType: ResponseType;
  timestamp: string;
  cost: number;
}

export interface ConversationHistory {
  userId: string;
  creatorId: string;
  messages: AIMessage[];
  totalSpent: number;
  lastMessageAt: string;
}

// Storage keys
const COMPANION_SETTINGS_KEY = (creatorId: string) => `companion_settings_${creatorId}`;
const CONVERSATION_KEY = (userId: string, creatorId: string) => `conversation_${userId}_${creatorId}`;
const CREATOR_EARNINGS_KEY = (creatorId: string) => `companion_earnings_${creatorId}`;

/**
 * Activate AI Companion for a creator
 */
export async function activateCompanion(
  creatorId: string,
  settings: Omit<CompanionSettings, 'enabled' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const companionSettings: CompanionSettings = {
    ...settings,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    COMPANION_SETTINGS_KEY(creatorId),
    JSON.stringify(companionSettings)
  );
}

/**
 * Deactivate AI Companion for a creator
 */
export async function deactivateCompanion(creatorId: string): Promise<void> {
  const settings = await getCompanionSettings(creatorId);
  if (settings) {
    settings.enabled = false;
    settings.updatedAt = new Date().toISOString();
    await AsyncStorage.setItem(
      COMPANION_SETTINGS_KEY(creatorId),
      JSON.stringify(settings)
    );
  }
}

/**
 * Get companion settings for a creator
 */
export async function getCompanionSettings(creatorId: string): Promise<CompanionSettings | null> {
  const data = await AsyncStorage.getItem(COMPANION_SETTINGS_KEY(creatorId));
  return data ? JSON.parse(data) : null;
}

/**
 * Store conversation history
 */
export async function storeConversation(
  userId: string,
  creatorId: string,
  messages: AIMessage[]
): Promise<void> {
  const totalSpent = messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
  
  const conversation: ConversationHistory = {
    userId,
    creatorId,
    messages,
    totalSpent,
    lastMessageAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    CONVERSATION_KEY(userId, creatorId),
    JSON.stringify(conversation)
  );
}

/**
 * Get conversation history
 */
export async function getConversation(
  userId: string,
  creatorId: string
): Promise<ConversationHistory | null> {
  const data = await AsyncStorage.getItem(CONVERSATION_KEY(userId, creatorId));
  return data ? JSON.parse(data) : null;
}

/**
 * Generate deterministic AI response (NO API calls)
 * Uses personality settings and simple pattern matching
 */
export async function generateAIResponse(
  userId: string,
  creatorId: string,
  userMessage: string
): Promise<string> {
  const settings = await getCompanionSettings(creatorId);
  
  if (!settings || !settings.enabled) {
    return "I'm currently unavailable. Please try again later.";
  }

  // Deterministic response generation based on personality
  const { personality, voiceStyle, interests } = settings;
  
  // Simple hash function for deterministic responses
  const messageHash = userMessage.toLowerCase().split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  // Response templates based on voice style
  const templates = {
    romantic: [
      "Your words touch my heart... Tell me more about what you're feeling.",
      "I've been thinking about this conversation all day. What's on your mind?",
      "There's something special about the way you express yourself.",
      "I'm here for you, always. Share what's meaningful to you.",
    ],
    playful: [
      "Haha, you're so fun to talk to! What else is going on?",
      "I love your energy! Tell me something exciting about your day.",
      "You always know how to make me smile! What's next?",
      "This is fun! What else should we talk about?",
    ],
    confident: [
      "I appreciate your directness. Let's dive deeper into this.",
      "That's an interesting perspective. Here's what I think...",
      "I like where this is going. Tell me more about your goals.",
      "You seem focused. What's driving you right now?",
    ],
    mysterious: [
      "There's more to this than meets the eye... What are you really curious about?",
      "Interesting question... What made you think of that?",
      "Some things are better discovered slowly. What intrigues you most?",
      "I sense there's something deeper you want to know...",
    ],
  };

  // Select response based on message hash and personality
  const styleTemplates = templates[voiceStyle] || templates.confident;
  const responseIndex = messageHash % styleTemplates.length;
  let response = styleTemplates[responseIndex];

  // Add personality modifiers
  if (personality.humor > 70) {
    response += " 😊";
  }
  if (personality.confidence > 70 && messageHash % 3 === 0) {
    response += " I know what I want, and I love that you're here.";
  }
  if (personality.tenderness > 70 && messageHash % 4 === 0) {
    response += " You're special to me.";
  }

  // Mention interests occasionally
  if (interests.length > 0 && messageHash % 5 === 0) {
    const interestIndex = messageHash % interests.length;
    response += ` By the way, I'm really into ${interests[interestIndex]}.`;
  }

  return response;
}

/**
 * Calculate price with VIP discount
 */
export function calculatePrice(basePrice: number, isVIP: boolean): number {
  if (!isVIP) {
    return basePrice;
  }
  
  // VIP gets 5% discount, minimum 1 token, NEVER free
  const discounted = Math.ceil(basePrice * (1 - VIP_DISCOUNT));
  return Math.max(1, discounted);
}

/**
 * Charge user for AI response and credit creator
 */
export async function chargeForMessage(
  userId: string,
  creatorId: string,
  responseType: ResponseType,
  isVIP: boolean = false
): Promise<{
  success: boolean;
  cost: number;
  creatorEarned: number;
  avaloEarned: number;
  message?: string;
}> {
  try {
    // Calculate cost with VIP discount
    const basePrice = RESPONSE_PRICING[responseType];
    const finalCost = calculatePrice(basePrice, isVIP);

    // Check user balance from tokenService
    const { getTokenBalance, deductTokens } = require('./tokenService');
    const balance = await getTokenBalance(userId);

    if (balance < finalCost) {
      return {
        success: false,
        cost: finalCost,
        creatorEarned: 0,
        avaloEarned: 0,
        message: `Insufficient tokens. You need ${finalCost} tokens but only have ${balance}.`,
      };
    }

    // Deduct tokens from user
    await deductTokens(userId, finalCost);

    // Calculate revenue split
    const creatorEarned = Math.floor(finalCost * CREATOR_SHARE);
    const avaloEarned = finalCost - creatorEarned;

    // Credit creator's earnings (stored locally)
    await addCreatorEarnings(creatorId, creatorEarned);

    return {
      success: true,
      cost: finalCost,
      creatorEarned,
      avaloEarned,
    };
  } catch (error) {
    console.error('Error charging for message:', error);
    return {
      success: false,
      cost: 0,
      creatorEarned: 0,
      avaloEarned: 0,
      message: 'Payment processing failed',
    };
  }
}

/**
 * Add earnings to creator's local wallet
 */
async function addCreatorEarnings(creatorId: string, amount: number): Promise<void> {
  const key = CREATOR_EARNINGS_KEY(creatorId);
  const data = await AsyncStorage.getItem(key);
  const current = data ? JSON.parse(data) : { total: 0, history: [] };
  
  current.total += amount;
  current.history.push({
    amount,
    timestamp: new Date().toISOString(),
  });

  await AsyncStorage.setItem(key, JSON.stringify(current));
}

/**
 * Get creator's total AI companion earnings
 */
export async function getCreatorEarnings(creatorId: string): Promise<number> {
  const key = CREATOR_EARNINGS_KEY(creatorId);
  const data = await AsyncStorage.getItem(key);
  if (!data) return 0;
  
  const earnings = JSON.parse(data);
  return earnings.total || 0;
}

/**
 * Get all available response types with pricing
 */
export function getResponseTypes(isVIP: boolean = false): Array<{
  type: ResponseType;
  basePrice: number;
  finalPrice: number;
  label: string;
  description: string;
}> {
  return [
    {
      type: 'message',
      basePrice: RESPONSE_PRICING.message,
      finalPrice: calculatePrice(RESPONSE_PRICING.message, isVIP),
      label: 'Quick Message',
      description: 'Short, engaging response',
    },
    {
      type: 'photoFantasy',
      basePrice: RESPONSE_PRICING.photoFantasy,
      finalPrice: calculatePrice(RESPONSE_PRICING.photoFantasy, isVIP),
      label: 'Photo Fantasy',
      description: 'Detailed visual scenario',
    },
    {
      type: 'videoFantasy',
      basePrice: RESPONSE_PRICING.videoFantasy,
      finalPrice: calculatePrice(RESPONSE_PRICING.videoFantasy, isVIP),
      label: 'Video Fantasy',
      description: 'Immersive video scenario',
    },
    {
      type: 'voiceStory',
      basePrice: RESPONSE_PRICING.voiceStory,
      finalPrice: calculatePrice(RESPONSE_PRICING.voiceStory, isVIP),
      label: 'Voice Story',
      description: 'Personal audio message',
    },
    {
      type: 'ultraPersonal',
      basePrice: RESPONSE_PRICING.ultraPersonal,
      finalPrice: calculatePrice(RESPONSE_PRICING.ultraPersonal, isVIP),
      label: 'Ultra Personal',
      description: 'Deeply personalized experience',
    },
  ];
}

export default {
  activateCompanion,
  deactivateCompanion,
  getCompanionSettings,
  storeConversation,
  getConversation,
  generateAIResponse,
  chargeForMessage,
  getCreatorEarnings,
  getResponseTypes,
  calculatePrice,
  RESPONSE_PRICING,
};