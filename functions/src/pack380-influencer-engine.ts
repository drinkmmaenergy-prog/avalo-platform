/**
 * PACK 380 — Influencer / Creator Partner Engine
 * 
 * Features:
 * - Influencer onboarding
 * - Performance tracking
 * - Payout management
 * - Tier system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type InfluencerTier = 'bronze' | 'silver' | 'gold' | 'royal_ambassador';

interface InfluencerApplication {
  id: string;
  userId: string;
  applicantName: string;
  email: string;
  phone?: string;
  socialHandles: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    other?: string;
  };
  followerCount: number;
  niche: string[];
  regions: string[];
  motivation: string;
  contentExamples: string[];
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNotes?: string;
  appliedAt: Timestamp;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
}

interface InfluencerContract {
  id: string;
  influencerId: string;
  tier: InfluencerTier;
  startDate: Timestamp;
  endDate?: Timestamp;
  commissionRate: number; // percentage
  bonusStructure: {
    signupBonus: number;
    installBonus: number;
    purchaseBonus: number;
  };
  exclusivity: boolean;
  territories: string[];
  contentRequirements: {
    minimumPosts: number;
    postingFrequency: string;
  };
  status: 'active' | 'expired' | 'terminated';
  signedAt: Timestamp;
  terminatedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface InfluencerPerformance {
  influencerId: string;
  period: string; // YYYY-MM
  metrics: {
    installs: number;
    signups: number;
    verifications: number;
    paidChats: number;
    calendarBookings: number;
    purchases: number;
    totalRevenue: number;
    ltv: number;
  };
  earnings: {
    commissions: number;
    bonuses: number;
    total: number;
  };
  engagement: {
    posts: number;
    reach: number;
    impressions: number;
    clicks: number;
  };
  conversionRate: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface InfluencerProfile {
  id: string;
  userId: string;
  tier: InfluencerTier;
  status: 'active' | 'inactive' | 'suspended';
  contractId: string;
  referralCode: string;
  totalEarnings: number;
  lifetimeInstalls: number;
  lifetimeSignups: number;
  lifetimeRevenue: number;
  rating: number;
  verificationStatus: {
    idVerified: boolean;
    backgroundCheckPassed: boolean;
    contractSigned: boolean;
  };
  paymentInfo: {
    method: string;
    details: any; // encrypted
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// INFLUENCER ONBOARDING
// ============================================================================

/**
 * Submit influencer application
 */
export const submitInfluencerApplication = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  const {
    applicantName,
    email,
    phone,
    socialHandles,
    followerCount,
    niche,
    regions,
    motivation,
    contentExamples
  } = data;

  // Validate required fields
  if (!applicantName || !email || !followerCount || !niche || !regions) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Check if user already has an application
    const existingApp = await db.collection('influencerApplications')
      .where('userId', '==', userId)
      .where('status', 'in', ['pending', 'reviewing', 'approved'])
      .get();

    if (!existingApp.empty) {
      throw new functions.https.HttpsError('already-exists', 'Application already submitted');
    }

    // Create application
    const appRef = db.collection('influencerApplications').doc();
    const application: InfluencerApplication = {
      id: appRef.id,
      userId,
      applicantName,
      email,
      phone,
      socialHandles: socialHandles || {},
      followerCount,
      niche: Array.isArray(niche) ? niche : [niche],
      regions: Array.isArray(regions) ? regions : [regions],
      motivation: motivation || '',
      contentExamples: contentExamples || [],
      status: 'pending',
      appliedAt: Timestamp.now(),
      createdAt: Timestamp.now()
    };

    await appRef.set(application);

    // Send notification to admins
    await db.collection('notifications').add({
      type: 'influencer_application',
      targetRoles: ['admin', 'influencer_manager'],
      title: 'New Influencer Application',
      message: `${applicantName} applied to become an influencer`,
      data: { applicationId: appRef.id },
      createdAt: Timestamp.now()
    });

    return {
      success: true,
      applicationId: appRef.id
    };
  } catch (error: any) {
    console.error('Error submitting influencer application:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Review influencer application (admin only)
 */
export const reviewInfluencerApplication = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'influencer_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { applicationId, approved, notes, tier } = data;

  if (!applicationId || approved === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const appDoc = await db.collection('influencerApplications').doc(applicationId).get();
    if (!appDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Application not found');
    }

    const application = appDoc.data() as InfluencerApplication;

    // Update application status
    await appDoc.ref.update({
      status: approved ? 'approved' : 'rejected',
      reviewedBy: userId,
      reviewNotes: notes || '',
      reviewedAt: Timestamp.now()
    });

    if (approved) {
      // Create influencer profile
      await createInfluencerProfile(
        application.userId,
        tier || 'bronze',
        application
      );
    }

    // Notify applicant
    await db.collection('notifications').add({
      userId: application.userId,
      type: 'influencer_application_result',
      title: approved ? 'Application Approved!' : 'Application Update',
      message: approved 
        ? 'Congratulations! Your influencer application has been approved.'
        : 'Thank you for your interest. We will keep your application on file.',
      data: { applicationId, approved },
      createdAt: Timestamp.now()
    });

    return {
      success: true,
      approved
    };
  } catch (error: any) {
    console.error('Error reviewing application:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create influencer profile after approval
 */
async function createInfluencerProfile(
  userId: string,
  tier: InfluencerTier,
  application: InfluencerApplication
): Promise<void> {
  // Generate unique referral code
  const referralCode = await generateReferralCode(userId);

  // Create profile
  const profileRef = db.collection('influencerProfiles').doc(userId);
  const profile: InfluencerProfile = {
    id: userId,
    userId,
    tier,
    status: 'active',
    contractId: '', // Will be set when contract is created
    referralCode,
    totalEarnings: 0,
    lifetimeInstalls: 0,
    lifetimeSignups: 0,
    lifetimeRevenue: 0,
    rating: 5.0,
    verificationStatus: {
      idVerified: false,
      backgroundCheckPassed: false,
      contractSigned: false
    },
    paymentInfo: {
      method: '',
      details: {}
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  await profileRef.set(profile);

  // Create initial contract
  await createInfluencerContract(userId, tier, application.regions);
}

/**
 * Generate unique referral code
 */
async function generateReferralCode(userId: string): Promise<string> {
  const prefix = 'AV';
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `${prefix}${random}`;

  // Check uniqueness
  const existing = await db.collection('influencerProfiles')
    .where('referralCode', '==', code)
    .get();

  if (!existing.empty) {
    // Recursive call if collision
    return generateReferralCode(userId);
  }

  return code;
}

/**
 * Create influencer contract
 */
async function createInfluencerContract(
  influencerId: string,
  tier: InfluencerTier,
  territories: string[]
): Promise<string> {
  // Define tier-based commission rates
  const tierRates: Record<InfluencerTier, number> = {
    bronze: 5,
    silver: 10,
    gold: 15,
    royal_ambassador: 20
  };

  // Define tier-based bonuses
  const tierBonuses: Record<InfluencerTier, { signupBonus: number; installBonus: number; purchaseBonus: number }> = {
    bronze: { signupBonus: 1, installBonus: 0.5, purchaseBonus: 2 },
    silver: { signupBonus: 2, installBonus: 1, purchaseBonus: 5 },
    gold: { signupBonus: 5, installBonus: 2, purchaseBonus: 10 },
    royal_ambassador: { signupBonus: 10, installBonus: 5, purchaseBonus: 20 }
  };

  const contractRef = db.collection('influencerContracts').doc();
  const contract: InfluencerContract = {
    id: contractRef.id,
    influencerId,
    tier,
    startDate: Timestamp.now(),
    commissionRate: tierRates[tier],
    bonusStructure: tierBonuses[tier],
    exclusivity: tier === 'royal_ambassador',
    territories: territories || ['global'],
    contentRequirements: {
      minimumPosts: tier === 'bronze' ? 2 : tier === 'silver' ? 4 : 8,
      postingFrequency: tier === 'bronze' ? 'monthly' : tier === 'silver' ? 'bi-weekly' : 'weekly'
    },
    status: 'active',
    signedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  await contractRef.set(contract);

  // Update profile with contract ID
  await db.collection('influencerProfiles').doc(influencerId).update({
    contractId: contractRef.id,
    'verificationStatus.contractSigned': true,
    updatedAt: Timestamp.now()
  });

  return contractRef.id;
}

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

/**
 * Track influencer performance
 * Called by other systems when events occur
 */
export const trackInfluencerEvent = functions.https.onCall(async (data, context) => {
  const { referralCode, eventType, eventData } = data;

  if (!referralCode || !eventType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Find influencer by referral code
    const profileSnapshot = await db.collection('influencerProfiles')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (profileSnapshot.empty) {
      // Not an error - just not a valid referral code
      return { success: true, tracked: false };
    }

    const influencerProfile = profileSnapshot.docs[0];
    const influencerId = influencerProfile.id;

    // Get current period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get or create performance document
    const perfId = `${influencerId}_${period}`;
    const perfRef = db.collection('influencerPerformance').doc(perfId);
    const perfDoc = await perfRef.get();

    let performance: InfluencerPerformance;
    if (perfDoc.exists) {
      performance = perfDoc.data() as InfluencerPerformance;
    } else {
      performance = {
        influencerId,
        period,
        metrics: {
          installs: 0,
          signups: 0,
          verifications: 0,
          paidChats: 0,
          calendarBookings: 0,
          purchases: 0,
          totalRevenue: 0,
          ltv: 0
        },
        earnings: {
          commissions: 0,
          bonuses: 0,
          total: 0
        },
        engagement: {
          posts: 0,
          reach: 0,
          impressions: 0,
          clicks: 0
        },
        conversionRate: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
    }

    // Update metrics based on event type
    switch (eventType) {
      case 'install':
        performance.metrics.installs += 1;
        break;
      case 'signup':
        performance.metrics.signups += 1;
        break;
      case 'verification':
        performance.metrics.verifications += 1;
        break;
      case 'paid_chat':
        performance.metrics.paidChats += 1;
        performance.metrics.totalRevenue += eventData?.amount || 0;
        break;
      case 'calendar_booking':
        performance.metrics.calendarBookings += 1;
        performance.metrics.totalRevenue += eventData?.amount || 0;
        break;
      case 'purchase':
        performance.metrics.purchases += 1;
        performance.metrics.totalRevenue += eventData?.amount || 0;
        break;
    }

    // Calculate conversion rate
    if (performance.metrics.installs > 0) {
      performance.conversionRate = performance.metrics.signups / performance.metrics.installs;
    }

    performance.updatedAt = Timestamp.now();

    await perfRef.set(performance);

    // Update lifetime stats
    await updateLifetimeStats(influencerId, eventType, eventData);

    return {
      success: true,
      tracked: true
    };
  } catch (error: any) {
    console.error('Error tracking influencer event:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update lifetime stats
 */
async function updateLifetimeStats(
  influencerId: string,
  eventType: string,
  eventData: any
): Promise<void> {
  const profileRef = db.collection('influencerProfiles').doc(influencerId);
  
  const updates: any = { updatedAt: Timestamp.now() };

  switch (eventType) {
    case 'install':
      updates.lifetimeInstalls = FieldValue.increment(1);
      break;
    case 'signup':
      updates.lifetimeSignups = FieldValue.increment(1);
      break;
    case 'paid_chat':
    case 'calendar_booking':
    case 'purchase':
      updates.lifetimeRevenue = FieldValue.increment(eventData?.amount || 0);
      break;
  }

  await profileRef.update(updates);
}

// ============================================================================
// PAYOUTS
// ============================================================================

/**
 * Calculate and process influencer payouts
 * Scheduled monthly function
 */
export const processInfluencerPayouts = functions.pubsub
  .schedule('0 0 1 * *') // First day of each month
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      // Check feature flag
      const flagDoc = await db.collection('featureFlags').doc('influencer.engine.enabled').get();
      if (!flagDoc.exists || !flagDoc.data()?.enabled) {
        console.log('Influencer engine disabled, skipping payouts');
        return null;
      }

      // Get last month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

      // Get all performance records for last month
      const perfSnapshot = await db.collection('influencerPerformance')
        .where('period', '==', period)
        .get();

      for (const perfDoc of perfSnapshot.docs) {
        const performance = perfDoc.data() as InfluencerPerformance;
        
        // Get influencer contract
        const profileDoc = await db.collection('influencerProfiles').doc(performance.influencerId).get();
        if (!profileDoc.exists) continue;

        const profile = profileDoc.data() as InfluencerProfile;
        if (!profile.contractId) continue;

        const contractDoc = await db.collection('influencerContracts').doc(profile.contractId).get();
        if (!contractDoc.exists) continue;

        const contract = contractDoc.data() as InfluencerContract;

        // Calculate earnings
        const commissions = performance.metrics.totalRevenue * (contract.commissionRate / 100);
        
        const bonuses = 
          (performance.metrics.signups * contract.bonusStructure.signupBonus) +
          (performance.metrics.installs * contract.bonusStructure.installBonus) +
          (performance.metrics.purchases * contract.bonusStructure.purchaseBonus);

        const totalEarnings = commissions + bonuses;

        // Update performance with earnings
        await perfDoc.ref.update({
          'earnings.commissions': commissions,
          'earnings.bonuses': bonuses,
          'earnings.total': totalEarnings,
          updatedAt: Timestamp.now()
        });

        // Create payout record (integrates with PACK 277 - Wallet)
        await db.collection('influencerPayouts').add({
          influencerId: performance.influencerId,
          period,
          amount: totalEarnings,
          commissions,
          bonuses,
          status: 'pending',
          metrics: performance.metrics,
          createdAt: Timestamp.now()
        });

        // Update profile total earnings
        await profileDoc.ref.update({
          totalEarnings: FieldValue.increment(totalEarnings),
          updatedAt: Timestamp.now()
        });

        // Send notification
        await db.collection('notifications').add({
          userId: performance.influencerId,
          type: 'influencer_payout',
          title: 'Earnings Available',
          message: `Your earnings of $${totalEarnings.toFixed(2)} for ${period} are ready for withdrawal`,
          data: { period, amount: totalEarnings },
          createdAt: Timestamp.now()
        });
      }

      console.log(`Processed ${perfSnapshot.size} influencer payouts for period ${period}`);
      return null;
    } catch (error) {
      console.error('Error processing influencer payouts:', error);
      return null;
    }
  });

/**
 * Get influencer dashboard data
 */
export const getInfluencerDashboard = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Get influencer profile
    const profileDoc = await db.collection('influencerProfiles').doc(userId).get();
    if (!profileDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Influencer profile not found');
    }

    const profile = profileDoc.data() as InfluencerProfile;

    // Get current month performance
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const perfId = `${userId}_${currentPeriod}`;
    
    const perfDoc = await db.collection('influencerPerformance').doc(perfId).get();
    const currentPerformance = perfDoc.exists ? perfDoc.data() : null;

    // Get recent payouts
    const payoutsSnapshot = await db.collection('influencerPayouts')
      .where('influencerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    const payouts = payoutsSnapshot.docs.map(doc => doc.data());

    // Get contract
    let contract = null;
    if (profile.contractId) {
      const contractDoc = await db.collection('influencerContracts').doc(profile.contractId).get();
      if (contractDoc.exists) {
        contract = contractDoc.data();
      }
    }

    return {
      success: true,
      profile,
      contract,
      currentPerformance,
      payouts
    };
  } catch (error: any) {
    console.error('Error getting influencer dashboard:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update influencer tier
 */
export const updateInfluencerTier = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'influencer_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { influencerId, newTier } = data;

  if (!influencerId || !newTier) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const profileDoc = await db.collection('influencerProfiles').doc(influencerId).get();
    if (!profileDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Influencer not found');
    }

    const profile = profileDoc.data() as InfluencerProfile;

    // Update profile tier
    await profileDoc.ref.update({
      tier: newTier,
      updatedAt: Timestamp.now()
    });

    // Create new contract with new tier
    if (profile.contractId) {
      // Terminate old contract
      await db.collection('influencerContracts').doc(profile.contractId).update({
        status: 'terminated',
        terminatedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    }

    // Get old territories from contract
    let territories = ['global'];
    if (profile.contractId) {
      const oldContract = await db.collection('influencerContracts').doc(profile.contractId).get();
      if (oldContract.exists) {
        territories = (oldContract.data() as InfluencerContract).territories;
      }
    }

    // Create new contract
    await createInfluencerContract(influencerId, newTier, territories);

    return {
      success: true,
      newTier
    };
  } catch (error: any) {
    console.error('Error updating influencer tier:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
