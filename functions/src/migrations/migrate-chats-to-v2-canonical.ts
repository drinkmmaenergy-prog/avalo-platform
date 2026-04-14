import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * MIGRATION SCRIPT: Migrate existing chats to v2_canonical data model
 *
 * This script migrates all existing chat documents from legacy formats to the
 * canonical v2 schema defined in canonical-chat.types.ts.
 *
 * LEGACY SOURCES HANDLED:
 * 1. chats.ts format (ChatStatus.ACTIVE/EXPIRED/CLOSED/QUEUED)
 * 2. chatMonetization.ts format (FREE_A/FREE_B/PAID, FREE_ACTIVE/AWAITING_DEPOSIT/PAID_ACTIVE/CLOSED)
 * 3. pack273ChatEngine format (pack273_chats collection)
 * 4. pack328b format (with status/timeout fields)
 *
 * SAFETY:
 * - Runs in dry-run mode by default
 * - Preserves all original data in _legacyBackup field
 * - Processes in batches of 100
 * - Idempotent: skips already-migrated documents (logicVersion === 'v2_canonical')
 *
 * @module migrate-chats-to-v2-canonical
 * @version 1.0.0
 */

import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  CanonicalChatDocument,
  CanonicalChatState,
  CanonicalFreeState,
  CanonicalPaidSession,
  CanonicalBillingState,
  LegacySourceType,
} from '../types/canonical-chat.types';
import {
  CANONICAL_LOGIC_VERSION,
  FREE_MESSAGES_STANDARD,
  WORDS_PER_TOKEN_STANDARD,
} from '../types/canonical-chat.types';

// ============================================================================
// TYPES
// ============================================================================

interface MigrationResult {
  totalProcessed: number;
  migrated: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ chatId: string; error: string }>;
  dryRun: boolean;
}

interface MigrationOptions {
  /** If true, does not write changes. Default: true */
  dryRun: boolean;
  /** Maximum chats to process per run. Default: 1000 */
  maxBatchSize: number;
  /** Whether to migrate pack273_chats collection. Default: true */
  migratePack273: boolean;
}

const DEFAULT_OPTIONS: MigrationOptions = {
  dryRun: true,
  maxBatchSize: 1000,
  migratePack273: true,
};

// ============================================================================
// STATE MAPPING
// ============================================================================

/**
 * Map legacy chat states to canonical states.
 */
function mapLegacyState(legacyData: any): CanonicalChatState {
  // chatMonetization.ts / pack273 states
  const state = legacyData.state || legacyData.status;

  switch (state) {
    case 'FREE_ACTIVE':
      return 'FREE_ACTIVE';
    case 'AWAITING_DEPOSIT':
    case 'AWAITING_PREPAID':
      return 'AWAITING_DEPOSIT';
    case 'PAID_ACTIVE':
      return 'PAID_ACTIVE';
    case 'CLOSED':
    case 'ENDED':
      return 'CLOSED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
      return 'CLOSED';
    default:
      break;
  }

  // chats.ts ChatStatus enum
  const chatStatus = legacyData.status;
  switch (chatStatus) {
    case 'active':
      // Determine if free or paid based on deposit
      if (legacyData.deposit?.amount > 0) return 'PAID_ACTIVE';
      return 'FREE_ACTIVE';
    case 'expired':
      return 'EXPIRED';
    case 'closed':
      return 'CLOSED';
    case 'queued':
      return 'AWAITING_DEPOSIT';
    default:
      // Default to CLOSED for unknown states
      return 'CLOSED';
  }
}

/**
 * Detect the source type of a legacy chat document.
 */
function detectSourceType(data: any): LegacySourceType {
  if (data.logicVersion === CANONICAL_LOGIC_VERSION) {
    return 'unknown'; // Already migrated
  }

  // pack328b has specific fields
  if (data.autoExpireAt !== undefined || data.lastPaidBucketAt !== undefined) {
    return 'pack328b';
  }

  // pack273 uses mode = 'FREE_LP' | 'PAID' and has specific states
  if (data.mode === 'FREE_LP' || data.mode === 'PAID' || data.state === 'AWAITING_PREPAID') {
    return 'pack273';
  }

  // chatMonetization.ts uses mode = 'FREE_A' | 'FREE_B' | 'PAID'
  if (data.mode === 'FREE_A' || data.mode === 'FREE_B') {
    return 'chatMonetization';
  }

  // chats.ts uses ChatStatus enum strings
  if (data.status === 'active' || data.status === 'expired' || data.status === 'closed' || data.status === 'queued') {
    return 'chats_ts';
  }

  return 'unknown';
}

/**
 * Extract roles from legacy data.
 */
function extractRoles(data: any): { payerId: string; earnerId: string | null } {
  // chatMonetization / pack273 format
  if (data.roles?.payerId) {
    return {
      payerId: data.roles.payerId,
      earnerId: data.roles.earnerId || null,
    };
  }

  // chats.ts format
  if (data.roles?.payer) {
    return {
      payerId: data.roles.payer,
      earnerId: data.roles.earner || null,
    };
  }

  // Fallback: first participant pays
  const participants = data.participants || data.participantIds || [];
  return {
    payerId: participants[0] || 'unknown',
    earnerId: participants[1] || null,
  };
}

/**
 * Extract free message state from legacy data.
 */
function extractFreeState(data: any, participants: string[]): CanonicalFreeState {
  // chatMonetization / pack328b format
  if (data.billing?.freeMessagesRemaining) {
    return {
      freeRemainingByUser: data.billing.freeMessagesRemaining,
    };
  }

  // chats.ts format
  if (data.freeMessagesUsed) {
    const freeRemainingByUser: Record<string, number> = {};
    for (const userId of participants) {
      const used = data.freeMessagesUsed[userId] || 0;
      freeRemainingByUser[userId] = Math.max(0, FREE_MESSAGES_STANDARD - used);
    }
    return { freeRemainingByUser };
  }

  // pack273 format (freeMessageLimit per chat, shared)
  if (data.freeMessageLimit !== undefined) {
    const freeRemainingByUser: Record<string, number> = {};
    const remaining = Math.max(0, (data.freeMessageLimit || 0) - (data.messagesUsed || 0));
    for (const userId of participants) {
      freeRemainingByUser[userId] = remaining;
    }
    return { freeRemainingByUser };
  }

  // Default: 0 for all participants (assume free phase exhausted for active paid chats)
  const freeRemainingByUser: Record<string, number> = {};
  for (const userId of participants) {
    freeRemainingByUser[userId] = 0;
  }
  return { freeRemainingByUser };
}

/**
 * Extract paid session from legacy data.
 */
function extractPaidSession(data: any): CanonicalPaidSession | null {
  const state = mapLegacyState(data);

  // Only create paid session for PAID_ACTIVE or AWAITING_DEPOSIT with existing deposit 
  if (state !== 'PAID_ACTIVE') return null;

  // From chatMonetization / pack273 billing
  const billing = data.billing || {};
  const deposit = data.deposit || {};

  const depositTokens = deposit.amount || billing.totalPrepaid || billing.depositAmount || 100;
  const platformFee = deposit.fee || Math.floor(depositTokens * 35 / 100);
  const escrowRemaining = billing.escrowBalance || billing.remainingTokens ||
    (deposit.escrow || (depositTokens - platformFee));

  const billingState: CanonicalBillingState = {
    accumulatedEarnerWords: billing.wordsSent || billing.usedWords || 0,
    escrowRemainingTokens: Math.max(0, escrowRemaining),
    platformFeeChargedTokens: platformFee,
    totalBucketsConsumed: Math.floor((billing.wordsSent || billing.usedWords || 0) / (billing.wordsPerToken || WORDS_PER_TOKEN_STANDARD)),
    totalTokensConsumed: billing.totalConsumed || billing.tokensSent || 0,
    totalEarnerCredited: 0, // Cannot determine from legacy data — set to 0
    totalAvaloCredited: 0,  // Cannot determine from legacy data — set to 0
  };

  return {
    sessionId: data.sessionId || `migrated_${data.chatId || 'unknown'}`,
    sessionVersion: 1,
    configSnapshot: {
      depositTokens,
      wordsPerToken: billing.wordsPerToken || WORDS_PER_TOKEN_STANDARD,
      burnMultiplier: 1, // Legacy did not have multipliers
    },
    startedAt: data.paidStartedAt || data.deposit?.paidAt || Timestamp.now(),
    billingState,
  };
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migrate a single chat document to v2_canonical format.
 */
function migrateDocument(chatId: string, data: any): CanonicalChatDocument {
  const participants = data.participants || data.participantIds || [];
  const roles = extractRoles(data);
  const state = mapLegacyState(data);
  const free = extractFreeState(data, participants);
  const paidSession = extractPaidSession(data);

  return {
    chatId,
    participants: participants.length >= 2 ? [participants[0], participants[1]] : [participants[0] || 'unknown', participants[1] || 'unknown'],
    roles: {
      payerId: roles.payerId,
      earnerId: roles.earnerId,
    },
    logicVersion: CANONICAL_LOGIC_VERSION,
    state,
    free,
    paidSession,
    lastMessageAt: data.lastMessageAt || data.lastActivityAt || data.updatedAt || null,
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: serverTimestamp(),
    closedReason: state === 'CLOSED' ? 'system_migrated' : undefined,
  };
}

/**
 * Run the migration on the main 'chats' collection.
 */
export async function migrateChatsCollection(
  options: Partial<MigrationOptions> = {}
): Promise<MigrationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: MigrationResult = {
    totalProcessed: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    dryRun: opts.dryRun,
  };

  let lastDoc: any = null;
  let totalProcessed = 0;

  while (totalProcessed < opts.maxBatchSize) {
    let query = db.collection('chats')
      .orderBy('createdAt')
      .limit(100);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      totalProcessed++;
      result.totalProcessed++;
      lastDoc = doc;

      try {
        const data = doc.data();

        // Skip already-migrated documents
        if (data.logicVersion === CANONICAL_LOGIC_VERSION) {
          result.skipped++;
          continue;
        }

        const sourceType = detectSourceType(data);
        const migrated = migrateDocument(doc.id, data);

        if (!opts.dryRun) {
          await doc.ref.set({
            ...migrated,
            _legacyBackup: {
              sourceType,
              originalData: data,
              migratedAt: Timestamp.now(),
            },
          }, { merge: false });
        }

        result.migrated++;
        console.log(`[MIGRATION] ${opts.dryRun ? 'DRY-RUN' : 'MIGRATED'} chat ${doc.id} (source: ${sourceType}) → state: ${migrated.state}`);

      } catch (error: any) {
        result.errors++;
        result.errorDetails.push({
          chatId: doc.id,
          error: error.message || String(error),
        });
        console.error(`[MIGRATION] ERROR on chat ${doc.id}:`, error.message);
      }
    }

    if (snapshot.size < 100) break;
  }

  return result;
}

/**
 * Run the migration on the pack273_chats collection.
 * These documents are migrated INTO the main 'chats' collection.
 */
export async function migratePack273Collection(
  options: Partial<MigrationOptions> = {}
): Promise<MigrationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: MigrationResult = {
    totalProcessed: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    dryRun: opts.dryRun,
  };

  let lastDoc: any = null;
  let totalProcessed = 0;

  while (totalProcessed < opts.maxBatchSize) {
    let query = db.collection('pack273_chats')
      .orderBy('createdAt')
      .limit(100);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      totalProcessed++;
      result.totalProcessed++;
      lastDoc = doc;

      try {
        const data = doc.data();

        // Check if already migrated to main collection
        const mainDoc = await db.collection('chats').doc(doc.id).get();
        if (mainDoc.exists && mainDoc.data()?.logicVersion === CANONICAL_LOGIC_VERSION) {
          result.skipped++;
          continue;
        }

        const migrated = migrateDocument(doc.id, data);

        if (!opts.dryRun) {
          // Write to main chats collection
          await db.collection('chats').doc(doc.id).set({
            ...migrated,
            _legacyBackup: {
              sourceType: 'pack273',
              originalCollection: 'pack273_chats',
              originalData: data,
              migratedAt: Timestamp.now(),
            },
          }, { merge: false });
        }

        result.migrated++;
        console.log(`[MIGRATION] ${opts.dryRun ? 'DRY-RUN' : 'MIGRATED'} pack273_chat ${doc.id} → chats/${doc.id} state: ${migrated.state}`);

      } catch (error: any) {
        result.errors++;
        result.errorDetails.push({
          chatId: doc.id,
          error: error.message || String(error),
        });
        console.error(`[MIGRATION] ERROR on pack273_chat ${doc.id}:`, error.message);
      }
    }

    if (snapshot.size < 100) break;
  }

  return result;
}

/**
 * Run the full migration (both collections).
 */
export async function runFullMigration(
  options: Partial<MigrationOptions> = {}
): Promise<{ chats: MigrationResult; pack273: MigrationResult | null }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(`[MIGRATION] Starting full migration (dryRun=${opts.dryRun})...`);

  const chatsResult = await migrateChatsCollection(opts);
  console.log(`[MIGRATION] Chats collection: processed=${chatsResult.totalProcessed}, migrated=${chatsResult.migrated}, skipped=${chatsResult.skipped}, errors=${chatsResult.errors}`);

  let pack273Result: MigrationResult | null = null;
  if (opts.migratePack273) {
    pack273Result = await migratePack273Collection(opts);
    console.log(`[MIGRATION] Pack273 collection: processed=${pack273Result.totalProcessed}, migrated=${pack273Result.migrated}, skipped=${pack273Result.skipped}, errors=${pack273Result.errors}`);
  }

  console.log(`[MIGRATION] Complete.`);

  return { chats: chatsResult, pack273: pack273Result };
}




























