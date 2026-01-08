/**
 * AI Bot Service
 * Phase 12: AI Companions 2.0 (Creator Bots)
 * 
 * Mobile client for interacting with AI bot functionality.
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type BotGender = 'male' | 'female' | 'other';
export type BotRoleArchetype = 'friend' | 'mentor' | 'therapist' | 'companion' | 'coach' | 'advisor' | 'entertainer' | 'teacher' | 'custom';
export type WritingTone = 'formal' | 'casual' | 'friendly' | 'professional' | 'flirty' | 'humorous' | 'supportive' | 'direct';

export interface BotPricing {
  perMessage: number;
  perImage?: number;
  perVoiceNote?: number;
  perVideo?: number;
}

export interface BotStats {
  totalMessages: number;
  totalEarnings: number;
  uniqueChats: number;
  returningUsers: number;
}

export interface AIBot {
  botId: string;
  creatorId: string;
  name: string;
  gender: BotGender;
  age: number;
  avatarUrl: string;
  personality: string;
  roleArchetype: BotRoleArchetype;
  interests: string[];
  languages: string[];
  writingTone: WritingTone;
  nsfwEnabled: boolean;
  pricing: BotPricing;
  stats: BotStats;
  isPaused: boolean;
}

export interface CreateBotRequest {
  name: string;
  gender: BotGender;
  age: number;
  avatarUrl?: string;
  personality: string;
  roleArchetype: BotRoleArchetype;
  interests: string[];
  languages: string[];
  writingTone: WritingTone;
  nsfwEnabled: boolean;
  pricing: BotPricing;
}

export interface AIChatMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  tokensCost: number;
  wasFree: boolean;
}

// ============================================================================
// BOT MANAGEMENT
// ============================================================================

/**
 * Create a new AI bot
 */
export async function createBot(botData: CreateBotRequest): Promise<{ botId: string }> {
  const createBotFn = httpsCallable(functions, 'createBot');
  const result = await createBotFn(botData);
  return result.data as { botId: string };
}

/**
 * Update an existing bot
 */
export async function updateBot(botId: string, updates: Partial<AIBot>): Promise<void> {
  const updateBotFn = httpsCallable(functions, 'updateBot');
  await updateBotFn({ botId, updates });
}

/**
 * Delete a bot (soft delete)
 */
export async function deleteBot(botId: string): Promise<void> {
  const deleteBotFn = httpsCallable(functions, 'deleteBot');
  await deleteBotFn({ botId });
}

/**
 * Get bot information
 */
export async function getBotInfo(botId: string): Promise<AIBot> {
  const getBotInfoFn = httpsCallable(functions, 'getBotInfo');
  const result = await getBotInfoFn({ botId });
  return result.data as AIBot;
}

/**
 * Get all bots for current creator
 */
export async function getCreatorBots(): Promise<AIBot[]> {
  const getCreatorBotsFn = httpsCallable(functions, 'getCreatorBots');
  const result = await getCreatorBotsFn({});
  return (result.data as any).bots as AIBot[];
}

/**
 * Get creator dashboard data
 */
export async function getCreatorBotDashboard(): Promise<{
  creatorId: string;
  totalBots: number;
  activeBots: number;
  totalEarnings: number;
  totalMessages: number;
  bots: AIBot[];
}> {
  const getDashboardFn = httpsCallable(functions, 'getCreatorBotDashboard');
  const result = await getDashboardFn({});
  return result.data as any;
}

// ============================================================================
// CHAT FUNCTIONS
// ============================================================================

/**
 * Start a new AI chat
 */
export async function startAiChat(botId: string): Promise<{ chatId: string; existing: boolean }> {
  const startChatFn = httpsCallable(functions, 'startAiChat');
  const result = await startChatFn({ botId });
  return result.data as { chatId: string; existing: boolean };
}

/**
 * Send message to AI bot and get response
 */
export async function sendAiMessage(chatId: string, message: string): Promise<{
  success: boolean;
  response?: string;
  tokensCost: number;
  wasFree: boolean;
  error?: 'DEPOSIT_REQUIRED' | 'INSUFFICIENT_BALANCE' | 'BOT_UNAVAILABLE';
  message?: string;
  required?: number;
}> {
  const sendMessageFn = httpsCallable(functions, 'processAiMessage');
  const result = await sendMessageFn({ chatId, message });
  return result.data as any;
}

/**
 * Process deposit for AI chat
 */
export async function processAiChatDeposit(chatId: string): Promise<{
  success: boolean;
  escrowAmount: number;
  platformFee: number;
}> {
  const processDepositFn = httpsCallable(functions, 'processAiChatDeposit');
  const result = await processDepositFn({ chatId });
  return result.data as any;
}

/**
 * Close AI chat
 */
export async function closeAiChat(chatId: string): Promise<{ refunded: number }> {
  const closeChatFn = httpsCallable(functions, 'closeAiChat');
  const result = await closeChatFn({ chatId });
  return result.data as { refunded: number };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate bot creation data
 */
export function validateBotData(data: Partial<CreateBotRequest>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Bot name is required');
  }
  
  if (!data.personality || data.personality.trim().length < 20) {
    errors.push('Personality description must be at least 20 characters');
  }
  
  if (!data.pricing || !data.pricing.perMessage || data.pricing.perMessage < 1) {
    errors.push('Message pricing must be at least 1 token');
  }
  
  if (!data.age || data.age < 18 || data.age > 100) {
    errors.push('Age must be between 18 and 100');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format bot pricing display
 */
export function formatBotPricing(pricing: BotPricing): string {
  return `${pricing.perMessage} token${pricing.perMessage > 1 ? 's' : ''}/message`;
}

/**
 * Get role archetype display name
 */
export function getRoleArchetypeDisplay(archetype: BotRoleArchetype): string {
  const names: Record<BotRoleArchetype, string> = {
    friend: 'Friend',
    mentor: 'Mentor',
    therapist: 'Therapist',
    companion: 'Companion',
    coach: 'Life Coach',
    advisor: 'Advisor',
    entertainer: 'Entertainer',
    teacher: 'Teacher',
    custom: 'Custom',
  };
  return names[archetype] || archetype;
}

/**
 * Get writing tone display name
 */
export function getWritingToneDisplay(tone: WritingTone): string {
  const names: Record<WritingTone, string> = {
    formal: 'Formal',
    casual: 'Casual',
    friendly: 'Friendly',
    professional: 'Professional',
    flirty: 'Flirty',
    humorous: 'Humorous',
    supportive: 'Supportive',
    direct: 'Direct',
  };
  return names[tone] || tone;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Bot management
  createBot,
  updateBot,
  deleteBot,
  getBotInfo,
  getCreatorBots,
  getCreatorBotDashboard,
  
  // Chat functions
  startAiChat,
  sendAiMessage,
  processAiChatDeposit,
  closeAiChat,
  
  // Helpers
  validateBotData,
  formatBotPricing,
  getRoleArchetypeDisplay,
  getWritingToneDisplay,
};