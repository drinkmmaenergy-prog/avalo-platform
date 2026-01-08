/**
 * PACK 128 - Treasury Helper Functions
 * Shared utilities for treasury operations
 */

import { logger } from 'firebase-functions/v2';
import { db, generateId, serverTimestamp } from './init';
import {
  TreasuryLedgerEntry,
  VaultType,
  LedgerEventType,
} from './types/treasury.types';

/**
 * Create immutable ledger entry
 * Used across all treasury operations for audit trail
 */
export async function createLedgerEntry(
  eventType: LedgerEventType,
  userId: string,
  tokenAmount: number,
  vault: VaultType,
  metadata: Record<string, any> = {},
  creatorId?: string
): Promise<string> {
  const ledgerId = generateId();
  
  const entry: TreasuryLedgerEntry = {
    ledgerId,
    eventType,
    userId,
    creatorId,
    tokenAmount,
    vault,
    timestamp: serverTimestamp() as any,
    metadata,
  };

  await db.collection('treasury_ledger').doc(ledgerId).set(entry);
  
  logger.info('Ledger entry created', {
    ledgerId,
    eventType,
    userId,
    vault,
    tokenAmount,
  });

  return ledgerId;
}

/**
 * Get recent ledger entries for a user
 */
export async function getUserLedgerEntries(
  userId: string,
  limit: number = 50
): Promise<TreasuryLedgerEntry[]> {
  const snapshot = await db
    .collection('treasury_ledger')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as TreasuryLedgerEntry);
}

/**
 * Get ledger entries by transaction ID
 */
export async function getTransactionLedgerEntries(
  transactionId: string
): Promise<TreasuryLedgerEntry[]> {
  const snapshot = await db
    .collection('treasury_ledger')
    .where('metadata.transactionId', '==', transactionId)
    .get();

  return snapshot.docs.map(doc => doc.data() as TreasuryLedgerEntry);
}

/**
 * Verify treasury integrity (sum of all vaults)
 */
export async function verifyTreasuryIntegrity(): Promise<{
  valid: boolean;
  userTotal: number;
  creatorTotal: number;
  avaloTotal: number;
  grandTotal: number;
  issues: string[];
}> {
  const issues: string[] = [];

  // Sum all user wallets
  const userWallets = await db.collection('user_token_wallets').get();
  const userTotal = userWallets.docs.reduce(
    (sum, doc) => sum + (doc.data().availableTokens || 0),
    0
  );

  // Sum all creator vaults
  const creatorVaults = await db.collection('creator_vaults').get();
  const creatorTotal = creatorVaults.docs.reduce(
    (sum, doc) => sum + (doc.data().availableTokens || 0) + (doc.data().lockedTokens || 0),
    0
  );

  // Get Avalo revenue
  const avaloVault = await db.collection('avalo_revenue_vault').doc('platform').get();
  const avaloTotal = avaloVault.exists ? (avaloVault.data()?.availableRevenue || 0) : 0;

  const grandTotal = userTotal + creatorTotal + avaloTotal;

  // Check for negative balances
  userWallets.docs.forEach(doc => {
    if (doc.data().availableTokens < 0) {
      issues.push(`Negative user balance: ${doc.id}`);
    }
  });

  creatorVaults.docs.forEach(doc => {
    if (doc.data().availableTokens < 0 || doc.data().lockedTokens < 0) {
      issues.push(`Negative creator balance: ${doc.id}`);
    }
  });

  return {
    valid: issues.length === 0,
    userTotal,
    creatorTotal,
    avaloTotal,
    grandTotal,
    issues,
  };
}