/**
 * PublicProfile — Firestore 'public_profiles' collection document type.
 *
 * This is the publicly-visible subset of a user's profile, used for:
 *   - Discover page grid cards
 *   - Public profile view (/profile?uid=xxx)
 *
 * Firestore path: public_profiles/{uid}
 */

import type { Timestamp } from 'firebase/firestore';

export interface PublicProfile {
  /** Firebase Auth UID — also the document ID */
  uid: string;

  /** Display name shown on card and profile */
  displayName: string;

  /** Primary avatar URL */
  photoURL: string | null;

  /** Array of photo URLs for profile carousel */
  photos: string[];

  /** User age (derived from dateOfBirth on backend) */
  age: number | null;

  /** Short bio / description */
  bio: string;

  /** Whether this user accepts paid chat (earn_on) */
  earn_on: boolean;

  /** Price in tokens to initiate a paid chat */
  chat_price: number;

  /** Whether user is currently online */
  online: boolean;

  /** Whether user is identity-verified */
  verified: boolean;

  /** Location label (e.g. "Warsaw, PL") */
  location: string;

  /** Gender */
  gender: 'male' | 'female' | 'other';

  /** Public stats */
  stats: {
    followers: number;
    following: number;
    posts: number;
  };

  /** Last seen timestamp (for online indicator logic) */
  lastActiveAt: Timestamp | null;

  /** Profile creation timestamp */
  createdAt: Timestamp;

  /** Last profile update */
  updatedAt: Timestamp;
}

/** Filters for the Discover page grid */
export interface DiscoverFilters {
  /** Show only online users */
  onlineOnly: boolean;

  /** Show only users with earn_on active */
  earnOnOnly: boolean;

  /** Minimum chat price filter (inclusive) */
  priceMin: number | null;

  /** Maximum chat price filter (inclusive) */
  priceMax: number | null;
}

/** Default filter state */
export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  onlineOnly: false,
  earnOnOnly: false,
  priceMin: null,
  priceMax: null,
};
