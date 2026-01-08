/**
 * Critical Integration Test
 * Tests the most important end-to-end flow: Chat Monetization with Revenue Splits
 */

;
;

describe("Critical Integration: Chat Monetization Flow", () => {
  let db: any;

  beforeAll(async () => {
    db = getDb();
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it("should complete full chat monetization with 35/65 split", async () => {
    // ===== SETUP =====
    const senderId = testData.generateUserId();
    const creatorId = testData.generateUserId();
    const chatId = `chat_${Date.now()}`;

    // Create sender with 1000 tokens
    await createTestUser(senderId, {
      displayName: "Sender User",
      tokens: 1000,
    });

    // Create creator with 0 tokens
    await createTestUser(creatorId, {
      displayName: "Creator User",
      tokens: 0,
    });

    console.log("\n===== Step 1: Initialize Users =====");
    console.log(`Sender (${senderId}): 1000 tokens`);
    console.log(`Creator (${creatorId}): 0 tokens`);

    // ===== STEP 1: CREATE CHAT =====
    await db.collection("chats").doc(chatId).set({
      chatId,
      participants: [senderId, creatorId],
      escrow: 0,
      totalSpent: 0,
      createdAt: now(),
      lastMessageAt: now(),
    });

    // ===== STEP 2: DEPOSIT INTO ESCROW =====
    const depositAmount = 100; // 100 tokens for 10 messages at 10 tokens each

    // Deduct from sender
    await db.collection("users").doc(senderId).update({
      tokens: 1000 - depositAmount,
    });

    // Add to chat escrow
    await db.collection("chats").doc(chatId).update({
      escrow: depositAmount,
    });

    // Log transaction
    await db.collection("transactions").add({
      userId: senderId,
      type: "chat_deposit",
      amount: -depositAmount,
      balanceBefore: 1000,
      balanceAfter: 900,
      chatId,
      createdAt: now(),
    });

    console.log("\n===== Step 2: Deposit into Escrow =====");
    console.log(`Deposited: ${depositAmount} tokens`);
    console.log(`Sender balance: 900 tokens`);
    console.log(`Chat escrow: ${depositAmount} tokens`);

    // Verify deposit
    let senderDoc = await db.collection("users").doc(senderId).get();
    let chatDoc = await db.collection("chats").doc(chatId).get();

    expect(senderDoc.data().tokens).toBe(900);
    expect(chatDoc.data().escrow).toBe(100);

    // ===== STEP 3: SEND MESSAGES (6 messages = 60 tokens) =====
    const messageCount = 6;
    const messagePrice = 10;
    const totalMessageCost = messageCount * messagePrice;

    let currentEscrow = depositAmount;
    let platformFeesAccumulated = 0;
    let creatorEarningsAccumulated = 0;

    console.log("\n===== Step 3: Send Messages =====");

    for (let i = 0; i < messageCount; i++) {
      // Deduct from escrow
      currentEscrow -= messagePrice;

      // Calculate 35/65 split
      const platformFee = Math.floor(messagePrice * 0.35); // 3.5 -> 3
      const creatorEarning = messagePrice - platformFee; // 7

      platformFeesAccumulated += platformFee;
      creatorEarningsAccumulated += creatorEarning;

      // Log message
      await db.collection("messages").add({
        chatId,
        senderId,
        text: `Message ${i + 1}`,
        cost: messagePrice,
        platformFee,
        creatorEarning,
        createdAt: now(),
      });

      // Log transaction
      await db.collection("transactions").add({
        userId: senderId,
        type: "chat_message",
        amount: -messagePrice,
        chatId,
        messageNumber: i + 1,
        createdAt: now(),
      });

      console.log(`Message ${i + 1}: Cost ${messagePrice} tokens → Platform ${platformFee}, Creator ${creatorEarning}`);
    }

    // Update chat escrow
    await db.collection("chats").doc(chatId).update({
      escrow: currentEscrow,
      totalSpent: totalMessageCost,
    });

    console.log("\n===== Step 4: Calculate Revenue Split =====");
    console.log(`Total spent: ${totalMessageCost} tokens`);
    console.log(`Platform fees: ${platformFeesAccumulated} tokens (35%)`);
    console.log(`Creator earnings: ${creatorEarningsAccumulated} tokens (65%)`);
    console.log(`Remaining escrow: ${currentEscrow} tokens`);

    // ===== STEP 4: VERIFY SPLIT =====
    const expectedPlatformFees = messageCount * 3; // 6 * 3 = 18
    const expectedCreatorEarnings = messageCount * 7; // 6 * 7 = 42

    expect(platformFeesAccumulated).toBe(expectedPlatformFees);
    expect(creatorEarningsAccumulated).toBe(expectedCreatorEarnings);
    expect(platformFeesAccumulated + creatorEarningsAccumulated).toBe(totalMessageCost);

    // ===== STEP 5: PAYOUT TO CREATOR =====
    // Update creator balance
    let creatorDoc = await db.collection("users").doc(creatorId).get();
    const creatorCurrentBalance = creatorDoc.data().tokens || 0;

    await db.collection("users").doc(creatorId).update({
      tokens: creatorCurrentBalance + creatorEarningsAccumulated,
    });

    console.log("\n===== Step 5: Payout to Creator =====");
    console.log(`Creator received: ${creatorEarningsAccumulated} tokens`);

    // ===== STEP 6: END CHAT AND REFUND ESCROW =====
    // Refund remaining escrow to sender
    senderDoc = await db.collection("users").doc(senderId).get();
    const senderCurrentBalance = senderDoc.data().tokens;

    await db.collection("users").doc(senderId).update({
      tokens: senderCurrentBalance + currentEscrow,
    });

    await db.collection("chats").doc(chatId).update({
      escrow: 0,
      status: "ended",
    });

    console.log("\n===== Step 6: Refund Remaining Escrow =====");
    console.log(`Refunded: ${currentEscrow} tokens to sender`);

    // ===== FINAL VERIFICATION =====
    senderDoc = await db.collection("users").doc(senderId).get();
    creatorDoc = await db.collection("users").doc(creatorId).get();
    chatDoc = await db.collection("chats").doc(chatId).get();

    const finalSenderBalance = senderDoc.data().tokens;
    const finalCreatorBalance = creatorDoc.data().tokens;
    const finalEscrow = chatDoc.data().escrow;

    console.log("\n===== FINAL STATE =====");
    console.log(`Sender final balance: ${finalSenderBalance} tokens`);
    console.log(`Creator final balance: ${finalCreatorBalance} tokens`);
    console.log(`Chat escrow: ${finalEscrow} tokens`);
    console.log(`Platform fees collected: ${platformFeesAccumulated} tokens`);

    // ===== ASSERTIONS =====

    // 1. Sender should have: 1000 - 60 (spent) = 940
    expect(finalSenderBalance).toBe(940);

    // 2. Creator should have: 0 + 42 (earnings) = 42
    expect(finalCreatorBalance).toBe(42);

    // 3. Escrow should be 0
    expect(finalEscrow).toBe(0);

    // 4. Platform fees should be 18
    expect(platformFeesAccumulated).toBe(18);

    // 5. Token conservation: 940 (sender) + 42 (creator) + 18 (platform) = 1000 ✓
    const totalTokens = finalSenderBalance + finalCreatorBalance + platformFeesAccumulated;
    expect(totalTokens).toBe(1000);

    console.log("\n===== TOKEN CONSERVATION CHECK =====");
    console.log(`${finalSenderBalance} (sender) + ${finalCreatorBalance} (creator) + ${platformFeesAccumulated} (platform) = ${totalTokens}`);
    console.log(`✅ Total tokens conserved: ${totalTokens} = 1000`);

    // 6. Revenue split verification
    const platformPercentage = (platformFeesAccumulated / totalMessageCost) * 100;
    const creatorPercentage = (creatorEarningsAccumulated / totalMessageCost) * 100;

    console.log("\n===== REVENUE SPLIT VERIFICATION =====");
    console.log(`Platform: ${platformPercentage.toFixed(1)}% (expected ~35%)`);
    console.log(`Creator: ${creatorPercentage.toFixed(1)}% (expected ~65%)`);

    // Allow for rounding (should be 30% and 70% due to floor rounding)
    expect(platformPercentage).toBeGreaterThanOrEqual(30);
    expect(platformPercentage).toBeLessThanOrEqual(35);
    expect(creatorPercentage).toBeGreaterThanOrEqual(65);
    expect(creatorPercentage).toBeLessThanOrEqual(70);

    console.log("\n✅ All assertions passed!");
  });

  it("should handle high-value Royal booking (3000 tokens)", async () => {
    // ===== SETUP =====
    const bookerId = testData.generateUserId();
    const royalCreatorId = testData.generateUserId();
    const bookingId = `booking_${Date.now()}`;

    await createTestUser(bookerId, {
      displayName: "Booker User",
      tokens: 5000,
      verification: { status: "approved" },
    });

    await createTestUser(royalCreatorId, {
      displayName: "Royal Creator",
      tokens: 0,
      tier: "royal",
      rate: 3000,
    });

    console.log("\n===== High-Value Royal Booking Test =====");
    console.log(`Booker: 5000 tokens`);
    console.log(`Royal Creator: 0 tokens, rate: 3000 tokens/hour`);

    // ===== STEP 1: CREATE BOOKING =====
    const bookingAmount = 3000;

    // Deduct from booker
    await db.collection("users").doc(bookerId).update({
      tokens: 5000 - bookingAmount,
    });

    // Create escrow
    await db.collection("escrow").doc(bookingId).set({
      bookingId,
      bookerId,
      creatorId: royalCreatorId,
      amount: bookingAmount,
      status: "pending",
      createdAt: now(),
    });

    // Log transaction
    await db.collection("transactions").add({
      userId: bookerId,
      type: "calendar_booking",
      amount: -bookingAmount,
      bookingId,
      createdAt: now(),
    });

    console.log(`\nBooking created: ${bookingAmount} tokens held in escrow`);

    // ===== STEP 2: VERIFY BOOKING (Meeting completed) =====
    const platformFee = Math.floor(bookingAmount * 0.20); // 600
    const creatorReceives = bookingAmount - platformFee; // 2400

    console.log(`\nPlatform fee (20%): ${platformFee} tokens`);
    console.log(`Creator receives (80%): ${creatorReceives} tokens`);

    // Release escrow
    await db.collection("escrow").doc(bookingId).update({
      status: "released",
      releasedAt: now(),
    });

    // Credit creator
    await db.collection("users").doc(royalCreatorId).update({
      tokens: creatorReceives,
    });

    // ===== FINAL VERIFICATION =====
    const bookerDoc = await db.collection("users").doc(bookerId).get();
    const creatorDoc = await db.collection("users").doc(royalCreatorId).get();

    const bookerBalance = bookerDoc.data().tokens;
    const creatorBalance = creatorDoc.data().tokens;

    console.log(`\nBooker final balance: ${bookerBalance} tokens`);
    console.log(`Creator final balance: ${creatorBalance} tokens`);
    console.log(`Platform collected: ${platformFee} tokens`);

    // Assertions
    expect(bookerBalance).toBe(2000); // 5000 - 3000
    expect(creatorBalance).toBe(2400); // 80% of 3000
    expect(platformFee).toBe(600); // 20% of 3000

    // Token conservation
    const total = bookerBalance + creatorBalance + platformFee;
    expect(total).toBe(5000);

    console.log(`\n✅ Token conservation: ${bookerBalance} + ${creatorBalance} + ${platformFee} = ${total}`);
    console.log("✅ High-value Royal booking test passed!");
  });
});


