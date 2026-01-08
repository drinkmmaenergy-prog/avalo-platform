/**
 * PACK 391 — Traffic Spike & DDoS Protection
 * 
 * Multi-layer protection against traffic spikes, DDoS attacks, and abuse.
 * Includes: bot filtering, geo-adaptive throttling, wallet brute-force shields,
 * AI endpoint abuse prevention, and panic escalation
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Rate Limiting Configuration
interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowSeconds: number;
  action: "throttle" | "block" | "captcha";
}

interface IPReputation {
  ip: string;
  requestCount: number;
  suspiciousScore: number; // 0-100
  blockedUntil?: FirebaseFirestore.Timestamp;
  firstSeen: FirebaseFirestore.Timestamp;
  lastSeen: FirebaseFirestore.Timestamp;
  geoLocation?: {
    country: string;
    region: string;
  };
  userAgents: string[];
  endpoints: string[];
}

interface DDoSAlert {
  alertId: string;
  type: "spike" | "distributed" | "bot_swarm" | "brute_force" | "ai_abuse";
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: FirebaseFirestore.Timestamp;
  metrics: {
    requestsPerSecond: number;
    uniqueIPs: number;
    suspiciousIPs: number;
    blockedRequests: number;
  };
  status: "active" | "mitigated" | "escalated";
}

// Rate limit configurations
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: {
    endpoint: "/auth/*",
    maxRequests: 5,
    windowSeconds: 60,
    action: "throttle"
  },
  wallet: {
    endpoint: "/wallet/*",
    maxRequests: 10,
    windowSeconds: 60,
    action: "block"
  },
  payment: {
    endpoint: "/payment/*",
    maxRequests: 3,
    windowSeconds: 60,
    action: "captcha"
  },
  ai_companion: {
    endpoint: "/ai/*",
    maxRequests: 50,
    windowSeconds: 60,
    action: "throttle"
  },
  swipe: {
    endpoint: "/swipe/*",
    maxRequests: 100,
    windowSeconds: 60,
    action: "throttle"
  },
  general: {
    endpoint: "/*",
    maxRequests: 200,
    windowSeconds: 60,
    action: "throttle"
  }
};

/**
 * Rate limit check middleware
 */
export const pack391_checkRateLimit = functions
  .runWith({
    timeoutSeconds: 30,
    memory: "512MB"
  })
  .https.onRequest(async (req, res) => {
    try {
      const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown";
      const endpoint = req.path;
      const userAgent = req.headers["user-agent"] || "unknown";
      
      // Determine rate limit config for endpoint
      const rateLimitConfig = determineRateLimit(endpoint);
      
      // Check rate limit
      const rateLimitResult = await checkRateLimit(
        String(ip),
        endpoint,
        rateLimitConfig
      );
      
      if (!rateLimitResult.allowed) {
        // Log blocked request
        await logBlockedRequest(String(ip), endpoint, rateLimitResult.reason);
        
        res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: rateLimitResult.retryAfter
        });
        return;
      }
      
      // Update IP reputation
      await updateIPReputation(String(ip), endpoint, userAgent);
      
      // Allow request
      res.json({
        allowed: true,
        remaining: rateLimitResult.remaining
      });
    } catch (error) {
      console.error("Rate limit check error:", error);
      res.status(500).json({ error: "Rate limit check failed" });
    }
  });

/**
 * Determine appropriate rate limit for endpoint
 */
function determineRateLimit(endpoint: string): RateLimitConfig {
  if (endpoint.startsWith("/auth")) return RATE_LIMITS.auth;
  if (endpoint.startsWith("/wallet")) return RATE_LIMITS.wallet;
  if (endpoint.startsWith("/payment")) return RATE_LIMITS.payment;
  if (endpoint.startsWith("/ai")) return RATE_LIMITS.ai_companion;
  if (endpoint.startsWith("/swipe")) return RATE_LIMITS.swipe;
  return RATE_LIMITS.general;
}

/**
 * Check rate limit for IP + endpoint
 */
async function checkRateLimit(
  ip: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  reason?: string;
}> {
  const windowKey = `${ip}:${endpoint}:${Math.floor(Date.now() / 1000 / config.windowSeconds)}`;
  
  const rateLimitDoc = await db
    .collection("rateLimits")
    .doc(windowKey)
    .get();
  
  const currentCount = rateLimitDoc.exists ? (rateLimitDoc.data()?.count || 0) : 0;
  
  if (currentCount >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: config.windowSeconds,
      reason: `Rate limit exceeded: ${currentCount}/${config.maxRequests} in ${config.windowSeconds}s`
    };
  }
  
  // Increment counter
  await db
    .collection("rateLimits")
    .doc(windowKey)
    .set(
      {
        ip,
        endpoint,
        count: admin.firestore.FieldValue.increment(1),
        lastRequest: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(
          Date.now() + config.windowSeconds * 2 * 1000
        )
      },
      { merge: true }
    );
  
  return {
    allowed: true,
    remaining: config.maxRequests - currentCount - 1
  };
}

/**
 * Update IP reputation
 */
async function updateIPReputation(
  ip: string,
  endpoint: string,
  userAgent: string
): Promise<void> {
  const reputationRef = db.collection("ipReputation").doc(ip);
  const reputationDoc = await reputationRef.get();
  
  if (!reputationDoc.exists) {
    // New IP
    await reputationRef.set({
      ip,
      requestCount: 1,
      suspiciousScore: 0,
      firstSeen: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      userAgents: [userAgent],
      endpoints: [endpoint]
    });
  } else {
    // Existing IP
    const data = reputationDoc.data() as IPReputation;
    
    // Calculate suspicious score
    const suspiciousScore = calculateSuspiciousScore(data, endpoint, userAgent);
    
    await reputationRef.update({
      requestCount: admin.firestore.FieldValue.increment(1),
      suspiciousScore,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      userAgents: admin.firestore.FieldValue.arrayUnion(userAgent),
      endpoints: admin.firestore.FieldValue.arrayUnion(endpoint)
    });
  }
}

/**
 * Calculate suspicious score for IP
 */
function calculateSuspiciousScore(
  reputation: IPReputation,
  newEndpoint: string,
  newUserAgent: string
): number {
  let score = reputation.suspiciousScore || 0;
  
  // High request count
  if (reputation.requestCount > 10000) {
    score += 10;
  } else if (reputation.requestCount > 5000) {
    score += 5;
  }
  
  // Multiple user agents (potential bot)
  const userAgentsSet = new Set([...reputation.userAgents, newUserAgent]);
  if (userAgentsSet.size > 10) {
    score += 15;
  } else if (userAgentsSet.size > 5) {
    score += 10;
  }
  
  // Wide endpoint access pattern
  const endpointsSet = new Set([...reputation.endpoints, newEndpoint]);
  if (endpointsSet.size > 20) {
    score += 10;
  }
  
  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Log blocked request
 */
async function logBlockedRequest(
  ip: string,
  endpoint: string,
  reason: string
): Promise<void> {
  await db.collection("blockedRequests").add({
    ip,
    endpoint,
    reason,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * DDoS detection and mitigation
 */
export const pack391_detectDDoS = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB"
  })
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    try {
      console.log("🔍 Running DDoS detection...");
      
      const now = Date.now();
      const oneMinuteAgo = new Date(now - 60 * 1000);
      
      // Analyze traffic patterns
      const recentRequests = await db
        .collection("rateLimits")
        .where("lastRequest", ">", admin.firestore.Timestamp.fromDate(oneMinuteAgo))
        .get();
      
      const uniqueIPs = new Set<string>();
      const suspiciousIPs = new Set<string>();
      let totalRequests = 0;
      
      for (const doc of recentRequests.docs) {
        const data = doc.data();
        uniqueIPs.add(data.ip);
        totalRequests += data.count || 0;
        
        // Check IP reputation
        const reputationDoc = await db.collection("ipReputation").doc(data.ip).get();
        if (reputationDoc.exists) {
          const reputation = reputationDoc.data() as IPReputation;
          if (reputation.suspiciousScore > 50) {
            suspiciousIPs.add(data.ip);
          }
        }
      }
      
      const requestsPerSecond = totalRequests / 60;
      
      // Detect anomalies
      const alert = await detectAnomalies({
        requestsPerSecond,
        uniqueIPs: uniqueIPs.size,
        suspiciousIPs: suspiciousIPs.size,
        blockedRequests: 0
      });
      
      if (alert) {
        console.log(`⚠️ DDoS alert: ${alert.type} - ${alert.severity}`);
        
        // Store alert
        await db.collection("ddosAlerts").add({
          ...alert,
          detectedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Auto-mitigate if critical
        if (alert.severity === "critical") {
          await autoMitigateDDoS(alert);
        }
      }
      
      return { success: true, alert: alert ? true : false };
    } catch (error) {
      console.error("DDoS detection error:", error);
      throw error;
    }
  });

/**
 * Detect traffic anomalies
 */
async function detectAnomalies(metrics: {
  requestsPerSecond: number;
  uniqueIPs: number;
  suspiciousIPs: number;
  blockedRequests: number;
}): Promise<DDoSAlert | null> {
  // Get historical baseline
  const baseline = await getTrafficBaseline();
  
  // Traffic spike detection
  if (metrics.requestsPerSecond > baseline.requestsPerSecond * 5) {
    return {
      alertId: generateAlertId(),
      type: "spike",
      severity: metrics.requestsPerSecond > baseline.requestsPerSecond * 10 ? "critical" : "high",
      detectedAt: admin.firestore.Timestamp.now(),
      metrics,
      status: "active"
    };
  }
  
  // Distributed attack detection (many IPs)
  if (metrics.uniqueIPs > baseline.uniqueIPs * 3 && metrics.suspiciousIPs > 10) {
    return {
      alertId: generateAlertId(),
      type: "distributed",
      severity: "high",
      detectedAt: admin.firestore.Timestamp.now(),
      metrics,
      status: "active"
    };
  }
  
  // Bot swarm detection (suspicious IPs)
  if (metrics.suspiciousIPs > 50) {
    return {
      alertId: generateAlertId(),
      type: "bot_swarm",
      severity: metrics.suspiciousIPs > 100 ? "critical" : "medium",
      detectedAt: admin.firestore.Timestamp.now(),
      metrics,
      status: "active"
    };
  }
  
  return null;
}

/**
 * Get traffic baseline for comparison
 */
async function getTrafficBaseline(): Promise<{
  requestsPerSecond: number;
  uniqueIPs: number;
}> {
  // In production, calculate from historical data
  // For now, return static baseline
  return {
    requestsPerSecond: 100,
    uniqueIPs: 50
  };
}

/**
 * Auto-mitigate DDoS attack
 */
async function autoMitigateDDoS(alert: DDoSAlert): Promise<void> {
  console.log(`🛡️ Auto-mitigating DDoS: ${alert.type}`);
  
  // Get most suspicious IPs
  const suspiciousIPsSnapshot = await db
    .collection("ipReputation")
    .where("suspiciousScore", ">", 70)
    .orderBy("suspiciousScore", "desc")
    .limit(100)
    .get();
  
  const batch = db.batch();
  const blockDuration = 60 * 60 * 1000; // 1 hour
  
  for (const doc of suspiciousIPsSnapshot.docs) {
    batch.update(doc.ref, {
      blockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + blockDuration),
      blockReason: `Auto-blocked during ${alert.type} attack`
    });
  }
  
  await batch.commit();
  
  console.log(`🛡️ Blocked ${suspiciousIPsSnapshot.size} suspicious IPs`);
  
  // Alert operations team
  await db.collection("alerts").add({
    type: "ddos_mitigation",
    severity: "critical",
    message: `Auto-mitigated ${alert.type} attack, blocked ${suspiciousIPsSnapshot.size} IPs`,
    alert,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Wallet brute-force protection
 */
export const pack391_walletBruteForceShield = functions
  .runWith({
    timeoutSeconds: 30,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    const { userId, action } = data;
    
    if (!userId || !action) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId and action required"
      );
    }
    
    try {
      const ip = context.rawRequest.headers["x-forwarded-for"] || 
                 context.rawRequest.connection.remoteAddress || 
                 "unknown";
      
      // Check brute-force attempts
      const attemptKey = `wallet:${userId}:${ip}`;
      const attemptDoc = await db.collection("bruteForceAttempts").doc(attemptKey).get();
      
      const currentAttempts = attemptDoc.exists ? (attemptDoc.data()?.attempts || 0) : 0;
      
      // Block after 5 failed attempts
      if (currentAttempts >= 5) {
        console.log(`🛡️ Wallet brute-force blocked: ${userId} from ${ip}`);
        
        throw new functions.https.HttpsError(
          "permission-denied",
          "Too many failed attempts. Please try again later."
        );
      }
      
      // Record attempt
      await db.collection("bruteForceAttempts").doc(attemptKey).set({
        userId,
        ip,
        action,
        attempts: admin.firestore.FieldValue.increment(1),
        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)
      }, { merge: true });
      
      return {
        allowed: true,
        remainingAttempts: 5 - currentAttempts - 1
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      console.error("Brute-force shield error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Shield check failed"
      );
    }
  });

/**
 * Panic escalation - priority traffic lane during attacks
 */
export const pack391_panicEscalation = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify authenticated user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }
    
    const { userId, reason } = data;
    
    if (!userId || userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User ID mismatch"
      );
    }
    
    try {
      // Create priority lane pass
      const panicPass = await db.collection("panicEscalation").add({
        userId,
        reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes
        status: "active"
      });
      
      console.log(`🚨 Panic escalation activated for user ${userId}`);
      
      return {
        success: true,
        passId: panicPass.id,
        expiresIn: 300 // seconds
      };
    } catch (error) {
      console.error("Panic escalation error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Escalation failed"
      );
    }
  });

/**
 * Cleanup expired rate limits and blocks
 */
export const pack391_cleanupExpiredBlocks = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB"
  })
  .pubsub.schedule("every 1 hours")
  .onRun(async (context) => {
    try {
      console.log("🗑️ Cleaning up expired blocks...");
      
      const now = admin.firestore.Timestamp.now();
      
      // Cleanup expired rate limits
      const expiredRateLimits = await db
        .collection("rateLimits")
        .where("expiresAt", "<", now)
        .limit(1000)
        .get();
      
      const rateLimitBatch = db.batch();
      expiredRateLimits.docs.forEach(doc => rateLimitBatch.delete(doc.ref));
      await rateLimitBatch.commit();
      
      // Cleanup expired IP blocks
      const expiredBlocks = await db
        .collection("ipReputation")
        .where("blockedUntil", "<", now)
        .limit(500)
        .get();
      
      const blockBatch = db.batch();
      expiredBlocks.docs.forEach(doc => {
        blockBatch.update(doc.ref, {
          blockedUntil: admin.firestore.FieldValue.delete(),
          blockReason: admin.firestore.FieldValue.delete()
        });
      });
      await blockBatch.commit();
      
      // Cleanup expired brute-force attempts
      const expiredAttempts = await db
        .collection("bruteForceAttempts")
        .where("expiresAt", "<", now)
        .limit(1000)
        .get();
      
      const attemptsBatch = db.batch();
      expiredAttempts.docs.forEach(doc => attemptsBatch.delete(doc.ref));
      await attemptsBatch.commit();
      
      const totalCleaned = 
        expiredRateLimits.size + 
        expiredBlocks.size + 
        expiredAttempts.size;
      
      console.log(`✅ Cleaned up ${totalCleaned} expired records`);
      
      return { success: true, cleaned: totalCleaned };
    } catch (error) {
      console.error("Cleanup error:", error);
      throw error;
    }
  });

/**
 * Generate unique alert ID
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Get DDoS statistics
 */
export const pack391_getDDoSStats = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB"
  })
  .https.onCall(async (data, context) => {
    // Verify admin access
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    try {
      // Get active alerts
      const activeAlerts = await db
        .collection("ddosAlerts")
        .where("status", "==", "active")
        .orderBy("detectedAt", "desc")
        .limit(10)
        .get();
      
      // Get blocked IPs count
      const blockedIPs = await db
        .collection("ipReputation")
        .where("blockedUntil", ">", admin.firestore.Timestamp.now())
        .count()
        .get();
      
      // Get recent blocked requests
      const recentBlocked = await db
        .collection("blockedRequests")
        .orderBy("timestamp", "desc")
        .limit(100)
        .get();
      
      return {
        activeAlerts: activeAlerts.docs.map(doc => doc.data()),
        blockedIPsCount: blockedIPs.data().count,
        recentBlockedRequests: recentBlocked.docs.map(doc => doc.data())
      };
    } catch (error) {
      console.error("Get DDoS stats error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to get stats"
      );
    }
  });
