/**
 * PACK 95 — Anomaly Detection v1
 * Rule-based anomaly detection for suspicious logins
 * 
 * Detects:
 * - NEW_COUNTRY_LOGIN: Login from a country not seen in last N days
 * - IMPOSSIBLE_TRAVEL: Rapid logins from distant countries
 * - NEW_PLATFORM: Unusual platform for this user
 * - SUSPICIOUS_PATTERN: Other suspicious patterns
 */

import { db, timestamp as Timestamp } from './init';
import { 
  SessionContext, 
  AnomalyType, 
  AnomalyEvaluationResult,
  LoginAnomaly 
} from './pack95-types';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANOMALY_CONFIG = {
  // How many days back to check for known countries
  COUNTRY_HISTORY_DAYS: 30,
  
  // Minimum hours between logins from distant countries to avoid impossible travel flag
  IMPOSSIBLE_TRAVEL_MIN_HOURS: 2,
  
  // Minimum number of logins before we consider platform patterns
  MIN_LOGINS_FOR_PLATFORM_CHECK: 5,
  
  // Countries that require high-distance check (example: opposite hemispheres)
  DISTANT_COUNTRY_PAIRS: [
    ['US', 'CN'], ['US', 'RU'], ['US', 'IN'],
    ['EU', 'CN'], ['EU', 'AU'], ['EU', 'BR']
  ] as [string, string][],
};

// ============================================================================
// ANOMALY EVALUATION
// ============================================================================

/**
 * Evaluate login anomaly based on user's historical patterns
 */
export async function evaluateLoginAnomaly(
  userId: string,
  context: SessionContext
): Promise<AnomalyEvaluationResult> {
  const anomalies: AnomalyType[] = [];
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  
  try {
    // Get user's recent sessions for pattern analysis
    const recentSessions = await getRecentUserSessions(userId, ANOMALY_CONFIG.COUNTRY_HISTORY_DAYS);
    
    // Check for new country
    const newCountryDetected = await checkNewCountry(context, recentSessions);
    if (newCountryDetected) {
      anomalies.push('NEW_COUNTRY');
      riskLevel = 'MEDIUM';
    }
    
    // Check for impossible travel
    const impossibleTravelDetected = await checkImpossibleTravel(context, recentSessions);
    if (impossibleTravelDetected) {
      anomalies.push('IMPOSSIBLE_TRAVEL');
      riskLevel = 'HIGH';
    }
    
    // Check for unusual platform
    const newPlatformDetected = await checkNewPlatform(context, recentSessions);
    if (newPlatformDetected) {
      anomalies.push('NEW_PLATFORM');
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    }
    
    // Check for rapid login changes (multiple sessions in short time)
    const rapidChangesDetected = await checkRapidLoginChanges(userId);
    if (rapidChangesDetected) {
      anomalies.push('RAPID_LOGIN_CHANGES');
      riskLevel = 'HIGH';
    }
    
    // Determine if we should notify and/or block
    const shouldNotify = anomalies.length > 0;
    const shouldBlock = riskLevel === 'CRITICAL' || 
                        (riskLevel === 'HIGH' && anomalies.includes('IMPOSSIBLE_TRAVEL'));
    
    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
      riskLevel,
      shouldNotify,
      shouldBlock,
    };
  } catch (error: any) {
    logger.error('[Anomaly Detection] Error evaluating login anomaly:', error);
    // Fail open - don't block on errors
    return {
      hasAnomalies: false,
      anomalies: [],
      riskLevel: 'LOW',
      shouldNotify: false,
      shouldBlock: false,
    };
  }
}

/**
 * Check if login is from a new country
 */
async function checkNewCountry(
  context: SessionContext,
  recentSessions: any[]
): Promise<boolean> {
  if (!context.ipCountry) return false;
  
  // Get all unique countries from recent sessions
  const knownCountries = new Set(
    recentSessions
      .map(s => s.ipCountry)
      .filter(c => c)
  );
  
  // If no known countries, this is likely first login - not an anomaly
  if (knownCountries.size === 0) return false;
  
  // Check if current country is new
  return !knownCountries.has(context.ipCountry);
}

/**
 * Check for impossible travel (logins from distant locations in short time)
 */
async function checkImpossibleTravel(
  context: SessionContext,
  recentSessions: any[]
): Promise<boolean> {
  if (!context.ipCountry) return false;
  
  // Get the most recent session from a different country
  const lastDifferentCountrySession = recentSessions
    .filter(s => s.ipCountry && s.ipCountry !== context.ipCountry)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  
  if (!lastDifferentCountrySession) return false;
  
  const timeDiffHours = (context.createdAt.toMillis() - lastDifferentCountrySession.createdAt.toMillis()) / (1000 * 60 * 60);
  
  // Check if the countries are distant and time is too short
  const areDistantCountries = isDistantCountryPair(
    context.ipCountry,
    lastDifferentCountrySession.ipCountry
  );
  
  if (areDistantCountries && timeDiffHours < ANOMALY_CONFIG.IMPOSSIBLE_TRAVEL_MIN_HOURS) {
    logger.warn(`[Anomaly Detection] Impossible travel detected: ${lastDifferentCountrySession.ipCountry} -> ${context.ipCountry} in ${timeDiffHours.toFixed(1)}h`);
    return true;
  }
  
  return false;
}

/**
 * Check if user is logging in from a new platform type
 */
async function checkNewPlatform(
  context: SessionContext,
  recentSessions: any[]
): Promise<boolean> {
  // Need sufficient history to establish a pattern
  if (recentSessions.length < ANOMALY_CONFIG.MIN_LOGINS_FOR_PLATFORM_CHECK) return false;
  
  // Get all unique platforms from recent sessions
  const knownPlatforms = new Set(
    recentSessions.map(s => s.platform).filter(p => p)
  );
  
  // If user has only used one platform type before, flag if switching
  if (knownPlatforms.size === 1 && !knownPlatforms.has(context.platform)) {
    logger.info(`[Anomaly Detection] New platform detected: ${context.platform} (previous: ${Array.from(knownPlatforms).join(', ')})`);
    return true;
  }
  
  return false;
}

/**
 * Check for rapid login changes (multiple sessions in short time window)
 */
async function checkRapidLoginChanges(userId: string): Promise<boolean> {
  const oneHourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
  
  const recentLoginsSnapshot = await db
    .collection('user_sessions')
    .where('userId', '==', userId)
    .where('createdAt', '>=', oneHourAgo)
    .get();
  
  // Flag if more than 5 new sessions in last hour
  if (recentLoginsSnapshot.size > 5) {
    logger.warn(`[Anomaly Detection] Rapid login changes detected: ${recentLoginsSnapshot.size} sessions in 1 hour`);
    return true;
  }
  
  return false;
}

/**
 * Check if two countries are considered distant
 */
function isDistantCountryPair(country1: string, country2: string): boolean {
  return ANOMALY_CONFIG.DISTANT_COUNTRY_PAIRS.some(
    ([c1, c2]) => 
      (c1 === country1 && c2 === country2) ||
      (c1 === country2 && c2 === country1)
  );
}

/**
 * Get recent sessions for a user
 */
async function getRecentUserSessions(userId: string, daysBack: number): Promise<any[]> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - daysBack * 24 * 60 * 60 * 1000
  );
  
  const sessionsSnapshot = await db
    .collection('user_sessions')
    .where('userId', '==', userId)
    .where('createdAt', '>=', cutoffDate)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  
  return sessionsSnapshot.docs.map(doc => doc.data());
}

/**
 * Log an anomaly to the login_anomalies collection
 */
export async function logLoginAnomaly(
  userId: string,
  sessionId: string,
  type: AnomalyType,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const anomalyId = db.collection('login_anomalies').doc().id;
    
    const anomaly: LoginAnomaly = {
      id: anomalyId,
      userId,
      sessionId,
      type,
      createdAt: Timestamp.now(),
      metadata,
      resolved: false,
    };
    
    await db.collection('login_anomalies').doc(anomalyId).set(anomaly);
    
    logger.info(`[Anomaly Detection] Logged anomaly ${type} for user ${userId}, session ${sessionId}`);
  } catch (error: any) {
    logger.error('[Anomaly Detection] Error logging anomaly:', error);
    // Don't throw - logging anomalies is non-critical
  }
}

/**
 * Get unresolved anomalies for a user
 */
export async function getUnresolvedAnomalies(userId: string): Promise<LoginAnomaly[]> {
  try {
    const anomaliesSnapshot = await db
      .collection('login_anomalies')
      .where('userId', '==', userId)
      .where('resolved', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    return anomaliesSnapshot.docs.map(doc => doc.data() as LoginAnomaly);
  } catch (error: any) {
    logger.error('[Anomaly Detection] Error getting unresolved anomalies:', error);
    return [];
  }
}

/**
 * Mark an anomaly as resolved
 */
export async function resolveAnomaly(anomalyId: string): Promise<void> {
  try {
    await db.collection('login_anomalies').doc(anomalyId).update({
      resolved: true,
      resolvedAt: Timestamp.now(),
    });
    
    logger.info(`[Anomaly Detection] Resolved anomaly ${anomalyId}`);
  } catch (error: any) {
    logger.error('[Anomaly Detection] Error resolving anomaly:', error);
  }
}