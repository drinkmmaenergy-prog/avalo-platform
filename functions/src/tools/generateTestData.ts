/**
 * Synthetic Test Data Generator
 *
 * Seeds Firestore with realistic test data:
 * - 20 users (10F / 10M)
 * - 30 chats with billing
 * - 15 transactions
 * - 5 AI subscriptions
 * - 5 calendar bookings
 * - 3 AML flags
 */

import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Generate test data callable
 * Admin only
 */
export const generateTestDataCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check if user is admin
    const userDoc = await db.collection("users").doc(uid).get();
    const roles = userDoc.data()?.roles || {};
    if (!roles.admin) {
      throw new HttpsError("permission-denied", "Only admins can generate test data");
    }

    try {
      console.log("Generating test data...");

      // Generate users
      const userIds = await generateUsers();
      console.log(`Generated ${userIds.length} users`);

      // Generate chats
      const chatIds = await generateChats(userIds);
      console.log(`Generated ${chatIds.length} chats`);

      // Generate transactions
      const txIds = await generateTransactions(userIds);
      console.log(`Generated ${txIds.length} transactions`);

      // Generate AI subscriptions
      const subIds = await generateAISubscriptions(userIds.slice(0, 5));
      console.log(`Generated ${subIds.length} AI subscriptions`);

      // Generate calendar bookings
      const bookingIds = await generateCalendarBookings(userIds);
      console.log(`Generated ${bookingIds.length} calendar bookings`);

      // Generate AML flags
      const flagIds = await generateAMLFlags(userIds.slice(0, 3));
      console.log(`Generated ${flagIds.length} AML flags`);

      // Log to engine logs
      await logEngineEvent("tools", "test_data_generated", {
        users: userIds.length,
        chats: chatIds.length,
        transactions: txIds.length,
        subscriptions: subIds.length,
        bookings: bookingIds.length,
        amlFlags: flagIds.length,
      });

      return {
        success: true,
        summary: {
          users: userIds.length,
          chats: chatIds.length,
          transactions: txIds.length,
          subscriptions: subIds.length,
          bookings: bookingIds.length,
          amlFlags: flagIds.length,
        },
      };
    } catch (error: any) {
      console.error("Error generating test data:", error);
      throw new HttpsError("internal", `Failed to generate test data: ${error.message}`);
    }
  }
);

/**
 * Generate 20 test users (10F / 10M)
 */
async function generateUsers(): Promise<string[]> {
  const userIds: string[] = [];

  const femaleNames = [
    "Alice", "Barbara", "Caroline", "Diana", "Emma",
    "Fiona", "Grace", "Hannah", "Isabel", "Julia",
  ];

  const maleNames = [
    "Adam", "Benjamin", "Charles", "David", "Ethan",
    "Frank", "George", "Henry", "Ian", "Jack",
  ];

  // Generate female users
  for (let i = 0; i < 10; i++) {
    const userId = `test_female_${i + 1}`;
    await db.collection("users").doc(userId).set({
      name: femaleNames[i],
      gender: "female",
      age: 20 + i * 2,
      birthYear: new Date().getFullYear() - (20 + i * 2),
      bio: `Test user ${femaleNames[i]}. Loves travel and coffee.`,
      photos: [`https://i.pravatar.cc/300?img=${i + 1}`],
      location: {
        latitude: 52.2297 + (Math.random() - 0.5) * 0.1,
        longitude: 21.0122 + (Math.random() - 0.5) * 0.1,
        city: "Warsaw",
        country: "Poland",
      },
      verification: {
        status: i < 5 ? "approved" : "pending",
        verifiedAt: i < 5 ? Timestamp.now() : null,
      },
      wallet: {
        balance: 500 + i * 100,
        spent: i * 50,
        earned: i * 100,
      },
      roles: {},
      banned: false,
      createdAt: Timestamp.fromMillis(Date.now() - (10 - i) * 24 * 60 * 60 * 1000),
      updatedAt: Timestamp.now(),
    });
    userIds.push(userId);
  }

  // Generate male users
  for (let i = 0; i < 10; i++) {
    const userId = `test_male_${i + 1}`;
    await db.collection("users").doc(userId).set({
      name: maleNames[i],
      gender: "male",
      age: 22 + i * 2,
      birthYear: new Date().getFullYear() - (22 + i * 2),
      bio: `Test user ${maleNames[i]}. Enjoys sports and music.`,
      photos: [`https://i.pravatar.cc/300?img=${i + 20}`],
      location: {
        latitude: 52.2297 + (Math.random() - 0.5) * 0.1,
        longitude: 21.0122 + (Math.random() - 0.5) * 0.1,
        city: "Warsaw",
        country: "Poland",
      },
      verification: {
        status: i < 5 ? "approved" : "pending",
        verifiedAt: i < 5 ? Timestamp.now() : null,
      },
      wallet: {
        balance: 400 + i * 100,
        spent: i * 60,
        earned: i * 80,
      },
      roles: {},
      banned: false,
      createdAt: Timestamp.fromMillis(Date.now() - (10 - i) * 24 * 60 * 60 * 1000),
      updatedAt: Timestamp.now(),
    });
    userIds.push(userId);
  }

  return userIds;
}

/**
 * Generate 30 test chats
 */
async function generateChats(userIds: string[]): Promise<string[]> {
  const chatIds: string[] = [];

  for (let i = 0; i < 30; i++) {
    const chatId = `test_chat_${i + 1}`;
    const user1 = userIds[i % userIds.length];
    const user2 = userIds[(i + 1) % userIds.length];

    const depositPaid = i < 20; // 20 chats with deposit
    const escrow = depositPaid ? 65 : 0;
    const platformFee = depositPaid ? 35 : 0;

    await db.collection("chats").doc(chatId).set({
      chatId,
      participants: [user1, user2],
      createdBy: user1,
      depositPaid,
      escrow,
      platformFee,
      totalCost: 0,
      messageCount: Math.floor(Math.random() * 50),
      freeMessagesRemaining: depositPaid ? 0 : 3,
      createdAt: Timestamp.fromMillis(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
      updatedAt: Timestamp.now(),
    });

    chatIds.push(chatId);

    // Add some messages
    const msgCount = Math.floor(Math.random() * 10) + 1;
    for (let j = 0; j < msgCount; j++) {
      await db
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .doc()
        .set({
          senderId: j % 2 === 0 ? user1 : user2,
          content: `Test message ${j + 1}`,
          createdAt: Timestamp.fromMillis(Date.now() - (30 - i) * 24 * 60 * 60 * 1000 + j * 60000),
        });
    }
  }

  return chatIds;
}

/**
 * Generate 15 test transactions
 */
async function generateTransactions(userIds: string[]): Promise<string[]> {
  const txIds: string[]  = [];

  const types = [
    "token_purchase",
    "chat_payment",
    "chat_earned",
    "tip_sent",
    "tip_received",
    "calendar_booking",
    "live_tip",
    "refund",
  ];

  for (let i = 0; i < 15; i++) {
    const txId = `test_tx_${i + 1}`;
    const userId = userIds[i % userIds.length];
    const type = types[i % types.length];

    let amount = 0;
    if (type.includes("purchase")) amount = 100 + i * 50;
    else if (type.includes("payment") || type.includes("sent") || type.includes("booking")) amount = -(50 + i * 10);
    else if (type.includes("earned") || type.includes("received")) amount = 40 + i * 8;
    else if (type === "refund") amount = 30 + i * 5;

    await db.collection("transactions").doc(txId).set({
      txId,
      type,
      uid: userId,
      amount,
      recipientId: type.includes("earned") || type.includes("received") ? userIds[(i + 1) % userIds.length] : undefined,
      createdAt: Timestamp.fromMillis(Date.now() - (15 - i) * 24 * 60 * 60 * 1000),
    });

    txIds.push(txId);
  }

  return txIds;
}

/**
 * Generate 5 AI subscriptions
 */
async function generateAISubscriptions(userIds: string[]): Promise<string[]> {
  const subIds: string[] = [];

  const tiers = ["free", "plus", "intimate", "creator", "plus"];

  for (let i = 0; i < 5; i++) {
    const subId = `test_sub_${i + 1}`;
    const userId = userIds[i];
    const tier = tiers[i];

    await db
      .collection("users")
      .doc(userId)
      .update({
        "aiSubscription.tier": tier,
        "aiSubscription.status": "active",
        "aiSubscription.startedAt": Timestamp.fromMillis(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
      });

    subIds.push(subId);
  }

  return subIds;
}

/**
 * Generate 5 calendar bookings (including 1 Royal female @ 3000 tokens)
 */
async function generateCalendarBookings(userIds: string[]): Promise<string[]> {
  const bookingIds: string[] = [];

  for (let i = 0; i < 5; i++) {
    const bookingId = `test_booking_${i + 1}`;
    const creatorId = userIds[i];
    const bookerId = userIds[i + 10];

    // Last booking is Royal female @ 3000 tokens
    const isRoyal = i === 4;
    const amount = isRoyal ? 3000 : 100 + i * 50;

    await db.collection("calendarBookings").doc(bookingId).set({
      bookingId,
      creatorId,
      bookerId,
      amount,
      escrow: Math.floor(amount * 0.8),
      platformFee: Math.floor(amount * 0.2),
      status: "confirmed",
      scheduledFor: Timestamp.fromMillis(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.fromMillis(Date.now() - (5 - i) * 24 * 60 * 60 * 1000),
    });

    bookingIds.push(bookingId);
  }

  return bookingIds;
}

/**
 * Generate 3 AML flags
 */
async function generateAMLFlags(userIds: string[]): Promise<string[]> {
  const flagIds: string[] = [];

  const flagTypes = ["structuring", "circular_transfer", "high_volume"];
  const severities = ["medium", "high", "low"];

  for (let i = 0; i < 3; i++) {
    const flagId = `test_aml_flag_${i + 1}`;
    const userId = userIds[i];

    await db.collection("amlFlags").doc(flagId).set({
      flagId,
      userId,
      flagType: flagTypes[i],
      severity: severities[i],
      details: `Test AML flag for ${flagTypes[i]}`,
      relatedTransactions: [`test_tx_${i + 1}`, `test_tx_${i + 2}`],
      amount: 500 + i * 200,
      detectedAt: Timestamp.fromMillis(Date.now() - i * 24 * 60 * 60 * 1000),
      reviewed: false,
    });

    flagIds.push(flagId);
  }

  return flagIds;
}

/**
 * Helper: Log engine event
 */
async function logEngineEvent(
  engine: string,
  action: string,
  metadata: Record<string, any>
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const logRef = db
    .collection("engineLogs")
    .doc(engine)
    .collection(today)
    .doc();

  await logRef.set({
    action,
    metadata,
    timestamp: FieldValue.serverTimestamp(),
  });
}


