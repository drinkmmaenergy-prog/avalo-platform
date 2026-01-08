/**
 * Phase 16C: Questions Module - Business Logic Engine
 * 
 * IMPORTANT: This module is ADDITIVE ONLY.
 * It does NOT modify existing monetization, chat, call, or payout logic.
 * 
 * Implements simple, high-conversion Q&A monetization:
 * - Ask anonymously: 15 tokens
 * - Unlock answer: 20 tokens per answer
 * - Boost question: 10 tokens
 */

import { db, serverTimestamp, increment, generateId } from './init';
import type {
  Question,
  Answer,
  AnswerUnlock,
  QuestionBoost,
  CreateQuestionInput,
  CreateAnswerInput,
  UnlockAnswerInput,
  BoostQuestionInput,
  GetFeedFilters,
  QuestionPublicInfo,
  AnswerPublicInfo,
  QuestionDetailResponse,
  QuestionsFeedResponse,
  CreateQuestionResponse,
  CreateAnswerResponse,
  UnlockAnswerResponse,
  BoostQuestionResponse,
} from './types/questions';

// Import existing engines for integration
import { recordRankingAction } from './rankingEngine';
import { recordRiskEvent } from './trustEngine';

// ============================================================================
// CONSTANTS - PRICING & SPLITS
// ============================================================================

export const QUESTIONS_CONFIG = {
  // Pricing
  ANONYMOUS_QUESTION_COST: 15,
  ANSWER_UNLOCK_COST: 20,
  BOOST_COST: 10,
  
  // Revenue splits
  TARGETED_ANONYMOUS_SPLIT: {
    EARNER_PERCENTAGE: 70,
    AVALO_PERCENTAGE: 30,
  },
  ANSWER_UNLOCK_SPLIT: {
    EARNER_PERCENTAGE: 70,
    AVALO_PERCENTAGE: 30,
  },
  BOOST_SPLIT: {
    AVALO_PERCENTAGE: 100,
  },
  
  // Validation
  MAX_QUESTION_LENGTH: 500,
  MAX_ANSWER_LENGTH: 2000,
  MAX_TAGS: 5,
  BOOST_SCORE_INCREMENT: 10,
  
  // Snippet preview for locked answers
  SNIPPET_LENGTH: 100,
  
  // Ranking integration
  RANKING_POINTS_PER_TOKEN: 1,
};

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  error: (..._args: any[]) => {},
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
};

// ============================================================================
// CREATE QUESTION
// ============================================================================

/**
 * Create a new question (free or anonymous/paid)
 */
export async function createQuestion(
  userId: string,
  data: CreateQuestionInput
): Promise<CreateQuestionResponse> {
  // Phase 30A: TrustShield 2.0 - Content Moderation
  try {
    const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
    const moderationResult = await moderateText({
      userId,
      text: data.text,
      source: 'question',
    });
    
    // If content should be blocked, reject immediately
    if (moderationResult.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({
        userId,
        text: data.text,
        source: 'question',
      }, moderationResult);
      
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    // If should log (but allow), log the incident
    if (moderationResult.actions.includes('ALLOW_AND_LOG') ||
        moderationResult.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({
        userId,
        text: data.text,
        source: 'question',
      }, moderationResult).catch(err => logger.error('Failed to log moderation incident:', err));
    }
  } catch (error: any) {
    // If it's our policy error, re-throw it
    if (error.name === 'HttpsError' && error.message === 'CONTENT_BLOCKED_POLICY_VIOLATION') {
      throw error;
    }
    // Otherwise, non-blocking - if moderation check fails, allow question
    logger.error('Content moderation check failed:', error);
  }
  
  // Phase 22: CSAM Shield - Check question text for CSAM risk
  try {
    const { evaluateTextForCsamRisk, createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield.js');
    const csamCheck = evaluateTextForCsamRisk(data.text, 'en');
    
    if (csamCheck.isFlagged && (csamCheck.riskLevel === 'HIGH' || csamCheck.riskLevel === 'CRITICAL')) {
      // Create incident
      const incidentId = await createCsamIncident({
        userId,
        source: 'questions',
        detectionChannel: 'auto_text',
        riskLevel: csamCheck.riskLevel,
        contentSnippet: data.text.substring(0, 100),
      });
      
      // Apply protective actions
      await applyImmediateProtectiveActions(userId, csamCheck.riskLevel, incidentId);
      
      // Reject question
      throw new HttpsError('failed-precondition', 'Question rejected for safety reasons. Your account is under review.');
    }
  } catch (error: any) {
    // If it's our CSAM error, re-throw it
    if (error.name === 'HttpsError') {
      throw error;
    }
    // Otherwise, non-blocking - if CSAM check fails, allow question
  }
  
  // Validate user exists and is active
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  
  const userData = userSnap.data();
  if (userData?.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'Account must be active');
  }
  
  // Validate input
  validateQuestionInput(data);
  
  // Check if target user exists (if specified)
  let targetUserCanEarn = false;
  if (data.targetUserId) {
    const targetUserSnap = await db.collection('users').doc(data.targetUserId).get();
    if (!targetUserSnap.exists) {
      throw new HttpsError('not-found', 'Target user not found');
    }
    const targetData = targetUserSnap.data();
    targetUserCanEarn = targetData?.earnOnChat || targetData?.modes?.earnFromChat || false;
  }
  
  let tokensCharged = 0;
  
  // Handle anonymous question payment
  if (data.isAnonymous) {
    tokensCharged = QUESTIONS_CONFIG.ANONYMOUS_QUESTION_COST;
    
    // Check user balance
    const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
    const walletSnap = await walletRef.get();
    
    if (!walletSnap.exists) {
      throw new HttpsError('failed-precondition', 'Wallet not found');
    }
    
    const balance = walletSnap.data()?.balance || 0;
    if (balance < tokensCharged) {
      throw new HttpsError('failed-precondition', 'Insufficient tokens');
    }
    
    // Process payment
    await processAnonymousQuestionPayment(
      userId,
      tokensCharged,
      data.targetUserId,
      targetUserCanEarn
    );
  }
  
  // Create question
  const questionId = generateId();
  const now = new Date();
  
  const question: Question = {
    id: questionId,
    authorId: data.isAnonymous ? 'anonymous' : userId,
    targetUserId: data.targetUserId || null,
    text: data.text.trim(),
    isAnonymous: data.isAnonymous || false,
    isNSFW: data.isNSFW || false,
    tags: (data.tags || []).map(t => t.toLowerCase().trim()),
    createdAt: now,
    updatedAt: now,
    boostScore: 0,
    answerCount: 0,
    unlockCount: 0,
    visibilityStatus: 'active',
  };
  
  await db.collection('questions').doc(questionId).set({
    ...question,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Record ranking action for target creator (if applicable)
  if (data.isAnonymous && data.targetUserId && targetUserCanEarn) {
    const earnedTokens = Math.floor(tokensCharged * (QUESTIONS_CONFIG.TARGETED_ANONYMOUS_SPLIT.EARNER_PERCENTAGE / 100));
    recordRankingAction({
      type: 'content_purchase',
      creatorId: data.targetUserId,
      payerId: userId,
      tokensAmount: earnedTokens,
      points: earnedTokens * QUESTIONS_CONFIG.RANKING_POINTS_PER_TOKEN,
      timestamp: now,
    }).catch(err => logger.error('Error recording ranking action:', err));
  }
  
  return {
    questionId,
    tokensCharged,
  };
}

/**
 * Validate question input
 */
function validateQuestionInput(data: CreateQuestionInput): void {
  if (!data.text || data.text.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Question text is required');
  }
  
  if (data.text.length > QUESTIONS_CONFIG.MAX_QUESTION_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Question must be ${QUESTIONS_CONFIG.MAX_QUESTION_LENGTH} characters or less`
    );
  }
  
  if (data.tags && data.tags.length > QUESTIONS_CONFIG.MAX_TAGS) {
    throw new HttpsError(
      'invalid-argument',
      `Maximum ${QUESTIONS_CONFIG.MAX_TAGS} tags allowed`
    );
  }
}

/**
 * Process anonymous question payment
 */
async function processAnonymousQuestionPayment(
  payerId: string,
  tokensCharged: number,
  targetUserId: string | null | undefined,
  targetCanEarn: boolean
): Promise<void> {
  const walletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
  
  // Calculate split
  let earnerTokens = 0;
  let avaloTokens = tokensCharged;
  
  if (targetUserId && targetCanEarn) {
    earnerTokens = Math.floor(tokensCharged * (QUESTIONS_CONFIG.TARGETED_ANONYMOUS_SPLIT.EARNER_PERCENTAGE / 100));
    avaloTokens = tokensCharged - earnerTokens;
  }
  
  // Execute transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from payer
    transaction.update(walletRef, {
      balance: increment(-tokensCharged),
      spent: increment(tokensCharged),
    });
    
    // Credit earner if applicable
    if (earnerTokens > 0 && targetUserId) {
      const earnerWalletRef = db.collection('users').doc(targetUserId).collection('wallet').doc('current');
      transaction.update(earnerWalletRef, {
        balance: increment(earnerTokens),
        earned: increment(earnerTokens),
      });
    }
  });
  
  // Record transaction
  await db.collection('transactions').add({
    type: 'question_anonymous',
    payerId,
    earnerId: targetUserId || null,
    tokensAmount: tokensCharged,
    earnerAmount: earnerTokens,
    avaloAmount: avaloTokens,
    createdAt: serverTimestamp(),
  });
}

// ============================================================================
// CREATE ANSWER
// ============================================================================

/**
 * Create an answer to a question
 */
export async function createAnswer(
  userId: string,
  data: CreateAnswerInput
): Promise<CreateAnswerResponse> {
  // Phase 30A: TrustShield 2.0 - Content Moderation
  try {
    const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
    const moderationResult = await moderateText({
      userId,
      text: data.text,
      source: 'answer',
    });
    
    // If content should be blocked, reject immediately
    if (moderationResult.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({
        userId,
        text: data.text,
        source: 'answer',
      }, moderationResult);
      
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    // If should log (but allow), log the incident
    if (moderationResult.actions.includes('ALLOW_AND_LOG') ||
        moderationResult.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({
        userId,
        text: data.text,
        source: 'answer',
      }, moderationResult).catch(err => logger.error('Failed to log moderation incident:', err));
    }
  } catch (error: any) {
    // If it's our policy error, re-throw it
    if (error.name === 'HttpsError' && error.message === 'CONTENT_BLOCKED_POLICY_VIOLATION') {
      throw error;
    }
    // Otherwise, non-blocking - if moderation check fails, allow answer
    logger.error('Content moderation check failed:', error);
  }
  
  // Phase 22: CSAM Shield - Check answer text for CSAM risk
  try {
    const { evaluateTextForCsamRisk, createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield.js');
    const csamCheck = evaluateTextForCsamRisk(data.text, 'en');
    
    if (csamCheck.isFlagged && (csamCheck.riskLevel === 'HIGH' || csamCheck.riskLevel === 'CRITICAL')) {
      // Create incident
      const incidentId = await createCsamIncident({
        userId,
        source: 'questions',
        detectionChannel: 'auto_text',
        riskLevel: csamCheck.riskLevel,
        contentSnippet: data.text.substring(0, 100),
      });
      
      // Apply protective actions
      await applyImmediateProtectiveActions(userId, csamCheck.riskLevel, incidentId);
      
      // Reject answer
      throw new HttpsError('failed-precondition', 'Answer rejected for safety reasons. Your account is under review.');
    }
  } catch (error: any) {
    // If it's our CSAM error, re-throw it
    if (error.name === 'HttpsError') {
      throw error;
    }
    // Otherwise, non-blocking - if CSAM check fails, allow answer
  }
  
  // Validate user
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  
  const userData = userSnap.data();
  if (userData?.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'Account must be active');
  }
  
  // Validate answer text
  if (!data.text || data.text.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Answer text is required');
  }
  
  if (data.text.length > QUESTIONS_CONFIG.MAX_ANSWER_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Answer must be ${QUESTIONS_CONFIG.MAX_ANSWER_LENGTH} characters or less`
    );
  }
  
  // Validate question exists
  const questionSnap = await db.collection('questions').doc(data.questionId).get();
  if (!questionSnap.exists) {
    throw new HttpsError('not-found', 'Question not found');
  }
  
  const question = questionSnap.data() as Question;
  if (question.visibilityStatus !== 'active') {
    throw new HttpsError('failed-precondition', 'Question is not active');
  }
  
  // Check if user can earn (for paid answers)
  const canEarn = userData?.earnOnChat || userData?.modes?.earnFromChat || false;
  const isPaid = data.isPaid !== false && canEarn; // Default to paid if user can earn
  
  // Create answer
  const answerId = generateId();
  const now = new Date();
  
  const answer: Answer = {
    id: answerId,
    questionId: data.questionId,
    authorId: userId,
    text: data.text.trim(),
    isPaid,
    isNSFW: data.isNSFW || false,
    createdAt: now,
    likesCount: 0,
    unlockCount: 0,
  };
  
  await db.collection('questionAnswers').doc(answerId).set({
    ...answer,
    createdAt: serverTimestamp(),
  });
  
  // Update question answer count
  await db.collection('questions').doc(data.questionId).update({
    answerCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  
  return {
    answerId,
  };
}

// ============================================================================
// UNLOCK ANSWER
// ============================================================================

/**
 * Unlock a paid answer
 */
export async function unlockAnswer(
  viewerId: string,
  data: UnlockAnswerInput
): Promise<UnlockAnswerResponse> {
  // Validate viewer
  const viewerSnap = await db.collection('users').doc(viewerId).get();
  if (!viewerSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  
  const viewerData = viewerSnap.data();
  if (viewerData?.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'Account must be active');
  }
  
  // Get answer
  const answerSnap = await db.collection('questionAnswers').doc(data.answerId).get();
  if (!answerSnap.exists) {
    throw new HttpsError('not-found', 'Answer not found');
  }
  
  const answer = answerSnap.data() as Answer;
  
  // Check if answer is paid
  if (!answer.isPaid) {
    // Free answer - no payment needed
    return {
      answerId: answer.id,
      answerText: answer.text,
      tokensCharged: 0,
    };
  }
  
  // Check 18+ gating
  if (answer.isNSFW && !viewerData?.age18Plus) {
    throw new HttpsError('permission-denied', 'Must be 18+ to view this content');
  }
  
  // Check if already unlocked
  const existingUnlockSnap = await db.collection('questionAnswerUnlocks')
    .where('answerId', '==', data.answerId)
    .where('viewerId', '==', viewerId)
    .limit(1)
    .get();
  
  if (!existingUnlockSnap.empty) {
    // Already unlocked - return answer
    return {
      answerId: answer.id,
      answerText: answer.text,
      tokensCharged: 0,
    };
  }
  
  // Process payment
  const tokensCharged = QUESTIONS_CONFIG.ANSWER_UNLOCK_COST;
  
  // Check balance
  const walletRef = db.collection('users').doc(viewerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  
  if (!walletSnap.exists) {
    throw new HttpsError('failed-precondition', 'Wallet not found');
  }
  
  const balance = walletSnap.data()?.balance || 0;
  if (balance < tokensCharged) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }
  
  // Calculate split
  const earnerTokens = Math.floor(tokensCharged * (QUESTIONS_CONFIG.ANSWER_UNLOCK_SPLIT.EARNER_PERCENTAGE / 100));
  const avaloTokens = tokensCharged - earnerTokens;
  
  // Execute transaction
  const unlockId = generateId();
  
  await db.runTransaction(async (transaction) => {
    // Deduct from viewer
    transaction.update(walletRef, {
      balance: increment(-tokensCharged),
      spent: increment(tokensCharged),
    });
    
    // Credit answer author
    const authorWalletRef = db.collection('users').doc(answer.authorId).collection('wallet').doc('current');
    transaction.update(authorWalletRef, {
      balance: increment(earnerTokens),
      earned: increment(earnerTokens),
    });
    
    // Create unlock record
    const unlock: AnswerUnlock = {
      id: unlockId,
      questionId: answer.questionId,
      answerId: answer.id,
      viewerId,
      tokensCharged,
      createdAt: new Date(),
    };
    
    transaction.set(db.collection('questionAnswerUnlocks').doc(unlockId), {
      ...unlock,
      createdAt: serverTimestamp(),
    });
    
    // Update answer unlock count
    transaction.update(db.collection('questionAnswers').doc(answer.id), {
      unlockCount: increment(1),
    });
    
    // Update question unlock count
    transaction.update(db.collection('questions').doc(answer.questionId), {
      unlockCount: increment(1),
    });
  });
  
  // Record transaction
  await db.collection('transactions').add({
    type: 'question_answer_unlock',
    payerId: viewerId,
    earnerId: answer.authorId,
    tokensAmount: tokensCharged,
    earnerAmount: earnerTokens,
    avaloAmount: avaloTokens,
    answerId: answer.id,
    questionId: answer.questionId,
    createdAt: serverTimestamp(),
  });
  
  // Record ranking action for answer author (async, non-blocking)
  recordRankingAction({
    type: 'content_purchase',
    creatorId: answer.authorId,
    payerId: viewerId,
    tokensAmount: earnerTokens,
    points: earnerTokens * QUESTIONS_CONFIG.RANKING_POINTS_PER_TOKEN,
    timestamp: new Date(),
  }).catch(err => logger.error('Error recording ranking action:', err));
  
  // Record trust event for potential abuse detection (async, non-blocking)
  recordRiskEvent({
    userId: viewerId,
    eventType: 'free_pool',
    metadata: {
      answerId: answer.id,
      earnerId: answer.authorId,
      totalTokens: tokensCharged,
    },
  }).catch(err => logger.error('Error recording risk event:', err));
  
  return {
    answerId: answer.id,
    answerText: answer.text,
    tokensCharged,
  };
}

// ============================================================================
// BOOST QUESTION
// ============================================================================

/**
 * Boost a question to increase visibility
 */
export async function boostQuestion(
  userId: string,
  data: BoostQuestionInput
): Promise<BoostQuestionResponse> {
  // Validate user
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  
  const userData = userSnap.data();
  if (userData?.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'Account must be active');
  }
  
  // Get question
  const questionSnap = await db.collection('questions').doc(data.questionId).get();
  if (!questionSnap.exists) {
    throw new HttpsError('not-found', 'Question not found');
  }
  
  const question = questionSnap.data() as Question;
  
  // Only author can boost their own question
  if (question.authorId !== userId && question.authorId !== 'anonymous') {
    throw new HttpsError('permission-denied', 'Only question author can boost');
  }
  
  // If anonymous, check if user is original author (would need to track this separately in production)
  // For simplicity, allow any user to boost anonymous questions in this implementation
  
  const tokensCharged = QUESTIONS_CONFIG.BOOST_COST;
  
  // Check balance
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  
  if (!walletSnap.exists) {
    throw new HttpsError('failed-precondition', 'Wallet not found');
  }
  
  const balance = walletSnap.data()?.balance || 0;
  if (balance < tokensCharged) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }
  
  // Execute transaction
  const boostId = generateId();
  let newBoostScore = question.boostScore;
  
  await db.runTransaction(async (transaction) => {
    // Deduct from user
    transaction.update(walletRef, {
      balance: increment(-tokensCharged),
      spent: increment(tokensCharged),
    });
    
    // Update question boost score
    newBoostScore += QUESTIONS_CONFIG.BOOST_SCORE_INCREMENT;
    transaction.update(db.collection('questions').doc(data.questionId), {
      boostScore: increment(QUESTIONS_CONFIG.BOOST_SCORE_INCREMENT),
      updatedAt: serverTimestamp(),
    });
    
    // Record boost
    const boost: QuestionBoost = {
      id: boostId,
      questionId: data.questionId,
      userId,
      tokensCharged,
      createdAt: new Date(),
    };
    
    transaction.set(db.collection('questionBoosts').doc(boostId), {
      ...boost,
      createdAt: serverTimestamp(),
    });
  });
  
  // Record transaction (100% to Avalo)
  await db.collection('transactions').add({
    type: 'question_boost',
    payerId: userId,
    tokensAmount: tokensCharged,
    avaloAmount: tokensCharged,
    questionId: data.questionId,
    createdAt: serverTimestamp(),
  });
  
  return {
    questionId: data.questionId,
    newBoostScore,
    tokensCharged,
  };
}

// ============================================================================
// GET FEED
// ============================================================================

/**
 * Get questions feed
 */
export async function getQuestionsFeed(
  userId: string | null,
  filters: GetFeedFilters
): Promise<QuestionsFeedResponse> {
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  
  // Build query
  let query = db.collection('questions')
    .where('visibilityStatus', '==', 'active');
  
  // Filter by target user if specified
  if (filters.targetUserId) {
    query = query.where('targetUserId', '==', filters.targetUserId);
  }
  
  // Order by boost score (desc) and creation time (desc)
  query = query.orderBy('boostScore', 'desc').orderBy('createdAt', 'desc');
  
  // Get documents
  const snapshot = await query.limit(limit).offset(offset).get();
  const questions: Question[] = snapshot.docs.map(doc => doc.data() as Question);
  
  // Filter NSFW if needed
  let filtered = questions;
  if (userId) {
    const userSnap = await db.collection('users').doc(userId).get();
    const is18Plus = userSnap.data()?.age18Plus || false;
    if (!is18Plus) {
      filtered = filtered.filter(q => !q.isNSFW);
    }
  } else {
    // Not logged in - filter all NSFW
    filtered = filtered.filter(q => !q.isNSFW);
  }
  
  // Filter by tags if specified
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(q =>
      filters.tags!.some(tag => q.tags.includes(tag.toLowerCase()))
    );
  }
  
  // Convert to public info
  const publicQuestions = await Promise.all(
    filtered.map(q => getQuestionPublicInfo(q, userId))
  );
  
  return {
    questions: publicQuestions,
    total: filtered.length,
    hasMore: snapshot.docs.length === limit,
  };
}

// ============================================================================
// GET QUESTION DETAIL
// ============================================================================

/**
 * Get question detail with answers
 */
export async function getQuestionDetail(
  questionId: string,
  userId: string | null
): Promise<QuestionDetailResponse> {
  const questionSnap = await db.collection('questions').doc(questionId).get();
  
  if (!questionSnap.exists) {
    throw new HttpsError('not-found', 'Question not found');
  }
  
  const question = questionSnap.data() as Question;
  
  if (question.visibilityStatus !== 'active') {
    throw new HttpsError('failed-precondition', 'Question is not active');
  }
  
  // Check 18+ gating
  if (question.isNSFW && userId) {
    const userSnap = await db.collection('users').doc(userId).get();
    const is18Plus = userSnap.data()?.age18Plus || false;
    if (!is18Plus) {
      throw new HttpsError('permission-denied', 'Must be 18+ to view this content');
    }
  } else if (question.isNSFW && !userId) {
    throw new HttpsError('permission-denied', 'Must be logged in and 18+ to view this content');
  }
  
  const publicQuestion = await getQuestionPublicInfo(question, userId);
  
  // Get user's unlocked answers
  const userAnswerUnlocks: string[] = [];
  if (userId) {
    const unlocksSnap = await db.collection('questionAnswerUnlocks')
      .where('questionId', '==', questionId)
      .where('viewerId', '==', userId)
      .get();
    
    unlocksSnap.docs.forEach(doc => {
      userAnswerUnlocks.push(doc.data().answerId);
    });
  }
  
  // Check if user can answer
  let canAnswer = false;
  if (userId) {
    const userSnap = await db.collection('users').doc(userId).get();
    canAnswer = userSnap.data()?.accountStatus === 'active';
  }
  
  // Check if user can boost (must be author)
  const canBoost = userId && (question.authorId === userId || question.isAnonymous);
  
  return {
    question: publicQuestion,
    canAnswer,
    canBoost: !!canBoost,
    userAnswerUnlocks,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert question to public info
 */
async function getQuestionPublicInfo(
  question: Question,
  viewerId: string | null
): Promise<QuestionPublicInfo> {
  let authorName = 'Anonymous';
  let authorAvatar = '';
  
  if (!question.isAnonymous) {
    const authorSnap = await db.collection('users').doc(question.authorId).get();
    if (authorSnap.exists) {
      const authorData = authorSnap.data();
      authorName = authorData?.displayName || authorData?.name || 'User';
      authorAvatar = authorData?.avatar || authorData?.profilePicture || '';
    }
  }
  
  let targetUserName: string | undefined;
  let targetUserAvatar: string | undefined;
  
  if (question.targetUserId) {
    const targetSnap = await db.collection('users').doc(question.targetUserId).get();
    if (targetSnap.exists) {
      const targetData = targetSnap.data();
      targetUserName = targetData?.displayName || targetData?.name || 'User';
      targetUserAvatar = targetData?.avatar || targetData?.profilePicture || '';
    }
  }
  
  // Get answers
  const answersSnap = await db.collection('questionAnswers')
    .where('questionId', '==', question.id)
    .orderBy('likesCount', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  
  const answers = await Promise.all(
    answersSnap.docs.map(doc => getAnswerPublicInfo(doc.data() as Answer, viewerId))
  );
  
  return {
    ...question,
    authorName,
    authorAvatar,
    targetUserName,
    targetUserAvatar,
    answers,
  };
}

/**
 * Convert answer to public info
 */
async function getAnswerPublicInfo(
  answer: Answer,
  viewerId: string | null
): Promise<AnswerPublicInfo> {
  const authorSnap = await db.collection('users').doc(answer.authorId).get();
  let authorName = 'User';
  let authorAvatar = '';
  
  if (authorSnap.exists) {
    const authorData = authorSnap.data();
    authorName = authorData?.displayName || authorData?.name || 'User';
    authorAvatar = authorData?.avatar || authorData?.profilePicture || '';
  }
  
  // Check if unlocked
  let isUnlocked = !answer.isPaid; // Free answers are always unlocked
  let snippet: string | undefined;
  
  if (answer.isPaid && viewerId) {
    const unlockSnap = await db.collection('questionAnswerUnlocks')
      .where('answerId', '==', answer.id)
      .where('viewerId', '==', viewerId)
      .limit(1)
      .get();
    
    isUnlocked = !unlockSnap.empty;
  }
  
  // Generate snippet for locked answers
  if (answer.isPaid && !isUnlocked) {
    snippet = answer.text.substring(0, QUESTIONS_CONFIG.SNIPPET_LENGTH) + '...';
  }
  
  return {
    ...answer,
    authorName,
    authorAvatar,
    isUnlocked,
    snippet,
  };
}
