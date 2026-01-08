/**
 * AI Favorites Service
 * Manages user's favorite AI companions and pinned favorite
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

export interface AIFavorites {
  userId: string;
  favoriteIds: string[]; // Array of companion IDs
  pinnedId?: string; // Single pinned companion ID
  updatedAt: Date;
}

/**
 * Get user's AI favorites
 */
export async function getUserAIFavorites(userId: string): Promise<AIFavorites | null> {
  try {
    const db = getFirestore();
    const favoritesRef = doc(db, 'ai_favorites', userId);
    const favoritesSnap = await getDoc(favoritesRef);

    if (!favoritesSnap.exists()) {
      return {
        userId,
        favoriteIds: [],
        updatedAt: new Date(),
      };
    }

    const data = favoritesSnap.data();
    return {
      userId: data.userId,
      favoriteIds: data.favoriteIds || [],
      pinnedId: data.pinnedId,
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error('Error getting AI favorites:', error);
    return null;
  }
}

/**
 * Check if companion is favorited
 */
export async function isCompanionFavorited(
  userId: string,
  companionId: string
): Promise<boolean> {
  const favorites = await getUserAIFavorites(userId);
  return favorites?.favoriteIds.includes(companionId) || false;
}

/**
 * Add companion to favorites
 */
export async function addToFavorites(
  userId: string,
  companionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore();
    const favorites = await getUserAIFavorites(userId);
    
    if (!favorites) {
      return { success: false, error: 'FAILED_TO_LOAD_FAVORITES' };
    }

    // Check if already favorited
    if (favorites.favoriteIds.includes(companionId)) {
      return { success: false, error: 'ALREADY_FAVORITED' };
    }

    // Add to favorites
    const newFavorites = [...favorites.favoriteIds, companionId];
    
    const favoritesRef = doc(db, 'ai_favorites', userId);
    await setDoc(favoritesRef, {
      userId,
      favoriteIds: newFavorites,
      pinnedId: favorites.pinnedId,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error adding to favorites:', error);
    return { success: false, error: 'PROCESSING_ERROR' };
  }
}

/**
 * Remove companion from favorites
 */
export async function removeFromFavorites(
  userId: string,
  companionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore();
    const favorites = await getUserAIFavorites(userId);
    
    if (!favorites) {
      return { success: false, error: 'FAILED_TO_LOAD_FAVORITES' };
    }

    // Remove from favorites
    const newFavorites = favorites.favoriteIds.filter(id => id !== companionId);
    
    // If the removed companion was pinned, unpin it
    const newPinnedId = favorites.pinnedId === companionId ? undefined : favorites.pinnedId;
    
    const favoritesRef = doc(db, 'ai_favorites', userId);
    await setDoc(favoritesRef, {
      userId,
      favoriteIds: newFavorites,
      pinnedId: newPinnedId,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error removing from favorites:', error);
    return { success: false, error: 'PROCESSING_ERROR' };
  }
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(
  userId: string,
  companionId: string
): Promise<{ success: boolean; isFavorited: boolean; error?: string }> {
  const isFavorited = await isCompanionFavorited(userId, companionId);
  
  if (isFavorited) {
    const result = await removeFromFavorites(userId, companionId);
    return { ...result, isFavorited: false };
  } else {
    const result = await addToFavorites(userId, companionId);
    return { ...result, isFavorited: true };
  }
}

/**
 * Pin a favorite companion (only one can be pinned at a time)
 */
export async function pinFavorite(
  userId: string,
  companionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore();
    const favorites = await getUserAIFavorites(userId);
    
    if (!favorites) {
      return { success: false, error: 'FAILED_TO_LOAD_FAVORITES' };
    }

    // Must be in favorites to pin
    if (!favorites.favoriteIds.includes(companionId)) {
      // Add to favorites first
      const addResult = await addToFavorites(userId, companionId);
      if (!addResult.success) {
        return addResult;
      }
    }

    // Set as pinned
    const favoritesRef = doc(db, 'ai_favorites', userId);
    await setDoc(favoritesRef, {
      userId,
      favoriteIds: favorites.favoriteIds.includes(companionId) 
        ? favorites.favoriteIds 
        : [...favorites.favoriteIds, companionId],
      pinnedId: companionId,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error pinning favorite:', error);
    return { success: false, error: 'PROCESSING_ERROR' };
  }
}

/**
 * Unpin the currently pinned favorite
 */
export async function unpinFavorite(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore();
    const favorites = await getUserAIFavorites(userId);
    
    if (!favorites || !favorites.pinnedId) {
      return { success: false, error: 'NO_PINNED_FAVORITE' };
    }

    const favoritesRef = doc(db, 'ai_favorites', userId);
    await setDoc(favoritesRef, {
      userId,
      favoriteIds: favorites.favoriteIds,
      pinnedId: undefined,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error unpinning favorite:', error);
    return { success: false, error: 'PROCESSING_ERROR' };
  }
}

/**
 * Get pinned companion ID
 */
export async function getPinnedCompanionId(userId: string): Promise<string | null> {
  const favorites = await getUserAIFavorites(userId);
  return favorites?.pinnedId || null;
}