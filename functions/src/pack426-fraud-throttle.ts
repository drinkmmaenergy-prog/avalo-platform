/**
 * PACK 426 — Fraud Throttle
 * 
 * Regional fraud detection and adaptive throttling to prevent abuse while
 * maintaining user experience.
 * 
 * Integrates with PACK 302 (Fraud Detection) to apply regional risk-based limits.
 */

import { https, logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { Region } from './pack426-global-router';
import { checkRateLimit, RateLimitAction } from './pack426-rate-limit';

// ============================================================================
// TYPES
// ============================================================================

export interface FraudRiskProfile {
  userId: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  region: Region;
  factors: FraudFactor[];
  lastUpdated: number;
}

export interface FraudFactor {
  factor: string;
  weight: number;
  detected: boolean;
  timestamp: number;
}

export interface ThrottleConfig {
  action: RateLimitAction;
  baseLimit: number;
  riskMultiplier: Record<string, number>; // risk level → multiplier
}

export interface ThrottleResult {
  allowed: boolean;
  throttled: boolean;
  reason?: string;
  adjustedLimit: number;
  riskScore: number;
}

// ============================================================================
// FRAUD RISK SCORING
// ============================================================================

/**
 * Calculate user's fraud risk score
 */
export async function calculateFraudRisk(userId: string): Promise<FraudRiskProfile> {
  const db = getFirestore();
  
  // Get fraud signals from PACK 302
  const fraudDoc = await db.collection('fraudDetection').doc(userId).get();
  const fraudData = fraudDoc.exists ? fraudDoc.data() : {};
  
  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  const factors: FraudFactor[] = [];
  let riskScore = 0;
  
  // Factor 1: Account age
  const accountAgeHours = (Date.now() - (userData?.createdAt || Date.now())) / 3600000;
  if (accountAgeHours < 24) {
    factors.push({
      factor: 'new_account',
      weight: 20,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 20;
  }
  
  // Factor 2: Verification status
  if (!userData?.verified) {
    factors.push({
      factor: 'unverified',
      weight: 15,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 15;
  }
  
  // Factor 3: Previous fraud flags
  if (fraudData?.flagCount > 0) {
    const weight = Math.min(fraudData.flagCount * 10, 30);
    factors.push({
      factor: 'previous_flags',
      weight,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += weight;
  }
  
  // Factor 4: Suspicious behavior patterns
  if (fraudData?.suspiciousPatterns?.length > 0) {
    factors.push({
      factor: 'suspicious_patterns',
      weight: 25,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 25;
  }
  
  // Factor 5: Multiple accounts from same device
  if (fraudData?.deviceFingerprint?.multipleAccounts) {
    factors.push({
      factor: 'multi_accounting',
      weight: 30,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 30;
  }
  
  // Factor 6: VPN/Proxy usage
  if (fraudData?.vpnDetected) {
    factors.push({
      factor: 'vpn_usage',
      weight: 10,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 10;
  }
  
  // Factor 7: Rapid actions
  if (fraudData?.rapidActions) {
    factors.push({
      factor: 'rapid_actions',
      weight: 15,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 15;
  }
  
  // Factor 8: Payment disputes
  if (fraudData?.paymentDisputes > 0) {
    factors.push({
      factor: 'payment_disputes',
      weight: 40,
      detected: true,
      timestamp: Date.now(),
    });
    riskScore += 40;
  }
  
  // Cap at 100
  riskScore = Math.min(riskScore, 100);
  
  // Determine risk level
  const riskLevel = 
    riskScore >= 75 ? 'critical' :
    riskScore >= 50 ? 'high' :
    riskScore >= 25 ? 'medium' :
    'low';
  
  return {
    userId,
    riskScore,
    riskLevel,
    region: userData?.region || 'EU',
    factors,
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// THROTTLE CONFIGURATIONS
// ============================================================================

const THROTTLE_CONFIGS: Record<RateLimitAction, ThrottleConfig> = {
  'chat-send': {
    action: 'chat-send',
    baseLimit: 100,
    riskMultiplier: {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
      critical: 0.2,
    },
  },
  'swipe': {
    action: 'swipe',
    baseLimit: 50,
    riskMultiplier: {
      low: 1.0,
      medium: 0.6,
      high: 0.3,
      critical: 0.1,
    },
  },
  'login': {
    action: 'login',
    baseLimit: 5,
    riskMultiplier: {
      low: 1.0,
      medium: 0.8,
      high: 0.5,
      critical: 0.2,
    },
  },
  'token-purchase': {
    action: 'token-purchase',
    baseLimit: 10,
    riskMultiplier: {
      low: 1.0,
      medium: 0.5,
      high: 0.2,
      critical: 0.0, // Block entirely for critical risk
    },
  },
  'ai-session': {
    action: 'ai-session',
    baseLimit: 20,
    riskMultiplier: {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
      critical: 0.1,
    },
  },
  'calendar-action': {
    action: 'calendar-action',
    baseLimit: 30,
    riskMultiplier: {
      low: 1.0,
      medium: 0.8,
      high: 0.5,
      critical: 0.2,
    },
  },
  'profile-update': {
    action: 'profile-update',
    baseLimit: 10,
    riskMultiplier: {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
      critical: 0.1,
    },
  },
  'feed-post': {
    action: 'feed-post',
    baseLimit: 10,
    riskMultiplier: {
      low: 1.0,
      medium: 0.6,
      high: 0.3,
      critical: 0.0, // Block posting for critical risk
    },
  },
  'report-user': {
    action: 'report-user',
    baseLimit: 5,
    riskMultiplier: {
      low: 1.0,
      medium: 0.8,
      high: 0.5,
      critical: 0.2,
    },
  },
  'media-upload': {
    action: 'media-upload',
    baseLimit: 20,
    riskMultiplier: {
      low: 1.0,
      medium: 0.6,
      high: 0.3,
      critical: 0.0,
    },
  },
  'voice-call': {
    action: 'voice-call',
    baseLimit: 10,
    riskMultiplier: {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
      critical: 0.1,
    },
  },
  'video-call': {
    action: 'video-call',
    baseLimit: 10,
    riskMultiplier: {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
      critical: 0.1,
    },
  },
};

// ============================================================================
// FRAUD-AWARE THROTTLING
// ============================================================================

/**
 * Check if action should be throttled based on fraud risk
 */
export async function checkFraudThrottle(
  userId: string,
  action: RateLimitAction,
  region?: Region
): Promise<ThrottleResult> {
  // Calculate fraud risk
  const riskProfile = await calculateFraudRisk(userId);
  
  // Get throttle configuration
  const config = THROTTLE_CONFIGS[action];
  const multiplier = config.riskMultiplier[riskProfile.riskLevel];
  const adjustedLimit = Math.floor(config.baseLimit * multiplier);
  
  // Check if completely blocked
  if (multiplier === 0) {
    logger.warn(`User ${userId} blocked from ${action} due to ${riskProfile.riskLevel} risk`);
    return {
      allowed: false,
      throttled: true,
      reason: `Action blocked due to ${riskProfile.riskLevel} fraud risk`,
      adjustedLimit: 0,
      riskScore: riskProfile.riskScore,
    };
  }
  
  // Apply rate limit with adjusted limit
  const rateLimitResult = await checkRateLimit(userId, action, region);
  
  // Check against adjusted limit
  const currentUsage = config.baseLimit - rateLimitResult.remaining;
  const throttled = currentUsage >= adjustedLimit;
  
  if (throttled) {
    logger.info(`User ${userId} throttled for ${action} (risk: ${riskProfile.riskLevel}, score: ${riskProfile.riskScore})`);
  }
  
  return {
    allowed: !throttled,
    throttled,
    reason: throttled ? `Rate limited due to ${riskProfile.riskLevel} fraud risk` : undefined,
    adjustedLimit,
    riskScore: riskProfile.riskScore,
  };
}

// ============================================================================
// REGIONAL FRAUD PATTERNS
// ============================================================================

/**
 * Get fraud pattern statistics for region
 */
export async function getRegionalFraudStats(region: Region): Promise<{
  totalUsers: number;
  riskDistribution: Record<string, number>;
  topFraudFactors: Array<{ factor: string; count: number }>;
  avgRiskScore: number;
}> {
  const db = getFirestore();
  
  // Get users in region
  const usersSnapshot = await db
    .collection('users')
    .where('region', '==', region)
    .limit(1000) // Sample
    .get();
  
  const riskDistribution = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  
  const fraudFactorCounts: Record<string, number> = {};
  let totalRiskScore = 0;
  
  for (const userDoc of usersSnapshot.docs) {
    const riskProfile = await calculateFraudRisk(userDoc.id);
    
    riskDistribution[riskProfile.riskLevel]++;
    totalRiskScore += riskProfile.riskScore;
    
    for (const factor of riskProfile.factors) {
      fraudFactorCounts[factor.factor] = (fraudFactorCounts[factor.factor] || 0) + 1;
    }
  }
  
  const topFraudFactors = Object.entries(fraudFactorCounts)
    .map(([factor, count]) => ({ factor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    totalUsers: usersSnapshot.size,
    riskDistribution,
    topFraudFactors,
    avgRiskScore: usersSnapshot.size > 0 ? totalRiskScore / usersSnapshot.size : 0,
  };
}

/**
 * Update regional risk factor based on patterns
 */
export async function updateRegionalRiskFactor(
  region: Region,
  factor: number
): Promise<void> {
  const db = getFirestore();
  
  await db
    .collection('infrastructure')
    .doc('fraudThrottle')
    .collection('regional')
    .doc(region)
    .set({
      region,
      riskFactor: factor,
      updatedAt: Date.now(),
    });
  
  logger.info(`Regional risk factor for ${region} updated to ${factor}`);
}

/**
 * Get regional risk factor multiplier
 */
async function getRegionalRiskFactor(region: Region): Promise<number> {
  const db = getFirestore();
  
  try {
    const doc = await db
      .collection('infrastructure')
      .doc('fraudThrottle')
      .collection('regional')
      .doc(region)
      .get();
    
    return doc.exists ? doc.data()?.riskFactor || 1.0 : 1.0;
  } catch (error) {
    logger.error(`Failed to get regional risk factor for ${region}:`, error);
    return 1.0;
  }
}

// ============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// ============================================================================

/**
 * Detect suspicious activity patterns
 */
export async function detectSuspiciousActivity(
  userId: string,
  action: RateLimitAction
): Promise<boolean> {
  const db = getFirestore();
  
  const patterns: string[] = [];
  
  // Pattern 1: Multiple rapid actions
  const recentActions = await db
    .collection('infrastructure')
    .doc('rateLimits')
    .collection('limits')
    .where('userId', '==', userId)
    .where('lastAction', '>', Date.now() - 60000) // Last minute
    .get();
  
  if (recentActions.size > 10) {
    patterns.push('rapid_actions');
  }
  
  // Pattern 2: Failed login attempts
  if (action === 'login') {
    const failedLogins = await db
      .collection('auth')
      .doc('failedLogins')
      .collection('attempts')
      .where('userId', '==', userId)
      .where('timestamp', '>', Date.now() - 3600000) // Last hour
      .get();
    
    if (failedLogins.size > 3) {
      patterns.push('failed_logins');
    }
  }
  
  // Pattern 3: Unusual time-of-day activity
  const hour = new Date().getUTCHours();
  if (hour >= 2 && hour <= 5) { // 2 AM - 5 AM UTC
    patterns.push('unusual_hours');
  }
  
  // Store detected patterns
  if (patterns.length > 0) {
    await db.collection('fraudDetection').doc(userId).set({
      suspiciousPatterns: patterns,
      lastDetected: Date.now(),
    }, { merge: true });
    
    logger.warn(`Suspicious activity detected for user ${userId}: ${patterns.join(', ')}`);
    return true;
  }
  
  return false;
}

// ============================================================================
// AUTO-ESCALATION
// ============================================================================

/**
 * Auto-escalate high-risk users for review
 */
export async function autoEscalateHighRisk(userId: string): Promise<void> {
  const riskProfile = await calculateFraudRisk(userId);
  
  if (riskProfile.riskLevel === 'critical' || riskProfile.riskScore >= 75) {
    const db = getFirestore();
    
    await db.collection('moderationQueue').add({
      userId,
      type: 'fraud_escalation',
      riskProfile,
      status: 'pending',
      priority: 'high',
      createdAt: Date.now(),
    });
    
    logger.warn(`User ${userId} auto-escalated for fraud review (score: ${riskProfile.riskScore})`);
  }
}

// ============================================================================
// CACHE FRAUD PROFILES
// ============================================================================

/**
 * Cache fraud profile for faster lookups
 */
export async function cacheFraudProfile(profile: FraudRiskProfile): Promise<void> {
  const db = getFirestore();
  
  await db
    .collection('infrastructure')
    .doc('fraudCache')
    .collection('profiles')
    .doc(profile.userId)
    .set({
      ...profile,
      cachedAt: Date.now(),
    });
}

/**
 * Get cached fraud profile
 */
export async function getCachedFraudProfile(userId: string): Promise<FraudRiskProfile | null> {
  const db = getFirestore();
  
  try {
    const doc = await db
      .collection('infrastructure')
      .doc('fraudCache')
      .collection('profiles')
      .doc(userId)
      .get();
    
    if (!doc.exists) return null;
    
    const data = doc.data() as FraudRiskProfile & { cachedAt: number };
    
    // Cache valid for 5 minutes
    if (Date.now() - data.cachedAt > 300000) {
      return null;
    }
    
    return {
      userId: data.userId,
      riskScore: data.riskScore,
      riskLevel: data.riskLevel,
      region: data.region,
      factors: data.factors,
      lastUpdated: data.lastUpdated,
    };
  } catch (error) {
    logger.error(`Failed to get cached fraud profile for ${userId}:`, error);
    return null;
  }
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Check fraud throttle via HTTP
 * POST /infrastructure/fraud-throttle/check
 */
export const checkFraudThrottleHTTP = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  try {
    const { userId, action, region } = req.body;
    
    if (!userId || !action) {
      res.status(400).json({
        success: false,
        error: 'userId and action are required',
      });
      return;
    }
    
    const result = await checkFraudThrottle(userId, action, region);
    
    res.status(result.allowed ? 200 : 429).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Fraud throttle check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check fraud throttle',
    });
  }
});

/**
 * Get fraud risk profile
 * GET /infrastructure/fraud-risk/:userId
 */
export const getFraudRiskHTTP = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'userId is required',
      });
      return;
    }
    
    // Try cache first
    let profile = await getCachedFraudProfile(userId);
    
    if (!profile) {
      // Calculate and cache
      profile = await calculateFraudRisk(userId);
      await cacheFraudProfile(profile);
    }
    
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Fraud risk lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get fraud risk profile',
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateFraudRisk,
  checkFraudThrottle,
  getRegionalFraudStats,
  updateRegionalRiskFactor,
  detectSuspiciousActivity,
  autoEscalateHighRisk,
  cacheFraudProfile,
  getCachedFraudProfile,
  // HTTP functions
  checkFraudThrottleHTTP,
  getFraudRiskHTTP,
};
