/**
 * PACK 399 — Influencer Wave Engine
 * 
 * Manages influencer acquisition, creator monetization funnel, and regional growth playbooks
 * 
 * Dependencies:
 * - PACK 301/301B: Retention & Segmentation
 * - PACK 302: Fraud Detection
 * - PACK 367: ASO & Reputation
 * - PACK 397: Store Defense
 * - PACK 398: Public Launch & Viral Engine
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type InfluencerState = 
  | 'CANDIDATE' 
  | 'VERIFIED' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'BANNED';

export type MonetizationChannel = 
  | 'paid_chat'
  | 'voice_calls'
  | 'video_calls'
  | 'calendar_bookings'
  | 'ai_companions'
  | 'events';

export interface InfluencerProfile {
  influencerId: string;
  userId: string;
  state: InfluencerState;
  
  // Profile Info
  displayName: string;
  handle: string;
  email: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  bio?: string;
  
  // Social Stats
  followers: number;
  platformType: string; // instagram, tiktok, youtube, etc.
  platformHandle: string;
  platformVerified: boolean;
  
  // Campaign Info
  referralCode: string;
  customReferralLink: string;
  
  // Tracking
  totalInstalls: number;
  verifiedProfiles: number;
  firstPurchases: number;
  totalRevenue: number;
  fraudRatio: number;
  
  // Earnings
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  verifiedAt?: admin.firestore.Timestamp;
  lastActiveAt: admin.firestore.Timestamp;
  pausedAt?: admin.firestore.Timestamp;
  bannedAt?: admin.firestore.Timestamp;
  
  // Metadata
  country: string;
  region: string;
  timezone: string;
  
  // Fraud Flags
  fraudFlags: string[];
  fraudScore: number;
}

export interface InfluencerCampaign {
  campaignId: string;
  influencerId: string;
  
  name: string;
  description: string;
  
  // Campaign Type
  type: 'acquisition' | 'engagement' | 'retention' | 'monetization';
  
  // Targeting
  targetCountries: string[];
  targetDemographics: {
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    interests?: string[];
  };
  
  // Monetization Channels
  enabledChannels: MonetizationChannel[];
  
  // Rewards
  commission: {
    type: 'percentage' | 'fixed_cpa';
    value: number;
  };
  bonuses: {
    milestone: number;
    reward: number;
  }[];
  
  // Status
  active: boolean;
  startDate: admin.firestore.Timestamp;
  endDate?: admin.firestore.Timestamp;
  
  // Performance
  budget?: number;
  spentBudget: number;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface InfluencerMetrics {
  influencerId: string;
  campaignId?: string;
  date: string; // YYYY-MM-DD
  
  // Funnel Metrics
  impressions: number;
  clicks: number;
  installs: number;
  verifiedProfiles: number;
  firstPurchases: number;
  
  // Revenue Metrics
  revenue: number;
  commission: number;
  
  // Engagement Metrics
  avgSessionDuration: number;
  retentionDay1: number;
  retentionDay7: number;
  retentionDay30: number;
  
  // Fraud Metrics
  fraudInstalls: number;
  fraudRevenue: number;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface CreatorFunnel {
  funnelId: string;
  influencerId: string;
  userId: string; // The user who came through the funnel
  
  // Source Attribution
  referralCode: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  
  // Funnel Stages
  stages: {
    installed: boolean;
    installedAt?: admin.firestore.Timestamp;
    
    profileVerified: boolean;
    profileVerifiedAt?: admin.firestore.Timestamp;
    
    firstPurchase: boolean;
    firstPurchaseAt?: admin.firestore.Timestamp;
    firstPurchaseValue?: number;
    
    engaged: boolean; // Active usage after 7 days
    engagedAt?: admin.firestore.Timestamp;
    
    retained: boolean; // Active after 30 days
    retainedAt?: admin.firestore.Timestamp;
  };
  
  // Monetization Activity
  monetizationChannels: {
    [key in MonetizationChannel]: {
      used: boolean;
      usedAt?: admin.firestore.Timestamp;
      totalSpend: number;
      transactionCount: number;
    };
  };
  
  // LTV
  lifetimeValue: number;
  
  // Fraud Detection
  fraudFlags: string[];
  fraudScore: number;
  isFraud: boolean;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface RegionalPlaybook {
  playbookId: string;
  region: string; // e.g., "north_america", "europe", "asia_pacific"
  countries: string[]; // ISO country codes
  
  // Marketing Config
  allowedAdPlatforms: string[];
  allowedInfluencerCategories: string[];
  
  // Payment Config
  paymentMethodPriorities: string[];
  currency: string;
  
  // ASO Config
  localASOKeywords: string[];
  appStoreName: string;
  appStoreDescription: string;
  
  // Legal & Compliance
  legalRestrictionMatrix: {
    [feature: string]: boolean;
  };
  ageRestriction: number;
  contentRestrictions: string[];
  
  // Traffic Sources
  primaryTrafficSources: string[];
  
  // Active Status
  active: boolean;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface InfluencerPayout {
  payoutId: string;
  influencerId: string;
  
  // Amount
  amount: number;
  currency: string;
  
  // Period
  periodStart: admin.firestore.Timestamp;
  periodEnd: admin.firestore.Timestamp;
  
  // Breakdown
  breakdown: {
    type: 'commission' | 'bonus' | 'clawback';
    amount: number;
    description: string;
    referenceId?: string; // campaignId or transactionId
  }[];
  
  // Status
  status: 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'cancelled';
  
  // Payment Method
  paymentMethod: string;
  paymentDetails?: any;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  approvedAt?: admin.firestore.Timestamp;
  paidAt?: admin.firestore.Timestamp;
  failedAt?: admin.firestore.Timestamp;
  
  // Audit
  approvedBy?: string;
  notes?: string;
}

export interface InfluencerCommission {
  commissionId: string;
  influencerId: string;
  userId: string; // The user who made the purchase
  
  // Transaction
  transactionId: string;
  transactionAmount: number;
  transactionType: MonetizationChannel;
  
  // Commission
  commissionType: 'percentage' | 'fixed';
  commissionRate: number;
  commissionAmount: number;
  
  // Campaign
  campaignId?: string;
  
  // Status
  status: 'pending' | 'confirmed' | 'reversed' | 'paid';
  
  // Fraud
  fraudChecked: boolean;
  fraudScore: number;
  isFraud: boolean;
  reversalReason?: string;
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  confirmedAt?: admin.firestore.Timestamp;
  reversedAt?: admin.firestore.Timestamp;
  paidAt?: admin.firestore.Timestamp;
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

const db = admin.firestore();

const getInfluencerProfile = (influencerId: string) => 
  db.collection('influencer_profiles').doc(influencerId);

const getInfluencerCampaign = (campaignId: string) =>
  db.collection('influencer_campaigns').doc(campaignId);

const getInfluencerMetrics = (influencerId: string, date: string) =>
  db.collection('influencer_metrics').doc(`${influencerId}_${date}`);

const getCreatorFunnel = (funnelId: string) =>
  db.collection('creator_funnels').doc(funnelId);

const getRegionalPlaybookDoc = (playbookId: string) =>
  db.collection('regional_playbooks').doc(playbookId);

const getInfluencerPayout = (payoutId: string) =>
  db.collection('influencer_payouts').doc(payoutId);

const getInfluencerCommission = (commissionId: string) =>
  db.collection('influencer_commissions').doc(commissionId);

// ============================================================================
// INFLUENCER ONBOARDING
// ============================================================================

export const createInfluencerProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    displayName,
    handle,
    email,
    phoneNumber,
    followers,
    platformType,
    platformHandle,
    country,
    region,
    timezone,
  } = data;

  // Validate required fields
  if (!displayName || !handle || !email || !followers || !platformType || !platformHandle) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const influencerId = db.collection('influencer_profiles').doc().id;
  const referralCode = await generateReferralCode(handle);

  const profile: InfluencerProfile = {
    influencerId,
    userId: context.auth.uid,
    state: 'CANDIDATE',
    
    displayName,
    handle,
    email,
    phoneNumber,
    
    followers,
    platformType,
    platformHandle,
    platformVerified: false,
    
    referralCode,
    customReferralLink: `https://avalo.app/r/${referralCode}`,
    
    totalInstalls: 0,
    verifiedProfiles: 0,
    firstPurchases: 0,
    totalRevenue: 0,
    fraudRatio: 0,
    
    totalEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
    
    createdAt: admin.firestore.Timestamp.now(),
    lastActiveAt: admin.firestore.Timestamp.now(),
    
    country,
    region,
    timezone,
    
    fraudFlags: [],
    fraudScore: 0,
  };

  await getInfluencerProfile(influencerId).set(profile);

  return {
    success: true,
    influencerId,
    referralCode,
    referralLink: profile.customReferralLink,
  };
});

async function generateReferralCode(handle: string): Promise<string> {
  const baseCode = handle.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
  const uniqueSuffix = Math.random().toString(36).substring(2, 6);
  return `${baseCode}${uniqueSuffix}`;
}

// ============================================================================
// INFLUENCER VERIFICATION
// ============================================================================

export const verifyInfluencer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin permission
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.roles.includes('influencer_manager')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { influencerId, platformVerified } = data;

  const profileRef = getInfluencerProfile(influencerId);
  const profile = await profileRef.get();

  if (!profile.exists) {
    throw new functions.https.HttpsError('not-found', 'Influencer profile not found');
  }

  await profileRef.update({
    state: 'VERIFIED',
    platformVerified: platformVerified || true,
    verifiedAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

// ============================================================================
// CREATOR FUNNEL TRACKING
// ============================================================================

export const trackInfluencerInstall = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { referralCode, utmSource, utmMedium, utmCampaign } = data;

  if (!referralCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Referral code required');
  }

  // Find influencer by referral code
  const influencerSnapshot = await db.collection('influencer_profiles')
    .where('referralCode', '==', referralCode)
    .limit(1)
    .get();

  if (influencerSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral code');
  }

  const influencer = influencerSnapshot.docs[0].data() as InfluencerProfile;

  // Check fraud score using PACK 302
  const fraudScore = await checkFraudScore(context.auth.uid, influencer.influencerId);

  // Create funnel entry
  const funnelId = db.collection('creator_funnels').doc().id;
  const funnel: CreatorFunnel = {
    funnelId,
    influencerId: influencer.influencerId,
    userId: context.auth.uid,
    
    referralCode,
    utmSource,
    utmMedium,
    utmCampaign,
    
    stages: {
      installed: true,
      installedAt: admin.firestore.Timestamp.now(),
      profileVerified: false,
      firstPurchase: false,
      engaged: false,
      retained: false,
    },
    
    monetizationChannels: {
      paid_chat: { used: false, totalSpend: 0, transactionCount: 0 },
      voice_calls: { used: false, totalSpend: 0, transactionCount: 0 },
      video_calls: { used: false, totalSpend: 0, transactionCount: 0 },
      calendar_bookings: { used: false, totalSpend: 0, transactionCount: 0 },
      ai_companions: { used: false, totalSpend: 0, transactionCount: 0 },
      events: { used: false, totalSpend: 0, transactionCount: 0 },
    },
    
    lifetimeValue: 0,
    
    fraudFlags: [],
    fraudScore,
    isFraud: fraudScore > 0.8,
    
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await getCreatorFunnel(funnelId).set(funnel);

  // Update influencer metrics
  if (!funnel.isFraud) {
    await getInfluencerProfile(influencer.influencerId).update({
      totalInstalls: admin.firestore.FieldValue.increment(1),
      lastActiveAt: admin.firestore.Timestamp.now(),
    });

    await updateDailyMetrics(influencer.influencerId, {
      installs: 1,
    });
  }

  return {
    success: true,
    funnelId,
    isFraud: funnel.isFraud,
  };
});

async function checkFraudScore(userId: string, influencerId: string): Promise<number> {
  // Integration with PACK 302 fraud detection
  try {
    const fraudDoc = await db.collection('fraud_scores').doc(userId).get();
    if (fraudDoc.exists) {
      const data = fraudDoc.data();
      return data?.riskScore || 0;
    }
  } catch (error) {
    console.error('Error checking fraud score:', error);
  }
  return 0;
}

// ============================================================================
// COMMISSION TRACKING
// ============================================================================

export const trackInfluencerCommission = functions.firestore
  .document('transactions/{transactionId}')
  .onCreate(async (snap, context) => {
    const transaction = snap.data();
    const userId = transaction.userId;

    // Find funnel for this user
    const funnelSnapshot = await db.collection('creator_funnels')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (funnelSnapshot.empty) {
      return; // No influencer attribution
    }

    const funnel = funnelSnapshot.docs[0].data() as CreatorFunnel;

    if (funnel.isFraud) {
      console.warn(`Skipping commission for fraud user: ${userId}`);
      return;
    }

    // Get influencer profile
    const profileDoc = await getInfluencerProfile(funnel.influencerId).get();
    if (!profileDoc.exists) {
      return;
    }

    const profile = profileDoc.data() as InfluencerProfile;

    // Calculate commission
    const commissionRate = 0.10; // 10% default, can be customized per campaign
    const commissionAmount = transaction.amount * commissionRate;

    // Create commission record
    const commissionId = db.collection('influencer_commissions').doc().id;
    const commission: InfluencerCommission = {
      commissionId,
      influencerId: funnel.influencerId,
      userId,
      
      transactionId: context.params.transactionId,
      transactionAmount: transaction.amount,
      transactionType: transaction.type,
      
      commissionType: 'percentage',
      commissionRate,
      commissionAmount,
      
      status: 'pending',
      
      fraudChecked: false,
      fraudScore: funnel.fraudScore,
      isFraud: false,
      
      createdAt: admin.firestore.Timestamp.now(),
    };

    await getInfluencerCommission(commissionId).set(commission);

    // Update influencer earnings
    await getInfluencerProfile(funnel.influencerId).update({
      pendingEarnings: admin.firestore.FieldValue.increment(commissionAmount),
      totalRevenue: admin.firestore.FieldValue.increment(transaction.amount),
    });

    // Update funnel LTV
    await getCreatorFunnel(funnel.funnelId).update({
      lifetimeValue: admin.firestore.FieldValue.increment(transaction.amount),
      [`monetizationChannels.${transaction.type}.used`]: true,
      [`monetizationChannels.${transaction.type}.usedAt`]: admin.firestore.Timestamp.now(),
      [`monetizationChannels.${transaction.type}.totalSpend`]: admin.firestore.FieldValue.increment(transaction.amount),
      [`monetizationChannels.${transaction.type}.transactionCount`]: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Track first purchase
    if (!funnel.stages.firstPurchase) {
      await getCreatorFunnel(funnel.funnelId).update({
        'stages.firstPurchase': true,
        'stages.firstPurchaseAt': admin.firestore.Timestamp.now(),
        'stages.firstPurchaseValue': transaction.amount,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      await getInfluencerProfile(funnel.influencerId).update({
        firstPurchases: admin.firestore.FieldValue.increment(1),
      });

      await updateDailyMetrics(funnel.influencerId, {
        firstPurchases: 1,
        revenue: transaction.amount,
        commission: commissionAmount,
      });
    }
  });

// ============================================================================
// FRAUD DETECTION & AUTO-ACTIONS
// ============================================================================

export const detectInfluencerFraud = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Running influencer fraud detection...');

    const funnelsSnapshot = await db.collection('creator_funnels')
      .where('fraudChecked', '==', false)
      .limit(100)
      .get();

    const batch = db.batch();
    const fraudActions: any[] = [];

    for (const doc of funnelsSnapshot.docs) {
      const funnel = doc.data() as CreatorFunnel;

      // Re-check fraud score with PACK 302
      const fraudScore = await checkFraudScore(funnel.userId, funnel.influencerId);
      const isFraud = fraudScore > 0.8;

      if (isFraud && !funnel.isFraud) {
        // Mark as fraud
        batch.update(doc.ref, {
          fraudScore,
          isFraud: true,
          fraudFlags: admin.firestore.FieldValue.arrayUnion('high_fraud_score'),
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Reverse commissions
        const commissionsSnapshot = await db.collection('influencer_commissions')
          .where('userId', '==', funnel.userId)
          .where('status', '==', 'pending')
          .get();

        for (const commDoc of commissionsSnapshot.docs) {
          batch.update(commDoc.ref, {
            status: 'reversed',
            reversalReason: 'fraud_detected',
            reversedAt: admin.firestore.Timestamp.now(),
          });

          fraudActions.push({
            type: 'commission_reversed',
            commissionId: commDoc.id,
            influencerId: funnel.influencerId,
            amount: commDoc.data().commissionAmount,
          });
        }

        // Update influencer fraud metrics
        const profileDoc = await getInfluencerProfile(funnel.influencerId).get();
        const profileData = profileDoc.data() as InfluencerProfile;
        batch.update(profileDoc.ref, {
          fraudRatio: admin.firestore.FieldValue.increment(1 / (profileData.totalInstalls || 1)),
          fraudFlags: admin.firestore.FieldValue.arrayUnion('high_fraud_ratio'),
        });
      }
    }

    await batch.commit();

    console.log(`Fraud detection complete. Actions taken: ${fraudActions.length}`);

    return { success: true, actionsCount: fraudActions.length };
  });

// ============================================================================
// PAYOUT PROCESSING
// ============================================================================

export const createInfluencerPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin permission
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.roles.includes('finance_manager')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { influencerId, periodStart, periodEnd } = data;

  // Get confirmed commissions for period
  const commissionsSnapshot = await db.collection('influencer_commissions')
    .where('influencerId', '==', influencerId)
    .where('status', '==', 'confirmed')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(periodStart)))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(new Date(periodEnd)))
    .get();

  if (commissionsSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'No confirmed commissions found for period');
  }

  let totalAmount = 0;
  const breakdown: any[] = [];

  commissionsSnapshot.forEach(doc => {
    const commission = doc.data();
    totalAmount += commission.commissionAmount;
    breakdown.push({
      type: 'commission',
      amount: commission.commissionAmount,
      description: `Transaction ${commission.transactionId}`,
      referenceId: commission.transactionId,
    });
  });

  // Create payout
  const payoutId = db.collection('influencer_payouts').doc().id;
  const payout: InfluencerPayout = {
    payoutId,
    influencerId,
    
    amount: totalAmount,
    currency: 'USD',
    
    periodStart: admin.firestore.Timestamp.fromDate(new Date(periodStart)),
    periodEnd: admin.firestore.Timestamp.fromDate(new Date(periodEnd)),
    
    breakdown,
    
    status: 'pending',
    
    paymentMethod: 'bank_transfer',
    
    createdAt: admin.firestore.Timestamp.now(),
  };

  await getInfluencerPayout(payoutId).set(payout);

  return {
    success: true,
    payoutId,
    amount: totalAmount,
  };
});

// ============================================================================
// DAILY METRICS AGGREGATION
// ============================================================================

async function updateDailyMetrics(
  influencerId: string,
  updates: {
    impressions?: number;
    clicks?: number;
    installs?: number;
    verifiedProfiles?: number;
    firstPurchases?: number;
    revenue?: number;
    commission?: number;
    fraudInstalls?: number;
    fraudRevenue?: number;
  }
) {
  const today = new Date().toISOString().split('T')[0];
  const metricsRef = getInfluencerMetrics(influencerId, today);

  const doc = await metricsRef.get();

  if (!doc.exists) {
    // Create new metrics document
    const metrics: Partial<InfluencerMetrics> = {
      influencerId,
      date: today,
      impressions: 0,
      clicks: 0,
      installs: 0,
      verifiedProfiles: 0,
      firstPurchases: 0,
      revenue: 0,
      commission: 0,
      avgSessionDuration: 0,
      retentionDay1: 0,
      retentionDay7: 0,
      retentionDay30: 0,
      fraudInstalls: 0,
      fraudRevenue: 0,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };
    await metricsRef.set(metrics);
  }

  // Update with increments
  const updateData: any = {
    updatedAt: admin.firestore.Timestamp.now(),
  };

  Object.entries(updates).forEach(([key, value]) => {
    updateData[key] = admin.firestore.FieldValue.increment(value);
  });

  await metricsRef.update(updateData);
}

// ============================================================================
// REGIONAL PLAYBOOK MANAGEMENT
// ============================================================================

export const getRegionalPlaybook = functions.https.onCall(async (data, context) => {
  const { country } = data;

  if (!country) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }

  // Find playbook for country
  const playbooksSnapshot = await db.collection('regional_playbooks')
    .where('countries', 'array-contains', country)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (playbooksSnapshot.empty) {
    // Return default playbook
    return {
      success: true,
      playbook: getDefaultPlaybook(country),
    };
  }

  const playbook = playbooksSnapshot.docs[0].data();

  return {
    success: true,
    playbook,
  };
});

function getDefaultPlaybook(country: string): Partial<RegionalPlaybook> {
  return {
    region: 'default',
    countries: [country],
    allowedAdPlatforms: ['google', 'facebook', 'tiktok', 'instagram'],
    allowedInfluencerCategories: ['lifestyle', 'entertainment', 'education'],
    paymentMethodPriorities: ['stripe', 'paypal'],
    currency: 'USD',
    localASOKeywords: ['dating', 'social', 'chat', 'meet'],
    ageRestriction: 18,
    contentRestrictions: [],
    primaryTrafficSources: ['organic', 'influencer', 'paid'],
    active: true,
  };
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

export const getInfluencerAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { influencerId, startDate, endDate } = data;

  // Get metrics for date range
  const metricsSnapshot = await db.collection('influencer_metrics')
    .where('influencerId', '==', influencerId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get();

  const metrics = metricsSnapshot.docs.map(doc => doc.data());

  // Calculate aggregates
  const totals = metrics.reduce((acc, m) => ({
    impressions: acc.impressions + m.impressions,
    clicks: acc.clicks + m.clicks,
    installs: acc.installs + m.installs,
    verifiedProfiles: acc.verifiedProfiles + m.verifiedProfiles,
    firstPurchases: acc.firstPurchases + m.firstPurchases,
    revenue: acc.revenue + m.revenue,
    commission: acc.commission + m.commission,
    fraudInstalls: acc.fraudInstalls + m.fraudInstalls,
    fraudRevenue: acc.fraudRevenue + m.fraudRevenue,
  }), {
    impressions: 0,
    clicks: 0,
    installs: 0,
    verifiedProfiles: 0,
    firstPurchases: 0,
    revenue: 0,
    commission: 0,
    fraudInstalls: 0,
    fraudRevenue: 0,
  });

  // Calculate conversion rates
  const conversionRates = {
    clickToInstall: totals.clicks > 0 ? totals.installs / totals.clicks : 0,
    installToVerified: totals.installs > 0 ? totals.verifiedProfiles / totals.installs : 0,
    verifiedToFirstPurchase: totals.verifiedProfiles > 0 ? totals.firstPurchases / totals.verifiedProfiles : 0,
    fraudRate: totals.installs > 0 ? totals.fraudInstalls / totals.installs : 0,
  };

  return {
    success: true,
    metrics,
    totals,
    conversionRates,
  };
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getInfluencerProfile,
  getInfluencerCampaign,
  getInfluencerMetrics,
  getCreatorFunnel,
  getInfluencerPayout,
  getInfluencerCommission,
};
