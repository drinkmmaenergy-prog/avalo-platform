/**
 * PACK 75 - Call Pricing Module
 * 
 * Determines tokens-per-minute pricing for voice and video calls
 * Based on caller/callee membership status and call mode
 * 
 * NO TOKEN PRICE CHANGES - uses existing pricing from config
 */

import { db } from './init.js';

export interface CallPricing {
  tokensPerMinute: number;
  pricingProfile?: string | null;
}

type CallMode = 'VOICE' | 'VIDEO';
type UserMembershipTier = 'STANDARD' | 'VIP' | 'ROYAL';

interface UserProfile {
  userId: string;
  membershipTier: UserMembershipTier;
  verifiedCreator?: boolean;
}

/**
 * Get pricing for a voice or video call
 * Uses existing monetization config values
 * Pricing is based on CALLER's membership tier
 */
export async function getCallPricing(
  callerUserId: string,
  calleeUserId: string,
  mode: CallMode
): Promise<CallPricing> {
  try {
    // Fetch caller profile to determine membership tier
    const callerDoc = await db.collection('users').doc(callerUserId).get();
    
    if (!callerDoc.exists) {
      throw new Error('Caller not found');
    }

    const callerData = callerDoc.data();
    const membershipTier: UserMembershipTier = callerData?.membershipTier || 'STANDARD';

    // Get base pricing from config (matches monetization.ts CALL_CONFIG)
    // These values are from the existing config and should not be changed
    let tokensPerMinute: number;
    let pricingProfile: string;

    if (mode === 'VOICE') {
      switch (membershipTier) {
        case 'VIP':
          tokensPerMinute = 10; // VIP gets same as standard for voice
          pricingProfile = 'voice_vip';
          break;
        case 'ROYAL':
          tokensPerMinute = 6; // Royal gets 40% discount
          pricingProfile = 'voice_royal';
          break;
        default:
          tokensPerMinute = 10;
          pricingProfile = 'voice_standard';
      }
    } else {
      // VIDEO mode
      switch (membershipTier) {
        case 'VIP':
          tokensPerMinute = 15; // VIP gets same as standard for video
          pricingProfile = 'video_vip';
          break;
        case 'ROYAL':
          tokensPerMinute = 10; // Royal gets 33% discount
          pricingProfile = 'video_royal';
          break;
        default:
          tokensPerMinute = 15;
          pricingProfile = 'video_standard';
      }
    }

    return {
      tokensPerMinute,
      pricingProfile
    };
  } catch (error) {
    console.error('Error fetching call pricing:', error);
    // Fallback to standard pricing
    return {
      tokensPerMinute: mode === 'VOICE' ? 10 : 15,
      pricingProfile: `${mode.toLowerCase()}_standard`
    };
  }
}

/**
 * Validate call pricing (used before creating call session)
 */
export function validateCallPricing(tokensPerMinute: number, mode: CallMode): boolean {
  // Ensure pricing is within acceptable ranges
  if (mode === 'VOICE') {
    return tokensPerMinute >= 6 && tokensPerMinute <= 10;
  } else {
    return tokensPerMinute >= 10 && tokensPerMinute <= 15;
  }
}