/**
 * Economy Engine - Phase 14
 *
 * Tracks token flow, economics, and KPIs:
 * - Transaction ledger
 * - Hourly economy snapshots
 * - KPI analysis (ARPU, conversion rate, etc.)
 * - Revenue split tracking
 */

import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
;
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;

const db = getFirestore();

/**
 * Economy snapshot interface
 */
export interface EconomySnapshot {
  timestamp: Timestamp | FieldValue;
  periodKey: string; // "2025-01-20-14" (YYYY-MM-DD-HH)

  // Token flow
  totalInflow: number; // Tokens purchased
  totalOutflow: number; // Tokens spent (excl. platform fees)
  platformFees: number; // Total fees collected
  escrowHeld: number; // Currently in escrow
  circulating: number; // In user wallets

  // Breakdown by type
  chatRevenue: number;
  chatFees: number;
  tipsRevenue: number;
  tipsFees: number;
  calendarRevenue: number;
  calendarFees: number;
  aiRevenue: number; // Subscription-based
  liveRevenue: number;
  liveFees: number;

  // KPIs
  activeUsers: number;
  payingUsers: number;
  conversionRate: number; // payingUsers / activeUsers
  arpu: number; // Average Revenue Per User
  arppu: number; // Average Revenue Per Paying User

  // Transaction counts
  purchaseCount: number;
  chatCount: number;
  tipCount: number;
  calendarCount: number;
  aiChatCount: number;
  liveSessionCount: number;

  createdAt: Timestamp | FieldValue;
}

/**
 * Normalized transaction ledger entry
 */
export interface LedgerEntry {
  ledgerId: string;
  transactionId: string;
  type: string; // transaction type
  userId: string;
  amount: number; // Positive = inflow, Negative = outflow
  platformFee: number;
  escrowAmount?: number;
  relatedUserId?: string; // For peer-to-peer transactions
  metadata: Record<string, any>;
  timestamp: Timestamp | FieldValue;
}

/**
 * Log transaction trigger
 * onCreate for transactions collection
 */
export const logTransactionTrigger = onDocumentCreated(
  {
    document: "transactions/{txId}",
    region: "europe-west3",
  },
  async (event) => {
    const txData = event.data?.data();
    if (!txData) return;

    const txId = event.params.txId;

    try {
      // Normalize and store in ledger
      const ledgerRef = db.collection("economyLedger").doc();
      const ledgerEntry: LedgerEntry = {
        ledgerId: ledgerRef.id,
        transactionId: txId,
        type: txData.type || "unknown",
        userId: txData.uid,
        amount: txData.amount || 0,
        platformFee: calculatePlatformFee(txData),
        escrowAmount: txData.escrowAmount,
        relatedUserId: txData.recipientId || txData.senderId,
        metadata: {
          chatId: txData.chatId,
          sessionId: txData.sessionId,
          bookingId: txData.bookingId,
        },
        timestamp: txData.createdAt || FieldValue.serverTimestamp(),
      };

      await ledgerRef.set(ledgerEntry);

      console.log(`Transaction ${txId} logged to economy ledger`);

      // Log to engine logs
      await logEngineEvent("economyEngine", "transaction_logged", {
        txId,
        type: txData.type,
        amount: txData.amount,
      });
    } catch (error) {
      console.error(`Error logging transaction ${txId}:`, error);
    }
  }
);

/**
 * Calculate platform fee from transaction data
 */
function calculatePlatformFee(txData: any): number {
  const type = txData.type;
  const amount = Math.abs(txData.amount || 0);

  // Chat: 35% platform fee
  if (type?.includes("chat")) {
    return Math.floor(amount * 0.35);
  }

  // Tips: 20% platform fee
  if (type?.includes("tip")) {
    return Math.floor(amount * 0.20);
  }

  // Calendar: 20% platform fee
  if (type?.includes("calendar") || type?.includes("booking")) {
    return Math.floor(amount * 0.20);
  }

  // Live 1:1: 30% platform fee
  if (type?.includes("live_1on1")) {
    return Math.floor(amount * 0.30);
  }

  // Live tip: 20% platform fee
  if (type?.includes("live_tip")) {
    return Math.floor(amount * 0.20);
  }

  return 0;
}

/**
 * Recalculate economy snapshot
 * Scheduled function - runs every hour
 */
export const recalculateEconomyScheduler = onSchedule(
  {
    schedule: "0 * * * *", // Every hour at :00
    region: "europe-west3",
    timeoutSeconds: 540,
  },
  async (event) => {
    console.log("Recalculating economy snapshot...");

    try {
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}`;

      // Query ledger for the past hour
      const oneHourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
      const ledgerSnapshot = await db
        .collection("economyLedger")
        .where("timestamp", ">", oneHourAgo)
        .get();

      // Aggregate data
      let totalInflow = 0;
      let totalOutflow = 0;
      let platformFees = 0;
      let chatRevenue = 0;
      let chatFees = 0;
      let tipsRevenue = 0;
      let tipsFees = 0;
      let calendarRevenue = 0;
      let calendarFees = 0;
      let liveRevenue = 0;
      let liveFees = 0;

      const userSet = new Set<string>();
      const payingUserSet = new Set<string>();

      let purchaseCount = 0;
      let chatCount = 0;
      let tipCount = 0;
      let calendarCount = 0;
      let liveSessionCount = 0;

      ledgerSnapshot.docs.forEach((doc) => {
        const entry = doc.data() as LedgerEntry;
        const amount = Math.abs(entry.amount);
        const fee = entry.platformFee;

        userSet.add(entry.userId);

        if (entry.type.includes("purchase")) {
          totalInflow += amount;
          purchaseCount++;
          payingUserSet.add(entry.userId);
        } else if (entry.type.includes("chat")) {
          totalOutflow += amount;
          chatRevenue += amount;
          chatFees += fee;
          platformFees += fee;
          chatCount++;
        } else if (entry.type.includes("tip")) {
          totalOutflow += amount;
          tipsRevenue += amount;
          tipsFees += fee;
          platformFees += fee;
          tipCount++;
        } else if (entry.type.includes("calendar") || entry.type.includes("booking")) {
          totalOutflow += amount;
          calendarRevenue += amount;
          calendarFees += fee;
          platformFees += fee;
          calendarCount++;
        } else if (entry.type.includes("live")) {
          totalOutflow += amount;
          liveRevenue += amount;
          liveFees += fee;
          platformFees += fee;
          liveSessionCount++;
        }
      });

      // Calculate escrow held (query chats with active escrow)
      const chatsSnapshot = await db
        .collection("chats")
        .where("escrow", ">", 0)
        .get();

      let escrowHeld = 0;
      chatsSnapshot.docs.forEach((doc) => {
        escrowHeld += doc.data().escrow || 0;
      });

      // Calculate circulating (sum of all wallet balances)
      const usersSnapshot = await db.collection("users").get();
      let circulating = 0;
      usersSnapshot.docs.forEach((doc) => {
        circulating += doc.data().wallet?.balance || 0;
      });

      // Calculate KPIs
      const activeUsers = userSet.size;
      const payingUsers = payingUserSet.size;
      const conversionRate = activeUsers > 0 ? payingUsers / activeUsers : 0;
      const arpu = activeUsers > 0 ? totalInflow / activeUsers : 0;
      const arppu = payingUsers > 0 ? totalInflow / payingUsers : 0;

      // AI revenue (from subscriptions)
      const aiSubsSnapshot = await db
        .collection("aiSubscriptions")
        .where("status", "==", "active")
        .get();

      const aiRevenue = aiSubsSnapshot.size * 39; // Simplification, should track actual tiers

      // Create snapshot
      const snapshotRef = db.collection("economySnapshots").doc(periodKey);
      const snapshot: EconomySnapshot = {
        timestamp: FieldValue.serverTimestamp(),
        periodKey,
        totalInflow,
        totalOutflow,
        platformFees,
        escrowHeld,
        circulating,
        chatRevenue,
        chatFees,
        tipsRevenue,
        tipsFees,
        calendarRevenue,
        calendarFees,
        aiRevenue,
        liveRevenue,
        liveFees,
        activeUsers,
        payingUsers,
        conversionRate,
        arpu,
        arppu,
        purchaseCount,
        chatCount,
        tipCount,
        calendarCount,
        aiChatCount: 0, // Could track from aiChats collection
        liveSessionCount,
        createdAt: FieldValue.serverTimestamp(),
      };

      await snapshotRef.set(snapshot);

      console.log(`Economy snapshot created for ${periodKey}`);

      // Log to engine logs
      await logEngineEvent("economyEngine", "snapshot_created", {
        periodKey,
        activeUsers,
        totalInflow,
        totalOutflow,
        platformFees,
      });
    } catch (error) {
      console.error("Error in recalculateEconomyScheduler:", error);
    }
  }
);

/**
 * Analyze flow callable
 * Returns KPI summary for date range
 */
const AnalyzeFlowSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const analyzeFlowCallable = onCall(
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
      throw new HttpsError("permission-denied", "Only admins can analyze economy");
    }

    // Validate input
    const validationResult = AnalyzeFlowSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { startDate, endDate } = validationResult.data;

    try {
      // Query snapshots in date range
      const snapshotsSnapshot = await db
        .collection("economySnapshots")
        .where("periodKey", ">=", startDate)
        .where("periodKey", "<=", `${endDate}-23`) // Include full end date
        .get();

      if (snapshotsSnapshot.empty) {
        return {
          success: true,
          data: {
            periodStart: startDate,
            periodEnd: endDate,
            totalInflow: 0,
            totalOutflow: 0,
            platformFees: 0,
            netFlow: 0,
            snapshotCount: 0,
          },
        };
      }

      // Aggregate snapshots
      let totalInflow = 0;
      let totalOutflow = 0;
      let platformFees = 0;
      let totalActiveUsers = 0;
      let totalPayingUsers = 0;

      snapshotsSnapshot.docs.forEach((doc) => {
        const snapshot = doc.data() as EconomySnapshot;
        totalInflow += snapshot.totalInflow;
        totalOutflow += snapshot.totalOutflow;
        platformFees += snapshot.platformFees;
        totalActiveUsers += snapshot.activeUsers;
        totalPayingUsers += snapshot.payingUsers;
      });

      const snapshotCount = snapshotsSnapshot.size;
      const avgActiveUsers = Math.floor(totalActiveUsers / snapshotCount);
      const avgPayingUsers = Math.floor(totalPayingUsers / snapshotCount);
      const netFlow = totalInflow - totalOutflow;

      return {
        success: true,
        data: {
          periodStart: startDate,
          periodEnd: endDate,
          snapshotCount,
          totalInflow,
          totalOutflow,
          platformFees,
          netFlow,
          avgActiveUsers,
          avgPayingUsers,
          conversionRate: avgActiveUsers > 0 ? avgPayingUsers / avgActiveUsers : 0,
          arpu: avgActiveUsers > 0 ? totalInflow / avgActiveUsers : 0,
        },
      };
    } catch (error: any) {
      console.error("Error analyzing flow:", error);
      throw new HttpsError("internal", `Failed to analyze flow: ${error.message}`);
    }
  }
);

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


