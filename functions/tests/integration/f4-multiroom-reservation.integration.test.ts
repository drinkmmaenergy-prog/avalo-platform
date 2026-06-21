/**
 * F4 — MULTI-ROOM RESERVATION MODEL INVARIANT TESTS
 *
 * Proves all required properties from the F4 hardening directive:
 *
 *   F4-R1: room join is a participant escrow reservation, not an immediate creator earning
 *   F4-R2: generic room messages (fan OR creator) earn zero tokens
 *   F4-R3: Fan A's budget cannot be consumed by Fan B's actions
 *   F4-R4: room leave refunds only the leaving participant's remaining reservation
 *   F4-R5: room close refunds each remaining unearned participant exactly once
 *   F4-R6: entry reservation is released on ban/kick if creator has not yet earned it
 *   F4-R7: priority question earns once only after answer delivery (not before)
 *   F4-R8: duplicate join (same idempotency key) makes no additional charge
 *
 * Requires Firestore emulator. Start with:
 *   firebase emulators:start --only firestore
 * or:
 *   npm run test:emulator
 *
 * NOTE: requireVerifiedAdult and room billing state are mocked at the test-helper
 * layer (bypass age guard so tests don't need full Auth emulator).
 *
 * @module f4-multiroom-reservation.integration.test
 */

process.env.FUNCTIONS_EMULATOR     = 'true';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
process.env.GCLOUD_PROJECT          = 'demo-avalo';
// Skip age guard in tests — guarded by requireVerifiedAdult at the callable layer.
process.env.AVALO_SKIP_AGE_GUARD    = 'true';

import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuid } from 'uuid';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-avalo' });
}

const db = admin.firestore();

// ── Test helpers ──────────────────────────────────────────────────────────────

function newId(): string { return uuid(); }

async function seedWallet(uid: string, balance: number): Promise<void> {
  await db.collection('wallets').doc(uid).set({
    userId: uid, balance, reservedTokens: 0, spent: 0, earned: 0,
    pending: 0, frozen: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
}

async function getBalance(uid: string): Promise<number> {
  const snap = await db.collection('wallets').doc(uid).get();
  return snap.exists ? (snap.data()!.balance as number) : 0;
}

async function getEarningAccount(creatorId: string) {
  const snap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  return snap.exists ? snap.data()! : null;
}

/**
 * Seed a LIVE room document directly (bypasses createRoom/openRoom age guard).
 */
async function seedLiveRoom(params: {
  roomId:    string;
  creatorId: string;
  entryTokens: number;
}): Promise<void> {
  const { roomId, creatorId, entryTokens } = params;
  await db.collection('multi_rooms').doc(roomId).set({
    roomId,
    creatorId,
    title:               'Test Room',
    status:              'LIVE',
    entryTokens,
    maxParticipants:     null,
    participantCount:    0,
    creatorMessageCount: 0,
    escrowTotalTokens:   0,
    escrowEarnedTokens:  0,
    escrowReturnedTokens: 0,
    openedAt:            Timestamp.now(),
    createdAt:           Timestamp.now(),
    updatedAt:           Timestamp.now(),
  });
}

async function getRoomDoc(roomId: string) {
  return (await db.collection('multi_rooms').doc(roomId).get()).data();
}

async function getParticipant(roomId: string, userId: string) {
  const snap = await db.collection('multi_rooms').doc(roomId)
    .collection('participants').doc(userId).get();
  return snap.exists ? snap.data()! : null;
}

// ── Import functions under test ───────────────────────────────────────────────

// Jest module mock to bypass age guard (requireVerifiedAdult) in unit layer.
// In production, the callable wrapper enforces this; here we test billing logic.
jest.mock('../../src/compliance/ageGuard', () => ({
  requireVerifiedAdult: jest.fn().mockResolvedValue(undefined),
}));

import {
  joinRoom,
  leaveRoom,
  closeRoom,
  sendFanRoomMessage,
  deliverCreatorRoomMessage,
  sendPriorityQuestion,
  deliverPriorityAnswer,
  moderateParticipant,
  roomDocRef,
} from '../../src/rooms/canonicalMultiRoomV2';

// ═════════════════════════════════════════════════════════════════════════════
// F4-R1: join is a reservation, not an immediate creator earning
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R1 — joinRoom creates reservation, no creator earning at join time', () => {

  it('fan balance decremented by entry tokens on join', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });

    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    expect(await getBalance(fanId)).toBe(90);   // 100 - 10
  });

  it('no creatorEarningAccounts entry created at join time', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 5 });

    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // Creator earning account must NOT exist yet
    expect(await getEarningAccount(creatorId)).toBeNull();
  });

  it('participant document has earnedByCreator=false and correct reservedTokens', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 15;

    await seedWallet(fanId, 200);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });

    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    const p = await getParticipant(roomId, fanId);
    expect(p).not.toBeNull();
    expect(p!.reservedTokens).toBe(entry);
    expect(p!.earnedByCreator).toBe(false);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R8: duplicate join idempotency
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R8 — joinRoom: duplicate idempotency key makes no additional charge', () => {

  it('joining twice with same key deducts entry tokens only once', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const ikey      = newId();

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 10 });

    await joinRoom({ userId: fanId, roomId, idempotencyKey: ikey });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: ikey });   // retry

    expect(await getBalance(fanId)).toBe(90);   // deducted only once
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R2: fan messages earn zero
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R2 — fan messages earn zero; creator earning only on first creator message', () => {

  it('sendFanRoomMessage: no earning account created, fan balance unchanged', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 10 });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    const balanceBefore = await getBalance(fanId);

    await sendFanRoomMessage({
      userId: fanId, roomId,
      content: 'Hello creator!',
      idempotencyKey: newId(),
    });

    // F4-R2: balance unchanged (fan messages never charged)
    expect(await getBalance(fanId)).toBe(balanceBefore);
    // No creator earning
    expect(await getEarningAccount(creatorId)).toBeNull();
  });

  it('creator message delivery settles entry escrow to creator earning (first message only)', async () => {
    const fan1Id    = newId();
    const fan2Id    = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fan1Id, 100);
    await seedWallet(fan2Id, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });
    await joinRoom({ userId: fan1Id, roomId, idempotencyKey: newId() });
    await joinRoom({ userId: fan2Id, roomId, idempotencyKey: newId() });

    // Before first creator message: no earning
    expect(await getEarningAccount(creatorId)).toBeNull();

    // First creator message: settles both fans' entry escrow to creator
    await deliverCreatorRoomMessage({
      creatorId, roomId,
      content: 'Hello fans!',
      idempotencyKey: newId(),
    });

    const earning = await getEarningAccount(creatorId);
    expect(earning).not.toBeNull();
    // Both fans' entry tokens earned by creator (10 + 10 = 20)
    expect(earning!.pendingEarningTokens).toBe(entry * 2);

    // fans' participant docs updated
    const p1 = await getParticipant(roomId, fan1Id);
    const p2 = await getParticipant(roomId, fan2Id);
    expect(p1!.earnedByCreator).toBe(true);
    expect(p2!.earnedByCreator).toBe(true);
  });

  it('second creator message creates NO additional earning', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // First message — earns
    await deliverCreatorRoomMessage({
      creatorId, roomId,
      content: 'First message',
      idempotencyKey: newId(),
    });
    const earningAfterFirst = (await getEarningAccount(creatorId))!.pendingEarningTokens as number;

    // Second message — must NOT add additional earnings
    await deliverCreatorRoomMessage({
      creatorId, roomId,
      content: 'Second message',
      idempotencyKey: newId(),
    });
    const earningAfterSecond = (await getEarningAccount(creatorId))!.pendingEarningTokens as number;

    expect(earningAfterSecond).toBe(earningAfterFirst);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R3: Fan A cannot spend Fan B budget
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R3 — Fan A budget cannot be consumed by Fan B actions', () => {

  it('Fan B leaving does not affect Fan A wallet balance', async () => {
    const fanAId    = newId();
    const fanBId    = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanAId, 100);
    await seedWallet(fanBId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 10 });

    await joinRoom({ userId: fanAId, roomId, idempotencyKey: newId() });
    await joinRoom({ userId: fanBId, roomId, idempotencyKey: newId() });

    const fanABalanceBefore = await getBalance(fanAId);

    // Fan B leaves — should only refund Fan B
    await leaveRoom({ userId: fanBId, roomId, idempotencyKey: newId() });

    // Fan A balance must be unchanged
    expect(await getBalance(fanAId)).toBe(fanABalanceBefore);

    // Fan B refunded their 10 tokens
    expect(await getBalance(fanBId)).toBe(100);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R4: leave refunds only leaving participant's remainder
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R4 — leaveRoom: refunds only the leaving participant, not others', () => {

  it('leaving before first creator message: full entry refunded', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 10 });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    expect(await getBalance(fanId)).toBe(90);

    await leaveRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // Full entry refunded (earnedByCreator was false)
    expect(await getBalance(fanId)).toBe(100);
  });

  it('leaving after first creator message: no refund (entry already earned)', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 10 });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // Creator delivers first message — settles entry to creator earning
    await deliverCreatorRoomMessage({
      creatorId, roomId, content: 'Hi', idempotencyKey: newId(),
    });

    const balanceAfterSettle = await getBalance(fanId);

    await leaveRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // No additional refund — entry was already earned
    expect(await getBalance(fanId)).toBe(balanceAfterSettle);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R5: closeRoom refunds each unearned participant exactly once
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R5 — closeRoom: refunds each unearned participant exactly once', () => {

  it('three participants, no creator message: all three refunded on close', async () => {
    const fan1Id = newId(); const fan2Id = newId(); const fan3Id = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fan1Id, 100);
    await seedWallet(fan2Id, 100);
    await seedWallet(fan3Id, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });

    await joinRoom({ userId: fan1Id, roomId, idempotencyKey: newId() });
    await joinRoom({ userId: fan2Id, roomId, idempotencyKey: newId() });
    await joinRoom({ userId: fan3Id, roomId, idempotencyKey: newId() });

    await closeRoom({ creatorId, roomId, idempotencyKey: newId() });

    // All three refunded
    expect(await getBalance(fan1Id)).toBe(100);
    expect(await getBalance(fan2Id)).toBe(100);
    expect(await getBalance(fan3Id)).toBe(100);
  });

  it('creator delivered message before close: earned participants not refunded', async () => {
    const fan1Id = newId(); const fan2Id = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fan1Id, 100);
    await seedWallet(fan2Id, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });

    await joinRoom({ userId: fan1Id, roomId, idempotencyKey: newId() });
    await joinRoom({ userId: fan2Id, roomId, idempotencyKey: newId() });

    // Creator delivers — both fans' entry settled to creator
    await deliverCreatorRoomMessage({
      creatorId, roomId, content: 'Hi all!', idempotencyKey: newId(),
    });

    // Fan 2 leaves (no refund since earnedByCreator=true)
    await leaveRoom({ userId: fan2Id, roomId, idempotencyKey: newId() });

    const fan1BalanceBeforeClose = await getBalance(fan1Id);
    const fan2BalanceBeforeClose = await getBalance(fan2Id);

    await closeRoom({ creatorId, roomId, idempotencyKey: newId() });

    // Neither fan refunded — entry was already earned
    expect(await getBalance(fan1Id)).toBe(fan1BalanceBeforeClose);
    expect(await getBalance(fan2Id)).toBe(fan2BalanceBeforeClose);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R6: ban/kick releases unearned entry reservation
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R6 — ban/kick releases unearned entry reservation [F4 fix]', () => {

  it('banned participant before first creator message: entry refunded', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    expect(await getBalance(fanId)).toBe(90);

    await moderateParticipant({
      actorId: creatorId, roomId, targetUserId: fanId,
      action: 'BAN', idempotencyKey: newId(),
    });

    // F4-R6: entry reservation refunded on ban (earnedByCreator was false)
    expect(await getBalance(fanId)).toBe(100);
  });

  it('kicked participant after creator earned entry: no refund', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const entry     = 10;

    await seedWallet(fanId, 100);
    await seedLiveRoom({ roomId, creatorId, entryTokens: entry });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // First creator message — settles entry
    await deliverCreatorRoomMessage({
      creatorId, roomId, content: 'Hello', idempotencyKey: newId(),
    });

    const balanceAfterSettle = await getBalance(fanId);

    await moderateParticipant({
      actorId: creatorId, roomId, targetUserId: fanId,
      action: 'KICK', idempotencyKey: newId(),
    });

    // No additional refund — entry was already earned by creator
    expect(await getBalance(fanId)).toBe(balanceAfterSettle);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F4-R7: priority question earns once only after delivery
// ═════════════════════════════════════════════════════════════════════════════

describe('F4-R7 — priority question earns once only after delivery', () => {

  it('sending priority question debits fan but creates no earning yet', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();

    await seedWallet(fanId, 200);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 0 });
    // fan must be a participant even for 0-entry rooms
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    // SILVER question (no answer promise) — flat fee
    await sendPriorityQuestion({
      userId: fanId, roomId,
      question: 'What is your morning routine?',
      tier: 'SILVER',
      idempotencyKey: newId(),
    });

    // No earning yet — creator hasn't answered
    const earning = await getEarningAccount(creatorId);
    // Earning may be null or have 0 pendingEarningTokens
    expect(earning?.pendingEarningTokens ?? 0).toBe(0);
  });

  it('creator answering earns exactly once; re-answer attempt is idempotent', async () => {
    const fanId     = newId();
    const creatorId = newId();
    const roomId    = 'room_' + newId();
    const ikey      = newId();

    await seedWallet(fanId, 200);
    await seedLiveRoom({ roomId, creatorId, entryTokens: 0 });
    await joinRoom({ userId: fanId, roomId, idempotencyKey: newId() });

    const { questionId } = await sendPriorityQuestion({
      userId: fanId, roomId,
      question: 'Any plans for the weekend?',
      tier: 'SILVER',
      idempotencyKey: newId(),
    });

    // Creator answers
    await deliverPriorityAnswer({
      creatorId, roomId, questionId,
      answer: 'Yes, hiking!',
      idempotencyKey: ikey,
    });

    const earningAfterFirst = (await getEarningAccount(creatorId))!.pendingEarningTokens as number;
    expect(earningAfterFirst).toBeGreaterThan(0);

    // Retry with same idempotency key
    await deliverPriorityAnswer({
      creatorId, roomId, questionId,
      answer: 'Yes, hiking!',
      idempotencyKey: ikey,
    });

    // Earning must not have increased
    const earningAfterRetry = (await getEarningAccount(creatorId))!.pendingEarningTokens as number;
    expect(earningAfterRetry).toBe(earningAfterFirst);
  });

});
