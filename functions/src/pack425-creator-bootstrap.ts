/**
 * PACK 425 — Creator Bootstrap Engine
 * Seed creator strategy for new market launches
 */

import * as admin from 'firebase-admin';

export interface CreatorBootstrapProfile {
  userId: string;
  countryCode: string;
  
  // Bootstrap status
  status: 'INVITED' | 'ONBOARDED' | 'ACTIVE' | 'GRADUATED' | 'CHURNED';
  enrolledAt: FirebaseFirestore.Timestamp;
  graduatedAt?: FirebaseFirestore.Timestamp;
  
  // Incentives
  incentives: {
    reducedRevenueSplit: boolean;     // e.g., 80/20 instead of 70/30
    bonusVisibility: boolean;         // Priority in Feed/Discovery
    earlyAccessFeatures: boolean;     // Beta features
    dedicatedSupport: boolean;        // Direct support channel
    customAmount?: number;            // Custom bonus amount
  };
  
  // Performance tracking
  metrics: {
    contentCreated: number;
    engagementRate: number;
    tokensEarned: number;
    followersGained: number;
    retentionDays: number;
  };
  
  // Graduation criteria
  graduationCriteria: {
    minContentPieces: number;
    minFollowers: number;
    minTokensEarned: number;
    minActiveDays: number;
  };
  
  notes?: string;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface CountryBootstrapConfig {
  countryCode: string;
  
  // Bootstrap phase
  phase: 'PLANNING' | 'RECRUITING' | 'ACTIVE' | 'GRADUATED' | 'CLOSED';
  
  // Targets
  targetCreatorCount: number;
  currentCreatorCount: number;
  
  // Incentive parameters
  defaultIncentives: {
    revenueSplitCreator: number;      // e.g., 80 (vs normal 70)
    visibilityBoostMultiplier: number; // e.g., 2.0x
    supportTierUpgrade: boolean;
    bonusTokensPerContent: number;
  };
  
  // Recruitment strategy
  recruitmentChannels: string[];
  
  // Timeline
  startDate: FirebaseFirestore.Timestamp;
  targetEndDate: FirebaseFirestore.Timestamp;
  actualEndDate?: FirebaseFirestore.Timestamp;
  
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * Initialize bootstrap program for a country
 */
export async function initializeBootstrapProgram(
  countryCode: string,
  options: {
    targetCreatorCount: number;
    revenueSplitCreator?: number;
    visibilityBoostMultiplier?: number;
    bonusTokensPerContent?: number;
    durationDays?: number;
  }
): Promise<CountryBootstrapConfig> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const durationDays = options.durationDays ?? 90; // Default 90 days
  
  const endDate = new Date(now.toMillis() + durationDays * 24 * 60 * 60 * 1000);
  
  const config: CountryBootstrapConfig = {
    countryCode,
    phase: 'PLANNING',
    targetCreatorCount: options.targetCreatorCount,
    currentCreatorCount: 0,
    defaultIncentives: {
      revenueSplitCreator: options.revenueSplitCreator ?? 80,
      visibilityBoostMultiplier: options.visibilityBoostMultiplier ?? 2.0,
      supportTierUpgrade: true,
      bonusTokensPerContent: options.bonusTokensPerContent ?? 50,
    },
    recruitmentChannels: [
      'INSTAGRAM_DM',
      'TIKTOK_DM',
      'INFLUENCER_AGENCIES',
      'REFERRALS',
      'DIRECT_APPLICATION',
    ],
    startDate: now,
    targetEndDate: admin.firestore.Timestamp.fromMillis(endDate.getTime()),
    updatedAt: now,
  };
  
  await db.collection('creatorBootstrapConfigs').doc(countryCode).set(config);
  
  return config;
}

/**
 * Enroll a creator in bootstrap program
 */
export async function enrollCreatorInBootstrap(
  userId: string,
  countryCode: string,
  customIncentives?: Partial<CreatorBootstrapProfile['incentives']>
): Promise<CreatorBootstrapProfile> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  // Get bootstrap config
  const configDoc = await db.collection('creatorBootstrapConfigs').doc(countryCode).get();
  if (!configDoc.exists) {
    throw new Error(`No bootstrap program found for country: ${countryCode}`);
  }
  
  const config = configDoc.data() as CountryBootstrapConfig;
  
  // Check if already enrolled
  const existingDoc = await db.collection('creatorBootstrap')
    .where('userId', '==', userId)
    .where('countryCode', '==', countryCode)
    .limit(1)
    .get();
  
  if (!existingDoc.empty) {
    throw new Error('Creator already enrolled in bootstrap program');
  }
  
  const profile: CreatorBootstrapProfile = {
    userId,
    countryCode,
    status: 'INVITED',
    enrolledAt: now,
    incentives: {
      reducedRevenueSplit: true,
      bonusVisibility: true,
      earlyAccessFeatures: true,
      dedicatedSupport: true,
      ...customIncentives,
    },
    metrics: {
      contentCreated: 0,
      engagementRate: 0,
      tokensEarned: 0,
      followersGained: 0,
      retentionDays: 0,
    },
    graduationCriteria: {
      minContentPieces: 20,
      minFollowers: 1000,
      minTokensEarned: 5000,
      minActiveDays: 30,
    },
    updatedAt: now,
  };
  
  const docRef = await db.collection('creatorBootstrap').add(profile);
  
  // Update config count
  await db.collection('creatorBootstrapConfigs').doc(countryCode).update({
    currentCreatorCount: admin.firestore.FieldValue.increment(1),
    updatedAt: now,
  });
  
  // Create incentive records for creator
  await applyCreatorIncentives(userId, countryCode, config.defaultIncentives);
  
  return { ...profile };
}

/**
 * Apply bootstrap incentives to a creator
 */
async function applyCreatorIncentives(
  userId: string,
  countryCode: string,
  incentives: CountryBootstrapConfig['defaultIncentives']
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  // Store in creator incentives collection
  await db.collection('creatorIncentives').doc(userId).set({
    bootstrapProgram: true,
    countryCode,
    revenueSplitCreator: incentives.revenueSplitCreator,
    revenueSplitPlatform: 100 - incentives.revenueSplitCreator,
    visibilityBoost: incentives.visibilityBoostMultiplier,
    bonusTokensPerContent: incentives.bonusTokensPerContent,
    supportTier: 'PRIORITY',
    expiresAt: null, // Until graduation
    appliedAt: now,
  }, { merge: true });
}

/**
 * Update creator bootstrap metrics
 */
export async function updateCreatorMetrics(
  userId: string,
  countryCode: string,
  metrics: Partial<CreatorBootstrapProfile['metrics']>
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const snapshot = await db.collection('creatorBootstrap')
    .where('userId', '==', userId)
    .where('countryCode', '==', countryCode)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return;
  }
  
  const docRef = snapshot.docs[0].ref;
  const current = snapshot.docs[0].data() as CreatorBootstrapProfile;
  
  const updatedMetrics = {
    ...current.metrics,
    ...metrics,
  };
  
  await docRef.update({
    metrics: updatedMetrics,
    updatedAt: now,
  });
  
  // Check if ready for graduation
  await checkGraduationEligibility(userId, countryCode);
}

/**
 * Check if creator meets graduation criteria
 */
async function checkGraduationEligibility(
  userId: string,
  countryCode: string
): Promise<boolean> {
  const db = admin.firestore();
  
  const snapshot = await db.collection('creatorBootstrap')
    .where('userId', '==', userId)
    .where('countryCode', '==', countryCode)
    .limit(1)
    .get();
  
  if (snapshot.empty) return false;
  
  const profile = snapshot.docs[0].data() as CreatorBootstrapProfile;
  const { metrics, graduationCriteria } = profile;
  
  const eligible = 
    metrics.contentCreated >= graduationCriteria.minContentPieces &&
    metrics.followersGained >= graduationCriteria.minFollowers &&
    metrics.tokensEarned >= graduationCriteria.minTokensEarned &&
    metrics.retentionDays >= graduationCriteria.minActiveDays;
  
  if (eligible && profile.status !== 'GRADUATED') {
    await graduateCreator(userId, countryCode);
  }
  
  return eligible;
}

/**
 * Graduate creator from bootstrap program
 */
export async function graduateCreator(
  userId: string,
  countryCode: string
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const snapshot = await db.collection('creatorBootstrap')
    .where('userId', '==', userId)
    .where('countryCode', '==', countryCode)
    .limit(1)
    .get();
  
  if (snapshot.empty) return;
  
  const docRef = snapshot.docs[0].ref;
  
  await docRef.update({
    status: 'GRADUATED',
    graduatedAt: now,
    updatedAt: now,
  });
  
  // Transition to standard creator incentives
  await db.collection('creatorIncentives').doc(userId).update({
    bootstrapProgram: false,
    revenueSplitCreator: 70, // Standard split
    revenueSplitPlatform: 30,
    visibilityBoost: 1.0,
    bonusTokensPerContent: 0,
    supportTier: 'STANDARD',
    graduatedAt: now,
  });
  
  // Send graduation notification
  await db.collection('notifications').add({
    userId,
    type: 'BOOTSTRAP_GRADUATION',
    title: 'Congratulations! 🎉',
    message: 'You\'ve graduated from the Creator Bootstrap Program!',
    data: { countryCode },
    createdAt: now,
    read: false,
  });
}

/**
 * Get bootstrap program status for a country
 */
export async function getBootstrapStatus(
  countryCode: string
): Promise<{
  config: CountryBootstrapConfig | null;
  creators: CreatorBootstrapProfile[];
  stats: {
    invited: number;
    onboarded: number;
    active: number;
    graduated: number;
    churned: number;
    targetProgress: number;
  };
}> {
  const db = admin.firestore();
  
  // Get config
  const configDoc = await db.collection('creatorBootstrapConfigs').doc(countryCode).get();
  const config = configDoc.exists ? configDoc.data() as CountryBootstrapConfig : null;
  
  // Get creators
  const creatorsSnapshot = await db.collection('creatorBootstrap')
    .where('countryCode', '==', countryCode)
    .get();
  
  const creators = creatorsSnapshot.docs.map(doc => doc.data() as CreatorBootstrapProfile);
  
  // Calculate stats
  const stats = {
    invited: creators.filter(c => c.status === 'INVITED').length,
    onboarded: creators.filter(c => c.status === 'ONBOARDED').length,
    active: creators.filter(c => c.status === 'ACTIVE').length,
    graduated: creators.filter(c => c.status === 'GRADUATED').length,
    churned: creators.filter(c => c.status === 'CHURNED').length,
    targetProgress: config ? (creators.length / config.targetCreatorCount) * 100 : 0,
  };
  
  return { config, creators, stats };
}

/**
 * Get top performing bootstrap creators
 */
export async function getTopBootstrapCreators(
  countryCode: string,
  metric: keyof CreatorBootstrapProfile['metrics'] = 'tokensEarned',
  limit: number = 10
): Promise<CreatorBootstrapProfile[]> {
  const db = admin.firestore();
  
  const snapshot = await db.collection('creatorBootstrap')
    .where('countryCode', '==', countryCode)
    .get();
  
  const creators = snapshot.docs.map(doc => doc.data() as CreatorBootstrapProfile);
  
  // Sort by metric
  creators.sort((a, b) => b.metrics[metric] - a.metrics[metric]);
  
  return creators.slice(0, limit);
}

/**
 * Update bootstrap program phase
 */
export async function updateBootstrapPhase(
  countryCode: string,
  phase: CountryBootstrapConfig['phase']
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  await db.collection('creatorBootstrapConfigs').doc(countryCode).update({
    phase,
    updatedAt: now,
  });
}

/**
 * Close bootstrap program
 */
export async function closeBootstrapProgram(
  countryCode: string
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  // Update config
  await db.collection('creatorBootstrapConfigs').doc(countryCode).update({
    phase: 'CLOSED',
    actualEndDate: now,
    updatedAt: now,
  });
  
  // Graduate all active creators
  const snapshot = await db.collection('creatorBootstrap')
    .where('countryCode', '==', countryCode)
    .where('status', 'in', ['INVITED', 'ONBOARDED', 'ACTIVE'])
    .get();
  
  for (const doc of snapshot.docs) {
    const profile = doc.data() as CreatorBootstrapProfile;
    await graduateCreator(profile.userId, countryCode);
  }
}

/**
 * Get bootstrap program leaderboard
 */
export async function getBootstrapLeaderboard(
  countryCode: string
): Promise<Array<{
  userId: string;
  rank: number;
  tokensEarned: number;
  followersGained: number;
  contentCreated: number;
}>> {
  const creators = await getTopBootstrapCreators(countryCode, 'tokensEarned', 100);
  
  return creators.map((creator, index) => ({
    userId: creator.userId,
    rank: index + 1,
    tokensEarned: creator.metrics.tokensEarned,
    followersGained: creator.metrics.followersGained,
    contentCreated: creator.metrics.contentCreated,
  }));
}
