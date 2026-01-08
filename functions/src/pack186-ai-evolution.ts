/**
 * PACK 186 - AI Evolution Engine
 * 
 * Safe AI companion memory system with growth mechanics and dependency prevention.
 * 
 * Features:
 * - Contextual memory storage (safe categories only)
 * - Memory expiration and refresh cycles
 * - Character growth and seasonal lore updates
 * - Dual-state safety mode with dependency detection
 * - User-controlled memory permissions
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, arrayUnion, generateId } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ======================
// Types & Interfaces
// ======================

export enum MemoryCategory {
  PREFERENCES = 'preferences',
  SAFE_TOPICS = 'safe_topics',
  DISLIKES = 'dislikes',
  CONVERSATIONAL_STYLE = 'conversational_style',
  LORE_CONTINUITY = 'lore_continuity',
  INTERESTS = 'interests'
}

export enum GrowthEventType {
  NEW_HOBBY = 'new_hobby',
  NEW_SKILL = 'new_skill',
  NEW_TRAVEL = 'new_travel',
  NEW_PROJECT = 'new_project',
  NEW_OUTFIT = 'new_outfit',
  NEW_VOICE_MOOD = 'new_voice_mood',
  NEW_LANGUAGE = 'new_language'
}

export enum DependencyRiskLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AIMemory {
  memoryId: string;
  userId: string;
  characterId: string;
  category: MemoryCategory;
  content: string;
  context?: string;
  createdAt: Timestamp;
  lastAccessedAt: Timestamp;
  expiresAt: Timestamp;
  accessCount: number;
  metadata?: Record<string, any>;
}

export interface GrowthEvent {
  eventId: string;
  characterId: string;
  eventType: GrowthEventType;
  title: string;
  description: string;
  timestamp: Timestamp;
  isSafe: boolean;
  metadata?: Record<string, any>;
}

export interface DependencySignal {
  signalId: string;
  userId: string;
  characterId: string;
  riskLevel: DependencyRiskLevel;
  indicators: string[];
  detectedAt: Timestamp;
  resolved: boolean;
  resolvedAt?: Timestamp;
}

export interface StabilitySession {
  sessionId: string;
  userId: string;
  characterId: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  active: boolean;
  reason: string;
  stabilityActions: string[];
}

// ======================
// Safety Validators
// ======================

const FORBIDDEN_KEYWORDS = [
  'trauma', 'addiction', 'mental_health', 'suicide', 'self_harm',
  'breakup', 'heartbreak', 'divorce', 'death', 'grief',
  'financial_trouble', 'debt', 'bankruptcy', 'vulnerable',
  'lonely', 'depressed', 'anxious', 'panic', 'therapy'
];

const SAFE_CATEGORIES = Object.values(MemoryCategory);

function validateMemoryContent(content: string, category: string): boolean {
  const lowerContent = content.toLowerCase();
  
  if (!SAFE_CATEGORIES.includes(category as MemoryCategory)) {
    return false;
  }
  
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      return false;
    }
  }
  
  return true;
}

function calculateMemoryExpiration(category: MemoryCategory): Date {
  const now = new Date();
  
  switch (category) {
    case MemoryCategory.PREFERENCES:
      return new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
    case MemoryCategory.CONVERSATIONAL_STYLE:
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case MemoryCategory.SAFE_TOPICS:
      return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    case MemoryCategory.INTERESTS:
      return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    case MemoryCategory.LORE_CONTINUITY:
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case MemoryCategory.DISLIKES:
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

// ======================
// Memory Architecture
// ======================

export async function recordAIMemory(
  userId: string,
  characterId: string,
  category: MemoryCategory,
  content: string,
  context?: string
): Promise<AIMemory> {
  if (!validateMemoryContent(content, category)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Memory content contains forbidden information or invalid category'
    );
  }
  
  const permissionDoc = await db
    .collection('ai_memory_permissions')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .limit(1)
    .get();
  
  if (permissionDoc.empty) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'User has not granted memory storage permission for this character'
    );
  }
  
  const permission = permissionDoc.docs[0].data();
  if (!permission.memoryTypes.includes(category)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `User has not granted permission for ${category} memories`
    );
  }
  
  const memoryId = generateId();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromDate(calculateMemoryExpiration(category));
  
  const memory: AIMemory = {
    memoryId,
    userId,
    characterId,
    category,
    content,
    context,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt,
    accessCount: 0,
    metadata: {
      contentLength: content.length,
      hasContext: !!context
    }
  };
  
  await db.collection('ai_memories').doc(memoryId).set(memory);
  
  await db.collection('ai_memory_expirations').doc(memoryId).set({
    memoryId,
    userId,
    characterId,
    scheduledFor: expiresAt,
    processed: false,
    createdAt: now
  });
  
  return memory;
}

export async function getAIMemories(
  userId: string,
  characterId: string,
  category?: MemoryCategory
): Promise<AIMemory[]> {
  let query = db.collection('ai_memories')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .where('expiresAt', '>', Timestamp.now());
  
  if (category) {
    query = query.where('category', '==', category);
  }
  
  const snapshot = await query.orderBy('expiresAt').orderBy('lastAccessedAt', 'desc').get();
  
  const memories = snapshot.docs.map(doc => doc.data() as AIMemory);
  
  for (const memory of memories) {
    await db.collection('ai_memories').doc(memory.memoryId).update({
      lastAccessedAt: serverTimestamp(),
      accessCount: increment(1)
    });
  }
  
  return memories;
}

export async function forgetMemory(userId: string, memoryId: string): Promise<void> {
  const memoryDoc = await db.collection('ai_memories').doc(memoryId).get();
  
  if (!memoryDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Memory not found');
  }
  
  const memory = memoryDoc.data() as AIMemory;
  
  if (memory.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized to delete this memory');
  }
  
  await db.collection('ai_memories').doc(memoryId).delete();
  await db.collection('ai_memory_expirations').doc(memoryId).delete();
}

export async function forgetAllMemories(userId: string, characterId: string): Promise<number> {
  const snapshot = await db.collection('ai_memories')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .get();
  
  const batch = db.batch();
  
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  const expirationSnapshot = await db.collection('ai_memory_expirations')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .get();
  
  const expirationBatch = db.batch();
  
  expirationSnapshot.docs.forEach(doc => {
    expirationBatch.delete(doc.ref);
  });
  
  await expirationBatch.commit();
  
  return snapshot.size;
}

// ======================
// Memory Expiration
// ======================

export async function forgetOldAIMemories(): Promise<{ expired: number; processed: number }> {
  const now = Timestamp.now();
  
  const expiredMemories = await db.collection('ai_memory_expirations')
    .where('scheduledFor', '<=', now)
    .where('processed', '==', false)
    .limit(500)
    .get();
  
  const batch = db.batch();
  let expired = 0;
  
  for (const doc of expiredMemories.docs) {
    const expiration = doc.data();
    
    const memoryRef = db.collection('ai_memories').doc(expiration.memoryId);
    const memoryDoc = await memoryRef.get();
    
    if (memoryDoc.exists) {
      batch.delete(memoryRef);
      expired++;
    }
    
    batch.update(doc.ref, {
      processed: true,
      processedAt: serverTimestamp()
    });
  }
  
  await batch.commit();
  
  return {
    expired,
    processed: expiredMemories.size
  };
}

// ======================
// Character Growth & Lore
// ======================

export async function generateLoreUpdate(
  characterId: string,
  eventType: GrowthEventType,
  title: string,
  description: string,
  metadata?: Record<string, any>
): Promise<GrowthEvent> {
  const forbiddenLoreTypes = ['trauma', 'breakup', 'jealousy', 'despair', 'missing_user'];
  
  if (forbiddenLoreTypes.some(forbidden => description.toLowerCase().includes(forbidden))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Lore update contains forbidden emotional manipulation content'
    );
  }
  
  const eventId = generateId();
  const timestamp = Timestamp.now();
  
  const growthEvent: GrowthEvent = {
    eventId,
    characterId,
    eventType,
    title,
    description,
    timestamp,
    isSafe: true,
    metadata
  };
  
  await db.collection('ai_growth_events').doc(eventId).set(growthEvent);
  
  const updateId = generateId();
  await db.collection('ai_lore_updates').doc(updateId).set({
    updateId,
    characterId,
    eventType,
    title,
    description,
    season: getCurrentSeason(),
    releasedAt: timestamp,
    isSafe: true,
    updateType: eventType,
    metadata
  });
  
  await db.collection('ai_growth_metrics').doc(generateId()).set({
    characterId,
    metricType: 'lore_update',
    eventType,
    date: timestamp,
    value: 1
  });
  
  return growthEvent;
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

export async function getCharacterGrowthEvents(
  characterId: string,
  limit: number = 10
): Promise<GrowthEvent[]> {
  const snapshot = await db.collection('ai_growth_events')
    .where('characterId', '==', characterId)
    .where('isSafe', '==', true)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as GrowthEvent);
}

// ======================
// Dependency Detection
// ======================

export async function detectDependencyRisk(
  userId: string,
  characterId: string
): Promise<DependencySignal | null> {
  const signals: string[] = [];
  let riskLevel = DependencyRiskLevel.NONE;
  
  const interactionSnapshot = await db.collection('ai_memories')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .get();
  
  const totalMemories = interactionSnapshot.size;
  
  if (totalMemories > 50) {
    signals.push('excessive_memory_count');
    riskLevel = DependencyRiskLevel.LOW;
  }
  
  const recentMemories = interactionSnapshot.docs.filter(doc => {
    const memory = doc.data() as AIMemory;
    const daysSinceCreation = (Date.now() - memory.createdAt.toMillis()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation <= 7;
  });
  
  if (recentMemories.length > 20) {
    signals.push('rapid_memory_accumulation');
    riskLevel = DependencyRiskLevel.MEDIUM;
  }
  
  const highAccessMemories = interactionSnapshot.docs.filter(doc => {
    const memory = doc.data() as AIMemory;
    return memory.accessCount > 10;
  });
  
  if (highAccessMemories.length > 10) {
    signals.push('repetitive_memory_access');
    if (riskLevel === DependencyRiskLevel.NONE) riskLevel = DependencyRiskLevel.LOW;
  }
  
  const existingSignals = await db.collection('ai_dependency_signals')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .where('resolved', '==', false)
    .get();
  
  if (existingSignals.size > 3) {
    signals.push('recurring_dependency_patterns');
    riskLevel = DependencyRiskLevel.HIGH;
  }
  
  if (riskLevel !== DependencyRiskLevel.NONE) {
    const signalId = generateId();
    const signal: DependencySignal = {
      signalId,
      userId,
      characterId,
      riskLevel,
      indicators: signals,
      detectedAt: Timestamp.now(),
      resolved: false
    };
    
    await db.collection('ai_dependency_signals').doc(signalId).set(signal);
    
    if (riskLevel === DependencyRiskLevel.MEDIUM || riskLevel === DependencyRiskLevel.HIGH) {
      await applyStabilityTone(userId, characterId, `Dependency risk detected: ${riskLevel}`);
    }
    
    return signal;
  }
  
  return null;
}

// ======================
// Dual-State Safety Mode
// ======================

export async function applyStabilityTone(
  userId: string,
  characterId: string,
  reason: string
): Promise<StabilitySession> {
  const existingSession = await db.collection('ai_stability_sessions')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .where('active', '==', true)
    .limit(1)
    .get();
  
  if (!existingSession.empty) {
    return existingSession.docs[0].data() as StabilitySession;
  }
  
  const sessionId = generateId();
  const session: StabilitySession = {
    sessionId,
    userId,
    characterId,
    startedAt: Timestamp.now(),
    active: true,
    reason,
    stabilityActions: [
      'balanced_topics',
      'no_possessive_language',
      'autonomy_reminders',
      'break_suggestions'
    ]
  };
  
  await db.collection('ai_stability_sessions').doc(sessionId).set(session);
  
  return session;
}

export async function endStabilitySession(sessionId: string): Promise<void> {
  await db.collection('ai_stability_sessions').doc(sessionId).update({
    active: false,
    endedAt: serverTimestamp()
  });
}

export async function getActiveStabilitySession(
  userId: string,
  characterId: string
): Promise<StabilitySession | null> {
  const snapshot = await db.collection('ai_stability_sessions')
    .where('userId', '==', userId)
    .where('characterId', '==', characterId)
    .where('active', '==', true)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as StabilitySession;
}

// ======================
// User Preferences
// ======================

export async function setMemoryPermissions(
  userId: string,
  characterId: string,
  memoryTypes: MemoryCategory[]
): Promise<void> {
  const permissionId = `${userId}_${characterId}`;
  
  await db.collection('ai_memory_permissions').doc(permissionId).set({
    permissionId,
    userId,
    characterId,
    memoryTypes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getMemoryPermissions(
  userId: string,
  characterId: string
): Promise<MemoryCategory[]> {
  const permissionId = `${userId}_${characterId}`;
  const doc = await db.collection('ai_memory_permissions').doc(permissionId).get();
  
  if (!doc.exists) {
    return [];
  }
  
  return doc.data()?.memoryTypes || [];
}

// ======================
// Growth Metrics (Non-Monetization)
// ======================

export async function recordGrowthMetric(
  characterId: string,
  metricType: string,
  value: number
): Promise<void> {
  const metricId = generateId();
  
  await db.collection('ai_growth_metrics').doc(metricId).set({
    metricId,
    characterId,
    metricType,
    value,
    date: Timestamp.now()
  });
}

export async function getCharacterGrowthMetrics(
  characterId: string,
  metricType?: string
): Promise<any[]> {
  let query = db.collection('ai_growth_metrics')
    .where('characterId', '==', characterId);
  
  if (metricType) {
    query = query.where('metricType', '==', metricType);
  }
  
  const snapshot = await query.orderBy('date', 'desc').limit(100).get();
  
  return snapshot.docs.map(doc => doc.data());
}