/**
 * Membership Service
 * Manages VIP and Royal Klub memberships
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  collection,
  addDoc,
} from 'firebase/firestore';
import {
  MembershipType,
  VIP_BENEFITS,
  ROYAL_BENEFITS,
  VIP_TIERS,
  ROYAL_MONTHLY_PRICE,
} from '../config/monetization';

export interface Membership {
  userId: string;
  type: MembershipType;
  tier?: string; // 'vip_monthly', 'vip_quarterly', 'vip_yearly', 'royal'
  startDate: Timestamp;
  endDate: Timestamp;
  isActive: boolean;
  autoRenew: boolean;
  paymentMethod?: 'tokens' | 'stripe';
  lastPayment?: Timestamp;
}

export interface MembershipBenefits {
  superlikesPerDay: number | 'unlimited';
  rewindsPerDay: number | 'unlimited';
  videoVoiceDiscount: number;
  discoveryPriorityMultiplier: number;
  canSeeLikes: boolean;
  earnToChatWordsPerToken?: number;
  hasVIPBadge: boolean;
  hasRoyalBadge: boolean;
}

/**
 * Get user's current membership
 */
export async function getUserMembership(userId: string): Promise<Membership | null> {
  try {
    const db = getFirestore();
    const membershipRef = doc(db, 'memberships', userId);
    const membershipSnap = await getDoc(membershipRef);

    if (!membershipSnap.exists()) {
      return null;
    }

    const membership = membershipSnap.data() as Membership;
    
    // Check if membership is still active
    const now = new Date();
    const endDate = membership.endDate.toDate();

    if (membership.isActive && endDate > now) {
      return membership;
    }

    // Membership expired, deactivate it
    if (membership.isActive && endDate <= now) {
      await setDoc(
        membershipRef,
        { isActive: false },
        { merge: true }
      );
      return null;
    }

    return null;
  } catch (error) {
    console.error('Error getting user membership:', error);
    return null;
  }
}

/**
 * Get membership type for a user
 */
export async function getMembershipType(userId: string): Promise<MembershipType> {
  const membership = await getUserMembership(userId);
  return membership?.type || 'none';
}

/**
 * Get membership status for a user (type and isActive)
 */
export async function getMembershipStatus(userId: string): Promise<{
  type: MembershipType;
  isActive: boolean;
}> {
  const membership = await getUserMembership(userId);
  return {
    type: membership?.type || 'none',
    isActive: membership?.isActive || false,
  };
}

/**
 * Get benefits for a membership type
 */
export function getMembershipBenefits(membershipType: MembershipType): MembershipBenefits {
  switch (membershipType) {
    case 'royal':
      return {
        superlikesPerDay: 'unlimited',
        rewindsPerDay: 'unlimited',
        videoVoiceDiscount: ROYAL_BENEFITS.VIDEO_VOICE_DISCOUNT,
        discoveryPriorityMultiplier:
          VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER + 
          ROYAL_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER,
        canSeeLikes: true,
        earnToChatWordsPerToken: ROYAL_BENEFITS.EARN_TO_CHAT_WORDS_PER_TOKEN,
        hasVIPBadge: false,
        hasRoyalBadge: true,
      };
    
    case 'vip':
      return {
        superlikesPerDay: VIP_BENEFITS.SUPERLIKES_PER_DAY,
        rewindsPerDay: VIP_BENEFITS.REWINDS_PER_DAY,
        videoVoiceDiscount: VIP_BENEFITS.VIDEO_VOICE_DISCOUNT,
        discoveryPriorityMultiplier: VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER,
        canSeeLikes: VIP_BENEFITS.CAN_SEE_LIKES,
        hasVIPBadge: true,
        hasRoyalBadge: false,
      };
    
    default: // 'none'
      return {
        superlikesPerDay: 0,
        rewindsPerDay: 0,
        videoVoiceDiscount: 0,
        discoveryPriorityMultiplier: 1,
        canSeeLikes: false,
        hasVIPBadge: false,
        hasRoyalBadge: false,
      };
  }
}

/**
 * Activate VIP membership (token-based for now)
 */
export async function activateVIPMembership(
  userId: string,
  tierId: string,
  durationMonths: number
): Promise<{ success: boolean; error?: string; endDate?: Date }> {
  try {
    const db = getFirestore();
    
    // Check if user already has active membership
    const existingMembership = await getUserMembership(userId);
    if (existingMembership) {
      return {
        success: false,
        error: 'MEMBERSHIP_ALREADY_ACTIVE',
      };
    }

    // Find tier details
    const tier = VIP_TIERS.find(t => t.tierId === tierId);
    if (!tier) {
      return {
        success: false,
        error: 'INVALID_TIER',
      };
    }

    // Calculate end date
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    // Create membership record
    const membershipRef = doc(db, 'memberships', userId);
    await setDoc(membershipRef, {
      userId,
      type: 'vip',
      tier: tierId,
      startDate: Timestamp.fromDate(now),
      endDate: Timestamp.fromDate(endDate),
      isActive: true,
      autoRenew: true,
      paymentMethod: 'tokens',
      lastPayment: serverTimestamp(),
    });

    // Record transaction (simplified - token cost would be calculated based on tier price)
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: userId,
      receiverUid: 'system',
      tokensAmount: Math.floor(tier.price * 10), // Example conversion: $1 = 10 tokens
      avaloFee: Math.floor(tier.price * 10),
      chatId: 'vip_subscription',
      transactionType: 'vip_subscription',
      tier: tierId,
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      endDate,
    };
  } catch (error) {
    console.error('Error activating VIP membership:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Activate Royal Klub membership (token-based for now)
 */
export async function activateRoyalMembership(
  userId: string,
  durationMonths: number = 1
): Promise<{ success: boolean; error?: string; endDate?: Date }> {
  try {
    const db = getFirestore();
    
    // Check if user already has active membership
    const existingMembership = await getUserMembership(userId);
    if (existingMembership) {
      return {
        success: false,
        error: 'MEMBERSHIP_ALREADY_ACTIVE',
      };
    }

    // Royal Klub pricing from config
    const monthlyPrice = ROYAL_MONTHLY_PRICE;
    
    // Calculate end date
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    // Create membership record
    const membershipRef = doc(db, 'memberships', userId);
    await setDoc(membershipRef, {
      userId,
      type: 'royal',
      tier: 'royal',
      startDate: Timestamp.fromDate(now),
      endDate: Timestamp.fromDate(endDate),
      isActive: true,
      autoRenew: true,
      paymentMethod: 'tokens',
      lastPayment: serverTimestamp(),
    });

    // Record transaction
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: userId,
      receiverUid: 'system',
      tokensAmount: Math.floor(monthlyPrice * 10 * durationMonths),
      avaloFee: Math.floor(monthlyPrice * 10 * durationMonths),
      chatId: 'royal_subscription',
      transactionType: 'royal_subscription',
      durationMonths,
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      endDate,
    };
  } catch (error) {
    console.error('Error activating Royal membership:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Cancel membership (prevent auto-renewal)
 */
export async function cancelMembership(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore();
    const membershipRef = doc(db, 'memberships', userId);
    
    const membershipSnap = await getDoc(membershipRef);
    if (!membershipSnap.exists()) {
      return {
        success: false,
        error: 'NO_ACTIVE_MEMBERSHIP',
      };
    }

    // Set autoRenew to false (membership will remain active until end date)
    await setDoc(
      membershipRef,
      { autoRenew: false },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error canceling membership:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Check if user has specific benefit
 */
export async function hasMembershipBenefit(
  userId: string,
  benefit: keyof MembershipBenefits
): Promise<boolean> {
  const membershipType = await getMembershipType(userId);
  const benefits = getMembershipBenefits(membershipType);
  
  const value = benefits[benefit];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  if (value === 'unlimited') {
    return true;
  }
  
  return false;
}

/**
 * Get days remaining in membership
 */
export function getMembershipDaysRemaining(membership: Membership): number {
  const now = new Date();
  const endDate = membership.endDate.toDate();
  const remainingMs = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
}