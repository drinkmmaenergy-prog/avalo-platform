/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * Media & Influencer Risk Correlation (Integration with PACK 386)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Calculate influencer reputation risk score
 */
export const pack387_influencerReputationRisk = functions.https.onCall(
  async (data: { influencerId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const influencerId = data.influencerId;

      // Get influencer data
      const influencerDoc = await db.collection('influencers').doc(influencerId).get();

      if (!influencerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Influencer not found');
      }

      const influencer = influencerDoc.data();

      // Check for negative PR signals linked to this influencer
      const negativeSignals = await db
        .collection('reputationSignals')
        .where('authorId', '==', influencerId)
        .where('sentimentScore', '<', -0.3)
        .get();

      const negativeByInfluencer = await db
        .collection('reputationSignals')
        .where('relatedUserId', '==', influencerId)
        .where('sentimentScore', '<', -0.3)
        .get();

      // Check for linked incidents
      const linkedIncidents = await db
        .collection('prIncidents')
        .where('influencerInvolvement', 'array-contains', influencerId)
        .get();

      // Check safety reports against influencer
      const safetyReports = await db
        .collection('safetyIncidents')
        .where('reportedUserId', '==', influencerId)
        .get();

      // Check fraud cases
      const fraudCases = await db
        .collection('fraudCases')
        .where('suspectUserId', '==', influencerId)
        .get();

      // Calculate risk score (0-100)
      let riskScore = 0;

      // Negative signals by influencer
      riskScore += negativeSignals.size * 5;

      // Negative signals about influencer
      riskScore += negativeByInfluencer.size * 10;

      // PR incidents
      riskScore += linkedIncidents.size * 20;

      // Safety reports
      riskScore += safetyReports.size * 15;

      // Fraud cases
      riskScore += fraudCases.size * 25;

      // Cap at 100
      riskScore = Math.min(riskScore, 100);

      // Determine risk level
      const riskLevel =
        riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW';

      // Save or update risk score
      await db.collection('influencerRiskScores').doc(influencerId).set(
        {
          influencerId,
          riskScore,
          riskLevel,
          negativeSignalCount: negativeSignals.size + negativeByInfluencer.size,
          linkedIncidentCount: linkedIncidents.size,
          safetyReportCount: safetyReports.size,
          fraudCaseCount: fraudCases.size,
          updatedAt: admin.firestore.Timestamp.now(),
          payoutFrozen: riskScore >= 75, // Auto-freeze if CRITICAL
        },
        { merge: true }
      );

      // If critical, take action
      if (riskScore >= 75) {
        await handleCriticalInfluencerRisk(influencerId, riskScore);
      }

      return {
        riskScore,
        riskLevel,
        details: {
          negativeSignals: negativeSignals.size + negativeByInfluencer.size,
          linkedIncidents: linkedIncidents.size,
          safetyReports: safetyReports.size,
          fraudCases: fraudCases.size,
        },
      };
    } catch (error: any) {
      console.error('Error calculating influencer risk:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Handle critical influencer risk - freeze payouts, detach campaigns
 */
async function handleCriticalInfluencerRisk(influencerId: string, riskScore: number): Promise<void> {
  console.log(`🚨 CRITICAL influencer risk detected: ${influencerId} (score: ${riskScore})`);

  try {
    // Freeze payouts
    const pendingPayouts = await db
      .collection('influencerPayouts')
      .where('influencerId', '==', influencerId)
      .where('status', '==', 'PENDING')
      .get();

    const freezePayoutPromises = pendingPayouts.docs.map(doc =>
      doc.ref.update({
        status: 'FROZEN',
        frozenReason: 'Critical reputation risk detected',
        frozenAt: admin.firestore.Timestamp.now(),
      })
    );

    await Promise.all(freezePayoutPromises);

    // Pause active campaigns
    const activeCampaigns = await db
      .collection('influencerCampaigns')
      .where('influencerId', '==', influencerId)
      .where('status', '==', 'ACTIVE')
      .get();

    const pauseCampaignPromises = activeCampaigns.docs.map(doc =>
      doc.ref.update({
        status: 'PAUSED',
        pausedReason: 'Reputation risk',
        pausedAt: admin.firestore.Timestamp.now(),
      })
    );

    await Promise.all(pauseCampaignPromises);

    // Notify admin team
    const admins = await db.collection('users').where('role', 'in', ['admin', 'executive']).get();

    const notificationPromises = admins.docs.map(admin =>
      db.collection('notifications').add({
        userId: admin.id,
        type: 'INFLUENCER_RISK_CRITICAL',
        priority: 'HIGH',
        title: 'Critical Influencer Risk Detected',
        message: `Influencer ${influencerId} has critical risk score (${riskScore}). Payouts frozen, campaigns paused.`,
        data: { influencerId, riskScore },
        read: false,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    await Promise.all(notificationPromises);

    console.log(
      `✅ Handled critical risk: froze ${pendingPayouts.size} payouts, paused ${activeCampaigns.size} campaigns`
    );
  } catch (error) {
    console.error('Error handling critical influencer risk:', error);
  }
}

/**
 * Detect fake "expose" campaigns or coordinated harassment
 */
export const pack387_detectCoordinatedAttack = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async context => {
    console.log('Checking for coordinated attacks...');

    try {
      const now = admin.firestore.Timestamp.now();
      const twoHoursAgo = new admin.firestore.Timestamp(now.seconds - 7200, now.nanoseconds);

      // Get recent negative signals
      const recentNegative = await db
        .collection('reputationSignals')
        .where('timestamp', '>=', twoHoursAgo)
        .where('sentimentScore', '<', -0.5)
        .get();

      if (recentNegative.size < 10) {
        return null; // Not enough data
      }

      // Group by author and topic
      const authorGroups = new Map<string, any[]>();
      const topicGroups = new Map<string, any[]>();

      recentNegative.forEach(doc => {
        const signal = doc.data();

        // Group by author
        if (signal.authorId) {
          const signals = authorGroups.get(signal.authorId) || [];
          signals.push(signal);
          authorGroups.set(signal.authorId, signals);
        }

        // Group by topic
        const topicSignals = topicGroups.get(signal.topic) || [];
        topicSignals.push(signal);
        topicGroups.set(signal.topic, topicSignals);
      });

      // Detect coordinated attack patterns
      // 1. Same author posting many negative reviews
      Array.from(authorGroups.entries()).forEach(([authorId, signals]) => {
        if (signals.length >= 5) {
          console.log(`⚠️  Potential harassment: ${authorId} posted ${signals.length} negative signals`);
          // Could create incident or flag for review
        }
      });

      // 2. Sudden spike in specific topic
      Array.from(topicGroups.entries()).forEach(([topic, signals]) => {
        if (signals.length >= 15) {
          console.log(`⚠️  Coordinated attack on topic: ${topic} (${signals.length} signals)`);
          // Could create incident
        }
      });

      // 3. Check for duplicate/similar content (potential bot attack)
      const contents = recentNegative.docs
        .map(doc => doc.data().content)
        .filter((c): c is string => !!c);

      const duplicates = new Map<string, number>();
      contents.forEach(content => {
        const normalized = content.toLowerCase().trim();
        duplicates.set(normalized, (duplicates.get(normalized) || 0) + 1);
      });

      Array.from(duplicates.entries()).forEach(([content, count]) => {
        if (count >= 5) {
          console.log(`⚠️  Duplicate content detected (${count} times): ${content.substring(0, 50)}...`);
          // Potential bot attack
        }
      });

      return null;
    } catch (error) {
      console.error('Error detecting coordinated attacks:', error);
      return null;
    }
  });

/**
 * Update all influencer risk scores
 */
export const pack387_updateAllInfluencerRisks = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async context => {
    console.log('Updating all influencer risk scores...');

    try {
      // Get all influencers
      const influencers = await db.collection('influencers').get();

      console.log(`Processing ${influencers.size} influencers...`);

      // Process in batches to avoid timeout
      const batchSize = 50;
      const batches: any[][] = [];

      for (let i = 0; i < influencers.docs.length; i += batchSize) {
        batches.push(influencers.docs.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map(async doc => {
            try {
              // Recalculate risk score (reuse the logic from above)
              const influencerId = doc.id;

              const negativeSignals = await db
                .collection('reputationSignals')
                .where('authorId', '==', influencerId)
                .where('sentimentScore', '<', -0.3)
                .limit(20)
                .get();

              const linkedIncidents = await db
                .collection('prIncidents')
                .where('influencerInvolvement', 'array-contains', influencerId)
                .limit(10)
                .get();

              let riskScore = negativeSignals.size * 5 + linkedIncidents.size * 20;
              riskScore = Math.min(riskScore, 100);

              await db.collection('influencerRiskScores').doc(influencerId).set(
                {
                  influencerId,
                  riskScore,
                  riskLevel: riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW',
                  updatedAt: admin.firestore.Timestamp.now(),
                },
                { merge: true }
              );
            } catch (error) {
              console.error(`Error updating risk for influencer ${doc.id}:`, error);
            }
          })
        );
      }

      console.log('✅ All influencer risk scores updated');
      return null;
    } catch (error) {
      console.error('Error updating influencer risks:', error);
      return null;
    }
  });

/**
 * Manually review and unfreeze influencer
 */
export const pack387_unfreezeInfluencer = functions.https.onCall(
  async (data: { influencerId: string; reason: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // TODO: Verify admin role

    try {
      // Update risk score
      await db.collection('influencerRiskScores').doc(data.influencerId).update({
        payoutFrozen: false,
        unfrozenBy: context.auth.uid,
        unfrozenAt: admin.firestore.Timestamp.now(),
        unfreezeReason: data.reason,
        manualOverride: true,
      });

      // Unfreeze payouts
      const frozenPayouts = await db
        .collection('influencerPayouts')
        .where('influencerId', '==', data.influencerId)
        .where('status', '==', 'FROZEN')
        .get();

      const unfreezePromises = frozenPayouts.docs.map(doc =>
        doc.ref.update({
          status: 'PENDING',
          unfrozenBy: context.auth!.uid,
          unfrozenAt: admin.firestore.Timestamp.now(),
          unfreezeReason: data.reason,
        })
      );

      await Promise.all(unfreezePromises);

      return { success: true, unfrozenPayouts: frozenPayouts.size };
    } catch (error: any) {
      console.error('Error unfreezing influencer:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
