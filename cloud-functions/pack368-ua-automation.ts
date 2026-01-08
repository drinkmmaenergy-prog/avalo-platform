/**
 * PACK 368 — UA AUTOMATION ENGINE
 * 
 * Tracks installs, CPI, ROAS, and automates campaign management
 * with fraud detection and performance optimization
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

interface InstallData {
  userId: string;
  countryCode: string;
  source: string;
  campaign: string;
  deviceId: string;
  ip: string;
  timestamp: admin.firestore.Timestamp;
}

interface CampaignMetrics {
  installs: number;
  spent: number;
  revenue: number;
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
  cpi: number;
  ltv: number;
  roas: number;
}

// ═══════════════════════════════════════════════════════════════
// 1️⃣ TRACK INSTALLS
// ═══════════════════════════════════════════════════════════════

export const pack368_trackInstalls = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { countryCode, source, campaign, deviceId, ip } = data;

    // Hash sensitive data
    const ipHash = createHash('sha256').update(ip || '').digest('hex');
    const deviceHash = createHash('sha256').update(deviceId || '').digest('hex');

    // Check for fraud patterns
    const fraudScore = await detectInstallFraud(context.auth.uid, ipHash, deviceHash, countryCode);

    // Create install record
    const installRef = db.collection('uaInstalls').doc();
    await installRef.set({
      userId: context.auth.uid,
      countryCode,
      source: source || 'organic',
      campaign: campaign || 'none',
      deviceId: deviceHash,
      ipHash,
      fraudScore,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      day1Retained: null,
      day7Retained: null,
      day30Retained: null,
      ltv: 0
    });

    // Check geo launch phase
    const geoPhase = await db.collection('geoLaunchPhases').doc(countryCode).get();
    if (!geoPhase.exists || geoPhase.data()?.phase === 'CLOSED') {
      throw new functions.https.HttpsError('permission-denied', `Country ${countryCode} is not open for installs`);
    }

    // Check daily install cap
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayInstalls = await db.collection('uaInstalls')
      .where('countryCode', '==', countryCode)
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(today))
      .count()
      .get();

    const dailyCap = geoPhase.data()?.dailyInstallCap || Infinity;
    if (todayInstalls.data().count >= dailyCap) {
      // Trigger interlock
      await triggerInterlock(countryCode, 'DAILY_CAP_REACHED', {
        cap: dailyCap,
        current: todayInstalls.data().count
      });
    }

    // Update campaign metrics if applicable
    if (campaign && campaign !== 'none') {
      await updateCampaignInstalls(campaign);
    }

    // Log to audit
    await logAudit('INSTALL_TRACKED', context.auth.uid, {
      countryCode,
      source,
      campaign,
      fraudScore
    });

    return {
      success: true,
      installId: installRef.id,
      fraudScore
    };

  } catch (error: any) {
    console.error('Track install error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// 2️⃣ TRACK CPI (Cost Per Install)
// ═══════════════════════════════════════════════════════════════

export const pack368_trackCPI = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const campaigns = await db.collection('uaCampaigns')
        .where('status', '==', 'ACTIVE')
        .get();

      const batch = db.batch();

      for (const campaignDoc of campaigns.docs) {
        const campaign = campaignDoc.data();
        const campaignId = campaignDoc.id;

        // Get installs for this campaign
        const installs = await db.collection('uaInstalls')
          .where('campaign', '==', campaignId)
          .count()
          .get();

        const installCount = installs.data().count;
        const spent = campaign.spent || 0;
        const cpi = installCount > 0 ? spent / installCount : 0;

        // Update campaign metrics
        batch.update(campaignDoc.ref, {
          installs: installCount,
          cpi,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create metric record
        const metricRef = db.collection('uaMetrics').doc();
        batch.set(metricRef, {
          campaignId,
          countryCode: campaign.countryCode,
          date: new Date().toISOString().split('T')[0],
          installs: installCount,
          spent,
          cpi,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Check if CPI is too high
        if (cpi > 10.0) { // Configurable threshold
          await pauseCampaign(campaignId, 'HIGH_CPI', { cpi });
        }
      }

      await batch.commit();

      console.log(`Updated CPI for ${campaigns.size} campaigns`);
      return null;

    } catch (error) {
      console.error('Track CPI error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 3️⃣ TRACK ROAS (Return on Ad Spend)
// ═══════════════════════════════════════════════════════════════

export const pack368_trackROAS = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      const campaigns = await db.collection('uaCampaigns')
        .where('status', 'in', ['ACTIVE', 'PAUSED'])
        .get();

      const batch = db.batch();

      for (const campaignDoc of campaigns.docs) {
        const campaign = campaignDoc.data();
        const campaignId = campaignDoc.id;

        // Calculate revenue from campaign users
        const installs = await db.collection('uaInstalls')
          .where('campaign', '==', campaignId)
          .get();

        let totalRevenue = 0;
        let day1Retained = 0;
        let day7Retained = 0;
        let day30Retained = 0;

        for (const install of installs.docs) {
          const installData = install.data();
          totalRevenue += installData.ltv || 0;
          
          if (installData.day1Retained) day1Retained++;
          if (installData.day7Retained) day7Retained++;
          if (installData.day30Retained) day30Retained++;
        }

        const spent = campaign.spent || 0;
        const roas = spent > 0 ? totalRevenue / spent : 0;
        const avgLtv = installs.size > 0 ? totalRevenue / installs.size : 0;

        // Update campaign
        batch.update(campaignDoc.ref, {
          revenue: totalRevenue,
          roas,
          avgLtv,
          day1Retention: installs.size > 0 ? day1Retained / installs.size : 0,
          day7Retention: installs.size > 0 ? day7Retained / installs.size : 0,
          day30Retention: installs.size > 0 ? day30Retained / installs.size : 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Auto-boost high ROAS campaigns
        if (roas > 2.0 && campaign.status === 'ACTIVE') {
          await boostCampaign(campaignId, roas);
        }

        // Auto-pause low ROAS campaigns
        if (roas < 0.5 && installs.size > 100) {
          await pauseCampaign(campaignId, 'LOW_ROAS', { roas });
        }
      }

      await batch.commit();

      console.log(`Updated ROAS for ${campaigns.size} campaigns`);
      return null;

    } catch (error) {
      console.error('Track ROAS error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 4️⃣ DETECT FRAUD PATTERNS
// ═══════════════════════════════════════════════════════════════

async function detectInstallFraud(
  userId: string,
  ipHash: string,
  deviceHash: string,
  countryCode: string
): Promise<number> {
  let fraudScore = 0;

  // Check for IP cluster
  const ipInstalls = await db.collection('uaInstalls')
    .where('ipHash', '==', ipHash)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86400000)))
    .count()
    .get();

  if (ipInstalls.data().count > 5) fraudScore += 30;
  if (ipInstalls.data().count > 10) fraudScore += 40;

  // Check for device cluster
  const deviceInstalls = await db.collection('uaInstalls')
    .where('deviceId', '==', deviceHash)
    .count()
    .get();

  if (deviceInstalls.data().count > 1) fraudScore += 25;

  // Check for rapid succession installs
  const recentInstalls = await db.collection('uaInstalls')
    .where('countryCode', '==', countryCode)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 300000))) // 5 min
    .where('ipHash', '==', ipHash)
    .count()
    .get();

  if (recentInstalls.data().count > 2) fraudScore += 50;

  // Create fraud cluster if score is high
  if (fraudScore >= 70) {
    await db.collection('fraudClusters').add({
      type: 'INSTALL_FRAUD',
      countryCode,
      ipHash,
      deviceHash,
      userId,
      riskScore: fraudScore,
      detectedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolved: false
    });

    // Trigger alert
    await createAlert('FRAUD_DETECTED', 'HIGH', {
      userId,
      countryCode,
      fraudScore,
      type: 'install_fraud'
    });
  }

  return Math.min(fraudScore, 100);
}

// ═══════════════════════════════════════════════════════════════
// 5️⃣ CAMPAIGN AUTOMATION
// ═══════════════════════════════════════════════════════════════

async function pauseCampaign(campaignId: string, reason: string, data: any) {
  await db.collection('uaCampaigns').doc(campaignId).update({
    status: 'PAUSED',
    pauseReason: reason,
    pausedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await createAlert('CAMPAIGN_PAUSED', 'MEDIUM', {
    campaignId,
    reason,
    data
  });

  await logAudit('CAMPAIGN_PAUSED', 'system', {
    campaignId,
    reason,
    data
  });
}

async function boostCampaign(campaignId: string, roas: number) {
  const campaign = await db.collection('uaCampaigns').doc(campaignId).get();
  const currentBudget = campaign.data()?.budget || 0;
  const newBudget = currentBudget * 1.5; // 50% increase

  await db.collection('uaCampaigns').doc(campaignId).update({
    budget: newBudget,
    boostedAt: admin.firestore.FieldValue.serverTimestamp(),
    boostReason: `High ROAS: ${roas.toFixed(2)}`
  });

  await createAlert('CAMPAIGN_BOOSTED', 'LOW', {
    campaignId,
    roas,
    oldBudget: currentBudget,
    newBudget
  });

  await logAudit('CAMPAIGN_BOOSTED', 'system', {
    campaignId,
    roas,
    newBudget
  });
}

async function updateCampaignInstalls(campaignId: string) {
  await db.collection('uaCampaigns').doc(campaignId).update({
    installs: admin.firestore.FieldValue.increment(1),
    lastInstallAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣ INTERLOCK SYSTEM
// ═══════════════════════════════════════════════════════════════

async function triggerInterlock(countryCode: string, type: string, data: any) {
  const interlockRef = db.collection('launchInterlocks').doc();
  await interlockRef.set({
    countryCode,
    type,
    data,
    active: true,
    triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedAt: null
  });

  // Auto-pause country
  await db.collection('geoLaunchPhases').doc(countryCode).update({
    phase: 'SOFT',
    interlockTriggered: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Create critical alert
  await createAlert('INTERLOCK_TRIGGERED', 'CRITICAL', {
    countryCode,
    type,
    data
  });

  // Log to audit
  await logAudit('INTERLOCK_TRIGGERED', 'system', {
    countryCode,
    type,
    data
  });
}

// ═══════════════════════════════════════════════════════════════
// 7️⃣ HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function createAlert(type: string, severity: string, data: any) {
  await db.collection('launchAlerts').add({
    type,
    severity,
    data,
    acknowledged: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function logAudit(action: string, userId: string, data: any) {
  await db.collection('launchAuditLog').add({
    action,
    userId,
    data,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

// ═══════════════════════════════════════════════════════════════
// 8️⃣ RETENTION TRACKING
// ═══════════════════════════════════════════════════════════════

export const pack368_updateRetention = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      // Day 1 retention
      const day1Cutoff = new Date(Date.now() - 86400000); // 24 hours ago
      const day1Installs = await db.collection('uaInstalls')
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(day1Cutoff))
        .where('day1Retained', '==', null)
        .limit(1000)
        .get();

      for (const install of day1Installs.docs) {
        const isRetained = await checkUserActivity(install.data().userId, 86400000);
        await install.ref.update({ day1Retained: isRetained });
      }

      // Day 7 retention
      const day7Cutoff = new Date(Date.now() - 604800000); // 7 days ago
      const day7Installs = await db.collection('uaInstalls')
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(day7Cutoff))
        .where('day7Retained', '==', null)
        .limit(1000)
        .get();

      for (const install of day7Installs.docs) {
        const isRetained = await checkUserActivity(install.data().userId, 604800000);
        await install.ref.update({ day7Retained: isRetained });
      }

      // Day 30 retention
      const day30Cutoff = new Date(Date.now() - 2592000000); // 30 days ago
      const day30Installs = await db.collection('uaInstalls')
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(day30Cutoff))
        .where('day30Retained', '==', null)
        .limit(1000)
        .get();

      for (const install of day30Installs.docs) {
        const isRetained = await checkUserActivity(install.data().userId, 2592000000);
        await install.ref.update({ day30Retained: isRetained });
      }

      console.log('Updated retention metrics');
      return null;

    } catch (error) {
      console.error('Update retention error:', error);
      throw error;
    }
  });

async function checkUserActivity(userId: string, windowMs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  
  // Check various activity indicators
  const activities = await db.collection('userActivity')
    .where('userId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoff))
    .limit(1)
    .get();

  return !activities.empty;
}
