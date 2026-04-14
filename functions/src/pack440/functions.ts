import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * PACK 440:Creator Revenue Integrity & Payout Freezing Framework
 * Cloud Functions - Automated triggers and scheduled jobs
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CreatorRevenueIntegrityScoreService } from './services/CreatorRevenueIntegrityScore';
import { IntelligentPayoutEscrowService } from './services/IntelligentPayoutEscrowService';
import { ProgressiveFreezeController } from './services/ProgressiveFreezeController';
import { CreatorPayoutStatusAPI } from './services/CreatorPayoutStatusAPI';
import { ComplianceEscalationOrchestrator } from './services/ComplianceEscalationOrchestrator';
import { HttpsError, Timestamp, auth, onCall, logger, onSchedule, onDocumentCreated } from "../runtime";


const db = admin.firestore();

// Initialize services
const integrityService = new CreatorRevenueIntegrityScoreService(db);
const escrowService = new IntelligentPayoutEscrowService(db, integrityService);
const freezeController = new ProgressiveFreezeController(db, integrityService);
const statusAPI = new CreatorPayoutStatusAPI(db);
const complianceOrchestrator = new ComplianceEscalationOrchestrator(db);

/**
 * Trigger: On new payout request
 * Creates escrow and evaluates freeze conditions
 */
export const onPayoutCreated = onDocumentCreated('payout_requests/{payoutId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    
    try {
      // Create escrow
      const escrow = await escrowService.createPayoutEscrow({
        earnerId: data.earnerId,
        amount: data.amount,
        currency: data.currency,
        revenueBreakdown: data.revenueBreakdown
      });
      
      // Evaluate freeze conditions
      const freezeEval = await freezeController.evaluateFreeze(
        data.earnerId,
        escrow.payoutId,
        data.amount
      );
      
      if (freezeEval && freezeEval.shouldFreeze) {
        await freezeController.createFreeze(data.earnerId, freezeEval, escrow.payoutId);
      }
      
      // Update earner status
      await statusAPI.updateStatus(data.earnerId);
      
      console.log(`Payout ${escrow.payoutId} created with ${escrow.escrowPeriod.cooldownHours}h escrow`);
    } catch (error) {
      console.error('Error in onPayoutCreated:', error);
      throw error;
    }
  });

/**
 * Scheduled: Update integrity scores hourly
 */
export const updateIntegrityScores = onSchedule("every 1 hours", async (event) => {
    try {
      // Get all active earners (with recent activity)
      const recentPayouts = await db
        .collection('payout_escrow')
        .where('metadata.createdAt', '>=', admin.firestore.Timestamp.fromMillis(
          Date.now() - 7 * 24 * 60 * 60 * 1000 // Last 7 days
        ))
        .get();
      
      const earnerIds = new Set(recentPayouts.docs.map(doc => doc.data().earnerId));
      
      // Update scores in batches
      const batchSize = 10;
      const earnerArray = Array.from(earnerIds);
      
      for (let i = 0; i < earnerArray.length; i += batchSize) {
        const batch = earnerArray.slice(i, i + batchSize);
        await Promise.all(batch.map(earnerId => 
          integrityService.calculateScore(earnerId).catch(err => {
            console.error(`Error updating score for ${earnerId}:`, err);
          })
        ));
      }
      
      console.log(`Updated integrity scores for ${earnerIds.size} earners`);
    } catch (error) {
      console.error('Error in updateIntegrityScores:', error);
    }
  });

/**
 * Scheduled: Process escrow releases (every 15 minutes)
 */
export const processEscrowReleases = onSchedule("every 15 minutes", async (event) => {
    try {
      const readyPayouts = await escrowService.getPayoutsReadyForRelease();
      
      for (const payout of readyPayouts) {
        try {
          await escrowService.releasePayout(payout.payoutId);
          await statusAPI.updateStatus(payout.earnerId);
          console.log(`Released payout ${payout.payoutId}`);
        } catch (error) {
          console.error(`Error releasing payout ${payout.payoutId}:`, error);
        }
      }
      
      console.log(`Processed ${readyPayouts.length} payout releases`);
    } catch (error) {
      console.error('Error in processEscrowReleases:', error);
    }
  });

/**
 * Scheduled: Process freeze auto-releases (every 30 minutes)
 */
export const processFreezeReleases = onSchedule("every 30 minutes", async (event) => {
    try {
      const readyFreezes = await freezeController.getFreezesReadyForRelease();
      
      for (const freeze of readyFreezes) {
        try {
          await freezeController.releaseFreeze(freeze.freezeId, 'AUTO', 'Time-based release');
          await statusAPI.updateStatus(freeze.earnerId);
          console.log(`Released freeze ${freeze.freezeId}`);
        } catch (error) {
          console.error(`Error releasing freeze ${freeze.freezeId}:`, error);
        }
      }
      
      console.log(`Processed ${readyFreezes.length} freeze releases`);
    } catch (error) {
      console.error('Error in processFreezeReleases:', error);
    }
  });

/**
 * Scheduled: Check for SLA breaches (every hour)
 */
export const checkSLABreaches = onSchedule("every 1 hours", async (event) => {
    try {
      const overdueCases = await complianceOrchestrator.getOverdueCases();
      
      for (const case_item of overdueCases) {
        // Escalate overdue cases
        await complianceOrchestrator.addAction(
          case_item.caseId,
          'AUTO',
          'SLA_BREACH_DETECTED',
          `Case is overdue. SLA deadline was ${case_item.timeline.slaDeadline.toDate()}`
        );
        
        // Send notification
        await db.collection('notifications').add({
          type: 'SLA_BREACH',
          caseId: case_item.caseId,
          department: case_item.department,
          title: 'SLA Breach Alert',
          body: `Case ${case_item.caseId} has exceeded its SLA deadline`,
          createdAt: admin.firestore.Timestamp.now(),
          priority: 'HIGH'
        });
      }
      
      console.log(`Checked ${overdueCases.length} overdue cases`);
    } catch (error) {
      console.error('Error in checkSLABreaches:', error);
    }
  });

/**
 * HTTPS Callable: Get earner payout status
 */
export const getCreatorPayoutStatus = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const earnerId = request.auth.uid;
  
  try {
    const status = await statusAPI.getStatus(earnerId);
    return status;
  } catch (error) {
    console.error('Error in getCreatorPayoutStatus:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get payout status');
  }
});

/**
 * HTTPS Callable: Mark message as read
 */
export const markPayoutMessageRead = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { messageId } = data;
  const earnerId = request.auth.uid;
  
  if (!messageId) {
    throw new functions.https.HttpsError('invalid-argument', 'messageId is required');
  }
  
  try {
    await statusAPI.markMessageRead(earnerId, messageId);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error) {
    console.error('Error in markPayoutMessageRead:', error);
    throw new functions.https.HttpsError('internal', 'Failed to mark message as read');
  }
});

/**
 * HTTPS Callable: Admin - Release freeze
 */
export const adminReleaseFreeze = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check admin role
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const userRole = userDoc.data()?.role;
  
  if (!['admin', 'compliance'].includes(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }
  
  const { freezeId, notes } = data;
  
  if (!freezeId) {
    throw new functions.https.HttpsError('invalid-argument', 'freezeId is required');
  }
  
  try {
    await freezeController.releaseFreeze(freezeId, request.auth.uid, notes || '');
    
    // Update earner status
    const freeze = await freezeController.getFreeze(freezeId);
    if (freeze) {
      await statusAPI.updateStatus(freeze.earnerId);
    }
    
    console.log('Scheduled job result:', { success: true });

    
    return;
  } catch (error) {
    console.error('Error in adminReleaseFreeze:', error);
    throw new functions.https.HttpsError('internal', 'Failed to release freeze');
  }
});

/**
 * HTTPS Callable: Admin - Get dashboard stats
 */
export const getAdminDashboardStats = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check admin role
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const userRole = userDoc.data()?.role;
  
  if (!['admin', 'compliance', 'finance'].includes(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }
  
  try {
    const [
      activeEscrows,
      activeFreezes,
      openCases,
      overdueCases
    ] = await Promise.all([
      db.collection('payout_escrow').where('status', '==', 'IN_ESCROW').get(),
      db.collection('payout_freezes').where('status', '==', 'ACTIVE').get(),
      db.collection('compliance_escalations').where('status', '==', 'OPEN').get(),
      db.collection('compliance_escalations')
        .where('status', 'in', ['OPEN', 'IN_REVIEW'])
        .where('timeline.slaDeadline', '<', admin.firestore.Timestamp.now())
        .get()
    ]);
    
    console.log('Scheduled job result:', {
      activeEscrows: activeEscrows.size,
      activeFreezes: activeFreezes.size,
      openCases: openCases.size,
      overdueCases: overdueCases.size,
      totalEscrowAmount: activeEscrows.docs.reduce((sum, doc) => sum + doc.data().amount, 0)
    });

    
    return;
  } catch (error) {
    console.error('Error in getAdminDashboardStats:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get dashboard stats');
  }
});



























