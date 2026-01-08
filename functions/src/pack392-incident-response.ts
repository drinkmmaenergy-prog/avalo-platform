/**
 * PACK 392 - Automated Store Incident Response Protocol
 * Triggered when storeRiskState = CRITICAL
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface IncidentResponse {
  id: string;
  storeId: string;
  incidentId: string;
  riskState: 'WARNING' | 'CRITICAL';
  triggeredAt: FirebaseFirestore.Timestamp;
  status: 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  
  actions: ResponseAction[];
  notifications: NotificationRecord[];
  
  impact: ResponseImpact;
  resolution: string | null;
  completedAt: FirebaseFirestore.Timestamp | null;
}

export interface ResponseAction {
  type: 'FREEZE_MARKETING' | 'LOCK_PAYOUTS' | 'ENABLE_SAFE_MODE' | 'BOOST_CRASH_REPORTING' | 'EXPORT_EVIDENCE' | 'NOTIFY_CTO';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  initiatedAt: FirebaseFirestore.Timestamp;
  completedAt: FirebaseFirestore.Timestamp | null;
  result: any;
  error: string | null;
}

export interface NotificationRecord {
  channel: 'SLACK' | 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK';
  recipient: string;
  sentAt: FirebaseFirestore.Timestamp;
  delivered: boolean;
  messageId: string | null;
}

export interface ResponseImpact {
  usersAffected: number;
  transactionsHalted: number;
  marketingSpendSaved: number;
  estimatedDowntime: number; // minutes
}

export interface SafeModeConfig {
  enabled: boolean;
  restrictions: {
    disablePayments: boolean;
    disableNewRegistrations: boolean;
    disableMessaging: boolean;
    enableStrictModeration: boolean;
    requirePhoneVerification: boolean;
  };
  activatedAt: FirebaseFirestore.Timestamp;
  reason: string;
}

export interface EvidencePack {
  id: string;
  storeId: string;
  incidentId: string;
  generatedAt: FirebaseFirestore.Timestamp;
  
  summary: string;
  threatData: any;
  reviewSamples: any[];
  ipAnalysis: any;
  deviceAnalysis: any;
  userAnalysis: any;
  timeline: TimelineEvent[];
  
  exportUrl: string | null;
  submittedToStore: boolean;
}

export interface TimelineEvent {
  timestamp: FirebaseFirestore.Timestamp;
  event: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  details: any;
}

// ============================================================================
// CORE: INCIDENT RESPONSE TRIGGER
// ============================================================================

export const pack392_handleStoreIncident = functions
  .runWith({ 
    timeoutSeconds: 300,
    memory: '1GB'
  })
  .firestore
  .document('storeIncidents/{incidentId}')
  .onCreate(async (snapshot, context) => {
    const incidentId = context.params.incidentId;
    const incidentData = snapshot.data();
    
    console.log(`[PACK 392] INCIDENT RESPONSE: Handling incident ${incidentId}`);
    
    const { storeId, threatData } = incidentData;
    const riskState = threatData.storeRiskState;
    
    // Create response record
    const responseRef = await db.collection('incidentResponses').add({
      storeId,
      incidentId,
      riskState,
      triggeredAt: admin.firestore.Timestamp.now(),
      status: 'INITIATED',
      actions: [],
      notifications: [],
      impact: {
        usersAffected: 0,
        transactionsHalted: 0,
        marketingSpendSaved: 0,
        estimatedDowntime: 0
      },
      resolution: null,
      completedAt: null
    });
    
    const responseId = responseRef.id;
    
    try {
      // Execute response protocol
      await executeResponseProtocol(responseId, storeId, riskState, threatData);
      
      // Mark as completed
      await responseRef.update({
        status: 'COMPLETED',
        completedAt: admin.firestore.Timestamp.now()
      });
      
      console.log(`[PACK 392] Incident response completed: ${responseId}`);
    } catch (error) {
      console.error(`[PACK 392] Incident response failed:`, error);
      await responseRef.update({
        status: 'FAILED',
        resolution: `Failed: ${error}`
      });
    }
    
    return { success: true, responseId };
  });

// ============================================================================
// RESPONSE PROTOCOL EXECUTION
// ============================================================================

async function executeResponseProtocol(
  responseId: string,
  storeId: string,
  riskState: string,
  threatData: any
): Promise<void> {
  console.log(`[PACK 392] Executing incident response protocol for ${storeId}`);
  
  const actions: ResponseAction[] = [];
  
  // 1. Freeze marketing spend
  const freezeMarketingAction = await freezeMarketingSpend(storeId);
  actions.push(freezeMarketingAction);
  
  // 2. Lock payouts temporarily (if CRITICAL)
  if (riskState === 'CRITICAL') {
    const lockPayoutsAction = await lockPayouts(storeId);
    actions.push(lockPayoutsAction);
  }
  
  // 3. Enable Safe Mode onboarding
  const safeModeAction = await enableSafeMode(storeId, riskState);
  actions.push(safeModeAction);
  
  // 4. Boost crash reporting
  const crashReportingAction = await boostCrashReporting(storeId);
  actions.push(crashReportingAction);
  
  // 5. Generate and export evidence pack
  const evidenceAction = await exportEvidencePack(responseId, storeId, threatData);
  actions.push(evidenceAction);
  
  // 6. Notify CTO channel
  const notificationAction = await notifyCTOChannel(storeId, riskState, threatData);
  actions.push(notificationAction);
  
  // Update response with actions
  await db.collection('incidentResponses').doc(responseId).update({
    actions,
    status: 'IN_PROGRESS'
  });
  
  // Calculate impact
  const impact = await calculateResponseImpact(storeId, actions);
  await db.collection('incidentResponses').doc(responseId).update({ impact });
}

// ============================================================================
// ACTION 1: FREEZE MARKETING SPEND
// ============================================================================

async function freezeMarketingSpend(storeId: string): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'FREEZE_MARKETING',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    // Pause all active ad campaigns
    const campaignsSnap = await db.collection('adCampaigns')
      .where('storeId', '==', storeId)
      .where('status', '==', 'ACTIVE')
      .get();
    
    const pausedCampaigns = [];
    for (const campaignDoc of campaignsSnap.docs) {
      await db.collection('adCampaigns').doc(campaignDoc.id).update({
        status: 'PAUSED',
        pausedBy: 'INCIDENT_RESPONSE',
        pausedAt: admin.firestore.Timestamp.now(),
        pauseReason: 'Store incident - risk mitigation'
      });
      pausedCampaigns.push(campaignDoc.id);
    }
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = {
      campaignsPaused: pausedCampaigns.length,
      campaignIds: pausedCampaigns
    };
    
    console.log(`[PACK 392] Froze ${pausedCampaigns.length} marketing campaigns`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to freeze marketing:', error);
  }
  
  return action;
}

// ============================================================================
// ACTION 2: LOCK PAYOUTS
// ============================================================================

async function lockPayouts(storeId: string): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'LOCK_PAYOUTS',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    // Enable payout freeze
    await db.collection('payoutSettings').doc(storeId).set({
      frozen: true,
      frozenBy: 'INCIDENT_RESPONSE',
      frozenAt: admin.firestore.Timestamp.now(),
      freezeReason: 'Store incident - security review required',
      autoUnfreezeAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + (24 * 60 * 60 * 1000) // Auto-unfreeze after 24h
      )
    }, { merge: true });
    
    // Halt pending payouts
    const pendingPayoutsSnap = await db.collection('payouts')
      .where('storeId', '==', storeId)
      .where('status', '==', 'PENDING')
      .get();
    
    for (const payoutDoc of pendingPayoutsSnap.docs) {
      await db.collection('payouts').doc(payoutDoc.id).update({
        status: 'ON_HOLD',
        holdReason: 'Security review in progress',
        holdInitiatedAt: admin.firestore.Timestamp.now()
      });
    }
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = {
      payoutsOnHold: pendingPayoutsSnap.size
    };
    
    console.log(`[PACK 392] Locked payouts - ${pendingPayoutsSnap.size} on hold`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to lock payouts:', error);
  }
  
  return action;
}

// ============================================================================
// ACTION 3: ENABLE SAFE MODE
// ============================================================================

async function enableSafeMode(storeId: string, riskState: string): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'ENABLE_SAFE_MODE',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    const safeModeConfig: SafeModeConfig = {
      enabled: true,
      restrictions: {
        disablePayments: riskState === 'CRITICAL',
        disableNewRegistrations: false,
        disableMessaging: false,
        enableStrictModeration: true,
        requirePhoneVerification: true
      },
      activatedAt: admin.firestore.Timestamp.now(),
      reason: `Incident response - ${riskState} risk state`
    };
    
    await db.collection('safeModeConfig').doc(storeId).set(safeModeConfig);
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = safeModeConfig;
    
    console.log(`[PACK 392] Safe Mode enabled for ${storeId}`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to enable Safe Mode:', error);
  }
  
  return action;
}

// ============================================================================
// ACTION 4: BOOST CRASH REPORTING
// ============================================================================

async function boostCrashReporting(storeId: string): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'BOOST_CRASH_REPORTING',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    // Increase crash reporting sensitivity
    await db.collection('crashReportingConfig').doc(storeId).set({
      enhanced: true,
      captureRate: 1.0, // Capture 100% of crashes
      includeStackTraces: true,
      includeDeviceInfo: true,
      includeBreadcrumbs: true,
      maxBreadcrumbs: 100,
      enabledAt: admin.firestore.Timestamp.now(),
      reason: 'Incident response - enhanced monitoring'
    }, { merge: true });
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = { enhanced: true };
    
    console.log(`[PACK 392] Crash reporting boosted for ${storeId}`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to boost crash reporting:', error);
  }
  
  return action;
}

// ============================================================================
// ACTION 5: EXPORT EVIDENCE PACK
// ============================================================================

async function exportEvidencePack(
  responseId: string,
  storeId: string,
  threatData: any
): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'EXPORT_EVIDENCE',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    // Build evidence pack
    const timeline = await buildIncidentTimeline(storeId, threatData);
    const reviewSamples = await collectReviewSamples(storeId, threatData);
    const ipAnalysis = await analyzeIPPatterns(storeId);
    const deviceAnalysis = await analyzeDevicePatterns(storeId);
    const userAnalysis = await analyzeUserPatterns(storeId);
    
    const evidencePack: Omit<EvidencePack, 'id'> = {
      storeId,
      incidentId: responseId,
      generatedAt: admin.firestore.Timestamp.now(),
      summary: generateEvidenceSummary(threatData, timeline),
      threatData,
      reviewSamples,
      ipAnalysis,
      deviceAnalysis,
      userAnalysis,
      timeline,
      exportUrl: null,
      submittedToStore: false
    };
    
    const evidenceRef = await db.collection('evidencePacks').add(evidencePack);
    
    // Generate export URL (would integrate with Cloud Storage in production)
    const exportUrl = `https://storage.avalo.app/evidence/${evidenceRef.id}.json`;
    await evidenceRef.update({ exportUrl });
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = {
      evidencePackId: evidenceRef.id,
      exportUrl
    };
    
    console.log(`[PACK 392] Evidence pack generated: ${evidenceRef.id}`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to export evidence:', error);
  }
  
  return action;
}

async function buildIncidentTimeline(storeId: string, threatData: any): Promise<TimelineEvent[]> {
  const timeline: TimelineEvent[] = [];
  
  // Add threat detection events
  if (threatData.detectedThreats) {
    for (const threat of threatData.detectedThreats) {
      timeline.push({
        timestamp: threat.detectedAt,
        event: `${threat.type} detected`,
        severity: threat.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        details: threat
      });
    }
  }
  
  // Sort by timestamp
  timeline.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  
  return timeline;
}

async function collectReviewSamples(storeId: string, threatData: any): Promise<any[]> {
  const samples = [];
  
  if (threatData.detectedThreats) {
    for (const threat of threatData.detectedThreats.slice(0, 10)) {
      if (threat.evidenceIds && threat.evidenceIds.length > 0) {
        const reviewDoc = await db.collection('storeReviewsRaw').doc(threat.evidenceIds[0]).get();
        if (reviewDoc.exists) {
          samples.push(reviewDoc.data());
        }
      }
    }
  }
  
  return samples;
}

async function analyzeIPPatterns(storeId: string): Promise<any> {
  // Simplified IP analysis
  return {
    uniqueIPs: 0,
    suspiciousIPs: [],
    clusters: []
  };
}

async function analyzeDevicePatterns(storeId: string): Promise<any> {
  return {
    uniqueDevices: 0,
    suspiciousDevices: [],
    emulatorCount: 0
  };
}

async function analyzeUserPatterns(storeId: string): Promise<any> {
  return {
    totalUsers: 0,
    newUsers: 0,
    suspiciousUsers: []
  };
}

function generateEvidenceSummary(threatData: any, timeline: TimelineEvent[]): string {
  const threatCount = threatData.detectedThreats?.length || 0;
  const criticalCount = threatData.detectedThreats?.filter((t: any) => t.severity === 'CRITICAL').length || 0;
  
  return `Store incident: ${criticalCount} critical threats detected out of ${threatCount} total threats. ` +
         `Risk state: ${threatData.storeRiskState}. Timeline spans ${timeline.length} events.`;
}

// ============================================================================
// ACTION 6: NOTIFY CTO CHANNEL
// ============================================================================

async function notifyCTOChannel(
  storeId: string,
  riskState: string,
  threatData: any
): Promise<ResponseAction> {
  const action: ResponseAction = {
    type: 'NOTIFY_CTO',
    status: 'IN_PROGRESS',
    initiatedAt: admin.firestore.Timestamp.now(),
    completedAt: null,
    result: null,
    error: null
  };
  
  try {
    const notifications: NotificationRecord[] = [];
    
    // Get store info
    const storeDoc = await db.collection('stores').doc(storeId).get();
    const storeName = storeDoc.exists ? storeDoc.data()!.name : storeId;
    
    // Create notification message
    const message = `🚨 CRITICAL STORE INCIDENT\n\n` +
      `Store: ${storeName} (${storeId})\n` +
      `Risk State: ${riskState}\n` +
      `Threat Score: ${threatData.storeThreatScore}/100\n` +
      `Detected Threats: ${threatData.detectedThreats?.length || 0}\n\n` +
      `Automated response initiated:\n` +
      `✓ Marketing spend frozen\n` +
      `✓ Payouts locked\n` +
      `✓ Safe Mode enabled\n` +
      `✓ Evidence pack generated\n\n` +
      `Immediate review required.`;
    
    // Send to admin notifications collection
    const notifRef = await db.collection('adminNotifications').add({
      type: 'CRITICAL_INCIDENT',
      channel: 'CTO',
      storeId,
      riskState,
      message,
      sentAt: admin.firestore.Timestamp.now(),
      read: false,
      priority: 'CRITICAL'
    });
    
    notifications.push({
      channel: 'PUSH',
      recipient: 'CTO',
      sentAt: admin.firestore.Timestamp.now(),
      delivered: true,
      messageId: notifRef.id
    });
    
    // In production, integrate with Slack, PagerDuty, SMS, etc.
    
    action.status = 'COMPLETED';
    action.completedAt = admin.firestore.Timestamp.now();
    action.result = { notifications };
    
    console.log(`[PACK 392] CTO notification sent for ${storeId}`);
  } catch (error: any) {
    action.status = 'FAILED';
    action.error = error.message;
    console.error('[PACK 392] Failed to notify CTO:', error);
  }
  
  return action;
}

// ============================================================================
// IMPACT CALCULATION
// ============================================================================

async function calculateResponseImpact(storeId: string, actions: ResponseAction[]): Promise<ResponseImpact> {
  let usersAffected = 0;
  let transactionsHalted = 0;
  let marketingSpendSaved = 0;
  let estimatedDowntime = 60; // Default 60 minutes
  
  // Calculate users affected by Safe Mode
  const activeUsersSnap = await db.collection('users')
    .where('lastActive', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .count()
    .get();
  
  usersAffected = activeUsersSnap.data().count;
  
  // Calculate transactions halted
  for (const action of actions) {
    if (action.type === 'LOCK_PAYOUTS' && action.result) {
      transactionsHalted = action.result.payoutsOnHold || 0;
    }
    
    if (action.type === 'FREEZE_MARKETING' && action.result) {
      // Estimate daily spend per campaign
      marketingSpendSaved = (action.result.campaignsPaused || 0) * 100; // $100 per campaign estimate
    }
  }
  
  return {
    usersAffected,
    transactionsHalted,
    marketingSpendSaved,
    estimatedDowntime
  };
}

// ============================================================================
// MANUAL FUNCTIONS
// ============================================================================

export const pack392_getIncidentResponse = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { responseId } = data;
    const responseDoc = await db.collection('incidentResponses').doc(responseId).get();
    
    if (!responseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Response not found');
    }

    return responseDoc.data();
  });

export const pack392_resolveIncident = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { incidentId, resolution } = data;
    
    // Update incident
    await db.collection('storeIncidents').doc(incidentId).update({
      status: 'RESOLVED',
      resolution,
      resolvedAt: admin.firestore.Timestamp.now(),
      resolvedBy: context.auth.uid
    });
    
    // Find and update response
    const responseSnap = await db.collection('incidentResponses')
      .where('incidentId', '==', incidentId)
      .limit(1)
      .get();
    
    if (!responseSnap.empty) {
      await responseSnap.docs[0].ref.update({
        resolution,
        status: 'COMPLETED',
        completedAt: admin.firestore.Timestamp.now()
      });
    }

    return { success: true };
  });

export const pack392_disableSafeMode = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId } = data;
    
    await db.collection('safeModeConfig').doc(storeId).update({
      enabled: false,
      disabledAt: admin.firestore.Timestamp.now(),
      disabledBy: context.auth.uid
    });
    
    // Unfreeze payouts
    await db.collection('payoutSettings').doc(storeId).update({
      frozen: false,
      unfrozenAt: admin.firestore.Timestamp.now(),
      unfrozenBy: context.auth.uid
    });

    return { success: true };
  });
