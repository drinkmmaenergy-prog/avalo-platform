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
 * ── Revenue model (tips/gifts/PPV) ──────────────────────────────────────────
 * §1.2 canonical: payerTokensCharged = creatorEarningTokens (NO token split at delivery).
 * Creator earns 100% of charged tokens into pendingEarningTokens (with hold).
 * Avalo 20% commission is taken at PAYOUT time only (creatorNetUsdCents = gross × 0.80).
 * The prior 65/35 split model is REMOVED as of B-series hardening.
 *
 * Creator earnings from tips/gifts/PPV enter the earning hold queue
 * (pendingEarningTokens) for EARNING_HOLD_DAYS before becoming payable.
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
import {
  EarningEventType,
  EARNING_HOLD_DAYS,
  computeGrossUsd,
} from '../creator/canonicalEarningService';

// ─────────────────────────────────────────────────────────────────────────────
// Revenue split constants (hardcoded — NOT from MONETIZATION_SPLITS)
// ─────────────────────────────────────────────────────────────────────────────

/** §1.2: No token split at delivery. Creator earns 100% of charged tokens.
 * Avalo 20% commission taken at PAYOUT time via creatorNetUsdCents = grossUsdCents × 0.80 */
// TIPS_GIFTS_PPV_CREATOR_SPLIT removed — was 0.65, replaced by full-amount earning

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

// computeCreatorSplit removed — §1.2: no split at delivery

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
  // §1.2: No token split at delivery. Creator earns 100% of charged tokens.
  // Avalo 20% commission taken at PAYOUT time via canonicalPayoutSystemV2.
  const { fanId, creatorId, totalTokens, type, idempotencyKey, chatId, messageId, metadata } = params;
  // creatorTokens = payerTokensCharged (full amount, no split)
  const creatorTokens = totalTokens;
  const holdsUntil    = holdReleaseDate();

  return db.runTransaction(async (txn) => {
    // 1. Idempotency guard
    const billingRef = db.collection(BILLING_EVENTS).doc(idempotencyKey);
    const existing   = await txn.get(billingRef);
    if (existing.exists) {
      return { billingEventId: idempotencyKey, creatorTokens };
    }

    // 2. Debit fan wallet (wallets/{fanId}.balance only — never creator wallet)
    const fanRef  = db.collection('wallets').doc(fanId);
    const fanSnap = await txn.get(fanRef);
    const fanData = fanSnap.data() as { balance: number; reservedTokens?: number; updatedAt?: unknown } | undefined;
    const fanBalance = fanData?.balance ?? 0;

    if (!fanSnap.exists || fanBalance < totalTokens) {
      throw new HttpsError('failed-precondition',
        `INSUFFICIENT_BALANCE: fan has ${fanBalance} tokens, needs ${totalTokens}`);
    }

    txn.update(fanRef, {
      balance:   fanBalance - totalTokens,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Creator earning account (pendingEarningTokens — NOT wallets/{creatorId})
    const earningRef  = db.collection(CREATOR_EARNING_ACCOUNTS).doc(creatorId);
    const earningSnap = await txn.get(earningRef);
    if (!earningSnap.exists) {
      txn.set(earningRef, {
        creatorId,
        pendingEarningTokens:    creatorTokens,
        availableEarningTokens:  0,
        reservedEarningTokens:   0,
        paidOutEarningTokens:    0,
        refundDebtEarningTokens: 0,
        payoutBlocked:           false,
        payoutBlockReason:       null,
        riskTier:                'NEW',
        trustTier:               'NEW',
        kycLevel:                'NONE',
        successfulPayoutCount:   0,
        stripeConnectAccountId:  null,
        stripeOnboardingComplete: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      txn.update(earningRef, {
        pendingEarningTokens: FieldValue.increment(creatorTokens),
        updatedAt:            FieldValue.serverTimestamp(),
      });
    }

    // 4. Creator earning ledger entry
    const ledgerEntryId = db.collection(CREATOR_EARNING_LEDGER).doc().id;
    txn.set(db.collection(CREATOR_EARNING_LEDGER).doc(ledgerEntryId), {
      entryId: ledgerEntryId,
      creatorId,
      payerId:     fanId,
      type,
      tokenAmount: creatorTokens,
      grossUsd:    computeGrossUsd(creatorTokens),
      chatId:      chatId ?? null,
      messageId:   messageId ?? null,
      idempotencyKey,
      holdsUntil,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 5. Immutable billing event
    txn.set(billingRef, {
      eventId:              idempotencyKey,
      payerId:              fanId,
      creatorId,
      type,
      payerTokensCharged:   totalTokens,   // §1.2: equals creatorEarningTokens
      creatorEarningTokens: creatorTokens,  // 100% of charged tokens
      chatId:               chatId ?? null,
      messageId:            messageId ?? null,
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
 * Creator earnings → pendingEarningTokens (7-day hold via C4 earning service).
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
      creatorTokens: priceTokens,  // §1.2: 100% of price goes to creator
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
