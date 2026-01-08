/**
 * AI Avatar Service
 * Phase 4: SFW avatar generation skeleton (no real AI API)
 */

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { AIAvatarGeneration, AvatarGenerationRequest } from '../types/aiAvatar';
import { AI_AVATAR_CONFIG } from '../config/monetization';
import { getTokenBalance } from './tokenService';

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
 * Generate an AI avatar (placeholder implementation)
 * In production, this would call a real AI image generation API
 */
export async function generateAIAvatar(
  userId: string,
  request: AvatarGenerationRequest
): Promise<{ success: boolean; avatarId?: string; imageUrl?: string; error?: string }> {
  try {
    const db = getDb();
    const tokenCost = AI_AVATAR_CONFIG.AVATAR_GENERATION_COST;
    
    // Check user balance
    const balance = await getTokenBalance(userId);
    if (balance < tokenCost) {
      return {
        success: false,
        error: 'INSUFFICIENT_BALANCE',
      };
    }
    
    // Deduct tokens from user
    const walletRef = doc(db, 'balances', userId, 'wallet');
    await updateDoc(walletRef, {
      tokens: increment(-tokenCost),
      lastUpdated: serverTimestamp(),
    });
    
    // Generate placeholder avatar (in production, call AI API here)
    const placeholderImageUrl = generatePlaceholderAvatarUrl(request.gender, request.style);
    
    // Save avatar generation record
    const avatarsRef = collection(db, 'ai_avatars');
    const avatarDoc = await addDoc(avatarsRef, {
      userId,
      gender: request.gender,
      style: request.style,
      tokenCost,
      imageUrl: placeholderImageUrl,
      isPlaceholder: true, // Mark as placeholder until real AI integration
      createdAt: serverTimestamp(),
    });
    
    // Record transaction
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: userId,
      receiverUid: 'system',
      tokensAmount: tokenCost,
      avaloFee: tokenCost, // 100% to Avalo for AI services
      chatId: 'ai_avatar',
      transactionType: 'ai_avatar',
      avatarId: avatarDoc.id,
      createdAt: serverTimestamp(),
    });
    
    return {
      success: true,
      avatarId: avatarDoc.id,
      imageUrl: placeholderImageUrl,
    };
  } catch (error) {
    console.error('Error generating AI avatar:', error);
    return {
      success: false,
      error: 'GENERATION_ERROR',
    };
  }
}

/**
 * Get user's generated avatars
 */
export async function getUserAvatars(
  userId: string,
  limitCount: number = 20
): Promise<AIAvatarGeneration[]> {
  try {
    const db = getDb();
    const avatarsRef = collection(db, 'ai_avatars');
    const q = query(
      avatarsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const avatars: AIAvatarGeneration[] = [];
    
    snapshot.forEach(doc => {
      avatars.push({
        id: doc.id,
        ...doc.data(),
      } as AIAvatarGeneration);
    });
    
    return avatars;
  } catch (error) {
    console.error('Error getting user avatars:', error);
    return [];
  }
}

/**
 * Generate placeholder avatar URL based on style and gender
 * In production, this would be replaced with actual AI-generated image URLs
 */
function generatePlaceholderAvatarUrl(gender: string, style: string): string {
  // Using emoji placeholders for now
  const avatarMap: Record<string, Record<string, string>> = {
    male: {
      casual: '👨',
      elegant: '🤵',
      sporty: '🏃‍♂️',
      fantasy: '🧙‍♂️',
    },
    female: {
      casual: '👩',
      elegant: '👗',
      sporty: '🏃‍♀️',
      fantasy: '🧚‍♀️',
    },
    androgynous: {
      casual: '🧑',
      elegant: '🧑‍🎤',
      sporty: '🧑‍🎨',
      fantasy: '🧝',
    },
  };
  
  const emoji = avatarMap[gender]?.[style] || '👤';
  
  // In production, return actual image URL
  // For now, return a data URI with the emoji as placeholder
  return `placeholder:${emoji}`;
}

/**
 * Get generation statistics
 */
export async function getAvatarGenerationStats(userId: string): Promise<{
  totalGenerated: number;
  totalTokensSpent: number;
}> {
  try {
    const db = getDb();
    const avatarsRef = collection(db, 'ai_avatars');
    const q = query(avatarsRef, where('userId', '==', userId));
    
    const snapshot = await getDocs(q);
    
    let totalGenerated = 0;
    let totalTokensSpent = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data() as AIAvatarGeneration;
      totalGenerated++;
      totalTokensSpent += data.tokenCost;
    });
    
    return {
      totalGenerated,
      totalTokensSpent,
    };
  } catch (error) {
    console.error('Error getting avatar stats:', error);
    return {
      totalGenerated: 0,
      totalTokensSpent: 0,
    };
  }
}