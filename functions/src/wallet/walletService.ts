import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

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
import { logger } from 'firebase-functions/v2';
import { sanitizeMoneyLogFields } from '../lib/moneyLog';

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
    reservedTokens: 0,
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
      `[WalletService] split mismatch: earner(${params.split.creatorTokens}) + platform(${params.split.avaloTokens}) ≠ total(${params.amountTokens})`,
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
  type: 'PURCHASE' | 'CHAT_REFUND' | 'CALENDAR_REFUND' | 'CALL_ESCROW_RELEASE' | 'AD_REWARD' | 'MIGRATION' | 'PAYOUT_REVERSAL';
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
// DEBIT FOR REFUND (Stripe refund / purchase reversal)
// ============================================================================

/**
 * Soft-debit tokens from a user's wallet after a Stripe purchase refund.
 *
 * Unlike debitForPayout, this does NOT throw if the user's balance is lower
 * than the refund amount (tokens may already have been spent). Instead it
 * debits min(amountTokens, currentBalance) and returns the shortfall so the
 * caller can log it for manual review.
 *
 * @param userId           — user whose tokens are being reclaimed
 * @param amountTokens     — tokens originally purchased (positive integer)
 * @param idempotencyKey   — unique key; idempotent by Stripe charge/event ID
 * @param metadata         — optional context (chargeId, purchaseId, etc.)
 * @returns tokensDebited, shortfall, newBalance, txId
 */
export async function debitForRefund(params: 
{
  userId: string;
  amountTokens: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ txId: string; tokensDebited: number; shortfall: number; newBalance: number }> {
  if (params.amountTokens <= 0 || !Number.isInteger(params.amountTokens)) {
    throw new Error('[WalletService] amountTokens must be a positive integer');
  }

  return db.runTransaction(async (transaction) => {
    // Idempotency check
    const existingTxId = await checkIdempotency(transaction, params.idempotencyKey);
    if (existingTxId) {
      const snap = await transaction.get(walletRef(params.userId));
      const data = snap.data() as WalletDocument | undefined;
      const currentBalance = data?.balance ?? 0;
      return {
        txId: existingTxId,
        tokensDebited: Math.min(params.amountTokens, currentBalance),
        shortfall: Math.max(0, params.amountTokens - currentBalance),
        newBalance: currentBalance,
      };
    }

    const userRef = walletRef(params.userId);
    const userWallet = await readWalletInTransaction(transaction, userRef, params.userId);

    // Soft debit: clamp to available balance (never go negative)
    const tokensDebited = Math.min(params.amountTokens, userWallet.balance);
    const shortfall = params.amountTokens - tokensDebited;
    const newBalance = userWallet.balance - tokensDebited;

    if (tokensDebited > 0) {
      transaction.update(userRef, {
        balance: newBalance,
        spent: FieldValue.increment(tokensDebited),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const txId = db.collection(LEDGER_COLLECTION).doc().id;

    const ledgerEntry: LedgerEntry = {
      txId,
      type: 'PURCHASE_REFUND',
      actorId: params.userId,
      counterpartyId: null,
      chatId: null,
      sessionId: null,
      amountTokens: tokensDebited,
      split: { creatorTokens: 0, avaloTokens: 0 },
      beforeAfter: {
        actor: { before: userWallet.balance, after: newBalance },
        counterparty: null,
        platform: { before: 0, after: 0 },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey: params.idempotencyKey,
      metadata: { ...params.metadata, shortfall, requestedAmount: params.amountTokens },
    };

    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);
    writeIdempotencySentinel(transaction, params.idempotencyKey, txId);

    return { txId, tokensDebited, shortfall, newBalance };
  });
}

// ============================================================================
// GET BALANCE — canonical balance read
// ============================================================================

/**
 * Read a user's canonical available token balance from wallets/{uid}.balance.
 * Returns 0 if the wallet document doesn't exist yet.
 *
 * NOTE: This is a non-transactional point read. For billing decisions inside
 * transactions, use readWalletInTransaction() directly.
 */
export async function getBalance(userId: string): Promise<number> {
  const snap = await walletRef(userId).get();
  if (!snap.exists) return 0;
  const data = snap.data() as WalletDocument;
  return data.balance ?? 0;
}

/**
 * Read a user's reserved token balance (tokens locked for an active chat session).
 * Returns 0 if no wallet document exists.
 */
export async function getReservedBalance(userId: string): Promise<number> {
  const snap = await walletRef(userId).get();
  if (!snap.exists) return 0;
  const data = snap.data() as WalletDocument;
  return data.reservedTokens ?? 0;
}

// ============================================================================
// C3: CANONICAL CONSUMER RESERVATION WALLET PRIMITIVES
// ============================================================================
//
// Invariants enforced here (from canonical spec §0.4 and §0.5):
//
//   §0.4  Minimum session entry = max(100, finalRateTokens, creatorConfiguredMinimum).
//         The reservation is a HOLD — not an immediate burn.
//         All unconsumed tokens return automatically on close/expire/exhaustion.
//
//   §0.5  Budget exhaustion fires when remainingReservedTokens < finalRateTokens,
//         NOT when remainingReservedTokens === 0.
//
// Wallet accounting:
//   balance         = immediately spendable (canonical §0.1 field)
//   reservedTokens  = locked for an active session (opaque to new spend)
//   After reserve:  balance -= amount;  reservedTokens += amount
//   After consume:  reservedTokens -= finalRateTokens  (creator+platform credited)
//   After release:  reservedTokens -= remaining;  balance += remaining
//
// ============================================================================

import {
  ChatReservation,
  ReservationStatus,
  RESERVATIONS_COLLECTION,
} from './types';

/** Minimum session entry (invariant §0.4). */
export const MIN_SESSION_ENTRY_TOKENS = 100;

/**
 * Compute the required reservation size per §0.4.
 *
 * @param finalRateTokens         — configured per-response rate (e.g. 3 × multiplier)
 * @param creatorConfiguredMinimum — optional creator-set minimum (defaults to 0)
 */
export function computeReservationAmount(
  finalRateTokens: number,
  creatorConfiguredMinimum = 0,
): number {
  return Math.max(MIN_SESSION_ENTRY_TOKENS, finalRateTokens, creatorConfiguredMinimum);
}

// ── reserveTokens ─────────────────────────────────────────────────────────────

/**
 * C3: Open a paid-chat session by atomically moving tokens from the consumer's
 * balance into a session reservation.
 *
 * Operations (single Firestore transaction):
 *   1. Idempotency guard (reservationId as key).
 *   2. Read wallets/{userId}.
 *   3. Validate balance >= reservationAmount.
 *   4. Deduct balance; increment reservedTokens.
 *   5. Create chat_reservations/{reservationId} doc.
 *   6. Write ledger entry (CHAT_RESERVATION_RESERVE).
 *   7. Write idempotency sentinel.
 *
 * @throws Error if balance < reservationAmount
 */
export async function reserveTokens(params: {
  userId: string;
  chatId: string;
  reservationId: string;       // typically chatId or a unique session key
  reservationAmount: number;   // output of computeReservationAmount()
  finalRateTokens: number;     // per-response rate (for budget exhaustion check)
  creatorConfiguredMinimum?: number;
}): Promise<{ txId: string; reservation: ChatReservation }> {
  const { userId, chatId, reservationId, reservationAmount, finalRateTokens } = params;

  if (!Number.isInteger(reservationAmount) || reservationAmount <= 0) {
    throw new Error('[WalletService] reservationAmount must be a positive integer');
  }
  if (reservationAmount < MIN_SESSION_ENTRY_TOKENS) {
    throw new Error(
      `[WalletService] reservationAmount ${reservationAmount} < minimum ${MIN_SESSION_ENTRY_TOKENS}`
    );
  }

  const idempotencyKey = `reservation_open_${reservationId}`;

  return db.runTransaction(async (transaction) => {
    // 1. Idempotency
    const existingTxId = await checkIdempotency(transaction, idempotencyKey);
    if (existingTxId) {
      const resSnap = await transaction.get(
        db.collection(RESERVATIONS_COLLECTION).doc(reservationId)
      );
      const existing = resSnap.data() as ChatReservation;
      return { txId: existingTxId, reservation: existing };
    }

    // 2. Read wallet
    const userWalletRef = walletRef(userId);
    const userWallet = await readWalletInTransaction(transaction, userWalletRef, userId);

    // 3. Validate
    if (userWallet.balance < reservationAmount) {
      throw new Error(
        `[WalletService] Insufficient balance for chat reservation: ` +
        `${userId} has ${userWallet.balance} tokens, needs ${reservationAmount}`
      );
    }

    // 4. Wallet update
    const balanceAfter = userWallet.balance - reservationAmount;
    const reservedAfter = (userWallet.reservedTokens ?? 0) + reservationAmount;
    transaction.update(userWalletRef, {
      balance: balanceAfter,
      reservedTokens: reservedAfter,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5. Reservation document
    const now = FieldValue.serverTimestamp();
    const reservation: ChatReservation = {
      reservationId,
      userId,
      chatId,
      status: 'ACTIVE',
      reservedTokens: reservationAmount,
      consumedTokens: 0,
      remainingTokens: reservationAmount,
      finalRateTokens,
      minimumEntry: reservationAmount,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(db.collection(RESERVATIONS_COLLECTION).doc(reservationId), reservation);

    // 6. Ledger entry
    const txId = db.collection(LEDGER_COLLECTION).doc().id;
    const ledgerEntry: LedgerEntry = {
      txId,
      type: 'CHAT_RESERVATION_RESERVE',
      actorId: userId,
      counterpartyId: null,
      chatId,
      sessionId: reservationId,
      amountTokens: reservationAmount,
      split: { creatorTokens: 0, avaloTokens: 0 },
      beforeAfter: {
        actor: { before: userWallet.balance, after: balanceAfter },
        counterparty: null,
        platform: { before: 0, after: 0 },
      },
      timestamp: now,
      idempotencyKey,
      metadata: { reservationId, finalRateTokens },
    };
    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);

    // 7. Idempotency sentinel
    writeIdempotencySentinel(transaction, idempotencyKey, txId);

    return { txId, reservation };
  });
}

// ── consumeFromReservation ────────────────────────────────────────────────────

/**
 * C3: Atomically burn finalRateTokens from an active reservation for one paid
 * creator response.
 *
 * Operations (single Firestore transaction):
 *   1. Idempotency guard (responseIdempotencyKey).
 *   2. Read reservation doc; verify ACTIVE + sufficient remaining.
 *   3. Read wallets/{userId}: decrement reservedTokens (tokens already off balance).
 *   4. REMOVED [G1]: creator wallet credit removed — earning goes to creatorEarningAccounts only.
 *   5. Update reservation: consumedTokens +=, remainingTokens -=.
 *      If remainingTokens < finalRateTokens → mark EXHAUSTED.
 *   6. Write ledger entry (CHAT_RESPONSE_BURN).
 *   7. Write idempotency sentinel.
 *
 * Per canonical §0.3:
 *   creatorEarningTokens = finalRateTokens (no split reduction)
 *   payerTokensCharged   = finalRateTokens
 *   Avalo commission     = 20% of gross payout USD value (applied at payout time, not here)
 *
 * IMPORTANT: The "no per-delivery token split" rule means we credit creator the FULL
 * finalRateTokens here. Avalo takes its 20% commission when converting to USD at payout.
 */
export async function consumeFromReservation(params: {
  userId: string;            // payer (fan)
  creatorId: string;         // recipient of tokens
  chatId: string;
  reservationId: string;
  finalRateTokens: number;   // must match reservation.finalRateTokens
  responseIdempotencyKey: string;  // unique per response (e.g. msgId)
  metadata?: Record<string, unknown>;
}): Promise<{
  txId: string;
  consumedTokens: number;
  remainingTokens: number;
  budgetExhausted: boolean;
}> {
  const { userId, creatorId, chatId, reservationId, finalRateTokens, responseIdempotencyKey } = params;

  if (!Number.isInteger(finalRateTokens) || finalRateTokens <= 0) {
    throw new Error('[WalletService] finalRateTokens must be a positive integer');
  }

  const idempotencyKey = `chat_burn_${responseIdempotencyKey}`;

  return db.runTransaction(async (transaction) => {
    // 1. Idempotency
    const existingTxId = await checkIdempotency(transaction, idempotencyKey);
    if (existingTxId) {
      const resSnap = await transaction.get(
        db.collection(RESERVATIONS_COLLECTION).doc(reservationId)
      );
      const res = resSnap.data() as ChatReservation;
      return {
        txId: existingTxId,
        consumedTokens: res.consumedTokens,
        remainingTokens: res.remainingTokens,
        budgetExhausted: res.status === 'EXHAUSTED',
      };
    }

    // 2. Read reservation
    const resRef = db.collection(RESERVATIONS_COLLECTION).doc(reservationId);
    const resSnap = await transaction.get(resRef);
    if (!resSnap.exists) {
      throw new Error(`[WalletService] Reservation ${reservationId} not found`);
    }
    const res = resSnap.data() as ChatReservation;

    if (res.status !== 'ACTIVE') {
      throw new Error(
        `[WalletService] Reservation ${reservationId} is not ACTIVE (status: ${res.status})`
      );
    }
    if (res.remainingTokens < finalRateTokens) {
      throw new Error(
        `[WalletService] Reservation ${reservationId} has insufficient remaining tokens: ` +
        `${res.remainingTokens} < ${finalRateTokens}`
      );
    }
    if (res.finalRateTokens !== finalRateTokens) {
      throw new Error(
        `[WalletService] Rate mismatch: reservation expects ${res.finalRateTokens}, ` +
        `caller passed ${finalRateTokens}`
      );
    }

    // 3. Update user wallet: decrement reservedTokens (balance already reduced at reserve time)
    const userWalletRef = walletRef(userId);
    const userWallet = await readWalletInTransaction(transaction, userWalletRef, userId);
    const newReservedTokens = Math.max(0, (userWallet.reservedTokens ?? 0) - finalRateTokens);
    transaction.update(userWalletRef, {
      reservedTokens: newReservedTokens,
      spent: FieldValue.increment(finalRateTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 4. REMOVED [G1]: wallets/{creatorId} is consumer spending wallet only.
    //    Creator earning goes exclusively to creatorEarningAccounts (step 7 of canonical flow).
    //    Note: caller (deliverPaidResponse in canonicalChatStateMachineV3) handles earning account.

    // 5. Update reservation
    const newConsumed = res.consumedTokens + finalRateTokens;
    const newRemaining = res.remainingTokens - finalRateTokens;
    const budgetExhausted = newRemaining < finalRateTokens;
    const newStatus: ReservationStatus = budgetExhausted ? 'EXHAUSTED' : 'ACTIVE';
    const resUpdate: Partial<ChatReservation> & Record<string, unknown> = {
      consumedTokens: newConsumed,
      remainingTokens: newRemaining,
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (budgetExhausted) {
      resUpdate.closedAt = FieldValue.serverTimestamp();
    }
    transaction.update(resRef, resUpdate);

    // 6. Ledger entry
    const txId = db.collection(LEDGER_COLLECTION).doc().id;
    const ledgerEntry: LedgerEntry = {
      txId,
      type: 'CHAT_RESPONSE_BURN',
      actorId: userId,
      counterpartyId: creatorId,
      chatId,
      sessionId: reservationId,
      amountTokens: finalRateTokens,
      split: {
        creatorTokens: finalRateTokens,  // §0.3: full amount to creator; Avalo 20% at payout
        avaloTokens: 0,
      },
      beforeAfter: {
        actor: {
          before: userWallet.reservedTokens ?? 0,
          after: newReservedTokens,
        },
        counterparty: {
          before: 0, // [G1]: creator wallet not read/written here; earning goes to creatorEarningAccounts
          after: finalRateTokens, // earning tokens credited to pendingEarningTokens (not consumer wallet)
        },
        platform: { before: 0, after: 0 },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata: {
        ...params.metadata,
        reservationId,
        responseIdempotencyKey,
        consumedAfter: newConsumed,
        remainingAfter: newRemaining,
        budgetExhausted,
      },
    };
    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);

    // 7. Idempotency sentinel
    writeIdempotencySentinel(transaction, idempotencyKey, txId);

    return { txId, consumedTokens: newConsumed, remainingTokens: newRemaining, budgetExhausted };
  });
}

// ── releaseReservation ────────────────────────────────────────────────────────

/**
 * C3: Close a chat session by returning all unconsumed reserved tokens to the
 * consumer's spendable balance.
 *
 * Called when:
 *  - Session ends normally (END_PROPOSED + accepted, or fan hangs up)
 *  - Inactivity timeout fires (C7 scheduler)
 *  - Creator declines / session never starts
 *
 * Operations (single Firestore transaction):
 *   1. Idempotency guard.
 *   2. Read reservation; if already RELEASED/EXPIRED/EXHAUSTED, return early.
 *   3. Return remainingTokens: reservedTokens -= remaining; balance += remaining.
 *   4. Mark reservation with finalStatus.
 *   5. Write ledger entry (CHAT_RESERVATION_RELEASE) — only if tokens > 0.
 *   6. Write idempotency sentinel.
 */
export async function releaseReservation(params: {
  userId: string;
  chatId: string;
  reservationId: string;
  finalStatus: 'RELEASED' | 'EXPIRED';
  idempotencyKey: string;   // e.g. `release_${reservationId}_${reason}`
  metadata?: Record<string, unknown>;
}): Promise<{
  txId: string | null;
  tokensReturned: number;
  finalStatus: ReservationStatus;
}> {
  const { userId, chatId, reservationId, finalStatus, idempotencyKey } = params;

  return db.runTransaction(async (transaction) => {
    // 1. Idempotency
    const existingTxId = await checkIdempotency(transaction, idempotencyKey);
    if (existingTxId) {
      const resSnap = await transaction.get(
        db.collection(RESERVATIONS_COLLECTION).doc(reservationId)
      );
      const res = resSnap.data() as ChatReservation;
      return {
        txId: existingTxId,
        tokensReturned: 0,
        finalStatus: res.status,
      };
    }

    // 2. Read reservation
    const resRef = db.collection(RESERVATIONS_COLLECTION).doc(reservationId);
    const resSnap = await transaction.get(resRef);
    if (!resSnap.exists) {
      // Nothing to release — reservation may never have been created
      return { txId: null, tokensReturned: 0, finalStatus: 'RELEASED' };
    }
    const res = resSnap.data() as ChatReservation;

    // Already closed — idempotent
    if (res.status !== 'ACTIVE') {
      return { txId: null, tokensReturned: 0, finalStatus: res.status };
    }

    const tokensToReturn = res.remainingTokens;

    // 3. Return tokens to balance (only if there is something to return)
    if (tokensToReturn > 0) {
      const userWalletRef = walletRef(userId);
      const userWallet = await readWalletInTransaction(transaction, userWalletRef, userId);
      const balanceAfter = userWallet.balance + tokensToReturn;
      const newReserved = Math.max(0, (userWallet.reservedTokens ?? 0) - tokensToReturn);
      transaction.update(userWalletRef, {
        balance: balanceAfter,
        reservedTokens: newReserved,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 5. Ledger entry
      const txId = db.collection(LEDGER_COLLECTION).doc().id;
      const ledgerEntry: LedgerEntry = {
        txId,
        type: 'CHAT_RESERVATION_RELEASE',
        actorId: userId,
        counterpartyId: null,
        chatId,
        sessionId: reservationId,
        amountTokens: tokensToReturn,
        split: { creatorTokens: 0, avaloTokens: 0 },
        beforeAfter: {
          actor: { before: userWallet.balance, after: balanceAfter },
          counterparty: null,
          platform: { before: 0, after: 0 },
        },
        timestamp: FieldValue.serverTimestamp(),
        idempotencyKey,
        metadata: {
          ...params.metadata,
          reservationId,
          finalStatus,
          consumedTokens: res.consumedTokens,
        },
      };
      transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);

      // 6. Idempotency sentinel
      writeIdempotencySentinel(transaction, idempotencyKey, txId);

      // 4. Close reservation
      transaction.update(resRef, {
        status: finalStatus,
        updatedAt: FieldValue.serverTimestamp(),
        closedAt: FieldValue.serverTimestamp(),
      });

      return { txId, tokensReturned: tokensToReturn, finalStatus };
    }

    // No tokens to return — just close
    transaction.update(resRef, {
      status: finalStatus,
      updatedAt: FieldValue.serverTimestamp(),
      closedAt: FieldValue.serverTimestamp(),
    });

    writeIdempotencySentinel(transaction, idempotencyKey, '');

    return { txId: null, tokensReturned: 0, finalStatus };
  });
}

export async function getWallet(userId: string): Promise<any> {
  return getBalance(userId);
}

export async function getPlatformBalance(): Promise<number> {
  const db = getFirestore();
  const snap = await db.collection("wallets").doc("AVALO_PLATFORM").get();
  return snap.exists ? (snap.data() as { balance: number; reservedTokens: number; updatedAt: unknown }).balance ?? 0 : 0;
}

// ============================================================================
// R3 PAYMENT-FOUNDATION BOUNDED RECOVERY (Phase C)  provider-verified purchase
// primitive + its direct dependency sanitizeOptionalMetadata/stripUndefinedDeep.
// Recovered verbatim from forensic walletService.ts (read-only source). No unrelated
// neighboring wallet behavior imported. All other clean-HEAD behavior is preserved.
// ============================================================================

export function sanitizeOptionalMetadata(
  meta: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (meta === undefined || meta === null) return undefined;
  return stripUndefinedDeep(meta) as Record<string, unknown>;
}

function stripUndefinedDeep(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v
      .filter((x) => x !== undefined && typeof x !== 'function' && typeof x !== 'symbol')
      .map(stripUndefinedDeep);
  }
  if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined || typeof val === 'function' || typeof val === 'symbol') continue;
      out[k] = stripUndefinedDeep(val);
    }
    return out;
  }
  return v; // primitives, Timestamps, FieldValues, Dates, etc. pass through untouched
}

// ============================================================================
// DURABLE PROVIDER PURCHASE BARRIER (server-only, exactly-once-forever)
// ============================================================================
//
// Permanent source of truth that a verified provider purchase was credited:
//     providerPurchases/{provider}:{providerSessionId}   (NON-EXPIRING)
//
// This is the durability guarantee that creditTokens' 7-day idempotency sentinel
// cannot provide. The barrier is created with transaction.create() in the SAME
// transaction as the wallet credit + ledger write, so a concurrent duplicate
// aborts the losing transaction (create precondition), which then retries and
// observes CREDITED -> ALREADY_CREDITED. Exactly-once holds permanently.
//
// ACCOUNTING SEPARATION: a provider purchase is a CONSUMER top-up. It increases
// spendable wallets/{uid}.balance ONLY. It never increments wallets/{uid}.earned
// (a lifetime EARNINGS stat, per WalletDocument) and never touches creator earnings,
// which live exclusively in creatorEarningAccounts / creatorEarningLedger.
//
// Callable ONLY by trusted server-side completion code (never client-reachable).

export const PROVIDER_PURCHASES_COLLECTION = 'providerPurchases';
export const PROVIDER_PURCHASE_TX_COLLECTION = 'providerPurchaseTransactions';
/** Durable reconciliation queue for internal barrier inconsistencies (server-only, ops-facing). */
export const PAYMENT_RECONCILIATION_COLLECTION = 'paymentReconciliation';
/**
 * Durable server-only completion outbox. When a caller supplies a `completion` payload, a PENDING
 * record is created ATOMICALLY with the wallet credit + ledger + barriers + sentinel, guaranteeing a
 * durable post-credit audit-repair signal exists even if later audit writes fail. Keyed by
 * {provider}:{providerTransactionId}.
 */
export const PAYMENT_COMPLETION_OUTBOX_COLLECTION = 'paymentCompletionOutbox';
export type ProviderId = 'stripe' | 'apple' | 'google';

/** Optional canonical completion payload; when present the primitive writes a PENDING outbox atomically. */
export interface ProviderPurchaseCompletion {
  packId: string;
  amountTotalMinor: number;
  currency: string;
  eventId?: string | null;
  sourceRoute: string;
}

/** Defensive upper bound so a corrupted upstream amount cannot mint absurd balances. */
export const MAX_PROVIDER_PURCHASE_TOKENS = 100_000_000;

export interface ProviderPurchaseBarrier {
  barrierId: string;
  provider: ProviderId;
  providerSessionId: string;
  providerTransactionId: string;
  userId: string;
  amountTokens: number;
  ledgerTxId: string;
  status: 'CREDITED';
  createdAt: FirebaseFirestore.FieldValue;
}

export type CreditVerifiedProviderPurchaseResult =
  | { status: 'CREDITED_NEW'; txId: string; newBalance: number; barrierId: string }
  | { status: 'ALREADY_CREDITED'; txId: string; newBalance: number; barrierId: string }
  | { status: 'RECONCILIATION_REQUIRED'; reason: string; reconciliationKey: string }
  | { status: 'REJECTED'; reason: string };

const PROVIDER_IDS: readonly ProviderId[] = ['stripe', 'apple', 'google'];

function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v);
}

function isSafeIdPart(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 1500 && !v.includes('/');
}

export type ValidatedProviderPurchase = {
  provider: ProviderId;
  providerSessionId: string;
  providerTransactionId: string;
  userId: string;
  amountTokens: number;
};

/**
 * Pure, side-effect-free validation of TRUSTED provider-purchase inputs.
 * Accepts unknown-typed fields so malformed runtime input can be covered by REAL
 * tests without any TypeScript suppression. Returns a typed ok/reason result.
 */
export function validateProviderPurchaseInput(input: {
  provider: unknown;
  providerSessionId: unknown;
  providerTransactionId: unknown;
  userId: unknown;
  amountTokens: unknown;
}): { ok: true; value: ValidatedProviderPurchase } | { ok: false; reason: string } {
  if (!isProviderId(input.provider)) return { ok: false, reason: 'invalid_provider' };
  if (!isSafeIdPart(input.providerSessionId)) return { ok: false, reason: 'invalid_provider_session_id' };
  if (!isSafeIdPart(input.providerTransactionId)) return { ok: false, reason: 'invalid_provider_transaction_id' };
  if (!isSafeIdPart(input.userId)) return { ok: false, reason: 'invalid_user_id' };
  if (
    typeof input.amountTokens !== 'number' ||
    !Number.isInteger(input.amountTokens) ||
    input.amountTokens <= 0 ||
    input.amountTokens > MAX_PROVIDER_PURCHASE_TOKENS
  ) {
    return { ok: false, reason: 'invalid_amount' };
  }
  return {
    ok: true,
    value: {
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      providerTransactionId: input.providerTransactionId,
      userId: input.userId,
      amountTokens: input.amountTokens,
    },
  };
}

/** Compare an existing CREDITED barrier's immutable fields against the incoming request. */
function providerPurchaseConflicts(
  stored: ProviderPurchaseBarrier,
  v: ValidatedProviderPurchase,
  compareSession: boolean,
): string[] {
  const c: string[] = [];
  if (stored.provider !== v.provider) c.push('provider');
  if (stored.providerTransactionId !== v.providerTransactionId) c.push('providerTransactionId');
  if (stored.userId !== v.userId) c.push('userId');
  if (stored.amountTokens !== v.amountTokens) c.push('amountTokens');
  // Session is immutable only when matched via the session barrier. When matched via the
  // transaction registry (session barrier absent), a differing session is an expected replay.
  if (compareSession && stored.providerSessionId !== v.providerSessionId) c.push('providerSessionId');
  return c;
}

/** A stored barrier is usable only if it is a fully-formed CREDITED record. */
function isWellFormedCreditedBarrier(b: ProviderPurchaseBarrier): boolean {
  return (
    b.status === 'CREDITED' &&
    typeof b.ledgerTxId === 'string' && b.ledgerTxId.length > 0 &&
    typeof b.userId === 'string' && b.userId.length > 0 &&
    typeof b.providerSessionId === 'string' && b.providerSessionId.length > 0 &&
    typeof b.providerTransactionId === 'string' && b.providerTransactionId.length > 0 &&
    typeof b.amountTokens === 'number' && Number.isInteger(b.amountTokens) && b.amountTokens > 0
  );
}

/** The session and transaction barriers for one purchase must describe the SAME immutable purchase. */
function sameImmutablePurchase(a: ProviderPurchaseBarrier, b: ProviderPurchaseBarrier): boolean {
  return (
    a.provider === b.provider &&
    a.providerSessionId === b.providerSessionId &&
    a.providerTransactionId === b.providerTransactionId &&
    a.userId === b.userId &&
    a.amountTokens === b.amountTokens &&
    a.ledgerTxId === b.ledgerTxId &&
    a.status === b.status
  );
}

export type ProviderPurchaseAnomalyEvent =
  | 'provider_purchase_conflict'
  | 'provider_purchase_state_invalid'
  | 'provider_purchase_barrier_inconsistency';

/**
 * Build the structured anomaly-log payload. PURE and exported so a real invariant test can prove
 * the payload never contains a user id OR any UID-derived value.
 *
 * S6 MONEY-LOG HYGIENE: anomaly RUNTIME logs carry FIXED CLASSIFICATIONS ONLY — event, severity,
 * provider, barrier status classification, and mismatching FIELD NAMES. They NEVER carry barrier
 * IDs, provider session/transaction ids, ledger tx ids, reconciliation keys, user ids (or any
 * derivative), amounts, receipts, secrets, caught errors, or payloads. Operational repair uses
 * the raw identifiers stored ONLY in the server-only paymentReconciliation record (never logged);
 * the final whitelist pass through sanitizeMoneyLogFields makes identifier leakage structural,
 * not conventional. The signature keeps the full anomaly context so the durable-record writer and
 * this builder receive identical inputs, but only classifications reach the log.
 */
export function buildAnomalyLogPayload(args: {
  event: ProviderPurchaseAnomalyEvent;
  provider: ProviderId;
  sessionBarrierId: string;
  txnBarrierId: string;
  providerSessionId: string;
  providerTransactionId: string;
  stored: ProviderPurchaseBarrier | null;
  conflictingFields: string[];
  reconciliationKey?: string;
}): Record<string, unknown> {
  return sanitizeMoneyLogFields({
    severity: 'CRITICAL',
    event: args.event,
    provider: args.provider,
    storedStatus: args.stored?.status,
    conflictType: args.conflictingFields,
  });
}

/**
 * Credit a server-VERIFIED provider purchase exactly once, permanently.
 *
 * Trusted inputs only (resolved server-side by the canonical completion service).
 *
 * Permanent identity is enforced by TWO barriers created atomically in one transaction:
 *   providerPurchases/{provider}:{providerSessionId}
 *   providerPurchaseTransactions/{provider}:{providerTransactionId}
 * so the paid transaction cannot be replayed under a different session, and the session
 * cannot be replayed under a different transaction.
 *
 * Firestore transaction (ALL reads strictly before ALL writes):
 *   reads : session barrier, transaction barrier, then (existing-branch) the wallet, or
 *           (credit-branch) user wallet + platform wallet;
 *   branch: both barriers, same immutable purchase, request matches -> ALREADY_CREDITED;
 *           both barriers, same purchase, request conflicts          -> REJECTED provider_purchase_conflict;
 *           partial / inconsistent / malformed barrier state         -> RECONCILIATION_REQUIRED (+ durable reconciliation record, no money mutation);
 *   writes: wallet (balance ONLY, never .earned), ledger (PURCHASE), BOTH barriers (create), secondary sentinel.
 *
 * ACCOUNTING: consumer top-up. Never touches .earned or creator earnings
 * (creatorEarningAccounts / creatorEarningLedger). replayLedger credits a PURCHASE actor by
 * amountTokens and ignores split for PURCHASE; verifyPlatformWalletSum sums avaloTokens — so
 * split is {creatorTokens:0, avaloTokens:0} (no creator recipient, no platform cut).
 *
 * No nested transaction. No refund ever deletes a barrier. Not client-reachable.
 */
export async function creditVerifiedProviderPurchase(params: {
  provider: ProviderId;
  providerSessionId: string;
  providerTransactionId: string;
  userId: string;
  amountTokens: number;
  metadata?: Record<string, unknown>;
  completion?: ProviderPurchaseCompletion;
}): Promise<CreditVerifiedProviderPurchaseResult> {
  const validated = validateProviderPurchaseInput(params);
  if (validated.ok === false) {
    return { status: 'REJECTED', reason: validated.reason };
  }
  const v = validated.value;

  const sessionBarrierId = `${v.provider}:${v.providerSessionId}`;
  const txnBarrierId = `${v.provider}:${v.providerTransactionId}`;
  const sessionRef = db.collection(PROVIDER_PURCHASES_COLLECTION).doc(sessionBarrierId);
  const txnRef = db.collection(PROVIDER_PURCHASE_TX_COLLECTION).doc(txnBarrierId);
  const secondaryKey = `${v.provider}_purchase_${v.providerSessionId}`;

  return db.runTransaction(async (transaction): Promise<CreditVerifiedProviderPurchaseResult> => {
    // ===== READ PHASE (all reads strictly before any write) =====
    const sessionSnap = await transaction.get(sessionRef);
    const txnSnap = await transaction.get(txnRef);
    const sessionData = sessionSnap.exists ? (sessionSnap.data() as ProviderPurchaseBarrier) : null;
    const txnData = txnSnap.exists ? (txnSnap.data() as ProviderPurchaseBarrier) : null;

    // Structured, PII-safe anomaly logging (no raw user id; correlation hash only).
    const anomaly = (
      event: ProviderPurchaseAnomalyEvent,
      stored: ProviderPurchaseBarrier | null,
      conflictingFields: string[],
      reconKey?: string,
    ): void => {
      logger.error(`[SECURITY] ${event}`, buildAnomalyLogPayload({
        event,
        provider: v.provider,
        sessionBarrierId,
        txnBarrierId,
        providerSessionId: v.providerSessionId,
        providerTransactionId: v.providerTransactionId,
        stored,
        conflictingFields,
        reconciliationKey: reconKey,
      }));
    };

    // Durable, idempotent reconciliation record keyed on {provider}:{providerTransactionId}.
    // Reads its own doc first (still before any money write), then set/merge. NEVER mutates
    // wallet / ledger / barriers / sentinel.
    const reconciliationKey = `${v.provider}:${v.providerTransactionId}`;
    const openReconciliation = async (reason: string, stored: ProviderPurchaseBarrier | null): Promise<void> => {
      const reconRef = db.collection(PAYMENT_RECONCILIATION_COLLECTION).doc(reconciliationKey);
      const reconSnap = await transaction.get(reconRef);
      const now = FieldValue.serverTimestamp();
      const record = {
        reconciliationKey,
        provider: v.provider,
        providerSessionId: v.providerSessionId,
        providerTransactionId: v.providerTransactionId,
        sessionBarrierId,
        txnBarrierId,
        ledgerTxId: stored?.ledgerTxId ?? null,
        // Raw internal userId is retained ONLY here (server-only paymentReconciliation collection)
        // for deterministic operational repair. It is NEVER emitted to logs. Phase F rules lock this
        // collection to server-only access.
        userId: v.userId,
        reason,
        status: 'OPEN' as const,
        updatedAt: now,
      };
      if (reconSnap.exists) {
        transaction.set(reconRef, record, { merge: true });
      } else {
        transaction.set(reconRef, { ...record, createdAt: now });
      }
    };

    if (sessionData || txnData) {
      // E. Any existing barrier that is not a well-formed CREDITED record = internal data
      //    inconsistency (not an invalid request) -> RECONCILIATION_REQUIRED, no money mutation.
      if ((sessionData && !isWellFormedCreditedBarrier(sessionData)) || (txnData && !isWellFormedCreditedBarrier(txnData))) {
        const stored = sessionData ?? txnData;
        anomaly('provider_purchase_state_invalid', stored, ['status'], reconciliationKey);
        await openReconciliation('provider_purchase_state_invalid', stored);
        return { status: 'RECONCILIATION_REQUIRED', reason: 'provider_purchase_barrier_inconsistency', reconciliationKey };
      }

      // B. Both barriers exist -> they MUST describe the same immutable purchase.
      if (sessionData && txnData) {
        if (!sameImmutablePurchase(sessionData, txnData)) {
          anomaly('provider_purchase_barrier_inconsistency', sessionData, ['barrierPair'], reconciliationKey);
          await openReconciliation('provider_purchase_barrier_inconsistency', sessionData);
          return { status: 'RECONCILIATION_REQUIRED', reason: 'provider_purchase_barrier_inconsistency', reconciliationKey };
        }
        const conflicts = providerPurchaseConflicts(sessionData, v, true);
        if (conflicts.length > 0) {
          anomaly('provider_purchase_conflict', sessionData, conflicts);
          return { status: 'REJECTED', reason: 'provider_purchase_conflict' };
        }
        const wSnap = await transaction.get(walletRef(v.userId));
        const wData = wSnap.data() as WalletDocument | undefined;
        return { status: 'ALREADY_CREDITED', txId: sessionData.ledgerTxId, newBalance: wData?.balance ?? 0, barrierId: sessionBarrierId };
      }

      // C. Session barrier present, transaction barrier missing.
      if (sessionData && !txnData) {
        // Incoming conflicting with the existing session barrier (e.g. same session, different
        // transaction id / user / amount) -> REJECTED conflict, no mutation.
        const conflicts = providerPurchaseConflicts(sessionData, v, true);
        if (conflicts.length > 0) {
          anomaly('provider_purchase_conflict', sessionData, conflicts);
          return { status: 'REJECTED', reason: 'provider_purchase_conflict' };
        }
        // Incoming matches the session barrier but its paired transaction barrier is missing:
        // partial/inconsistent internal state -> RECONCILIATION_REQUIRED, no credit.
        anomaly('provider_purchase_barrier_inconsistency', sessionData, ['missingTransactionBarrier'], reconciliationKey);
        await openReconciliation('provider_purchase_barrier_inconsistency', sessionData);
        return { status: 'RECONCILIATION_REQUIRED', reason: 'provider_purchase_barrier_inconsistency', reconciliationKey };
      }

      // D. Transaction barrier present, session barrier missing (same PaymentIntent under a different
      //    session). Stripe PI<->Session is 1:1, so this is an internal inconsistency, NOT a normal replay.
      if (!sessionData && txnData) {
        // Incoming conflicting with the stored transaction barrier (different user / amount; session
        // is not compared here) -> REJECTED conflict, no mutation.
        const conflicts = providerPurchaseConflicts(txnData, v, false);
        if (conflicts.length > 0) {
          anomaly('provider_purchase_conflict', txnData, conflicts);
          return { status: 'REJECTED', reason: 'provider_purchase_conflict' };
        }
        // Same paid transaction, session barrier missing -> provider semantics do not repair internal
        // state -> RECONCILIATION_REQUIRED, no credit.
        anomaly('provider_purchase_barrier_inconsistency', txnData, ['missingSessionBarrier'], reconciliationKey);
        await openReconciliation('provider_purchase_barrier_inconsistency', txnData);
        return { status: 'RECONCILIATION_REQUIRED', reason: 'provider_purchase_barrier_inconsistency', reconciliationKey };
      }
    }
    // A. Neither barrier exists -> proceed to the atomic credit transaction below.

    // ===== credit-path reads (still before any write) =====
    // NOTE: we do NOT use readWalletInTransaction here — it can transaction.set() an absent wallet,
    // which after the platform get() would violate Firestore's reads-before-writes rule.
    const userRef = walletRef(v.userId);
    const platformRef = platformWalletRef();
    const userSnap = await transaction.get(userRef);
    const platformSnap = await transaction.get(platformRef);
    const currentBalance = userSnap.exists ? (userSnap.data() as WalletDocument).balance : 0;
    const platformBalance = platformSnap.exists ? (platformSnap.data() as WalletDocument).balance : 0;
    const newBalance = currentBalance + v.amountTokens;

    // ===== WRITE PHASE =====
    // Single write per wallet doc. Consumer top-up increases spendable balance ONLY (never .earned).
    if (userSnap.exists) {
      transaction.update(userRef, {
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(userRef, {
        userId: v.userId,
        balance: newBalance,
        pending: 0,
        earned: 0,
        spent: 0,
        frozen: 0,
        reservedTokens: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Canonical ledger entry. split is {0,0}: replayLedger credits a PURCHASE actor by amountTokens
    // and ignores split for PURCHASE; a consumer top-up has no creator recipient and no platform cut.
    const txId = db.collection(LEDGER_COLLECTION).doc().id;
    const ledgerEntry: LedgerEntry = {
      txId,
      type: 'PURCHASE',
      actorId: v.userId,
      counterpartyId: null,
      chatId: null,
      sessionId: v.providerSessionId,
      amountTokens: v.amountTokens,
      split: { creatorTokens: 0, avaloTokens: 0 },
      beforeAfter: {
        actor: { before: currentBalance, after: newBalance },
        counterparty: null,
        platform: { before: platformBalance, after: platformBalance },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey: secondaryKey,
      metadata: sanitizeOptionalMetadata({
        ...params.metadata,
        provider: v.provider,
        providerSessionId: v.providerSessionId,
        providerTransactionId: v.providerTransactionId,
        sessionBarrierId,
        txnBarrierId,
        source: 'creditVerifiedProviderPurchase',
      }) ?? {},
    };
    transaction.set(db.collection(LEDGER_COLLECTION).doc(txId), ledgerEntry);

    // Two permanent barriers, created atomically. A concurrent duplicate loses at create()
    // (real Firestore ABORT), rolls back, retries, and observes CREDITED -> ALREADY_CREDITED.
    const barrierBase = {
      provider: v.provider,
      providerSessionId: v.providerSessionId,
      providerTransactionId: v.providerTransactionId,
      userId: v.userId,
      amountTokens: v.amountTokens,
      ledgerTxId: txId,
      status: 'CREDITED' as const,
      createdAt: FieldValue.serverTimestamp(),
    };
    const sessionBarrier: ProviderPurchaseBarrier = { barrierId: sessionBarrierId, ...barrierBase };
    const txnBarrier: ProviderPurchaseBarrier = { barrierId: txnBarrierId, ...barrierBase };
    transaction.create(sessionRef, sessionBarrier);
    transaction.create(txnRef, txnBarrier);

    // Optional durable completion outbox — created ATOMICALLY with the credit so a PENDING
    // audit-repair signal always exists after a successful credit. Immutable money fields only.
    if (params.completion) {
      const outboxRef = db.collection(PAYMENT_COMPLETION_OUTBOX_COLLECTION).doc(txnBarrierId);
      transaction.create(outboxRef, {
        completionKey: txnBarrierId,
        provider: v.provider,
        providerSessionId: v.providerSessionId,
        providerTransactionId: v.providerTransactionId,
        userId: v.userId,
        ledgerTxId: txId,
        status: 'PENDING' as const,
        packId: params.completion.packId,
        amountTokens: v.amountTokens,
        amountTotalMinor: params.completion.amountTotalMinor,
        currency: params.completion.currency,
        stripeEventId: params.completion.eventId ?? null,
        sourceRoute: params.completion.sourceRoute,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Secondary (7-day) idempotency sentinel — local dedupe only, NOT the durable guarantee.
    writeIdempotencySentinel(transaction, secondaryKey, txId);

    return { status: 'CREDITED_NEW', txId, newBalance, barrierId: sessionBarrierId };
  });
}
