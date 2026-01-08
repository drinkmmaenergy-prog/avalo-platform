/**
 * ==================================================================
 * AVALO FIRESTORE SHARDING STRATEGY - 20M USER SCALE
 * ==================================================================
 *
 * Advanced sharding implementation for handling 10-20M concurrent users
 *
 * Strategy:
 * - User-based sharding (by UID hash)
 * - Time-based sharding (for messages, events)
 * - Geographic sharding (by region)
 * - Hot document mitigation
 *
 * @version 4.0.0
 * @scalability 20M+ users
 */

;
;
;
import * as crypto from "crypto";

// =================================================================
// SHARD CONFIGURATION
// =================================================================

export const SHARD_CONFIG = {
  // User collection sharding
  USER_SHARDS: 100, // 100 shards = 200K users per shard at 20M scale

  // Chat message sharding
  MESSAGE_SHARDS: 1000, // 1000 shards for high-volume messaging

  // Feed sharding
  FEED_SHARDS: 500, // 500 shards for global feed

  // Transaction sharding
  TRANSACTION_SHARDS: 200, // 200 shards for financial records

  // Analytics event sharding
  ANALYTICS_SHARDS: 100, // 100 shards per day for events

  // Geographic regions
  REGIONS: ['us-east', 'us-west', 'eu-west', 'eu-central', 'asia-south', 'asia-east'] as const,
};

export type Region = typeof SHARD_CONFIG.REGIONS[number];

// =================================================================
// SHARDING FUNCTIONS
// =================================================================

/**
 * Generate shard ID from user ID (consistent hashing)
 */
export function getUserShardId(userId: string, totalShards: number = SHARD_CONFIG.USER_SHARDS): string {
  const hash = crypto.createHash('sha256').update(userId).digest('hex');
  const numericHash = parseInt(hash.substring(0, 8), 16);
  const shardNumber = numericHash % totalShards;
  return `user_shard_${shardNumber.toString().padStart(3, '0')}`;
}

/**
 * Generate shard ID for chat messages (time + participants)
 */
export function getChatShardId(
  chatId: string,
  timestamp: Date = new Date(),
  totalShards: number = SHARD_CONFIG.MESSAGE_SHARDS
): string {
  // Combine chatId and month for time-based sharding
  const month = `${timestamp.getFullYear()}_${(timestamp.getMonth() + 1).toString().padStart(2, '0')}`;
  const combined = `${chatId}_${month}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  const numericHash = parseInt(hash.substring(0, 8), 16);
  const shardNumber = numericHash % totalShards;
  return `chat_shard_${month}_${shardNumber.toString().padStart(4, '0')}`;
}

/**
 * Generate shard ID for feed posts
 */
export function getFeedShardId(
  postId: string,
  timestamp: Date = new Date(),
  totalShards: number = SHARD_CONFIG.FEED_SHARDS
): string {
  // Daily sharding for feed to enable efficient cleanup
  const day = timestamp.toISOString().split('T')[0].replace(/-/g, '_');
  const hash = crypto.createHash('sha256').update(postId).digest('hex');
  const numericHash = parseInt(hash.substring(0, 8), 16);
  const shardNumber = numericHash % totalShards;
  return `feed_shard_${day}_${shardNumber.toString().padStart(3, '0')}`;
}

/**
 * Generate shard ID for transactions
 */
export function getTransactionShardId(
  userId: string,
  timestamp: Date = new Date(),
  totalShards: number = SHARD_CONFIG.TRANSACTION_SHARDS
): string {
  // Monthly sharding for transactions (regulatory requirements)
  const month = `${timestamp.getFullYear()}_${(timestamp.getMonth() + 1).toString().padStart(2, '0')}`;
  const hash = crypto.createHash('sha256').update(userId).digest('hex');
  const numericHash = parseInt(hash.substring(0, 8), 16);
  const shardNumber = numericHash % totalShards;
  return `tx_shard_${month}_${shardNumber.toString().padStart(3, '0')}`;
}

/**
 * Generate shard ID for analytics events
 */
export function getAnalyticsShardId(
  timestamp: Date = new Date(),
  totalShards: number = SHARD_CONFIG.ANALYTICS_SHARDS
): string {
  // Hourly sharding for analytics to enable real-time processing
  const hour = `${timestamp.toISOString().split('T')[0].replace(/-/g, '_')}_${timestamp.getHours().toString().padStart(2, '0')}`;
  const random = Math.floor(Math.random() * totalShards);
  return `analytics_${hour}_${random.toString().padStart(3, '0')}`;
}

/**
 * Get regional shard based on user location
 */
export function getRegionalShard(
  latitude?: number,
  longitude?: number,
  userRegion?: string
): Region {
  // If user region is explicitly set
  if (userRegion && SHARD_CONFIG.REGIONS.includes(userRegion as Region)) {
    return userRegion as Region;
  }

  // If coordinates provided, determine region
  if (latitude !== undefined && longitude !== undefined) {
    // North America
    if (latitude >= 25 && latitude <= 50 && longitude >= -125 && longitude <= -65) {
      return longitude < -100 ? 'us-west' : 'us-east';
    }

    // Europe
    if (latitude >= 35 && latitude <= 70 && longitude >= -10 && longitude <= 40) {
      return longitude < 15 ? 'eu-west' : 'eu-central';
    }

    // Asia
    if (latitude >= -10 && latitude <= 55 && longitude >= 60 && longitude <= 150) {
      return longitude < 100 ? 'asia-south' : 'asia-east';
    }
  }

  // Default to us-east
  return 'us-east';
}

// =================================================================
// HOT DOCUMENT MITIGATION
// =================================================================

/**
 * Generate distributed counter shard for hot documents
 *
 * Problem: Single document updates cause contention at scale
 * Solution: Distribute writes across multiple counter shards
 */
export function getCounterShardId(
  documentId: string,
  numShards: number = 10
): string {
  const random = Math.floor(Math.random() * numShards);
  return `${documentId}_counter_${random}`;
}

/**
 * Calculate total from distributed counter shards
 */
export async function getCounterTotal(
  firestore: FirebaseFirestore.Firestore,
  collectionPath: string,
  documentId: string,
  numShards: number = 10
): Promise<number> {
  let total = 0;

  for (let i = 0; i < numShards; i++) {
    const shardId = `${documentId}_counter_${i}`;
    const doc = await firestore.collection(collectionPath).doc(shardId).get();

    if (doc.exists) {
      total += (doc.data()?.count || 0);
    }
  }

  return total;
}

// =================================================================
// COLLECTION ROUTING
// =================================================================

/**
 * Route document to appropriate shard collection
 */
export function getShardedCollectionPath(
  baseCollection: string,
  shardId: string
): string {
  return `${baseCollection}_shards/${shardId}/documents`;
}

/**
 * Get all shard collection paths for querying
 */
export function getAllShardPaths(
  baseCollection: string,
  totalShards: number
): string[] {
  const paths: string[] = [];

  for (let i = 0; i < totalShards; i++) {
    const shardId = i.toString().padStart(3, '0');
    paths.push(`${baseCollection}_shards/${shardId}/documents`);
  }

  return paths;
}

// =================================================================
// QUERY HELPERS
// =================================================================

/**
 * Execute parallel queries across all shards
 */
export async function queryAllShards<T>(
  firestore: FirebaseFirestore.Firestore,
  baseCollection: string,
  totalShards: number,
  queryBuilder: (collection: FirebaseFirestore.CollectionReference) => FirebaseFirestore.Query,
  limit?: number
): Promise<T[]> {
  const paths = getAllShardPaths(baseCollection, totalShards);

  // Query all shards in parallel
  const queryPromises = paths.map(async (path) => {
    const collection = firestore.collection(path);
    const query = queryBuilder(collection);
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  });

  const results = await Promise.all(queryPromises);
  const flatResults = results.flat();

  // Sort and limit if needed
  if (limit) {
    return flatResults.slice(0, limit);
  }

  return flatResults;
}

// =================================================================
// MIGRATION HELPERS
// =================================================================

/**
 * Get migration batch for resharding
 */
export function getMigrationBatch(
  totalDocuments: number,
  currentShard: number,
  targetShard: number
): { offset: number; limit: number } {
  const batchSize = 500; // Firestore batch limit
  return {
    offset: currentShard * batchSize,
    limit: Math.min(batchSize, totalDocuments - (currentShard * batchSize))
  };
}

// =================================================================
// MONITORING
// =================================================================

/**
 * Log sharding metrics
 */
export function logShardMetrics(
  operation: string,
  shardId: string,
  duration: number
): void {
  logger.info('Shard operation completed', {
    operation,
    shardId,
    durationMs: duration,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Detect hot shards
 */
export interface ShardStats {
  shardId: string;
  documentCount: number;
  readOps: number;
  writeOps: number;
  avgLatency: number;
}

export function identifyHotShards(
  stats: ShardStats[],
  threshold: {
    maxDocuments?: number;
    maxReads?: number;
    maxWrites?: number;
    maxLatency?: number;
  }
): ShardStats[] {
  return stats.filter(shard => {
    if (threshold.maxDocuments && shard.documentCount > threshold.maxDocuments) return true;
    if (threshold.maxReads && shard.readOps > threshold.maxReads) return true;
    if (threshold.maxWrites && shard.writeOps > threshold.maxWrites) return true;
    if (threshold.maxLatency && shard.avgLatency > threshold.maxLatency) return true;
    return false;
  });
}

// =================================================================
// EXPORTS
// =================================================================

export const ShardingStrategy = {
  getUserShardId,
  getChatShardId,
  getFeedShardId,
  getTransactionShardId,
  getAnalyticsShardId,
  getRegionalShard,
  getCounterShardId,
  getCounterTotal,
  getShardedCollectionPath,
  getAllShardPaths,
  queryAllShards,
  getMigrationBatch,
  logShardMetrics,
  identifyHotShards,
};

logger.info('✅ Firestore sharding strategy loaded - 20M user scale ready');

