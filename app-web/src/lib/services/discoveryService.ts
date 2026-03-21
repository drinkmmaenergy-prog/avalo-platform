"use client";

/**
 * Discovery Service — Firestore queries for 'public_profiles' collection.
 *
 * Provides:
 *   - fetchPublicProfiles()   Paginated grid data for Discover page
 *   - getPublicProfile()      Single profile fetch for /profile/[userId]
 *   - findOrCreateChat()      Creates or finds existing conversation for "Start Chat"
 *
 * Pagination: limit 20 per page, cursor-based via startAfter.
 * Filters: discoverable != false (server-side visibility only).
 *          All other filters (online, earn_on, gender, age, body type,
 *          hair color, interests) applied client-side to eliminate
 *          composite index requirements.
 *
 * INVARIANTS:
 *   - Uses requireDb() — the canonical Firestore guard from @/lib/firebase.
 *   - Read-only queries; no writes to public_profiles (backend-managed).
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  DocumentSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  PublicProfile,
  DiscoverFilters,
} from '../types/publicProfile';
import { DEFAULT_DISCOVER_FILTERS } from '../types/publicProfile';

const PROFILES_PER_PAGE = 20;
const COLLECTION_NAME = 'public_profiles';

// ============================================================================
// PAGINATED DISCOVER QUERY
// ============================================================================

export interface PaginatedProfilesResult {
  items: PublicProfile[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Fetch public profiles with pagination and optional filters.
 *
 * Server-side Firestore constraints:
 *   - discoverable != false (basic visibility — only server-side filter)
 *
 * Client-side filters (applied after fetch):
 *   - online (onlineOnly)
 *   - earn_on (earnOnOnly)
 *   - gender
 *   - Age range (ageMin/ageMax)
 *   - Body type
 *   - Hair color
 *   - Interests
 *
 * BUG 6 fix: All filters except basic visibility are now client-side.
 * This eliminates all composite index requirements for the discover query.
 */
export async function fetchPublicProfiles(
  cursor: DocumentSnapshot | null = null,
  filters: DiscoverFilters = DEFAULT_DISCOVER_FILTERS
): Promise<PaginatedProfilesResult> {
  try {
    const constraints: QueryConstraint[] = [];

    // ── Basic visibility filter (only server-side filter) ─────────────
    constraints.push(where('discoverable', '!=', false));

    // ── Order + pagination ────────────────────────────────────────────
    constraints.push(orderBy('updatedAt', 'desc'));
    constraints.push(limit(PROFILES_PER_PAGE));

    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    const q = query(
      collection(requireDb(), COLLECTION_NAME),
      ...constraints
    );
    const snapshot = await getDocs(q);

    let items: PublicProfile[] = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      ...docSnap.data(),
    })) as PublicProfile[];

    // ── Client-side filters ─────────────────────────────────────────

    // Online only
    if (filters.onlineOnly) {
      items = items.filter((p) => p.online === true);
    }

    // Earn-on only
    if (filters.earnOnOnly) {
      items = items.filter((p) => p.earn_on === true);
    }

    // Gender
    if (filters.genders.length > 0) {
      items = items.filter((p) => p.gender && (filters.genders as string[]).includes(p.gender));
    }

    // Age range
    if (filters.ageMin > 18 || filters.ageMax < 99) {
      items = items.filter(
        (p) =>
          p.age !== null &&
          p.age >= filters.ageMin &&
          p.age <= filters.ageMax
      );
    }

    // Body type
    if (filters.bodyTypes.length > 0) {
      items = items.filter(
        (p) => p.bodyType && filters.bodyTypes.includes(p.bodyType)
      );
    }

    // Hair color
    if (filters.hairColors.length > 0) {
      items = items.filter(
        (p) => p.hairColor && filters.hairColors.includes(p.hairColor)
      );
    }

    // Interests — match if profile has at least one of the selected interests
    if (filters.interests.length > 0) {
      items = items.filter(
        (p) =>
          p.interests &&
          p.interests.some((interest) => filters.interests.includes(interest))
      );
    }

    return {
      items,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
      hasMore: snapshot.docs.length === PROFILES_PER_PAGE,
    };
  } catch (error) {
    console.error('[discoveryService] fetchPublicProfiles error:', error);
    throw error;
  }
}

// ============================================================================
// SINGLE PROFILE FETCH
// ============================================================================

/**
 * Get a single public profile by UID.
 * Returns null if the document does not exist.
 */
export async function getPublicProfile(
  uid: string
): Promise<PublicProfile | null> {
  try {
    const docRef = doc(requireDb(), COLLECTION_NAME, uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      uid: docSnap.id,
      ...docSnap.data(),
    } as PublicProfile;
  } catch (error) {
    console.error('[discoveryService] getPublicProfile error:', error);
    throw error;
  }
}

// ============================================================================
// CHAT INITIATION (from profile "Start Chat" button)
// ============================================================================

/**
 * Find an existing chat between two users, or create a new one via
 * the backend Cloud Function (createChat). Then returns the chatId
 * for navigation to /chat?chatId=xxx.
 *
 * Delegates to chatService.initializeChat under the hood via a
 * Cloud Function call for atomicity and security.
 */
export async function findOrCreateChat(params: {
  currentUserId: string;
  targetUserId: string;
}): Promise<{ chatId: string }> {
  try {
    const fn = httpsCallable<
      { userAId: string; userBId: string; initiatorId: string },
      { chatId: string }
    >(requireFunctions(), 'createChat');

    const result = await fn({
      userAId: params.currentUserId,
      userBId: params.targetUserId,
      initiatorId: params.currentUserId,
    });

    return { chatId: result.data.chatId };
  } catch (error) {
    console.error('[discoveryService] findOrCreateChat error:', error);
    throw error;
  }
}
