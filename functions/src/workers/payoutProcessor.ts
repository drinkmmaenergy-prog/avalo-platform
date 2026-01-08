/**
 * PACK 56 — Payout Background Processor
 * 
 * Scheduled function to process pending payout requests.
 * Integrates with Stripe Connect, Wise, and AML monitoring.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, admin, serverTimestamp } from "../init";
import {
  createStripeTransfer,
  getStripeTransfer,
} from "../integrations/stripeConnect";
import {
  createWiseTransfer,
  getWiseTransferStatus,
  getWiseProfileId,
} from "../integrations/wise";
import type { PayoutRequest } from "../payouts";

/**
 * Process pending payout requests.
 * Runs every 5 minutes.
 */
export const processPendingPayouts = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    console.log("Starting payout processor...");

    try {
      // Fetch pending payout requests
      const pendingSnapshot = await db
        .collection("payout_requests")
        .where("status", "==", "PENDING")
        .limit(50)
        .get();

      if (pendingSnapshot.empty) {
        console.log("No pending payouts to process");
        return;
      }

      console.log(`Processing ${pendingSnapshot.size} pending payouts`);

      // Process each payout
      const promises = pendingSnapshot.docs.map(async (doc) => {
        const payout = doc.data() as PayoutRequest;
        return processPayoutRequest(payout);
      });

      const results = await Promise.allSettled(promises);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      console.log(`Payout processing complete: ${succeeded} succeeded, ${failed} failed`);
    } catch (error) {
      console.error("Error in payout processor:", error);
    }
  }
);

/**
 * Process a single payout request.
 */
async function processPayoutRequest(payout: PayoutRequest): Promise<void> {
  console.log(`Processing payout ${payout.requestId} for user ${payout.userId}`);

  try {
    // Check AML snapshot for high-risk indicators
    if (payout.amlSnapshot) {
      const { riskScore, riskFlags } = payout.amlSnapshot;

      // If risk score is too high, flag for manual review
      if (riskScore > 80) {
        console.warn(`High risk score (${riskScore}) for payout ${payout.requestId}`);
        await markPayoutForReview(payout, "HIGH_RISK_SCORE");
        return;
      }

      // Check for critical risk flags
      const criticalFlags = ["SANCTIONS", "PEP", "FRAUD_HISTORY"];
      const hasCriticalFlag = riskFlags.some((flag) =>
        criticalFlags.includes(flag)
      );

      if (hasCriticalFlag) {
        console.warn(`Critical risk flags found for payout ${payout.requestId}: ${riskFlags.join(", ")}`);
        await markPayoutForReview(payout, "CRITICAL_RISK_FLAGS");
        return;
      }
    }

    // Update status to PROCESSING
    await db.collection("payout_requests").doc(payout.requestId).update({
      status: "PROCESSING",
      updatedAt: serverTimestamp(),
    });

    // Execute payout based on rail
    let transferId: string;
    let transferStatus: "PENDING" | "PROCESSING" | "PAID" | "FAILED";

    if (payout.rail === "STRIPE") {
      const result = await executeStripeTransfer(payout);
      transferId = result.transferId;
      transferStatus = result.status;
    } else if (payout.rail === "WISE") {
      const result = await executeWiseTransfer(payout);
      transferId = result.transferId;
      transferStatus = result.status;
    } else {
      throw new Error(`Unknown payout rail: ${payout.rail}`);
    }

    // Update payout request with transfer details
    await db.collection("payout_requests").doc(payout.requestId).update({
      status: transferStatus === "PAID" ? "PAID" : "PROCESSING",
      [`providerData.${payout.rail.toLowerCase()}TransferId`]: transferId,
      updatedAt: serverTimestamp(),
      processedAt: transferStatus === "PAID" ? serverTimestamp() : null,
    });

    // Update AML profile with payout activity
    if (transferStatus === "PAID") {
      await updateAMLProfileForPayout(payout);
    }

    console.log(`Payout ${payout.requestId} processed successfully: ${transferStatus}`);
  } catch (error: any) {
    console.error(`Error processing payout ${payout.requestId}:`, error);

    // Mark as failed
    await db.collection("payout_requests").doc(payout.requestId).update({
      status: "FAILED",
      updatedAt: serverTimestamp(),
      processedAt: serverTimestamp(),
      error: error.message || "Unknown error",
    });

    // Refund tokens to user if transfer failed
    await refundFailedPayout(payout);
  }
}

/**
 * Execute Stripe Connect transfer.
 */
async function executeStripeTransfer(payout: PayoutRequest) {
  // Get payout account
  const accountDoc = await db.collection("payout_accounts").doc(payout.userId).get();
  if (!accountDoc.exists) {
    throw new Error("Payout account not found");
  }

  const account = accountDoc.data();
  const stripeAccountId = account?.stripe?.accountId;

  if (!stripeAccountId) {
    throw new Error("Stripe account not configured");
  }

  // Convert to cents
  const amountCents = Math.round(payout.amountFiatNetToUser * 100);

  // Create transfer
  const result = await createStripeTransfer({
    accountId: stripeAccountId,
    amountCents,
    currency: payout.currency,
    description: `Avalo creator payout - ${payout.requestId}`,
    metadata: {
      avaloRequestId: payout.requestId,
      avaloUserId: payout.userId,
      tokensRequested: payout.tokensRequested.toString(),
    },
  });

  return {
    transferId: result.transferId,
    status: result.status,
  };
}

/**
 * Execute Wise transfer.
 */
async function executeWiseTransfer(payout: PayoutRequest) {
  // Get payout account
  const accountDoc = await db.collection("payout_accounts").doc(payout.userId).get();
  if (!accountDoc.exists) {
    throw new Error("Payout account not found");
  }

  const account = accountDoc.data();
  const wiseRecipientId = account?.wise?.recipientId;

  if (!wiseRecipientId) {
    throw new Error("Wise recipient not configured");
  }

  // Get Wise profile ID
  const profileId = getWiseProfileId();
  if (!profileId) {
    throw new Error("Wise profile ID not configured");
  }

  // Create transfer
  const result = await createWiseTransfer({
    recipientId: wiseRecipientId,
    profileId,
    amountFiat: payout.amountFiatNetToUser,
    currency: payout.currency,
    reference: `Avalo payout ${payout.requestId}`,
    metadata: {
      avaloRequestId: payout.requestId,
      avaloUserId: payout.userId,
      tokensRequested: payout.tokensRequested.toString(),
    },
  });

  return {
    transferId: result.transferId,
    status: result.status,
  };
}

/**
 * Mark payout for manual review.
 */
async function markPayoutForReview(
  payout: PayoutRequest,
  reason: string
): Promise<void> {
  await db.collection("payout_requests").doc(payout.requestId).update({
    status: "FAILED",
    updatedAt: serverTimestamp(),
    processedAt: serverTimestamp(),
    error: `Flagged for review: ${reason}`,
  });

  // Create moderation case
  const caseId = db.collection("moderation_cases").doc().id;
  await db.collection("moderation_cases").doc(caseId).set({
    caseId,
    type: "PAYOUT_REVIEW",
    userId: payout.userId,
    status: "OPEN",
    priority: "HIGH",
    details: {
      payoutRequestId: payout.requestId,
      reason,
      tokensRequested: payout.tokensRequested,
      amountFiat: payout.amountFiatNetToUser,
      currency: payout.currency,
      amlSnapshot: payout.amlSnapshot,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Refund tokens
  await refundFailedPayout(payout);

  console.log(`Payout ${payout.requestId} flagged for review: ${reason}`);
}

/**
 * Refund tokens for failed payout.
 */
async function refundFailedPayout(payout: PayoutRequest): Promise<void> {
  try {
    await db.collection("creator_earnings").doc(payout.userId).update({
      tokensPaidOut: admin.firestore.FieldValue.increment(-payout.tokensRequested),
      updatedAt: serverTimestamp(),
    });

    console.log(`Refunded ${payout.tokensRequested} tokens to user ${payout.userId}`);
  } catch (error) {
    console.error(`Error refunding tokens for payout ${payout.requestId}:`, error);
  }
}

/**
 * Update AML profile with payout activity.
 */
async function updateAMLProfileForPayout(payout: PayoutRequest): Promise<void> {
  try {
    const amlRef = db.collection("aml_profiles").doc(payout.userId);
    const amlDoc = await amlRef.get();

    if (!amlDoc.exists) {
      // Create basic AML profile if it doesn't exist
      await amlRef.set({
        userId: payout.userId,
        totalPayouts: 1,
        totalPayoutAmount: payout.amountFiatNetToUser,
        lastPayoutAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } else {
      // Update existing profile
      await amlRef.update({
        totalPayouts: admin.firestore.FieldValue.increment(1),
        totalPayoutAmount: admin.firestore.FieldValue.increment(payout.amountFiatNetToUser),
        lastPayoutAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error(`Error updating AML profile for payout ${payout.requestId}:`, error);
    // Don't fail the payout if AML update fails
  }
}

/**
 * Check status of processing payouts.
 * Runs every 15 minutes to verify transfer completion.
 */
export const checkPayoutStatus = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    console.log("Checking payout status...");

    try {
      // Fetch processing payouts
      const processingSnapshot = await db
        .collection("payout_requests")
        .where("status", "==", "PROCESSING")
        .limit(50)
        .get();

      if (processingSnapshot.empty) {
        console.log("No processing payouts to check");
        return;
      }

      console.log(`Checking ${processingSnapshot.size} processing payouts`);

      // Check each payout status
      const promises = processingSnapshot.docs.map(async (doc) => {
        const payout = doc.data() as PayoutRequest;
        return checkPayoutTransferStatus(payout);
      });

      const results = await Promise.allSettled(promises);

      const completed = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      console.log(`Payout status check complete: ${completed} checked, ${failed} errors`);
    } catch (error) {
      console.error("Error in payout status checker:", error);
    }
  }
);

/**
 * Check the status of a processing payout transfer.
 */
async function checkPayoutTransferStatus(payout: PayoutRequest): Promise<void> {
  try {
    let transferStatus: "PENDING" | "PROCESSING" | "PAID" | "FAILED";

    if (payout.rail === "STRIPE" && payout.providerData.stripeTransferId) {
      const result = await getStripeTransfer(payout.providerData.stripeTransferId);
      transferStatus = result.status;
    } else if (payout.rail === "WISE" && payout.providerData.wiseTransferId) {
      const result = await getWiseTransferStatus(payout.providerData.wiseTransferId);
      transferStatus = result.status;
    } else {
      console.warn(`No transfer ID found for payout ${payout.requestId}`);
      return;
    }

    // Update if status changed
    if (transferStatus === "PAID" && payout.status !== "PAID") {
      await db.collection("payout_requests").doc(payout.requestId).update({
        status: "PAID",
        updatedAt: serverTimestamp(),
        processedAt: serverTimestamp(),
      });

      // Update AML profile
      await updateAMLProfileForPayout(payout);

      console.log(`Payout ${payout.requestId} marked as PAID`);
    } else if (transferStatus === "FAILED" && payout.status !== "FAILED") {
      await db.collection("payout_requests").doc(payout.requestId).update({
        status: "FAILED",
        updatedAt: serverTimestamp(),
        processedAt: serverTimestamp(),
      });

      // Refund tokens
      await refundFailedPayout(payout);

      console.log(`Payout ${payout.requestId} marked as FAILED`);
    }
  } catch (error: any) {
    console.error(`Error checking payout status for ${payout.requestId}:`, error);
  }
}