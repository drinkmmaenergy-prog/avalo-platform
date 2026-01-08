/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * Automated Crisis Response Orchestrator
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface CrisisActions {
  freezeMarketingCampaigns: boolean;
  suppressReviewPrompts: boolean;
  fastTrackSafetyTickets: boolean;
  lockInfluencerPayouts: boolean;
  notifyLegalAndExecutive: boolean;
}

/**
 * Main Crisis Response Orchestrator
 * Triggered when a CRITICAL incident is created
 */
export const pack387_crisisResponseOrchestrator = functions.firestore
  .document('prIncidents/{incidentId}')
  .onCreate(async (snapshot, context) => {
    const incident = snapshot.data();
    const incidentId = context.params.incidentId;

    // Only orchestrate for CRITICAL or HIGH threat levels
    if (incident.threatLevel !== 'CRITICAL' && incident.threatLevel !== 'HIGH') {
      return null;
    }

    console.log(`🚨 CRISIS ORCHESTRATION TRIGGERED: ${incident.title}`);

    try {
      const actions: CrisisActions = {
        freezeMarketingCampaigns: incident.threatLevel === 'CRITICAL',
        suppressReviewPrompts: true,
        fastTrackSafetyTickets: incident.topic === 'safety' || incident.topic === 'abuse',
        lockInfluencerPayouts: incident.influencerInvolvement?.length > 0,
        notifyLegalAndExecutive: incident.legalExposure || incident.threatLevel === 'CRITICAL',
      };

      // Execute all crisis actions in parallel
      await Promise.all([
        actions.freezeMarketingCampaigns && freezeMarketingCampaigns(incidentId, incident),
        actions.suppressReviewPrompts && suppressReviewPrompts(incidentId, incident),
        actions.fastTrackSafetyTickets && fastTrackSafetyTickets(incidentId, incident),
        actions.lockInfluencerPayouts && lockInfluencerPayouts(incidentId, incident),
        actions.notifyLegalAndExecutive && notifyLegalAndExecutive(incidentId, incident),
      ].filter(Boolean));

      // Log orchestration completion
      await db.collection('crisisResponseLogs').add({
        incidentId,
        actionType: 'ORCHESTRATION_COMPLETE',
        status: 'SUCCESS',
        timestamp: admin.firestore.Timestamp.now(),
        actions,
      });

      console.log(`✅ Crisis orchestration complete for incident: ${incidentId}`);

      return null;
    } catch (error) {
      console.error('Error in crisis orchestration:', error);
      
      await db.collection('crisisResponseLogs').add({
        incidentId,
        actionType: 'ORCHESTRATION_FAILED',
        status: 'ERROR',
        timestamp: admin.firestore.Timestamp.now(),
        error: (error as Error).message,
      });

      return null;
    }
  });

/**
 * Manually trigger crisis orchestration
 */
export const pack387_triggerCrisisOrchestration = functions.https.onCall(
  async (data: { incidentId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentDoc = await db.collection('prIncidents').doc(data.incidentId).get();

      if (!incidentDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Incident not found');
      }

      const incident = incidentDoc.data();

      // Execute crisis response
      await Promise.all([
        freezeMarketingCampaigns(data.incidentId, incident!),
        suppressReviewPrompts(data.incidentId, incident!),
        notifyLegalAndExecutive(data.incidentId, incident!),
      ]);

      return { success: true };
    } catch (error: any) {
      console.error('Error triggering crisis orchestration:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * ACTION: Freeze Marketing Campaigns (PACK 386)
 */
async function freezeMarketingCampaigns(incidentId: string, incident: any): Promise<void> {
  console.log('🛑 Freezing marketing campaigns...');

  try {
    // Pause all active marketing campaigns
    const activeCampaigns = await db
      .collection('marketingCampaigns')
      .where('status', '==', 'ACTIVE')
      .get();

    const pausePromises = activeCampaigns.docs.map(doc =>
      doc.ref.update({
        status: 'PAUSED_CRISIS',
        pausedBy: 'CRISIS_ORCHESTRATION',
        pausedAt: admin.firestore.Timestamp.now(),
        pauseReason: `PR Crisis: ${incident.title}`,
        relatedIncidentId: incidentId,
      })
    );

    await Promise.all(pausePromises);

    // Log action
    await db.collection('crisisResponseLogs').add({
      incidentId,
      actionType: 'MARKETING_CAMPAIGNS_FROZEN',
      status: 'SUCCESS',
      timestamp: admin.firestore.Timestamp.now(),
      metadata: { campaignCount: activeCampaigns.size },
    });

    console.log(`✅ Froze ${activeCampaigns.size} marketing campaigns`);
  } catch (error) {
    console.error('Error freezing marketing campaigns:', error);
    throw error;
  }
}

/**
 * ACTION: Suppress Review Prompts (PACK 384)
 */
async function suppressReviewPrompts(incidentId: string, incident: any): Promise<void> {
  console.log('🛑 Suppressing review prompts...');

  try {
    // Create store crisis shield
    await db.collection('storeCrisisShields').add({
      incidentId,
      active: true,
      suppressReviewPrompts: true,
      suppressRatingRequests: true,
      geo: incident.geo || 'GLOBAL',
      activatedAt: admin.firestore.Timestamp.now(),
      reason: incident.title,
    });

    // Log action
    await db.collection('crisisResponseLogs').add({
      incidentId,
      actionType: 'REVIEW_PROMPTS_SUPPRESSED',
      status: 'SUCCESS',
      timestamp: admin.firestore.Timestamp.now(),
    });

    console.log('✅ Review prompts suppressed');
  } catch (error) {
    console.error('Error suppressing review prompts:', error);
    throw error;
  }
}

/**
 * ACTION: Fast-track Safety Tickets (PACK 300)
 */
async function fastTrackSafetyTickets(incidentId: string, incident: any): Promise<void> {
  console.log('⚡ Fast-tracking safety tickets...');

  try {
    // Get all open safety tickets related to the incident topic
    const safetyTickets = await db
      .collection('supportTickets')
      .where('status', '==', 'OPEN')
      .where('category', '==', 'SAFETY')
      .get();

    // Upgrade priority
    const upgradePromises = safetyTickets.docs.map(doc =>
      doc.ref.update({
        priority: 'CRITICAL',
        escalated: true,
        escalationReason: `Related to PR Crisis: ${incident.title}`,
        relatedIncidentId: incidentId,
        updatedAt: admin.firestore.Timestamp.now(),
      })
    );

    await Promise.all(upgradePromises);

    // Log action
    await db.collection('crisisResponseLogs').add({
      incidentId,
      actionType: 'SAFETY_TICKETS_FAST_TRACKED',
      status: 'SUCCESS',
      timestamp: admin.firestore.Timestamp.now(),
      metadata: { ticketCount: safetyTickets.size },
    });

    console.log(`✅ Fast-tracked ${safetyTickets.size} safety tickets`);
  } catch (error) {
    console.error('Error fast-tracking safety tickets:', error);
    throw error;
  }
}

/**
 * ACTION: Lock Influencer Payouts (PACK 386)
 */
async function lockInfluencerPayouts(incidentId: string, incident: any): Promise<void> {
  console.log('🔒 Locking influencer payouts...');

  try {
    if (!incident.influencerInvolvement || incident.influencerInvolvement.length === 0) {
      return;
    }

    // Lock payouts for implicated influencers
    const lockPromises = incident.influencerInvolvement.map(async (influencerId: string) => {
      // Update influencer risk score
      await db.collection('influencerRiskScores').doc(influencerId).set(
        {
          influencerId,
          payoutFrozen: true,
          frozenReason: `PR Crisis: ${incident.title}`,
          frozenAt: admin.firestore.Timestamp.now(),
          relatedIncidentId: incidentId,
          riskScore: 100, // Maximum risk
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

      // Cancel pending payouts
      const pendingPayouts = await db
        .collection('influencerPayouts')
        .where('influencerId', '==', influencerId)
        .where('status', '==', 'PENDING')
        .get();

      const cancelPromises = pendingPayouts.docs.map(doc =>
        doc.ref.update({
          status: 'FROZEN',
          frozenReason: `PR Crisis: ${incident.title}`,
          frozenAt: admin.firestore.Timestamp.now(),
        })
      );

      await Promise.all(cancelPromises);
    });

    await Promise.all(lockPromises);

    // Log action
    await db.collection('crisisResponseLogs').add({
      incidentId,
      actionType: 'INFLUENCER_PAYOUTS_LOCKED',
      status: 'SUCCESS',
      timestamp: admin.firestore.Timestamp.now(),
      metadata: { influencerCount: incident.influencerInvolvement.length },
    });

    console.log(`✅ Locked payouts for ${incident.influencerInvolvement.length} influencers`);
  } catch (error) {
    console.error('Error locking influencer payouts:', error);
    throw error;
  }
}

/**
 * ACTION: Notify Legal & Executive Channel
 */
async function notifyLegalAndExecutive(incidentId: string, incident: any): Promise<void> {
  console.log('📢 Notifying legal & executive team...');

  try {
    // Get legal and executive users
    const stakeholders = await db
      .collection('users')
      .where('role', 'in', ['legal', 'executive', 'admin'])
      .get();

    // Create notifications
    const notificationPromises = stakeholders.docs.map(user =>
      db.collection('notifications').add({
        userId: user.id,
        type: 'CRISIS_ALERT',
        priority: 'CRITICAL',
        title: `🚨 PR CRISIS: ${incident.title}`,
        message: incident.description,
        data: { incidentId, incident },
        read: false,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    await Promise.all(notificationPromises);

    // Also send emails (if email service configured)
    // await sendCrisisEmails(stakeholders.docs, incident);

    // Log action
    await db.collection('crisisResponseLogs').add({
      incidentId,
      actionType: 'STAKEHOLDERS_NOTIFIED',
      status: 'SUCCESS',
      timestamp: admin.firestore.Timestamp.now(),
      metadata: { notificationCount: stakeholders.size },
    });

    console.log(`✅ Notified ${stakeholders.size} stakeholders`);
  } catch (error) {
    console.error('Error notifying stakeholders:', error);
    throw error;
  }
}

/**
 * Deactivate crisis measures when incident is resolved
 */
export const pack387_deactivateCrisisMeasures = functions.https.onCall(
  async (data: { incidentId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      // Resume marketing campaigns
      const pausedCampaigns = await db
        .collection('marketingCampaigns')
        .where('status', '==', 'PAUSED_CRISIS')
        .where('relatedIncidentId', '==', data.incidentId)
        .get();

      const resumePromises = pausedCampaigns.docs.map(doc =>
        doc.ref.update({
          status: 'ACTIVE',
          resumedAt: admin.firestore.Timestamp.now(),
          resumedBy: context.auth!.uid,
        })
      );

      await Promise.all(resumePromises);

      // Deactivate store crisis shields
      const shields = await db
        .collection('storeCrisisShields')
        .where('incidentId', '==', data.incidentId)
        .where('active', '==', true)
        .get();

      const deactivateShieldPromises = shields.docs.map(doc =>
        doc.ref.update({
          active: false,
          deactivatedAt: admin.firestore.Timestamp.now(),
          deactivatedBy: context.auth!.uid,
        })
      );

      await Promise.all(deactivateShieldPromises);

      // Unfreeze influencer payouts (requires manual review)
      // This should be done carefully, case by case

      // Log action
      await db.collection('crisisResponseLogs').add({
        incidentId: data.incidentId,
        actionType: 'CRISIS_MEASURES_DEACTIVATED',
        status: 'SUCCESS',
        timestamp: admin.firestore.Timestamp.now(),
        performedBy: context.auth.uid,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error deactivating crisis measures:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
