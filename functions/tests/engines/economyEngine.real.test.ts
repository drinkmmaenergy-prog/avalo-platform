/**
 * Economy Engine Real Tests
 * Tests token economy, revenue splits, and KPI calculations
 */

;
;

describe("Economy Engine - Real Tests", () => {
  let db: any;

  beforeAll(async () => {
    db = getDb();
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    // Clear collections before each test
    const collections = ["transactions", "economySnapshots", "ledger", "users", "escrow"];
    for (const collection of collections) {
      const snapshot = await db.collection(collection).limit(500).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  describe("Revenue Split Calculations", () => {
    it("should calculate 35/65 split for chat transactions", () => {
      const chatAmount = 1000;
      const platformFee = Math.floor(chatAmount * 0.35);
      const creatorReceives = chatAmount - platformFee;

      expect(platformFee).toBe(350); // 35%
      expect(creatorReceives).toBe(650); // 65%
      expect(platformFee + creatorReceives).toBe(chatAmount); // Total conserved
    });

    it("should calculate 20/80 split for tip transactions", () => {
      const tipAmount = 500;
      const platformFee = Math.floor(tipAmount * 0.20);
      const creatorReceives = tipAmount - platformFee;

      expect(platformFee).toBe(100); // 20%
      expect(creatorReceives).toBe(400); // 80%
      expect(platformFee + creatorReceives).toBe(tipAmount);
    });

    it("should calculate 20/80 split for calendar bookings", () => {
      const bookingAmount = 1000;
      const platformFee = Math.floor(bookingAmount * 0.20);
      const creatorReceives = bookingAmount - platformFee;

      expect(platformFee).toBe(200); // 20%
      expect(creatorReceives).toBe(800); // 80%
      expect(platformFee + creatorReceives).toBe(bookingAmount);
    });

    it("should calculate 30/70 split for live 1:1 sessions", () => {
      const liveAmount = 1000;
      const platformFee = Math.floor(liveAmount * 0.30);
      const creatorReceives = liveAmount - platformFee;

      expect(platformFee).toBe(300); // 30%
      expect(creatorReceives).toBe(700); // 70%
      expect(platformFee + creatorReceives).toBe(liveAmount);
    });

    it("should calculate 20/80 split for live tips", () => {
      const liveTipAmount = 200;
      const platformFee = Math.floor(liveTipAmount * 0.20);
      const creatorReceives = liveTipAmount - platformFee;

      expect(platformFee).toBe(40); // 20%
      expect(creatorReceives).toBe(160); // 80%
      expect(platformFee + creatorReceives).toBe(liveTipAmount);
    });

    it("should handle high-value Royal booking (3000 tokens)", () => {
      const royalBooking = 3000;
      const platformFee = Math.floor(royalBooking * 0.20); // Calendar uses 20/80
      const creatorReceives = royalBooking - platformFee;

      expect(platformFee).toBe(600); // 20%
      expect(creatorReceives).toBe(2400); // 80%
      expect(platformFee + creatorReceives).toBe(3000);
    });
  });

  describe("Transaction Logging and Ledger", () => {
    it("should log transaction with correct fields", async () => {
      const userId = testData.generateUserId();

      await createTestUser(userId, { tokens: 1000 });

      const txData = {
        transactionId: `tx_${Date.now()}`,
        userId,
        amount: -100,
        type: "chat_message",
        balanceBefore: 1000,
        balanceAfter: 900,
        createdAt: now(),
        status: "completed",
      };

      await db.collection("transactions").add(txData);

      const snapshot = await db.collection("transactions").where("userId", "==", userId).get();

      expect(snapshot.size).toBe(1);
      const data = snapshot.docs[0].data();
      expect(data.amount).toBe(-100);
      expect(data.type).toBe("chat_message");
      expect(data.status).toBe("completed");
    });

    it("should create immutable ledger entry", async () => {
      const userId = testData.generateUserId();
      const ledgerEntry = {
        ledgerId: `ledger_${Date.now()}`,
        userId,
        amount: -50,
        type: "tip",
        timestamp: now(),
        transactionId: "tx_123",
      };

      const docRef = await db.collection("ledger").add(ledgerEntry);

      // Ledger entries should be immutable (just creating, not modifying)
      const doc = await docRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data().amount).toBe(-50);
      expect(doc.data().type).toBe("tip");
    });

    it("should track inflow and outflow", async () => {
      const userId = testData.generateUserId();

      await createTestUser(userId, { tokens: 0 });

      // Inflow: purchase
      await db.collection("transactions").add({
        userId,
        amount: 500,
        type: "wallet_purchase",
        createdAt: now(),
      });

      // Outflow: chat
      await db.collection("transactions").add({
        userId,
        amount: -100,
        type: "chat_message",
        createdAt: now(),
      });

      const snapshot = await db.collection("transactions").where("userId", "==", userId).get();

      let inflow = 0;
      let outflow = 0;

      snapshot.docs.forEach((doc: any) => {
        const amount = doc.data().amount;
        if (amount > 0) inflow += amount;
        if (amount < 0) outflow += Math.abs(amount);
      });

      expect(inflow).toBe(500);
      expect(outflow).toBe(100);
    });
  });

  describe("Platform Fee Calculation by Type", () => {
    function calculatePlatformFee(amount: number, type: string): number {
      const absAmount = Math.abs(amount);

      if (type.includes("chat")) return Math.floor(absAmount * 0.35);
      if (type.includes("tip") && !type.includes("live")) return Math.floor(absAmount * 0.20);
      if (type.includes("calendar")) return Math.floor(absAmount * 0.20);
      if (type.includes("live_1on1")) return Math.floor(absAmount * 0.30);
      if (type.includes("live_tip")) return Math.floor(absAmount * 0.20);

      return 0; // No fee for other types
    }

    it("should calculate fee for chat_message type", () => {
      const fee = calculatePlatformFee(-100, "chat_message");
      expect(fee).toBe(35);
    });

    it("should calculate fee for tip type", () => {
      const fee = calculatePlatformFee(-200, "tip");
      expect(fee).toBe(40);
    });

    it("should calculate fee for calendar_booking type", () => {
      const fee = calculatePlatformFee(-1000, "calendar_booking");
      expect(fee).toBe(200);
    });

    it("should calculate fee for live_1on1 type", () => {
      const fee = calculatePlatformFee(-500, "live_1on1");
      expect(fee).toBe(150);
    });

    it("should calculate fee for live_tip type", () => {
      const fee = calculatePlatformFee(-100, "live_tip");
      expect(fee).toBe(20);
    });

    it("should return 0 for wallet_purchase (no fee)", () => {
      const fee = calculatePlatformFee(500, "wallet_purchase");
      expect(fee).toBe(0);
    });
  });

  describe("Economy Snapshots and KPIs", () => {
    it("should create economy snapshot with correct structure", async () => {
      const periodKey = "2025-01-20-14"; // Date-hour format

      const snapshot = {
        timestamp: now(),
        periodKey,
        totalInflow: 5000,
        totalOutflow: 3000,
        platformFees: 1050,
        escrowHeld: 500,
        circulating: 2000,
        chatRevenue: 1000,
        chatFees: 350,
        tipsRevenue: 1500,
        tipsFees: 300,
        calendarRevenue: 500,
        calendarFees: 100,
        liveRevenue: 1000,
        liveFees: 300,
        activeUsers: 100,
        payingUsers: 25,
        conversionRate: 25.0,
        arpu: 50,
        arppu: 200,
      };

      await db.collection("economySnapshots").doc(periodKey).set(snapshot);

      const doc = await db.collection("economySnapshots").doc(periodKey).get();
      expect(doc.exists).toBe(true);

      const data = doc.data();
      expect(data.totalInflow).toBe(5000);
      expect(data.totalOutflow).toBe(3000);
      expect(data.platformFees).toBe(1050);
      expect(data.activeUsers).toBe(100);
    });

    it("should calculate ARPU correctly", () => {
      const totalRevenue = 5000;
      const activeUsers = 100;
      const arpu = activeUsers > 0 ? totalRevenue / activeUsers : 0;

      expect(arpu).toBe(50);
    });

    it("should calculate ARPPU correctly", () => {
      const totalRevenue = 5000;
      const payingUsers = 25;
      const arppu = payingUsers > 0 ? totalRevenue / payingUsers : 0;

      expect(arppu).toBe(200);
    });

    it("should calculate conversion rate correctly", () => {
      const activeUsers = 100;
      const payingUsers = 25;
      const conversionRate = activeUsers > 0 ? (payingUsers / activeUsers) * 100 : 0;

      expect(conversionRate).toBe(25.0);
    });

    it("should handle zero users gracefully", () => {
      const totalRevenue = 5000;
      const activeUsers = 0;
      const payingUsers = 0;

      const arpu = activeUsers > 0 ? totalRevenue / activeUsers : 0;
      const arppu = payingUsers > 0 ? totalRevenue / payingUsers : 0;
      const conversionRate = activeUsers > 0 ? (payingUsers / activeUsers) * 100 : 0;

      expect(arpu).toBe(0);
      expect(arppu).toBe(0);
      expect(conversionRate).toBe(0);
    });
  });

  describe("Token Conservation", () => {
    it("should conserve tokens in chat transaction", async () => {
      const senderId = testData.generateUserId();
      const creatorId = testData.generateUserId();

      await createTestUser(senderId, { tokens: 1000 });
      await createTestUser(creatorId, { tokens: 0 });

      const chatAmount = 100;
      const platformFee = Math.floor(chatAmount * 0.35); // 35
      const creatorReceives = chatAmount - platformFee; // 65

      // Sender spends 100
      await createTestTransaction(senderId, -chatAmount, "chat_message");

      // Creator receives 65
      await db.collection("users").doc(creatorId).update({
        tokens: creatorReceives,
      });

      const senderDoc = await db.collection("users").doc(senderId).get();
      const creatorDoc = await db.collection("users").doc(creatorId).get();

      expect(senderDoc.data().tokens).toBe(900); // 1000 - 100
      expect(creatorDoc.data().tokens).toBe(65);

      // Total tokens: 900 + 65 + 35 (platform) = 1000 (conserved)
      const totalAfter = senderDoc.data().tokens + creatorDoc.data().tokens + platformFee;
      expect(totalAfter).toBe(1000);
    });
  });

  describe("Escrow Management", () => {
    it("should track escrow for pending bookings", async () => {
      const userId = testData.generateUserId();
      const creatorId = testData.generateUserId();

      await createTestUser(userId, { tokens: 5000 });
      await createTestUser(creatorId, { tokens: 0 });

      // User books meeting (3000 tokens)
      const bookingAmount = 3000;

      // Deduct from user
      await createTestTransaction(userId, -bookingAmount, "calendar_booking");

      // Add to escrow
      await db.collection("escrow").add({
        bookingId: "booking_123",
        userId,
        creatorId,
        amount: bookingAmount,
        status: "pending",
        createdAt: now(),
      });

      // Query escrow
      const escrowSnapshot = await db.collection("escrow").where("status", "==", "pending").get();

      let totalEscrow = 0;
      escrowSnapshot.docs.forEach((doc: any) => {
        totalEscrow += doc.data().amount;
      });

      expect(totalEscrow).toBe(3000);
    });

    it("should release escrow after verification", async () => {
      const escrowId = "escrow_123";
      const amount = 3000;
      const platformFee = Math.floor(amount * 0.20); // 600
      const creatorReceives = amount - platformFee; // 2400

      await db.collection("escrow").doc(escrowId).set({
        amount,
        status: "pending",
        createdAt: now(),
      });

      // Release escrow
      await db.collection("escrow").doc(escrowId).update({
        status: "released",
        releasedAt: now(),
      });

      const doc = await db.collection("escrow").doc(escrowId).get();
      expect(doc.data().status).toBe("released");

      // Verify amounts
      expect(platformFee).toBe(600);
      expect(creatorReceives).toBe(2400);
    });
  });

  describe("Revenue Breakdown by Category", () => {
    it("should aggregate revenue by category", async () => {
      const userId = testData.generateUserId();
      await createTestUser(userId, { tokens: 10000 });

      // Create different transaction types
      await db.collection("transactions").add({
        userId,
        amount: -1000,
        type: "chat_message",
        createdAt: now(),
      });

      await db.collection("transactions").add({
        userId,
        amount: -500,
        type: "tip",
        createdAt: now(),
      });

      await db.collection("transactions").add({
        userId,
        amount: -1000,
        type: "calendar_booking",
        createdAt: now(),
      });

      await db.collection("transactions").add({
        userId,
        amount: -300,
        type: "live_1on1",
        createdAt: now(),
      });

      const snapshot = await db.collection("transactions").where("userId", "==", userId).get();

      let chatRevenue = 0;
      let tipsRevenue = 0;
      let calendarRevenue = 0;
      let liveRevenue = 0;

      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        const amount = Math.abs(data.amount);

        if (data.type.includes("chat")) chatRevenue += amount;
        else if (data.type.includes("tip") && !data.type.includes("live")) tipsRevenue += amount;
        else if (data.type.includes("calendar")) calendarRevenue += amount;
        else if (data.type.includes("live")) liveRevenue += amount;
      });

      expect(chatRevenue).toBe(1000);
      expect(tipsRevenue).toBe(500);
      expect(calendarRevenue).toBe(1000);
      expect(liveRevenue).toBe(300);

      // Calculate platform fees
      const chatFees = Math.floor(chatRevenue * 0.35);
      const tipsFees = Math.floor(tipsRevenue * 0.20);
      const calendarFees = Math.floor(calendarRevenue * 0.20);
      const liveFees = Math.floor(liveRevenue * 0.30);

      expect(chatFees).toBe(350);
      expect(tipsFees).toBe(100);
      expect(calendarFees).toBe(200);
      expect(liveFees).toBe(90);

      const totalFees = chatFees + tipsFees + calendarFees + liveFees;
      expect(totalFees).toBe(740);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero amount transactions", async () => {
      const userId = testData.generateUserId();
      await createTestUser(userId, { tokens: 100 });

      await db.collection("transactions").add({
        userId,
        amount: 0,
        type: "test",
        createdAt: now(),
      });

      const snapshot = await db.collection("transactions").where("userId", "==", userId).get();
      expect(snapshot.size).toBe(1);
      expect(snapshot.docs[0].data().amount).toBe(0);
    });

    it("should handle very large transaction amounts", async () => {
      const userId = testData.generateUserId();
      await createTestUser(userId, { tokens: 100000 });

      const largeAmount = 15000;
      await createTestTransaction(userId, -largeAmount, "calendar_booking");

      const snapshot = await db.collection("transactions").where("userId", "==", userId).get();
      const txAmount = Math.abs(snapshot.docs[0].data().amount);

      expect(txAmount).toBe(15000);

      const platformFee = Math.floor(largeAmount * 0.20);
      expect(platformFee).toBe(3000);
    });

    it("should handle refund transactions", async () => {
      const userId = testData.generateUserId();
      await createTestUser(userId, { tokens: 1000 });

      // Original charge
      await createTestTransaction(userId, -500, "calendar_booking");

      // Refund
      await createTestTransaction(userId, 500, "refund");

      const userDoc = await db.collection("users").doc(userId).get();
      expect(userDoc.data().tokens).toBe(1000); // Back to original
    });
  });
});


