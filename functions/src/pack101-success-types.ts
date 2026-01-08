/**
 * PACK 101 — Creator Success Toolkit Types
 * Type definitions for creator success signals and suggestions
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Suggestion categories
 */
export type SuggestionCategory = 
  | 'PROFILE'
  | 'CONTENT'
  | 'MESSAGING'
  | 'ENGAGEMENT'
  | 'AUDIENCE';

/**
 * Suggestion priority levels
 */
export type SuggestionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Individual success suggestion
 */
export interface SuccessSuggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  body: string;
  priority: SuggestionPriority;
  helpArticleSlug?: string;
  actionLink?: string; // Deep link for actionable items
}

/**
 * Scorecard metrics (0-100 normalized)
 */
export interface SuccessScorecard {
  profileQuality: number;
  activity: number;
  consistency: number;
  responsiveness: number;
  contentMomentum: number;
  audienceLoyalty: number;
}

/**
 * Creator success signals document
 * One per user, updated daily
 */
export interface CreatorSuccessSignals {
  userId: string;
  updatedAt: Timestamp;
  suggestions: SuccessSuggestion[];
  scorecard: SuccessScorecard;
}

/**
 * Request/response types for callable functions
 */
export interface GetCreatorSuccessSignalsRequest {
  userId?: string; // Optional, defaults to authenticated user
}

export interface GetCreatorSuccessSignalsResponse {
  updatedAt: string; // ISO timestamp
  scorecard: SuccessScorecard;
  suggestions: SuccessSuggestion[];
}