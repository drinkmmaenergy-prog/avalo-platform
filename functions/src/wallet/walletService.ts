/**
 * WALLET SERVICE — Unified Wallet Mutations
 *
 * SINGLE WALLET PATH ENFORCEMENT:
 *   wallets/{userId}         — every user's canonical wallet
 *   wallets/AVALO_PLATFORM   — platform revenue wallet
 *
 * RULES:
 * - All mutations are transactional (Firestore runTransaction).
 * - No stale reads outside transactions.
 * - Every mutation writes a ledger entry (via LedgerService).
 * - Idempotency sentinels prevent duplicate processing.
 * - Integer arithmetic only — no floating-point token balances.
 *
 * This module does NOT modify any existing files.
 * All legacy wallet paths remain as-is for backward compatibility.
 * New code MUST use this service exclusively.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  WalletDocument,
  WalletMutationParams,
  WalletMutationResult,
  IdempotencySentinel,
  LedgerEntry,
  WALLETS_COLLECTION,
  LEDGER_COLLECTION,
  IDEMPOTENCY_COLLECTION,
  PLATFORM_WALLET_ID,
} from './types';

// ============================================================================
// FIRESTORE REFERENCE
// ============================================================================

const db = getFirestore();

// ============================================================================
// WALLET DOCUMENT HELPERS
// ============================================================================

/**
 * Get a reference to a user's canonical wallet document.
 * Enforces the single path: wallets/{userId}
 */
export function walletRef(userId: string) {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('[WalletService] userId must be a non-empty string');
  }
  return db.collection(WALLETS_COLLECTION).doc(userId);
}

/**
 * Get a reference to the platform wallet document.
 * Enforces the single path: wallets/AVALO_PLATFORM
 */
export function platformWalletRef() {
  return db.collection(WALLETS_COLLECTION).doc(PLATFORM_WALLET_ID);
}

/**
 * Read a wallet balance inside a transaction.
 * If the wallet doesn't exist, returns a zero-balance wallet and creates it.
 */
async function readWalletInTransaction(
  transaction: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  userId: string,
): Promise<WalletDocument> {
  const snap = await transaction.get(ref);

  if (snap.exists) {
    return snap.data() as WalletDocument;
  }

  // Auto-create wallet with zero balance
  const newWallet: WalletDocument = {
    userId,
    balance: 0,
    pending: 0,
    earned: 0,
    spent: 0,
    frozen: 0,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  transaction.set(ref, newWallet);
  return { ...newWallet, balance: 0, pending: 0, earned: 0, spent: 0, frozen: 0 };
}

// ============================================================================
// IDEMPOTENCY CHECK
// ============================================================================

/**
 * Check if an operation has already been processed.
 * Returns the existing txId if found, null otherwise.
 */
async function checkIdempotency(
  transaction: FirebaseFirestore.Transaction,
  idempotencyKey: string,
): Promise<string | null> {
  const ref = db.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyKey);
  const snap = await transaction.get(ref);

  if (snap.exists) {
    const sentinel = snap.data() as IdempotencySentinel;
    return sentinel.txId;
  }

  return null;
}

/**
 * Write an idempotency sentinel inside a transaction.
 */
function writeIdempotencySentinel(
  transaction: FirebaseFirestore.Transaction,
  idempotencyKey: string,
  txId: string,
): void {
  const ref = db.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyKey);
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const sentinel: IdempotencySentinel = {
    key: idempotencyKey,
    txId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  };

  transaction.set(ref, sentinel);
}

// ============================================================================
// CORE MUTATION: TRANSACT TOKENS
// ============================================================================

/**
 * Execute a wallet mutation atomically with ledger entry and idempotency.
 *
 * This is the ONLY way to mutate wallet balances in the unified system.
 *
 * Flow:
 * 1. Check idempotency sentinel — if exists, return cached result.
 * 2. Read actor wallet, counterparty wallet, platform wallet (inside txn).
 * 3. Validate sufficient balance on the debit side.
 * 4. Apply balance changes.
 * 5. Write ledger entry.
 * 6. Write idempotency sentinel.
 * 7. Commit transaction.
 *
 * @param params — mutation parameters (see WalletMutationParams)
 * @returns WalletMutationResult with updated balances
 * @throws Error if insufficient balance or validation fails
 */
export async function transactTokens(
  params: WalletMutationParams,
): Promise<WalletMutationResult> {
  // ── Input validation ──────────────────────────────────────────────────
  if (params.amountTokens <= 0) {
    throw new Error('[WalletService] amountTokens must be positive');
  }
  if (!Number.isInteger(params.amountTokens)) {
    throw new Error('[WalletService] amountTokens must be an integer (no floats)');
  }
  if (!Number.isInteger(params.split.creatorTokens) || !Number.isInteger(params.split.avaloTokens)) {
    throw new Error('[WalletService] split amounts must be integers');
  }
  if (params.split.creatorTokens + params.split.avaloTokens !== params.amountTokens) {
    throw new Error(
      `[WalletService] split mismatch: creator(${params.split.creatorTokens}) + avalo(${params.split.avaloTokens}) ≠ total(${params.amountTokens})`,
    );
  }
  if (!params.idempotencyKey || params.idempotencyKey.trim().length === 0) {
    throw new Error('[WalletService] idempotencyKey is required');
  }

  // ── Execute transactional mutation ────────────────────────────────────
  return db.runTransaction(async (transaction) => {
    // 1. Idempotency check
    const existingTxId = await checkIdempotency(transaction, params.idempotencyKey);
    if (existingTxId) {
      // Already processed — return idempotent result
      // Read current balances to return
      const actorSnap = await transaction.get(walletRef(params.actorId));
      const actorData = actorSnap.data() as WalletDocument | undefined;
      const platformSnap = await transaction.get(platformWalletRef());
      const platformData = platformSnap.data() as WalletDocument | undefined;

      let counterpartyBalance: number | null = null;
      if (params.counterpartyId) {
        const cpSnap = await transaction.get(walletRef(params.counterpartyId));
        const cpData = cpSnap.data() as WalletDocument | undefined;
        counterpartyBalance = cpData?.balance ?? 0;
      }

      return {
        txId: existingTxId,
        actorBalance: actorData?.balance ?? 0,
        counterpartyBalance,
        platformBalance: platformData?.balance ?? 0,
      };
    }

    // 2. Read all wallets inside transaction
    const actorWalletRef = walletRef(params.actorId);
    const platformRef = platformWalletRef();

    const actorWallet = await readWalletInTransaction(transaction, actorWalletRef, params.actorId);
    const platformWallet = await readWalletInTransaction(transaction, platformRef, PLATFORM_WALLET_ID);

    let counterpartyWallet: WalletDocument | null = null;
    let counterpartyRef: FirebaseFirestore.DocumentReference | null = null;

    if (params.counterpartyId) {
      counterpartyRef = walletRef(params.counterpartyId);
      counterpartyWallet = await readWalletInTransaction(
        transaction,
        counterpartyRef,
        params.counterpartyId,
      );
    }

    // 3. Validate sufficient balance
    if (actorWallet.balance < params.amountTokens) {
      throw new Error(
        `[WalletService] Insufficient balance: actor ${params.actorId} has ${actorWallet.balance}, needs ${params.amountTokens}`,
      );
    }

    // 4. Calculate new balances
    const actorBalanceAfter = actorWallet.balance - params.amountTokens;
    const platformBalanceAfter = platformWallet.balance + params.split.avaloTokens;

    let counterpartyBalanceAfter: number | null = null;

    if (counterpartyWallet && counterpartyRef) {
      counterpartyBalanceAfter = counterpartyWallet.balance + params.split.creatorTokens;
    }

    // 5. Apply balance changes
    transaction.update(actorWalletRef, {
      balance: actorBalanceAfter,
      spent: FieldValue.increment(params.amountTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(platformRef, {
      balance: platformBalanceAfter,
      earned: FieldValue.increment(params.split.avaloTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (counterpartyRef && counterpartyBalanceAfter !== null) {
      transaction.update(counterpartyRef, {
        balance: counterpartyBalanceAfter,
        earned: FieldValue.increment(params.split.creatorTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 6. Generate txId and write ledger entry
    const txId = db.collection(LEDGER_COLLECTION).doc().id;

    const ledgerEntry: LedgerEntry = {
      txId,
      type: params.type,
      actorId: params.actorId,
      counterpartyId: params.counterpartyId ?? null,
      chatId: params.chatId ?? null,
      sessionId: params.sessionId ?? null,
      amountTokens: params.amountTokens,
      split: {
        creatorTokens: params.split.creatorTokens,
        avaloTokens: params.split.avaloTokens,
      },
      beforeAfter: {
        actor: {
          before: actorWallet.balance,
          after: actorBalanceAfter,
        },
        counterparty: counterpartyWallet
          ? {
              before: counterpartyWallet.balance,
              after: counterpartyBalanceAfter!,
            }
          : null,
        platform: {
          before: platformWallet.balance,
          after: platformBalanceAfter,
        },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
    };

    const ledgerRef = db.collection(LEDGER_COLLECTION).doc(txId);
    transaction.set(ledgerRef, ledgerEntry);

    // 7. Write idempotency sentinel
    writeIdempotencySentinel(transaction, params.idempotencyKey, txId);

    return {
      txId,
      actorBalance: actorBalanceAfter,
      counterpartyBalance: counterpartyBalanceAfter,
      platformBalance: platformBalanceAfter,
    };
  });
}

// ============================================================================
// CREDIT TOKENS (for purchases, ad rewards, refunds)
// ============================================================================

/**
 * Credit tokens to a user's wallet (e.g., after token purchase, ad reward, refund).
 * This increases the user's balance without a corresponding debit from another user.
 *
 * @param userId — recipient user ID
 * @param amountTokens — tokens to credit (must be positive integer)
 * @param type — ledger entry type
 * @param idempotencyKey — unique key for this operation
 * @param metadata — optional context
 * @returns The ledger txId and new balance
 */
export async function creditTokens(params: {
  userId: string;
  amountTokens: number;
  type: 'PURCHASE' | 'CHAT_REFUND' | 'CALENDAR_REFUND' | 'CALL_ESCROW_RELEASE';
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ txId: string; newBalance: number }> {
  if (params.amountTokens <= 0 || !Number.isInteger(params.amountTokens)) {
    throw new Error('[WalletService] amountTokens must be a positive integer');
  }

  return db.runTransaction(async (transaction) => {
    // Idempotency check
    const existingTxId = await checkIdempotency(transaction, params.idempotencyKey);
    if (existingTxId) {
      const snap = await transaction.get(walletRef(params.userId));
      const data = snap.data() as WalletDocument | undefined;
      return { txId: existingTxId, newBalance: data?.balance ?? 0 };
    }

    const userRef = walletRef(params.userId);
    const platformRef = platformWalletRef();

    const userWallet = await readWalletInTransaction(transaction, userRef, params.userId);
    const platformWallet = await readWalletInTransaction(transaction, platformRef, PLATFORM_WALLET_ID);

    const newBalance = userWallet.balance + params.amountTokens;

    transaction.update(userRef, {
      balance: newBalance,
      earned: FieldValue.increment(params.amountTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Generate ledger entry
    const txId = db.collection(LEDGER_COLLECTION).doc().id;

    const ledgerEntry: LedgerEntry = {
      txId,
      type: params.type,
      actorId: params.userId,
      counterpartyId: null,
      chatId: null,
      sessionId: null,
      amountTokens: params.amountTokens,
      split: {
        creatorTokens: params.amountTokens,
        avaloTokens: 0,
      },
      beforeAfter: {
        actor: {
          before: userWallet.balance,
          after: newBalance,
        },
        counterparty: null,
        platform: {
          before: platformWallet.balance,
          after: platformWallet.balance,
        },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
    };

    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);
    writeIdempotencySentinel(transaction, params.idempotencyKey, txId);

    return { txId, newBalance };
  });
}

// ============================================================================
// DEBIT FOR PAYOUT (special: reduces user balance, writes ledger)
// ============================================================================

/**
 * Debit tokens from a user's wallet for payout processing.
 * Unlike transactTokens, this does NOT credit the platform —
 * the tokens are being converted to fiat.
 *
 * @param userId — user requesting payout
 * @param amountTokens — tokens to debit
 * @param idempotencyKey — unique payout idempotency key
 * @returns The ledger txId and new balance
 */
export async function debitForPayout(params: {
  userId: string;
  amountTokens: number;
  idempotencyKey: string;
  payoutId: string;
}): Promise<{ txId: string; newBalance: number; previousBalance: number }> {
  if (params.amountTokens <= 0 || !Number.isInteger(params.amountTokens)) {
    throw new Error('[WalletService] amountTokens must be a positive integer');
  }

  return db.runTransaction(async (transaction) => {
    // Idempotency check
    const existingTxId = await checkIdempotency(transaction, params.idempotencyKey);
    if (existingTxId) {
      const snap = await transaction.get(walletRef(params.userId));
      const data = snap.data() as WalletDocument | undefined;
      return {
        txId: existingTxId,
        newBalance: data?.balance ?? 0,
        previousBalance: data?.balance ?? 0,
      };
    }

    const userRef = walletRef(params.userId);
    const platformRef = platformWalletRef();

    const userWallet = await readWalletInTransaction(transaction, userRef, params.userId);
    const platformWallet = await readWalletInTransaction(transaction, platformRef, PLATFORM_WALLET_ID);

    if (userWallet.balance < params.amountTokens) {
      throw new Error(
        `[WalletService] Insufficient balance for payout: ${params.userId} has ${userWallet.balance}, needs ${params.amountTokens}`,
      );
    }

    const newBalance = userWallet.balance - params.amountTokens;

    transaction.update(userRef, {
      balance: newBalance,
      spent: FieldValue.increment(params.amountTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Generate ledger entry
    const txId = db.collection(LEDGER_COLLECTION).doc().id;

    const ledgerEntry: LedgerEntry = {
      txId,
      type: 'PAYOUT',
      actorId: params.userId,
      counterpartyId: null,
      chatId: null,
      sessionId: null,
      amountTokens: params.amountTokens,
      split: {
        creatorTokens: params.amountTokens,
        avaloTokens: 0,
      },
      beforeAfter: {
        actor: {
          before: userWallet.balance,
          after: newBalance,
        },
        counterparty: null,
        platform: {
          before: platformWallet.balance,
          after: platformWallet.balance,
        },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey: params.idempotencyKey,
      metadata: { payoutId: params.payoutId },
    };

    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);
    writeIdempotencySentinel(transaction, params.idempotencyKey, txId);

    return {
      txId,
      newBalance,
      previousBalance: userWallet.balance,
    };
  });
}

// ============================================================================
// READ-ONLY HELPERS
// ============================================================================

/**
 * Get the current balance for a user.
 * Uses a fresh read (not cached).
 */
export async function getBalance(userId: string): Promise<number> {
  const snap = await walletRef(userId).get();
  if (!snap.exists) return 0;
  return (snap.data() as WalletDocument).balance;
}

/**
 * Get the full wallet document for a user.
 */
export async function getWallet(userId: string): Promise<WalletDocument | null> {
  const snap = await walletRef(userId).get();
  if (!snap.exists) return null;
  return snap.data() as WalletDocument;
}

/**
 * Get the platform wallet balance.
 */
export async function getPlatformBalance(): Promise<number> {
  const snap = await platformWalletRef().get();
  if (!snap.exists) return 0;
  return (snap.data() as WalletDocument).balance;
}











