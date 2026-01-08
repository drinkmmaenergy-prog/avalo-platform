/**
 * PACK 148 - Blockchain Verification Engine
 * Verification and validation of blockchain entries
 */

import { db } from './init';
import * as crypto from 'crypto';
import {
  BlockchainEntry,
  BlockchainVerification,
  LedgerTransaction,
  BlockchainVerificationError,
  BLOCKCHAIN_HASH_ALGORITHM,
} from './pack148-types';

/**
 * Verify blockchain hash matches content
 */
function verifyBlockHash(entry: BlockchainEntry): boolean {
  const content = JSON.stringify({
    data: entry.data,
    previousHash: entry.previousHash,
    nonce: entry.nonce,
    timestamp: entry.timestamp instanceof Date 
      ? entry.timestamp.toISOString()
      : new Date(entry.timestamp.toMillis()).toISOString(),
  });
  
  const computedHash = crypto
    .createHash(BLOCKCHAIN_HASH_ALGORITHM)
    .update(content)
    .digest('hex');
  
  return computedHash === entry.blockHash;
}

/**
 * Verify blockchain chain integrity (each block references previous)
 */
export async function verifyBlockchainIntegrity(
  startFromId?: string
): Promise<{
  isValid: boolean;
  checkedBlocks: number;
  invalidBlocks: string[];
  brokenChainAt?: string;
}> {
  let query = db
    .collection('blockchain_ledger')
    .orderBy('timestamp', 'asc');
  
  if (startFromId) {
    const startDoc = await db.collection('blockchain_ledger').doc(startFromId).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc) as any;
    }
  }
  
  const snapshot = await query.limit(1000).get();
  
  if (snapshot.empty) {
    return {
      isValid: true,
      checkedBlocks: 0,
      invalidBlocks: [],
    };
  }
  
  const blocks = snapshot.docs.map(doc => doc.data() as BlockchainEntry);
  const invalidBlocks: string[] = [];
  let previousHash = blocks[0].previousHash;
  let brokenChainAt: string | undefined;
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    
    // Verify hash matches content
    if (!verifyBlockHash(block)) {
      invalidBlocks.push(block.id);
    }
    
    // Verify chain linkage (except first block)
    if (i > 0 && block.previousHash !== previousHash) {
      brokenChainAt = block.id;
      break;
    }
    
    previousHash = block.blockHash;
  }
  
  return {
    isValid: invalidBlocks.length === 0 && !brokenChainAt,
    checkedBlocks: blocks.length,
    invalidBlocks,
    brokenChainAt,
  };
}

/**
 * Verify a specific transaction's blockchain entry
 */
export async function verifyTransactionBlockchain(
  transactionId: string
): Promise<BlockchainVerification> {
  // Get ledger transaction
  const ledgerSnapshot = await db
    .collection('ledger_transactions')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (ledgerSnapshot.empty) {
    throw new BlockchainVerificationError(
      'Transaction not found in ledger',
      transactionId,
      '',
      ''
    );
  }
  
  const ledgerEntry = ledgerSnapshot.docs[0].data() as LedgerTransaction;
  
  // Get blockchain entry
  const blockchainSnapshot = await db
    .collection('blockchain_ledger')
    .where('transactionId', '==', transactionId)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (blockchainSnapshot.empty) {
    return {
      transactionId,
      blockchainHash: ledgerEntry.blockchainHash,
      isValid: false,
      verifiedAt: new Date() as any,
      verificationMethod: 'hash_match',
      details: 'No blockchain entry found',
    };
  }
  
  const blockchainEntry = blockchainSnapshot.docs[0].data() as BlockchainEntry;
  
  // Verify hash matches
  const hashMatches = blockchainEntry.blockHash === ledgerEntry.blockchainHash;
  
  // Verify block integrity
  const blockValid = verifyBlockHash(blockchainEntry);
  
  // Verify data consistency
  const dataMatches =
    blockchainEntry.data.senderHash === ledgerEntry.senderHash &&
    blockchainEntry.data.receiverHash === ledgerEntry.receiverHash &&
    blockchainEntry.data.tokenAmount === ledgerEntry.tokenAmount &&
    blockchainEntry.data.productType === ledgerEntry.productType;
  
  const isValid = hashMatches && blockValid && dataMatches;
  
  return {
    transactionId,
    blockchainHash: blockchainEntry.blockHash,
    isValid,
    verifiedAt: new Date() as any,
    verificationMethod: 'chain_integrity',
    details: isValid
      ? 'Transaction verified on blockchain'
      : `Verification failed: hashMatch=${hashMatches}, blockValid=${blockValid}, dataMatch=${dataMatches}`,
  };
}

/**
 * Verify blockchain hash manually
 */
export async function verifyBlockchainHash(
  transactionId: string,
  providedHash: string
): Promise<BlockchainVerification> {
  const verification = await verifyTransactionBlockchain(transactionId);
  
  if (verification.blockchainHash !== providedHash) {
    return {
      transactionId,
      blockchainHash: providedHash,
      isValid: false,
      verifiedAt: new Date() as any,
      verificationMethod: 'hash_match',
      details: `Hash mismatch. Expected: ${verification.blockchainHash}, Provided: ${providedHash}`,
    };
  }
  
  return verification;
}

/**
 * Get blockchain proof for transaction
 */
export async function getBlockchainProof(
  transactionId: string
): Promise<{
  transactionId: string;
  blockchainHash: string;
  blockchainTimestamp: Date;
  verified: boolean;
  chainPosition: number;
  previousHash: string;
  nextHash?: string;
}> {
  const snapshot = await db
    .collection('blockchain_ledger')
    .where('transactionId', '==', transactionId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    throw new Error(`No blockchain entry found for transaction ${transactionId}`);
  }
  
  const entry = snapshot.docs[0].data() as BlockchainEntry;
  
  // Get chain position
  const beforeCount = await db
    .collection('blockchain_ledger')
    .where('timestamp', '<', entry.timestamp)
    .count()
    .get();
  
  // Get next block
  const nextBlock = await db
    .collection('blockchain_ledger')
    .where('previousHash', '==', entry.blockHash)
    .limit(1)
    .get();
  
  return {
    transactionId: entry.transactionId,
    blockchainHash: entry.blockHash,
    blockchainTimestamp: entry.timestamp.toDate(),
    verified: entry.verified,
    chainPosition: beforeCount.data().count + 1,
    previousHash: entry.previousHash,
    nextHash: nextBlock.empty ? undefined : nextBlock.docs[0].data().blockHash,
  };
}

/**
 * Batch verify multiple transactions
 */
export async function batchVerifyTransactions(
  transactionIds: string[]
): Promise<Map<string, BlockchainVerification>> {
  const verifications = new Map<string, BlockchainVerification>();
  
  for (const transactionId of transactionIds) {
    try {
      const verification = await verifyTransactionBlockchain(transactionId);
      verifications.set(transactionId, verification);
    } catch (error) {
      verifications.set(transactionId, {
        transactionId,
        blockchainHash: '',
        isValid: false,
        verifiedAt: new Date() as any,
        verificationMethod: 'hash_match',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return verifications;
}

/**
 * Scheduled: Daily blockchain integrity check
 */
export async function scheduledBlockchainIntegrityCheck(): Promise<void> {
  console.log('Starting daily blockchain integrity check...');
  
  const result = await verifyBlockchainIntegrity();
  
  // Log results
  await db.collection('blockchain_integrity_logs').add({
    timestamp: new Date(),
    isValid: result.isValid,
    checkedBlocks: result.checkedBlocks,
    invalidBlocks: result.invalidBlocks,
    brokenChainAt: result.brokenChainAt,
  });
  
  // Alert if issues found
  if (!result.isValid) {
    console.error('⚠️ BLOCKCHAIN INTEGRITY ISSUE DETECTED', result);
    
    // Log critical alert
    await db.collection('system_alerts').add({
      type: 'BLOCKCHAIN_INTEGRITY_FAILURE',
      severity: 'CRITICAL',
      details: result,
      timestamp: new Date(),
      resolved: false,
    });
  } else {
    console.log(`✅ Blockchain integrity verified: ${result.checkedBlocks} blocks checked`);
  }
}

/**
 * Re-verify and mark all transactions
 */
export async function reVerifyAllTransactions(
  batchSize: number = 100
): Promise<{
  total: number;
  verified: number;
  failed: number;
}> {
  let lastDoc: any = null;
  let total = 0;
  let verified = 0;
  let failed = 0;
  
  while (true) {
    let query = db
      .collection('ledger_transactions')
      .orderBy('createdAt', 'asc')
      .limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc) as any;
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      break;
    }
    
    for (const doc of snapshot.docs) {
      const transaction = doc.data() as LedgerTransaction;
      
      try {
        const verification = await verifyTransactionBlockchain(transaction.transactionId);
        
        if (verification.isValid) {
          verified++;
          await doc.ref.update({
            blockchainVerified: true,
            updatedAt: new Date(),
          });
        } else {
          failed++;
          await doc.ref.update({
            blockchainVerified: false,
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        failed++;
        console.error(`Failed to verify transaction ${transaction.transactionId}:`, error);
      }
      
      total++;
    }
    
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    console.log(`Progress: ${total} transactions processed (${verified} verified, ${failed} failed)`);
  }
  
  return { total, verified, failed };
}

/**
 * Get verification statistics
 */
export async function getVerificationStats(): Promise<{
  totalTransactions: number;
  verifiedTransactions: number;
  unverifiedTransactions: number;
  verificationRate: number;
  lastIntegrityCheck?: Date;
  integrityCheckPassed?: boolean;
}> {
  // Get total count
  const totalSnapshot = await db
    .collection('ledger_transactions')
    .count()
    .get();
  
  const total = totalSnapshot.data().count;
  
  // Get verified count
  const verifiedSnapshot = await db
    .collection('ledger_transactions')
    .where('blockchainVerified', '==', true)
    .count()
    .get();
  
  const verified = verifiedSnapshot.data().count;
  
  // Get last integrity check
  const lastCheckSnapshot = await db
    .collection('blockchain_integrity_logs')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  let lastIntegrityCheck: Date | undefined;
  let integrityCheckPassed: boolean | undefined;
  
  if (!lastCheckSnapshot.empty) {
    const lastCheck = lastCheckSnapshot.docs[0].data();
    lastIntegrityCheck = lastCheck.timestamp.toDate();
    integrityCheckPassed = lastCheck.isValid;
  }
  
  return {
    totalTransactions: total,
    verifiedTransactions: verified,
    unverifiedTransactions: total - verified,
    verificationRate: total > 0 ? (verified / total) * 100 : 0,
    lastIntegrityCheck,
    integrityCheckPassed,
  };
}