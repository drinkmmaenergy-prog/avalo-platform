/**
 * PublicProfile — Firestore 'public_profiles' collection document type.
 *
 * This is the publicly-visible subset of a user's profile, used for:
 *   - Discover page grid cards
 *   - Public profile view (/profile/[userId])
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

  /** Cover photo URL */
  coverURL?: string | null;

  /** FIX 25: Cover photo vertical position (0-100%, default 50) */
  coverPosition?: number;

  /** Array of photo URLs for profile carousel */
  photos: string[];

  /** User age (derived from dateOfBirth on backend) */
  age: number | null;

  /** Date of birth (YYYY-MM-DD string, written from profile editor) */
  dateOfBirth?: string;

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

  /** Location label (e.g. "Warsaw, PL") or geo coords object */
  location: string | { lat: number; lng: number } | null;

  /** City — flat top-level field written by profile editor for Discovery filtering */
  city?: string;

  /** Gender (profile editor values: Man, Woman, Non-binary, Other) */
  gender: string;

  /** Looking for preference (Men, Women, Everyone) */
  lookingFor?: string;

  /** Body type (optional — populated from extended profile) */
  bodyType?: string;

  /** Hair color (optional — populated from extended profile) */
  hairColor?: string;

  /** User interests / hobbies (optional — populated from extended profile) */
  interests?: string[];

  /** Whether user is visible in Discovery */
  discoverable?: boolean;

  /** Whether user passed human verification */
  isHuman?: boolean;

  /** FIX 80: Verification status breakdown (selfie, age, identity) */
  verification?: {
    selfie?: boolean;
    selfieVerifiedAt?: any;
    age?: boolean;
    identity?: boolean;
  };

  /** Whether user is age-verified */
  ageVerified?: boolean;

  /** Whether user has completed KYC */
  kycVerified?: boolean;

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

// ============================================================================
// SEARCH RADIUS OPTIONS
// ============================================================================

/** Search radius option values — granular km selector for Discover page */
export type SearchRadiusValue =
  | 5
  | 10
  | 20
  | 25
  | 50
  | 100
  | 150
  | 'entire_country'
  | 'international';

export interface SearchRadiusOption {
  value: SearchRadiusValue;
  label: string;
}

/** Ordered list of search radius options for the km selector */
export const SEARCH_RADIUS_OPTIONS: SearchRadiusOption[] = [
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 20, label: '20 km' },
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
  { value: 100, label: '100 km' },
  { value: 150, label: '150 km' },
  { value: 'entire_country', label: 'Entire Country' },
  { value: 'international', label: 'International' },
];

export const DEFAULT_SEARCH_RADIUS: SearchRadiusValue = 50;

// ============================================================================
// BODY TYPE / HAIR COLOR / INTEREST OPTIONS
// ============================================================================

/** Body type options for the filter panel */
export const BODY_TYPE_OPTIONS = [
  'Slim',
  'Athletic',
  'Average',
  'Curvy',
  'Plus Size',
] as const;

export type BodyType = (typeof BODY_TYPE_OPTIONS)[number];

/** Hair color options for the filter panel */
export const HAIR_COLOR_OPTIONS = [
  'Blonde',
  'Brown',
  'Black',
  'Red',
  'Gray',
  'Other',
] as const;

export type HairColor = (typeof HAIR_COLOR_OPTIONS)[number];

/** Interest / hobby categories for multi-select chips (max 20) */
export const INTEREST_OPTIONS = [
  'Travel',
  'Music',
  'Fitness',
  'Photography',
  'Cooking',
  'Reading',
  'Gaming',
  'Art',
  'Dancing',
  'Movies',
  'Fashion',
  'Sports',
  'Nature',
  'Yoga',
  'Hiking',
  'Tech',
  'Animals',
  'Nightlife',
  'Foodie',
  'Volunteering',
] as const;

export type Interest = (typeof INTEREST_OPTIONS)[number];

/** Gender options for filter checkboxes (mirrors PublicProfile.gender) */
export const GENDER_OPTIONS = [
  { value: 'Man' as const, label: 'Man' },
  { value: 'Woman' as const, label: 'Woman' },
  { value: 'Non-binary' as const, label: 'Non-binary' },
  { value: 'Other' as const, label: 'Other' },
];

// ============================================================================
// DISCOVER FILTERS
// ============================================================================

/** Filters for the Discover page grid */
export interface DiscoverFilters {
  /** Show only online users */
  onlineOnly: boolean;

  /** Show only users with earn_on active */
  earnOnOnly: boolean;

  /** Search radius — km or special value */
  searchRadius: SearchRadiusValue;

  /** Age range — minimum (inclusive, 18–99) */
  ageMin: number;

  /** Age range — maximum (inclusive, 18–99) */
  ageMax: number;

  /** Gender filter — empty array means all genders */
  genders: Array<'Man' | 'Woman' | 'Non-binary' | 'Other'>;

  /** Body type filter — empty array means all */
  bodyTypes: string[];

  /** Hair color filter — empty array means all */
  hairColors: string[];

  /** Interest/hobby filter — empty array means all */
  interests: string[];

  /** FIX 78: Show only verified (selfie-verified) profiles */
  verifiedOnly: boolean;
}

/** Default filter state */
export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  onlineOnly: false,
  earnOnOnly: false,
  searchRadius: 50,
  ageMin: 18,
  ageMax: 99,
  genders: [],
  bodyTypes: [],
  hairColors: [],
  interests: [],
  verifiedOnly: false,
};
