/**
 * PACK 63 — AML & Risk Monitoring Hub
 * Monitoring APIs, Event Logging, and Aggregation Jobs
 */

import * as functions from 'firebase-functions';
import { db, admin } from './init';
import { 
  computeAmlRisk, 
  isKycRequired, 
  suggestAmlStatus,
  AmlInputMetrics,
  AmlRiskResult 
} from './amlRiskEngine';

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ============================================================================
// EXTENDED AML TYPES (Building on PACK 55)
// ============================================================================

export interface ExtendedAMLProfile {
  userId: string;
  
  // Overall risk
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFlags: string[];
  lastRiskEvaluatedAt: admin.firestore.Timestamp;
  
  // Identity & KYC snapshot
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: 'NONE' | 'BASIC' | 'FULL';
  
  // Financial activity (tokens) - rolling windows
  tokensPurchased7d: number;
  tokensPurchased30d: number;
  tokensPurchased90d: number;
  tokensPurchasedAllTime: number;
  
  tokensEarned7d: number;
  tokensEarned30d: number;
  tokensEarned90d: number;
  tokensEarnedAllTime: number;
  
  tokensCashedOut7d: number;
  tokensCashedOut30d: number;
  tokensCashedOut90d: number;
  tokensCashedOutAllTime: number;
  
  // Structural indicators
  payoutsCount30d: number;
  disputesCount30d: number;
  disputesLossCount30d: number;
  reservationsCompleted30d: number;
  reservationsNoShowFlags30d: number;
  
  // Behavior & velocity
  accountAgeDays: number;
  lastLoginAt?: admin.firestore.Timestamp | null;
  countryIso?: string | null;
  multiAccountRisk?: 'NONE' | 'SUSPECTED' | 'CONFIRMED';
  
  // AML ops state
  status: 'NORMAL' | 'UNDER_REVIEW' | 'RESTRICTED' | 'BLOCK_PAYOUTS' | 'BLOCK_EARNINGS';
  statusReason?: string | null;
  lastStatusUpdatedAt?: admin.firestore.Timestamp | null;
  lastStatusUpdatedBy?: string | null;
  
  // Audit
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export type AmlEventKind =
  | 'LARGE_TOKEN_PURCHASE'
  | 'FREQUENT_PURCHASES'
  | 'LARGE_PAYOUT'
  | 'FREQUENT_PAYOUTS'
  | 'HIGH_RESERVATION_VOLUME'
  | 'PROMOTION_SPEND_SPIKE'
  | 'DISPUTE_LOSS_SPIKE'
  | 'SECURITY_RISK_FLAG'
  | 'KYC_UPGRADE_REQUIRED'
  | 'KYC_MISMATCH'
  | 'OTHER';

export type AmlEventSeverity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';

export interface AmlEvent {
  eventId: string;
  userId: string;
  kind: AmlEventKind;
  severity: AmlEventSeverity;
  description: string;
  details?: any;
  source: string;
  createdAt: admin.firestore.Timestamp;
  handled: boolean;
  handledAt?: admin.firestore.Timestamp;
  handledBy?: string | null;
  handlingNote?: string | null;
}

export interface AmlConfig {
  largeTokenPurchaseTokens: number;
  largePayoutTokens: number;
  frequentPayoutsCount30d: number;
  highDisputeLossRatio: number;
  manyDisputesCount30d: number;
  highNoShowCount30d: number;
  highCashoutRatio: number;
  minVolumeForAmlMonitoring: number;
}

// ============================================================================
// HELPER: GET AML CONFIG
// ============================================================================

async function getAmlConfig(): Promise<AmlConfig> {
  const configDoc = await db.collection('aml_config').doc('global').get();
  
  if (configDoc.exists) {
    return configDoc.data() as AmlConfig;
  }
  
  // Default configuration
  const defaultConfig: AmlConfig = {
    largeTokenPurchaseTokens: 10000,
    largePayoutTokens: 5000,
    frequentPayoutsCount30d: 10,
    highDisputeLossRatio: 0.5,
    manyDisputesCount30d: 5,
    highNoShowCount30d: 3,
    highCashoutRatio: 0.8,
    minVolumeForAmlMonitoring: 100
  };
  
  await db.collection('aml_config').doc('global').set(defaultConfig);
  return defaultConfig;
}

// ============================================================================
// HELPER: CREATE AML EVENT
// ============================================================================

export async function createAmlEvent(params: {
  userId: string;
  kind: AmlEventKind;
  severity: AmlEventSeverity;
  description: string;
  details?: any;
  source: string;
}): Promise<string> {
  const eventId = db.collection('aml_events').doc().id;
  const now = Timestamp.now();
  
  const event: AmlEvent = {
    eventId,
    userId: params.userId,
    kind: params.kind,
    severity: params.severity,
    description: params.description,
    details: params.details || {},
    source: params.source,
    createdAt: now,
    handled: false
  };
  
  await db.collection('aml_events').doc(eventId).set(event);
  
  console.log(`[AML Event] Created ${params.kind} for user ${params.userId}: ${params.description}`);
  
  return eventId;
}

// ============================================================================
// AGGREGATION: UPDATE AML PROFILE
// ============================================================================

/**
 * Aggregate metrics and update AML profile for a single user.
 */
export async function aggregateAmlProfileForUser(userId: string): Promise<void> {
  try {
    const now = Timestamp.now();
    const nowDate = now.toDate();
    
    // Calculate date boundaries
    const date7dAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30dAgo = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const date90dAgo = new Date(nowDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    // ============================================================================
    // FETCH TOKEN PURCHASES
    // ============================================================================
    
    const purchaseSnapshot = await db.collection('token_transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'PURCHASE')
      .where('createdAt', '>=', Timestamp.fromDate(date90dAgo))
      .get();
    
    let tokensPurchased7d = 0;
    let tokensPurchased30d = 0;
    let tokensPurchased90d = 0;
    let tokensPurchasedAllTime = 0;
    
    for (const doc of purchaseSnapshot.docs) {
      const tx = doc.data();
      const amount = Math.abs(tx.amount || 0);
      const txDate = tx.createdAt.toDate();
      
      tokensPurchased90d += amount;
      if (txDate >= date30dAgo) {
        tokensPurchased30d += amount;
      }
      if (txDate >= date7dAgo) {
        tokensPurchased7d += amount;
      }
    }
    
    // Get all-time purchases
    const allPurchasesSnapshot = await db.collection('token_transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'PURCHASE')
      .get();
    
    for (const doc of allPurchasesSnapshot.docs) {
      tokensPurchasedAllTime += Math.abs(doc.data().amount || 0);
    }
    
    // ============================================================================
    // FETCH TOKEN EARNINGS
    // ============================================================================
    
    const earningsDoc = await db.collection('creator_earnings').doc(userId).get();
    const earningsData = earningsDoc.data();
    
    const tokensEarnedAllTime = earningsData?.totalTokensEarned || 0;
    const tokensEarned30d = earningsData?.last30Days || 0;
    const tokensEarned90d = earningsData?.last90Days || 0;
    const tokensEarned7d = earningsData?.last7Days || 0;
    
    // ============================================================================
    // FETCH PAYOUT DATA
    // ============================================================================
    
    const payoutsSnapshot = await db.collection('payout_requests')
      .where('userId', '==', userId)
      .where('status', 'in', ['PAID', 'PROCESSING'])
      .where('createdAt', '>=', Timestamp.fromDate(date90dAgo))
      .get();
    
    let tokensCashedOut7d = 0;
    let tokensCashedOut30d = 0;
    let tokensCashedOut90d = 0;
    let tokensCashedOutAllTime = 0;
    let payoutsCount30d = 0;
    
    for (const doc of payoutsSnapshot.docs) {
      const payout = doc.data();
      const tokens = payout.tokensRequested || 0;
      const payoutDate = payout.createdAt.toDate();
      
      tokensCashedOut90d += tokens;
      if (payoutDate >= date30dAgo) {
        tokensCashedOut30d += tokens;
        payoutsCount30d++;
      }
      if (payoutDate >= date7dAgo) {
        tokensCashedOut7d += tokens;
      }
    }
    
    // Get all-time payouts
    const allPayoutsSnapshot = await db.collection('payout_requests')
      .where('userId', '==', userId)
      .where('status', 'in', ['PAID', 'PROCESSING'])
      .get();
    
    for (const doc of allPayoutsSnapshot.docs) {
      tokensCashedOutAllTime += doc.data().tokensRequested || 0;
    }
    
    // ============================================================================
    // FETCH DISPUTE DATA
    // ============================================================================
    
    const disputesSnapshot = await db.collection('disputes')
      .where('createdByUserId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(date30dAgo))
      .get();
    
    let disputesCount30d = 0;
    let disputesLossCount30d = 0;
    
    for (const doc of disputesSnapshot.docs) {
      const dispute = doc.data();
      disputesCount30d++;
      
      if (dispute.resolution?.outcome === 'DENIED' || 
          dispute.resolution?.outcome === 'REFUND_ISSUED') {
        disputesLossCount30d++;
      }
    }
    
    // ============================================================================
    // FETCH RESERVATION DATA
    // ============================================================================
    
    const reservationsSnapshot = await db.collection('reservations')
      .where('creatorUserId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(date30dAgo))
      .get();
    
    let reservationsCompleted30d = 0;
    let reservationsNoShowFlags30d = 0;
    
    for (const doc of reservationsSnapshot.docs) {
      const reservation = doc.data();
      
      if (reservation.status === 'COMPLETED') {
        reservationsCompleted30d++;
      }
      
      if (reservation.status === 'NO_SHOW_CREATOR' || 
          reservation.status === 'NO_SHOW_CLIENT') {
        reservationsNoShowFlags30d++;
      }
    }
    
    // ============================================================================
    // FETCH ACCOUNT METADATA
    // ============================================================================
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const createdAt = userData?.createdAt || now;
    const accountAgeDays = Math.floor((nowDate.getTime() - createdAt.toDate().getTime()) / (24 * 60 * 60 * 1000));
    
    const countryIso = userData?.country || null;
    const lastLoginAt = userData?.lastLoginAt || null;
    
    // ============================================================================
    // FETCH KYC STATUS
    // ============================================================================
    
    const amlDoc = await db.collection('aml_profiles').doc(userId).get();
    const existingAml = amlDoc.data();
    
    const kycLevel = existingAml?.kycLevel || 'NONE';
    const kycVerified = existingAml?.kycVerified || false;
    
    // ============================================================================
    // COMPUTE RISK
    // ============================================================================
    
    const metrics: AmlInputMetrics = {
      tokensPurchased7d,
      tokensPurchased30d,
      tokensPurchased90d,
      tokensEarned7d,
      tokensEarned30d,
      tokensEarned90d,
      tokensCashedOut7d,
      tokensCashedOut30d,
      tokensCashedOut90d,
      payoutsCount30d,
      disputesCount30d,
      disputesLossCount30d,
      reservationsCompleted30d,
      reservationsNoShowFlags30d,
      accountAgeDays,
      kycLevel,
      countryIso: countryIso || undefined,
      multiAccountRisk: existingAml?.multiAccountRisk || 'NONE'
    };
    
    const riskResult = computeAmlRisk(metrics);
    
    // Check if KYC required
    const kycRequired = isKycRequired(tokensEarnedAllTime, tokensEarned30d + tokensEarned90d);
    
    // ============================================================================
    // UPDATE AML PROFILE
    // ============================================================================
    
    const profileData: Partial<ExtendedAMLProfile> = {
      userId,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      riskFlags: riskResult.riskFlags,
      lastRiskEvaluatedAt: now,
      
      kycRequired,
      kycVerified,
      kycLevel,
      
      tokensPurchased7d,
      tokensPurchased30d,
      tokensPurchased90d,
      tokensPurchasedAllTime,
      
      tokensEarned7d,
      tokensEarned30d,
      tokensEarned90d,
      tokensEarnedAllTime,
      
      tokensCashedOut7d,
      tokensCashedOut30d,
      tokensCashedOut90d,
      tokensCashedOutAllTime,
      
      payoutsCount30d,
      disputesCount30d,
      disputesLossCount30d,
      reservationsCompleted30d,
      reservationsNoShowFlags30d,
      
      accountAgeDays,
      lastLoginAt,
      countryIso,
      
      updatedAt: now
    };
    
    // Preserve existing status unless we need to escalate
    if (!amlDoc.exists) {
      profileData.status = 'NORMAL';
      profileData.createdAt = now;
    }
    
    await db.collection('aml_profiles').doc(userId).set(profileData, { merge: true });
    
    // ============================================================================
    // CREATE EVENTS FOR RISK ESCALATION
    // ============================================================================
    
    const oldRiskLevel = existingAml?.riskLevel || 'LOW';
    
    if (riskResult.riskLevel === 'CRITICAL' && oldRiskLevel !== 'CRITICAL') {
      await createAmlEvent({
        userId,
        kind: 'OTHER',
        severity: 'CRITICAL',
        description: `Risk level escalated to CRITICAL (score: ${riskResult.riskScore})`,
        details: { riskFlags: riskResult.riskFlags, metrics },
        source: 'AML_AGGREGATION'
      });
    } else if (riskResult.riskLevel === 'HIGH' && !['HIGH', 'CRITICAL'].includes(oldRiskLevel)) {
      await createAmlEvent({
        userId,
        kind: 'OTHER',
        severity: 'HIGH',
        description: `Risk level escalated to HIGH (score: ${riskResult.riskScore})`,
        details: { riskFlags: riskResult.riskFlags, metrics },
        source: 'AML_AGGREGATION'
      });
    }
    
    // KYC requirement event
    if (kycRequired && !kycVerified && (!existingAml || !existingAml.kycRequired)) {
      await createAmlEvent({
        userId,
        kind: 'KYC_UPGRADE_REQUIRED',
        severity: 'WARN',
        description: 'KYC verification now required due to earning thresholds',
        details: { tokensEarnedAllTime },
        source: 'AML_AGGREGATION'
      });
    }
    
    console.log(`[AML Aggregation] Updated profile for user ${userId}: ${riskResult.riskLevel} risk (${riskResult.riskScore})`);
    
  } catch (error: any) {
    console.error(`[AML Aggregation] Error for user ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// SCHEDULED JOB: AGGREGATE AML PROFILES
// ============================================================================

/**
 * Scheduled function to aggregate AML profiles.
 * Runs daily at 2 AM UTC.
 */
export const aggregateAmlProfiles = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[AML Aggregation] Starting daily AML profile aggregation');
    
    try {
      const config = await getAmlConfig();
      
      // Get users with recent activity (earnings, purchases, or payouts in last 90 days)
      const date90dAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      // Get users with recent earnings
      const earningsSnapshot = await db.collection('creator_earnings')
        .where('updatedAt', '>=', Timestamp.fromDate(date90dAgo))
        .limit(1000)
        .get();
      
      const userIds = new Set<string>();
      earningsSnapshot.forEach(doc => userIds.add(doc.id));
      
      // Also get users with existing AML profiles
      const amlSnapshot = await db.collection('aml_profiles')
        .where('updatedAt', '>=', Timestamp.fromDate(date90dAgo))
        .limit(1000)
        .get();
      
      amlSnapshot.forEach(doc => userIds.add(doc.id));
      
      // Process each user
      let processedCount = 0;
      let errorCount = 0;
      
      const userIdArray = Array.from(userIds);
      for (const userId of userIdArray) {
        try {
          await aggregateAmlProfileForUser(userId);
          processedCount++;
          
          // Rate limit to avoid overwhelming Firestore
          if (processedCount % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error: any) {
          console.error(`[AML Aggregation] Failed for user ${userId}:`, error);
          errorCount++;
        }
      }
      
      console.log(`[AML Aggregation] Completed: ${processedCount} profiles updated, ${errorCount} errors`);
      
      return { success: true, processed: processedCount, errors: errorCount };
    } catch (error: any) {
      console.error('[AML Aggregation] Job failed:', error);
      throw error;
    }
  });

// ============================================================================
// API: LIST HIGH-RISK USERS (ADMIN/OPS)
// ============================================================================

export const getRiskyUsers = functions.https.onRequest(async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    const minRiskLevel = (req.query.minRiskLevel as string) || 'HIGH';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;
    
    // Validate risk level
    const validLevels = ['MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validLevels.includes(minRiskLevel)) {
      res.status(400).json({ error: 'Invalid minRiskLevel' });
      return;
    }
    
    // Build query
    let query: any = db.collection('aml_profiles');
    
    // Filter by risk level
    if (minRiskLevel === 'CRITICAL') {
      query = query.where('riskLevel', '==', 'CRITICAL');
    } else if (minRiskLevel === 'HIGH') {
      query = query.where('riskLevel', 'in', ['HIGH', 'CRITICAL']);
    } else if (minRiskLevel === 'MEDIUM') {
      query = query.where('riskLevel', 'in', ['MEDIUM', 'HIGH', 'CRITICAL']);
    }
    
    query = query.orderBy('riskScore', 'desc').limit(limit + 1);
    
    if (cursor) {
      const cursorDoc = await db.collection('aml_profiles').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    
    const items: any[] = [];
    let nextCursor: string | undefined;
    
    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i < limit) {
        const doc = snapshot.docs[i];
        const data = doc.data() as ExtendedAMLProfile;
        
        items.push({
          userId: data.userId,
          riskScore: data.riskScore,
          riskLevel: data.riskLevel,
          riskFlags: data.riskFlags,
          countryIso: data.countryIso,
          kycLevel: data.kycLevel,
          status: data.status,
          updatedAt: data.updatedAt.toMillis()
        });
      } else {
        nextCursor = snapshot.docs[i].id;
      }
    }
    
    res.json({ items, nextCursor });
    
  } catch (error: any) {
    console.error('[AML API] Error in getRiskyUsers:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: GET AML PROFILE DETAIL (ADMIN/OPS)
// ============================================================================

export const getAmlProfile = functions.https.onRequest(async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    const userId = req.query.userId as string;
    
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    
    // Get AML profile
    const profileDoc = await db.collection('aml_profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      res.status(404).json({ error: 'AML profile not found' });
      return;
    }
    
    const profile = profileDoc.data() as ExtendedAMLProfile;
    
    // Get recent events (last 20)
    const eventsSnapshot = await db.collection('aml_events')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    const events = eventsSnapshot.docs.map(doc => {
      const event = doc.data() as AmlEvent;
      return {
        eventId: event.eventId,
        kind: event.kind,
        severity: event.severity,
        description: event.description,
        source: event.source,
        handled: event.handled,
        createdAt: event.createdAt.toMillis()
      };
    });
    
    res.json({
      profile: {
        userId: profile.userId,
        riskScore: profile.riskScore,
        riskLevel: profile.riskLevel,
        riskFlags: profile.riskFlags,
        kycRequired: profile.kycRequired,
        kycVerified: profile.kycVerified,
        kycLevel: profile.kycLevel,
        tokensPurchased30d: profile.tokensPurchased30d,
        tokensEarned30d: profile.tokensEarned30d,
        tokensCashedOut30d: profile.tokensCashedOut30d,
        tokensEarnedAllTime: profile.tokensEarnedAllTime,
        tokensCashedOutAllTime: profile.tokensCashedOutAllTime,
        payoutsCount30d: profile.payoutsCount30d,
        disputesCount30d: profile.disputesCount30d,
        disputesLossCount30d: profile.disputesLossCount30d,
        reservationsCompleted30d: profile.reservationsCompleted30d,
        reservationsNoShowFlags30d: profile.reservationsNoShowFlags30d,
        accountAgeDays: profile.accountAgeDays,
        countryIso: profile.countryIso,
        status: profile.status,
        statusReason: profile.statusReason,
        lastStatusUpdatedAt: profile.lastStatusUpdatedAt?.toMillis(),
        lastStatusUpdatedBy: profile.lastStatusUpdatedBy,
        updatedAt: profile.updatedAt.toMillis()
      },
      events
    });
    
  } catch (error: any) {
    console.error('[AML API] Error in getAmlProfile:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: SET AML STATUS (ADMIN/OPS)
// ============================================================================

export const setAmlStatus = functions.https.onRequest(async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    const { adminId, userId, status, statusReason } = req.body;
    
    if (!adminId || !userId || !status) {
      res.status(400).json({ error: 'adminId, userId, and status are required' });
      return;
    }
    
    const validStatuses = ['NORMAL', 'UNDER_REVIEW', 'RESTRICTED', 'BLOCK_PAYOUTS', 'BLOCK_EARNINGS'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    const now = Timestamp.now();
    
    // Update AML profile
    await db.collection('aml_profiles').doc(userId).update({
      status,
      statusReason: statusReason || null,
      lastStatusUpdatedAt: now,
      lastStatusUpdatedBy: adminId,
      updatedAt: now
    });
    
    // Create AML event
    await createAmlEvent({
      userId,
      kind: 'OTHER',
      severity: status === 'BLOCK_PAYOUTS' || status === 'BLOCK_EARNINGS' ? 'HIGH' : 'WARN',
      description: `AML status changed to ${status}`,
      details: { adminId, statusReason, previousStatus: status },
      source: 'AML_OPS'
    });
    
    // Apply enforcement actions via existing systems (PACK 54)
    if (status === 'BLOCK_PAYOUTS') {
      // Update enforcement state to block payouts
      await db.collection('enforcement_state').doc(userId).set({
        payoutStatus: 'BLOCKED',
        payoutBlockReason: statusReason || 'AML review required',
        updatedAt: now,
        updatedBy: adminId
      }, { merge: true });
    }
    
    if (status === 'BLOCK_EARNINGS') {
      // Update enforcement state to disable earnings
      await db.collection('enforcement_state').doc(userId).set({
        earningStatus: 'EARN_DISABLED',
        earningBlockReason: statusReason || 'AML review required',
        updatedAt: now,
        updatedBy: adminId
      }, { merge: true });
    }
    
    if (status === 'RESTRICTED') {
      // Log but don't auto-block - manual review needed
      console.log(`[AML] User ${userId} marked as RESTRICTED - manual enforcement review needed`);
    }
    
    res.json({ success: true });
    
  } catch (error: any) {
    console.error('[AML API] Error in setAmlStatus:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API: MARK AML EVENT AS HANDLED (ADMIN/OPS)
// ============================================================================

export const handleAmlEvent = functions.https.onRequest(async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    const { adminId, eventId, note } = req.body;
    
    if (!adminId || !eventId) {
      res.status(400).json({ error: 'adminId and eventId are required' });
      return;
    }
    
    const now = Timestamp.now();
    
    await db.collection('aml_events').doc(eventId).update({
      handled: true,
      handledAt: now,
      handledBy: adminId,
      handlingNote: note || null
    });
    
    res.json({ success: true });
    
  } catch (error: any) {
    console.error('[AML API] Error in handleAmlEvent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HOOKS: TOKEN PURCHASE
// ============================================================================

/**
 * Hook to be called after token purchase.
 * Should be integrated into token purchase flows (Store, Stripe, etc.)
 */
export async function logTokenPurchase(params: {
  userId: string;
  tokensPurchased: number;
  amountUsd: number;
  source: string;
}): Promise<void> {
  try {
    const config = await getAmlConfig();
    
    // Check for large purchase
    if (params.tokensPurchased >= config.largeTokenPurchaseTokens) {
      await createAmlEvent({
        userId: params.userId,
        kind: 'LARGE_TOKEN_PURCHASE',
        severity: 'HIGH',
        description: `Large token purchase: ${params.tokensPurchased} tokens ($${params.amountUsd})`,
        details: {
          tokensPurchased: params.tokensPurchased,
          amountUsd: params.amountUsd,
          source: params.source
        },
        source: 'TOKEN_PURCHASE'
      });
    }
    
    // Check for frequent purchases (last 7 days)
    const date7dAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPurchasesSnapshot = await db.collection('token_transactions')
      .where('userId', '==', params.userId)
      .where('type', '==', 'PURCHASE')
      .where('createdAt', '>=', Timestamp.fromDate(date7dAgo))
      .get();
    
    if (recentPurchasesSnapshot.size >= 5) { // 5+ purchases in 7 days
      await createAmlEvent({
        userId: params.userId,
        kind: 'FREQUENT_PURCHASES',
        severity: 'WARN',
        description: `Frequent purchase pattern: ${recentPurchasesSnapshot.size} purchases in 7 days`,
        details: {
          purchaseCount7d: recentPurchasesSnapshot.size,
          latestPurchase: params.tokensPurchased
        },
        source: 'TOKEN_PURCHASE'
      });
    }
  } catch (error: any) {
    console.error('[AML Hook] Error in logTokenPurchase:', error);
    // Non-blocking
  }
}