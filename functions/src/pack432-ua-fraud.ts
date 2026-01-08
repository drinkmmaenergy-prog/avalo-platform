/**
 * PACK 432 — UA Anti-Fraud Protection
 * 
 * Detects and prevents fraudulent UA activities including:
 * - Device farms
 * - Proxy/VPN installs
 * - Bot installs
 * - CPI manipulation
 * - Refund abuse loops
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

export interface FraudSignal {
  userId: string;
  installId: string;
  signalType: 
    | 'device_farm'
    | 'proxy_install'
    | 'bot_behavior'
    | 'cpi_manipulation'
    | 'refund_abuse'
    | 'click_injection'
    | 'install_hijacking';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  details: any;
  timestamp: FirebaseFirestore.Timestamp;
  resolved: boolean;
  action?: string;
}

export interface DeviceFingerprint {
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  os: string;
  model: string;
  screenResolution: string;
  timezone: string;
  language: string;
  installDate: FirebaseFirestore.Timestamp;
  suspiciousScore: number;
}

export interface FraudBlock {
  type: 'device' | 'ip' | 'network' | 'source';
  value: string;
  reason: string;
  blockedAt: FirebaseFirestore.Timestamp;
  permanent: boolean;
  expiresAt?: FirebaseFirestore.Timestamp;
}

// ===========================
// DEVICE FINGERPRINTING
// ===========================

export const captureDeviceFingerprint = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const {
    deviceId,
    ipAddress,
    userAgent,
    os,
    model,
    screenResolution,
    timezone,
    language
  } = data;

  const userId = context.auth.uid;

  // Check if device is already fingerprinted
  const existingFP = await db.collection('ua_device_fingerprints')
    .where('deviceId', '==', deviceId)
    .limit(1)
    .get();

  if (!existingFP.empty) {
    const existing = existingFP.docs[0].data();
    
    // Check for suspicious multi-account behavior
    if (existing.userId !== userId) {
      await createFraudSignal({
        userId,
        installId: '',
        signalType: 'device_farm',
        severity: 'high',
        confidence: 0.85,
        details: {
          deviceId,
          existingUserId: existing.userId,
          reason: 'Same device, different user'
        },
        timestamp: admin.firestore.Timestamp.now(),
        resolved: false
      });
    }
  }

  // Calculate suspiciousness score
  let suspiciousScore = 0;

  // Check if VPN/Proxy
  if (await isVPN(ipAddress)) {
    suspiciousScore += 0.3;
  }

  // Check if emulator
  if (model.includes('sdk') || model.includes('emulator') || model.includes('generic')) {
    suspiciousScore += 0.4;
  }

  // Check timezone mismatch
  const ipTimezone = await getTimezoneFromIP(ipAddress);
  if (ipTimezone && ipTimezone !== timezone) {
    suspiciousScore += 0.2;
  }

  // Check for bot user agents
  if (userAgent.includes('bot') || userAgent.includes('spider') || userAgent.includes('crawler')) {
    suspiciousScore += 0.5;
  }

  const fingerprint: DeviceFingerprint = {
    userId,
    deviceId,
    ipAddress,
    userAgent,
    os,
    model,
    screenResolution,
    timezone,
    language,
    installDate: admin.firestore.Timestamp.now(),
    suspiciousScore
  };

  await db.collection('ua_device_fingerprints').add(fingerprint);

  // If highly suspicious, flag immediately
  if (suspiciousScore > 0.7) {
    await createFraudSignal({
      userId,
      installId: '',
      signalType: 'device_farm',
      severity: 'critical',
      confidence: suspiciousScore,
      details: fingerprint,
      timestamp: admin.firestore.Timestamp.now(),
      resolved: false
    });
  }

  return {
    success: true,
    suspiciousScore
  };
});

// ===========================
// FRAUD DETECTION ALGORITHMS
// ===========================

export const detectDeviceFarms = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find devices with multiple accounts
    const fingerprints = await db.collection('ua_device_fingerprints')
      .where('installDate', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    const deviceMap: Record<string, string[]> = {};
    const ipMap: Record<string, string[]> = {};

    for (const doc of fingerprints.docs) {
      const fp = doc.data() as DeviceFingerprint;
      
      if (!deviceMap[fp.deviceId]) deviceMap[fp.deviceId] = [];
      deviceMap[fp.deviceId].push(fp.userId);

      if (!ipMap[fp.ipAddress]) ipMap[fp.ipAddress] = [];
      ipMap[fp.ipAddress].push(fp.userId);
    }

    // Flag device farms (same device, multiple users)
    for (const [deviceId, userIds] of Object.entries(deviceMap)) {
      if (userIds.length >= 3) {
        for (const userId of userIds) {
          await createFraudSignal({
            userId,
            installId: '',
            signalType: 'device_farm',
            severity: 'critical',
            confidence: Math.min(0.9, userIds.length / 10),
            details: {
              deviceId,
              accountCount: userIds.length,
              userIds
            },
            timestamp: admin.firestore.Timestamp.now(),
            resolved: false
          });
        }

        // Block device
        await blockFraudSource({
          type: 'device',
          value: deviceId,
          reason: `Device farm detected: ${userIds.length} accounts`,
          blockedAt: admin.firestore.Timestamp.now(),
          permanent: true
        });
      }
    }

    // Flag suspicious IPs (many installs from same IP)
    for (const [ipAddress, userIds] of Object.entries(ipMap)) {
      if (userIds.length >= 10) {
        for (const userId of userIds) {
          await createFraudSignal({
            userId,
            installId: '',
            signalType: 'proxy_install',
            severity: 'high',
            confidence: Math.min(0.85, userIds.length / 20),
            details: {
              ipAddress,
              installCount: userIds.length
            },
            timestamp: admin.firestore.Timestamp.now(),
            resolved: false
          });
        }

        // Block IP temporarily
        await blockFraudSource({
          type: 'ip',
          value: ipAddress,
          reason: `Suspicious install volume: ${userIds.length} installs`,
          blockedAt: admin.firestore.Timestamp.now(),
          permanent: false,
          expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        });
      }
    }

    return null;
  });

export const detectBotBehavior = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get recent user journeys
    const journeysSnap = await db.collection('ua_user_journeys')
      .where('installDate', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    for (const journeyDoc of journeysSnap.docs) {
      const journey = journeyDoc.data();
      const events = journey.events || [];

      if (events.length === 0) continue;

      // Bot indicators
      let botScore = 0;

      // 1. Installed but no activity (> 2 hours)
      const installTime = journey.installDate.toDate().getTime();
      const lastEventTime = events[events.length - 1].timestamp.toDate().getTime();
      const hoursSinceInstall = (Date.now() - installTime) / (1000 * 60 * 60);
      const hoursSinceLastEvent = (Date.now() - lastEventTime) / (1000 * 60 * 60);

      if (hoursSinceInstall > 2 && events.length === 1 && events[0].type === 'install') {
        botScore += 0.4;
      }

      // 2. Rapid actions (too fast to be human)
      let rapidActions = 0;
      for (let i = 1; i < events.length; i++) {
        const timeDiff = events[i].timestamp.toDate().getTime() - events[i - 1].timestamp.toDate().getTime();
        if (timeDiff < 1000) { // Less than 1 second between actions
          rapidActions++;
        }
      }
      if (rapidActions > 5) {
        botScore += 0.3;
      }

      // 3. Repetitive pattern
      const eventTypes = events.map((e: any) => e.type);
      const uniqueEventTypes = new Set(eventTypes).size;
      if (events.length > 10 && uniqueEventTypes < 3) {
        botScore += 0.2;
      }

      // 4. No revenue despite many events
      if (events.length > 20 && journey.revenue?.total === 0) {
        botScore += 0.1;
      }

      // Flag if bot score is high
      if (botScore > 0.6) {
        await createFraudSignal({
          userId: journey.userId,
          installId: '',
          signalType: 'bot_behavior',
          severity: botScore > 0.8 ? 'critical' : 'high',
          confidence: botScore,
          details: {
            eventCount: events.length,
            rapidActions,
            uniqueEventTypes,
            hoursSinceInstall,
            hoursSinceLastEvent
          },
          timestamp: admin.firestore.Timestamp.now(),
          resolved: false,
          action: 'user_flagged'
        });

        // Suspend user
        await db.collection('users').doc(journey.userId).update({
          'flags.suspectedBot': true,
          'flags.botScore': botScore,
          'flags.flaggedAt': admin.firestore.Timestamp.now()
        });
      }
    }

    return null;
  });

export const detectCPIManipulation = functions.pubsub
  .schedule('every 2 hours')
  .onRun(async (context) => {
    // Get recent campaign performance
    const campaigns = await db.collection('ua_campaigns')
      .where('status', '==', 'active')
      .get();

    for (const campaignDoc of campaigns.docs) {
      const campaign = campaignDoc.data();

      // Get installs for this campaign
      const attributionsSnap = await db.collection('ua_attributions')
        .where('campaignId', '==', campaign.id)
        .orderBy('installDate', 'desc')
        .limit(100)
        .get();

      if (attributionsSnap.size < 20) continue; // Need minimum data

      // Check for patterns
      const installTimes: number[] = [];
      const ipAddresses: string[] = [];
      const deviceModels: string[] = [];

      for (const attrDoc of attributionsSnap.docs) {
        const attr = attrDoc.data();
        installTimes.push(attr.installDate.toDate().getTime());
        
        // Get device fingerprint
        const fpSnap = await db.collection('ua_device_fingerprints')
          .where('userId', '==', attr.userId)
          .limit(1)
          .get();

        if (!fpSnap.empty) {
          const fp = fpSnap.docs[0].data();
          ipAddresses.push(fp.ipAddress);
          deviceModels.push(fp.model);
        }
      }

      // Calculate patterns
      let manipulationScore = 0;

      // 1. Time clustering (many installs in short bursts)
      installTimes.sort((a, b) => a - b);
      let clusters = 0;
      for (let i = 1; i < installTimes.length; i++) {
        if (installTimes[i] - installTimes[i - 1] < 60000) { // Within 1 minute
          clusters++;
        }
      }
      if (clusters > installTimes.length * 0.3) {
        manipulationScore += 0.3;
      }

      // 2. IP concentration (too many from same IPs)
      const uniqueIPs = new Set(ipAddresses).size;
      if (uniqueIPs < ipAddresses.length * 0.3) {
        manipulationScore += 0.3;
      }

      // 3. Device model concentration
      const uniqueModels = new Set(deviceModels).size;
      if (uniqueModels < 5) {
        manipulationScore += 0.2;
      }

      // 4. Low engagement rate
      const journeysSnap = await db.collection('ua_user_journeys')
        .where('userId', 'in', attributionsSnap.docs.slice(0, 10).map(d => d.data().userId))
        .get();

      const lowEngagement = journeysSnap.docs.filter(d => {
        const events = d.data().events || [];
        return events.length <= 2;
      }).length;

      if (lowEngagement > journeysSnap.size * 0.7) {
        manipulationScore += 0.2;
      }

      // Flag if manipulation detected
      if (manipulationScore > 0.6) {
        await createFraudSignal({
          userId: 'system',
          installId: '',
          signalType: 'cpi_manipulation',
          severity: 'critical',
          confidence: manipulationScore,
          details: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            installCount: attributionsSnap.size,
            clusters,
            uniqueIPs,
            uniqueModels,
            lowEngagement
          },
          timestamp: admin.firestore.Timestamp.now(),
          resolved: false,
          action: 'campaign_paused'
        });

        // Pause campaign
        await db.collection('ua_campaigns').doc(campaign.id).update({
          status: 'paused',
          pauseReason: 'fraud_detected',
          pauseDetails: {
            fraudType: 'cpi_manipulation',
            manipulationScore
          },
          updatedAt: admin.firestore.Timestamp.now()
        });

        // Create alert
        await db.collection('ua_alerts').add({
          type: 'fraud_campaign_paused',
          campaignId: campaign.id,
          severity: 'critical',
          details: { manipulationScore },
          timestamp: admin.firestore.Timestamp.now(),
          resolved: false
        });
      }
    }

    return null;
  });

export const detectRefundAbuse = functions.firestore
  .document('payments/{paymentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if payment was refunded
    if (before.status !== 'refunded' && after.status === 'refunded') {
      const userId = after.userId;

      // Get user's refund history
      const refundsSnap = await db.collection('payments')
        .where('userId', '==', userId)
        .where('status', '==', 'refunded')
        .get();

      const refundCount = refundsSnap.size;
      const totalPayments = await db.collection('payments')
        .where('userId', '==', userId)
        .get();

      const refundRate = totalPayments.size > 0 ? refundCount / totalPayments.size : 0;

      // Flag if abuse detected
      if (refundCount >= 3 || refundRate > 0.5) {
        await createFraudSignal({
          userId,
          installId: '',
          signalType: 'refund_abuse',
          severity: 'high',
          confidence: Math.min(0.95, refundCount / 5),
          details: {
            refundCount,
            totalPayments: totalPayments.size,
            refundRate,
            latestRefund: after
          },
          timestamp: admin.firestore.Timestamp.now(),
          resolved: false,
          action: 'wallet_frozen'
        });

        // Freeze wallet
        await db.collection('wallets').doc(userId).update({
          frozen: true,
          frozenReason: 'refund_abuse',
          frozenAt: admin.firestore.Timestamp.now()
        });

        // Create support ticket
        await db.collection('support_tickets').add({
          userId,
          type: 'fraud_refund_abuse',
          priority: 'high',
          status: 'open',
          details: {
            refundCount,
            refundRate
          },
          createdAt: admin.firestore.Timestamp.now()
        });
      }
    }

    return null;
  });

// ===========================
// HELPER FUNCTIONS
// ===========================

async function createFraudSignal(signal: Omit<FraudSignal, 'id'>) {
  const doc = await db.collection('ua_fraud_signals').add(signal);
  return doc.id;
}

async function blockFraudSource(block: FraudBlock) {
  await db.collection('ua_fraud_blocks').add(block);
}

async function isVPN(ipAddress: string): Promise<boolean> {
  // In production, use a VPN detection API like:
  // - IPQualityScore
  // - IPHub
  // - VPN Blocker API
  
  // For now, simple heuristic
  const vpnPatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./
  ];

  return vpnPatterns.some(pattern => pattern.test(ipAddress));
}

async function getTimezoneFromIP(ipAddress: string): Promise<string | null> {
  // In production, use IP geolocation API
  // For now, return null
  return null;
}

// ===========================
// FRAUD REVIEW & RESOLUTION
// ===========================

export const reviewFraudSignal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { signalId, resolution, action } = data;

  const signalDoc = await db.collection('ua_fraud_signals').doc(signalId).get();
  if (!signalDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Signal not found');
  }

  await db.collection('ua_fraud_signals').doc(signalId).update({
    resolved: true,
    resolution,
    resolvedBy: context.auth.uid,
    resolvedAt: admin.firestore.Timestamp.now()
  });

  const signal = signalDoc.data() as FraudSignal;

  // Execute action if provided
  if (action === 'ban_user') {
    await db.collection('users').doc(signal.userId).update({
      banned: true,
      bannedReason: 'fraud',
      bannedAt: admin.firestore.Timestamp.now()
    });
  } else if (action === 'flag_user') {
    await db.collection('users').doc(signal.userId).update({
      'flags.fraud': true,
      'flags.fraudSignalId': signalId
    });
  } else if (action === 'clear') {
    // Clear any flags
    await db.collection('users').doc(signal.userId).update({
      'flags.suspectedBot': false,
      'flags.fraud': false
    });
  }

  return { success: true };
});

export const getFraudDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  // Get recent fraud signals
  const signalsSnap = await db.collection('ua_fraud_signals')
    .where('resolved', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  const signals = signalsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Get blocked sources
  const blocksSnap = await db.collection('ua_fraud_blocks')
    .orderBy('blockedAt', 'desc')
    .limit(50)
    .get();

  const blocks = blocksSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Calculate stats
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const signal of signals) {
    byType[signal.signalType] = (byType[signal.signalType] || 0) + 1;
    bySeverity[signal.severity] = (bySeverity[signal.severity] || 0) + 1;
  }

  return {
    signals,
    blocks,
    stats: {
      totalSignals: signals.length,
      byType,
      bySeverity,
      totalBlocks: blocks.length
    }
  };
});

// ===========================
// CHECK IF SOURCE IS BLOCKED
// ===========================

export const checkFraudBlock = functions.https.onCall(async (data, context) => {
  const { type, value } = data;

  const blockSnap = await db.collection('ua_fraud_blocks')
    .where('type', '==', type)
    .where('value', '==', value)
    .get();

  if (blockSnap.empty) {
    return { blocked: false };
  }

  const block = blockSnap.docs[0].data() as FraudBlock;

  // Check if expired
  if (!block.permanent && block.expiresAt && block.expiresAt.toDate() < new Date()) {
    // Remove expired block
    await blockSnap.docs[0].ref.delete();
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: block.reason,
    permanent: block.permanent
  };
});

// ===========================
// EXPORTS
// ===========================

export const uaFraud = {
  captureDeviceFingerprint,
  detectDeviceFarms,
  detectBotBehavior,
  detectCPIManipulation,
  detectRefundAbuse,
  reviewFraudSignal,
  getFraudDashboard,
  checkFraudBlock
};
