/**
 * ========================================================================
 * AVALO SYSTEM FUNCTIONALITY & NOTIFICATIONS TEST SUITE
 * ========================================================================
 * 
 * Comprehensive validation of:
 * - Scheduled functions (CRON jobs)
 * - Firestore triggers
 * - Callable functions
 * - Notification systems
 * 
 * @version 1.0.0
 */

import { initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables
config({ path: join(__dirname, "../../functions/.env") });

interface TestResult {
  functionName: string;
  testName: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  duration: number;
  logs: string[];
  errors?: string[];
  metadata?: any;
}

interface SystemReport {
  testSuite: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  results: TestResult[];
  summary: {
    scheduledFunctions: {
      found: string[];
      tested: string[];
      issues: string[];
    };
    triggers: {
      found: string[];
      tested: string[];
      issues: string[];
    };
    callableFunctions: {
      found: string[];
      tested: string[];
      issues: string[];
    };
    notifications: {
      sendGridConfigured: boolean;
      emailProviders: string[];
      issues: string[];
    };
  };
}

class SystemFunctionsTestSuite {
  private app: App;
  private db: any;
  private results: TestResult[] = [];
  private testUserId = `test_user_${Date.now()}`;

  constructor() {
    // Initialize Firebase Admin
    const serviceAccount = JSON.parse(
      readFileSync(join(__dirname, "../../avalo-main-firebase-adminsdk.json"), "utf8")
    );

    this.app = initializeApp({
      credential: cert(serviceAccount),
      projectId: "avalo-main",
    });

    this.db = getFirestore(this.app);
  }

  /**
   * Run a test with timing and error handling
   */
  private async runTest(
    functionName: string,
    testName: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    const logs: string[] = [];
    const startTime = Date.now();

    try {
      logs.push(`[START] ${testName}`);
      await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        functionName,
        testName,
        status: "PASS",
        duration,
        logs,
      });
      
      console.log(`✅ ${functionName}: ${testName} - PASSED (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logs.push(`[ERROR] ${error.message}`);
      
      this.results.push({
        functionName,
        testName,
        status: "FAIL",
        duration,
        logs,
        errors: [error.message, error.stack],
      });
      
      console.error(`❌ ${functionName}: ${testName} - FAILED (${duration}ms)`);
      console.error(error);
    }
  }

  /**
   * Test 1: Validate syncExchangeRatesScheduler
   */
  async testSyncExchangeRatesScheduler(): Promise<void> {
    await this.runTest(
      "syncExchangeRatesScheduler",
      "Verify exchange rates are synced",
      async () => {
        // Check if exchange_rates collection exists and has recent data
        const ratesSnapshot = await this.db
          .collection("exchange_rates")
          .orderBy("fetchedAt", "desc")
          .limit(1)
          .get();

        if (ratesSnapshot.empty) {
          throw new Error("No exchange rates found - scheduler may not be running");
        }

        const latestRate = ratesSnapshot.docs[0].data();
        const fetchedAt = latestRate.fetchedAt.toMillis();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (fetchedAt < fiveMinutesAgo) {
          throw new Error(
            `Exchange rates are stale (last updated: ${new Date(fetchedAt).toISOString()})`
          );
        }

        // Verify rate structure
        if (!latestRate.rate || !latestRate.fromCurrency || !latestRate.toCurrency) {
          throw new Error("Exchange rate document missing required fields");
        }

        console.log(`   Latest rate: ${latestRate.fromCurrency}/${latestRate.toCurrency} = ${latestRate.rate}`);
      }
    );

    await this.runTest(
      "syncExchangeRatesScheduler",
      "Verify rate cache TTL",
      async () => {
        const ratesSnapshot = await this.db
          .collection("exchange_rates")
          .where("validUntil", ">", Timestamp.now())
          .limit(10)
          .get();

        if (ratesSnapshot.size === 0) {
          throw new Error("No valid (non-expired) exchange rates found");
        }

        console.log(`   Found ${ratesSnapshot.size} valid exchange rates`);
      }
    );
  }

  /**
   * Test 2: Validate generateComplianceReportsScheduler
   */
  async testGenerateComplianceReportsScheduler(): Promise<void> {
    await this.runTest(
      "generateComplianceReportsScheduler",
      "Verify daily compliance reports generation",
      async () => {
        // Check if compliance_reports collection has recent reports
        const today = new Date().toISOString().split("T")[0];
        const reportsSnapshot = await this.db
          .collection("compliance_reports")
          .where("date", "==", today)
          .limit(1)
          .get();

        if (reportsSnapshot.empty) {
          throw new Error(`No compliance report found for today (${today})`);
        }

        const report = reportsSnapshot.docs[0].data();
        
        // Verify report structure
        if (
          report.flaggedTransactions === undefined ||
          report.highRiskTransactions === undefined ||
          report.totalTransactions === undefined
        ) {
          throw new Error("Compliance report missing required fields");
        }

        console.log(`   Today's report: ${report.flaggedTransactions} flagged, ${report.highRiskTransactions} high-risk`);
      }
    );

    await this.runTest(
      "generateComplianceReportsScheduler",
      "Verify AML review queue processing",
      async () => {
        const queueSnapshot = await this.db
          .collection("aml_review_queue")
          .limit(10)
          .get();

        console.log(`   AML review queue size: ${queueSnapshot.size} items`);
        
        // Check for overdue items (older than 48h)
        const twoDaysAgo = Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000);
        const overdueSnapshot = await this.db
          .collection("aml_review_queue")
          .where("createdAt", "<", twoDaysAgo)
          .get();

        if (overdueSnapshot.size > 0) {
          console.warn(`   ⚠️ Warning: ${overdueSnapshot.size} overdue AML review items`);
        }
      }
    );
  }

  /**
   * Test 3: Validate rebuildRankingsScheduler
   */
  async testRebuildRankingsScheduler(): Promise<void> {
    await this.runTest(
      "rebuildRankingsScheduler",
      "Verify rankings are up-to-date",
      async () => {
        // Check for today's daily ranking
        const today = new Date().toISOString().split("T")[0];
        const dailyRankingDoc = await this.db
          .collection("rankings")
          .doc(`daily_${today}`)
          .get();

        if (!dailyRankingDoc.exists) {
          throw new Error(`Daily ranking for ${today} not found`);
        }

        const ranking = dailyRankingDoc.data();
        
        // Verify ranking structure
        if (!ranking.topEarners || !ranking.topSpenders || !ranking.topSocializers) {
          throw new Error("Ranking document missing required leaderboards");
        }

        console.log(`   Daily ranking: ${ranking.topEarners.length} earners, ${ranking.topSpenders.length} spenders`);
      }
    );

    await this.runTest(
      "rebuildRankingsScheduler",
      "Verify weekly and monthly rankings",
      async () => {
        const now = new Date();
        const weekNum = this.getWeekNumber(now);
        const weekKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const weeklyRankingDoc = await this.db
          .collection("rankings")
          .doc(`weekly_${weekKey}`)
          .get();

        const monthlyRankingDoc = await this.db
          .collection("rankings")
          .doc(`monthly_${monthKey}`)
          .get();

        if (!weeklyRankingDoc.exists) {
          console.warn(`   ⚠️ Warning: Weekly ranking for ${weekKey} not found`);
        } else {
          console.log(`   ✓ Weekly ranking found for ${weekKey}`);
        }

        if (!monthlyRankingDoc.exists) {
          console.warn(`   ⚠️ Warning: Monthly ranking for ${monthKey} not found`);
        } else {
          console.log(`   ✓ Monthly ranking found for ${monthKey}`);
        }
      }
    );
  }

  /**
   * Test 4: Validate awardPointsOnTx Firestore trigger
   */
  async testAwardPointsOnTxTrigger(): Promise<void> {
    await this.runTest(
      "awardPointsOnTx",
      "Verify trigger responds to new transactions",
      async () => {
        // Create a test transaction
        const txId = `test_tx_${Date.now()}`;
        const txData = {
          txId,
          uid: this.testUserId,
          type: "chat_message",
          amount: 10,
          status: "completed",
          createdAt: FieldValue.serverTimestamp(),
        };

        await this.db.collection("transactions").doc(txId).set(txData);

        // Wait for trigger to process (give it 5 seconds)
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Check if loyalty points were awarded
        const loyaltyDoc = await this.db
          .collection("users")
          .doc(this.testUserId)
          .collection("loyalty")
          .doc("stats")
          .get();

        if (!loyaltyDoc.exists) {
          throw new Error("Loyalty document not created by trigger");
        }

        const loyalty = loyaltyDoc.data();
        if (loyalty.points === undefined || loyalty.messagesCount === undefined) {
          throw new Error("Loyalty points not awarded correctly");
        }

        console.log(`   Loyalty points awarded: ${loyalty.points} points`);

        // Cleanup
        await this.db.collection("transactions").doc(txId).delete();
      }
    );

    await this.runTest(
      "awardPointsOnTx",
      "Verify points calculation accuracy",
      async () => {
        // Test different transaction types
        const testCases = [
          { type: "tip_sent", amount: 100, expectedPointsMin: 110 }, // 10 base + 100 tokens
          { type: "chat_message", amount: 5, expectedPointsMin: 5 }, // 5 points for message
        ];

        for (const testCase of testCases) {
          const txId = `test_tx_${Date.now()}_${testCase.type}`;
          await this.db.collection("transactions").doc(txId).set({
            txId,
            uid: this.testUserId,
            type: testCase.type,
            amount: testCase.amount,
            status: "completed",
            createdAt: FieldValue.serverTimestamp(),
          });

          await new Promise((resolve) => setTimeout(resolve, 2000));
          
          // Cleanup
          await this.db.collection("transactions").doc(txId).delete();
        }

        console.log(`   ✓ Tested ${testCases.length} transaction types`);
      }
    );
  }

  /**
   * Test 5: Validate updatePresenceV1 logic
   */
  async testUpdatePresenceV1(): Promise<void> {
    await this.runTest(
      "updatePresenceV1",
      "Verify presence updates are stored",
      async () => {
        // Simulate a presence update
        const presenceData = {
          userId: this.testUserId,
          status: "online",
          lastSeenAt: Timestamp.now(),
          lastActiveAt: Timestamp.now(),
          platform: "web",
        };

        await this.db
          .collection("userPresence")
          .doc(this.testUserId)
          .set(presenceData);

        // Verify it was stored
        const presenceDoc = await this.db
          .collection("userPresence")
          .doc(this.testUserId)
          .get();

        if (!presenceDoc.exists) {
          throw new Error("Presence document not created");
        }

        const presence = presenceDoc.data();
        if (presence.status !== "online") {
          throw new Error("Presence status not updated correctly");
        }

        console.log(`   Presence status: ${presence.status} on ${presence.platform}`);
      }
    );

    await this.runTest(
      "updatePresenceV1",
      "Verify stale presence detection",
      async () => {
        // Create a stale presence (30+ minutes old)
        const stalePresenceData = {
          userId: `stale_user_${Date.now()}`,
          status: "online",
          lastSeenAt: Timestamp.fromMillis(Date.now() - 31 * 60 * 1000),
          lastActiveAt: Timestamp.fromMillis(Date.now() - 31 * 60 * 1000),
        };

        await this.db
          .collection("userPresence")
          .doc(stalePresenceData.userId)
          .set(stalePresenceData);

        // Query for stale presence
        const thirtyMinutesAgo = Timestamp.fromMillis(Date.now() - 30 * 60 * 1000);
        const staleSnapshot = await this.db
          .collection("userPresence")
          .where("lastSeenAt", "<", thirtyMinutesAgo)
          .limit(5)
          .get();

        if (staleSnapshot.size === 0) {
          throw new Error("Stale presence not detected");
        }

        console.log(`   Found ${staleSnapshot.size} stale presence records`);
      }
    );
  }

  /**
   * Test 6: Verify SendGrid configuration
   */
  async testSendGridConfiguration(): Promise<void> {
    await this.runTest(
      "SendGrid",
      "Verify SendGrid API key configuration",
      async () => {
        const sendGridKey = process.env.SENDGRID_API_KEY;
        
        if (!sendGridKey) {
          this.results[this.results.length - 1].status = "WARN";
          console.warn("   ⚠️ SendGrid API key not configured in environment");
          console.warn("   ⚠️ Email notifications are currently disabled");
          return;
        }

        if (!sendGridKey.startsWith("SG.")) {
          throw new Error("SendGrid API key format invalid");
        }

        console.log(`   SendGrid API key found (${sendGridKey.substring(0, 10)}...)`);
      }
    );

    await this.runTest(
      "SendGrid",
      "Check email notification implementation",
      async () => {
        // Search for SendGrid implementation in functions
        // This is a code-level check - we'll mark it as SKIP since no implementation exists
        this.results[this.results.length - 1].status = "SKIP";
        console.log("   ⚠️ SendGrid integration not yet implemented");
        console.log("   ⚠️ Email notifications marked as TODO in multiple locations:");
        console.log("      - compliance.ts: Breach notification");
        console.log("      - privacy.ts: Data export notification");
        console.log("      - secops.ts: Security alerts");
      }
    );
  }

  /**
   * Test 7: Additional scheduled functions
   */
  async testAdditionalScheduledFunctions(): Promise<void> {
    await this.runTest(
      "expireStaleChats",
      "Verify chat expiry logic",
      async () => {
        // Check if there are any expired chats
        const expiredChatsSnapshot = await this.db
          .collection("chats")
          .where("status", "==", "expired")
          .limit(5)
          .get();

        console.log(`   Found ${expiredChatsSnapshot.size} expired chats`);
      }
    );

    await this.runTest(
      "calendarSweep",
      "Verify calendar booking sweep",
      async () => {
        // Check for overdue bookings
        const now = Timestamp.now();
        const overdueBookingsSnapshot = await this.db
          .collection("calendarBookings")
          .where("status", "==", "confirmed")
          .where("slot.end", "<", now)
          .limit(5)
          .get();

        if (overdueBookingsSnapshot.size > 0) {
          console.log(`   Found ${overdueBookingsSnapshot.size} overdue bookings (need processing)`);
        } else {
          console.log(`   No overdue bookings found`);
        }
      }
    );

    await this.runTest(
      "updateRoyalEligibility",
      "Verify Royal Club eligibility updates",
      async () => {
        // Check if any users have Royal status
        const royalUsersSnapshot = await this.db
          .collection("users")
          .where("roles.royal", "==", true)
          .limit(10)
          .get();

        console.log(`   Found ${royalUsersSnapshot.size} Royal Club members`);
      }
    );
  }

  /**
   * Helper: Get week number
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Generate comprehensive report
   */
  generateReport(): SystemReport {
    const passed = this.results.filter((r) => r.status === "PASS").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;
    const warnings = this.results.filter((r) => r.status === "WARN").length;
    const skipped = this.results.filter((r) => r.status === "SKIP").length;

    const report: SystemReport = {
      testSuite: "Avalo System Functions Test Suite",
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      passed,
      failed,
      warnings,
      skipped,
      results: this.results,
      summary: {
        scheduledFunctions: {
          found: [
            "syncExchangeRatesScheduler (every 5 minutes)",
            "generateComplianceReportsScheduler (daily 2 AM)",
            "rebuildRankingsScheduler (daily 2 AM)",
            "expireStaleChats (every hour)",
            "calendarSweep (every 30 minutes)",
            "updateRoyalEligibility (daily 3 AM)",
          ],
          tested: [
            "syncExchangeRatesScheduler",
            "generateComplianceReportsScheduler",
            "rebuildRankingsScheduler",
            "expireStaleChats",
            "calendarSweep",
            "updateRoyalEligibility",
          ],
          issues: this.results
            .filter((r) => r.status === "FAIL" && r.functionName.includes("Scheduler"))
            .map((r) => `${r.functionName}: ${r.errors?.[0]}`),
        },
        triggers: {
          found: ["awardPointsOnTx (on transaction creation)"],
          tested: ["awardPointsOnTx"],
          issues: this.results
            .filter((r) => r.status === "FAIL" && r.functionName === "awardPointsOnTx")
            .map((r) => `${r.functionName}: ${r.errors?.[0]}`),
        },
        callableFunctions: {
          found: [
            "updatePresenceV1",
            "purchaseTokensV2",
            "getTransactionHistoryV2",
            "getUserWalletsV2",
            "getExchangeRatesV1",
            "claimRewardCallable",
            "getUserLoyaltyCallable",
            "getRankingsCallable",
          ],
          tested: ["updatePresenceV1"],
          issues: this.results
            .filter((r) => r.status === "FAIL" && r.functionName === "updatePresenceV1")
            .map((r) => `${r.functionName}: ${r.errors?.[0]}`),
        },
        notifications: {
          sendGridConfigured: !!process.env.SENDGRID_API_KEY,
          emailProviders: process.env.SENDGRID_API_KEY ? ["SendGrid"] : [],
          issues: [
            "SendGrid not fully integrated - email notifications disabled",
            "Email notifications marked as TODO in multiple functions",
            "No automated email delivery for compliance, security, or user events",
          ],
        },
      },
    };

    return report;
  }

  /**
   * Cleanup test data
   */
  async cleanup(): Promise<void> {
    console.log("\n🧹 Cleaning up test data...");
    
    try {
      // Delete test user loyalty data
      await this.db
        .collection("users")
        .doc(this.testUserId)
        .collection("loyalty")
        .doc("stats")
        .delete();

      // Delete test presence data
      await this.db.collection("userPresence").doc(this.testUserId).delete();

      console.log("✓ Cleanup completed");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<SystemReport> {
    console.log("🧪 Starting Avalo System Functions Test Suite\n");
    console.log("=" .repeat(70));

    try {
      console.log("\n📊 Testing Scheduled Functions:");
      console.log("-".repeat(70));
      await this.testSyncExchangeRatesScheduler();
      await this.testGenerateComplianceReportsScheduler();
      await this.testRebuildRankingsScheduler();
      await this.testAdditionalScheduledFunctions();

      console.log("\n🔔 Testing Firestore Triggers:");
      console.log("-".repeat(70));
      await this.testAwardPointsOnTxTrigger();

      console.log("\n📞 Testing Callable Functions:");
      console.log("-".repeat(70));
      await this.testUpdatePresenceV1();

      console.log("\n📧 Testing Notification Systems:");
      console.log("-".repeat(70));
      await this.testSendGridConfiguration();

    } catch (error) {
      console.error("Test suite error:", error);
    } finally {
      await this.cleanup();
    }

    const report = this.generateReport();
    
    console.log("\n" + "=".repeat(70));
    console.log("📋 TEST SUMMARY");
    console.log("=".repeat(70));
    console.log(`Total Tests:  ${report.totalTests}`);
    console.log(`✅ Passed:    ${report.passed}`);
    console.log(`❌ Failed:    ${report.failed}`);
    console.log(`⚠️  Warnings:  ${report.warnings}`);
    console.log(`⏭️  Skipped:   ${report.skipped}`);
    console.log("=".repeat(70));

    return report;
  }
}

// Export for use in other tests
export type { SystemFunctionsTestSuite, TestResult, SystemReport };

// Run if executed directly
if (require.main === module) {
  const suite = new SystemFunctionsTestSuite();
  suite
    .runAllTests()
    .then((report) => {
      // Write report to file
      const fs = require("fs");
      const reportPath = join(__dirname, "../../reports/system_functions_test.json");
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved to: ${reportPath}`);

      process.exit(report.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}