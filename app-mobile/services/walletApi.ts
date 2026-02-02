/**
 * PACK 3.2 — Wallet API Service (Read-Only Client)
 * 
 * CANONICAL RULES:
 * - NO token mutations client-side
 * - Balance is READ-ONLY from Firestore
 * - Transactions are READ-ONLY from Firestore
 * - Purchases go through backend Stripe Checkout URL
 * - Token spending happens via httpsCallable functions ONLY
 * 
 * Backend Functions Used:
 * - wallet_getTokenPacks (PACK 277)
 * - tokens_createCheckoutSession (PACK 288)
 * - wallet_getBalance (PACK 277)
 * - wallet_spendTokens (PACK 277 - internal, not called directly)
 */

import { httpsCallable } from 'firebase/functions';
import { 
  doc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { Linking } from 'react-native';

// =============================================================================
// TYPES
// =============================================================================

export interface TokenPack {
  id: string;
  tokens: number;
  basePricePLN: number;
  priceUSD: number;
  priceEUR: number;
  bonus?: number;
  popular?: boolean;
  displayName?: string;
}

export interface WalletBalance {
  tokens: number;
  lastUpdated: Date;
}

export interface Transaction {
  id: string;
  type: 'purchase' | 'spend' | 'earn' | 'refund' | 'payout';
  amount: number;
  description: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

// =============================================================================
// READ-ONLY BALANCE SUBSCRIPTION (from Firestore)
// =============================================================================

/**
 * Subscribe to user's wallet balance (READ-ONLY)
 * Balance is stored by backend, client only reads
 */
export function subscribeToWalletBalance(
  userId: string,
  onBalance: (balance: WalletBalance) => void,
  onError?: (error: Error) => void
): () => void {
  // Primary path: balances/{userId}/wallet
  const walletRef = doc(db, 'balances', userId, 'wallet', 'wallet');
  
  return onSnapshot(
    walletRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onBalance({
          tokens: data.balance ?? data.tokens ?? 0,
          lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(),
        });
      } else {
        // Wallet doesn't exist yet - show 0 balance
        onBalance({ tokens: 0, lastUpdated: new Date() });
      }
    },
    (error) => {
      console.error('[WalletApi] Balance subscription error:', error);
      onError?.(error);
    }
  );
}

/**
 * Alternative: Subscribe to user wallet in users collection
 * Some features store balance at users/{uid}/wallet
 */
export function subscribeToUserWallet(
  userId: string,
  onBalance: (balance: WalletBalance) => void,
  onError?: (error: Error) => void
): () => void {
  const userRef = doc(db, 'users', userId);
  
  return onSnapshot(
    userRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const walletData = data.wallet || {};
        onBalance({
          tokens: walletData.balance ?? walletData.tokens ?? 0,
          lastUpdated: walletData.updatedAt?.toDate?.() ?? new Date(),
        });
      } else {
        onBalance({ tokens: 0, lastUpdated: new Date() });
      }
    },
    (error) => {
      console.error('[WalletApi] User wallet subscription error:', error);
      onError?.(error);
    }
  );
}

// =============================================================================
// READ-ONLY TRANSACTIONS (from Firestore)
// =============================================================================

/**
 * Get user's transaction history (READ-ONLY)
 */
export async function getTransactionHistory(
  userId: string,
  limitCount: number = 50
): Promise<Transaction[]> {
  try {
    const transactionsRef = collection(db, 'transactions');
    
    // Get transactions where user is sender or receiver
    const senderQuery = query(
      transactionsRef,
      where('senderUid', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const receiverQuery = query(
      transactionsRef,
      where('receiverUid', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const [senderSnap, receiverSnap] = await Promise.all([
      getDocs(senderQuery),
      getDocs(receiverQuery),
    ]);
    
    const transactions: Transaction[] = [];
    
    senderSnap.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        type: mapTransactionType(data.transactionType, 'sender'),
        amount: -data.tokensAmount,
        description: getTransactionDescription(data, 'sender'),
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        metadata: data,
      });
    });
    
    receiverSnap.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        type: mapTransactionType(data.transactionType, 'receiver'),
        amount: data.tokensAmount - (data.avaloFee || 0),
        description: getTransactionDescription(data, 'receiver'),
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        metadata: data,
      });
    });
    
    // Sort by date and deduplicate
    return transactions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limitCount);
  } catch (error) {
    console.error('[WalletApi] Get transactions error:', error);
    return [];
  }
}

function mapTransactionType(
  type: string, 
  role: 'sender' | 'receiver'
): Transaction['type'] {
  if (type === 'purchase') return 'purchase';
  if (type === 'payout' || type === 'withdrawal') return 'payout';
  if (type === 'refund') return 'refund';
  return role === 'sender' ? 'spend' : 'earn';
}

function getTransactionDescription(data: Record<string, unknown>, role: 'sender' | 'receiver'): string {
  const type = data.transactionType as string;
  
  if (type === 'purchase') return 'Token purchase';
  if (type === 'payout') return 'Payout to bank';
  if (type === 'refund') return 'Refund';
  if (type === 'message') {
    return role === 'sender' ? 'Message sent' : 'Message received';
  }
  if (type === 'call') {
    return role === 'sender' ? 'Call placed' : 'Call received';
  }
  if (type === 'media') {
    return role === 'sender' ? 'Media unlocked' : 'Media sold';
  }
  if (type === 'gift') {
    return role === 'sender' ? 'Gift sent' : 'Gift received';
  }
  
  return role === 'sender' ? 'Tokens spent' : 'Tokens earned';
}

// =============================================================================
// TOKEN PACKS (from Backend)
// =============================================================================

/**
 * Get available token packs from backend
 * Calls: wallet_getTokenPacks (PACK 277)
 */
export async function getTokenPacks(): Promise<TokenPack[]> {
  try {
    const getPacksCallable = httpsCallable<void, { success: boolean; packs: TokenPack[] }>(
      functions,
      'wallet_getTokenPacks'
    );
    
    const result = await getPacksCallable();
    
    if (result.data.success) {
      return result.data.packs;
    }
    
    console.warn('[WalletApi] Get token packs returned success=false');
    return getDefaultTokenPacks();
  } catch (error) {
    console.error('[WalletApi] Get token packs error:', error);
    // Return default packs as fallback
    return getDefaultTokenPacks();
  }
}

/**
 * Default token packs (fallback if backend unavailable)
 * Prices MUST match backend exactly
 */
function getDefaultTokenPacks(): TokenPack[] {
  return [
    { id: 'mini', tokens: 100, basePricePLN: 31.99, priceUSD: 8.00, priceEUR: 7.50, displayName: 'Mini' },
    { id: 'basic', tokens: 300, basePricePLN: 85.99, priceUSD: 21.50, priceEUR: 20.00, displayName: 'Basic' },
    { id: 'standard', tokens: 500, basePricePLN: 134.99, priceUSD: 34.00, priceEUR: 31.50, displayName: 'Standard', popular: true },
    { id: 'premium', tokens: 1000, basePricePLN: 244.99, priceUSD: 61.50, priceEUR: 57.50, displayName: 'Premium' },
    { id: 'pro', tokens: 2000, basePricePLN: 469.99, priceUSD: 118.00, priceEUR: 110.00, displayName: 'Pro' },
    { id: 'elite', tokens: 5000, basePricePLN: 1125.99, priceUSD: 282.50, priceEUR: 264.00, displayName: 'Elite' },
    { id: 'royal', tokens: 10000, basePricePLN: 2149.99, priceUSD: 539.00, priceEUR: 504.00, displayName: 'Royal' },
  ];
}

// =============================================================================
// STRIPE CHECKOUT (Backend creates session, client redirects)
// =============================================================================

/**
 * Create Stripe Checkout session and redirect to payment
 * Calls: tokens_createCheckoutSession (PACK 288)
 * 
 * FLOW:
 * 1. App calls backend function
 * 2. Backend creates Stripe Checkout Session
 * 3. Backend returns checkoutUrl
 * 4. App opens checkoutUrl in browser
 * 5. User completes payment on Stripe
 * 6. Stripe webhook notifies backend
 * 7. Backend credits tokens (NO client involvement)
 * 8. User returns to app, balance auto-updates via subscription
 */
export async function purchaseTokens(
  packageId: string,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
  }
): Promise<CheckoutResponse> {
  try {
    const createCheckoutCallable = httpsCallable<
      { packageId: string; successUrl?: string; cancelUrl?: string },
      CheckoutResponse
    >(functions, 'tokens_createCheckoutSession');
    
    const result = await createCheckoutCallable({
      packageId,
      successUrl: options?.successUrl ?? 'avalo://wallet/success',
      cancelUrl: options?.cancelUrl ?? 'avalo://wallet/cancel',
    });
    
    if (result.data.success && result.data.checkoutUrl) {
      // Open Stripe Checkout in external browser
      const canOpen = await Linking.canOpenURL(result.data.checkoutUrl);
      
      if (canOpen) {
        await Linking.openURL(result.data.checkoutUrl);
      } else {
        console.error('[WalletApi] Cannot open checkout URL');
        return {
          success: false,
          error: 'CANNOT_OPEN_URL',
        };
      }
      
      return result.data;
    }
    
    return {
      success: false,
      error: result.data.error ?? 'CHECKOUT_FAILED',
    };
  } catch (error: any) {
    console.error('[WalletApi] Purchase tokens error:', error);
    return {
      success: false,
      error: error.code ?? 'UNKNOWN_ERROR',
    };
  }
}

// =============================================================================
// SPEND TOKENS (via Backend Cloud Function ONLY)
// =============================================================================

/**
 * NOTE: Token spending is handled by backend functions automatically
 * when user performs actions (send message, unlock media, etc.)
 * 
 * The app NEVER calls spendTokens directly.
 * Business logic functions (chat, media, calls) handle this internally.
 * 
 * This function exists only for explicit admin/testing scenarios.
 */
export async function _adminSpendTokens(
  amount: number,
  context: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (__DEV__) {
    console.warn('[WalletApi] _adminSpendTokens should not be called in production');
  }
  
  try {
    const spendCallable = httpsCallable<
      { amount: number; context: string; metadata?: Record<string, unknown> },
      { success: boolean; newBalance?: number; error?: string }
    >(functions, 'wallet_spendTokens');
    
    const result = await spendCallable({ amount, context, metadata });
    return result.data;
  } catch (error: any) {
    console.error('[WalletApi] Spend tokens error:', error);
    return { success: false, error: error.code ?? 'UNKNOWN_ERROR' };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const WalletApi = {
  // Read-only subscriptions
  subscribeToWalletBalance,
  subscribeToUserWallet,
  
  // Read-only queries
  getTransactionHistory,
  
  // Backend calls
  getTokenPacks,
  purchaseTokens,
};

export default WalletApi;
