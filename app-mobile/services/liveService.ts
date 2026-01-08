/**
 * Live Service for Avalo Mobile App
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 *
 * UI-only monetization simulation using AsyncStorage.
 * NO backend, NO Cloud Functions, NO Firestore.
 *
 * NOTE: This file also maintains backward compatibility with existing LIVE implementations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Backward compatibility types for existing LIVE implementation
export interface LiveRoom {
  roomId: string;
  hostId?: string;
  title?: string;
  status?: string;
  viewerCount?: number;
  totalGiftsTokens?: number;
  tags?: string[];
  is18Plus?: boolean;
}

// Backward compatibility functions (stubs for existing code)
export async function getHostLiveDashboard(): Promise<any> {
  return {
    canGoLive: { canGoLive: true },
  };
}

export async function createOrGetRoom(): Promise<LiveRoom> {
  const roomId = `room_${Date.now()}`;
  return { roomId, status: 'created', viewerCount: 0, totalGiftsTokens: 0 };
}

export async function startSession(roomId: string): Promise<{ sessionId: string }> {
  return { sessionId: `session_${Date.now()}` };
}

// Deprecated function - kept for backward compatibility
export async function listLiveRooms(): Promise<LiveRoom[]> {
  return [];
}

// Storage keys
const STORAGE_KEYS = {
  LIVE_SESSIONS: '@avalo_live_sessions',
  LIVE_UNLOCKS: '@avalo_live_unlocks',
  LIVE_EARNINGS: '@avalo_live_earnings',
  USER_TOKENS: '@avalo_user_tokens',
};

// Constants
const CREATOR_SHARE = 0.65; // 65% to creator
const AVALO_SHARE = 0.35; // 35% to Avalo
const VIP_DISCOUNT = 0.20; // 20% discount for VIP

// Types
export interface LiveSession {
  liveId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  entryFee: number;
  startedAt: Date;
  endedAt?: Date;
  viewerCount: number;
  totalEarnings: number;
  isActive: boolean;
}

export interface LiveUnlock {
  userId: string;
  liveId: string;
  paidAmount: number;
  unlockedAt: Date;
  isVip: boolean;
}

export interface LiveEarnings {
  liveId: string;
  creatorId: string;
  totalRevenue: number;
  creatorShare: number;
  avaloShare: number;
  viewerCount: number;
  entries: Array<{
    viewerId: string;
    amount: number;
    timestamp: Date;
  }>;
}

export interface UserTokenBalance {
  userId: string;
  balance: number;
  lastUpdated: Date;
}

/**
 * Get user's token balance
 */
export async function getUserTokenBalance(userId: string): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKENS);
    if (!data) return 0;
    
    const balances: Record<string, UserTokenBalance> = JSON.parse(data);
    return balances[userId]?.balance || 0;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

/**
 * Update user's token balance
 */
async function updateUserTokenBalance(
  userId: string,
  amount: number,
  operation: 'add' | 'subtract'
): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKENS);
    const balances: Record<string, UserTokenBalance> = data ? JSON.parse(data) : {};
    
    const currentBalance = balances[userId]?.balance || 0;
    const newBalance = operation === 'add' 
      ? currentBalance + amount 
      : currentBalance - amount;
    
    if (newBalance < 0) return false;
    
    balances[userId] = {
      userId,
      balance: newBalance,
      lastUpdated: new Date(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKENS, JSON.stringify(balances));
    return true;
  } catch (error) {
    console.error('Error updating token balance:', error);
    return false;
  }
}

/**
 * Create a new LIVE session
 */
export async function createLive(
  creatorId: string,
  creatorName: string,
  title: string,
  entryFee: number
): Promise<LiveSession> {
  try {
    const liveId = `live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: LiveSession = {
      liveId,
      creatorId,
      creatorName,
      title,
      entryFee,
      startedAt: new Date(),
      viewerCount: 0,
      totalEarnings: 0,
      isActive: true,
    };
    
    // Save to storage
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    const sessions: Record<string, LiveSession> = data ? JSON.parse(data) : {};
    sessions[liveId] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_SESSIONS, JSON.stringify(sessions));
    
    // Initialize earnings tracker
    const earnings: LiveEarnings = {
      liveId,
      creatorId,
      totalRevenue: 0,
      creatorShare: 0,
      avaloShare: 0,
      viewerCount: 0,
      entries: [],
    };
    
    const earningsData = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_EARNINGS);
    const allEarnings: Record<string, LiveEarnings> = earningsData ? JSON.parse(earningsData) : {};
    allEarnings[liveId] = earnings;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_EARNINGS, JSON.stringify(allEarnings));
    
    return session;
  } catch (error) {
    console.error('Error creating LIVE session:', error);
    throw error;
  }
}

/**
 * End a LIVE session
 */
export async function endLive(liveId: string, creatorId: string): Promise<LiveSession> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!data) throw new Error('LIVE session not found');
    
    const sessions: Record<string, LiveSession> = JSON.parse(data);
    const session = sessions[liveId];
    
    if (!session) throw new Error('LIVE session not found');
    if (session.creatorId !== creatorId) throw new Error('Not authorized');
    if (!session.isActive) throw new Error('LIVE already ended');
    
    session.isActive = false;
    session.endedAt = new Date();
    
    sessions[liveId] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_SESSIONS, JSON.stringify(sessions));
    
    return session;
  } catch (error) {
    console.error('Error ending LIVE session:', error);
    throw error;
  }
}

/**
 * Set entry fee for a LIVE session
 */
export async function setEntryFee(
  liveId: string,
  creatorId: string,
  entryFee: number
): Promise<LiveSession> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!data) throw new Error('LIVE session not found');
    
    const sessions: Record<string, LiveSession> = JSON.parse(data);
    const session = sessions[liveId];
    
    if (!session) throw new Error('LIVE session not found');
    if (session.creatorId !== creatorId) throw new Error('Not authorized');
    if (!session.isActive) throw new Error('Cannot modify ended LIVE');
    
    session.entryFee = entryFee;
    
    sessions[liveId] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_SESSIONS, JSON.stringify(sessions));
    
    return session;
  } catch (error) {
    console.error('Error setting entry fee:', error);
    throw error;
  }
}

/**
 * Calculate entry price for viewer (with VIP discount)
 */
export function calculateEntryPrice(basePrice: number, isVip: boolean): number {
  if (!isVip) return basePrice;
  
  // VIP gets 20% discount, but NEVER 100% free
  const discountedPrice = Math.round(basePrice * (1 - VIP_DISCOUNT));
  return Math.max(discountedPrice, 1); // Minimum 1 token
}

/**
 * Join a LIVE session (pay entry fee)
 */
export async function joinLive(
  liveId: string,
  viewerId: string,
  isVip: boolean = false
): Promise<{
  success: boolean;
  message?: string;
  entryPrice?: number;
  creatorEarned?: number;
}> {
  try {
    // Get LIVE session
    const sessionData = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!sessionData) return { success: false, message: 'LIVE session not found' };
    
    const sessions: Record<string, LiveSession> = JSON.parse(sessionData);
    const session = sessions[liveId];
    
    if (!session) return { success: false, message: 'LIVE session not found' };
    if (!session.isActive) return { success: false, message: 'LIVE has ended' };
    
    // Check if already unlocked
    const hasAccess = await checkAccess(liveId, viewerId);
    if (hasAccess) return { success: true, message: 'Already unlocked' };
    
    // Calculate entry price (with VIP discount)
    const entryPrice = calculateEntryPrice(session.entryFee, isVip);
    
    // Check viewer balance
    const viewerBalance = await getUserTokenBalance(viewerId);
    if (viewerBalance < entryPrice) {
      return { 
        success: false, 
        message: 'Insufficient tokens',
        entryPrice 
      };
    }
    
    // Process payment
    const creatorShare = Math.round(entryPrice * CREATOR_SHARE);
    const avaloShare = entryPrice - creatorShare;
    
    // Deduct from viewer
    const deductSuccess = await updateUserTokenBalance(viewerId, entryPrice, 'subtract');
    if (!deductSuccess) {
      return { success: false, message: 'Payment failed' };
    }
    
    // Credit creator
    await updateUserTokenBalance(session.creatorId, creatorShare, 'add');
    
    // Record unlock
    const unlockData = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_UNLOCKS);
    const unlocks: LiveUnlock[] = unlockData ? JSON.parse(unlockData) : [];
    
    unlocks.push({
      userId: viewerId,
      liveId,
      paidAmount: entryPrice,
      unlockedAt: new Date(),
      isVip,
    });
    
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_UNLOCKS, JSON.stringify(unlocks));
    
    // Update session stats
    session.viewerCount += 1;
    session.totalEarnings += creatorShare;
    sessions[liveId] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_SESSIONS, JSON.stringify(sessions));
    
    // Update earnings tracker
    const earningsData = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_EARNINGS);
    const allEarnings: Record<string, LiveEarnings> = earningsData ? JSON.parse(earningsData) : {};
    const earnings = allEarnings[liveId] || {
      liveId,
      creatorId: session.creatorId,
      totalRevenue: 0,
      creatorShare: 0,
      avaloShare: 0,
      viewerCount: 0,
      entries: [],
    };
    
    earnings.totalRevenue += entryPrice;
    earnings.creatorShare += creatorShare;
    earnings.avaloShare += avaloShare;
    earnings.viewerCount += 1;
    earnings.entries.push({
      viewerId,
      amount: entryPrice,
      timestamp: new Date(),
    });
    
    allEarnings[liveId] = earnings;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVE_EARNINGS, JSON.stringify(allEarnings));
    
    return { 
      success: true, 
      entryPrice,
      creatorEarned: creatorShare,
    };
  } catch (error) {
    console.error('Error joining LIVE:', error);
    return { success: false, message: 'An error occurred' };
  }
}

/**
 * Check if user has access to LIVE session
 */
export async function checkAccess(liveId: string, userId: string): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_UNLOCKS);
    if (!data) return false;
    
    const unlocks: LiveUnlock[] = JSON.parse(data);
    
    // Check if user has unlocked this specific LIVE
    const hasUnlock = unlocks.some(
      u => u.liveId === liveId && u.userId === userId
    );
    
    return hasUnlock;
  } catch (error) {
    console.error('Error checking access:', error);
    return false;
  }
}

/**
 * Get LIVE session by ID
 */
export async function getLiveSession(liveId: string): Promise<LiveSession | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!data) return null;
    
    const sessions: Record<string, LiveSession> = JSON.parse(data);
    return sessions[liveId] || null;
  } catch (error) {
    console.error('Error getting LIVE session:', error);
    return null;
  }
}

/**
 * Get earnings for a LIVE session
 */
export async function getLiveEarnings(liveId: string): Promise<LiveEarnings | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_EARNINGS);
    if (!data) return null;
    
    const allEarnings: Record<string, LiveEarnings> = JSON.parse(data);
    return allEarnings[liveId] || null;
  } catch (error) {
    console.error('Error getting LIVE earnings:', error);
    return null;
  }
}

/**
 * Get all active LIVE sessions
 */
export async function getActiveLiveSessions(): Promise<LiveSession[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!data) return [];
    
    const sessions: Record<string, LiveSession> = JSON.parse(data);
    return Object.values(sessions).filter(s => s.isActive);
  } catch (error) {
    console.error('Error getting active LIVE sessions:', error);
    return [];
  }
}

/**
 * Get creator's LIVE history
 */
export async function getCreatorLiveHistory(creatorId: string): Promise<LiveSession[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
    if (!data) return [];
    
    const sessions: Record<string, LiveSession> = JSON.parse(data);
    return Object.values(sessions)
      .filter(s => s.creatorId === creatorId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch (error) {
    console.error('Error getting creator LIVE history:', error);
    return [];
  }
}

/**
 * Get total earnings for creator
 */
export async function getCreatorTotalEarnings(creatorId: string): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_EARNINGS);
    if (!data) return 0;
    
    const allEarnings: Record<string, LiveEarnings> = JSON.parse(data);
    return Object.values(allEarnings)
      .filter(e => e.creatorId === creatorId)
      .reduce((sum, e) => sum + e.creatorShare, 0);
  } catch (error) {
    console.error('Error getting creator total earnings:', error);
    return 0;
  }
}

/**
 * Format earnings display text
 */
export function formatEarnings(amount: number): string {
  return `+${amount} tokens • 65% after commission`;
}

/**
 * Get entry fee presets
 */
export const ENTRY_FEE_PRESETS = [10, 15, 25, 40, 60, 100];

export default {
  createLive,
  endLive,
  setEntryFee,
  joinLive,
  checkAccess,
  getLiveSession,
  getLiveEarnings,
  getActiveLiveSessions,
  getCreatorLiveHistory,
  getCreatorTotalEarnings,
  getUserTokenBalance,
  calculateEntryPrice,
  formatEarnings,
  ENTRY_FEE_PRESETS,
};