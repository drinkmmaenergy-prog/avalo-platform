/**
 * LEDGER SERVICE — Immutable Financial Ledger
 *
 * Every wallet balance mutation writes a ledger entry at: ledger/{txId}
 *
 * The ledger is append-only. Entries are NEVER updated or deleted.
 * Ledger replay MUST reconstruct wallet balances exactly.
 *
 * This module provides read/query operations on the ledger.
 * Write operations happen inside WalletService transactions.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  LedgerEntry,
  LedgerEntryType,
  LEDGER_COLLECTION,
  WALLETS_COLLECTION,
  PLATFORM_WALLET_ID,
  WalletDocument,
} from './types';

// ============================================================================
// FIRESTORE REFERENCE
// ============================================================================

const db = getFirestore();

// ============================================================================
// LEDGER QUERIES
// ============================================================================

/**
 * Get a single ledger entry by txId.
 */
export async function getLedgerEntry(txId: string): Promise<LedgerEntry | null> {
  const snap = await db.collection(LEDGER_COLLECTION).doc(txId).get();
  if (!snap.exists) return null;
  return snap.data() as LedgerEntry;
}

/**
 * Get all ledger entries for a given actor (payer / spender).
 */
export async function getLedgerEntriesByActor(
  actorId: string,
  options?: {
    type?: LedgerEntryType;
    limit?: number;
    afterTimestamp?: Timestamp;
  },
): Promise<LedgerEntry[]> {
  let query: FirebaseFirestore.Query = db
    .collection(LEDGER_COLLECTION)
    .where('actorId', '==', actorId)
    .orderBy('timestamp', 'asc');

  if (options?.type) {
    query = query.where('type', '==', options.type);
  }
  if (options?.afterTimestamp) {
    query = query.where('timestamp', '>', options.afterTimestamp);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as LedgerEntry);
}

/**
 * Get all ledger entries where a given user is the counterparty (earner / receiver).
 */
export async function getLedgerEntriesByCounterparty(
  counterpartyId: string,
  options?: {
    type?: LedgerEntryType;
    limit?: number;
  },
): Promise<LedgerEntry[]> {
  let query: FirebaseFirestore.Query = db
    .collection(LEDGER_COLLECTION)
    .where('counterpartyId', '==', counterpartyId)
    .orderBy('timestamp', 'asc');

  if (options?.type) {
    query = query.where('type', '==', options.type);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as LedgerEntry);
}

/**
 * Get all ledger entries (for full replay).
 * WARNING: This can be expensive. Use only for testing / reconciliation.
 */
export async function getAllLedgerEntries(): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(LEDGER_COLLECTION)
    .orderBy('timestamp', 'asc')
    .get();

  return snap.docs.map((doc) => doc.data() as LedgerEntry);
}

// ============================================================================
// LEDGER REPLAY — RECONSTRUCT BALANCES
// ============================================================================

/**
 * Replay the entire ledger and reconstruct all wallet balances.
 *
 * Returns a map of userId → reconstructed balance.
 * Includes AVALO_PLATFORM.
 *
 * This is the authoritative verification that wallet balances are correct.
 * If replay balance ≠ wallet balance, there is float drift.
 */
export async function replayLedger(): Promise<Map<string, number>> {
  const entries = await getAllLedgerEntries();
  const balances = new Map<string, number>();

  for (const entry of entries) {
    // ── Actor (debit side) ──
    if (
      entry.type === 'PURCHASE' ||
      entry.type === 'CHAT_REFUND' ||
      entry.type === 'CALENDAR_REFUND' ||
      entry.type === 'CALL_ESCROW_RELEASE'
    ) {
      // Credit operations: actor gains tokens
      const current = balances.get(entry.actorId) ?? 0;
      balances.set(entry.actorId, current + entry.amountTokens);
    } else if (entry.type === 'PAYOUT') {
      // Payout: actor loses tokens (conversion to fiat)
      const current = balances.get(entry.actorId) ?? 0;
      balances.set(entry.actorId, current - entry.amountTokens);
    } else {
      // Standard debit: actor loses tokens
      const current = balances.get(entry.actorId) ?? 0;
      balances.set(entry.actorId, current - entry.amountTokens);

      // ── Counterparty (credit side) ──
      if (entry.counterpartyId && entry.split.creatorTokens > 0) {
        const cpCurrent = balances.get(entry.counterpartyId) ?? 0;
        balances.set(entry.counterpartyId, cpCurrent + entry.split.creatorTokens);
      }

      // ── Platform ──
      if (entry.split.avaloTokens > 0) {
        const platCurrent = balances.get(PLATFORM_WALLET_ID) ?? 0;
        balances.set(PLATFORM_WALLET_ID, platCurrent + entry.split.avaloTokens);
      }
    }
  }

  return balances;
}

/**
 * Verify that all wallet balances match the ledger replay.
 *
 * Returns a list of discrepancies. Empty list means perfect match.
 */
export async function verifyLedgerConsistency(): Promise<
  Array<{
    userId: string;
    walletBalance: number;
    ledgerBalance: number;
    discrepancy: number;
  }>
> {
  const replayedBalances = await replayLedger();
  const discrepancies: Array<{
    userId: string;
    walletBalance: number;
    ledgerBalance: number;
    discrepancy: number;
  }> = [];

  // Check each user that appears in the ledger
  for (const [userId, ledgerBalance] of replayedBalances.entries()) {
    const walletSnap = await db.collection(WALLETS_COLLECTION).doc(userId).get();
    const walletBalance = walletSnap.exists
      ? (walletSnap.data() as WalletDocument).balance
      : 0;

    if (walletBalance !== ledgerBalance) {
      discrepancies.push({
        userId,
        walletBalance,
        ledgerBalance,
        discrepancy: walletBalance - ledgerBalance,
      });
    }
  }

  return discrepancies;
}

// ============================================================================
// PLATFORM WALLET VERIFICATION
// ============================================================================

/**
 * Verify that the platform wallet balance equals the sum of all Avalo shares
 * across ALL ledger entries.
 *
 * Returns { matched, platformBalance, ledgerSum, discrepancy }
 */
export async function verifyPlatformWalletSum(): Promise<{
  matched: boolean;
  platformBalance: number;
  ledgerSum: number;
  discrepancy: number;
}> {
  // Get current platform wallet balance
  const platformSnap = await db
    .collection(WALLETS_COLLECTION)
    .doc(PLATFORM_WALLET_ID)
    .get();

  const platformBalance = platformSnap.exists
    ? (platformSnap.data() as WalletDocument).balance
    : 0;

  // Sum all avaloTokens from ledger entries
  const entries = await getAllLedgerEntries();
  let ledgerSum = 0;

  for (const entry of entries) {
    ledgerSum += entry.split.avaloTokens;
  }

  const discrepancy = platformBalance - ledgerSum;

  return {
    matched: discrepancy === 0,
    platformBalance,
    ledgerSum,
    discrepancy,
  };
}

// ============================================================================
// LEDGER ENTRY COUNT BY TYPE
// ============================================================================

/**
 * Get count of ledger entries by type for a user (as actor).
 */
export async function countLedgerEntriesByType(
  actorId: string,
): Promise<Record<LedgerEntryType, number>> {
  const entries = await getLedgerEntriesByActor(actorId);

  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.type] = (counts[entry.type] || 0) + 1;
  }

  return counts as Record<LedgerEntryType, number>;
}









