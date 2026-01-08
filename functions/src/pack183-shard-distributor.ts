/**
 * PACK 183 — Shard Distributor
 * Smart load distribution across modules
 */

import { db, serverTimestamp } from './init';

export interface ShardConfig {
  module: 'CHAT' | 'AI' | 'FEED' | 'TOKENS' | 'EVENTS' | 'MEDIA';
  shardKey: string;
  shardCount: number;
  strategy: 'HASH' | 'REGION' | 'USER_ID' | 'CONVERSATION_ID' | 'EVENT_ID';
}

export interface ShardAssignment {
  entityId: string;
  shardId: number;
  region: string;
  assignedAt: FirebaseFirestore.Timestamp;
}

const SHARD_CONFIGURATIONS: Record<string, ShardConfig> = {
  CHAT: {
    module: 'CHAT',
    shardKey: 'conversationId',
    shardCount: 32,
    strategy: 'CONVERSATION_ID',
  },
  AI: {
    module: 'AI',
    shardKey: 'language_persona',
    shardCount: 16,
    strategy: 'HASH',
  },
  FEED: {
    module: 'FEED',
    shardKey: 'region_creator',
    shardCount: 24,
    strategy: 'REGION',
  },
  TOKENS: {
    module: 'TOKENS',
    shardKey: 'userId',
    shardCount: 64,
    strategy: 'USER_ID',
  },
  EVENTS: {
    module: 'EVENTS',
    shardKey: 'eventId',
    shardCount: 8,
    strategy: 'EVENT_ID',
  },
  MEDIA: {
    module: 'MEDIA',
    shardKey: 'fileHash',
    shardCount: 16,
    strategy: 'HASH',
  },
};

/**
 * Hash function for consistent sharding
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Assign shard based on module and entity
 */
export function assignShard(
  module: keyof typeof SHARD_CONFIGURATIONS,
  entityId: string,
  metadata?: { region?: string; language?: string; persona?: string }
): number {
  const config = SHARD_CONFIGURATIONS[module];
  
  switch (config.strategy) {
    case 'CONVERSATION_ID':
      return hashString(entityId) % config.shardCount;
    
    case 'USER_ID':
      return hashString(entityId) % config.shardCount;
    
    case 'EVENT_ID':
      return hashString(entityId) % config.shardCount;
    
    case 'HASH':
      if (module === 'AI' && metadata?.language && metadata?.persona) {
        const compositeKey = `${metadata.language}_${metadata.persona}`;
        return hashString(compositeKey) % config.shardCount;
      }
      return hashString(entityId) % config.shardCount;
    
    case 'REGION':
      if (metadata?.region) {
        const regionHash = hashString(metadata.region);
        const creatorHash = hashString(entityId);
        return (regionHash + creatorHash) % config.shardCount;
      }
      return hashString(entityId) % config.shardCount;
    
    default:
      return hashString(entityId) % config.shardCount;
  }
}

/**
 * Get shard assignment for chat conversation
 */
export function getConversationShard(conversationId: string): number {
  return assignShard('CHAT', conversationId);
}

/**
 * Get shard assignment for AI request
 */
export function getAiShard(language: string, persona: string): number {
  return assignShard('AI', `${language}_${persona}`, { language, persona });
}

/**
 * Get shard assignment for feed content
 */
export function getFeedShard(creatorId: string, region: string): number {
  return assignShard('FEED', creatorId, { region });
}

/**
 * Get shard assignment for token operations
 */
export function getTokenShard(userId: string): number {
  return assignShard('TOKENS', userId);
}

/**
 * Get shard assignment for events
 */
export function getEventShard(eventId: string): number {
  return assignShard('EVENTS', eventId);
}

/**
 * Get shard assignment for media storage
 */
export function getMediaShard(fileHash: string): number {
  return assignShard('MEDIA', fileHash);
}

/**
 * Get shard distribution statistics
 */
export async function getShardDistributionStats(
  module: keyof typeof SHARD_CONFIGURATIONS
): Promise<Record<number, number>> {
  const config = SHARD_CONFIGURATIONS[module];
  const stats: Record<number, number> = {};

  for (let i = 0; i < config.shardCount; i++) {
    stats[i] = 0;
  }

  try {
    const snapshot = await db.collection('shard_assignments')
      .where('module', '==', module)
      .limit(10000)
      .get();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.shardId !== undefined) {
        stats[data.shardId] = (stats[data.shardId] || 0) + 1;
      }
    });
  } catch (error) {
    console.error(`[ShardDistributor] Error getting stats for ${module}:`, error);
  }

  return stats;
}

/**
 * Rebalance shards if needed
 */
export async function rebalanceShards(
  module: keyof typeof SHARD_CONFIGURATIONS
): Promise<{ rebalanced: number; skipped: number }> {
  const stats = await getShardDistributionStats(module);
  const values = Object.values(stats);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const threshold = avg * 0.3;

  let rebalanced = 0;
  let skipped = 0;

  for (const [shardId, count] of Object.entries(stats)) {
    if (Math.abs(count - avg) > threshold) {
      console.log(
        `[ShardDistributor] Shard ${shardId} in ${module} needs rebalancing (${count} vs avg ${avg.toFixed(0)})`
      );
      rebalanced++;
    } else {
      skipped++;
    }
  }

  return { rebalanced, skipped };
}

/**
 * Record shard assignment for monitoring
 */
export async function recordShardAssignment(
  module: keyof typeof SHARD_CONFIGURATIONS,
  entityId: string,
  shardId: number,
  region: string
): Promise<void> {
  await db.collection('shard_assignments').add({
    module,
    entityId,
    shardId,
    region,
    assignedAt: serverTimestamp(),
  });
}

/**
 * Get optimal shard for write operation
 */
export async function getOptimalWriteShard(
  module: keyof typeof SHARD_CONFIGURATIONS,
  entityId: string
): Promise<number> {
  const primaryShard = assignShard(module, entityId);
  
  const shardLoadSnapshot = await db.collection('shard_loads')
    .where('module', '==', module)
    .where('shardId', '==', primaryShard)
    .limit(1)
    .get();

  if (!shardLoadSnapshot.empty) {
    const load = shardLoadSnapshot.docs[0].data();
    if (load.currentLoad > load.maxCapacity * 0.9) {
      console.log(`[ShardDistributor] Shard ${primaryShard} overloaded, finding alternative`);
      return (primaryShard + 1) % SHARD_CONFIGURATIONS[module].shardCount;
    }
  }

  return primaryShard;
}

/**
 * Update shard load metrics
 */
export async function updateShardLoad(
  module: keyof typeof SHARD_CONFIGURATIONS,
  shardId: number,
  load: number
): Promise<void> {
  const docId = `${module}_${shardId}`;
  
  await db.collection('shard_loads').doc(docId).set(
    {
      module,
      shardId,
      currentLoad: load,
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Get all shard configurations
 */
export function getAllShardConfigs(): Record<string, ShardConfig> {
  return { ...SHARD_CONFIGURATIONS };
}