/**
 * PACK 393: Influencer Engine
 * Manages influencer partnerships, campaigns, and payouts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// TYPES
// ============================================

interface InfluencerPartner {
  partnerId: string;
  name: string;
  email: string;
  phone?: string;
  verified: boolean;
  referralCode: string;
  payoutModel: 'CPA' | 'CPL' | 'RevShare';
  payoutRate: number;
  status: 'active' | 'paused' | 'banned';
  fraudScore: number;
  stats: {
    totalClicks: number;
    totalInstalls: number;
    totalRegistrations: number;
    totalVerifiedUsers: number;
    totalRevenue: number;
    totalPayouts: number;
  };
  createdAt: admin.firestore.Timestamp;
}

interface InfluencerCampaign {
  campaignId: string;
  partnerId: string;
  name: string;
  geo: string[];
  budget: number;
  spent: number;
  status: 'active' | 'paused' | 'ended';
  conversions: number;
  revenue: number;
  createdAt: admin.firestore.Timestamp;
}

// ============================================
// ONBOARDING
// ============================================

export const pack393_createInfluencerPartner = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const { name, email, phone, payoutModel, payoutRate } = data;
  
  // Validate inputs
  if (!name || !email || !payoutModel) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  if (!['CPA', 'CPL', 'RevShare'].includes(payoutModel)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payout model');
  }
  
  // Generate unique referral code
  const referralCode = await generateUniqueReferralCode();
  
  // Create partner
  const partner: Partial<InfluencerPartner> = {
    partnerId: context.auth.uid,
    name,
    email,
    phone,
    verified: false,
    referralCode,
    payoutModel: payoutModel as 'CPA' | 'CPL' | 'RevShare',
    payoutRate: payoutRate || (payoutModel === 'CPA' ? 5.00 : payoutModel === 'CPL' ? 2.50 : 15),
    status: 'active',
    fraudScore: 0,
    stats: {
      totalClicks: 0,
      totalInstalls: 0,
      totalRegistrations: 0,
      totalVerifiedUsers: 0,
      totalRevenue: 0,
      totalPayouts: 0
    },
    createdAt: admin.firestore.Timestamp.now()
  };
  
  await db.collection('influencerPartners').doc(context.auth.uid).set(partner);
  
  functions.logger.info(`✅ New influencer partner created: ${name} (${referralCode})`);
  
  return { success: true, referralCode, partnerId: context.auth.uid };
});

// ============================================
// ATTRIBUTION EVENT TRACKING
// ============================================

export const pack393_trackInfluencerEvent = functions.https.onCall(async (data, context) => {
  const { referralCode, eventType, userId, value } = data;
  
  if (!referralCode || !eventType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Find partner by referral code
  const partnerSnapshot = await db.collection('influencerPartners')
    .where('referralCode', '==', referralCode)
    .limit(1)
    .get();
  
  if (partnerSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral code');
  }
  
  const partnerDoc = partnerSnapshot.docs[0];
  const partnerId = partnerDoc.id;
  
  // Check if partner is active
  if (partnerDoc.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Partner is not active');
  }
  
  // Track attribution event
  await db.collection('influencerAttributionEvents').add({
    partnerId,
    userId,
    eventType,
    value: value || 0,
    timestamp: admin.firestore.Timestamp.now()
  });
  
  // Update partner stats
  const updateData: any = {};
  
  switch (eventType) {
    case 'ad_click':
      updateData['stats.totalClicks'] = admin.firestore.FieldValue.increment(1);
      break;
    case 'app_install':
      updateData['stats.totalInstalls'] = admin.firestore.FieldValue.increment(1);
      break;
    case 'registration':
      updateData['stats.totalRegistrations'] = admin.firestore.FieldValue.increment(1);
      break;
    case 'verification':
    case 'profile_completion':
      updateData['stats.totalVerifiedUsers'] = admin.firestore.FieldValue.increment(1);
      break;
    case 'first_purchase':
      updateData['stats.totalRevenue'] = admin.firestore.FieldValue.increment(value || 0);
      break;
  }
  
  if (Object.keys(updateData).length > 0) {
    await partnerDoc.ref.update(updateData);
  }
  
  // Check for payout trigger
  await checkPayoutTrigger(partnerId, partnerDoc.data() as InfluencerPartner, eventType, value || 0);
  
  return { success: true, eventTracked: eventType };
});

// ============================================
// PAYOUT MANAGEMENT
// ============================================

async function checkPayoutTrigger(
  partnerId: string,
  partner: InfluencerPartner,
  eventType: string,
  value: number
): Promise<void> {
  let payoutAmount = 0;
  let triggerMet = false;
  
  switch (partner.payoutModel) {
    case 'CPA':
      if (eventType === 'verification' || eventType === 'profile_completion') {
        payoutAmount = partner.payoutRate;
        triggerMet = true;
      }
      break;
      
    case 'CPL':
      if (eventType === 'profile_completion') {
        payoutAmount = partner.payoutRate;
        triggerMet = true;
      }
      break;
      
    case 'RevShare':
      if (eventType === 'first_purchase') {
        payoutAmount = value * (partner.payoutRate / 100);
        triggerMet = true;
      }
      break;
  }
  
  if (triggerMet && payoutAmount > 0) {
    await db.collection('influencerPayouts').add({
      partnerId,
      amount: payoutAmount,
      model: partner.payoutModel,
      status: 'pending',
      eventType,
      period: getCurrentMonth(),
      createdAt: admin.firestore.Timestamp.now()
    });
  }
}

export const pack393_processInfluencerPayouts = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 0 1 * *') // First day of each month
  .onRun(async (context) => {
    functions.logger.info('💰 Processing influencer payouts for last month');
    
    const lastMonth = getLastMonth();
    
    // Get all pending payouts from last month
    const payoutsSnapshot = await db.collection('influencerPayouts')
      .where('status', '==', 'pending')
      .where('period', '==', lastMonth)
      .get();
    
    functions.logger.info(`Found ${payoutsSnapshot.size} pending payouts`);
    
    // Group by partner and calculate totals
    const partnerPayouts = new Map<string, number>();
    
    payoutsSnapshot.forEach(doc => {
      const data = doc.data();
      const current = partnerPayouts.get(data.partnerId) || 0;
      partnerPayouts.set(data.partnerId, current + data.amount);
    });
    
    // Process payouts (in real system, integrate with payment processor)
    for (const [partnerId, totalAmount] of partnerPayouts.entries()) {
      if (totalAmount < 50) {
        // Minimum payout threshold
        continue;
      }
      
      // Update payout statuses
      const batch = db.batch();
      const partnerPayoutDocs = payoutsSnapshot.docs.filter(doc => doc.data().partnerId === partnerId);
      
      partnerPayoutDocs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'processing',
          updatedAt: admin.firestore.Timestamp.now()
        });
      });
      
      await batch.commit();
      
      functions.logger.info(`💸 Processing payout of $${totalAmount.toFixed(2)} for partner ${partnerId}`);
      
      // TODO: Integrate with payment processor (Stripe, PayPal, etc.)
      // For now, create a pending payment record
      await db.collection('influencerPaymentRecords').add({
        partnerId,
        amount: totalAmount,
        period: lastMonth,
        status: 'scheduled',
        scheduledAt: admin.firestore.Timestamp.now()
      });
    }
    
    return { success: true, partnersProcessed: partnerPayouts.size };
  });

// ============================================
// FRAUD DETECTION
// ============================================

export const pack393_checkInfluencerFraud = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => {
    functions.logger.info('🔍 Running influencer fraud detection');
    
    const sevenDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    
    // Get all active partners
    const partnersSnapshot = await db.collection('influencerPartners')
      .where('status', '==', 'active')
      .get();
    
    for (const partnerDoc of partnersSnapshot.docs) {
      const partner = partnerDoc.data();
      const partnerId = partnerDoc.id;
      
      // Get recent attribution events
      const eventsSnapshot = await db.collection('influencerAttributionEvents')
        .where('partnerId', '==', partnerId)
        .where('timestamp', '>=', sevenDaysAgo)
        .get();
      
      if (eventsSnapshot.size < 10) continue; // Not enough data
      
      // Calculate retention rate
      const userIds = new Set<string>();
      eventsSnapshot.forEach(doc => {
        if (doc.data().userId) userIds.add(doc.data().userId);
      });
      
      const usersArray = Array.from(userIds);
      let retainedUsers = 0;
      
      // Check retention (simplified)
      for (const userId of usersArray.slice(0, Math.min(100, usersArray.length))) {
        // Integration with PACK 301 retention engine
        const userRetained = await checkUserRetention(userId);
        if (userRetained) retainedUsers++;
      }
      
      const checkedCount = Math.min(100, usersArray.length);
      const retentionRate = checkedCount > 0 ? retainedUsers / checkedCount : 0;
      
      // Calculate fraud score
      let fraudScore = 0;
      
      // Low retention = suspicious
      if (retentionRate < 0.10) {
        fraudScore += 0.40;
      }
      
      // Check for device fingerprint issues (would integrate with PACK 302)
      const suspiciousDevices = await countSuspiciousDevices(partnerId);
      if (suspiciousDevices > 10) {
        fraudScore += 0.30;
      }
      
      // Spike pattern detection
      const hasSpike = await detectInstallSpike(partnerId);
      if (hasSpike) {
        fraudScore += 0.20;
      }
      
      // Update fraud score
      await partnerDoc.ref.update({
        fraudScore,
        lastFraudCheck: admin.firestore.Timestamp.now()
      });
      
      // Auto-ban if fraud score too high
      if (fraudScore > 0.75) {
        await partnerDoc.ref.update({
          status: 'banned',
          bannedReason: 'Automated fraud detection',
          bannedAt: admin.firestore.Timestamp.now()
        });
        
        functions.logger.warn(`🚨 Partner ${partnerId} auto-banned for fraud score ${fraudScore}`);
      }
    }
    
    return { success: true, partnersChecked: partnersSnapshot.size };
  });

// ============================================
// HELPER FUNCTIONS
// ============================================

async function generateUniqueReferralCode(): Promise<string> {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Check if code already exists
    const existing = await db.collection('influencerPartners')
      .where('referralCode', '==', code)
      .limit(1)
      .get();
    
    isUnique = existing.empty;
  }
  
  return code;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getLastMonth(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function checkUserRetention(userId: string): Promise<boolean> {
  // Integration with PACK 301 retention engine
  // Simplified check - verify user logged in within last 7 days
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const lastActive = userDoc.data()?.lastActiveAt;
  if (!lastActive) return false;
  
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return lastActive.toMillis() > sevenDaysAgo;
}

async function countSuspiciousDevices(partnerId: string): Promise<number> {
  // Integration with PACK 302 fraud detection
  // Would check for emulators, bots, etc.
  return 0; // Placeholder
}

async function detectInstallSpike(partnerId: string): Promise<boolean> {
  // Check for unnatural install patterns
  const yesterday = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const twoDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 48 * 60 * 60 * 1000));
  
  const recentCount = await db.collection('influencerAttributionEvents')
    .where('partnerId', '==', partnerId)
    .where('eventType', '==', 'app_install')
    .where('timestamp', '>=', yesterday)
    .count()
    .get();
  
  const previousCount = await db.collection('influencerAttributionEvents')
    .where('partnerId', '==', partnerId)
    .where('eventType', '==', 'app_install')
    .where('timestamp', '>=', twoDaysAgo)
    .where('timestamp', '<', yesterday)
    .count()
    .get();
  
  const recent = recentCount.data().count;
  const previous = previousCount.data().count;
  
  // Spike if 5x increase
  return previous > 0 && recent > previous * 5;
}

// ============================================
// DASHBOARD ENDPOINTS
// ============================================

export const pack393_getInfluencerDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const partnerId = context.auth.uid;
  
  // Get partner data
  const partnerDoc = await db.collection('influencerPartners').doc(partnerId).get();
  
  if (!partnerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Partner not found');
  }
  
  const partner = partnerDoc.data();
  
  // Get recent events
  const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  
  const eventsSnapshot = await db.collection('influencerAttributionEvents')
    .where('partnerId', '==', partnerId)
    .where('timestamp', '>=', thirtyDaysAgo)
    .get();
  
  // Aggregate event counts
  const eventCounts: Record<string, number> = {};
  eventsSnapshot.forEach(doc => {
    const eventType = doc.data().eventType;
    eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;
  });
  
  // Get pending payouts
  const payoutsSnapshot = await db.collection('influencerPayouts')
    .where('partnerId', '==', partnerId)
    .where('status', 'in', ['pending', 'processing'])
    .get();
  
  let pendingPayouts = 0;
  payoutsSnapshot.forEach(doc => {
    pendingPayouts += doc.data().amount;
  });
  
  return {
    partner: {
      name: partner?.name,
      referralCode: partner?.referralCode,
      payoutModel: partner?.payoutModel,
      status: partner?.status,
      stats: partner?.stats
    },
    recentEvents: eventCounts,
    pendingPayouts,
    fraudScore: partner?.fraudScore || 0
  };
});
