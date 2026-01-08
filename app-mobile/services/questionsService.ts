/**
 * Questions Service for Avalo Mobile App
 * 
 * Handles Q&A interactions including:
 * - Creating questions (free & anonymous/paid)
 * - Answering questions
 * - Unlocking paid answers
 * - Boosting questions
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface Question {
  id: string;
  authorId: string;
  targetUserId?: string | null;
  text: string;
  isAnonymous: boolean;
  isNSFW: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  boostScore: number;
  answerCount: number;
  unlockCount: number;
  visibilityStatus: 'active' | 'hidden' | 'removed';
  authorName?: string;
  authorAvatar?: string;
  targetUserName?: string;
  targetUserAvatar?: string;
  answers: Answer[];
}

export interface Answer {
  id: string;
  questionId: string;
  authorId: string;
  text: string;
  isPaid: boolean;
  isNSFW: boolean;
  createdAt: Date;
  likesCount: number;
  unlockCount: number;
  authorName: string;
  authorAvatar?: string;
  isUnlocked?: boolean;
  snippet?: string;
}

export interface CreateQuestionParams {
  text: string;
  isAnonymous?: boolean;
  isNSFW?: boolean;
  tags?: string[];
  targetUserId?: string;
}

export interface CreateQuestionResult {
  questionId: string;
  tokensCharged: number;
}

export interface CreateAnswerParams {
  questionId: string;
  text: string;
  isPaid?: boolean;
  isNSFW?: boolean;
}

export interface CreateAnswerResult {
  answerId: string;
}

export interface UnlockAnswerParams {
  answerId: string;
  questionId: string;
}

export interface UnlockAnswerResult {
  answerId: string;
  answerText: string;
  tokensCharged: number;
}

export interface BoostQuestionParams {
  questionId: string;
}

export interface BoostQuestionResult {
  questionId: string;
  newBoostScore: number;
  tokensCharged: number;
}

export interface GetFeedParams {
  limit?: number;
  offset?: number;
  isNSFW?: boolean;
  tags?: string[];
  targetUserId?: string;
}

export interface QuestionsFeedResult {
  questions: Question[];
  total: number;
  hasMore: boolean;
}

export interface QuestionDetailResult {
  question: Question;
  canAnswer: boolean;
  canBoost: boolean;
  userAnswerUnlocks: string[];
}

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

export const QUESTIONS_PRICING = {
  ANONYMOUS_QUESTION: 15,
  ANSWER_UNLOCK: 20,
  BOOST: 10,
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new question
 */
export async function createQuestion(
  params: CreateQuestionParams
): Promise<CreateQuestionResult> {
  const createQuestionFn = httpsCallable<CreateQuestionParams, CreateQuestionResult>(
    functions,
    'questions_createQuestion'
  );
  
  const result = await createQuestionFn(params);
  return result.data;
}

/**
 * Answer a question
 */
export async function answerQuestion(
  params: CreateAnswerParams
): Promise<CreateAnswerResult> {
  const answerQuestionFn = httpsCallable<CreateAnswerParams, CreateAnswerResult>(
    functions,
    'questions_answerQuestion'
  );
  
  const result = await answerQuestionFn(params);
  return result.data;
}

/**
 * Unlock a paid answer
 */
export async function unlockAnswer(
  params: UnlockAnswerParams
): Promise<UnlockAnswerResult> {
  const unlockAnswerFn = httpsCallable<UnlockAnswerParams, UnlockAnswerResult>(
    functions,
    'questions_unlockAnswer'
  );
  
  const result = await unlockAnswerFn(params);
  return result.data;
}

/**
 * Boost a question
 */
export async function boostQuestion(
  params: BoostQuestionParams
): Promise<BoostQuestionResult> {
  const boostQuestionFn = httpsCallable<BoostQuestionParams, BoostQuestionResult>(
    functions,
    'questions_boostQuestion'
  );
  
  const result = await boostQuestionFn(params);
  return result.data;
}

/**
 * Get questions feed
 */
export async function getQuestionsFeed(
  params: GetFeedParams = {}
): Promise<QuestionsFeedResult> {
  const getFeedFn = httpsCallable<GetFeedParams, QuestionsFeedResult>(
    functions,
    'questions_getFeed'
  );
  
  const result = await getFeedFn(params);
  return result.data;
}

/**
 * Get question detail with answers
 */
export async function getQuestionDetail(
  questionId: string
): Promise<QuestionDetailResult> {
  const getDetailFn = httpsCallable<{ questionId: string }, QuestionDetailResult>(
    functions,
    'questions_getQuestionDetail'
  );
  
  const result = await getDetailFn({ questionId });
  return result.data;
}

/**
 * Format question text preview
 */
export function formatQuestionPreview(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * Get question age display
 */
export function getQuestionAge(createdAt: Date): string {
  const now = new Date();
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return created.toLocaleDateString();
}

/**
 * Validate question text
 */
export function validateQuestionText(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Question text is required' };
  }
  
  if (text.length > 500) {
    return { valid: false, error: 'Question must be 500 characters or less' };
  }
  
  return { valid: true };
}

/**
 * Validate answer text
 */
export function validateAnswerText(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Answer text is required' };
  }
  
  if (text.length > 2000) {
    return { valid: false, error: 'Answer must be 2000 characters or less' };
  }
  
  return { valid: true };
}

export default {
  createQuestion,
  answerQuestion,
  unlockAnswer,
  boostQuestion,
  getQuestionsFeed,
  getQuestionDetail,
  formatQuestionPreview,
  getQuestionAge,
  validateQuestionText,
  validateAnswerText,
  QUESTIONS_PRICING,
};