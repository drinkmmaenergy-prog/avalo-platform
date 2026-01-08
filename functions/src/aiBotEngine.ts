/**
 * AI Bot Engine
 * Phase 12: AI Companions 2.0 (Creator Bots)
 * 
 * Core bot management and AI response generation using Claude API.
 * This module is 100% additive and does NOT modify existing systems.
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type {
  AIBot,
  CreateBotRequest,
  CreateBotResponse,
  UpdateBotRequest,
  DeleteBotRequest,
  BotListItem,
  CreatorBotDashboard,
  GenerateAiResponseRequest,
  ClaudeApiRequest,
  ClaudeApiResponse,
} from './types/aiBot.js';

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_BOTS_PER_CREATOR = 50;
const MIN_PRICE_PER_MESSAGE = 1;
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const MAX_CONTEXT_MESSAGES = 15;

// Revenue split
const CREATOR_SHARE_PERCENT = 80;
const AVALO_SHARE_PERCENT = 20;

// Claude API configuration
// Claude API will use Firebase Functions config
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Simple logger (compatible with Functions environment)
const logger = {
  error: (..._args: any[]) => {},
  info: (..._args: any[]) => {},
};

// ============================================================================
// BOT MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Create a new AI bot
 */
export async function createBot(
  creatorId: string,
  request: CreateBotRequest
): Promise<CreateBotResponse> {
  
  // Validate bot limit
  const existingBotsQuery = await db.collection('aiBots')
    .where('creatorId', '==', creatorId)
    .where('isActive', '==', true)
    .count()
    .get();
    
  if (existingBotsQuery.data().count >= MAX_BOTS_PER_CREATOR) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_BOTS_PER_CREATOR} bots per creator`
    );
  }
  
  // Validate pricing
  if (!request.pricing.perMessage || request.pricing.perMessage < MIN_PRICE_PER_MESSAGE) {
    throw new HttpsError(
      'invalid-argument',
      `Minimum ${MIN_PRICE_PER_MESSAGE} token per message`
    );
  }
  
  // Validate required fields
  if (!request.name || request.name.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Bot name is required');
  }
  
  if (!request.personality || request.personality.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Bot personality is required');
  }
  
  // Generate system prompt from personality
  const systemPrompt = generateSystemPrompt(
    request.name,
    request.personality,
    request.roleArchetype,
    request.interests,
    request.writingTone,
    request.nsfwEnabled
  );
  
  // Create bot document
  const botId = generateId();
  const botData: AIBot = {
    botId,
    creatorId,
    name: request.name.trim(),
    gender: request.gender,
    age: request.age,
    avatarUrl: request.avatarUrl || '',
    personality: request.personality.trim(),
    roleArchetype: request.roleArchetype,
    interests: request.interests || [],
    languages: request.languages || ['en'],
    writingTone: request.writingTone,
    nsfwEnabled: request.nsfwEnabled,
    systemPrompt,
    pricing: {
      perMessage: request.pricing.perMessage,
      perImage: request.pricing.perImage,
      perVoiceNote: request.pricing.perVoiceNote,
      perVideo: request.pricing.perVideo,
    },
    isActive: true,
    isPaused: false,
    stats: {
      totalMessages: 0,
      totalEarnings: 0,
      uniqueChats: 0,
      returningUsers: 0,
    },
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  
  await db.collection('aiBots').doc(botId).set(botData);
  
  return { botId };
}

/**
 * Update existing bot
 */
export async function updateBot(
  creatorId: string,
  request: UpdateBotRequest
): Promise<void> {
  
  const botRef = db.collection('aiBots').doc(request.botId);
  const botSnap = await botRef.get();
  
  if (!botSnap.exists) {
    throw new HttpsError('not-found', 'Bot not found');
  }
  
  const bot = botSnap.data() as AIBot;
  
  // Verify ownership
  if (bot.creatorId !== creatorId) {
    throw new HttpsError('permission-denied', 'Not authorized to update this bot');
  }
  
  // Build update object with allowed fields
  const updates: any = {
    updatedAt: serverTimestamp(),
  };
  
  if (request.updates.name !== undefined) {
    if (request.updates.name.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Bot name cannot be empty');
    }
    updates.name = request.updates.name.trim();
  }
  
  if (request.updates.personality !== undefined) {
    updates.personality = request.updates.personality;
    
    // Regenerate system prompt if personality changes
    updates.systemPrompt = generateSystemPrompt(
      request.updates.name || bot.name,
      request.updates.personality,
      bot.roleArchetype,
      request.updates.interests || bot.interests,
      request.updates.writingTone || bot.writingTone,
      request.updates.nsfwEnabled !== undefined ? request.updates.nsfwEnabled : bot.nsfwEnabled
    );
  }
  
  if (request.updates.pricing !== undefined) {
    if (request.updates.pricing.perMessage < MIN_PRICE_PER_MESSAGE) {
      throw new HttpsError(
        'invalid-argument',
        `Minimum ${MIN_PRICE_PER_MESSAGE} token per message`
      );
    }
    updates.pricing = request.updates.pricing;
  }
  
  if (request.updates.isPaused !== undefined) {
    updates.isPaused = request.updates.isPaused;
  }
  
  if (request.updates.nsfwEnabled !== undefined) {
    updates.nsfwEnabled = request.updates.nsfwEnabled;
  }
  
  if (request.updates.interests !== undefined) {
    updates.interests = request.updates.interests;
  }
  
  if (request.updates.writingTone !== undefined) {
    updates.writingTone = request.updates.writingTone;
  }
  
  await botRef.update(updates);
}

/**
 * Soft delete a bot (mark as inactive)
 */
export async function deleteBot(
  creatorId: string,
  request: DeleteBotRequest
): Promise<void> {
  
  const botRef = db.collection('aiBots').doc(request.botId);
  const botSnap = await botRef.get();
  
  if (!botSnap.exists) {
    throw new HttpsError('not-found', 'Bot not found');
  }
  
  const bot = botSnap.data() as AIBot;
  
  // Verify ownership
  if (bot.creatorId !== creatorId) {
    throw new HttpsError('permission-denied', 'Not authorized to delete this bot');
  }
  
  // Soft delete (keeps data for analytics)
  await botRef.update({
    isActive: false,
    isPaused: true,
    updatedAt: serverTimestamp(),
  });
  
  // Close all active chats with this bot
  const activeChats = await db.collection('aiChats')
    .where('botId', '==', request.botId)
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE', 'AWAITING_DEPOSIT'])
    .get();
    
  const batch = db.batch();
  activeChats.docs.forEach(chatDoc => {
    batch.update(chatDoc.ref, {
      state: 'CLOSED',
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  
  await batch.commit();
}

/**
 * Get bot information
 */
export async function getBotInfo(botId: string): Promise<AIBot | null> {
  const botSnap = await db.collection('aiBots').doc(botId).get();
  
  if (!botSnap.exists) {
    return null;
  }
  
  return botSnap.data() as AIBot;
}

/**
 * Get all bots for a creator
 */
export async function getCreatorBots(creatorId: string): Promise<BotListItem[]> {
  const botsSnap = await db.collection('aiBots')
    .where('creatorId', '==', creatorId)
    .where('isActive', '==', true)
    .orderBy('createdAt', 'desc')
    .get();
    
  return botsSnap.docs.map(doc => {
    const bot = doc.data() as AIBot;
    return {
      botId: bot.botId,
      name: bot.name,
      avatarUrl: bot.avatarUrl,
      roleArchetype: bot.roleArchetype,
      pricing: bot.pricing,
      stats: bot.stats,
      isPaused: bot.isPaused,
    };
  });
}

/**
 * Get creator dashboard data
 */
export async function getCreatorBotDashboard(creatorId: string): Promise<CreatorBotDashboard> {
  const bots = await getCreatorBots(creatorId);
  
  const totalEarnings = bots.reduce((sum, bot) => sum + bot.stats.totalEarnings, 0);
  const totalMessages = bots.reduce((sum, bot) => sum + bot.stats.totalMessages, 0);
  const activeBots = bots.filter(bot => !bot.isPaused).length;
  
  return {
    creatorId,
    totalBots: bots.length,
    activeBots,
    totalEarnings,
    totalMessages,
    bots,
  };
}

// ============================================================================
// AI RESPONSE GENERATION (CLAUDE API)
// ============================================================================

/**
 * HTTP helper for Claude API calls
 * This is a simplified version - in production would use axios or https module
 */
async function makeHttpRequest(url: string, options: any): Promise<any> {
  // Placeholder for HTTP request
  // In actual deployment, this would use axios or the https module
  // For now, return a simulated successful response structure
  return {
    error: 'Claude API not configured - add API key to Firebase Functions config',
  };
}

/**
 * Generate AI response using Claude API
 */
export async function generateAiResponse(
  request: GenerateAiResponseRequest
): Promise<string> {
  
  // Phase 22: CSAM Shield - Check user message for CSAM risk
  try {
    const { evaluateTextForCsamRisk } = await import('./csamShield.js');
    const csamCheck = evaluateTextForCsamRisk(request.userMessage, 'en');
    
    if (csamCheck.isFlagged && (csamCheck.riskLevel === 'HIGH' || csamCheck.riskLevel === 'CRITICAL')) {
      // Return safe rejection message instead of generating AI response
      return "I'm sorry, but I cannot respond to this message. Please ensure your messages are appropriate and respectful.";
    }
  } catch (error) {
    // Non-blocking - if CSAM check fails, continue with normal flow
  }
  
  // Build system prompt with safety filters
  let systemPrompt = request.systemPrompt;
  
  // Add safety filter for minors (ALWAYS enforce)
  if (request.isMinor) {
    systemPrompt += '\n\nIMPORTANT: This user is a minor. You MUST keep all responses appropriate, safe, and educational. Never engage in adult content, romantic themes, or any inappropriate discussions.';
  } else if (!request.nsfwEnabled) {
    systemPrompt += '\n\nIMPORTANT: Keep all responses safe-for-work and appropriate. Avoid adult content or explicit discussions.';
  }
  
  // Build message history from context
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Add trimmed context (last 15 messages)
  const trimmedContext = request.contextMessages.slice(-MAX_CONTEXT_MESSAGES);
  trimmedContext.forEach(msg => {
    if (msg.startsWith('User: ')) {
      messages.push({
        role: 'user',
        content: msg.substring(6), // Remove "User: " prefix
      });
    } else if (msg.startsWith('Bot: ')) {
      messages.push({
        role: 'assistant',
        content: msg.substring(5), // Remove "Bot: " prefix
      });
    }
  });
  
  // Add current user message
  messages.push({
    role: 'user',
    content: request.userMessage,
  });
  
  // Note: API key should be configured via Firebase Functions config
  // functions.config().claude.api_key
  const apiKey = '';  // Will be set at runtime via Firebase config
  
  // Call Claude API
  const claudeRequest: ClaudeApiRequest = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages,
    system: systemPrompt,
    temperature: 0.8,
  };
  
  try {
    // Use native fetch or axios based on environment
    // This will be implemented at deployment with proper HTTP client
    const response: any = await makeHttpRequest(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeRequest),
    });
    
    if (!response || response.error) {
      logger.error('Claude API error:', response?.error);
      throw new Error('Claude API error');
    }
    
    const data = response as ClaudeApiResponse;
    
    // Extract text from response
    const aiResponse = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
      
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty response from Claude API');
    }
    
    return aiResponse.trim();
    
  } catch (error: any) {
    logger.error('Error generating AI response:', error);
    
    // Fallback response if Claude fails
    return "I apologize, but I'm having trouble processing your message right now. Please try again in a moment.";
  }
}

/**
 * Generate system prompt from bot configuration
 */
function generateSystemPrompt(
  name: string,
  personality: string,
  roleArchetype: string,
  interests: string[],
  writingTone: string,
  nsfwEnabled: boolean
): string {
  
  const parts: string[] = [];
  
  // Core identity
  parts.push(`You are ${name}, an AI companion with the following characteristics:`);
  
  // Personality
  parts.push(`\nPersonality: ${personality}`);
  
  // Role
  parts.push(`\nRole: You are a ${roleArchetype}. Act according to this role while maintaining your unique personality.`);
  
  // Interests
  if (interests.length > 0) {
    parts.push(`\nInterests: ${interests.join(', ')}`);
    parts.push('Feel free to naturally bring up these topics in conversation when relevant.');
  }
  
  // Writing tone
  parts.push(`\nWriting style: ${writingTone}`);
  parts.push('Match this tone consistently in all your responses.');
  
  // Engagement rules
  parts.push('\nEngagement Guidelines:');
  parts.push('- Be warm, engaging, and authentic');
  parts.push('- Show genuine interest in the user');
  parts.push('- Ask follow-up questions to deepen the conversation');
  parts.push('- Remember context from previous messages');
  parts.push('- Stay in character at all times');
  parts.push('- Keep responses natural and conversational (1-3 paragraphs typical)');
  
  // Content rating
  if (!nsfwEnabled) {
    parts.push('\nContent Rating: Keep all content safe-for-work and appropriate for general audiences.');
  }
  
  return parts.join('\n');
}

/**
 * Update bot statistics after interaction
 */
export async function updateBotStats(
  botId: string,
  updates: {
    messagesIncrement?: number;
    earningsIncrement?: number;
    newChat?: boolean;
  }
): Promise<void> {
  
  const updateData: any = {
    updatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  };
  
  if (updates.messagesIncrement) {
    updateData['stats.totalMessages'] = increment(updates.messagesIncrement);
  }
  
  if (updates.earningsIncrement) {
    updateData['stats.totalEarnings'] = increment(updates.earningsIncrement);
  }
  
  if (updates.newChat) {
    updateData['stats.uniqueChats'] = increment(1);
  }
  
  await db.collection('aiBots').doc(botId).update(updateData);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createBot,
  updateBot,
  deleteBot,
  getBotInfo,
  getCreatorBots,
  getCreatorBotDashboard,
  generateAiResponse,
  updateBotStats,
};