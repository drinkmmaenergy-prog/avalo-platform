import { Timestamp } from 'firebase-admin/firestore';
import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

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
import { functions, timestamp } from './runtime';

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
  earnerId?: string
): Promise<string> {
  const ledgerId = generateId();
  
  const entry: TreasuryLedgerEntry = {
    ledgerId,
    eventType,
    userId,
    earnerId,
    tokenAmount,
    vault,
    timestamp: serverTimestamp() as unknown as Timestamp,
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
  earnerTotal: number;
  platformTotal: number;
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

  // Sum all earner vaults
  const earnerVaults = await db.collection('earner_vaults').get();
  const earnerTotal = earnerVaults.docs.reduce(
    (sum, doc) => sum + (doc.data().availableTokens || 0) + (doc.data().lockedTokens || 0),
    0
  );

  // Get Avalo revenue
  const platformVault = await db.collection('platform_revenue_vault').doc('platform').get();
  const platformTotal = platformVault.exists ? (platformVault.data()?.availableRevenue || 0) : 0;

  const grandTotal = userTotal + earnerTotal + platformTotal;

  // Check for negative balances
  userWallets.docs.forEach(doc => {
    if (doc.data().availableTokens < 0) {
      issues.push(`Negative user balance: ${doc.id}`);
    }
  });

  earnerVaults.docs.forEach(doc => {
    if (doc.data().availableTokens < 0 || doc.data().lockedTokens < 0) {
      issues.push(`Negative earner balance: ${doc.id}`);
    }
  });

  return {
    valid: issues.length === 0,
    userTotal,
    earnerTotal,
    platformTotal,
    grandTotal,
    issues,
  };
}

























