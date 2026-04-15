"use client";

/**
 * Token Purchase Service with Stripe Integration
 * Handles token purchases, fraud detection, and payment processing
 */

import { requireFunctions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { TOKEN_PACKS, type TokenPack } from '../monetization';

// ============================================================================
// STRIPE INTEGRATION
// ============================================================================

export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
}

/**
 * Create Stripe payment intent for token purchase
 */
export async function createTokenPaymentIntent(params: {
  userId: string;
  packId: string;
  paymentMethod?: string;
}): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
  try {
    const create = httpsCallable<typeof params, {
      success: boolean;
      clientSecret: string;
    }>(requireFunctions(), 'createTokenPaymentIntent');
    
    const result = await create(params);
    return result.data;
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    return {
      success: false,
      error: error.message || 'Failed to create payment intent',
    };
  }
}

/**
 * Confirm token purchase after successful payment
 * Backend handles fraud detection via Risk Engine (R21)
 */
export async function confirmTokenPurchase(params: {
  userId: string;
  packId: string;
  paymentIntentId: string;
  deviceFingerprint?: Record<string, any>;
}): Promise<{ success: boolean; tokens?: number; error?: string }> {
  try {
    const confirm = httpsCallable<typeof params, {
      success: boolean;
      tokens: number;
    }>(requireFunctions(), 'confirmTokenPurchase');
    
    const result = await confirm(params);
    return result.data;
  } catch (error: any) {
    console.error('Error confirming purchase:', error);
    return {
      success: false,
      error: error.message || 'Failed to confirm purchase',
    };
  }
}

// ============================================================================
// TOKEN PACKS
// ============================================================================

/**
 * Get available token packs
 */
export function getTokenPacks(): TokenPack[] {
  return TOKEN_PACKS;
}

/**
 * Get specific token pack
 */
export function getTokenPack(packId: string): TokenPack | undefined {
  return TOKEN_PACKS.find(pack => pack.packId === packId);
}

/**
 * Get localized price for pack
 */
export async function getLocalizedPrice(params: {
  packId: string;
  countryCode?: string;
}): Promise<{ price: number; currency: string; displayPrice: string }> {
  try {
    const getPrice = httpsCallable<typeof params, {
      price: number;
      currency: string;
      displayPrice: string;
    }>(requireFunctions(), 'getLocalizedTokenPrice');
    
    const result = await getPrice(params);
    return result.data;
  } catch (error) {
    // Fallback to USD pricing
    const pack = getTokenPack(params.packId);
    return {
      price: pack?.price || 0,
      currency: 'USD',
      displayPrice: `$${pack?.price.toFixed(2) || '0.00'}`,
    };
  }
}

// ============================================================================
// DEVICE FINGERPRINTING (Fraud Detection)
// ============================================================================

/**
 * Generate device fingerprint for fraud detection
 */
export function generateDeviceFingerprint(): Record<string, any> {
  const fingerprint: Record<string, any> = {
    timestamp: Date.now(),
  };

  if (typeof window !== 'undefined') {
    fingerprint.userAgent = navigator.userAgent;
    fingerprint.language = navigator.language;
    fingerprint.platform = navigator.platform;
    fingerprint.screenResolution = `${window.screen.width}x${window.screen.height}`;
    fingerprint.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fingerprint.colorDepth = window.screen.colorDepth;
    
    // Canvas fingerprinting (basic)
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Avalo', 2, 2);
        fingerprint.canvasHash = canvas.toDataURL().slice(-50);
      }
    } catch (error) {
      // Ignore canvas fingerprinting errors
    }
  }

  return fingerprint;
}

// ============================================================================
// PURCHASE HISTORY
// ============================================================================

/**
 * Get user's token purchase history
 */
export async function getPurchaseHistory(params: {
  userId: string;
  limit?: number;
}): Promise<any[]> {
  try {
    const getHistory = httpsCallable<typeof params, { purchases: any[] }>(requireFunctions(),
      'getTokenPurchaseHistory'
    );
    
    const result = await getHistory(params);
    return result.data.purchases;
  } catch (error) {
    console.error('Error getting purchase history:', error);
    return [];
  }
}

// ============================================================================
// WALLET BALANCE
// ============================================================================

/**
 * Get user's current token balance
 */
export async function getTokenBalance(userId: string): Promise<number> {
  const parseBalance = (data: any): number | null => {
    const candidates = [data?.balance, data?.tokenBalance, data?.tokensBalance, data?.tokens];
    for (const v of candidates) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  };

  try {
    const getWalletBalance = httpsCallable<{ userId: string }, Record<string, unknown>>(requireFunctions(),
      'getWalletBalance'
    );

    const result = await getWalletBalance({ userId });
    const parsed = parseBalance(result.data);
    return parsed ?? 0;
  } catch (error) {
    console.error('Error getting wallet balance via getWalletBalance:', error);
    return 0;
  }
}



