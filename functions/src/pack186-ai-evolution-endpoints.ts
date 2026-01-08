/**
 * PACK 186 - AI Evolution Engine API Endpoints
 * 
 * HTTP endpoints for AI memory management, growth tracking, and safety features.
 */

import * as functions from 'firebase-functions';
import {
  recordAIMemory,
  getAIMemories,
  forgetMemory,
  forgetAllMemories,
  generateLoreUpdate,
  getCharacterGrowthEvents,
  detectDependencyRisk,
  applyStabilityTone,
  endStabilitySession,
  getActiveStabilitySession,
  setMemoryPermissions,
  getMemoryPermissions,
  getCharacterGrowthMetrics,
  MemoryCategory,
  GrowthEventType
} from './pack186-ai-evolution';

// ======================
// Memory Management Endpoints
// ======================

export const createAIMemory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, category, content, context: memoryContext } = data;

  if (!characterId || !category || !content) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const memory = await recordAIMemory(
      context.auth.uid,
      characterId,
      category as MemoryCategory,
      content,
      memoryContext
    );

    return {
      success: true,
      memory: {
        memoryId: memory.memoryId,
        category: memory.category,
        createdAt: memory.createdAt,
        expiresAt: memory.expiresAt
      }
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const getUserAIMemories = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, category } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const memories = await getAIMemories(
      context.auth.uid,
      characterId,
      category as MemoryCategory | undefined
    );

    return {
      success: true,
      memories: memories.map(m => ({
        memoryId: m.memoryId,
        category: m.category,
        content: m.content,
        context: m.context,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
        accessCount: m.accessCount
      })),
      count: memories.length
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const deleteAIMemory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { memoryId } = data;

  if (!memoryId) {
    throw new functions.https.HttpsError('invalid-argument', 'memoryId is required');
  }

  try {
    await forgetMemory(context.auth.uid, memoryId);

    return {
      success: true,
      message: 'Memory deleted successfully'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const deleteAllAIMemories = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const deletedCount = await forgetAllMemories(context.auth.uid, characterId);

    return {
      success: true,
      deletedCount,
      message: `${deletedCount} memories deleted successfully`
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ======================
// Character Growth Endpoints
// ======================

export const createLoreUpdate = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { characterId, eventType, title, description, metadata } = data;

  if (!characterId || !eventType || !title || !description) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const growthEvent = await generateLoreUpdate(
      characterId,
      eventType as GrowthEventType,
      title,
      description,
      metadata
    );

    return {
      success: true,
      event: {
        eventId: growthEvent.eventId,
        eventType: growthEvent.eventType,
        title: growthEvent.title,
        timestamp: growthEvent.timestamp
      }
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const getCharacterGrowth = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, limit } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const events = await getCharacterGrowthEvents(characterId, limit || 10);

    return {
      success: true,
      events: events.map(e => ({
        eventId: e.eventId,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        timestamp: e.timestamp
      })),
      count: events.length
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const getGrowthMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { characterId, metricType } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const metrics = await getCharacterGrowthMetrics(characterId, metricType);

    return {
      success: true,
      metrics,
      count: metrics.length
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ======================
// Safety & Dependency Detection Endpoints
// ======================

export const checkDependencyRisk = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const signal = await detectDependencyRisk(context.auth.uid, characterId);

    if (signal) {
      return {
        success: true,
        risk: {
          riskLevel: signal.riskLevel,
          indicators: signal.indicators,
          detectedAt: signal.detectedAt
        },
        hasRisk: true
      };
    }

    return {
      success: true,
      hasRisk: false,
      message: 'No dependency risk detected'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const activateStabilityMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, reason } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const session = await applyStabilityTone(
      context.auth.uid,
      characterId,
      reason || 'User requested stability mode'
    );

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        stabilityActions: session.stabilityActions
      }
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const deactivateStabilityMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
  }

  try {
    await endStabilitySession(sessionId);

    return {
      success: true,
      message: 'Stability mode deactivated'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const getStabilityStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const session = await getActiveStabilitySession(context.auth.uid, characterId);

    if (session) {
      return {
        success: true,
        active: true,
        session: {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          reason: session.reason,
          stabilityActions: session.stabilityActions
        }
      };
    }

    return {
      success: true,
      active: false,
      message: 'No active stability session'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ======================
// Memory Permission Endpoints
// ======================

export const updateMemoryPermissions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, memoryTypes } = data;

  if (!characterId || !Array.isArray(memoryTypes)) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId and memoryTypes are required');
  }

  try {
    await setMemoryPermissions(context.auth.uid, characterId, memoryTypes);

    return {
      success: true,
      message: 'Memory permissions updated successfully'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const getMemoryPermissionsStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'characterId is required');
  }

  try {
    const permissions = await getMemoryPermissions(context.auth.uid, characterId);

    return {
      success: true,
      memoryTypes: permissions,
      count: permissions.length
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});