/**
 * F1 — FAN MESSAGE NO-DEBIT INVARIANT TESTS
 *
 * Proves all five canonical rules required by the F1 hardening directive:
 *
 *   F1-R1: fan message NEVER debits the consumer wallet (wallets/{uid}.balance)
 *   F1-R2: fan message NEVER decrements reservedTokens
 *   F1-R3: fan message NEVER creates a creator earning event
 *   F1-R4: fan message NEVER creates a paid billingEvents document
 *   F1-R5: free-allowance counter decrements only after message delivery
 *           (and only in FREE_ACTIVE state)
 *
 * Additionally:
 *   F1-R6: paid creator response (deliverPaidResponse) is the ONLY chat
 *           function that may debit/earn — and it does so exactly once
 *           per idempotency key
 *
 * These run against the Firestore emulator.  Start it before running:
 *   firebase emulators:start --only firestore
 * or use:
 *   npm run test:emulator
 *
 * @module f1-fan-message-no-debit.integration.test
 */

process.env.FUNCTIONS_EMULATOR   = 'true';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
process.env.GCLOUD_PROJECT        = 'demo-avalo';

import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuid } from 'uuid';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-avalo' });
}

const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string { return uuid(); }

/**
 * Seed a wallet document for a user.
 */
async function seedWallet(uid: string, balance: number, reservedTokens = 0): Promise<void> {
  await db.collection('wallets').doc(uid).set({
    userId: uid,
    balance,
    reservedTokens,
    spent: 0,
    earned: 0,
    pending: 0,
    frozen: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Seed a chat document.
 */
async function seedChat(
  chatId: string,
  params: {
    fanId: string;
    creatorId: string;
    state: string;
    freeMessagesRemaining?: Record<string, number>;
    reservationId?: string;
    finalRateTokens?: number;
  },
): Promise<void> {
  await db.collection('chats').doc(chatId).set({
    chatId,
    fanId:                   params.fanId,
    creatorId:               params.creatorId,
    state:                   params.state,
    freeMessagesRemaining:   params.freeMessagesRemaining ?? {},
    reservationId:           params.reservationId ?? null,
    finalRateTokens:         params.finalRateTokens ?? 5,
    remainingReservedTokens: 50,
    paidResponseCount:       0,
    createdAt:               Timestamp.now(),
    updatedAt:               Timestamp.now(),
    lastMessageAt:           Timestamp.now(),
  });
}

/**
 * Seed a reservation document.
 */
async function seedReservation(
  reservationId: string,
  fanId: string,
  creatorId: string,
  remainingTokens: number,
  finalRateTokens: number,
): Promise<void> {
  await db.collection('chatReservations').doc(reservationId).set({
    reservationId,
    chatId:          'chat_' + reservationId,
    fanId,
    creatorId,
    depositTokens:   remainingTokens + (finalRateTokens * 3),
    remainingTokens,
    consumedTokens:  0,
    finalRateTokens,
    status:          'ACTIVE',
    createdAt:       Timestamp.now(),
    updatedAt:       Timestamp.now(),
  });
}

/**
 * Return the wallet document for a user.
 */
async function getWallet(uid: string) {
  const snap = await db.collection('wallets').doc(uid).get();
  return snap.exists ? snap.data()! : null;
}

/**
 * Count billing events documents for a chat (via query on chatId field).
 */
async function countBillingEvents(chatId: string): Promise<number> {
  const q = await db.collection('billingEvents').where('chatId', '==', chatId).get();
  return q.size;
}

/**
 * Count creator earning ledger entries for a creator.
 */
async function countEarningLedger(creatorId: string): Promise<number> {
  const q = await db.collection('creatorEarningLedger').where('creatorId', '==', creatorId).get();
  return q.size;
}

/**
 * Get a message document.
 */
async function getMessage(chatId: string, messageId: string) {
  const snap = await db
    .collection('chats').doc(chatId)
    .collection('messages').doc(messageId).get();
  return snap.exists ? snap.data()! : null;
}

// ── Import the state machine functions under test ─────────────────────────────
// Use dynamic import so Jest sees them after emulator env vars are set.
import {
  deliverFreeMessage,
  deliverPaidResponse,
  FREE_MESSAGES_PER_USER,
} from '../../src/chat/canonicalChatStateMachineV3';

// ═════════════════════════════════════════════════════════════════════════════
// F1-R1 / F1-R2 / F1-R3 / F1-R4:
//   Fan message in FREE_ACTIVE — never touches wallet or earnings
// ═════════════════════════════════════════════════════════════════════════════

describe('F1-R1…R4 — deliverFreeMessage: no wallet or earning side-effects', () => {

  beforeEach(() => db.recursiveDelete(db.collection('wallets'))
    .catch(() => undefined));

  it('F1-R1: fan wallet balance unchanged after fan message in FREE_ACTIVE', async () => {
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();

    await seedWallet(fanId, 200, 0);
    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hello creator' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    const wallet = await getWallet(fanId);
    // F1-R1: balance must be unchanged
    expect(wallet?.balance).toBe(200);
    // F1-R2: reservedTokens must be unchanged (still 0)
    expect(wallet?.reservedTokens ?? 0).toBe(0);
  });

  it('F1-R3: no creatorEarningAccounts document created after fan message', async () => {
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();

    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hello' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    // F1-R3: no earning account created
    const earningSnap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
    expect(earningSnap.exists).toBe(false);

    // F1-R3 (ledger): no earning ledger entry
    expect(await countEarningLedger(creatorId)).toBe(0);
  });

  it('F1-R4: no billingEvents document created after fan message', async () => {
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();

    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hello' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    // F1-R4: no billing event
    expect(await countBillingEvents(chatId)).toBe(0);
  });

  it('F1-R4: message document has billed=false and tokensCharged=0', async () => {
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();

    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hello' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    const msg = await getMessage(chatId, messageId);
    expect(msg).not.toBeNull();
    expect(msg?.billed).toBe(false);
    expect(msg?.tokensCharged).toBe(0);
  });

  it('F1-R1: fan wallet balance unchanged after fan message in PAID_ACTIVE', async () => {
    // In PAID_ACTIVE state, fan messages are still free — only creator responses are billed
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();
    const resId      = 'res_' + newId();

    await seedWallet(fanId, 100, 50);
    await seedReservation(resId, fanId, creatorId, 50, 5);
    await seedChat(chatId, {
      fanId, creatorId, state: 'PAID_ACTIVE',
      reservationId: resId, finalRateTokens: 5,
    });

    // Fan message in PAID_ACTIVE goes through deliverFreeMessage
    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Question for creator' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: false,  // no free counter in PAID_ACTIVE
    });

    const wallet = await getWallet(fanId);
    // F1-R1: balance must remain exactly 100 (was already debited at reservation time)
    expect(wallet?.balance).toBe(100);
    // F1-R2: reservedTokens must remain exactly 50 (only decremented by deliverPaidResponse)
    expect(wallet?.reservedTokens).toBe(50);
    // F1-R4: no billing event
    expect(await countBillingEvents(chatId)).toBe(0);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F1-R5: free-allowance counter decrements only after delivery
// ═════════════════════════════════════════════════════════════════════════════

describe('F1-R5 — free counter decrements atomically on delivery, not before', () => {

  it('counter decrements by 1 after first fan message, not before', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const chatId    = 'chat_' + newId();
    const messageId = 'msg_' + newId();

    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    // Before delivery: counter is FREE_MESSAGES_PER_USER
    const before = await db.collection('chats').doc(chatId).get();
    expect(before.data()?.freeMessagesRemaining?.[fanId]).toBe(FREE_MESSAGES_PER_USER);

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hi' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    // After delivery: counter decremented by exactly 1
    const after = await db.collection('chats').doc(chatId).get();
    expect(after.data()?.freeMessagesRemaining?.[fanId]).toBe(FREE_MESSAGES_PER_USER - 1);
  });

  it('counter does NOT decrement when decrementFreeCounter=false (PAID_ACTIVE fan message)', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const chatId    = 'chat_' + newId();
    const messageId = 'msg_' + newId();

    await seedChat(chatId, {
      fanId, creatorId, state: 'PAID_ACTIVE',
      freeMessagesRemaining: { [fanId]: 1 },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Paid session question' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: false,
    });

    // Counter unchanged (PAID_ACTIVE fan messages don't consume free allowance)
    const chat = await db.collection('chats').doc(chatId).get();
    expect(chat.data()?.freeMessagesRemaining?.[fanId]).toBe(1);
  });

  it('idempotent: delivering same fan message twice does not double-decrement counter', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const chatId    = 'chat_' + newId();
    const messageId = 'msg_' + newId();   // same ID both calls

    await seedChat(chatId, {
      fanId, creatorId, state: 'FREE_ACTIVE',
      freeMessagesRemaining: { [fanId]: FREE_MESSAGES_PER_USER },
    });

    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hi' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    // Retry same messageId — should be no-op (message already exists)
    await deliverFreeMessage({
      chatId, senderId: fanId, senderRole: 'FAN',
      content: { type: 'TEXT', text: 'Hi' },
      messageId, idempotencyKey: messageId,
      decrementFreeCounter: true,
    });

    // Counter decremented only once
    const chat = await db.collection('chats').doc(chatId).get();
    expect(chat.data()?.freeMessagesRemaining?.[fanId]).toBe(FREE_MESSAGES_PER_USER - 1);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F1-R6: deliverPaidResponse is the SOLE billing function; idempotent
// ═════════════════════════════════════════════════════════════════════════════

describe('F1-R6 — deliverPaidResponse: sole billing path, correct amounts, idempotent', () => {

  it('creator response charges fan reservedTokens and credits creator earning — no balance change', async () => {
    const fanId      = newId();
    const creatorId  = newId();
    const chatId     = 'chat_' + newId();
    const messageId  = 'msg_' + newId();
    const resId      = 'res_' + newId();
    const ikey       = `${chatId}_${messageId}`;
    const rate       = 5;

    await seedWallet(fanId, 100, 50);      // balance=100, reservedTokens=50
    await seedReservation(resId, fanId, creatorId, 50, rate);
    await seedChat(chatId, {
      fanId, creatorId, state: 'PAID_ACTIVE',
      reservationId: resId, finalRateTokens: rate,
    });

    await deliverPaidResponse({
      chatId, fanId, creatorId,
      reservationId: resId,
      finalRateTokens: rate,
      multiplier: 1,
      messageId, content: { type: 'TEXT', text: 'Paid reply' },
      idempotencyKey: ikey,
    });

    const fanWallet = await getWallet(fanId);
    // Balance unchanged — was already debited at reservation; only reservedTokens changes
    expect(fanWallet?.balance).toBe(100);
    // reservedTokens decremented by rate
    expect(fanWallet?.reservedTokens).toBe(50 - rate);

    // Creator earning account has pendingEarningTokens = rate
    const earningSnap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
    expect(earningSnap.exists).toBe(true);
    expect(earningSnap.data()?.pendingEarningTokens).toBe(rate);

    // Exactly one billing event
    expect(await countBillingEvents(chatId)).toBe(1);

    // Billing event: payerTokensCharged === creatorEarningTokens (canonical §0.3)
    const evSnap = await db.collection('billingEvents').doc(ikey).get();
    expect(evSnap.data()?.payerTokensCharged).toBe(rate);
    expect(evSnap.data()?.creatorEarningTokens).toBe(rate);
  });

  it('payerTokensCharged === creatorEarningTokens (canonical rule: no delivery split)', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const chatId    = 'chat_' + newId();
    const messageId = 'msg_' + newId();
    const resId     = 'res_' + newId();
    const rate      = 10;
    const ikey      = `${chatId}_${messageId}`;

    await seedWallet(fanId, 200, 100);
    await seedReservation(resId, fanId, creatorId, 100, rate);
    await seedChat(chatId, {
      fanId, creatorId, state: 'PAID_ACTIVE',
      reservationId: resId, finalRateTokens: rate,
    });

    await deliverPaidResponse({
      chatId, fanId, creatorId,
      reservationId: resId,
      finalRateTokens: rate,
      multiplier: 1,
      messageId, content: { type: 'TEXT', text: 'Answer' },
      idempotencyKey: ikey,
    });

    const ev = (await db.collection('billingEvents').doc(ikey).get()).data();
    expect(ev?.payerTokensCharged).toBe(ev?.creatorEarningTokens);
    // No 80/20 split at delivery
    expect(ev?.payerTokensCharged).toBe(rate);
  });

  it('duplicate creator response (same idempotencyKey) creates zero additional billing events', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const chatId    = 'chat_' + newId();
    const messageId = 'msg_' + newId();
    const resId     = 'res_' + newId();
    const rate      = 5;
    const ikey      = `${chatId}_${messageId}`;

    await seedWallet(fanId, 100, 50);
    await seedReservation(resId, fanId, creatorId, 50, rate);
    await seedChat(chatId, {
      fanId, creatorId, state: 'PAID_ACTIVE',
      reservationId: resId, finalRateTokens: rate,
    });

    // First delivery
    await deliverPaidResponse({
      chatId, fanId, creatorId,
      reservationId: resId, finalRateTokens: rate, multiplier: 1,
      messageId, content: { type: 'TEXT', text: 'First' },
      idempotencyKey: ikey,
    });

    const afterFirst = {
      billingEvents: await countBillingEvents(chatId),
      ledger: await countEarningLedger(creatorId),
      reserved: (await getWallet(fanId))?.reservedTokens,
    };

    // Retry (network retry scenario)
    await deliverPaidResponse({
      chatId, fanId, creatorId,
      reservationId: resId, finalRateTokens: rate, multiplier: 1,
      messageId, content: { type: 'TEXT', text: 'First' },
      idempotencyKey: ikey,
    });

    // Nothing additional created
    expect(await countBillingEvents(chatId)).toBe(afterFirst.billingEvents);
    expect(await countEarningLedger(creatorId)).toBe(afterFirst.ledger);
    // Fan wallet unchanged from first delivery
    expect((await getWallet(fanId))?.reservedTokens).toBe(afterFirst.reserved);
  });

});
