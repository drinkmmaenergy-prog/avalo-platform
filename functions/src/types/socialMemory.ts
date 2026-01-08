/**
 * PACK 192: AI Social Memory Hub Types
 * Cross-AI knowledge sharing with strict privacy controls
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Preference categories that CAN be shared between AIs
 */
export type AllowedPreferenceCategory =
  | 'topics_liked'           // MMA, boxing, Korean food, sci-fi, business
  | 'humor_preference'        // sarcastic, playful, poetic, analytical
  | 'activity_preference'     // voice notes, long texts, games, challenges
  | 'languages'              // user likes to switch to Spanish or Polish
  | 'safe_boundaries'         // "doesn't like jealousy jokes", "dislikes guilt pressure"
  | 'story_progress';        // "finished chapter 3 of cyberpunk arc"

/**
 * Data types that are FORBIDDEN from cross-AI sharing
 */
export type ForbiddenDataType =
  | 'emotional_vulnerability'
  | 'loneliness_signals'
  | 'fears_trauma'
  | 'mental_health'
  | 'addiction_tendencies'
  | 'financial_data'
  | 'purchases'
  | 'subscriptions'
  | 'sexual_interests'
  | 'relational_pain'
  | 'ai_rankings'
  | 'ai_favorites';

/**
 * Shared preference entry
 */
export interface SharedPreference {
  id: string;
  userId: string;
  category: AllowedPreferenceCategory;
  key: string;
  value: string | string[] | number | boolean;
  confidence: number; // 0-1, how confident we are about this preference
  sourceAiId?: string; // Which AI originally captured this (optional)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  accessCount: number;
  lastAccessedAt: Timestamp;
}

/**
 * Story progress shared across AIs
 */
export interface SharedStoryProgress {
  id: string;
  userId: string;
  storyId: string;
  storyName: string;
  currentChapter: number;
  totalChapters: number;
  lastPosition: string;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Cross-AI memory permissions
 */
export interface MemoryPermissions {
  userId: string;
  crossAiSharingEnabled: boolean; // Master toggle
  allowedCategories: AllowedPreferenceCategory[]; // Which categories to share
  excludedAiIds: string[]; // AIs that should NOT receive shared memory
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * AI access to shared memory (transparency)
 */
export interface AiMemoryAccess {
  id: string;
  userId: string;
  aiId: string;
  aiName: string;
  accessedPreferences: string[]; // IDs of preferences accessed
  lastAccessAt: Timestamp;
  totalAccesses: number;
}

/**
 * Request to share preference across AIs
 */
export interface SharePreferenceRequest {
  userId: string;
  category: AllowedPreferenceCategory;
  key: string;
  value: any;
  confidence?: number;
  sourceAiId?: string;
}

/**
 * Request to get shared preferences for an AI
 */
export interface GetSharedPreferencesRequest {
  userId: string;
  aiId: string;
  categories?: AllowedPreferenceCategory[];
}

/**
 * Response with shared preferences
 */
export interface GetSharedPreferencesResponse {
  preferences: SharedPreference[];
  storyProgress: SharedStoryProgress[];
  permissionsActive: boolean;
}

/**
 * Privacy filter result
 */
export interface PrivacyFilterResult {
  allowed: boolean;
  reason?: string;
  detectedForbiddenTypes?: ForbiddenDataType[];
}

/**
 * Memory analytics for transparency
 */
export interface MemoryAnalytics {
  userId: string;
  totalPreferencesShared: number;
  categoriesActive: AllowedPreferenceCategory[];
  aiAccessLog: AiMemoryAccess[];
  lastUpdated: Timestamp;
}