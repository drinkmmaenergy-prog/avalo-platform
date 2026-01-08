/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * Reputation Signal Ingestion & Analysis
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
type ReputationSource = 'AppStore' | 'PlayStore' | 'X' | 'TikTok' | 'Reddit' | 'Forums' | 'News';
type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Topic = 'safety' | 'scam' | 'pricing' | 'moderation' | 'abuse' | 'privacy' | 'billing' | 'content';

interface ReputationSignal {
  id?: string;
  source: ReputationSource;
  sentimentScore: number; // -1.0 to +1.0
  threatLevel: ThreatLevel;
  topic: Topic;
  geo: string;
  timestamp: admin.firestore.Timestamp;
  content?: string;
  url?: string;
  authorId?: string;
  relatedUserId?: string;
  metadata?: Record<string, any>;
}

/**
 * Ingest a reputation signal from external sources
 */
export const pack387_ingestReputationSignal = functions.https.onCall(
  async (data: Omit<ReputationSignal, 'id' | 'timestamp'>, context) => {
    try {
      // Validate source
      const validSources: ReputationSource[] = ['AppStore', 'PlayStore', 'X', 'TikTok', 'Reddit', 'Forums', 'News'];
      if (!validSources.includes(data.source)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid reputation source');
      }

      // Validate sentiment score
      if (data.sentimentScore < -1.0 || data.sentimentScore > 1.0) {
        throw new functions.https.HttpsError('invalid-argument', 'Sentiment score must be between -1.0 and 1.0');
      }

      // Calculate threat level if not provided
      const threatLevel = data.threatLevel || calculateThreatLevel(data.sentimentScore);

      // Create signal document
      const signal: ReputationSignal = {
        source: data.source,
        sentimentScore: data.sentimentScore,
        threatLevel,
        topic: data.topic,
        geo: data.geo,
        timestamp: admin.firestore.Timestamp.now(),
        content: data.content,
        url: data.url,
        authorId: data.authorId,
        relatedUserId: data.relatedUserId,
        metadata: data.metadata,
      };

      const signalRef = await db.collection('reputationSignals').add(signal);

      // Check for reputation spike
      await detectReputationSpike(signal);

      // Update sentiment analytics
      await updateSentimentAnalytics(signal);

      return {
        success: true,
        signalId: signalRef.id,
        threatLevel,
      };
    } catch (error: any) {
      console.error('Error ingesting reputation signal:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Calculate threat level based on sentiment and other factors
 */
function calculateThreatLevel(sentimentScore: number): ThreatLevel {
  if (sentimentScore >= 0.5) return 'LOW';
  if (sentimentScore >= 0.0) return 'MEDIUM';
  if (sentimentScore >= -0.5) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Detect reputation spikes that may indicate a crisis
 */
async function detectReputationSpike(signal: ReputationSignal): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const thirtyMinutesAgo = new admin.firestore.Timestamp(now.seconds - 1800, now.nanoseconds);

  // Check for negative signals from same geo in last 30 minutes
  const recentSignals = await db
    .collection('reputationSignals')
    .where('geo', '==', signal.geo)
    .where('timestamp', '>=', thirtyMinutesAgo)
    .where('sentimentScore', '<', 0)
    .get();

  const negativeCount = recentSignals.size;

  // CRITICAL: 5+ negative reports in 30 minutes from same geo
  if (negativeCount >= 5) {
    console.log(`🚨 REPUTATION SPIKE DETECTED: ${negativeCount} negative signals in ${signal.geo}`);
    
    // Create incident
    await createIncidentFromSpike(signal, negativeCount);
  }

  // Check for combined fraud + safety + support spike
  await checkCrossSystemSpike(signal);

  // Check for store rating drop
  if (signal.source === 'AppStore' || signal.source === 'PlayStore') {
    await checkStoreRatingDrop(signal);
  }
}

/**
 * Create PR incident from detected spike
 */
async function createIncidentFromSpike(signal: ReputationSignal, signalCount: number): Promise<void> {
  try {
    const incident = {
      title: `Reputation Spike: ${signalCount} negative signals in ${signal.geo}`,
      description: `Detected ${signalCount} negative signals about ${signal.topic} from ${signal.geo} in last 30 minutes`,
      status: 'OPEN',
      threatLevel: 'CRITICAL',
      triggeringSignals: [signal],
      geo: signal.geo,
      topic: signal.topic,
      publicVisibility: 'HIGH',
      legalExposure: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const incidentRef = await db.collection('prIncidents').add(incident);

    // Trigger crisis orchestration
    await triggerCrisisOrchestration(incidentRef.id, incident);
  } catch (error) {
    console.error('Error creating incident from spike:', error);
  }
}

/**
 * Check for combined spikes across systems (fraud, safety, support)
 */
async function checkCrossSystemSpike(signal: ReputationSignal): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const oneHourAgo = new admin.firestore.Timestamp(now.seconds - 3600, now.nanoseconds);

  // Check safety incidents (PACK 300)
  const safetyIncidents = await db
    .collection('safetyIncidents')
    .where('createdAt', '>=', oneHourAgo)
    .where('geo', '==', signal.geo)
    .get();

  // Check fraud cases (PACK 302)
  const fraudCases = await db
    .collection('fraudCases')
    .where('createdAt', '>=', oneHourAgo)
    .where('geo', '==', signal.geo)
    .get();

  // Check support tickets (PACK 300)
  const supportTickets = await db
    .collection('supportTickets')
    .where('createdAt', '>=', oneHourAgo)
    .where('geo', '==', signal.geo)
    .where('priority', '==', 'HIGH')
    .get();

  const combinedCount = safetyIncidents.size + fraudCases.size + supportTickets.size;

  if (combinedCount >= 10) {
    console.log(`🚨 CROSS-SYSTEM SPIKE: ${combinedCount} incidents across support/fraud/safety in ${signal.geo}`);
    
    const incident = {
      title: `Cross-System Crisis: ${signal.geo}`,
      description: `Detected ${combinedCount} incidents across support (${supportTickets.size}), fraud (${fraudCases.size}), safety (${safetyIncidents.size})`,
      status: 'OPEN',
      threatLevel: 'CRITICAL',
      geo: signal.geo,
      linkedSafetyIncidents: safetyIncidents.docs.map(d => d.id),
      linkedFraudCases: fraudCases.docs.map(d => d.id),
      linkedSupportTickets: supportTickets.docs.map(d => d.id),
      publicVisibility: 'HIGH',
      legalExposure: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const incidentRef = await db.collection('prIncidents').add(incident);
    await triggerCrisisOrchestration(incidentRef.id, incident);
  }
}

/**
 * Check for app store rating drops
 */
async function checkStoreRatingDrop(signal: ReputationSignal): Promise<void> {
  // Get current average rating from last 24 hours
  const now = admin.firestore.Timestamp.now();
  const yesterday = new admin.firestore.Timestamp(now.seconds - 86400, now.nanoseconds);

  const recentRatings = await db
    .collection('reputationSignals')
    .where('source', '==', signal.source)
    .where('timestamp', '>=', yesterday)
    .get();

  if (recentRatings.size < 10) return; // Not enough data

  const avgRating = recentRatings.docs.reduce((sum, doc) => {
    // Convert sentiment (-1 to 1) to rating (1 to 5)
    const sentiment = doc.data().sentimentScore;
    const rating = ((sentiment + 1) / 2) * 4 + 1; // Maps -1..1 to 1..5
    return sum + rating;
  }, 0) / recentRatings.size;

  // Compare with historical average
  const weekAgo = new admin.firestore.Timestamp(now.seconds - 604800, now.nanoseconds);
  const historicalRatings = await db
    .collection('reputationSignals')
    .where('source', '==', signal.source)
    .where('timestamp', '>=', weekAgo)
    .where('timestamp', '<', yesterday)
    .get();

  if (historicalRatings.size < 10) return;

  const historicalAvg = historicalRatings.docs.reduce((sum, doc) => {
    const sentiment = doc.data().sentimentScore;
    const rating = ((sentiment + 1) / 2) * 4 + 1;
    return sum + rating;
  }, 0) / historicalRatings.size;

  const drop = historicalAvg - avgRating;

  // CRITICAL: Rating drop > 0.3 in 24h
  if (drop > 0.3) {
    console.log(`🚨 STORE RATING DROP: ${drop.toFixed(2)} on ${signal.source}`);
    
    const incident = {
      title: `Store Rating Drop: ${signal.source}`,
      description: `App rating dropped ${drop.toFixed(2)} stars in last 24 hours (from ${historicalAvg.toFixed(2)} to ${avgRating.toFixed(2)})`,
      status: 'OPEN',
      threatLevel: 'CRITICAL',
      source: signal.source,
      ratingDrop: drop,
      publicVisibility: 'CRITICAL',
      legalExposure: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const incidentRef = await db.collection('prIncidents').add(incident);
    await triggerCrisisOrchestration(incidentRef.id, incident);
  }
}

/**
 * Trigger crisis orchestration (implemented in pack387-crisis-orchestration.ts)
 */
async function triggerCrisisOrchestration(incidentId: string, incident: any): Promise<void> {
  // This will be handled by the crisis orchestration function
  await db.collection('crisisResponseLogs').add({
    incidentId,
    actionType: 'CRISIS_DETECTED',
    status: 'PENDING_ORCHESTRATION',
    timestamp: admin.firestore.Timestamp.now(),
    metadata: { incident },
  });
}

/**
 * Update sentiment analytics aggregation
 */
async function updateSentimentAnalytics(signal: ReputationSignal): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const analyticsId = `${signal.geo}_${today.toISOString().split('T')[0]}`;

  const analyticsRef = db.collection('sentimentAnalytics').doc(analyticsId);
  const analytics = await analyticsRef.get();

  if (analytics.exists) {
    const data = analytics.data()!;
    const newCount = data.signalCount + 1;
    const newAvg = (data.averageSentiment * data.signalCount + signal.sentimentScore) / newCount;

    await analyticsRef.update({
      signalCount: newCount,
      averageSentiment: newAvg,
      updatedAt: admin.firestore.Timestamp.now(),
      [`topicBreakdown.${signal.topic}`]: admin.firestore.FieldValue.increment(1),
      [`sourceBreakdown.${signal.source}`]: admin.firestore.FieldValue.increment(1),
    });
  } else {
    await analyticsRef.set({
      geo: signal.geo,
      date: today.toISOString().split('T')[0],
      signalCount: 1,
      averageSentiment: signal.sentimentScore,
      topicBreakdown: { [signal.topic]: 1 },
      sourceBreakdown: { [signal.source]: 1 },
      timestamp: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
}

/**
 * Scheduled function to analyze reputation trends
 */
export const pack387_analyzeReputationTrends = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Analyzing reputation trends...');
    
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = new admin.firestore.Timestamp(now.seconds - 3600, now.nanoseconds);

    // Get all signals from last hour
    const recentSignals = await db
      .collection('reputationSignals')
      .where('timestamp', '>=', oneHourAgo)
      .get();

    // Group by geo
    const geoGroups: Map<string, ReputationSignal[]> = new Map();
    
    recentSignals.forEach(doc => {
      const signal = doc.data() as ReputationSignal;
      const signals = geoGroups.get(signal.geo) || [];
      signals.push(signal);
      geoGroups.set(signal.geo, signals);
    });

    // Analyze each geo
    Array.from(geoGroups.entries()).forEach(([geo, signals]) => {
      const avgSentiment = signals.reduce((sum, s) => sum + s.sentimentScore, 0) / signals.length;
      const negativeCount = signals.filter(s => s.sentimentScore < -0.3).length;

      console.log(`Geo ${geo}: ${signals.length} signals, avg sentiment: ${avgSentiment.toFixed(2)}, ${negativeCount} negative`);

      // Alert if concerning trend
      if (avgSentiment < -0.3 && signals.length > 5) {
        console.log(`⚠️  Concerning trend in ${geo}: avg sentiment ${avgSentiment.toFixed(2)}`);
      }
    });

    return null;
  });
