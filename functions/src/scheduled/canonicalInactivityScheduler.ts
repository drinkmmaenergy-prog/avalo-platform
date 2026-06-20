/**
 * AVALO — C7: Inactivity Scheduler, Discovery Return and Rematch Protection
 *
 * Scheduled Cloud Functions that run every 30 minutes and:
 *
 *   1. Expire inactive chats (48h without a message) — returns reserved tokens
 *   2. Release held creator earnings (EARNING_HOLD_DAYS elapsed)
 *   3. Expire pending rate proposals and end proposals
 *   4. Return expired creators to discovery feed
 *   5. Enforce rematch protection (pairMatchHistory) — prevent fan/creator
 *      from immediately re-entering a paid session after one just ended
 *
 * All token returns go through releaseReservation() (C3) — never direct writes.
 * All earning releases go through releaseHeldEarnings() (C4).
 *
 * ── Inactivity expiry (§0.4 reference) ──────────────────────────────────────
 *   CHAT_INACTIVITY_EXPIRY_HOURS = 48
 *   On expiry: closePaidSession(finalStatus='EXPIRED') → tokens returned to fan
 *   Chat transitions to EXPIRED state.
 *
 * ── Rematch protection ───────────────────────────────────────────────────────
 *   After a paid session ends, a cooldown prevents the same fan/creator pair
 *   from immediately re-opening a new paid session.
 *   pairMatchHistory/{pairId} (server-only writes) tracks this.
 *   REMATCH_COOLDOWN_HOURS = 1 (prevents micro-session abuse)
 *
 * ── Discovery return ─────────────────────────────────────────────────────────
 *   When a creator's chat expires due to inactivity, their discoveryActive flag
 *   is reset to true so they re-appear in the discovery feed.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { closePaidSession } from '../chat/canonicalChatStateMachineV3';
import { releaseHeldEarnings } from '../creator/canonicalEarningService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_INACTIVITY_EXPIRY_HOURS = 48;
const CHAT_INACTIVITY_EXPIRY_MS    = CHAT_INACTIVITY_EXPIRY_HOURS * 60 * 60 * 1000;

/** Cooldown period after a paid session ends before the same pair can start another. */
const REMATCH_COOLDOWN_HOURS = 1;
const REMATCH_COOLDOWN_MS    = REMATCH_COOLDOWN_HOURS * 60 * 60 * 1000;

/** Rate proposal auto-expire after this period if fan doesn't respond. */
const RATE_PROPOSAL_EXPIRY_MS = 10 * 60 * 1000;   // 10 min

/** End proposal auto-expire after this period. */
const END_PROPOSAL_EXPIRY_MS = 5 * 60 * 1000;     // 5 min

// Scheduler runs every 30 minutes
const SCHEDULE_EXPRESSION = 'every 30 minutes';
const SCHEDULER_TIMEOUT_SECONDS = 540;  // 9 minutes

const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// pairMatchHistory helpers
// ─────────────────────────────────────────────────────────────────────────────

function pairId(uidA: string, uidB: string): string {
  // Canonical pair ID: lexicographically sorted, joined with '_'
  return [uidA, uidB].sort().join('_');
}

/**
 * Record a paid session completion in pairMatchHistory.
 * Written server-only; clients cannot write this collection (C1 Firestore rules).
 * Called by closePaidSession() / session cleanup.
 */
export async function recordPaidSessionCompletion(params: {
  fanId: string;
  creatorId: string;
  chatId: string;
  sessionEndedAt?: Timestamp;
}): Promise<void> {
  const { fanId, creatorId, chatId, sessionEndedAt } = params;
  const id = pairId(fanId, creatorId);

  await db.collection('pairMatchHistory').doc(id).set({
    pairId: id,
    uidA: [fanId, creatorId].sort()[0],
    uidB: [fanId, creatorId].sort()[1],
    fanId,
    creatorId,
    lastChatId:    chatId,
    lastSessionAt: sessionEndedAt ?? FieldValue.serverTimestamp(),
    sessionCount:  FieldValue.increment(1),
    updatedAt:     FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Check if a fan/creator pair is within the rematch cooldown period.
 * Returns true if they should be blocked from starting a NEW paid session.
 */
export async function isRematchBlocked(fanId: string, creatorId: string): Promise<boolean> {
  const id   = pairId(fanId, creatorId);
  const snap = await db.collection('pairMatchHistory').doc(id).get();

  if (!snap.exists) return false;

  const data = snap.data() as { lastSessionAt?: Timestamp };
  if (!data.lastSessionAt) return false;

  const elapsed = Date.now() - data.lastSessionAt.toMillis();
  return elapsed < REMATCH_COOLDOWN_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Expire inactive chats
// ─────────────────────────────────────────────────────────────────────────────

async function expireInactiveChats(): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - CHAT_INACTIVITY_EXPIRY_MS);

  // Query PAID_ACTIVE and FREE_ACTIVE chats with lastMessageAt before cutoff
  const expirableStates = ['PAID_ACTIVE', 'FREE_ACTIVE', 'RATE_PROPOSED', 'END_PROPOSED', 'PAID_ENTRY_PENDING'];
  let expired = 0;

  for (const state of expirableStates) {
    const snap = await db.collection('chats')
      .where('state', '==', state)
      .where('lastMessageAt', '<=', cutoff)
      .limit(50)  // batch size to avoid timeout
      .get();

    for (const doc of snap.docs) {
      const chat = doc.data() as {
        chatId: string;
        fanId: string;
        creatorId: string;
        activeReservationId: string | null;
      };

      try {
        if (chat.activeReservationId) {
          // Return reserved tokens and expire the paid session
          await closePaidSession({
            chatId:         chat.chatId,
            fanId:          chat.fanId,
            reservationId:  chat.activeReservationId,
            finalState:     'EXPIRED',
            idempotencyKey: `expire_${chat.chatId}_${Date.now()}`,
          });

          // Record for rematch protection
          await recordPaidSessionCompletion({
            fanId:     chat.fanId,
            creatorId: chat.creatorId,
            chatId:    chat.chatId,
          });
        } else {
          // Free-window chat with no reservation — just mark expired
          await db.collection('chats').doc(chat.chatId).update({
            state:     'EXPIRED',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Return creator to discovery
        await db.collection('users').doc(chat.creatorId).update({
          discoveryActive: true,
          lastDiscoveryReturn: FieldValue.serverTimestamp(),
        });

        expired++;
      } catch (err) {
        console.error(`[C7] Failed to expire chat ${chat.chatId}:`, err);
      }
    }
  }

  return expired;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Release held creator earnings
// ─────────────────────────────────────────────────────────────────────────────

async function releaseEarningsForEligibleCreators(): Promise<{ processed: number; tokensReleased: number }> {
  const now = Timestamp.now();

  // Find all creators who have pending earnings past their hold date
  const snap = await db.collection('creatorEarningLedger')
    .where('holdsUntil', '<=', now)
    .where('type', '!=', 'EARNING_HOLD_RELEASE')
    .select('creatorId')
    .limit(100)
    .get();

  if (snap.empty) return { processed: 0, tokensReleased: 0 };

  // Deduplicate creator IDs
  const creatorIds = [...new Set(snap.docs.map(d => d.data().creatorId as string))];

  let processed     = 0;
  let tokensReleased = 0;

  for (const creatorId of creatorIds) {
    try {
      const result = await releaseHeldEarnings(creatorId);
      if (result.tokensReleased > 0) {
        processed++;
        tokensReleased += result.tokensReleased;
      }
    } catch (err) {
      console.error(`[C7] Failed to release earnings for creator ${creatorId}:`, err);
    }
  }

  return { processed, tokensReleased };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Expire pending rate proposals
// ─────────────────────────────────────────────────────────────────────────────

async function expirePendingRateProposals(): Promise<number> {
  const now = Timestamp.now();

  const snap = await db.collection('rateProposals')
    .where('status', '==', 'PENDING')
    .where('expiresAt', '<=', now)
    .limit(50)
    .get();

  let expired = 0;
  for (const doc of snap.docs) {
    const proposal = doc.data() as { chatId: string; proposalId: string };
    try {
      const batch = db.batch();
      batch.update(doc.ref, {
        status:     'EXPIRED',
        resolvedAt: FieldValue.serverTimestamp(),
      });
      batch.update(db.collection('chats').doc(proposal.chatId), {
        state:              'PAID_ACTIVE',
        activeRateProposal: null,
        updatedAt:          FieldValue.serverTimestamp(),
      });
      await batch.commit();
      expired++;
    } catch (err) {
      console.error(`[C7] Failed to expire rate proposal ${proposal.proposalId}:`, err);
    }
  }

  return expired;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Expire pending end proposals
// ─────────────────────────────────────────────────────────────────────────────

async function expirePendingEndProposals(): Promise<number> {
  const now = Timestamp.now();

  const snap = await db.collection('endProposals')
    .where('status', '==', 'PENDING')
    .where('expiresAt', '<=', now)
    .limit(50)
    .get();

  let expired = 0;
  for (const doc of snap.docs) {
    const proposal = doc.data() as { chatId: string; proposalId: string };
    try {
      const batch = db.batch();
      batch.update(doc.ref, {
        status:     'EXPIRED',
        resolvedAt: FieldValue.serverTimestamp(),
      });
      batch.update(db.collection('chats').doc(proposal.chatId), {
        state:             'PAID_ACTIVE',
        activeEndProposal: null,
        updatedAt:         FieldValue.serverTimestamp(),
      });
      await batch.commit();
      expired++;
    } catch (err) {
      console.error(`[C7] Failed to expire end proposal ${proposal.proposalId}:`, err);
    }
  }

  return expired;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Cloud Function entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C7: Main inactivity scheduler — runs every 30 minutes.
 *
 * Executes in order:
 *   1. Expire inactive chats (token return via C3 releaseReservation)
 *   2. Release held creator earnings (C4 releaseHeldEarnings)
 *   3. Expire stale rate proposals
 *   4. Expire stale end proposals
 *
 * All failures are caught per-item so one failure doesn't abort the run.
 */
export const c7_inactivityScheduler = onSchedule(
  {
    schedule:       SCHEDULE_EXPRESSION,
    timeoutSeconds: SCHEDULER_TIMEOUT_SECONDS,
    retryCount:     1,
  },
  async (_event) => {
    console.log('[C7] Inactivity scheduler starting');

    const [chatsExpired, earningsResult, rateProposalsExpired, endProposalsExpired] =
      await Promise.allSettled([
        expireInactiveChats(),
        releaseEarningsForEligibleCreators(),
        expirePendingRateProposals(),
        expirePendingEndProposals(),
      ]);

    const chatsCount = chatsExpired.status === 'fulfilled' ? chatsExpired.value : 0;
    const earningsVal = earningsResult.status === 'fulfilled'
      ? earningsResult.value
      : { processed: 0, tokensReleased: 0 };
    const rateCount = rateProposalsExpired.status === 'fulfilled' ? rateProposalsExpired.value : 0;
    const endCount  = endProposalsExpired.status === 'fulfilled' ? endProposalsExpired.value : 0;

    console.log('[C7] Scheduler complete', {
      chatsExpired:          chatsCount,
      creatorsReleased:      earningsVal.processed,
      tokensReleased:        earningsVal.tokensReleased,
      rateProposalsExpired:  rateCount,
      endProposalsExpired:   endCount,
    });

    // Log any failures
    [chatsExpired, earningsResult, rateProposalsExpired, endProposalsExpired].forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[C7] Task ${i} failed:`, r.reason);
      }
    });
  },
);

/**
 * C7: Standalone earning hold release — can be triggered on-demand
 * in addition to the scheduler (e.g., when a creator explicitly requests a payout).
 */
export async function triggerEarningHoldRelease(creatorId: string): Promise<{
  tokensReleased: number;
}> {
  const result = await releaseHeldEarnings(creatorId);
  return { tokensReleased: result.tokensReleased };
}
