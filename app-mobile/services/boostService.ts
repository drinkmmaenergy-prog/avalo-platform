/**
 * Boost Service
 * Handles all boost-related operations
 */

import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export type BoostType = 'DISCOVERY_PROFILE' | 'CHAT_RETARGET';
export type BoostStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type BoostVisibility = 'GLOBAL' | 'LOCAL';
export type DiscoveryTier = 'basic' | 'plus' | 'max';

export interface Boost {
  id: string;
  userId: string;
  type: BoostType;
  status: BoostStatus;
  createdAt: Date;
  expiresAt: Date;
  tokensCharged: number;
  visibility: BoostVisibility;
  targetUserId?: string;
  chatId?: string;
  meta?: Record<string, any>;
}

export interface UserBoost {
  id: string;
  type: BoostType;
  status: BoostStatus;
  tokensCharged: number;
  createdAt?: { seconds: number; nanoseconds: number };
  expiresAt?: { seconds: number; nanoseconds: number };
  visibility?: BoostVisibility;
}

export interface BoostConfig {
  tokens: number;
  durationMinutes: number;
}

export const BOOST_CONFIG = {
  discovery: {
    basic: { tokens: 80, durationMinutes: 30 },
    plus: { tokens: 180, durationMinutes: 90 },
    max: { tokens: 400, durationMinutes: 240 },
  },
  chatRetarget: {
    ping: { tokens: 60, durationMinutes: 60 },
  },
};

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

const getFunctionsInstance = () => {
  try {
    const app = getApp();
    return getFunctions(app);
  } catch (error) {
    console.error('Error getting Functions instance:', error);
    throw error;
  }
};

/**
 * Create a Discovery Boost
 */
export const createDiscoveryBoost = async (
  userId: string,
  tier: DiscoveryTier
): Promise<{ success: boolean; boostId: string; expiresAt: Date }> => {
  try {
    const functions = getFunctionsInstance();
    const createBoost = httpsCallable(functions, 'boost_createDiscoveryBoost');
    
    const result = await createBoost({ userId, tier });
    const data = result.data as any;
    
    return {
      success: data.success,
      boostId: data.boostId,
      expiresAt: new Date(data.expiresAt),
    };
  } catch (error: any) {
    console.error('Error creating discovery boost:', error);
    throw new Error(error.message || 'Failed to create discovery boost');
  }
};

/**
 * Create a Chat Retarget Boost
 */
export const createChatRetargetBoost = async (
  userId: string,
  chatId: string
): Promise<{ success: boolean; boostId: string; expiresAt: Date }> => {
  try {
    const functions = getFunctionsInstance();
    const createBoost = httpsCallable(functions, 'boost_createChatRetargetBoost');
    
    const result = await createBoost({ userId, chatId });
    const data = result.data as any;
    
    return {
      success: data.success,
      boostId: data.boostId,
      expiresAt: new Date(data.expiresAt),
    };
  } catch (error: any) {
    console.error('Error creating chat retarget boost:', error);
    throw new Error(error.message || 'Failed to create chat retarget boost');
  }
};

/**
 * Get active boost for a user
 */
export const getActiveDiscoveryBoost = async (
  userId: string
): Promise<Boost | null> => {
  try {
    const db = getDb();
    const boostsRef = collection(db, 'boosts');
    const q = query(
      boostsRef,
      where('userId', '==', userId),
      where('type', '==', 'DISCOVERY_PROFILE'),
      where('status', '==', 'ACTIVE')
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    // Return the first active boost (should only be one)
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    return {
      id: doc.id,
      userId: data.userId,
      type: data.type,
      status: data.status,
      createdAt: data.createdAt?.toDate() || new Date(),
      expiresAt: data.expiresAt?.toDate() || new Date(),
      tokensCharged: data.tokensCharged,
      visibility: data.visibility,
      meta: data.meta,
    };
  } catch (error) {
    console.error('Error getting active boost:', error);
    return null;
  }
};

/**
 * Check if a profile is currently boosted
 */
export const isProfileBoosted = async (userId: string): Promise<boolean> => {
  const boost = await getActiveDiscoveryBoost(userId);
  if (!boost) return false;
  
  // Check if boost is still valid (not expired)
  return boost.expiresAt > new Date();
};

/**
 * Get remaining time for active boost in minutes
 */
export const getBoostRemainingMinutes = (boost: Boost): number => {
  const now = new Date();
  const remaining = boost.expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / (1000 * 60)));
};

/**
 * Check if chat is inactive and eligible for retargeting
 */
export const isChatEligibleForRetarget = async (
  chatId: string,
  minInactiveMinutes: number = 60
): Promise<{ eligible: boolean; minutesSinceActivity?: number }> => {
  try {
    const db = getDb();
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      return { eligible: false };
    }
    
    const chat = chatSnap.data();
    const lastActivityAt = chat.lastActivityAt?.toDate?.() || new Date(0);
    const minutesSinceActivity = (Date.now() - lastActivityAt.getTime()) / (1000 * 60);
    
    return {
      eligible: minutesSinceActivity >= minInactiveMinutes,
      minutesSinceActivity: Math.floor(minutesSinceActivity),
    };
  } catch (error) {
    console.error('Error checking chat eligibility:', error);
    return { eligible: false };
  }
};

/**
 * Fetch user's boost history
 * Returns last N boosts for the authenticated user
 */
export const fetchUserBoosts = async (limit: number = 20): Promise<UserBoost[]> => {
  try {
    const functions = getFunctionsInstance();
    const getUserBoostsFn = httpsCallable(functions, 'boost_getUserBoosts');
    
    const result = await getUserBoostsFn({ limit });
    const data = result.data as any;
    
    if (!data.success || !data.boosts) {
      return [];
    }
    
    return data.boosts.map((boost: any) => ({
      id: boost.id,
      type: boost.type as BoostType,
      status: boost.status as BoostStatus,
      tokensCharged: boost.tokensCharged,
      createdAt: boost.createdAt,
      expiresAt: boost.expiresAt,
      visibility: boost.visibility as BoostVisibility,
    }));
  } catch (error: any) {
    console.error('Error fetching user boosts:', error);
    throw new Error(error.message || 'Failed to fetch user boosts');
  }
};