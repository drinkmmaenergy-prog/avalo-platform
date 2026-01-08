/**
 * AI Voice Service
 * 
 * LOCAL-ONLY voice reply system using AsyncStorage.
 * NO backend, NO Firestore, NO API calls, NO internet.
 * All voice "generation" is deterministic and local with synthetic audio IDs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Voice reply pricing (in tokens)
export const VOICE_PRICING = {
  basePrice: 25,
} as const;

// Revenue split: 65% to creator, 35% to Avalo
const CREATOR_SHARE = 0.65;
const AVALO_SHARE = 0.35;

// VIP discount: 10% off, minimum 1 token, NEVER free
const VIP_DISCOUNT = 0.10;

export type VoiceStyle = 'romantic' | 'playful' | 'confident' | 'mysterious' | 'sultry';

export interface VoiceConfig {
  enabled: boolean;
  selectedVoice: VoiceStyle;
  previewAudioId?: string;
}

export interface VoiceMessage {
  id: string;
  audioId: string; // Deterministic synthetic audio ID
  voiceStyle: VoiceStyle;
  duration: number; // in seconds
  transcript: string;
  timestamp: string;
  cost: number;
}

export interface VoiceHistory {
  userId: string;
  creatorId: string;
  messages: VoiceMessage[];
  totalSpent: number;
}

// Storage keys
const VOICE_CONFIG_KEY = (creatorId: string) => `voice_config_${creatorId}`;
const VOICE_HISTORY_KEY = (userId: string, creatorId: string) => `voice_history_${userId}_${creatorId}`;
const VOICE_EARNINGS_KEY = (creatorId: string) => `voice_earnings_${creatorId}`;

/**
 * Check if voice is enabled for a creator
 */
export async function isVoiceEnabled(creatorId: string): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(VOICE_CONFIG_KEY(creatorId));
    if (!data) return false;
    
    const config: VoiceConfig = JSON.parse(data);
    return config.enabled;
  } catch (error) {
    console.error('Error checking voice enabled:', error);
    return false;
  }
}

/**
 * Set voice configuration for a creator
 */
export async function setVoiceConfig(
  creatorId: string,
  config: VoiceConfig
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      VOICE_CONFIG_KEY(creatorId),
      JSON.stringify(config)
    );
  } catch (error) {
    console.error('Error setting voice config:', error);
    throw error;
  }
}

/**
 * Get voice configuration for a creator
 */
export async function getVoiceConfig(creatorId: string): Promise<VoiceConfig | null> {
  try {
    const data = await AsyncStorage.getItem(VOICE_CONFIG_KEY(creatorId));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting voice config:', error);
    return null;
  }
}

/**
 * Calculate price with VIP discount
 */
export function calculateVoicePrice(isVIP: boolean): number {
  const basePrice = VOICE_PRICING.basePrice;
  
  if (!isVIP) {
    return basePrice;
  }
  
  // VIP gets 10% discount, minimum 1 token, NEVER free
  const discounted = Math.ceil(basePrice * (1 - VIP_DISCOUNT));
  return Math.max(1, discounted);
}

/**
 * Charge user for voice message and credit creator (with 65/35 split)
 * MUST deduct tokens and add earnings
 */
export async function chargeForVoiceMessage(
  userId: string,
  creatorId: string,
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
    const finalCost = calculateVoicePrice(isVIP);

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

    // Calculate revenue split (65/35)
    const creatorEarned = Math.floor(finalCost * CREATOR_SHARE);
    const avaloEarned = finalCost - creatorEarned;

    // Credit creator's earnings (stored locally)
    await addVoiceEarnings(creatorId, creatorEarned);

    return {
      success: true,
      cost: finalCost,
      creatorEarned,
      avaloEarned,
    };
  } catch (error) {
    console.error('Error charging for voice message:', error);
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
 * Generate deterministic audio ID and transcript
 * NO real audio generation - just synthetic IDs
 */
function generateVoiceContent(
  userId: string,
  creatorId: string,
  voiceStyle: VoiceStyle,
  userMessage: string
): { audioId: string; transcript: string; duration: number } {
  // Create deterministic audio ID based on inputs
  const hash = `${userId}_${creatorId}_${Date.now()}_${userMessage.substring(0, 10)}`;
  const audioId = `voice_${hash.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Generate transcript based on voice style (deterministic pattern matching)
  const transcripts = {
    romantic: [
      "Your message made my heart skip a beat... I've been thinking about you.",
      "There's something special about talking to you. What's on your mind?",
      "I love how you express yourself. Tell me more.",
      "Hearing from you always brightens my day.",
    ],
    playful: [
      "Haha, you're so fun! What are you up to right now?",
      "I couldn't help but smile when I read your message!",
      "You always know how to make things interesting!",
      "This is fun! What's next on your mind?",
    ],
    confident: [
      "I appreciate your directness. Let's explore this together.",
      "That's an interesting take. Here's what I think about it.",
      "I like your energy. What else is on your mind?",
      "You've got my attention. Keep going.",
    ],
    mysterious: [
      "Mmm... there's more to this than you might think.",
      "Interesting question... what made you curious about that?",
      "Some things are better experienced than explained...",
      "I sense there's something deeper you want to know.",
    ],
    sultry: [
      "Your words have such a nice effect on me...",
      "I've been waiting to hear from you...",
      "Tell me what you're thinking... in detail.",
      "There's something about your energy that draws me in.",
    ],
  };

  // Select transcript based on message hash
  const messageHash = userMessage.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const styleTranscripts = transcripts[voiceStyle] || transcripts.confident;
  const transcriptIndex = messageHash % styleTranscripts.length;
  const transcript = styleTranscripts[transcriptIndex];

  // Duration based on transcript length (realistic ~2.5 chars per second speech rate)
  const duration = Math.ceil(transcript.length / 2.5);

  return { audioId, transcript, duration };
}

/**
 * Store voice message in history
 */
export async function storeVoiceMessage(
  userId: string,
  creatorId: string,
  audioId: string,
  voiceStyle: VoiceStyle,
  duration: number,
  transcript: string,
  cost: number
): Promise<void> {
  try {
    // Get existing history
    const history = await getVoiceHistory(userId, creatorId);
    
    const voiceMessage: VoiceMessage = {
      id: Date.now().toString(),
      audioId,
      voiceStyle,
      duration,
      transcript,
      timestamp: new Date().toISOString(),
      cost,
    };

    const messages = history ? [...history.messages, voiceMessage] : [voiceMessage];
    const totalSpent = messages.reduce((sum, msg) => sum + msg.cost, 0);

    const newHistory: VoiceHistory = {
      userId,
      creatorId,
      messages,
      totalSpent,
    };

    await AsyncStorage.setItem(
      VOICE_HISTORY_KEY(userId, creatorId),
      JSON.stringify(newHistory)
    );
  } catch (error) {
    console.error('Error storing voice message:', error);
    throw error;
  }
}

/**
 * Get voice history for user with creator
 */
export async function getVoiceHistory(
  userId: string,
  creatorId: string
): Promise<VoiceHistory | null> {
  try {
    const data = await AsyncStorage.getItem(VOICE_HISTORY_KEY(userId, creatorId));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting voice history:', error);
    return null;
  }
}

/**
 * Add voice earnings to creator's local wallet
 */
async function addVoiceEarnings(creatorId: string, amount: number): Promise<void> {
  try {
    const key = VOICE_EARNINGS_KEY(creatorId);
    const data = await AsyncStorage.getItem(key);
    const current = data ? JSON.parse(data) : { total: 0, history: [] };
    
    current.total += amount;
    current.history.push({
      amount,
      timestamp: new Date().toISOString(),
    });

    await AsyncStorage.setItem(key, JSON.stringify(current));
  } catch (error) {
    console.error('Error adding voice earnings:', error);
    throw error;
  }
}

/**
 * Get creator's total voice earnings
 */
export async function getVoiceEarnings(creatorId: string): Promise<number> {
  try {
    const key = VOICE_EARNINGS_KEY(creatorId);
    const data = await AsyncStorage.getItem(key);
    if (!data) return 0;
    
    const earnings = JSON.parse(data);
    return earnings.total || 0;
  } catch (error) {
    console.error('Error getting voice earnings:', error);
    return 0;
  }
}

/**
 * Request voice reply - main entry point for viewers
 * Charges user, generates content, stores message
 */
export async function requestVoiceReply(
  userId: string,
  creatorId: string,
  userMessage: string,
  isVIP: boolean = false
): Promise<{
  success: boolean;
  voiceMessage?: VoiceMessage;
  message?: string;
}> {
  try {
    // Check if voice is enabled
    const enabled = await isVoiceEnabled(creatorId);
    if (!enabled) {
      return {
        success: false,
        message: 'Voice replies are not available from this creator.',
      };
    }

    // Get voice config
    const config = await getVoiceConfig(creatorId);
    if (!config) {
      return {
        success: false,
        message: 'Voice configuration not found.',
      };
    }

    // Charge user
    const chargeResult = await chargeForVoiceMessage(userId, creatorId, isVIP);
    if (!chargeResult.success) {
      return {
        success: false,
        message: chargeResult.message,
      };
    }

    // Generate voice content (deterministic, no API)
    const { audioId, transcript, duration } = generateVoiceContent(
      userId,
      creatorId,
      config.selectedVoice,
      userMessage
    );

    // Store voice message
    await storeVoiceMessage(
      userId,
      creatorId,
      audioId,
      config.selectedVoice,
      duration,
      transcript,
      chargeResult.cost
    );

    const voiceMessage: VoiceMessage = {
      id: Date.now().toString(),
      audioId,
      voiceStyle: config.selectedVoice,
      duration,
      transcript,
      timestamp: new Date().toISOString(),
      cost: chargeResult.cost,
    };

    return {
      success: true,
      voiceMessage,
    };
  } catch (error) {
    console.error('Error requesting voice reply:', error);
    return {
      success: false,
      message: 'Failed to generate voice reply. Please try again.',
    };
  }
}

export default {
  isVoiceEnabled,
  setVoiceConfig,
  getVoiceConfig,
  calculateVoicePrice,
  chargeForVoiceMessage,
  storeVoiceMessage,
  getVoiceHistory,
  getVoiceEarnings,
  requestVoiceReply,
  VOICE_PRICING,
};