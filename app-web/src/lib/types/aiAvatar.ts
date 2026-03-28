/**
 * AIAvatar — Firestore 'ai_avatars' collection document type.
 *
 * This is the full AI companion profile stored in Firestore.
 * Used by:
 *   - /ai discovery feed
 *   - /ai/profile/[avatarId] profile page
 *   - /ai/chat/[avatarId] chat page
 *   - /creator/ai management page
 *
 * Firestore path: ai_avatars/{avatarId}
 */

import type { Timestamp } from 'firebase/firestore';

export interface AIAvatar {
  /** Document ID in Firestore */
  id: string;

  /** Display name */
  name: string;

  /** Age (18-99) */
  age: number;

  /** Gender */
  gender: 'male' | 'female' | 'non-binary' | 'other';

  /** Ethnicity / race */
  ethnicity: string;

  /** Body type */
  bodyType: string;

  /** Hair color */
  hairColor: string;

  /** Eye color */
  eyeColor: string;

  /** Personality traits array */
  personalityTraits: string[];

  /** Short bio / description (one-liner for cards) */
  bio: string;

  /** Longer backstory text */
  backstory: string;

  /** Interests and hobbies */
  interests: string[];

  /** Profile photos array — first element is primary photo */
  photos: string[];

  /** Voice type (text, for future use) */
  voiceType: string;

  /** Creator's Firebase UID — null for platform bots */
  creatorId: string | null;

  /** Creator display name — shown as "by [name]" on card */
  creatorDisplayName: string | null;

  /** Whether this is an Avalo platform-owned bot */
  isAvaloPlatform: boolean;

  /** Total conversation count */
  totalConversations: number;

  /** Average rating (0-5) */
  averageRating: number;

  /** Number of ratings */
  ratingCount: number;

  /** FIX 51: Conversation count — incremented on each chat start */
  conversationCount: number;

  /** FIX 51: Total ratings count (alias used by ranking system) */
  totalRatings: number;

  /** FIX 52: Profession preset id (e.g. 'artist', 'coder', 'custom') */
  profession: string;

  /** Cost per message in tokens — overrides AI_COST_PER_MESSAGE for this bot. Min 1, default 1. */
  costPerMessage?: number;

  /** FIX 52: Base prompt from profession preset or custom text */
  basePrompt: string;

  /** Creation timestamp */
  createdAt: Timestamp | null;

  /** Last update timestamp */
  updatedAt: Timestamp | null;
}

/** Filter options for the AI discovery feed */
export interface AIDiscoveryFilters {
  /** Gender filter — empty means all */
  gender: string;

  /** Age range minimum */
  ageMin: number;

  /** Age range maximum */
  ageMax: number;

  /** Personality type filter — empty means all */
  personalityType: string;

  /** Created by filter: 'all' | 'avalo' | 'community' */
  createdBy: 'all' | 'avalo' | 'community';

  /** Search query (name or personality) */
  searchQuery: string;
}

export const DEFAULT_AI_DISCOVERY_FILTERS: AIDiscoveryFilters = {
  gender: 'all',
  ageMin: 18,
  ageMax: 99,
  personalityType: 'all',
  createdBy: 'all',
  searchQuery: '',
};
