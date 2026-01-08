/**
 * Phase 16C: Questions Module - Type Definitions
 * ADDITIVE ONLY - does not modify existing types or logic
 */

// ============================================================================
// ENTITIES
// ============================================================================

/**
 * Question entity
 */
export interface Question {
  id: string;
  authorId: string;
  targetUserId?: string | null; // Optional: specific user/creator target
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
  deletedAt?: Date | null;
}

/**
 * Answer entity
 */
export interface Answer {
  id: string;
  questionId: string;
  authorId: string;
  text: string;
  isPaid: boolean; // True = requires unlock
  isNSFW: boolean;
  createdAt: Date;
  likesCount: number;
  unlockCount: number;
}

/**
 * Answer unlock record (per-viewer access)
 */
export interface AnswerUnlock {
  id: string;
  questionId: string;
  answerId: string;
  viewerId: string;
  tokensCharged: number;
  createdAt: Date;
}

/**
 * Question boost record
 */
export interface QuestionBoost {
  id: string;
  questionId: string;
  userId: string; // Payer
  tokensCharged: number;
  createdAt: Date;
  expiresAt?: Date | null;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Create question input
 */
export interface CreateQuestionInput {
  text: string;
  isAnonymous?: boolean;
  isNSFW?: boolean;
  tags?: string[];
  targetUserId?: string | null;
}

/**
 * Create answer input
 */
export interface CreateAnswerInput {
  questionId: string;
  text: string;
  isPaid?: boolean;
  isNSFW?: boolean;
}

/**
 * Unlock answer input
 */
export interface UnlockAnswerInput {
  answerId: string;
  questionId: string;
}

/**
 * Boost question input
 */
export interface BoostQuestionInput {
  questionId: string;
}

/**
 * Get feed filters
 */
export interface GetFeedFilters {
  limit?: number;
  offset?: number;
  isNSFW?: boolean;
  tags?: string[];
  targetUserId?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Question with public info
 */
export interface QuestionPublicInfo extends Question {
  authorName?: string;
  authorAvatar?: string;
  targetUserName?: string;
  targetUserAvatar?: string;
  answers: AnswerPublicInfo[];
}

/**
 * Answer with public info
 */
export interface AnswerPublicInfo extends Answer {
  authorName: string;
  authorAvatar?: string;
  isUnlocked?: boolean; // For specific viewer
  snippet?: string; // Preview if locked
}

/**
 * Feed response
 */
export interface QuestionsFeedResponse {
  questions: QuestionPublicInfo[];
  total: number;
  hasMore: boolean;
}

/**
 * Question detail response
 */
export interface QuestionDetailResponse {
  question: QuestionPublicInfo;
  canAnswer: boolean;
  canBoost: boolean;
  userAnswerUnlocks: string[]; // Answer IDs user has unlocked
}

/**
 * Create question response
 */
export interface CreateQuestionResponse {
  questionId: string;
  tokensCharged: number;
}

/**
 * Create answer response
 */
export interface CreateAnswerResponse {
  answerId: string;
}

/**
 * Unlock answer response
 */
export interface UnlockAnswerResponse {
  answerId: string;
  answerText: string;
  tokensCharged: number;
}

/**
 * Boost question response
 */
export interface BoostQuestionResponse {
  questionId: string;
  newBoostScore: number;
  tokensCharged: number;
}