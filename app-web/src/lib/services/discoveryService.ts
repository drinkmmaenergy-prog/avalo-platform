"use client";

/**
 * Discovery Service — Firestore queries for 'public_profiles' collection.
 *
 * Provides:
 *   - fetchPublicProfiles()   Paginated grid data for Discover page
 *   - getPublicProfile()      Single profile fetch for /profile?uid=xxx
 *   - findOrCreateChat()      Creates or finds existing conversation for "Start Chat"
 *
 * Pagination: limit 20 per page, cursor-based via startAfter.
 * Filters: online only, earn_on only, price range.
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
 * Firestore composite index requirements:
 *   - (online ASC, updatedAt DESC) for onlineOnly
 *   - (earn_on ASC, updatedAt DESC) for earnOnOnly
 *   - (earn_on ASC, chat_price ASC, updatedAt DESC) for price range
 *
 * When both onlineOnly + earnOnOnly are active, the query uses a combined
 * constraint set. Firestore will need the matching composite index.
 */
export async function fetchPublicProfiles(
  cursor: DocumentSnapshot | null = null,
  filters: DiscoverFilters = {
    onlineOnly: false,
    earnOnOnly: false,
    priceMin: null,
    priceMax: null,
  }
): Promise<PaginatedProfilesResult> {
  try {
    const constraints: QueryConstraint[] = [];

    // ── Filter constraints (must come before orderBy) ─────────────────
    if (filters.onlineOnly) {
      constraints.push(where('online', '==', true));
    }

    if (filters.earnOnOnly) {
      constraints.push(where('earn_on', '==', true));
    }

    if (filters.priceMin !== null && filters.priceMin > 0) {
      constraints.push(where('chat_price', '>=', filters.priceMin));
    }

    if (filters.priceMax !== null && filters.priceMax > 0) {
      constraints.push(where('chat_price', '<=', filters.priceMax));
    }

    // ── Order + pagination ────────────────────────────────────────────
    // If price range filters are active, order by chat_price first (Firestore requirement),
    // then by updatedAt. Otherwise, order by updatedAt for recency.
    const hasPriceFilter =
      (filters.priceMin !== null && filters.priceMin > 0) ||
      (filters.priceMax !== null && filters.priceMax > 0);

    if (hasPriceFilter) {
      constraints.push(orderBy('chat_price', 'asc'));
      constraints.push(orderBy('updatedAt', 'desc'));
    } else {
      constraints.push(orderBy('updatedAt', 'desc'));
    }

    constraints.push(limit(PROFILES_PER_PAGE));

    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    const q = query(
      collection(requireDb(), COLLECTION_NAME),
      ...constraints
    );
    const snapshot = await getDocs(q);

    const items: PublicProfile[] = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      ...docSnap.data(),
    })) as PublicProfile[];

    return {
      items,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
      hasMore: items.length === PROFILES_PER_PAGE,
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
