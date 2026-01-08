/**
 * PACK 429 — Review Defense Engine
 * Detects review bombing, coordinated attacks, and triggers recovery flows
 */

import * as admin from 'firebase-admin';
import {
  StoreDefenseEvent,
  DefenseEventType,
  Platform,
  EventSeverity,
  TriggerSource,
  StoreReviewMirror,
} from './pack429-store-defense.types';

const db = admin.firestore();

// ============================================================================
// DEFENSE EVENT CREATION
// ============================================================================

export async function createDefenseEvent(data: {
  type: DefenseEventType;
  platform: Platform;
  region: string;
  severity: EventSeverity;
  triggerSource: TriggerSource;
  description: string;
  metadata: any;
}): Promise<string> {
  const eventRef = db.collection('storeDefenseEvents').doc();
  
  const event: StoreDefenseEvent = {
    id: eventRef.id,
    type: data.type,
    platform: data.platform,
    region: data.region,
    severity: data.severity,
    triggerSource: data.triggerSource,
    description: data.description,
    metadata: data.metadata,
    resolved: false,
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  await eventRef.set(event);
  
  // If CRITICAL, check if we should activate crisis mode
  if (data.severity === 'CRITICAL') {
    await evaluateCrisisMode(event);
  }
  
  console.log(`Created defense event: ${event.id} (${event.type} - ${event.severity})`);
  
  return eventRef.id;
}

// ============================================================================
// AUTOMATED MONITORING
// ============================================================================

/**
 * Check for sudden rating spikes
 * Should be run on a schedule (e.g., every hour)
 */
export async function detectRatingSpike(platform: Platform): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Get reviews from last 24 hours
  const recentSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(oneDayAgo))
    .get();
  
  // Get reviews from previous week for baseline
  const baselineSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(oneDayAgo))
    .get();
  
  if (recentSnap.empty || baselineSnap.empty) {
    console.log('Not enough data for spike detection');
    return;
  }
  
  // Calculate metrics
  const recentReviews = recentSnap.docs.map(d => d.data() as StoreReviewMirror);
  const baselineReviews = baselineSnap.docs.map(d => d.data() as StoreReviewMirror);
  
  const recentAvg = calculateAverageRating(recentReviews);
  const baselineAvg = calculateAverageRating(baselineReviews);
  
  const recentOneStars = recentReviews.filter(r => r.rating === 1).length;
  const recentOneStarRate = recentOneStars / recentReviews.length;
  
  const baselineOneStars = baselineReviews.filter(r => r.rating === 1).length;
  const baselineOneStarRate = baselineOneStars / baselineReviews.length;
  
  // Detect spike: significant drop in average or spike in 1-stars
  const ratingDrop = baselineAvg - recentAvg;
  const oneStarSpike = recentOneStarRate - baselineOneStarRate;
  
  let severity: EventSeverity | null = null;
  
  if (ratingDrop >= 1.5 || oneStarSpike >= 0.4) {
    severity = 'CRITICAL';
  } else if (ratingDrop >= 1.0 || oneStarSpike >= 0.3) {
    severity = 'HIGH';
  } else if (ratingDrop >= 0.5 || oneStarSpike >= 0.2) {
    severity = 'MEDIUM';
  }
  
  if (severity) {
    await createDefenseEvent({
      type: 'SPIKE',
      platform,
      region: 'MULTIPLE',
      severity,
      triggerSource: 'REVIEWS',
      description: `Rating spike detected: ${ratingDrop.toFixed(2)} point drop, ${(oneStarSpike * 100).toFixed(1)}% increase in 1-stars`,
      metadata: {
        affectedReviews: recentReviews.length,
        recentAvg,
        baselineAvg,
        ratingDrop,
        oneStarSpike,
        recentOneStars,
        baselineOneStars,
      },
    });
  }
}

/**
 * Detect repetitive phrase patterns across reviews
 */
export async function detectBotAttack(platform: Platform): Promise<void> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  
  const reviewsSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(twoDaysAgo))
    .get();
  
  if (reviewsSnap.size < 10) {
    console.log('Not enough reviews for bot detection');
    return;
  }
  
  const reviews = reviewsSnap.docs.map(d => d.data() as StoreReviewMirror);
  
  // Extract phrases and count repetitions
  const phraseMap = new Map<string, string[]>(); // phrase -> review IDs
  
  for (const review of reviews) {
    const phrases = extractSignificantPhrases(review.text);
    
    for (const phrase of phrases) {
      if (!phraseMap.has(phrase)) {
        phraseMap.set(phrase, []);
      }
      phraseMap.get(phrase)!.push(review.id);
    }
  }
  
  // Find phrases repeated across many reviews
  const suspiciousPhrases: string[] = [];
  
  for (const [phrase, reviewIds] of phraseMap.entries()) {
    // If phrase appears in >30% of reviews, suspicious
    if (reviewIds.length / reviews.length > 0.3 && reviewIds.length >= 5) {
      suspiciousPhrases.push(phrase);
    }
  }
  
  if (suspiciousPhrases.length > 0) {
    const severity = suspiciousPhrases.length >= 5 ? 'CRITICAL' : 'HIGH';
    
    await createDefenseEvent({
      type: 'BOT_ATTACK',
      platform,
      region: 'MULTIPLE',
      severity,
      triggerSource: 'REVIEWS',
      description: `Detected ${suspiciousPhrases.length} repetitive phrases suggesting coordinated attack`,
      metadata: {
        detectedPatterns: suspiciousPhrases.slice(0, 10),
        affectedReviews: reviews.length,
      },
    });
  }
}

/**
 * Detect region-concentrated negative reviews
 */
export async function detectRegionConcentration(platform: Platform): Promise<void> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  const reviewsSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(threeDaysAgo))
    .where('rating', '<=', 2) // Only negative reviews
    .get();
  
  if (reviewsSnap.size < 10) {
    return;
  }
  
  const reviews = reviewsSnap.docs.map(d => d.data() as StoreReviewMirror);
  
  // Count reviews by region
  const regionCounts = new Map<string, number>();
  
  for (const review of reviews) {
    const count = regionCounts.get(review.region) || 0;
    regionCounts.set(review.region, count + 1);
  }
  
  // Check if any region has >50% of negative reviews
  for (const [region, count] of regionCounts.entries()) {
    const concentration = count / reviews.length;
    
    if (concentration > 0.5 && count >= 10) {
      const severity = concentration > 0.7 ? 'HIGH' : 'MEDIUM';
      
      await createDefenseEvent({
        type: 'SABOTAGE',
        platform,
        region,
        severity,
        triggerSource: 'REVIEWS',
        description: `${(concentration * 100).toFixed(1)}% of recent negative reviews from ${region}`,
        metadata: {
          affectedReviews: count,
          concentration,
          totalNegativeReviews: reviews.length,
        },
      });
    }
  }
}

/**
 * Correlate negative reviews with fraud spikes
 */
export async function correlateFraudSpike(): Promise<void> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  
  try {
    // Get recent fraud events (PACK 302)
    const fraudSnap = await db
      .collection('fraudEvents')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(twoDaysAgo))
      .where('severity', 'in', ['HIGH', 'CRITICAL'])
      .get();
    
    if (fraudSnap.empty) {
      return;
    }
    
    // Get recent negative reviews
    const reviewsSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(twoDaysAgo))
      .where('rating', '<=', 2)
      .get();
    
    if (reviewsSnap.size < 5) {
      return;
    }
    
    const reviews = reviewsSnap.docs.map(d => d.data() as StoreReviewMirror);
    const linkedReviews = reviews.filter(r => r.userLinked);
    
    // Check if banned/fraud users are leaving negative reviews
    let correlatedCount = 0;
    const correlatedUserIds: string[] = [];
    
    for (const review of linkedReviews) {
      const fraudEvent = fraudSnap.docs.find(
        d => d.data().userId === review.userLinked
      );
      
      if (fraudEvent) {
        correlatedCount++;
        correlatedUserIds.push(review.userLinked!);
      }
    }
    
    if (correlatedCount >= 3) {
      await createDefenseEvent({
        type: 'SABOTAGE',
        platform: Platform.IOS, // Default, would need to check actual platform distribution
        region: 'MULTIPLE',
        severity: 'HIGH',
        triggerSource: 'FRAUD',
        description: `${correlatedCount} negative reviews correlated with recent fraud events`,
        metadata: {
          affectedReviews: correlatedCount,
          correlatedUserIds,
          totalFraudEvents: fraudSnap.size,
        },
      });
    }
  } catch (error) {
    console.error('Error correlating fraud spike:', error);
  }
}

// ============================================================================
// CRISIS MODE EVALUATION
// ============================================================================

async function evaluateCrisisMode(event: StoreDefenseEvent): Promise<void> {
  // Check if crisis mode already active
  const crisisDoc = await db.collection('crisisMode').doc('global').get();
  
  if (crisisDoc.exists && crisisDoc.data()?.active) {
    console.log('Crisis mode already active');
    return;
  }
  
  // Check recent critical events
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const criticalEventsSnap = await db
    .collection('storeDefenseEvents')
    .where('severity', '==', 'CRITICAL')
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(oneDayAgo))
    .where('resolved', '==', false)
    .get();
  
  // Activate crisis mode if 2+ critical events in 24h
  if (criticalEventsSnap.size >= 2) {
    const { activateCrisisMode } = await import('./pack429-crisis-mode');
    
    await activateCrisisMode({
      trigger: {
        eventId: event.id,
        eventType: event.type,
        severity: event.severity,
      },
      activatedBy: 'SYSTEM',
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateAverageRating(reviews: StoreReviewMirror[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return sum / reviews.length;
}

function extractSignificantPhrases(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3); // Only words >3 chars
  
  const phrases: string[] = [];
  
  // Extract 4-word phrases
  for (let i = 0; i <= words.length - 4; i++) {
    const phrase = words.slice(i, i + 4).join(' ');
    if (phrase.length > 15) { // Only meaningful phrases
      phrases.push(phrase);
    }
  }
  
  return phrases;
}

// ============================================================================
// DEFENSE EVENT MANAGEMENT
// ============================================================================

export async function resolveDefenseEvent(
  eventId: string,
  resolvedBy: string
): Promise<void> {
  await db.collection('storeDefenseEvents').doc(eventId).update({
    resolved: true,
    resolvedAt: admin.firestore.Timestamp.now(),
    resolvedBy,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  
  console.log(`Resolved defense event: ${eventId}`);
}

export async function getActiveDefenseEvents(): Promise<StoreDefenseEvent[]> {
  const snapshot = await db
    .collection('storeDefenseEvents')
    .where('resolved', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  
  const events: StoreDefenseEvent[] = [];
  
  snapshot.forEach(doc => {
    events.push(doc.data() as StoreDefenseEvent);
  });
  
  return events;
}

export async function getDefenseEventsByPlatform(
  platform: Platform,
  limit: number = 50
): Promise<StoreDefenseEvent[]> {
  const snapshot = await db
    .collection('storeDefenseEvents')
    .where('platform', '==', platform)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const events: StoreDefenseEvent[] = [];
  
  snapshot.forEach(doc => {
    events.push(doc.data() as StoreDefenseEvent);
  });
  
  return events;
}

// ============================================================================
// SCHEDULED MONITORING (EXPORT FOR CLOUD SCHEDULER)
// ============================================================================

export async function runDefenseMonitoring(): Promise<void> {
  console.log('Running store defense monitoring...');
  
  try {
    // Run all detection algorithms
    await Promise.all([
      detectRatingSpike(Platform.IOS),
      detectRatingSpike(Platform.ANDROID),
      detectBotAttack(Platform.IOS),
      detectBotAttack(Platform.ANDROID),
      detectRegionConcentration(Platform.IOS),
      detectRegionConcentration(Platform.ANDROID),
      correlateFraudSpike(),
    ]);
    
    console.log('Defense monitoring complete');
  } catch (error) {
    console.error('Error running defense monitoring:', error);
    throw error;
  }
}
