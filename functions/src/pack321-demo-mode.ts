/**
 * PACK 321B — Review/Demo Mode Support (PACK 316 Integration)
 * Provides separate demo wallet functionality for testing without affecting real balances
 */

import { db, generateId, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { WalletData, WalletTransaction } from './types/pack277-wallet.types';

// Demo mode configuration
const DEMO_INITIAL_BALANCE = 1000; // Demo users start with 1000 tokens
const DEMO_WALLET_COLLECTION = 'demoWallets';
const DEMO_TRANSACTIONS_COLLECTION = 'demoWalletTransactions';

/**
 * Check if user is in review/demo mode
 */
export async function isUserInDemoMode(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Check if user has reviewMode or demoMode flag
    return userData?.reviewMode === true || userData?.demoMode === true;
  } catch (error) {
    console.error('Error checking demo mode:', error);
    return false;
  }
}

/**
 * Get wallet collection name based on demo mode
 */
export function getWalletCollection(isDemoMode: boolean): string {
  return isDemoMode ? DEMO_WALLET_COLLECTION : 'wallets';
}

/**
 * Get transactions collection name based on demo mode
 */
export function getTransactionsCollection(isDemoMode: boolean): string {
  return isDemoMode ? DEMO_TRANSACTIONS_COLLECTION : 'walletTransactions';
}

/**
 * Initialize demo wallet for user
 * Creates a separate wallet with demo balance that doesn't affect real wallet
 */
export async function initializeDemoWallet(userId: string): Promise<void> {
  const demoWalletRef = db.collection(DEMO_WALLET_COLLECTION).doc(userId);
  const existingWallet = await demoWalletRef.get();

  if (!existingWallet.exists) {
    const demoWallet: WalletData = {
      userId,
      tokensBalance: DEMO_INITIAL_BALANCE,
      lifetimePurchasedTokens: 0,
      lifetimeSpentTokens: 0,
      lifetimeEarnedTokens: DEMO_INITIAL_BALANCE,
      lastUpdated: serverTimestamp() as any,
      createdAt: serverTimestamp() as any,
    };

    await demoWalletRef.set(demoWallet);

    // Create initial transaction record
    const txId = generateId();
    await db.collection(DEMO_TRANSACTIONS_COLLECTION).doc(txId).set({
      txId,
      userId,
      type: 'EARN',
      source: 'BONUS',
      amountTokens: DEMO_INITIAL_BALANCE,
      beforeBalance: 0,
      afterBalance: DEMO_INITIAL_BALANCE,
      metadata: {
        notes: 'Demo mode initial balance',
        isDemoMode: true,
      },
      timestamp: serverTimestamp(),
    });

    console.log(`Demo wallet initialized for user ${userId} with ${DEMO_INITIAL_BALANCE} tokens`);
  }
}

/**
 * Reset demo wallet to initial state
 * Useful for testing scenarios
 */
export async function resetDemoWallet(userId: string): Promise<void> {
  const demoWalletRef = db.collection(DEMO_WALLET_COLLECTION).doc(userId);
  
  await demoWalletRef.set({
    userId,
    tokensBalance: DEMO_INITIAL_BALANCE,
    lifetimePurchasedTokens: 0,
    lifetimeSpentTokens: 0,
    lifetimeEarnedTokens: DEMO_INITIAL_BALANCE,
    lastUpdated: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // Delete all demo transactions
  const transactions = await db
    .collection(DEMO_TRANSACTIONS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const batch = db.batch();
  transactions.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Create fresh initial transaction
  const txId = generateId();
  await db.collection(DEMO_TRANSACTIONS_COLLECTION).doc(txId).set({
    txId,
    userId,
    type: 'EARN',
    source: 'BONUS',
    amountTokens: DEMO_INITIAL_BALANCE,
    beforeBalance: 0,
    afterBalance: DEMO_INITIAL_BALANCE,
    metadata: {
      notes: 'Demo wallet reset',
      isDemoMode: true,
    },
    timestamp: serverTimestamp(),
  });

  console.log(`Demo wallet reset for user ${userId}`);
}

/**
 * Enable demo mode for a user
 * Admin function to set a user into demo mode
 */
export async function enableDemoModeForUser(
  userId: string,
  enabledBy: string
): Promise<void> {
  await db.collection('users').doc(userId).update({
    demoMode: true,
    demoModeEnabledAt: serverTimestamp(),
    demoModeEnabledBy: enabledBy,
  });

  // Initialize demo wallet
  await initializeDemoWallet(userId);

  console.log(`Demo mode enabled for user ${userId} by ${enabledBy}`);
}

/**
 * Disable demo mode for a user
 */
export async function disableDemoModeForUser(userId: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    demoMode: false,
    demoModeDisabledAt: serverTimestamp(),
  });

  console.log(`Demo mode disabled for user ${userId}`);
}

/**
 * Get demo wallet statistics
 * Useful for monitoring demo mode usage
 */
export async function getDemoWalletStats(): Promise<{
  totalDemoUsers: number;
  totalDemoBalance: number;
  averageBalance: number;
}> {
  const demoWallets = await db.collection(DEMO_WALLET_COLLECTION).get();
  
  let totalBalance = 0;
  demoWallets.docs.forEach((doc) => {
    const wallet = doc.data() as WalletData;
    totalBalance += wallet.tokensBalance;
  });

  return {
    totalDemoUsers: demoWallets.size,
    totalDemoBalance: totalBalance,
    averageBalance: demoWallets.size > 0 ? totalBalance / demoWallets.size : 0,
  };
}

/**
 * Clean up old demo wallets (older than 30 days of inactivity)
 */
export async function cleanupInactiveDemoWallets(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oldWallets = await db
    .collection(DEMO_WALLET_COLLECTION)
    .where('lastUpdated', '<', thirtyDaysAgo)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const walletDoc of oldWallets.docs) {
    // Delete wallet
    batch.delete(walletDoc.ref);

    // Delete transactions (in batches if needed)
    const transactions = await db
      .collection(DEMO_TRANSACTIONS_COLLECTION)
      .where('userId', '==', walletDoc.id)
      .get();

    transactions.docs.forEach((txDoc) => {
      batch.delete(txDoc.ref);
    });

    count++;
  }

  await batch.commit();
  console.log(`Cleaned up ${count} inactive demo wallets`);
  
  return count;
}

/**
 * Wrapper for wallet operations that automatically handles demo mode
 * Use this in your existing wallet service to support both real and demo wallets
 */
export async function executeWalletOperation<T>(
  userId: string,
  operation: (walletCollection: string, transactionsCollection: string) => Promise<T>
): Promise<T> {
  const isDemoMode = await isUserInDemoMode(userId);
  
  if (isDemoMode) {
    // Ensure demo wallet exists
    await initializeDemoWallet(userId);
  }

  const walletCollection = getWalletCollection(isDemoMode);
  const transactionsCollection = getTransactionsCollection(isDemoMode);

  return operation(walletCollection, transactionsCollection);
}