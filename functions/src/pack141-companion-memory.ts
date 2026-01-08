/**
 * PACK 141 - AI Companion Memory System
 * 
 * Safe memory tracking - FORBIDDEN memory types blocked:
 * - No romantic events
 * - No sexual tension
 * - No relationship history
 * - No jealousy/exclusivity patterns
 */

import { db, serverTimestamp } from './init';
import {
  CompanionMemory,
  MemoryType,
  FORBIDDEN_MEMORY_TYPES,
} from './types/pack141-types';

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

/**
 * Store safe memory for AI companion
 */
export async function storeCompanionMemory(
  userId: string,
  companionId: string,
  memoryType: MemoryType,
  content: string,
  importance: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM',
  expiresInDays?: number
): Promise<CompanionMemory> {
  // Validate memory type is safe
  validateMemoryType(memoryType, content);
  
  const memoryId = `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const memory: CompanionMemory = {
    memoryId,
    userId,
    companionId,
    memoryType,
    content,
    createdAt: serverTimestamp() as any,
    importance,
    safetyValidated: true,
  };
  
  // Add expiry if specified
  if (expiresInDays) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiresInDays);
    memory.expiresAt = expiryDate as any;
  }
  
  await db.collection('ai_companion_memories').doc(memoryId).set(memory);
  
  return memory;
}

/**
 * Retrieve memories for companion-user pair
 */
export async function getCompanionMemories(
  userId: string,
  companionId: string,
  memoryTypes?: MemoryType[],
  limit: number = 50
): Promise<CompanionMemory[]> {
  let query = db.collection('ai_companion_memories')
    .where('userId', '==', userId)
    .where('companionId', '==', companionId)
    .where('safetyValidated', '==', true);
  
  // Filter by memory types if specified
  if (memoryTypes && memoryTypes.length > 0) {
    query = query.where('memoryType', 'in', memoryTypes);
  }
  
  const snapshot = await query
    .orderBy('importance', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const memories: CompanionMemory[] = [];
  snapshot.forEach(doc => {
    const data = doc.data() as CompanionMemory;
    
    // Skip expired memories
    if (data.expiresAt) {
      const expiryDate = data.expiresAt as any;
      if (expiryDate.toDate && new Date() > expiryDate.toDate()) {
        return;
      }
    }
    
    memories.push(data);
  });
  
  return memories;
}

/**
 * Update existing memory
 */
export async function updateCompanionMemory(
  memoryId: string,
  updates: Partial<Pick<CompanionMemory, 'content' | 'importance' | 'expiresAt'>>
): Promise<void> {
  // Validate content if being updated
  if (updates.content) {
    const memoryDoc = await db.collection('ai_companion_memories').doc(memoryId).get();
    if (!memoryDoc.exists) {
      throw new Error('Memory not found');
    }
    
    const memory = memoryDoc.data() as CompanionMemory;
    validateMemoryType(memory.memoryType, updates.content);
  }
  
  await db.collection('ai_companion_memories').doc(memoryId).update(updates);
}

/**
 * Delete memory
 */
export async function deleteCompanionMemory(memoryId: string): Promise<void> {
  await db.collection('ai_companion_memories').doc(memoryId).delete();
}

/**
 * Delete all memories for user-companion pair
 */
export async function deleteAllCompanionMemories(
  userId: string,
  companionId: string
): Promise<void> {
  const snapshot = await db.collection('ai_companion_memories')
    .where('userId', '==', userId)
    .where('companionId', '==', companionId)
    .get();
  
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

// ============================================================================
// MEMORY SUMMARIZATION (For AI Context)
// ============================================================================

/**
 * Get memory summary for AI context
 */
export async function getMemorySummaryForAI(
  userId: string,
  companionId: string
): Promise<string> {
  const memories = await getCompanionMemories(userId, companionId, undefined, 20);
  
  if (memories.length === 0) {
    return 'No previous context available.';
  }
  
  const summaryParts: string[] = [];
  
  // Group by memory type
  const memoryGroups: Record<MemoryType, CompanionMemory[]> = {} as any;
  memories.forEach(memory => {
    if (!memoryGroups[memory.memoryType]) {
      memoryGroups[memory.memoryType] = [];
    }
    memoryGroups[memory.memoryType].push(memory);
  });
  
  // Create summary for each type
  for (const [type, mems] of Object.entries(memoryGroups)) {
    switch (type as MemoryType) {
      case 'PREFERENCE':
        summaryParts.push(`User preferences: ${mems.map(m => m.content).join('; ')}`);
        break;
      case 'PROJECT':
        summaryParts.push(`Active projects: ${mems.map(m => m.content).join('; ')}`);
        break;
      case 'FITNESS_HABIT':
        summaryParts.push(`Fitness habits: ${mems.map(m => m.content).join('; ')}`);
        break;
      case 'LEARNING_PROGRESS':
        summaryParts.push(`Learning progress: ${mems.map(m => m.content).join('; ')}`);
        break;
      case 'CHALLENGE_CLUB':
        summaryParts.push(`Challenges joined: ${mems.map(m => m.content).join('; ')}`);
        break;
      case 'PRODUCTIVITY_GOAL':
        summaryParts.push(`Goals: ${mems.map(m => m.content).join('; ')}`);
        break;
    }
  }
  
  return summaryParts.join('\n');
}

// ============================================================================
// SAFETY VALIDATION
// ============================================================================

/**
 * Validate memory type and content are safe
 */
function validateMemoryType(memoryType: MemoryType, content: string): void {
  // Check if memory type is forbidden
  const forbiddenType = FORBIDDEN_MEMORY_TYPES.find(forbidden =>
    memoryType.toLowerCase().includes(forbidden.toLowerCase())
  );
  
  if (forbiddenType) {
    throw new Error(`FORBIDDEN MEMORY TYPE: ${forbiddenType} is not allowed in AI companion memories`);
  }
  
  // Check content for forbidden patterns
  const normalizedContent = content.toLowerCase();
  const forbiddenPatterns = [
    'romantic',
    'dating',
    'boyfriend',
    'girlfriend',
    'love',
    'intimat',
    'sexual',
    'flirt',
    'seduc',
    'jealous',
    'exclusive',
  ];
  
  for (const pattern of forbiddenPatterns) {
    if (normalizedContent.includes(pattern)) {
      throw new Error(`FORBIDDEN CONTENT: Memory contains inappropriate pattern "${pattern}"`);
    }
  }
}

// ============================================================================
// MEMORY CLEANUP (Scheduled Job)
// ============================================================================

/**
 * Clean up expired memories
 */
export async function cleanupExpiredMemories(): Promise<number> {
  const now = new Date();
  const snapshot = await db.collection('ai_companion_memories')
    .where('expiresAt', '<=', now)
    .limit(500)
    .get();
  
  if (snapshot.empty) {
    return 0;
  }
  
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  return snapshot.size;
}

/**
 * Clean up old low-importance memories (older than 90 days)
 */
export async function cleanupOldMemories(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  const snapshot = await db.collection('ai_companion_memories')
    .where('importance', '==', 'LOW')
    .where('createdAt', '<=', cutoffDate)
    .limit(500)
    .get();
  
  if (snapshot.empty) {
    return 0;
  }
  
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  return snapshot.size;
}

// ============================================================================
// MEMORY EXTRACTION FROM CONVERSATION
// ============================================================================

/**
 * Extract and store memories from user messages
 */
export async function extractMemoriesFromMessage(
  userId: string,
  companionId: string,
  messageText: string,
  companionCategory: string
): Promise<CompanionMemory[]> {
  const extractedMemories: CompanionMemory[] = [];
  const normalizedText = messageText.toLowerCase();
  
  // Extract preferences
  if (normalizedText.includes('i like') || normalizedText.includes('i love') || normalizedText.includes('i enjoy')) {
    // Safe preference extraction (non-romantic context)
    if (!normalizedText.includes('you') && !normalizedText.includes('us')) {
      const preference = messageText.substring(0, 200); // Limit length
      const memory = await storeCompanionMemory(
        userId,
        companionId,
        'PREFERENCE',
        preference,
        'MEDIUM',
        365 // Expire in 1 year
      );
      extractedMemories.push(memory);
    }
  }
  
  // Extract goals
  if (normalizedText.includes('goal') || normalizedText.includes('want to achieve') || normalizedText.includes('working on')) {
    const goal = messageText.substring(0, 200);
    const memory = await storeCompanionMemory(
      userId,
      companionId,
      'PRODUCTIVITY_GOAL',
      goal,
      'HIGH',
      180 // Expire in 6 months
    );
    extractedMemories.push(memory);
  }
  
  // Extract fitness habits (if companion is fitness category)
  if (companionCategory === 'FITNESS_WELLNESS' && 
      (normalizedText.includes('workout') || normalizedText.includes('exercise') || normalizedText.includes('training'))) {
    const habit = messageText.substring(0, 200);
    const memory = await storeCompanionMemory(
      userId,
      companionId,
      'FITNESS_HABIT',
      habit,
      'MEDIUM',
      90 // Expire in 3 months
    );
    extractedMemories.push(memory);
  }
  
  // Extract learning progress (if companion is language/knowledge category)
  if ((companionCategory === 'LANGUAGE_LEARNING' || companionCategory === 'KNOWLEDGE') &&
      (normalizedText.includes('learning') || normalizedText.includes('studying'))) {
    const progress = messageText.substring(0, 200);
    const memory = await storeCompanionMemory(
      userId,
      companionId,
      'LEARNING_PROGRESS',
      progress,
      'MEDIUM',
      180 // Expire in 6 months
    );
    extractedMemories.push(memory);
  }
  
  return extractedMemories;
}