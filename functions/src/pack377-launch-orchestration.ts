/**
 * PACK 377 — Global Public Launch Orchestration Engine
 * 
 * Coordinates controlled global rollout of Avalo across regions while protecting:
 * - Infrastructure from overload
 * - Reputation from fraud spikes
 * - Payments from abuse
 * - Growth efficiency
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Placeholder for audit logging (integrate with PACK 296)
const pack296_auditLog = async (data: any) => {
  console.log('Audit Log:', data);
  // TODO: Integrate with actual PACK 296 implementation
};

// ========================================
// 1️⃣ PHASED COUNTRY ROLLOUT ENGINE
// ========================================

/**
 * Activate a country phase for launch
 */
export const pack377_activateCountryPhase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { countryCode, phase, dailyUserCap, dailyPaymentCap, dailyCreatorCap } = data;

  // Verify admin privileges
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  // Validate phase
  const validPhases = ['alpha', 'soft', 'public', 'pause'];
  if (!validPhases.includes(phase)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phase');
  }

  // Create launch phase record
  const phaseData = {
    countryCode,
    phase,
    dailyUserCap: dailyUserCap || 1000,
    dailyPaymentCap: dailyPaymentCap || 10000,
    dailyCreatorCap: dailyCreatorCap || 100,
    status: 'active',
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    activatedBy: context.auth.uid,
    pausedReason: null,
  };

  await db.collection('launchPhases').doc(countryCode).set(phaseData);

  // Initialize capacity counters
  await db.collection('launchCapacity').doc(countryCode).set({
    date: new Date().toISOString().split('T')[0],
    userCount: 0,
    paymentCount: 0,
    creatorCount: 0,
    lastReset: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Audit log
  await pack296_auditLog({
    action: 'launch.country_activated',
    actorId: context.auth.uid,
    resourceType: 'launchPhase',
    resourceId: countryCode,
    details: phaseData,
    severity: 'high',
  });

  return {
    success: true,
    countryCode,
    phase,
    caps: {
      users: dailyUserCap,
      payments: dailyPaymentCap,
      creators: dailyCreatorCap,
    },
  };
});

/**
 * Pause a country phase (emergency stop)
 */
export const pack377_pauseCountryPhase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { countryCode, reason } = data;

  // Verify admin privileges
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  // Update launch phase
  await db.collection('launchPhases').doc(countryCode).update({
    phase: 'pause',
    status: 'paused',
    pausedAt: admin.firestore.FieldValue.serverTimestamp(),
    pausedBy: context.auth.uid,
    pausedReason: reason,
  });

  // Audit log
  await pack296_auditLog({
    action: 'launch.country_paused',
    actorId: context.auth.uid,
    resourceType: 'launchPhase',
    resourceId: countryCode,
    details: { reason },
    severity: 'critical',
  });

  return { success: true, countryCode, status: 'paused' };
});

/**
 * Enforce country caps before critical operations
 */
export const pack377_enforceCountryCaps = async (
  countryCode: string,
  operation: 'user' | 'payment' | 'creator'
): Promise<boolean> => {
  // Get launch phase
  const phaseDoc = await db.collection('launchPhases').doc(countryCode).get();
  
  // If no launch phase, allow (country not controlled)
  if (!phaseDoc.exists) {
    return true;
  }

  const phaseData = phaseDoc.data()!;

  // If paused, block all operations
  if (phaseData.status === 'paused' || phaseData.phase === 'pause') {
    return false;
  }

  // Get current capacity
  const today = new Date().toISOString().split('T')[0];
  const capacityRef = db.collection('launchCapacity').doc(countryCode);
  const capacityDoc = await capacityRef.get();

  if (!capacityDoc.exists) {
    // Initialize capacity
    await capacityRef.set({
      date: today,
      userCount: 0,
      paymentCount: 0,
      creatorCount: 0,
      lastReset: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  let capacityData = capacityDoc.data()!;

  // Reset counters if new day
  if (capacityData.date !== today) {
    await capacityRef.set({
      date: today,
      userCount: 0,
      paymentCount: 0,
      creatorCount: 0,
      lastReset: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  // Check appropriate cap
  if (operation === 'user') {
    if (capacityData.userCount >= phaseData.dailyUserCap) {
      return false;
    }
    await capacityRef.update({
      userCount: admin.firestore.FieldValue.increment(1),
    });
  } else if (operation === 'payment') {
    if (capacityData.paymentCount >= phaseData.dailyPaymentCap) {
      return false;
    }
    await capacityRef.update({
      paymentCount: admin.firestore.FieldValue.increment(1),
    });
  } else if (operation === 'creator') {
    if (capacityData.creatorCount >= phaseData.dailyCreatorCap) {
      return false;
    }
    await capacityRef.update({
      creatorCount: admin.firestore.FieldValue.increment(1),
    });
  }

  return true;
});

// ========================================
// 2️⃣ INFRASTRUCTURE LOAD CONTROL
// ========================================

/**
 * Monitor infrastructure metrics
 */
export const pack377_infraLoadGate = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const metrics = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      
      // Cloud Functions execution rate (approximation from queues)
      functionsExecutionRate: 0,
      
      // Firestore write saturation (from recent operations)
      firestoreWrites: 0,
      
      // WebRTC concurrent sessions (from active calls)
      webrtcSessions: 0,
      
      // Wallet payment rate (from recent transactions)
      paymentRate: 0,
      
      // Safety ticket volume (from recent reports)
      safetyTickets: 0,
    };

    // Gather WebRTC sessions
    const activeCalls = await db.collection('calls')
      .where('status', '==', 'active')
      .count()
      .get();
    metrics.webrtcSessions = activeCalls.data().count;

    // Gather recent payments (last minute)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentPayments = await db.collection('transactions')
      .where('createdAt', '>', oneMinuteAgo)
      .count()
      .get();
    metrics.paymentRate = recentPayments.data().count;

    // Gather recent safety tickets (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 300000);
    const recentTickets = await db.collection('safetyTickets')
      .where('createdAt', '>', fiveMinutesAgo)
      .count()
      .get();
    metrics.safetyTickets = recentTickets.data().count;

    // Determine if overload
    const isOverload = 
      metrics.webrtcSessions > 10000 ||
      metrics.paymentRate > 100 ||
      metrics.safetyTickets > 500;

    // Store metrics
    await db.collection('infraMetrics').add({
      ...metrics,
      isOverload,
      metricType: 'load_gate',
    });

    // Update throttle state
    await db.collection('infraThrottleState').doc('global').set({
      isThrottled: isOverload,
      reason: isOverload ? 'Infrastructure overload detected' : null,
      webrtcSessions: metrics.webrtcSessions,
      paymentRate: metrics.paymentRate,
      safetyTickets: metrics.safetyTickets,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (isOverload) {
      // Alert admins
      await pack296_auditLog({
        action: 'launch.infrastructure_overload',
        actorId: 'system',
        resourceType: 'infrastructure',
        resourceId: 'global',
        details: metrics,
        severity: 'critical',
      });
    }

    return null;
  });

/**
 * Auto-throttle during scale events
 */
export const pack377_scalingAutoThrottle = async (): Promise<boolean> => {
  const throttleDoc = await db.collection('infraThrottleState').doc('global').get();
  
  if (!throttleDoc.exists) {
    return false;
  }

  return throttleDoc.data()?.isThrottled || false;
};

// ========================================
// 3️⃣ PR & INFLUENCER LAUNCH COORDINATOR
// ========================================

/**
 * Create campaign traffic forecast
 */
export const pack377_campaignTrafficForecast = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { influencerId, region, trafficForecast, expectedInstalls, creatorInflow, conversionBenchmarks } = data;

  // Verify admin or marketing privileges
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || (!userDoc.data()?.isAdmin && !userDoc.data()?.isMarketing)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or Marketing access required');
  }

  // Create campaign
  const campaignRef = await db.collection('launchCampaigns').add({
    influencerId,
    region,
    trafficForecast,
    expectedInstalls,
    creatorInflow,
    conversionBenchmarks,
    status: 'planning',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
    actualInstalls: 0,
    actualCreators: 0,
    actualRevenue: 0,
  });

  // Pre-warm infrastructure based on forecast
  if (trafficForecast > 10000) {
    await pack296_auditLog({
      action: 'launch.campaign_prewarm',
      actorId: context.auth.uid,
      resourceType: 'campaign',
      resourceId: campaignRef.id,
      details: { trafficForecast, region },
      severity: 'high',
    });
  }

  return {
    success: true,
    campaignId: campaignRef.id,
    status: 'planning',
  };
});

/**
 * Track campaign ROI
 */
export const pack377_campaignROITracker = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { campaignId } = data;

  const campaignDoc = await db.collection('launchCampaigns').doc(campaignId).get();
  if (!campaignDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Campaign not found');
  }

  const campaignData = campaignDoc.data()!;

  // Calculate ROI metrics
  const roi = {
    expectedInstalls: campaignData.expectedInstalls,
    actualInstalls: campaignData.actualInstalls || 0,
    installConversion: ((campaignData.actualInstalls || 0) / campaignData.expectedInstalls) * 100,
    
    expectedCreators: campaignData.creatorInflow,
    actualCreators: campaignData.actualCreators || 0,
    creatorConversion: ((campaignData.actualCreators || 0) / campaignData.creatorInflow) * 100,
    
    actualRevenue: campaignData.actualRevenue || 0,
    revenuePerInstall: (campaignData.actualRevenue || 0) / (campaignData.actualInstalls || 1),
  };

  // Store tracking data
  await db.collection('campaignTracking').add({
    campaignId,
    region: campaignData.region,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...roi,
  });

  return roi;
});

// ========================================
// 4️⃣ FRAUD & ATTACK LAUNCH SHIELD
// ========================================

/**
 * Launch threat shield
 */
export const pack377_launchThreatShield = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const fiveMinutesAgo = new Date(Date.now() - 300000);

    // Detect device farming
    const suspiciousDevices = await db.collection('users')
      .where('createdAt', '>', fiveMinutesAgo)
      .get();

    const deviceMap = new Map<string, number>();
    suspiciousDevices.docs.forEach(doc => {
      const deviceId = doc.data().deviceId;
      if (deviceId) {
        deviceMap.set(deviceId, (deviceMap.get(deviceId) || 0) + 1);
      }
    });

    // Flag devices with multiple accounts
    const deviceEntries = Array.from(deviceMap.entries());
    for (const entry of deviceEntries) {
      const deviceId = entry[0];
      const count = entry[1];
      if (count > 3) {
        await db.collection('launchThreatAlerts').add({
          threatType: 'device_farming',
          deviceId,
          accountCount: count,
          severity: 'high',
          detectedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
        });

        await pack296_auditLog({
          action: 'launch.threat_detected',
          actorId: 'system',
          resourceType: 'device',
          resourceId: deviceId,
          details: { threatType: 'device_farming', count },
          severity: 'high',
        });
      }
    }

    // Detect fake creator registration rings
    const recentCreators = await db.collection('users')
      .where('isCreator', '==', true)
      .where('createdAt', '>', fiveMinutesAgo)
      .get();

    if (recentCreators.size > 50) {
      await db.collection('launchThreatAlerts').add({
        threatType: 'creator_ring',
        creatorCount: recentCreators.size,
        severity: 'critical',
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });
    }

    // Detect token abuse bursts
    const recentTransactions = await db.collection('transactions')
      .where('createdAt', '>', fiveMinutesAgo)
      .get();

    if (recentTransactions.size > 1000) {
      await db.collection('launchThreatAlerts').add({
        threatType: 'payment_burst',
        transactionCount: recentTransactions.size,
        severity: 'critical',
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });
    }

    return null;
  });

// ========================================
// 5️⃣ REGION PERFORMANCE DASHBOARD
// ========================================

/**
 * Aggregate regional KPIs
 */
export const pack377_regionKPIAggregator = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const regions = ['PL', 'CZ', 'SK', 'HR', 'RO', 'BG', 'GR', 'IT']; // EU First Wave

    for (const region of regions) {
      const oneDayAgo = new Date(Date.now() - 86400000);

      // Count installs (new users)
      const installsSnap = await db.collection('users')
        .where('countryCode', '==', region)
        .where('createdAt', '>', oneDayAgo)
        .count()
        .get();

      // Count verified users
      const verifiedSnap = await db.collection('users')
        .where('countryCode', '==', region)
        .where('isVerified', '==', true)
        .count()
        .get();

      // Count active chats
      const activeChatsSnap = await db.collection('chats')
        .where('region', '==', region)
        .where('lastMessageAt', '>', oneDayAgo)
        .count()
        .get();

      // Sum token revenue
      const revenueSnap = await db.collection('transactions')
        .where('countryCode', '==', region)
        .where('createdAt', '>', oneDayAgo)
        .get();

      const tokenRevenue = revenueSnap.docs.reduce((sum, doc) => {
        return sum + (doc.data().amount || 0);
      }, 0);

      // Count support tickets
      const supportSnap = await db.collection('supportTickets')
        .where('countryCode', '==', region)
        .where('createdAt', '>', oneDayAgo)
        .count()
        .get();

      // Count safety incidents
      const safetySnap = await db.collection('safetyTickets')
        .where('countryCode', '==', region)
        .where('createdAt', '>', oneDayAgo)
        .count()
        .get();

      // Store metrics
      await db.collection('regionMetrics').add({
        region,
        date: new Date().toISOString().split('T')[0],
        installs: installsSnap.data().count,
        verifiedUsers: verifiedSnap.data().count,
        activeChats: activeChatsSnap.data().count,
        tokenRevenue,
        supportVolume: supportSnap.data().count,
        safetyIncidents: safetySnap.data().count,
        calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return null;
  });

/**
 * Calculate region risk score
 */
export const pack377_regionRiskScorer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { region } = data;

  // Get latest metrics
  const metricsSnap = await db.collection('regionMetrics')
    .where('region', '==', region)
    .orderBy('calculatedAt', 'desc')
    .limit(7) // Last 7 days
    .get();

  if (metricsSnap.empty) {
    return { region, riskLevel: 'unknown', score: 0 };
  }

  // Calculate risk factors
  let riskScore = 0;
  const metrics = metricsSnap.docs[0].data();

  // High support volume
  if (metrics.supportVolume > 100) riskScore += 2;
  else if (metrics.supportVolume > 50) riskScore += 1;

  // High safety incidents
  if (metrics.safetyIncidents > 50) riskScore += 3;
  else if (metrics.safetyIncidents > 20) riskScore += 2;
  else if (metrics.safetyIncidents > 10) riskScore += 1;

  // Low revenue (poor monetization)
  if (metrics.tokenRevenue < 1000) riskScore += 2;
  else if (metrics.tokenRevenue < 5000) riskScore += 1;

  // Low verification rate
  const verificationRate = metrics.verifiedUsers / (metrics.installs || 1);
  if (verificationRate < 0.3) riskScore += 2;
  else if (verificationRate < 0.5) riskScore += 1;

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 7) riskLevel = 'critical';
  else if (riskScore >= 5) riskLevel = 'high';
  else if (riskScore >= 3) riskLevel = 'medium';
  else riskLevel = 'low';

  // Store risk score
  await db.collection('regionRiskScores').doc(region).set({
    region,
    riskScore,
    riskLevel,
    factors: {
      supportVolume: metrics.supportVolume,
      safetyIncidents: metrics.safetyIncidents,
      tokenRevenue: metrics.tokenRevenue,
      verificationRate,
    },
    calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Auto-pause if critical
  if (riskLevel === 'critical') {
    // Trigger auto-pause via direct database update
    await db.collection('launchPhases').doc(region).update({
      phase: 'pause',
      status: 'paused',
      pausedAt: admin.firestore.FieldValue.serverTimestamp(),
      pausedBy: 'system',
      pausedReason: `Auto-paused due to critical risk score: ${riskScore}`,
    });

    await pack296_auditLog({
      action: 'launch.country_auto_paused',
      actorId: 'system',
      resourceType: 'launchPhase',
      resourceId: region,
      details: { riskScore, riskLevel },
      severity: 'critical',
    });
  }

  return { region, riskLevel, riskScore };
});

// ========================================
// 6️⃣ MARKET ENTRY SEQUENCER
// ========================================

/**
 * Initialize market entry sequence (EU First Wave)
 */
export const pack377_initMarketSequence = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Verify admin privileges
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const sequence = [
    { country: 'PL', name: 'Poland', order: 1 },
    { country: 'CZ', name: 'Czech Republic', order: 2 },
    { country: 'SK', name: 'Slovakia', order: 3 },
    { country: 'HR', name: 'Croatia', order: 4 },
    { country: 'RO', name: 'Romania', order: 5 },
    { country: 'BG', name: 'Bulgaria', order: 6 },
    { country: 'GR', name: 'Greece', order: 7 },
    { country: 'IT', name: 'Italy', order: 8 },
  ];

  const batch = db.batch();

  for (const entry of sequence) {
    const ref = db.collection('rolloutSequence').doc(entry.country);
    batch.set(ref, {
      countryCode: entry.country,
      countryName: entry.name,
      sequenceOrder: entry.order,
      status: 'pending',
      phase: null,
      activatedAt: null,
    });
  }

  await batch.commit();

  return { success: true, sequenceLength: sequence.length };
});

/**
 * Helper: Get user's country code
 */
export const getUserCountryCode = async (userId: string): Promise<string | null> => {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.data()?.countryCode || null;
};
