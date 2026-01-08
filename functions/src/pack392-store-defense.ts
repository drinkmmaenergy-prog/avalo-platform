/**
 * PACK 392 - Store Defense Engine (Anti-Attack Layer)
 * Protects against review bombing, fake installs, coordinated attacks
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface StoreThreatData {
  storeThreatScore: number; // 0-100, higher = more dangerous
  attackPatternId: string | null;
  storeRiskState: 'SAFE' | 'WARNING' | 'CRITICAL';
  detectedThreats: ThreatSignal[];
  lastAnalysis: FirebaseFirestore.Timestamp;
  nextCheckAt: FirebaseFirestore.Timestamp;
}

export interface ThreatSignal {
  type: 'REVIEW_BOMB' | 'FAKE_INSTALLS' | 'BOT_FLAGS' | 'REFUND_ABUSE' | 'FAKE_REPORTS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0-1
  evidenceIds: string[];
  detectedAt: FirebaseFirestore.Timestamp;
  description: string;
}

export interface AttackPattern {
  id: string;
  type: string;
  startTime: FirebaseFirestore.Timestamp;
  endTime: FirebaseFirestore.Timestamp | null;
  intensity: number;
  affectedStores: string[];
  signatures: string[];
}

export interface StoreMetrics {
  storeId: string;
  installCount: number;
  installVelocity: number; // installs per hour
  reviewCount: number;
  reviewVelocity: number; // reviews per hour
  avgRating: number;
  refundRate: number;
  crashRate: number;
  uninstallRate: number;
  timestamp: FirebaseFirestore.Timestamp;
}

// ============================================================================
// CORE: STORE DEFENSE ENGINE
// ============================================================================

export const pack392_storeDefenseEngine = functions
  .runWith({ 
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    console.log('[PACK 392] Running Store Defense Engine');

    try {
      // Get all active stores
      const storesSnap = await db.collection('stores').where('active', '==', true).get();
      
      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        await analyzeStoreThreats(storeId);
      }

      console.log('[PACK 392] Store Defense Engine completed');
      return { success: true, analyzed: storesSnap.size };
    } catch (error) {
      console.error('[PACK 392] Store Defense Engine error:', error);
      throw error;
    }
  });

async function analyzeStoreThreats(storeId: string): Promise<void> {
  console.log(`[PACK 392] Analyzing threats for store: ${storeId}`);
  
  const now = admin.firestore.Timestamp.now();
  const lookbackHours = 24;
  const lookbackTime = admin.firestore.Timestamp.fromMillis(
    now.toMillis() - (lookbackHours * 60 * 60 * 1000)
  );

  // Gather threat signals from multiple sources
  const threats: ThreatSignal[] = [];

  // 1. Check for review bombing
  const reviewBombThreat = await detectReviewBombing(storeId, lookbackTime);
  if (reviewBombThreat) threats.push(reviewBombThreat);

  // 2. Check for fake installs
  const fakeInstallsThreat = await detectFakeInstalls(storeId, lookbackTime);
  if (fakeInstallsThreat) threats.push(fakeInstallsThreat);

  // 3. Check for refund abuse
  const refundAbuseThreat = await detectRefundAbuse(storeId, lookbackTime);
  if (refundAbuseThreat) threats.push(refundAbuseThreat);

  // 4. Check for coordinated fake reporting
  const fakeReportsThreat = await detectFakeReporting(storeId, lookbackTime);
  if (fakeReportsThreat) threats.push(fakeReportsThreat);

  // Calculate overall threat score
  const threatScore = calculateThreatScore(threats);
  const riskState = determineRiskState(threatScore, threats);

  // Identify attack pattern
  const attackPatternId = await identifyAttackPattern(threats);

  // Store threat analysis
  const threatData: StoreThreatData = {
    storeThreatScore: threatScore,
    attackPatternId,
    storeRiskState: riskState,
    detectedThreats: threats,
    lastAnalysis: now,
    nextCheckAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + (15 * 60 * 1000))
  };

  await db.collection('storeDefense').doc(storeId).set(threatData, { merge: true });

  // Trigger incident response if critical
  if (riskState === 'CRITICAL') {
    await triggerIncidentResponse(storeId, threatData);
  }

  console.log(`[PACK 392] Store ${storeId} threat score: ${threatScore}, state: ${riskState}`);
}

// ============================================================================
// THREAT DETECTION: REVIEW BOMBING
// ============================================================================

async function detectReviewBombing(
  storeId: string, 
  since: FirebaseFirestore.Timestamp
): Promise<ThreatSignal | null> {
  const reviewsSnap = await db.collection('storeReviewsRaw')
    .where('storeId', '==', storeId)
    .where('timestamp', '>=', since)
    .orderBy('timestamp', 'desc')
    .get();

  if (reviewsSnap.empty) return null;

  const reviews = reviewsSnap.docs.map(doc => doc.data());
  
  // Calculate metrics
  const oneStarReviews = reviews.filter(r => r.rating === 1).length;
  const oneStarPercent = oneStarReviews / reviews.length;
  const reviewVelocity = reviews.length / 24; // per hour

  // Check for suspicious patterns
  const suspiciousPatterns = {
    suddenSpike: reviewVelocity > 10, // more than 10 reviews per hour
    highOneStarPercent: oneStarPercent > 0.7, // more than 70% 1-star
    coordinatedTiming: detectCoordinatedTiming(reviews),
    similarContent: detectSimilarContent(reviews),
    newAccounts: detectNewAccounts(reviews)
  };

  const suspiciousCount = Object.values(suspiciousPatterns).filter(v => v).length;
  
  if (suspiciousCount >= 2) {
    return {
      type: 'REVIEW_BOMB',
      severity: suspiciousCount >= 4 ? 'CRITICAL' : suspiciousCount >= 3 ? 'HIGH' : 'MEDIUM',
      confidence: suspiciousCount / 5,
      evidenceIds: reviewsSnap.docs.map(d => d.id),
      detectedAt: admin.firestore.Timestamp.now(),
      description: `Detected review bombing: ${oneStarReviews} 1-star reviews in 24h (${Math.round(oneStarPercent * 100)}%)`
    };
  }

  return null;
}

function detectCoordinatedTiming(reviews: any[]): boolean {
  if (reviews.length < 5) return false;
  
  // Check if reviews came in bursts
  const timestamps = reviews.map(r => r.timestamp.toMillis()).sort();
  let burstCount = 0;
  
  for (let i = 0; i < timestamps.length - 4; i++) {
    const timeWindow = timestamps[i + 4] - timestamps[i];
    if (timeWindow < 5 * 60 * 1000) { // 5+ reviews within 5 minutes
      burstCount++;
    }
  }
  
  return burstCount >= 2;
}

function detectSimilarContent(reviews: any[]): boolean {
  if (reviews.length < 3) return false;
  
  // Simple similarity check: count duplicate phrases
  const phrases = reviews.map(r => r.text?.toLowerCase().substring(0, 50) || '');
  const uniquePhrases = new Set(phrases);
  
  return uniquePhrases.size < reviews.length * 0.5; // more than 50% duplicate
}

function detectNewAccounts(reviews: any[]): boolean {
  const newAccountCount = reviews.filter(r => {
    const accountAge = Date.now() - r.userCreatedAt?.toMillis();
    return accountAge < 7 * 24 * 60 * 60 * 1000; // less than 7 days old
  }).length;
  
  return newAccountCount / reviews.length > 0.6; // more than 60% new accounts
}

// ============================================================================
// THREAT DETECTION: FAKE INSTALLS
// ============================================================================

async function detectFakeInstalls(
  storeId: string,
  since: FirebaseFirestore.Timestamp
): Promise<ThreatSignal | null> {
  const installsSnap = await db.collection('storeInstalls')
    .where('storeId', '==', storeId)
    .where('timestamp', '>=', since)
    .get();

  if (installsSnap.empty || installsSnap.size < 100) return null;

  const installs = installsSnap.docs.map(doc => doc.data());
  
  // Analyze install patterns
  const suspiciousPatterns = {
    noRegistration: installs.filter(i => !i.registered).length / installs.length > 0.9,
    sameIP: detectIPClustering(installs),
    rapidUninstall: installs.filter(i => i.uninstalledWithin24h).length / installs.length > 0.8,
    noEngagement: installs.filter(i => i.sessionCount === 0).length / installs.length > 0.85,
    suspiciousDevices: detectSuspiciousDevices(installs)
  };

  const suspiciousCount = Object.values(suspiciousPatterns).filter(v => v).length;

  if (suspiciousCount >= 2) {
    return {
      type: 'FAKE_INSTALLS',
      severity: suspiciousCount >= 4 ? 'CRITICAL' : suspiciousCount >= 3 ? 'HIGH' : 'MEDIUM',
      confidence: suspiciousCount / 5,
      evidenceIds: installsSnap.docs.slice(0, 100).map(d => d.id),
      detectedAt: admin.firestore.Timestamp.now(),
      description: `Detected ${installs.length} suspicious installs with ${suspiciousCount} red flags`
    };
  }

  return null;
}

function detectIPClustering(installs: any[]): boolean {
  const ipCounts = new Map<string, number>();
  installs.forEach(i => {
    const ip = i.sourceIP;
    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
  });
  
  // Check if any IP has more than 10% of installs
  const maxCount = Math.max(...Array.from(ipCounts.values()));
  return maxCount / installs.length > 0.1;
}

function detectSuspiciousDevices(installs: any[]): boolean {
  const emulatorCount = installs.filter(i => i.isEmulator || i.isRooted).length;
  return emulatorCount / installs.length > 0.3;
}

// ============================================================================
// THREAT DETECTION: REFUND ABUSE
// ============================================================================

async function detectRefundAbuse(
  storeId: string,
  since: FirebaseFirestore.Timestamp
): Promise<ThreatSignal | null> {
  const refundsSnap = await db.collection('transactions')
    .where('storeId', '==', storeId)
    .where('type', '==', 'REFUND')
    .where('timestamp', '>=', since)
    .get();

  if (refundsSnap.empty || refundsSnap.size < 10) return null;

  const refunds = refundsSnap.docs.map(doc => doc.data());
  const totalTransactionsSnap = await db.collection('transactions')
    .where('storeId', '==', storeId)
    .where('timestamp', '>=', since)
    .get();

  const refundRate = refunds.length / totalTransactionsSnap.size;

  // Check for abuse patterns
  const suspiciousPatterns = {
    highRate: refundRate > 0.15, // more than 15% refund rate
    sameUsers: detectRepeatRefunders(refunds),
    rapidRefunds: detectRapidRefunds(refunds),
    coordinatedTiming: detectCoordinatedTiming(refunds)
  };

  const suspiciousCount = Object.values(suspiciousPatterns).filter(v => v).length;

  if (suspiciousCount >= 2) {
    return {
      type: 'REFUND_ABUSE',
      severity: suspiciousCount >= 3 ? 'HIGH' : 'MEDIUM',
      confidence: suspiciousCount / 4,
      evidenceIds: refundsSnap.docs.map(d => d.id),
      detectedAt: admin.firestore.Timestamp.now(),
      description: `Detected refund abuse: ${refunds.length} refunds (${Math.round(refundRate * 100)}% rate)`
    };
  }

  return null;
}

function detectRepeatRefunders(refunds: any[]): boolean {
  const userRefundCounts = new Map<string, number>();
  refunds.forEach(r => {
    const userId = r.userId;
    userRefundCounts.set(userId, (userRefundCounts.get(userId) || 0) + 1);
  });
  
  const repeatRefunders = Array.from(userRefundCounts.values()).filter(count => count > 1).length;
  return repeatRefunders / userRefundCounts.size > 0.5;
}

function detectRapidRefunds(refunds: any[]): boolean {
  const rapidCount = refunds.filter(r => {
    const timeSincePurchase = r.timestamp.toMillis() - r.purchaseTimestamp.toMillis();
    return timeSincePurchase < 60 * 60 * 1000; // refunded within 1 hour
  }).length;
  
  return rapidCount / refunds.length > 0.7;
}

// ============================================================================
// THREAT DETECTION: FAKE REPORTING
// ============================================================================

async function detectFakeReporting(
  storeId: string,
  since: FirebaseFirestore.Timestamp
): Promise<ThreatSignal | null> {
  const reportsSnap = await db.collection('storeReports')
    .where('storeId', '==', storeId)
    .where('timestamp', '>=', since)
    .get();

  if (reportsSnap.empty || reportsSnap.size < 5) return null;

  const reports = reportsSnap.docs.map(doc => doc.data());
  
  // Check for coordinated fake reporting
  const suspiciousPatterns = {
    suddenSpike: reports.length > 10,
    similarContent: detectSimilarContent(reports),
    newAccounts: detectNewAccounts(reports),
    coordinatedTiming: detectCoordinatedTiming(reports),
    sameCategory: detectSameCategorySpam(reports)
  };

  const suspiciousCount = Object.values(suspiciousPatterns).filter(v => v).length;

  if (suspiciousCount >= 3) {
    return {
      type: 'FAKE_REPORTS',
      severity: suspiciousCount >= 4 ? 'HIGH' : 'MEDIUM',
      confidence: suspiciousCount / 5,
      evidenceIds: reportsSnap.docs.map(d => d.id),
      detectedAt: admin.firestore.Timestamp.now(),
      description: `Detected ${reports.length} coordinated fake reports`
    };
  }

  return null;
}

function detectSameCategorySpam(reports: any[]): boolean {
  const categoryCounts = new Map<string, number>();
  reports.forEach(r => {
    const category = r.category;
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  });
  
  const maxCount = Math.max(...Array.from(categoryCounts.values()));
  return maxCount / reports.length > 0.8;
}

// ============================================================================
// THREAT SCORING
// ============================================================================

function calculateThreatScore(threats: ThreatSignal[]): number {
  if (threats.length === 0) return 0;

  const severityWeights = {
    'LOW': 10,
    'MEDIUM': 25,
    'HIGH': 50,
    'CRITICAL': 100
  };

  let totalScore = 0;
  threats.forEach(threat => {
    const baseScore = severityWeights[threat.severity];
    totalScore += baseScore * threat.confidence;
  });

  // Normalize to 0-100
  return Math.min(100, totalScore);
}

function determineRiskState(
  threatScore: number, 
  threats: ThreatSignal[]
): 'SAFE' | 'WARNING' | 'CRITICAL' {
  const hasCriticalThreat = threats.some(t => t.severity === 'CRITICAL');
  
  if (hasCriticalThreat || threatScore >= 70) {
    return 'CRITICAL';
  } else if (threatScore >= 40 || threats.length >= 2) {
    return 'WARNING';
  } else {
    return 'SAFE';
  }
}

async function identifyAttackPattern(threats: ThreatSignal[]): Promise<string | null> {
  if (threats.length === 0) return null;

  // Create signature from threat types
  const signature = threats.map(t => t.type).sort().join('_');
  
  // Check if this pattern exists
  const patternsSnap = await db.collection('attackPatterns')
    .where('signatures', 'array-contains', signature)
    .where('endTime', '==', null)
    .limit(1)
    .get();

  if (!patternsSnap.empty) {
    return patternsSnap.docs[0].id;
  }

  // Create new attack pattern
  const patternData: Omit<AttackPattern, 'id'> = {
    type: signature,
    startTime: admin.firestore.Timestamp.now(),
    endTime: null,
    intensity: threats.length,
    affectedStores: [],
    signatures: [signature]
  };

  const patternRef = await db.collection('attackPatterns').add(patternData);
  return patternRef.id;
}

// ============================================================================
// INCIDENT RESPONSE TRIGGER
// ============================================================================

async function triggerIncidentResponse(storeId: string, threatData: StoreThreatData): Promise<void> {
  console.log(`[PACK 392] CRITICAL: Triggering incident response for store ${storeId}`);
  
  await db.collection('storeIncidents').add({
    storeId,
    threatData,
    status: 'ACTIVE',
    createdAt: admin.firestore.Timestamp.now(),
    responseActions: []
  });

  // Trigger incident response function
  await db.collection('queue').doc('incidentResponse').collection('tasks').add({
    storeId,
    threatScore: threatData.storeThreatScore,
    riskState: threatData.storeRiskState,
    createdAt: admin.firestore.Timestamp.now()
  });
}

// ============================================================================
// MANUAL THREAT ANALYSIS
// ============================================================================

export const pack392_analyzeStoreThreat = functions
  .runWith({ timeoutSeconds: 60, memory: '1GB' })
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId } = data;
    if (!storeId) {
      throw new functions.https.HttpsError('invalid-argument', 'storeId required');
    }

    await analyzeStoreThreats(storeId);

    const threatDoc = await db.collection('storeDefense').doc(storeId).get();
    return threatDoc.data();
  });

// ============================================================================
// GET STORE DEFENSE STATUS
// ============================================================================

export const pack392_getStoreDefenseStatus = functions
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId } = data;
    if (!storeId) {
      throw new functions.https.HttpsError('invalid-argument', 'storeId required');
    }

    const defenseDoc = await db.collection('storeDefense').doc(storeId).get();
    const incidentsSnap = await db.collection('storeIncidents')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    return {
      defense: defenseDoc.data(),
      recentIncidents: incidentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    };
  });
