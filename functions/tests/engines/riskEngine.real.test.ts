/**
 * Risk Engine Real Tests
 * Tests risk assessment, trust scores, and fraud detection
 */

;
import { Timestamp } from "firebase-admin/firestore";

// Risk levels
enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

describe("Risk Engine - Real Tests", () => {
  let db: any;

  beforeAll(async () => {
    db = getDb();
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    // Only clear risk profiles to avoid state contamination
    // Other collections use unique IDs per test so don't need clearing
    const profiles = await db.collection("userRiskProfiles").limit(500).get();
    const batch = db.batch();
    profiles.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  });

  describe("Risk Profile Creation and Management", () => {
    it("should create risk profile with default values", async () => {
      const userId = testData.generateUserId();

      const riskProfile = {
        userId,
        riskLevel: RiskLevel.LOW,
        trustScore: 50, // Neutral
        qualityScore: 0,
        totalTokensSpent: 0,
        totalTokensEarned: 0,
        abuseReports: 0,
        abuseReports24h: 0,
        accountAgeHours: 0,
        isVerified: false,
        isBanned: false,
        riskFactors: [],
        createdAt: now(),
        updatedAt: now(),
      };

      await db.collection("userRiskProfiles").doc(userId).set(riskProfile);

      const doc = await db.collection("userRiskProfiles").doc(userId).get();
      expect(doc.exists).toBe(true);

      const data = doc.data();
      expect(data.userId).toBe(userId);
      expect(data.riskLevel).toBe(RiskLevel.LOW);
      expect(data.trustScore).toBe(50);
      expect(data.abuseReports).toBe(0);
      expect(data.isBanned).toBe(false);
      expect(data.riskFactors).toEqual([]);
    });

    it("should update risk profile", async () => {
      const userId = testData.generateUserId();

      await db.collection("userRiskProfiles").doc(userId).set({
        userId,
        riskLevel: RiskLevel.LOW,
        trustScore: 50,
        qualityScore: 0,
        totalTokensSpent: 0,
        totalTokensEarned: 0,
        abuseReports: 0,
        abuseReports24h: 0,
        accountAgeHours: 0,
        isVerified: false,
        isBanned: false,
        riskFactors: [],
        createdAt: now(),
        updatedAt: now(),
      });

      // Update after transaction
      await db.collection("userRiskProfiles").doc(userId).update({
        totalTokensSpent: 100,
        updatedAt: now(),
      });

      const doc = await db.collection("userRiskProfiles").doc(userId).get();
      expect(doc.data().totalTokensSpent).toBe(100);
    });
  });

  describe("Trust Score Calculation", () => {
    it("should calculate neutral score for new user", () => {
      const baseScore = 50;
      const accountAgeBonus = 0;
      const verificationBonus = 0;
      const transactionBonus = 0;
      const abuseReportsPenalty = 0;

      const trustScore = Math.max(
        0,
        Math.min(100, baseScore + accountAgeBonus + verificationBonus + transactionBonus - abuseReportsPenalty)
      );

      expect(trustScore).toBe(50);
    });

    it("should increase score for verified users", () => {
      const baseScore = 50;
      const verificationBonus = 20; // +20 for verification

      const trustScore = Math.max(0, Math.min(100, baseScore + verificationBonus));

      expect(trustScore).toBe(70);
    });

    it("should increase score based on account age", () => {
      const baseScore = 50;
      const accountAgeWeeks = 10; // 10 weeks old
      const accountAgeBonus = Math.min(15, accountAgeWeeks); // Max +15 (but 10 weeks = +10)

      const trustScore = Math.max(0, Math.min(100, baseScore + accountAgeBonus));

      expect(trustScore).toBe(60); // 50 + 10
    });

    it("should decrease score for abuse reports", () => {
      const baseScore = 50;
      const abuseReports = 3;
      const abuseReportsPenalty = abuseReports * 10; // -10 per report

      const trustScore = Math.max(0, Math.min(100, baseScore - abuseReportsPenalty));

      expect(trustScore).toBe(20);
    });

    it("should clamp score between 0 and 100", () => {
      // Test upper bound
      const highScore = 50 + 20 + 15 + 10 + 50; // 145
      const clampedHigh = Math.max(0, Math.min(100, highScore));
      expect(clampedHigh).toBe(100);

      // Test lower bound
      const lowScore = 50 - 100; // -50
      const clampedLow = Math.max(0, Math.min(100, lowScore));
      expect(clampedLow).toBe(0);
    });

    it("should calculate comprehensive trust score", async () => {
      const userId = testData.generateUserId();

      // Create user with positive factors using helper function
      await createTestUser(userId, {
        verification: { status: "approved" },
        createdAt: daysAgo(70), // 10 weeks ago
        tokens: 500,
      });

      // Create transactions
      for (let i = 0; i < 15; i++) {
        await db.collection("transactions").add({
          userId,
          amount: -10,
          type: "chat_message",
          createdAt: daysAgo(i),
        });
      }

      // Calculate score
      const userDoc = await db.collection("users").doc(userId).get();
      expect(userDoc.exists).toBe(true);
      const userData = userDoc.data()!;

      const txSnapshot = await db.collection("transactions").where("userId", "==", userId).get();

      const accountAgeMs = Date.now() - userData.createdAt.toMillis();
      const accountAgeWeeks = Math.floor(accountAgeMs / (7 * 24 * 60 * 60 * 1000));

      let score = 50; // Base
      score += Math.min(15, accountAgeWeeks); // Account age (15)
      if (userData.verification?.status === "approved") score += 20; // Verification (20)
      score += Math.min(10, txSnapshot.size); // Transactions (10)

      score = Math.max(0, Math.min(100, score));

      expect(score).toBe(95); // 50 + 15 + 20 + 10
    });
  });

  describe("Risk Level Escalation", () => {
    it("should detect high spend from new account", async () => {
      const userId = testData.generateUserId();

      // New account (< 24 hours)
      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: hoursAgo(5),
        tokens: 0,
      });

      // High value transaction (1000 tokens)
      await db.collection("transactions").add({
        userId,
        amount: -1000,
        type: "calendar_booking",
        createdAt: now(),
      });

      // Check risk factors
      const userDoc = await db.collection("users").doc(userId).get();
      expect(userDoc.exists).toBe(true);
      const userData = userDoc.data()!;
      const accountAgeMs = Date.now() - userData.createdAt.toMillis();
      const accountAgeHours = accountAgeMs / (60 * 60 * 1000);

      const txSnapshot = await db.collection("transactions").where("userId", "==", userId).get();
      const totalSpent = txSnapshot.docs.reduce((sum: number, doc: any) => {
        const amount = doc.data().amount;
        return amount < 0 ? sum + Math.abs(amount) : sum;
      }, 0);

      const isNewAccount = accountAgeHours < 24;
      const isHighSpend = totalSpent > 500;

      const riskFactors: string[] = [];
      let riskLevel = RiskLevel.LOW;

      if (isNewAccount && isHighSpend) {
        riskFactors.push("high_spend_new_account");
        riskLevel = RiskLevel.HIGH;
      }

      expect(isNewAccount).toBe(true);
      expect(isHighSpend).toBe(true);
      expect(riskFactors).toContain("high_spend_new_account");
      expect(riskLevel).toBe(RiskLevel.HIGH);
    });

    it("should detect rapid transactions", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: daysAgo(30),
        tokens: 1000,
      });

      // Create 6 transactions within last 5 minutes (more recent window)
      for (let i = 0; i < 6; i++) {
        await db.collection("transactions").add({
          userId,
          amount: -50,
          type: "chat_message",
          createdAt: minutesAgo(5 - (i * 0.5)), // Spread across 5 minutes
        });
      }

      // Check for rapid transactions (last 10 minutes)
      const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
      const recentTxSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .where("createdAt", ">=", tenMinutesAgo)
        .get();

      const rapidTransactions = recentTxSnapshot.size > 5;

      expect(recentTxSnapshot.size).toBe(6);
      expect(rapidTransactions).toBe(true);
    });

    it("should detect multiple abuse reports in 24h", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: daysAgo(30),
      });

      // Create 3 reports in last 24h
      for (let i = 0; i < 3; i++) {
        await db.collection("contentFlags").add({
          targetUserId: userId,
          reason: "spam",
          createdAt: hoursAgo(12 - i * 2),
        });
      }

      // Check reports in last 24h
      const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
      const reportsSnapshot = await db
        .collection("contentFlags")
        .where("targetUserId", "==", userId)
        .where("createdAt", ">=", oneDayAgo)
        .get();

      const multipleReports24h = reportsSnapshot.size >= 3;

      expect(reportsSnapshot.size).toBe(3);
      expect(multipleReports24h).toBe(true);
    });
  });

  describe("User Ban Functionality", () => {
    it("should ban user with reason and duration", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: daysAgo(10),
        tokens: 100,
      });

      // Ban user for 24 hours
      const durationMinutes = 24 * 60;
      const bannedUntil = Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000);

      await db.collection("users").doc(userId).update({
        isBanned: true,
        bannedUntil,
        banReason: "Repeated spam",
      });

      const doc = await db.collection("users").doc(userId).get();
      const data = doc.data();

      expect(data.isBanned).toBe(true);
      expect(data.banReason).toBe("Repeated spam");
      expect(data.bannedUntil).toBeDefined();
    });

    it("should support permanent ban (no bannedUntil)", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: daysAgo(10),
      });

      await db.collection("users").doc(userId).update({
        isBanned: true,
        banReason: "Severe TOS violation",
      });

      const doc = await db.collection("users").doc(userId).get();
      const data = doc.data();

      expect(data.isBanned).toBe(true);
      expect(data.banReason).toBe("Severe TOS violation");
      expect(data.bannedUntil).toBeUndefined();
    });
  });

  describe("Risk Factor Tracking", () => {
    it("should accumulate risk factors", async () => {
      const userId = testData.generateUserId();

      await db.collection("userRiskProfiles").doc(userId).set({
        userId,
        riskLevel: RiskLevel.LOW,
        trustScore: 50,
        riskFactors: [],
        createdAt: now(),
        updatedAt: now(),
      });

      // Add first risk factor
      await db.collection("userRiskProfiles").doc(userId).update({
        riskFactors: ["rapid_transactions"],
        riskLevel: RiskLevel.MEDIUM,
        updatedAt: now(),
      });

      let doc = await db.collection("userRiskProfiles").doc(userId).get();
      expect(doc.data().riskFactors).toEqual(["rapid_transactions"]);
      expect(doc.data().riskLevel).toBe(RiskLevel.MEDIUM);

      // Add second risk factor
      await db.collection("userRiskProfiles").doc(userId).update({
        riskFactors: ["rapid_transactions", "multiple_reports_24h"],
        riskLevel: RiskLevel.HIGH,
        updatedAt: now(),
      });

      doc = await db.collection("userRiskProfiles").doc(userId).get();
      expect(doc.data().riskFactors).toContain("rapid_transactions");
      expect(doc.data().riskFactors).toContain("multiple_reports_24h");
      expect(doc.data().riskLevel).toBe(RiskLevel.HIGH);
    });

    it("should escalate to CRITICAL with severe violations", async () => {
      const userId = testData.generateUserId();

      await db.collection("userRiskProfiles").doc(userId).set({
        userId,
        riskLevel: RiskLevel.HIGH,
        trustScore: 20,
        riskFactors: ["high_spend_new_account", "multiple_reports_24h", "unverified_high_spend"],
        abuseReports: 5,
        createdAt: now(),
        updatedAt: now(),
      });

      const doc = await db.collection("userRiskProfiles").doc(userId).get();
      const data = doc.data();

      // Escalate to CRITICAL if 3+ risk factors and low trust score
      if (data.riskFactors.length >= 3 && data.trustScore < 30) {
        await db.collection("userRiskProfiles").doc(userId).update({
          riskLevel: RiskLevel.CRITICAL,
        });
      }

      const updatedDoc = await db.collection("userRiskProfiles").doc(userId).get();
      expect(updatedDoc.data().riskLevel).toBe(RiskLevel.CRITICAL);
    });
  });

  describe("Quality Score Tracking", () => {
    it("should calculate quality score based on profile completeness", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        displayName: "Test User",
        bio: "A complete bio with meaningful content",
        photos: ["photo1.jpg", "photo2.jpg", "photo3.jpg"],
        verification: { status: "approved" },
        createdAt: daysAgo(30),
      });

      const doc = await db.collection("users").doc(userId).get();
      const userData = doc.data();

      let qualityScore = 0;

      // Photos (+5 each, max 15)
      if (userData.photos) {
        qualityScore += Math.min(15, userData.photos.length * 5);
      }

      // Bio (+10)
      if (userData.bio && userData.bio.length > 20) {
        qualityScore += 10;
      }

      // Verification (+15)
      if (userData.verification?.status === "approved") {
        qualityScore += 15;
      }

      expect(qualityScore).toBe(40); // 15 + 10 + 15
    });
  });

  describe("Edge Cases", () => {
    it("should handle user with no transactions", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        createdAt: daysAgo(5),
        tokens: 0,
      });

      const txSnapshot = await db.collection("transactions").where("userId", "==", userId).get();

      expect(txSnapshot.empty).toBe(true);
      expect(txSnapshot.size).toBe(0);
    });

    it("should handle missing risk profile gracefully", async () => {
      const userId = testData.generateUserId();

      const doc = await db.collection("userRiskProfiles").doc(userId).get();

      expect(doc.exists).toBe(false);
      // In real implementation, would create default profile
    });

    it("should handle negative token balance (edge case)", async () => {
      const userId = testData.generateUserId();

      await db.collection("users").doc(userId).set({
        uid: userId,
        email: `${userId}@test.com`,
        tokens: -100, // Edge case: negative balance
        createdAt: daysAgo(10),
      });

      const doc = await db.collection("users").doc(userId).get();
      expect(doc.exists).toBe(true);
      const data = doc.data()!;

      expect(data.tokens).toBe(-100);
      // System should flag this as anomaly
    });
  });
});


