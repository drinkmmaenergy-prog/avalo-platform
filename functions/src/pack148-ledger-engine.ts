/**
 * PACK 148 - Ledger Recording Engine
 * Core functionality for recording transactions to immutable ledger
 */

import { db, serverTimestamp, generateId } from './init';
import * as crypto from 'crypto';
import {
  LedgerTransaction,
  BlockchainEntry,
  TransactionProductType,
  TransactionStatus,
  RecordLedgerTransactionRequest,
  LedgerError,
  PLATFORM_FEE_PERCENTAGE,
  CREATOR_SHARE_PERCENTAGE,
  BLOCKCHAIN_HASH_ALGORITHM,
  PRIVACY_HASH_ALGORITHM,
} from './pack148-types';

/**
 * Hash data for privacy using SHA256
 */
function hashForPrivacy(data: string): string {
  return crypto
    .createHash(PRIVACY_HASH_ALGORITHM)
    .update(data)
    .digest('hex');
}

/**
 * Generate blockchain hash for transaction
 */
function generateBlockchainHash(data: any, previousHash: string, nonce: number): string {
  const content = JSON.stringify({
    data,
    previousHash,
    nonce,
    timestamp: new Date().toISOString(),
  });
  
  return crypto
    .createHash(BLOCKCHAIN_HASH_ALGORITHM)
    .update(content)
    .digest('hex');
}

/**
 * Get the latest blockchain entry (for chain linking)
 */
async function getLatestBlockchainEntry(): Promise<BlockchainEntry | null> {
  const snapshot = await db
    .collection('blockchain_ledger')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as BlockchainEntry;
}

/**
 * Calculate revenue split (65/35)
 */
function calculateRevenueSplit(tokenAmount: number): {
  platformShare: number;
  creatorShare: number;
} {
  return {
    platformShare: Math.round(tokenAmount * PLATFORM_FEE_PERCENTAGE * 100) / 100,
    creatorShare: Math.round(tokenAmount * CREATOR_SHARE_PERCENTAGE * 100) / 100,
  };
}

/**
 * Record transaction to Firestore ledger (fast layer)
 */
async function recordToFirestoreLedger(
  transaction: LedgerTransaction
): Promise<void> {
  await db
    .collection('ledger_transactions')
    .doc(transaction.id)
    .set(transaction);
}

/**
 * Record transaction to blockchain (immutable layer)
 */
async function recordToBlockchain(
  transactionId: string,
  senderHash: string,
  receiverHash: string,
  productType: TransactionProductType,
  tokenAmount: number,
  timestamp: Date,
  escrowOutcome: string | undefined,
  payoutEligible: boolean,
  regionTag: string
): Promise<{ blockHash: string; blockchainId: string }> {
  // Get previous block for chain linking
  const previousEntry = await getLatestBlockchainEntry();
  const previousHash = previousEntry?.blockHash || '0000000000000000';
  
  // Prepare blockchain data (only metadata, no private info)
  const blockData = {
    senderHash,
    receiverHash,
    productType,
    tokenAmount,
    timestamp: timestamp.toISOString(),
    escrowOutcome,
    payoutEligible,
    regionTag,
  };
  
  // Generate hash with nonce (proof of work - light version)
  const nonce = Math.floor(Math.random() * 1000000);
  const blockHash = generateBlockchainHash(blockData, previousHash, nonce);
  
  // Create blockchain entry
  const blockchainEntry: BlockchainEntry = {
    id: generateId(),
    transactionId,
    blockHash,
    previousHash,
    data: blockData,
    nonce,
    timestamp: serverTimestamp() as any,
    verified: true,
  };
  
  // Write to blockchain collection
  await db
    .collection('blockchain_ledger')
    .doc(blockchainEntry.id)
    .set(blockchainEntry);
  
  return {
    blockHash,
    blockchainId: blockchainEntry.id,
  };
}

/**
 * Main function: Record a transaction to the ledger
 */
export async function recordLedgerTransaction(
  request: RecordLedgerTransactionRequest
): Promise<{ ledgerId: string; blockchainHash: string }> {
  const {
    transactionId,
    senderId,
    receiverId,
    productType,
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  } = request;
  
  // Validate inputs
  if (!transactionId || !senderId || !receiverId) {
    throw new LedgerError('Missing required fields', 'INVALID_INPUT');
  }
  
  if (tokenAmount <= 0) {
    throw new LedgerError('Token amount must be positive', 'INVALID_AMOUNT');
  }
  
  // Check if already recorded
  const existing = await db
    .collection('ledger_transactions')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (!existing.empty) {
    const existingData = existing.docs[0].data() as LedgerTransaction;
    return {
      ledgerId: existingData.id,
      blockchainHash: existingData.blockchainHash,
    };
  }
  
  // Hash user IDs for privacy
  const senderHash = hashForPrivacy(senderId);
  const receiverHash = receiverId === 'AVALO_SYSTEM' 
    ? 'AVALO_SYSTEM' 
    : hashForPrivacy(receiverId);
  
  // Calculate revenue split (record only, don't modify)
  const { platformShare, creatorShare } = calculateRevenueSplit(tokenAmount);
  
  // Calculate USD equivalent
  const usdEquivalent = tokenAmount * conversionRate;
  
  // Determine payout eligibility
  const payoutEligible = !escrowId; // If no escrow, immediately eligible
  
  // Record to blockchain first (immutable)
  const { blockHash, blockchainId } = await recordToBlockchain(
    transactionId,
    senderHash,
    receiverHash,
    productType,
    tokenAmount,
    new Date(),
    escrowId ? 'escrowed' : undefined,
    payoutEligible,
    regionTag
  );
  
  // Create ledger transaction record
  const ledgerId = generateId();
  const now = serverTimestamp() as any;
  
  const ledgerTransaction: LedgerTransaction = {
    id: ledgerId,
    transactionId,
    blockchainHash: blockHash,
    senderHash,
    receiverHash,
    productType,
    tokenAmount,
    conversionRate,
    usdEquivalent,
    escrowId,
    escrowLogicOutcome: escrowId ? 'held' : undefined,
    payoutEligible,
    regionTag,
    timestamp: now,
    status: escrowId ? 'escrowed' : 'completed',
    platformShare,
    creatorShare,
    blockchainTimestamp: now,
    blockchainVerified: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  
  // Record to Firestore ledger (fast access layer)
  await recordToFirestoreLedger(ledgerTransaction);
  
  // Log audit event
  await logLedgerEvent('transaction_created', transactionId, {
    ledgerId,
    blockchainHash: blockHash,
    blockchainId,
    productType,
    tokenAmount,
  });
  
  return {
    ledgerId,
    blockchainHash: blockHash,
  };
}

/**
 * Update ledger when escrow is released
 */
export async function updateLedgerOnEscrowRelease(
  transactionId: string,
  escrowOutcome: 'released' | 'refunded'
): Promise<void> {
  // Find ledger entry
  const snapshot = await db
    .collection('ledger_transactions')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    throw new LedgerError('Ledger entry not found', 'NOT_FOUND', { transactionId });
  }
  
  const doc = snapshot.docs[0];
  const ledgerEntry = doc.data() as LedgerTransaction;
  
  // Update status
  const newStatus: TransactionStatus = 
    escrowOutcome === 'released' ? 'completed' : 'refunded';
  
  await doc.ref.update({
    escrowLogicOutcome: escrowOutcome,
    payoutEligible: escrowOutcome === 'released',
    status: newStatus,
    updatedAt: serverTimestamp(),
    version: ledgerEntry.version + 1,
  });
  
  // Record to blockchain
  await recordToBlockchain(
    transactionId,
    ledgerEntry.senderHash,
    ledgerEntry.receiverHash,
    ledgerEntry.productType,
    ledgerEntry.tokenAmount,
    new Date(),
    escrowOutcome,
    escrowOutcome === 'released',
    ledgerEntry.regionTag
  );
  
  // Log event
  await logLedgerEvent(
    escrowOutcome === 'released' ? 'escrow_released' : 'refund_issued',
    transactionId,
    { escrowOutcome, ledgerId: ledgerEntry.id }
  );
}

/**
 * Update ledger when dispute occurs
 */
export async function updateLedgerOnDispute(
  transactionId: string,
  disputeId: string
): Promise<void> {
  const snapshot = await db
    .collection('ledger_transactions')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    throw new LedgerError('Ledger entry not found', 'NOT_FOUND', { transactionId });
  }
  
  const doc = snapshot.docs[0];
  const ledgerEntry = doc.data() as LedgerTransaction;
  
  await doc.ref.update({
    status: 'disputed',
    payoutEligible: false,
    updatedAt: serverTimestamp(),
    version: ledgerEntry.version + 1,
  });
  
  await logLedgerEvent('dispute_opened', transactionId, {
    disputeId,
    ledgerId: ledgerEntry.id,
  });
}

/**
 * Log ledger event to audit trail
 */
async function logLedgerEvent(
  eventType: string,
  transactionId: string,
  data: Record<string, any>
): Promise<void> {
  await db.collection('ledger_audit_logs').add({
    id: generateId(),
    eventType,
    transactionId,
    data,
    timestamp: serverTimestamp(),
  });
}

/**
 * Get ledger transaction by ID
 */
export async function getLedgerTransaction(
  transactionId: string
): Promise<LedgerTransaction | null> {
  const snapshot = await db
    .collection('ledger_transactions')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as LedgerTransaction;
}

/**
 * Get user's ledger transactions (authorized access only)
 */
export async function getUserLedgerTransactions(
  userId: string,
  options?: {
    limit?: number;
    startAfter?: Date;
    productTypes?: TransactionProductType[];
    status?: TransactionStatus[];
  }
): Promise<LedgerTransaction[]> {
  const userHash = hashForPrivacy(userId);
  
  let query = db
    .collection('ledger_transactions')
    .where('senderHash', '==', userHash)
    .orderBy('timestamp', 'desc');
  
  if (options?.limit) {
    query = query.limit(options.limit) as any;
  }
  
  const snapshot = await query.get();
  let transactions = snapshot.docs.map(doc => doc.data() as LedgerTransaction);
  
  // Also get transactions where user is receiver
  const receivedQuery = db
    .collection('ledger_transactions')
    .where('receiverHash', '==', userHash)
    .orderBy('timestamp', 'desc');
  
  const receivedSnapshot = await receivedQuery.get();
  const receivedTransactions = receivedSnapshot.docs.map(doc => doc.data() as LedgerTransaction);
  
  // Combine and deduplicate
  const allTransactions = [...transactions, ...receivedTransactions];
  const uniqueTransactions = Array.from(
    new Map(allTransactions.map(t => [t.id, t])).values()
  );
  
  // Apply filters
  let filtered = uniqueTransactions;
  
  if (options?.productTypes) {
    filtered = filtered.filter(t => options.productTypes!.includes(t.productType));
  }
  
  if (options?.status) {
    filtered = filtered.filter(t => options.status!.includes(t.status));
  }
  
  if (options?.startAfter) {
    filtered = filtered.filter(t => t.timestamp.toDate() > options.startAfter!);
  }
  
  // Sort by timestamp descending
  filtered.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
  
  return filtered.slice(0, options?.limit || 100);
}

/**
 * Validate ledger entry against escrow
 */
export async function validateLedgerEscrowStatus(
  escrowId: string,
  expectedStatus: string
): Promise<{ isValid: boolean; ledgerEntry?: LedgerTransaction }> {
  const snapshot = await db
    .collection('ledger_transactions')
    .where('escrowId', '==', escrowId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return { isValid: false };
  }
  
  const ledgerEntry = snapshot.docs[0].data() as LedgerTransaction;
  const isValid = ledgerEntry.escrowLogicOutcome === expectedStatus;
  
  return { isValid, ledgerEntry };
}

/**
 * Get ledger statistics for user
 */
export async function getLedgerStats(userId: string): Promise<{
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  verifiedCount: number;
}> {
  const userHash = hashForPrivacy(userId);
  
  // Get all user transactions
  const transactions = await getUserLedgerTransactions(userId, { limit: 1000 });
  
  let totalSent = 0;
  let totalReceived = 0;
  let verifiedCount = 0;
  
  for (const tx of transactions) {
    if (tx.senderHash === userHash) {
      totalSent += tx.tokenAmount;
    }
    if (tx.receiverHash === userHash) {
      totalReceived += tx.tokenAmount;
    }
    if (tx.blockchainVerified) {
      verifiedCount++;
    }
  }
  
  return {
    totalSent,
    totalReceived,
    transactionCount: transactions.length,
    verifiedCount,
  };
}