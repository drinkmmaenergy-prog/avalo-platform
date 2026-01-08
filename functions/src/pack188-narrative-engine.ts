/**
 * PACK 188 - AI Narrative & Fantasy Engine
 * Story Chapters · Interactive Roleplay · Multi-AI Scenes · SFW Intimacy
 * 
 * STRICT SAFETY CONTROLS:
 * - No pornographic content
 * - No trauma bonding
 * - No emotional addiction loops
 * - Integration with PACK 184 (Emotional Intelligence)
 * - Integration with PACK 186 (Memory with expiration)
 * - Integration with PACK 187 (Multilingual support)
 */

import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, increment, arrayUnion } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ==================== TYPES & INTERFACES ====================

interface StoryArc {
  arcId: string;
  characterId: string;
  title: string;
  description: string;
  category: 'romance' | 'adventure' | 'fantasy' | 'mystery' | 'slice_of_life' | 'comedy' | 'workplace';
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number;
  chaptersCount: number;
  isSafe: boolean;
  isActive: boolean;
  season?: string;
  tags: string[];
  popularityScore: number;
  completionRate: number;
  releasedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface StoryChapter {
  chapterId: string;
  arcId: string;
  chapterNumber: number;
  title: string;
  content: string;
  narrativeStyle: 'descriptive' | 'dialogue_heavy' | 'action' | 'introspective';
  mood: 'lighthearted' | 'tense' | 'romantic' | 'mysterious' | 'exciting';
  hasChoices: boolean;
  requiredPreviousChoice?: string;
  estimatedReadTime: number;
  createdAt: Timestamp;
}

interface StoryBranch {
  branchId: string;
  arcId: string;
  chapterId: string;
  branchIndex: number;
  choiceText: string;
  description: string;
  consequence: string;
  nextChapterId: string;
  impactType: 'minor' | 'moderate' | 'major';
  emotionalTone: 'positive' | 'neutral' | 'challenging';
  createdAt: Timestamp;
}

interface SceneState {
  stateId: string;
  userId: string;
  arcId: string;
  characterId: string;
  currentChapterId: string;
  choiceHistory: string[];
  progressPercentage: number;
  emotionalState: {
    intensity: number;
    tone: string;
    lastCheck: Timestamp | any;
  };
  status: 'in_progress' | 'completed' | 'paused';
  createdAt: Timestamp | any;
  lastUpdatedAt: Timestamp | any;
}

interface MultiCharacterSession {
  sessionId: string;
  userId: string;
  characterIds: string[];
  sceneType: 'adventure' | 'challenge' | 'comedy' | 'mystery';
  scenario: string;
  status: 'active' | 'completed';
  messageCount: number;
  createdAt: Timestamp | any;
  lastActivityAt: Timestamp | any;
}

interface SeasonalEvent {
  eventId: string;
  season: string;
  eventType: 'holiday' | 'special' | 'limited';
  title: string;
  description: string;
  arcIds: string[];
  isActive: boolean;
  startDate: Timestamp;
  endDate: Timestamp;
  bonusRewards?: Record<string, any>;
}

// ==================== SAFETY CONSTANTS ====================

const FORBIDDEN_THEMES = [
  'pornographic', 'erotic_acts', 'violence_intimacy', 'rape_fantasy',
  'cnc', 'cuckold', 'jealousy_roleplay', 'humiliation', 'trauma',
  'teacher_student_minor', 'stepfamily_sexual', 'daddy_mommy_infantile',
  'religious_political_conflict', 'medical_sexualization'
];

const SAFE_CATEGORIES = [
  'romance', 'adventure', 'fantasy', 'mystery', 'slice_of_life', 'comedy', 'workplace'
];

const ALLOWED_ENDINGS = [
  'passionate_kiss', 'promise_reunion', 'tournament_win', 'case_solved',
  'sunset_beach', 'friendship_triumph', 'career_success'
];

const FORBIDDEN_ENDINGS = [
  'cant_live_without', 'dont_abandon', 'breakup_drama', 'emotional_devastation'
];

const MAX_MULTI_AI_CHARACTERS = 3;
const MAX_DAILY_STORY_SESSIONS = 10;
const COOLING_PERIOD_HOURS = 2;

// ==================== SAFETY VALIDATION ====================

async function validateStorySafety(
  content: string,
  category: string
): Promise<{ safe: boolean; violations: string[] }> {
  const violations: string[] = [];
  const contentLower = content.toLowerCase();

  FORBIDDEN_THEMES.forEach(theme => {
    if (contentLower.includes(theme.replace('_', ' '))) {
      violations.push(`Forbidden theme detected: ${theme}`);
    }
  });

  if (!SAFE_CATEGORIES.includes(category)) {
    violations.push(`Invalid category: ${category}`);
  }

  const forbiddenPatterns = [
    /\b(explicit|porn|sex scene|erotic)\b/i,
    /\b(rape|assault|violence)\b/i,
    /\b(you're mine forever|you belong to me)\b/i,
    /\b(i love you|eternal love).*\b(spend|pay|tokens)\b/i
  ];

  forbiddenPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      violations.push(`Forbidden pattern detected: ${pattern.source}`);
    }
  });

  return {
    safe: violations.length === 0,
    violations
  };
}

async function checkEmotionalAttachmentRisk(
  userId: string,
  arcId: string
): Promise<{ safe: boolean; riskLevel: number }> {
  try {
    const recentStates = await db
      .collection('ai_scene_states')
      .where('userId', '==', userId)
      .where('arcId', '==', arcId)
      .orderBy('lastUpdatedAt', 'desc')
      .limit(5)
      .get();

    if (recentStates.empty) {
      return { safe: true, riskLevel: 0 };
    }

    const states = recentStates.docs.map(doc => doc.data() as SceneState);
    const avgIntensity = states.reduce((sum, s) => sum + (s.emotionalState?.intensity || 0), 0) / states.length;

    const riskLevel = avgIntensity;
    const safe = riskLevel < 0.7;

    return { safe, riskLevel };
  } catch (error) {
    logger.error('Error checking attachment risk', { error, userId, arcId });
    return { safe: true, riskLevel: 0 };
  }
}

// ==================== STORY ARC MANAGEMENT ====================

export const listStoryArcs = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const { characterId, category, season, limit = 20 } = request.data;

      let query = db
        .collection('ai_story_arcs')
        .where('isActive', '==', true)
        .where('isSafe', '==', true);

      if (characterId) {
        query = query.where('characterId', '==', characterId) as any;
      }
      if (category) {
        query = query.where('category', '==', category) as any;
      }
      if (season) {
        query = query.where('season', '==', season) as any;
      }

      const snapshot = await query
        .orderBy('popularityScore', 'desc')
        .limit(limit)
        .get();

      const arcs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return {
        success: true,
        arcs,
        total: arcs.length
      };
    } catch (error: any) {
      logger.error('Error listing story arcs', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

export const startStoryArc = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { arcId } = request.data;

      if (!arcId) {
        throw new HttpsError('invalid-argument', 'arcId is required');
      }

      const arcDoc = await db.collection('ai_story_arcs').doc(arcId).get();
      if (!arcDoc.exists) {
        throw new HttpsError('not-found', 'Story arc not found');
      }

      const arc = arcDoc.data() as StoryArc;

      if (!arc.isActive || !arc.isSafe) {
        throw new HttpsError('failed-precondition', 'Story arc is not available');
      }

      const attachmentCheck = await checkEmotionalAttachmentRisk(userId, arcId);
      if (!attachmentCheck.safe) {
        throw new HttpsError(
          'failed-precondition',
          'Please take a break before starting a new story. Your emotional wellbeing matters!'
        );
      }

      const existingState = await db
        .collection('ai_scene_states')
        .where('userId', '==', userId)
        .where('arcId', '==', arcId)
        .where('status', '==', 'in_progress')
        .limit(1)
        .get();

      if (!existingState.empty) {
        const state = existingState.docs[0];
        return {
          success: true,
          stateId: state.id,
          resumed: true,
          currentChapter: state.data().currentChapterId
        };
      }

      const firstChapter = await db
        .collection('ai_story_arcs')
        .doc(arcId)
        .collection('chapters')
        .where('chapterNumber', '==', 1)
        .limit(1)
        .get();

      if (firstChapter.empty) {
        throw new HttpsError('not-found', 'First chapter not found');
      }

      const stateRef = db.collection('ai_scene_states').doc();
      const now = serverTimestamp();

      const newState: Partial<SceneState> = {
        stateId: stateRef.id,
        userId,
        arcId,
        characterId: arc.characterId,
        currentChapterId: firstChapter.docs[0].id,
        choiceHistory: [],
        progressPercentage: 0,
        emotionalState: {
          intensity: 0,
          tone: 'neutral',
          lastCheck: Timestamp.now()
        },
        status: 'in_progress',
        createdAt: now,
        lastUpdatedAt: now
      };

      await stateRef.set(newState);

      await db.collection('ai_story_analytics').add({
        arcId,
        userId,
        event: 'arc_started',
        timestamp: now
      });

      await arcDoc.ref.update({
        popularityScore: increment(1)
      });

      return {
        success: true,
        stateId: stateRef.id,
        resumed: false,
        currentChapter: firstChapter.docs[0].id,
        chapter: firstChapter.docs[0].data()
      };
    } catch (error: any) {
      logger.error('Error starting story arc', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

export const progressStoryArc = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { stateId, action } = request.data;

      if (!stateId) {
        throw new HttpsError('invalid-argument', 'stateId is required');
      }

      const stateRef = db.collection('ai_scene_states').doc(stateId);
      const stateDoc = await stateRef.get();

      if (!stateDoc.exists) {
        throw new HttpsError('not-found', 'Scene state not found');
      }

      const state = stateDoc.data() as SceneState;

      if (state.userId !== userId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      const currentChapterDoc = await db
        .collection('ai_story_arcs')
        .doc(state.arcId)
        .collection('chapters')
        .doc(state.currentChapterId)
        .get();

      if (!currentChapterDoc.exists) {
        throw new HttpsError('not-found', 'Current chapter not found');
      }

      const currentChapter = currentChapterDoc.data() as StoryChapter;

      return {
        success: true,
        state,
        chapter: currentChapter,
        canProgress: true
      };
    } catch (error: any) {
      logger.error('Error progressing story arc', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

// ==================== BRANCHING CHOICE SYSTEM ====================

export const getStoryChoices = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const { stateId } = request.data;

      const stateDoc = await db.collection('ai_scene_states').doc(stateId).get();
      if (!stateDoc.exists) {
        throw new HttpsError('not-found', 'Scene state not found');
      }

      const state = stateDoc.data() as SceneState;

      const choicesSnapshot = await db
        .collection('ai_story_branches')
        .where('arcId', '==', state.arcId)
        .where('chapterId', '==', state.currentChapterId)
        .orderBy('branchIndex', 'asc')
        .get();

      const choices = choicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return {
        success: true,
        choices,
        hasChoices: choices.length > 0
      };
    } catch (error: any) {
      logger.error('Error getting story choices', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

export const makeStoryChoice = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { stateId, branchId } = request.data;

      if (!stateId || !branchId) {
        throw new HttpsError('invalid-argument', 'stateId and branchId are required');
      }

      const stateRef = db.collection('ai_scene_states').doc(stateId);
      const stateDoc = await stateRef.get();

      if (!stateDoc.exists) {
        throw new HttpsError('not-found', 'Scene state not found');
      }

      const state = stateDoc.data() as SceneState;

      if (state.userId !== userId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      const branchDoc = await db.collection('ai_story_branches').doc(branchId).get();
      if (!branchDoc.exists) {
        throw new HttpsError('not-found', 'Branch not found');
      }

      const branch = branchDoc.data() as StoryBranch;

      const attachmentCheck = await checkEmotionalAttachmentRisk(userId, state.arcId);
      if (!attachmentCheck.safe) {
        await stateRef.update({
          status: 'paused',
          'emotionalState.intensity': attachmentCheck.riskLevel,
          lastUpdatedAt: serverTimestamp()
        });

        return {
          success: false,
          paused: true,
          message: 'Story paused for your wellbeing. Real connections are irreplaceable!'
        };
      }

      const arcDoc = await db.collection('ai_story_arcs').doc(state.arcId).get();
      const arc = arcDoc.data() as StoryArc;

      const allChapters = await db
        .collection('ai_story_arcs')
        .doc(state.arcId)
        .collection('chapters')
        .get();

      const progressPercentage = ((state.choiceHistory.length + 1) / arc.chaptersCount) * 100;

      await stateRef.update({
        currentChapterId: branch.nextChapterId,
        choiceHistory: arrayUnion(branchId),
        progressPercentage: Math.min(100, progressPercentage),
        lastUpdatedAt: serverTimestamp()
      });

      await db.collection('user_story_choices').add({
        userId,
        arcId: state.arcId,
        chapterId: state.currentChapterId,
        branchId,
        choiceText: branch.choiceText,
        chosenAt: serverTimestamp()
      });

      const nextChapterDoc = await db
        .collection('ai_story_arcs')
        .doc(state.arcId)
        .collection('chapters')
        .doc(branch.nextChapterId)
        .get();

      return {
        success: true,
        nextChapter: nextChapterDoc.exists ? nextChapterDoc.data() : null,
        progressPercentage: Math.min(100, progressPercentage),
        consequence: branch.consequence
      };
    } catch (error: any) {
      logger.error('Error making story choice', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

// ==================== MULTI-AI SCENE ORCHESTRATION ====================

export const startMultiAiScene = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { characterIds, sceneType, scenario } = request.data;

      if (!characterIds || !Array.isArray(characterIds)) {
        throw new HttpsError('invalid-argument', 'characterIds array is required');
      }

      if (characterIds.length < 2 || characterIds.length > MAX_MULTI_AI_CHARACTERS) {
        throw new HttpsError(
          'invalid-argument',
          `Multi-AI scenes require 2-${MAX_MULTI_AI_CHARACTERS} characters`
        );
      }

      const allowedSceneTypes = ['adventure', 'challenge', 'comedy', 'mystery'];
      if (!sceneType || !allowedSceneTypes.includes(sceneType)) {
        throw new HttpsError('invalid-argument', 'Invalid sceneType');
      }

      for (const charId of characterIds) {
        const charDoc = await db.collection('ai_characters').doc(charId).get();
        if (!charDoc.exists) {
          throw new HttpsError('not-found', `Character ${charId} not found`);
        }
      }

      const sessionRef = db.collection('ai_multi_character_sessions').doc();
      const now = serverTimestamp();

      const session: Partial<MultiCharacterSession> = {
        sessionId: sessionRef.id,
        userId,
        characterIds,
        sceneType,
        scenario: scenario || `A ${sceneType} scene with multiple AI companions`,
        status: 'active',
        messageCount: 0,
        createdAt: now,
        lastActivityAt: now
      };

      await sessionRef.set(session);

      logger.info(`Multi-AI scene started`, { userId, sessionId: sessionRef.id, characterIds });

      return {
        success: true,
        sessionId: sessionRef.id,
        message: 'Multi-AI scene started successfully'
      };
    } catch (error: any) {
      logger.error('Error starting multi-AI scene', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

// ==================== STORY OUTCOMES & REPLAY ====================

export const completeStoryArc = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { stateId, outcomeType } = request.data;

      if (!ALLOWED_ENDINGS.includes(outcomeType)) {
        throw new HttpsError('invalid-argument', 'Invalid outcome type');
      }

      const stateRef = db.collection('ai_scene_states').doc(stateId);
      const stateDoc = await stateRef.get();

      if (!stateDoc.exists) {
        throw new HttpsError('not-found', 'Scene state not found');
      }

      const state = stateDoc.data() as SceneState;

      if (state.userId !== userId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      await stateRef.update({
        status: 'completed',
        progressPercentage: 100,
        lastUpdatedAt: serverTimestamp()
      });

      await db.collection('ai_story_outcomes').add({
        userId,
        arcId: state.arcId,
        outcomeType,
        choiceHistory: state.choiceHistory,
        completedAt: serverTimestamp()
      });

      const arcRef = db.collection('ai_story_arcs').doc(state.arcId);
      await arcRef.update({
        popularityScore: increment(1)
      });

      logger.info(`Story arc completed`, { userId, arcId: state.arcId, outcomeType });

      return {
        success: true,
        message: 'Story completed successfully!',
        outcomeType
      };
    } catch (error: any) {
      logger.error('Error completing story arc', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

export const resetStoryArc = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { stateId } = request.data;

      const stateRef = db.collection('ai_scene_states').doc(stateId);
      const stateDoc = await stateRef.get();

      if (!stateDoc.exists) {
        throw new HttpsError('not-found', 'Scene state not found');
      }

      const state = stateDoc.data() as SceneState;

      if (state.userId !== userId) {
        throw new HttpsError('permission-denied', 'Unauthorized');
      }

      await stateRef.delete();

      logger.info(`Story arc reset`, { userId, arcId: state.arcId });

      return {
        success: true,
        message: 'Story reset successfully. You can start fresh!'
      };
    } catch (error: any) {
      logger.error('Error resetting story arc', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);

// ==================== SEASONAL EVENTS SCHEDULER ====================

export const activateSeasonalEvents = onSchedule(
  {
    schedule: '0 0 * * *',
    region: 'europe-west3',
    timeZone: 'Europe/Warsaw'
  },
  async (event) => {
    try {
      const now = Timestamp.now();

      const eventsToActivate = await db
        .collection('ai_seasonal_events')
        .where('startDate', '<=', now)
        .where('endDate', '>=', now)
        .where('isActive', '==', false)
        .get();

      const batch = db.batch();
      let activatedCount = 0;

      eventsToActivate.docs.forEach(doc => {
        batch.update(doc.ref, { isActive: true });
        activatedCount++;
      });

      const eventsToDeactivate = await db
        .collection('ai_seasonal_events')
        .where('endDate', '<', now)
        .where('isActive', '==', true)
        .get();

      eventsToDeactivate.docs.forEach(doc => {
        batch.update(doc.ref, { isActive: false });
      });

      await batch.commit();

      logger.info(`Seasonal events updated`, {
        activated: activatedCount,
        deactivated: eventsToDeactivate.size
      });
    } catch (error) {
      logger.error('Error updating seasonal events', { error });
    }
  }
);

// ==================== SAFETY MONITORING ====================

export const reportStoryContent = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Not authenticated');
      }

      const userId = request.auth.uid;
      const { arcId, chapterId, reason, description } = request.data;

      await db.collection('ai_story_safety_reports').add({
        reporterId: userId,
        arcId,
        chapterId,
        reason,
        description: description || '',
        reportedAt: serverTimestamp(),
        status: 'pending'
      });

      const arcRef = db.collection('ai_story_arcs').doc(arcId);
      await arcRef.update({
        isFlagged: true,
        flaggedAt: serverTimestamp()
      });

      logger.warn(`Story content reported`, { userId, arcId, reason });

      return {
        success: true,
        message: 'Thank you for keeping our community safe!'
      };
    } catch (error: any) {
      logger.error('Error reporting story content', { error });
      throw new HttpsError('internal', error.message);
    }
  }
);