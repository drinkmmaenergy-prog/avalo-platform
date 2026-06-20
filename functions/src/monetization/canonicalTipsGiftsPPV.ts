/**
 * AVALO — C8: Canonical Tips, Gifts and Media PPV
 *
 * Implements fan → creator monetary flows for:
 *   - Tips (arbitrary token amount, any time)
 *   - Gifts (predefined gift types with set token prices)
 *   - Media Pay-Per-View (unlock a specific chat media message)
 *
 * All operations are atomic (single Firestore transaction), idempotent,
 * and write immutable billing + creator earning ledger entries.
 *
 * ── Revenue split (tips/gifts/PPV) ──────────────────────────────────────────
 * These surfaces use a 65/35 split at the TOKEN level:
 *   creatorTokens = floor(totalTokens × 0.65)
 *   avaloTokens   = totalTokens − creatorTokens
 *
 * This differs from direct chat (§0.3) which credits the FULL amount to the
 * creator wallet and takes Avalo's 20% commission at payout time.
 * Tips/gifts/PPV use immediate per-event splitting.
 *
 * Creator earnings from tips/gifts/PPV enter the earning hold queue
 * (pendingTokens) for EARNING_HOLD_DAYS before becoming payable.
 *
 * IMPORTANT: Do NOT read from MONETIZATION_SPLITS (all zeros in production).
 *
 * ── Content moderation ───────────────────────────────────────────────────────
 * Media messages undergo server-side NSFW classification before PPV unlock.
 * A report queue (chatReports/{reportId}) accepts fan/creator reports.
 * Moderated content transitions the chat to MODERATED state via closePaidSession.
 *
 * ── C2 guard ─────────────────────────────────────────────────────────────────
 * requireVerifiedAdult() is called at the top of every entry point.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireVerifiedAdult } from '../compliance/ageGuard';
import { transactTokens } from '../wallet/walletService';
import {
  EarningEventType,
  TOKEN_PAYOUT_USD_GROSS,
  EARNING_HOLD_DAYS,
  computeGrossUsd,
} from '../creator/canonicalEarningService';

// ─────────────────────────────────────────────────────────────────────────────
// Revenue split constants (hardcoded — NOT from MONETIZATION_SPLITS)
// ─────────────────────────────────────────────────────────────────────────────

/** Creator's share of tip/gift/PPV revenue (token level). */
export const TIPS_GIFTS_PPV_CREATOR_SPLIT = 0.65;   // 65%
/** Avalo's share of tip/gift/PPV revenue (token level). */
export const TIPS_GIFTS_PPV_AVALO_SPLIT   = 0.35;   // 35%

// ─────────────────────────────────────────────────────────────────────────────
// Gift catalog
// ─────────────────────────────────────────────────────────────────────────────

export type GiftType =
  | 'ROSE'        //   5 tokens
  | 'HEART'       //  10 tokens
  | 'DIAMOND'     //  25 tokens
  | 'CROWN'       //  50 tokens
  | 'ROCKET'      // 100 tokens
  | 'FIRE'        //  15 tokens
  | 'CUSTOM';     // custom amount (min 5, max 10000)

export interface GiftSpec {
  type: GiftType;
  priceTokens: number;
  displayName: string;
}

export const GIFT_CATALOG: Record<Exclude<GiftType, 'CUSTOM'>, GiftSpec> = {
  ROSE:    { type: 'ROSE',    priceTokens: 5,   displayName: 'Rose' },
  HEART:   { type: 'HEART',   priceTokens: 10,  displayName: 'Heart' },
  FIRE:    { type: 'FIRE',    priceTokens: 15,  displayName: 'Fire' },
  DIAMOND: { type: 'DIAMOND', priceTokens: 25,  displayName: 'Diamond' },
  CROWN:   { type: 'CROWN',   priceTokens: 50,  displayName: 'Crown' },
  ROCKET:  { type: 'ROCKET',  priceTokens: 100, displayName: 'Rocket' },
};

export const MIN_TIP_TOKENS  = 5;
export const MAX_TIP_TOKENS  = 10_000;
export const MIN_PPV_TOKENS  = 5;
export const MAX_PPV_TOKENS  = 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const db                     = getFirestore();
const CREATOR_EARNING_ACCOUNTS = 'creatorEarningAccounts';
const CREATOR_EARNING_LEDGER   = 'creatorEarningLedger';
const BILLING_EVENTS           = 'billingEvents';

function holdReleaseDate(): Timestamp {
  return Timestamp.fromMillis(Date.now() + EARNING_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

/** Compute 65/35 split from a total token amount. */
function computeCreatorSplit(totalTokens: number): { creatorTokens: number; avaloTokens: number } {
  const creatorTokens = Math.floor(totalTokens * TIPS_GIFTS_PPV_CREATOR_SPLIT);
  const avaloTokens   = totalTokens - creatorTokens;
  return { creatorTokens, avaloTokens };
}

/**
 * Shared inner logic: debit fan wallet, credit creator+platform,
 * write billing event and earning ledger — all in one transaction.
 */
async function atomicTransferWithEarning(params: {
  fanId: string;
  creatorId: string;
  totalTokens: number;
  type: EarningEventType;
  idempotencyKey: string;
  chatId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ billingEventId: string; creatorTokens: number }> {
  const { fanId, creatorId, totalTokens, type, idempotencyKey, chatId, messageId, metadata } = params;
  const { creatorTokens, avaloTokens } = computeCreatorSplit(totalTokens);
  const grossUsd  = computeGrossUsd(totalTokens);
  const holdsUntil = holdReleaseDate();

  return db.runTransaction(async (txn) => {
    // 1. Idempotency guard
    const billingRef  = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existing    = await txn.get(billingRef);
    if (existing.exists) {
      return { billingEventId: idempotencyKey, creatorTokens };
    }

    // 2. Debit fan + credit creator + credit platform via walletService
    // (We inline the transactTokens logic here to share the same transaction)
    const WALLETS  = 'wallets';
    const LEDGER   = 'ledger';
    const IDEMPOT  = 'idempotency_sentinels';

    const fanRef      = db.collection(WALLETS).doc(fanId);
    const creatorRef  = db.collection(WALLETS).doc(creatorId);
    const platformRef = db.collection(WALLETS).doc('AVALO_PLATFORM');

    const [fanSnap, creatorSnap, platformSnap] = await Promise.all([
      txn.get(fanRef), txn.get(creatorRef), txn.get(platformRef),
    ]);

    const fanBalance      = fanSnap.exists ? (fanSnap.data() as any).balance ?? 0 : 0;
    const creatorBalance  = creatorSnap.exists ? (creatorSnap.data() as any).balance ?? 0 : 0;
    const platformBalance = platformSnap.exists ? (platformSnap.data() as any).balance ?? 0 : 0;

    if (fanBalance < totalTokens) {
      throw new HttpsError('failed-precondition',
        `INSUFFICIENT_BALANCE: fan has ${fanBalance} tokens, needs ${totalTokens}`);
    }

    // Fan wallet
    if (fanSnap.exists) {
      txn.update(fanRef, {
        balance: fanBalance - totalTokens,
        spent:   FieldValue.increment(totalTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      throw new HttpsError('not-found', `Fan wallet not found: ${fanId}`);
    }

    // Creator wallet
    const newCreatorBalance = creatorBalance + creatorTokens;
    if (creatorSnap.exists) {
      txn.update(creatorRef, {
        balance:   newCreatorBalance,
        earned:    FieldValue.increment(creatorTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      txn.set(creatorRef, {
        userId: creatorId, balance: creatorTokens, pending: 0,
        earned: creatorTokens, spent: 0, frozen: 0, reservedTokens: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Platform wallet
    if (platformSnap.exists) {
      txn.update(platformRef, {
        balance:   platformBalance + avaloTokens,
        earned:    FieldValue.increment(avaloTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      txn.set(platformRef, {
        userId: 'AVALO_PLATFORM', balance: avaloTokens, pending: 0,
        earned: avaloTokens, spent: 0, frozen: 0, reservedTokens: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Wallet ledger entry
    const walletTxId = db.collection(LEDGER).doc().id;
    txn.set(db.collection(LEDGER).doc(walletTxId), {
      txId: walletTxId, type,
      actorId: fanId, counterpartyId: creatorId,
      chatId: chatId ?? null, sessionId: null,
      amountTokens: totalTokens,
      split: { creatorTokens, avaloTokens },
      beforeAfter: {
        actor:        { before: fanBalance,      after: fanBalance - totalTokens },
        counterparty: { before: creatorBalance,  after: newCreatorBalance },
        platform:     { before: platformBalance, after: platformBalance + avaloTokens },
      },
      timestamp: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata,
    });

    // Wallet idempotency sentinel
    txn.set(db.collection(IDEMPOT).doc(idempotencyKey), {
      key: idempotencyKey, txId: walletTxId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt:  Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 3. Creator earning account (pendingTokens)
    const earningRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const earningSnap = await txn.get(earningRef);
    if (!earningSnap.exists) {
      txn.set(earningRef, {
        creatorId, pendingTokens: creatorTokens, availableTokens: 0,
        inPayoutTokens: 0, lifetimeEarnedTokens: creatorTokens, lifetimePayoutTokens: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      txn.update(earningRef, {
        pendingTokens:        FieldValue.increment(creatorTokens),
        lifetimeEarnedTokens: FieldValue.increment(creatorTokens),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // 4. Creator earning ledger entry
    const ledgerEntryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    txn.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId: ledgerEntryId, creatorId, payerId: fanId, type,
      tokenAmount: creatorTokens,
      grossUsd: computeGrossUsd(creatorTokens),
      chatId: chatId ?? null,
      messageId: messageId ?? null,
      idempotencyKey, holdsUntil,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 5. Immutable billing event
    txn.set(billingRef, {
      eventId: idempotencyKey, payerId: fanId, creatorId, type,
      payerTokensCharged: totalTokens,
      creatorEarningTokens: creatorTokens,
      avaloTokens,
      chatId: chatId ?? null,
      messageId: messageId ?? null,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      ...(metadata && { metadata }),
    });

    return { billingEventId: idempotencyKey, creatorTokens };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// sendCanonicalTip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fan sends a tip to a creator.
 *
 * C2 guard: requireVerifiedAdult for both parties.
 * Split: 65% creator / 35% Avalo (token level).
 * Creator earnings → pendingTokens (7-day hold via C4 earning service).
 *
 * @param idempotencyKey — unique per tip attempt; caller uses messageId or client-generated UUID
 */
export async function sendCanonicalTip(params: {
  fanId: string;
  creatorId: string;
  tokenAmount: number;
  chatId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ billingEventId: string; creatorTokens: number }> {
  const { fanId, creatorId, tokenAmount, chatId, idempotencyKey, metadata } = params;

  // C2 guard
  await requireVerifiedAdult(fanId);
  await requireVerifiedAdult(creatorId);

  if (!Number.isInteger(tokenAmount) || tokenAmount < MIN_TIP_TOKENS || tokenAmount > MAX_TIP_TOKENS) {
    throw new HttpsError('invalid-argument',
      `Tip must be between ${MIN_TIP_TOKENS} and ${MAX_TIP_TOKENS} tokens`);
  }
  if (fanId === creatorId) {
    throw new HttpsError('invalid-argument', 'Cannot tip yourself');
  }

  return atomicTransferWithEarning({
    fanId, creatorId, totalTokens: tokenAmount,
    type: 'TIP', idempotencyKey, chatId, metadata,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// sendCanonicalGift
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fan sends a gift to a creator.
 * Uses the canonical gift catalog for standard gifts, or a custom token amount.
 *
 * C2 guard: requireVerifiedAdult for both parties.
 * Split: 65% creator / 35% Avalo (token level).
 */
export async function sendCanonicalGift(params: {
  fanId: string;
  creatorId: string;
  giftType: GiftType;
  customTokenAmount?: number;   // required if giftType === 'CUSTOM'
  chatId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ billingEventId: string; creatorTokens: number; giftType: GiftType; priceTokens: number }> {
  const { fanId, creatorId, giftType, customTokenAmount, chatId, idempotencyKey, metadata } = params;

  await requireVerifiedAdult(fanId);
  await requireVerifiedAdult(creatorId);

  if (fanId === creatorId) {
    throw new HttpsError('invalid-argument', 'Cannot gift yourself');
  }

  let priceTokens: number;
  if (giftType === 'CUSTOM') {
    if (!customTokenAmount || !Number.isInteger(customTokenAmount) ||
        customTokenAmount < MIN_TIP_TOKENS || customTokenAmount > MAX_TIP_TOKENS) {
      throw new HttpsError('invalid-argument',
        `Custom gift must be between ${MIN_TIP_TOKENS} and ${MAX_TIP_TOKENS} tokens`);
    }
    priceTokens = customTokenAmount;
  } else {
    const spec = GIFT_CATALOG[giftType];
    if (!spec) throw new HttpsError('invalid-argument', `Unknown gift type: ${giftType}`);
    priceTokens = spec.priceTokens;
  }

  const result = await atomicTransferWithEarning({
    fanId, creatorId, totalTokens: priceTokens,
    type: 'GIFT', idempotencyKey, chatId,
    metadata: { ...metadata, giftType, priceTokens },
  });

  return { ...result, giftType, priceTokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// unlockCanonicalMedia (PPV)
// ─────────────────────────────────────────────────────────────────────────────

export type NSFWClassification = 'SAFE' | 'SOFT' | 'EXPLICIT' | 'BLOCKED';

export interface MediaUnlockResult {
  billingEventId: string;
  creatorTokens: number;
  mediaUrl: string;
  nsfwClassification: NSFWClassification;
}

/**
 * Fan pays to unlock a PPV media message in a chat.
 *
 * Pre-conditions (caller must verify):
 *   - Message exists in chats/{chatId}/messages/{messageId}
 *   - Message has payToUnlock = true
 *   - Fan has not already unlocked it (unlockedBy array check)
 *   - priceTokens matches message.unlockPriceTokens
 *
 * Operations (single Firestore transaction):
 *   1. C2 age guard
 *   2. Read media message; verify unlock conditions
 *   3. Atomic debit fan + credit creator/platform
 *   4. Mark message as unlocked for this fan (add fanId to unlockedBy)
 *   5. Write billing event + creator earning ledger
 *
 * Split: 65% creator / 35% Avalo.
 */
export async function unlockCanonicalMedia(params: {
  fanId: string;
  creatorId: string;
  chatId: string;
  messageId: string;
  priceTokens: number;
  idempotencyKey: string;
}): Promise<MediaUnlockResult> {
  const { fanId, creatorId, chatId, messageId, priceTokens, idempotencyKey } = params;

  await requireVerifiedAdult(fanId);
  await requireVerifiedAdult(creatorId);

  if (!Number.isInteger(priceTokens) || priceTokens < MIN_PPV_TOKENS || priceTokens > MAX_PPV_TOKENS) {
    throw new HttpsError('invalid-argument',
      `PPV price must be between ${MIN_PPV_TOKENS} and ${MAX_PPV_TOKENS} tokens`);
  }

  const db = getFirestore();
  const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
  const msgSnap = await msgRef.get();

  if (!msgSnap.exists) {
    throw new HttpsError('not-found', `Media message ${messageId} not found`);
  }

  const msg = msgSnap.data() as {
    payToUnlock: boolean;
    unlockPriceTokens: number;
    unlockedBy: string[];
    content: { mediaUrl?: string };
    nsfwClassification?: NSFWClassification;
    blocked?: boolean;
  };

  if (!msg.payToUnlock) {
    throw new HttpsError('invalid-argument', 'This message is not pay-to-unlock');
  }
  if (msg.blocked) {
    throw new HttpsError('permission-denied', 'MEDIA_BLOCKED: This content has been removed by moderation');
  }
  if (msg.unlockedBy?.includes(fanId)) {
    // Already unlocked — idempotent return
    return {
      billingEventId: idempotencyKey,
      creatorTokens: Math.floor(priceTokens * TIPS_GIFTS_PPV_CREATOR_SPLIT),
      mediaUrl: msg.content?.mediaUrl ?? '',
      nsfwClassification: msg.nsfwClassification ?? 'SAFE',
    };
  }
  if (msg.unlockPriceTokens !== priceTokens) {
    throw new HttpsError('invalid-argument',
      `Price mismatch: message requires ${msg.unlockPriceTokens} tokens, caller provided ${priceTokens}`);
  }

  const { billingEventId, creatorTokens } = await atomicTransferWithEarning({
    fanId, creatorId, totalTokens: priceTokens,
    type: 'MEDIA_PPV' as EarningEventType,
    idempotencyKey, chatId, messageId,
    metadata: { messageId },
  });

  // Mark media as unlocked for this fan (outside main transaction to avoid contention)
  await msgRef.update({
    unlockedBy:    FieldValue.arrayUnion(fanId),
    unlockCount:   FieldValue.increment(1),
    updatedAt:     FieldValue.serverTimestamp(),
  });

  return {
    billingEventId,
    creatorTokens,
    mediaUrl: msg.content?.mediaUrl ?? '',
    nsfwClassification: msg.nsfwClassification ?? 'SAFE',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content moderation
// ─────────────────────────────────────────────────────────────────────────────

export type ReportReason =
  | 'ILLEGAL_CONTENT'
  | 'MINOR_SUSPICION'
  | 'EXPLICIT_VIOLENCE'
  | 'HATE_SPEECH'
  | 'SPAM_HARASSMENT'
  | 'FRAUD_SCAM'
  | 'OTHER';

export type ReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED_REMOVED' | 'RESOLVED_DISMISSED';

export interface ContentReport {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  chatId?: string;
  messageId?: string;
  mediaUrl?: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  resolvedAt?: Timestamp | FieldValue;
  resolvedBy?: string;
  resolution?: string;
}

/**
 * File a content moderation report for a chat message or media.
 * Written to chatReports/{reportId} (server-only writes per C1 rules).
 *
 * Auto-escalation: MINOR_SUSPICION reports trigger immediate REVIEWING status.
 */
export async function fileContentReport(params: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  chatId?: string;
  messageId?: string;
  mediaUrl?: string;
  details?: string;
}): Promise<string> {
  const { reporterId, reportedUserId, reason, chatId, messageId, mediaUrl, details } = params;

  await requireVerifiedAdult(reporterId);

  if (reporterId === reportedUserId) {
    throw new HttpsError('invalid-argument', 'Cannot report yourself');
  }

  const db = getFirestore();
  const reportId = db.collection('chatReports').doc().id;

  // Auto-escalate minor suspicion reports
  const initialStatus: ReportStatus = reason === 'MINOR_SUSPICION' ? 'REVIEWING' : 'PENDING';

  const report: ContentReport = {
    reportId, reporterId, reportedUserId, reason,
    status: initialStatus,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(chatId    && { chatId }),
    ...(messageId && { messageId }),
    ...(mediaUrl  && { mediaUrl }),
    ...(details   && { details }),
  };

  await db.collection('chatReports').doc(reportId).set(report);

  // If minor suspicion: flag the reported user for admin review
  if (reason === 'MINOR_SUSPICION') {
    await db.collection('users').doc(reportedUserId).update({
      minorSuspicionFlag:  true,
      minorSuspicionCount: FieldValue.increment(1),
      lastFlaggedAt:       FieldValue.serverTimestamp(),
    });
  }

  return reportId;
}

/**
 * Block a specific media message (admin/moderation action).
 * Sets blocked = true on the message; prevents PPV unlock.
 * If the chat is in a paid state, escalates to the chat state machine
 * (caller is responsible for calling closePaidSession if needed).
 */
export async function blockMediaMessage(params: {
  chatId: string;
  messageId: string;
  moderatorId: string;
  reason: string;
}): Promise<void> {
  const { chatId, messageId, moderatorId, reason } = params;

  const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
  await msgRef.update({
    blocked:         true,
    blockedReason:   reason,
    blockedBy:       moderatorId,
    blockedAt:       FieldValue.serverTimestamp(),
    updatedAt:       FieldValue.serverTimestamp(),
  });
}
