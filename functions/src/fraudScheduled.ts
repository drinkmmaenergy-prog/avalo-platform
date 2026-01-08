/**
 * PACK 71 — Fraud Analytics Scheduled Functions
 * 
 * Scheduled and event-triggered fraud analysis
 */

import { db, admin } from './init';
import * as functions from 'firebase-functions';
import { collectAndAnalyzeFraudSignals } from './fraudEngine';
import { logEvent } from './observability';

// ============================================================================
// WEEKLY FRAUD RECALCULATION
// ============================================================================

/**
 * Scheduled function to recalculate fraud scores weekly for all users with activity
 * Runs every Sunday at 2 AM UTC
 */
export const weeklyFraudRecalculation = functions.pubsub
  .schedule('0 2 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[Fraud Scheduled] Starting weekly fraud recalculation');
    
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;
    
    try {
      // Get all users with recent activity (last 90 days)
      const date90dAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const timestamp90dAgo = admin.firestore.Timestamp.fromDate(date90dAgo);
      
      // Get users with recent payouts
      const payoutUsersSnapshot = await db.collection('payout_requests')
        .where('createdAt', '>=', timestamp90dAgo)
        .select('userId')
        .get();
      
      // Get users with recent creator earnings
      const earningsSnapshot = await db.collection('creator_earnings')
        .where('updatedAt', '>=', timestamp90dAgo)
        .get();
      
      // Combine unique user IDs
      const userIds = new Set<string>();
      
      payoutUsersSnapshot.forEach((doc) => {
        userIds.add(doc.data().userId);
      });
      
      earningsSnapshot.forEach((doc) => {
        userIds.add(doc.id);
      });
      
      console.log(`[Fraud Scheduled] Found ${userIds.size} users with recent activity`);
      
      // Process users in batches
      const batchSize = 10;
      const userIdArray = Array.from(userIds);
      
      for (let i = 0; i < userIdArray.length; i += batchSize) {
        const batch = userIdArray.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (userId) => {
            try {
              await collectAndAnalyzeFraudSignals(userId);
              processedCount++;
            } catch (error: any) {
              console.error(`[Fraud Scheduled] Error processing user ${userId}:`, error);
              errorCount++;
            }
          })
        );
        
        // Log progress every 100 users
        if (processedCount % 100 === 0) {
          console.log(`[Fraud Scheduled] Progress: ${processedCount}/${userIdArray.length} users processed`);
        }
      }
      
      const duration = Date.now() - startTime;
      
      await logEvent({
        level: 'INFO',
        source: 'BACKEND',
        service: 'functions.fraudScheduled',
        module: 'FRAUD_DETECTION',
        message: 'Weekly fraud recalculation completed',
        environment: 'PROD',
        details: {
          extra: {
            processedCount,
            errorCount,
            durationMs: duration,
            totalUsers: userIdArray.length
          }
        }
      });
      
      console.log(`[Fraud Scheduled] Completed: ${processedCount} users processed, ${errorCount} errors, ${duration}ms duration`);
      
      return {
        success: true,
        processedCount,
        errorCount,
        durationMs: duration
      };
      
    } catch (error: any) {
      console.error('[Fraud Scheduled] Weekly recalculation failed:', error);
      
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.fraudScheduled',
        module: 'FRAUD_DETECTION',
        message: 'Weekly fraud recalculation failed',
        environment: 'PROD',
        details: {
          extra: {
            error: error.message,
            stack: error.stack
          }
        }
      });
      
      throw error;
    }
  });

// ============================================================================
// EVENT-TRIGGERED FRAUD RECALCULATION
// ============================================================================

/**
 * Trigger fraud recalculation when a payout is requested
 */
export const onPayoutRequestFraudCheck = functions.firestore
  .document('payout_requests/{requestId}')
  .onCreate(async (snap, context) => {
    const payoutRequest = snap.data();
    const userId = payoutRequest.userId;
    
    if (!userId) {
      console.warn('[Fraud Trigger] No userId in payout request');
      return;
    }
    
    try {
      console.log(`[Fraud Trigger] Recalculating fraud score for user ${userId} after payout request`);
      
      // Recalculate fraud signals
      await collectAndAnalyzeFraudSignals(userId);
      
      console.log(`[Fraud Trigger] Fraud score recalculated for user ${userId}`);
      
    } catch (error: any) {
      console.error(`[Fraud Trigger] Error recalculating fraud score for user ${userId}:`, error);
      
      // Non-blocking - don't throw error
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.fraudScheduled',
        module: 'FRAUD_DETECTION',
        message: 'Payout fraud check failed',
        environment: 'PROD',
        context: {
          userId
        },
        details: {
          extra: {
            error: error.message,
            requestId: context.params.requestId
          }
        }
      });
    }
  });

/**
 * Trigger fraud recalculation when a dispute is created
 */
export const onDisputeCreatedFraudCheck = functions.firestore
  .document('disputes/{disputeId}')
  .onCreate(async (snap, context) => {
    const dispute = snap.data();
    const userId = dispute.userId || dispute.creatorId;
    
    if (!userId) {
      console.warn('[Fraud Trigger] No userId in dispute');
      return;
    }
    
    try {
      console.log(`[Fraud Trigger] Recalculating fraud score for user ${userId} after dispute`);
      
      // Recalculate fraud signals
      await collectAndAnalyzeFraudSignals(userId);
      
      console.log(`[Fraud Trigger] Fraud score recalculated for user ${userId}`);
      
    } catch (error: any) {
      console.error(`[Fraud Trigger] Error recalculating fraud score for user ${userId}:`, error);
      
      // Non-blocking
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.fraudScheduled',
        module: 'FRAUD_DETECTION',
        message: 'Dispute fraud check failed',
        environment: 'PROD',
        context: {
          userId
        },
        details: {
          extra: {
            error: error.message,
            disputeId: context.params.disputeId
          }
        }
      });
    }
  });

/**
 * Trigger fraud recalculation when AML profile is updated with high risk
 */
export const onAmlProfileUpdateFraudCheck = functions.firestore
  .document('aml_profiles/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;
    
    // Only recalculate if risk level changed to HIGH or CRITICAL
    const riskLevelChanged = before.riskLevel !== after.riskLevel;
    const isHighRisk = after.riskLevel === 'HIGH' || after.riskLevel === 'CRITICAL';
    
    if (!riskLevelChanged || !isHighRisk) {
      return;
    }
    
    try {
      console.log(`[Fraud Trigger] Recalculating fraud score for user ${userId} after AML risk increase`);
      
      // Recalculate fraud signals
      await collectAndAnalyzeFraudSignals(userId);
      
      console.log(`[Fraud Trigger] Fraud score recalculated for user ${userId}`);
      
    } catch (error: any) {
      console.error(`[Fraud Trigger] Error recalculating fraud score for user ${userId}:`, error);
      
      // Non-blocking
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.fraudScheduled',
        module: 'FRAUD_DETECTION',
        message: 'AML fraud check failed',
        environment: 'PROD',
        context: {
          userId
        },
        details: {
          extra: {
            error: error.message,
            riskLevel: after.riskLevel
          }
        }
      });
    }
  });

/**
 * Manual trigger for fraud recalculation (callable function)
 */
export const triggerFraudRecalculation = functions.https.onCall(async (data, context) => {
  // Verify admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be authenticated to trigger fraud recalculation'
    );
  }
  
  // Check if user is admin (simplified check)
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Must be admin to trigger fraud recalculation'
    );
  }
  
  const { userId, batchMode } = data;
  
  if (!userId && !batchMode) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Must provide userId or enable batchMode'
    );
  }
  
  try {
    if (batchMode) {
      // Trigger batch recalculation (implement similar to weekly scheduled)
      console.log('[Fraud Trigger] Starting manual batch recalculation');
      
      // Get high-risk users only
      const highRiskSnapshot = await db.collection('fraud_profiles')
        .where('riskLevel', 'in', ['HIGH', 'CRITICAL'])
        .limit(100)
        .get();
      
      let processedCount = 0;
      
      for (const doc of highRiskSnapshot.docs) {
        try {
          await collectAndAnalyzeFraudSignals(doc.id);
          processedCount++;
        } catch (error: any) {
          console.error(`Error processing user ${doc.id}:`, error);
        }
      }
      
      return {
        success: true,
        message: `Batch recalculation completed for ${processedCount} high-risk users`
      };
      
    } else {
      // Single user recalculation
      console.log(`[Fraud Trigger] Manual recalculation for user ${userId}`);
      
      await collectAndAnalyzeFraudSignals(userId);
      
      return {
        success: true,
        message: `Fraud score recalculated for user ${userId}`
      };
    }
    
  } catch (error: any) {
    console.error('[Fraud Trigger] Manual recalculation failed:', error);
    
    throw new functions.https.HttpsError(
      'internal',
      'Fraud recalculation failed: ' + error.message
    );
  }
});