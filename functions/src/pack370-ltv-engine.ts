/**
 * PACK 370: PREDICTIVE LTV ENGINE + ROAS OPTIMIZATION LAYER
 * 
 * Core LTV prediction and ROAS feedback system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type UserTier = 'LOW' | 'MID' | 'HIGH' | 'WHALE';

interface LTVForecast {
  userId: string;
  ltvDay1: number;
  ltvDay7: number;
  ltvDay30: number;
  ltvDay90: number;
  confidenceScore: number; // 0-1
  assignedTier: UserTier;
  lastRecalcAt: admin.firestore.Timestamp;
  predictedAt: admin.firestore.Timestamp;
  modelVersion: string;
}

interface UserMetrics {
  tokenSpendVelocity: number;
  creatorEarningsInteraction: number;
  chatConversionRate: number;
  calendarBookings: number;
  retentionSegment: string;
  fraudSafetyScore: number;
  daysSinceSignup: number;
  totalSpent: number;
}

interface ROASSignal {
  adSource: string;
  country: string;
  avgCPI: number;
  avgPredictedLTV: number;
  trueROAS: number;
  recommendedAction: 'SCALE_UP' | 'SCALE_DOWN' | 'HOLD' | 'PAUSE';
  safeScaleLevel: number;
  maxDailyBudget: number;
  createdAt: admin.firestore.Timestamp;
}

// ============================================================================
// LTV TIER THRESHOLDS (PLN)
// ============================================================================

const LTV_TIERS = {
  LOW: { min: 0, max: 20 },
  MID: { min: 20, max: 120 },
  HIGH: { min: 120, max: 500 },
  WHALE: { min: 500, max: Infinity }
};

// ============================================================================
// 1️⃣ MAIN LTV CALCULATION FUNCTION
// ============================================================================

export const pack370_calculateLTVForecast = functions
  .runWith({ memory: '512MB', timeoutSeconds: 300 })
  .https.onCall(async (data: { userId: string }, context) => {
    
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = data;
    
    try {
      // Gather user metrics
      const metrics = await gatherUserMetrics(userId);
      
      // Check fraud score - if too high, invalidate LTV
      if (metrics.fraudSafetyScore > 0.25) {
        await invalidateLTV(userId);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'User LTV invalidated due to fraud score'
        );
      }
      
      // Calculate LTV predictions
      const forecast = await calculateLTVPredictions(userId, metrics);
      
      // Determine tier
      const tier = determineTier(forecast.ltvDay30);
      
      // Build LTV forecast document
      const ltvDoc: LTVForecast = {
        userId,
        ltvDay1: forecast.ltvDay1,
        ltvDay7: forecast.ltvDay7,
        ltvDay30: forecast.ltvDay30,
        ltvDay90: forecast.ltvDay90,
        confidenceScore: forecast.confidence,
        assignedTier: tier,
        lastRecalcAt: admin.firestore.Timestamp.now(),
        predictedAt: admin.firestore.Timestamp.now(),
        modelVersion: '1.0.0'
      };
      
      // Save to Firestore
      await db.collection('userLTVForecast').doc(userId).set(ltvDoc);
      
      // Log to audit (PACK 296)
      await logAuditEvent({
        eventType: 'LTV_CALCULATION',
        userId,
        metadata: {
          tier,
          ltvDay30: forecast.ltvDay30,
          confidence: forecast.confidence
        }
      });
      
      // Update creator LTV profiles if user has interacted with creators
      await updateCreatorLTVProfiles(userId, tier);
      
      // Trigger ROAS signal update
      await updateROASSignals();
      
      return {
        success: true,
        forecast: ltvDoc
      };
      
    } catch (error: any) {
      console.error('Error calculating LTV:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================================================
// 2️⃣ GATHER USER METRICS FROM MULTIPLE PACKS
// ============================================================================

async function gatherUserMetrics(userId: string): Promise<UserMetrics> {
  const batch = await Promise.all([
    // PACK 277: Token spend velocity
    db.collection('walletTransactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get(),
    
    // Creator earnings interaction
    db.collection('creatorEarnings')
      .where('fromUserId', '==', userId)
      .get(),
    
    // Chat conversion rate
    db.collection('chatSessions')
      .where('userId', '==', userId)
      .get(),
    
    // Calendar bookings
    db.collection('calendarBookings')
      .where('bookerId', '==', userId)
      .get(),
    
    // Retention segment (PACK 301)
    db.collection('userRetentionSegments').doc(userId).get(),
    
    // Fraud score (PACK 302)
    db.collection('fraudScores').doc(userId).get(),
    
    // User profile
    db.collection('users').doc(userId).get()
  ]);
  
  const [transactions, earnings, chats, bookings, retention, fraud, userProfile] = batch;
  
  // Calculate token spend velocity (tokens per day)
  let tokenSpendVelocity = 0;
  if (!transactions.empty) {
    const recentSpend = transactions.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + (data.amount || 0);
    }, 0);
    const daysDiff = Math.max(1, 
      (Date.now() - transactions.docs[transactions.size - 1].data().createdAt.toMillis()) / 
      (1000 * 60 * 60 * 24)
    );
    tokenSpendVelocity = recentSpend / daysDiff;
  }
  
  // Creator earnings interaction
  const creatorEarningsInteraction = earnings.size;
  
  // Chat conversion rate (paid chats / total chats)
  const paidChats = chats.docs.filter(doc => doc.data().isPaid).length;
  const chatConversionRate = chats.size > 0 ? paidChats / chats.size : 0;
  
  // Calendar bookings count
  const calendarBookings = bookings.size;
  
  // Retention segment
  const retentionSegment = retention.exists ? retention.data()?.segment : 'unknown';
  
  // Fraud safety score (PACK 302)
  const fraudSafetyScore = fraud.exists ? fraud.data()?.score || 0 : 0;
  
  // Days since signup
  const signupDate = userProfile.exists ? userProfile.data()?.createdAt : null;
  const daysSinceSignup = signupDate ? 
    (Date.now() - signupDate.toMillis()) / (1000 * 60 * 60 * 24) : 0;
  
  // Total spent
  const totalSpent = userProfile.exists ? userProfile.data()?.totalSpent || 0 : 0;
  
  return {
    tokenSpendVelocity,
    creatorEarningsInteraction,
    chatConversionRate,
    calendarBookings,
    retentionSegment,
    fraudSafetyScore,
    daysSinceSignup,
    totalSpent
  };
}

// ============================================================================
// 3️⃣ LTV PREDICTION MODEL
// ============================================================================

async function calculateLTVPredictions(userId: string, metrics: UserMetrics) {
  // Get category multipliers from config
  const config = await db.collection('ltvConfig').doc('multipliers').get();
  const multipliers = config.exists ? config.data() : {
    dating: 1.2,
    creators: 1.5,
    ai: 1.3,
    calendar: 1.4
  };
  
  // Base prediction from current spending
  const baseDaily = metrics.tokenSpendVelocity;
  
  // Retention multiplier
  const retentionMultipliers: Record<string, number> = {
    'core': 2.5,
    'casual': 1.5,
    'atrisk': 0.8,
    'churned': 0.1,
    'unknown': 1.0
  };
  const retentionMult = retentionMultipliers[metrics.retentionSegment] || 1.0;
  
  // Engagement multiplier
  const engagementScore = (
    metrics.chatConversionRate * 2 +
    Math.min(metrics.calendarBookings / 10, 1) * 1.5 +
    Math.min(metrics.creatorEarningsInteraction / 20, 1) * 2
  ) / 3;
  
  const engagementMult = 1 + engagementScore;
  
  // Early user boost (higher uncertainty but potential)
  const earlyBoost = metrics.daysSinceSignup < 7 ? 1.3 : 1.0;
  
  // Calculate predictions
  const ltvDay1 = metrics.totalSpent + (baseDaily * 1 * retentionMult * engagementMult * earlyBoost);
  const ltvDay7 = metrics.totalSpent + (baseDaily * 7 * retentionMult * engagementMult * earlyBoost);
  const ltvDay30 = metrics.totalSpent + (baseDaily * 30 * retentionMult * engagementMult);
  const ltvDay90 = metrics.totalSpent + (baseDaily * 90 * retentionMult * engagementMult * 0.9);
  
  // Confidence score (based on data quality)
  const dataPoints = [
    metrics.tokenSpendVelocity > 0 ? 1 : 0,
    metrics.creatorEarningsInteraction > 0 ? 1 : 0,
    metrics.chatConversionRate > 0 ? 1 : 0,
    metrics.calendarBookings > 0 ? 1 : 0,
    metrics.retentionSegment !== 'unknown' ? 1 : 0,
    metrics.daysSinceSignup >= 7 ? 1 : 0
  ];
  const confidence = dataPoints.reduce((sum, val) => sum + val, 0) / dataPoints.length;
  
  return {
    ltvDay1: Math.max(0, ltvDay1),
    ltvDay7: Math.max(0, ltvDay7),
    ltvDay30: Math.max(0, ltvDay30),
    ltvDay90: Math.max(0, ltvDay90),
    confidence: Math.min(1, Math.max(0, confidence))
  };
}

// ============================================================================
// 4️⃣ TIER DETERMINATION
// ============================================================================

function determineTier(ltvDay30: number): UserTier {
  if (ltvDay30 >= LTV_TIERS.WHALE.min) return 'WHALE';
  if (ltvDay30 >= LTV_TIERS.HIGH.min) return 'HIGH';
  if (ltvDay30 >= LTV_TIERS.MID.min) return 'MID';
  return 'LOW';
}

// ============================================================================
// 5️⃣ ROAS SIGNAL GENERATION
// ============================================================================

export const pack370_pushROASSignals = functions
  .runWith({ memory: '512MB', timeoutSeconds: 540 })
  .pubsub.schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      await updateROASSignals();
      return { success: true };
    } catch (error) {
      console.error('Error pushing ROAS signals:', error);
      throw error;
    }
  });

async function updateROASSignals() {
  // Get all ad sources from PACK 369
  const adCampaigns = await db.collection('adCampaigns')
    .where('status', '==', 'active')
    .get();
  
  if (adCampaigns.empty) return;
  
  // Group by source and country
  const sourceCountryMap = new Map<string, Map<string, { cpi: number[], ltv: number[] }>>();
  
  for (const campaign of adCampaigns.docs) {
    const data = campaign.data();
    const source = data.source;
    const country = data.targetCountry;
    
    // Get users from this campaign
    const users = await db.collection('users')
      .where('acquisitionSource', '==', source)
      .where('country', '==', country)
      .limit(1000)
      .get();
    
    const cpiValues: number[] = [];
    const ltvValues: number[] = [];
    
    for (const user of users.docs) {
      const userId = user.id;
      const cpi = user.data().acquisitionCost || 0;
      
      // Get LTV forecast
      const ltvDoc = await db.collection('userLTVForecast').doc(userId).get();
      if (ltvDoc.exists) {
        const ltv = ltvDoc.data()?.ltvDay30 || 0;
        const fraudScore = ltvDoc.data()?.fraudSafetyScore || 0;
        
        // Ignore if fraud score too high
        if (fraudScore <= 0.25) {
          cpiValues.push(cpi);
          ltvValues.push(ltv);
        }
      }
    }
    
    if (!sourceCountryMap.has(source)) {
      sourceCountryMap.set(source, new Map());
    }
    sourceCountryMap.get(source)!.set(country, { cpi: cpiValues, ltv: ltvValues });
  }
  
  // Calculate ROAS signals
  for (const [source, countryMap] of sourceCountryMap) {
    for (const [country, data] of countryMap) {
      if (data.cpi.length === 0 || data.ltv.length === 0) continue;
      
      const avgCPI = data.cpi.reduce((sum, val) => sum + val, 0) / data.cpi.length;
      const avgLTV = data.ltv.reduce((sum, val) => sum + val, 0) / data.ltv.length;
      
      const trueROAS = avgCPI > 0 ? avgLTV / avgCPI : 0;
      
      // Determine action
      let action: ROASSignal['recommendedAction'] = 'HOLD';
      let scaleLevel = 1.0;
      let maxBudget = 1000; // Default PLN
      
      if (avgCPI > avgLTV * 0.5) {
        // CPI > 50% of LTV → scale down
        action = 'SCALE_DOWN';
        scaleLevel = 0.7;
        maxBudget = 500;
      } else if (avgCPI < avgLTV * 0.2) {
        // CPI < 20% of LTV → scale up
        action = 'SCALE_UP';
        scaleLevel = 1.5;
        maxBudget = 5000;
      }
      
      const signal: ROASSignal = {
        adSource: source,
        country,
        avgCPI,
        avgPredictedLTV: avgLTV,
        trueROAS,
        recommendedAction: action,
        safeScaleLevel: scaleLevel,
        maxDailyBudget: maxBudget,
        createdAt: admin.firestore.Timestamp.now()
      };
      
      // Save signal
      const signalId = `${source}_${country}_${Date.now()}`;
      await db.collection('roasSignals').doc(signalId).set(signal);
      
      // Update PACK 369 ad campaign settings
      await updateAdCampaignSettings(source, country, signal);
      
      // Log to audit
      await logAuditEvent({
        eventType: 'ROAS_SIGNAL_GENERATED',
        userId: 'system',
        metadata: {
          source,
          country,
          trueROAS,
          action
        }
      });
    }
  }
}

// ============================================================================
// 6️⃣ UPDATE AD CAMPAIGN (PACK 369)
// ============================================================================

async function updateAdCampaignSettings(
  source: string,
  country: string,
  signal: ROASSignal
) {
  const campaigns = await db.collection('adCampaigns')
    .where('source', '==', source)
    .where('targetCountry', '==', country)
    .where('status', '==', 'active')
    .get();
  
  for (const campaign of campaigns.docs) {
    await campaign.ref.update({
      'safeScaleLevel': signal.safeScaleLevel,
      'maxDailyBudget': signal.maxDailyBudget,
      'recommendedAction': signal.recommendedAction,
      'lastROASUpdate': admin.firestore.Timestamp.now()
    });
  }
}

// ============================================================================
// 7️⃣ CREATOR LTV PROFILE UPDATES
// ============================================================================

async function updateCreatorLTVProfiles(userId: string, tier: UserTier) {
  // Find all creators this user has interacted with
  const interactions = await db.collection('creatorEarnings')
    .where('fromUserId', '==', userId)
    .get();
  
  for (const interaction of interactions.docs) {
    const creatorId = interaction.data().creatorId;
    
    // Update creator profile
    const profileRef = db.collection('creatorLTVProfiles').doc(creatorId);
    const profile = await profileRef.get();
    
    if (!profile.exists) {
      // Create new profile
      await profileRef.set({
        creatorId,
        totalRevenue: 0,
        userTierCounts: { LOW: 0, MID: 0, HIGH: 0, WHALE: 0 },
        avgUserTier: 'LOW',
        whaleAttractionRate: 0,
        lastUpdated: admin.firestore.Timestamp.now()
      });
    }
    
    // Increment tier count
    await profileRef.update({
      [`userTierCounts.${tier}`]: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.Timestamp.now()
    });
  }
}

// ============================================================================
// 8️⃣ FRAUD INVALIDATION
// ============================================================================

async function invalidateLTV(userId: string) {
  await db.collection('userLTVForecast').doc(userId).update({
    assignedTier: 'LOW',
    ltvDay1: 0,
    ltvDay7: 0,
    ltvDay30: 0,
    ltvDay90: 0,
    confidenceScore: 0,
    invalidatedAt: admin.firestore.Timestamp.now(),
    invalidationReason: 'fraud_score_exceeded'
  });
  
  await logAuditEvent({
    eventType: 'LTV_INVALIDATED',
    userId,
    metadata: { reason: 'fraud_score_exceeded' }
  });
}

export const pack370_invalidateLTV = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    await invalidateLTV(data.userId);
    return { success: true };
  }
);

// ============================================================================
// 9️⃣ SCHEDULED LTV RECALCULATION
// ============================================================================

export const pack370_scheduledLTVRecalc = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 2 hours')
  .onRun(async (context) => {
    const now = Date.now();
    
    // Find users who need recalculation
    const forecasts = await db.collection('userLTVForecast')
      .orderBy('lastRecalcAt', 'asc')
      .limit(500)
      .get();
    
    for (const forecast of forecasts.docs) {
      const userId = forecast.id;
      const lastRecalc = forecast.data().lastRecalcAt.toMillis();
      const hoursSince = (now - lastRecalc) / (1000 * 60 * 60);
      
      // Get user signup date
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) continue;
      
      const signupDate = userDoc.data()?.createdAt?.toMillis() || now;
      const daysSinceSignup = (now - signupDate) / (1000 * 60 * 60 * 24);
      
      // Determine if recalc needed
      let needsRecalc = false;
      if (daysSinceSignup < 1 && hoursSince >= 2) needsRecalc = true;
      else if (daysSinceSignup < 7 && hoursSince >= 6) needsRecalc = true;
      else if (hoursSince >= 24) needsRecalc = true;
      
      if (needsRecalc) {
        try {
          const metrics = await gatherUserMetrics(userId);
          
          if (metrics.fraudSafetyScore > 0.25) {
            await invalidateLTV(userId);
            continue;
          }
          
          const predictions = await calculateLTVPredictions(userId, metrics);
          const tier = determineTier(predictions.ltvDay30);
          
          await db.collection('userLTVForecast').doc(userId).update({
            ltvDay1: predictions.ltvDay1,
            ltvDay7: predictions.ltvDay7,
            ltvDay30: predictions.ltvDay30,
            ltvDay90: predictions.ltvDay90,
            confidenceScore: predictions.confidence,
            assignedTier: tier,
            lastRecalcAt: admin.firestore.Timestamp.now()
          });
          
        } catch (error) {
          console.error(`Error recalculating LTV for user ${userId}:`, error);
        }
      }
    }
    
    return { success: true, processed: forecasts.size };
  });

// ============================================================================
// 🔟 GEO-LEVEL LTV INTELLIGENCE
// ============================================================================

export const pack370_updateGeoLTVProfiles = functions
  .runWith({ memory: '512MB', timeoutSeconds: 540 })
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => {
    // Get all countries
    const users = await db.collection('users').get();
    const countryMap = new Map<string, { ltv: number[], cpi: number[], whales: number }>();
    
    for (const user of users.docs) {
      const country = user.data().country;
      if (!country) continue;
      
      const userId = user.id;
      const cpi = user.data().acquisitionCost || 0;
      
      // Get LTV
      const ltvDoc = await db.collection('userLTVForecast').doc(userId).get();
      if (!ltvDoc.exists) continue;
      
      const ltv = ltvDoc.data()?.ltvDay30 || 0;
      const tier = ltvDoc.data()?.assignedTier;
      
      if (!countryMap.has(country)) {
        countryMap.set(country, { ltv: [], cpi: [], whales: 0 });
      }
      
      const data = countryMap.get(country)!;
      data.ltv.push(ltv);
      data.cpi.push(cpi);
      if (tier === 'WHALE') data.whales++;
    }
    
    // Save geo profiles
    for (const [country, data] of countryMap) {
      const avgLTV = data.ltv.reduce((sum, val) => sum + val, 0) / data.ltv.length;
      const avgCPI = data.cpi.reduce((sum, val) => sum + val, 0) / data.cpi.length;
      const whaleRatio = data.whales / data.ltv.length;
      
      // Get creator activity for this country
      const creators = await db.collection('users')
        .where('country', '==', country)
        .where('isCreator', '==', true)
        .get();
      const creatorActivityIndex = creators.size / Math.max(1, data.ltv.length);
      
      // Calculate risk index (higher = riskier)
      const riskIndex = avgCPI > avgLTV * 0.4 ? 0.8 : 0.2;
      
      await db.collection('geoLTVProfiles').doc(country).set({
        country,
        avgLTV,
        avgCPI,
        whaleRatio,
        creatorActivityIndex,
        riskIndex,
        updatedAt: admin.firestore.Timestamp.now()
      });
    }
    
    return { success: true, countries: countryMap.size };
  });

// ============================================================================
// 1️⃣1️⃣ ADMIN LTV OVERRIDE
// ============================================================================

export const pack370_adminLTVOverride = functions.https.onCall(
  async (data: { userId: string, overrideLTV: number, reason: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    // Check admin role
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || !['admin', 'superadmin'].includes(adminDoc.data()?.role)) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { userId, overrideLTV, reason } = data;
    
    // Save override
    const overrideId = `${userId}_${Date.now()}`;
    await db.collection('ltvOverrideHistory').doc(overrideId).set({
      userId,
      overrideLTV,
      reason,
      adminId: context.auth.uid,
      overrideAt: admin.firestore.Timestamp.now()
    });
    
    // Update LTV forecast
    const tier = determineTier(overrideLTV);
    await db.collection('userLTVForecast').doc(userId).update({
      ltvDay30: overrideLTV,
      assignedTier: tier,
      manualOverride: true,
      lastRecalcAt: admin.firestore.Timestamp.now()
    });
    
    // Log to audit
    await logAuditEvent({
      eventType: 'LTV_MANUAL_OVERRIDE',
      userId: context.auth.uid,
      metadata: { targetUserId: userId, overrideLTV, reason }
    });
    
    return { success: true };
  }
);

// ============================================================================
// HELPER: AUDIT LOGGING (PACK 296)
// ============================================================================

async function logAuditEvent(event: {
  eventType: string;
  userId: string;
  metadata: any;
}) {
  await db.collection('auditLogs').add({
    ...event,
    pack: 'PACK370',
    timestamp: admin.firestore.Timestamp.now()
  });
}
