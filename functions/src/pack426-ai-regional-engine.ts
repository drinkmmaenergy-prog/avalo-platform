/**
 * PACK 426 — AI Regional Engine
 * 
 * Manages AI infrastructure replication across regions for:
 * - AI Companions
 * - Chat Assist
 * - Safety LLM
 * - Content Moderation AI
 * 
 * Ensures low-latency, token-efficient, and fault-tolerant AI operations.
 */

import { https, logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { Region, routeRegion } from './pack426-global-router';

// ============================================================================
// TYPES
// ============================================================================

export interface AIEndpointConfig {
  region: Region;
  endpoint: string;
  model: string;
  maxTokens: number;
  priority: number;
  healthy: boolean;
}

export interface AIRequest {
  userId: string;
  sessionId: string;
  feature: AIFeature;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  region?: Region;
}

export interface AIResponse {
  sessionId: string;
  response: string;
  tokensUsed: number;
  region: Region;
  latency: number;
  cached: boolean;
}

export type AIFeature = 
  | 'companion'
  | 'chat-assist'
  | 'safety-check'
  | 'moderation'
  | 'image-analysis'
  | 'voice-synthesis';

// ============================================================================
// AI ENDPOINT CONFIGURATIONS
// ============================================================================

export const AI_ENDPOINTS: Record<Region, AIEndpointConfig> = {
  EU: {
    region: 'EU',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.5-turbo',
    maxTokens: 4096,
    priority: 1,
    healthy: true,
  },
  US: {
    region: 'US',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.5-turbo',
    maxTokens: 4096,
    priority: 1,
    healthy: true,
  },
  APAC: {
    region: 'APAC',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.5-turbo',
    maxTokens: 4096,
    priority: 2,
    healthy: true,
  },
};

// Token usage limits per region (per hour)
const REGIONAL_TOKEN_LIMITS: Record<Region, number> = {
  EU: 1_000_000,   // 1M tokens/hour
  US: 1_000_000,   // 1M tokens/hour
  APAC: 500_000,   // 500K tokens/hour (lower priority)
};

// ============================================================================
// AI ROUTING & DISPATCHING
// ============================================================================

/**
 * Route AI request to optimal regional endpoint
 */
export async function routeAIRequest(request: AIRequest): Promise<AIEndpointConfig> {
  const db = getFirestore();
  
  // Determine user's region
  const userDoc = await db.collection('users').doc(request.userId).get();
  const userData = userDoc.data();
  const userRegion = request.region || userData?.region || 'EU';
  
  // Check regional token quota
  const quotaAvailable = await checkRegionalQuota(userRegion, request.feature);
  
  if (!quotaAvailable) {
    logger.warn(`Region ${userRegion} token quota exceeded, using fallback`);
    return await getFailoverAIEndpoint(userRegion);
  }
  
  // Check endpoint health
  const endpoint = AI_ENDPOINTS[userRegion];
  if (!endpoint.healthy) {
    logger.warn(`Region ${userRegion} AI endpoint unhealthy, using fallback`);
    return await getFailoverAIEndpoint(userRegion);
  }
  
  return endpoint;
}

/**
 * Get failover AI endpoint when primary fails
 */
async function getFailoverAIEndpoint(primaryRegion: Region): Promise<AIEndpointConfig> {
  const failoverOrder: Region[] = 
    primaryRegion === 'EU' ? ['US', 'APAC'] :
    primaryRegion === 'US' ? ['EU', 'APAC'] :
    ['EU', 'US'];
  
  for (const region of failoverOrder) {
    const endpoint = AI_ENDPOINTS[region];
    const quotaAvailable = await checkRegionalQuota(region, 'companion');
    
    if (endpoint.healthy && quotaAvailable) {
      logger.info(`Failover to ${region} AI endpoint`);
      return endpoint;
    }
  }
  
  // Last resort: return primary even if unhealthy (will error and retry)
  logger.error('All AI regions unavailable, returning primary');
  return AI_ENDPOINTS[primaryRegion];
}

// ============================================================================
// TOKEN QUOTA MANAGEMENT
// ============================================================================

/**
 * Check if region has available token quota
 */
async function checkRegionalQuota(
  region: Region,
  feature: AIFeature
): Promise<boolean> {
  const db = getFirestore();
  const now = Date.now();
  const hourStart = now - (now % 3600000); // Start of current hour
  
  try {
    const quotaDoc = await db
      .collection('infrastructure')
      .doc('aiQuota')
      .collection('hourly')
      .doc(`${region}-${hourStart}`)
      .get();
    
    if (!quotaDoc.exists) {
      // No usage yet this hour
      return true;
    }
    
    const usage = quotaDoc.data()?.tokensUsed || 0;
    const limit = REGIONAL_TOKEN_LIMITS[region];
    
    return usage < limit;
  } catch (error) {
    logger.error(`Failed to check quota for ${region}:`, error);
    return true; // Fail open
  }
}

/**
 * Track token usage for region
 */
export async function trackTokenUsage(
  region: Region,
  feature: AIFeature,
  tokensUsed: number
): Promise<void> {
  const db = getFirestore();
  const now = Date.now();
  const hourStart = now - (now % 3600000);
  
  const docRef = db
    .collection('infrastructure')
    .doc('aiQuota')
    .collection('hourly')
    .doc(`${region}-${hourStart}`);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    
    const currentUsage = doc.exists ? doc.data()?.tokensUsed || 0 : 0;
    const featureUsage = doc.exists ? doc.data()?.byFeature || {} : {};
    
    transaction.set(docRef, {
      region,
      hourStart,
      tokensUsed: currentUsage + tokensUsed,
      byFeature: {
        ...featureUsage,
        [feature]: (featureUsage[feature] || 0) + tokensUsed,
      },
      lastUpdated: now,
    }, { merge: true });
  });
}

/**
 * Get current usage stats for region
 */
export async function getRegionalUsageStats(region: Region): Promise<{
  tokensUsed: number;
  limit: number;
  percentUsed: number;
  byFeature: Record<AIFeature, number>;
}> {
  const db = getFirestore();
  const now = Date.now();
  const hourStart = now - (now % 3600000);
  
  const doc = await db
    .collection('infrastructure')
    .doc('aiQuota')
    .collection('hourly')
    .doc(`${region}-${hourStart}`)
    .get();
  
  const tokensUsed = doc.exists ? doc.data()?.tokensUsed || 0 : 0;
  const limit = REGIONAL_TOKEN_LIMITS[region];
  const byFeature = doc.exists ? doc.data()?.byFeature || {} : {};
  
  return {
    tokensUsed,
    limit,
    percentUsed: (tokensUsed / limit) * 100,
    byFeature,
  };
}

// ============================================================================
// AI REQUEST EXECUTION
// ============================================================================

/**
 * Execute AI request with automatic failover
 */
export async function executeAIRequest(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();
  const endpoint = await routeAIRequest(request);
  
  try {
    // Call AI API
    const response = await callAIAPI(endpoint, request);
    
    // Track usage
    await trackTokenUsage(endpoint.region, request.feature, response.tokensUsed);
    
    // Record metrics
    await recordAIMetrics(endpoint.region, request.feature, Date.now() - startTime, true);
    
    return {
      sessionId: request.sessionId,
      response: response.content,
      tokensUsed: response.tokensUsed,
      region: endpoint.region,
      latency: Date.now() - startTime,
      cached: false,
    };
  } catch (error) {
    logger.error(`AI request failed on ${endpoint.region}:`, error);
    
    // Try failover
    const fallbackEndpoint = await getFailoverAIEndpoint(endpoint.region);
    
    if (fallbackEndpoint.region !== endpoint.region) {
      try {
        const response = await callAIAPI(fallbackEndpoint, request);
        await trackTokenUsage(fallbackEndpoint.region, request.feature, response.tokensUsed);
        await recordAIMetrics(fallbackEndpoint.region, request.feature, Date.now() - startTime, true);
        
        return {
          sessionId: request.sessionId,
          response: response.content,
          tokensUsed: response.tokensUsed,
          region: fallbackEndpoint.region,
          latency: Date.now() - startTime,
          cached: false,
        };
      } catch (fallbackError) {
        logger.error('AI failover also failed:', fallbackError);
        await recordAIMetrics(fallbackEndpoint.region, request.feature, Date.now() - startTime, false);
        throw fallbackError;
      }
    }
    
    await recordAIMetrics(endpoint.region, request.feature, Date.now() - startTime, false);
    throw error;
  }
}

/**
 * Call AI API endpoint
 */
async function callAIAPI(
  endpoint: AIEndpointConfig,
  request: AIRequest
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  const response = await fetch(endpoint.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: [
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      max_tokens: request.maxTokens || 500,
      temperature: request.temperature || 0.7,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices[0].message.content,
    tokensUsed: data.usage.total_tokens,
  };
}

// ============================================================================
// RESPONSE CACHING
// ============================================================================

/**
 * Get cached AI response if available
 */
async function getCachedResponse(
  userId: string,
  prompt: string
): Promise<string | null> {
  const db = getFirestore();
  
  // Generate cache key
  const cacheKey = generateCacheKey(userId, prompt);
  
  try {
    const cacheDoc = await db
      .collection('infrastructure')
      .doc('aiCache')
      .collection('responses')
      .doc(cacheKey)
      .get();
    
    if (!cacheDoc.exists) return null;
    
    const data = cacheDoc.data();
    const age = Date.now() - data?.timestamp;
    
    // Cache valid for 1 hour
    if (age > 3600000) {
      return null;
    }
    
    logger.info(`AI cache hit for user ${userId}`);
    return data?.response || null;
  } catch (error) {
    logger.error('Cache lookup failed:', error);
    return null;
  }
}

/**
 * Cache AI response
 */
async function cacheResponse(
  userId: string,
  prompt: string,
  response: string
): Promise<void> {
  const db = getFirestore();
  const cacheKey = generateCacheKey(userId, prompt);
  
  await db
    .collection('infrastructure')
    .doc('aiCache')
    .collection('responses')
    .doc(cacheKey)
    .set({
      userId,
      prompt: prompt.substring(0, 200), // Store truncated for reference
      response,
      timestamp: Date.now(),
    });
}

function generateCacheKey(userId: string, prompt: string): string {
  // Simple hash function for cache key
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  };
  
  return `${userId}-${hashCode(prompt)}`;
}

// ============================================================================
// METRICS & MONITORING
// ============================================================================

/**
 * Record AI request metrics
 */
async function recordAIMetrics(
  region: Region,
  feature: AIFeature,
  latency: number,
  success: boolean
): Promise<void> {
  const db = getFirestore();
  const now = Date.now();
  const minuteStart = now - (now % 60000); // Start of current minute
  
  const docRef = db
    .collection('infrastructure')
    .doc('aiMetrics')
    .collection('minutely')
    .doc(`${region}-${minuteStart}`);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    
    const current = doc.exists ? doc.data() || {} : {};
    
    transaction.set(docRef, {
      region,
      minuteStart,
      requests: (current.requests || 0) + 1,
      successes: (current.successes || 0) + (success ? 1 : 0),
      failures: (current.failures || 0) + (success ? 0 : 1),
      totalLatency: (current.totalLatency || 0) + latency,
      avgLatency: ((current.totalLatency || 0) + latency) / ((current.requests || 0) + 1),
      byFeature: {
        ...(current.byFeature || {}),
        [feature]: ((current.byFeature || {})[feature] || 0) + 1,
      },
      lastUpdated: now,
    });
  });
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check health of AI endpoint
 */
export async function checkAIEndpointHealth(region: Region): Promise<boolean> {
  try {
    const testRequest: AIRequest = {
      userId: 'health-check',
      sessionId: 'health-check',
      feature: 'safety-check',
      prompt: 'Hello',
      maxTokens: 10,
    };
    
    const endpoint = AI_ENDPOINTS[region];
    const response = await callAIAPI(endpoint, testRequest);
    
    return response.content.length > 0;
  } catch (error) {
    logger.error(`Health check failed for ${region}:`, error);
    return false;
  }
}

/**
 * Update endpoint health status
 */
export async function updateEndpointHealth(
  region: Region,
  healthy: boolean
): Promise<void> {
  AI_ENDPOINTS[region].healthy = healthy;
  
  const db = getFirestore();
  await db
    .collection('infrastructure')
    .doc('aiEndpoints')
    .collection('health')
    .doc(region)
    .set({
      region,
      healthy,
      lastChecked: Date.now(),
    });
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Get AI endpoint configuration
 * GET /infrastructure/ai-config
 */
export const getAIConfig = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Authorization');
    res.status(204).send('');
    return;
  }
  
  try {
    const userCountry = req.query.country as string || 'US';
    const region = routeRegion(userCountry);
    const endpoint = AI_ENDPOINTS[region];
    const usage = await getRegionalUsageStats(region);
    
    res.status(200).json({
      success: true,
      data: {
        region: endpoint.region,
        endpoint: endpoint.endpoint,
        model: endpoint.model,
        maxTokens: endpoint.maxTokens,
        healthy: endpoint.healthy,
        usage,
      },
    });
  } catch (error) {
    logger.error('AI config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI configuration',
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  routeAIRequest,
  executeAIRequest,
  trackTokenUsage,
  getRegionalUsageStats,
  checkAIEndpointHealth,
  updateEndpointHealth,
  getCachedResponse,
  cacheResponse,
  // HTTP functions
  getAIConfig,
};
