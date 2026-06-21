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
 *   4. Credit creator wallet (split.creatorTokens) and platform wallet (split.avaloTokens).
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

    // 4. Credit creator wallet (full finalRateTokens per §0.3 — Avalo 20% at payout time)
    const creatorWalletRef = walletRef(creatorId);
    const creatorWallet = await readWalletInTransaction(transaction, creatorWalletRef, creatorId);
    const creatorBalanceAfter = creatorWallet.balance + finalRateTokens;
    transaction.update(creatorWalletRef, {
      balance: creatorBalanceAfter,
      earned: FieldValue.increment(finalRateTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

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
          before: creatorWallet.balance,
          after: creatorBalanceAfter,
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
  return snap.exists ? (snap.data() as any).balance ?? 0 : 0;
}
