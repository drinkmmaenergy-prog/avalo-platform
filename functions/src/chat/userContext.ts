/**
 * chat/userContext.ts
 * Canonical user-context resolution for chat role determination.
 * Extracted from chatMonetization.ts (ARCHIVED [G5]) — clean of forbidden wallet paths.
 * Only reads users/{uid} (profile) and royal_memberships/{uid}.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../init';

export type PopularityLevel = 'low' | 'mid' | 'high';

export interface ChatParticipantContext {
  userId: string;
  gender: 'male' | 'female' | 'other';
  earnOnChat: boolean;
  influencerBadge: boolean;
  isRoyalMember: boolean;
  popularity: PopularityLevel;
  accountAgeDays: number;
}

/**
 * Resolves the chat-role context for a user.
 * Reads ONLY: users/{uid} (profile) and royal_memberships/{uid}.
 * Never reads any wallet or earning collection.
 */
export async function getUserContext(userId: string): Promise<ChatParticipantContext> {
  const userSnap = await db.collection('users').doc(userId).get();

  if (!userSnap.exists) {
    throw new HttpsError('not-found', `User ${userId} not found`);
  }

  const user = userSnap.data() as any;

  const createdAt = user.createdAt?.toDate?.() || new Date();
  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  let popularity: PopularityLevel = 'mid';
  if (user.stats?.followers < 100) {
    popularity = 'low';
  } else if (user.stats?.followers > 1000) {
    popularity = 'high';
  }

  let isRoyalMember = false;
  try {
    const royalMembershipSnap = await db.collection('royal_memberships').doc(userId).get();
    if (royalMembershipSnap.exists) {
      const royalData = royalMembershipSnap.data();
      isRoyalMember = royalData?.tier !== 'NONE';
    }
  } catch {
    // Non-blocking — default false
  }

  return {
    userId: user.uid,
    gender: user.gender === 'male' ? 'male' : user.gender === 'female' ? 'female' : 'other',
    earnOnChat: user.modes?.earnFromChat || false,
    influencerBadge: user.badges?.some((b: any) => b.type === 'influencer') || false,
    isRoyalMember,
    popularity,
    accountAgeDays,
  };
}
