/**
 * PACK 79 — In-Chat Paid Gifts
 * Hook: useGiftCatalog
 * Fetches and manages gift catalog from Firestore
 */

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GiftCatalog, sortGiftsByRarity } from '../types/gifts';

interface UseGiftCatalogOptions {
  activeOnly?: boolean;
  sortBy?: 'rarity' | 'price' | 'name';
}

interface UseGiftCatalogReturn {
  gifts: GiftCatalog[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch and subscribe to gift catalog
 */
export function useGiftCatalog(
  options: UseGiftCatalogOptions = { activeOnly: true, sortBy: 'rarity' }
): UseGiftCatalogReturn {
  const [gifts, setGifts] = useState<GiftCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const { activeOnly = true, sortBy = 'rarity' } = options;

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      // Build query
      const giftsRef = collection(db, 'gift_catalog');
      let q = query(giftsRef);

      // Filter by active status
      if (activeOnly) {
        q = query(q, where('isActive', '==', true));
      }

      // Add ordering (default by sortOrder or price)
      q = query(q, orderBy('sortOrder', 'asc'));

      // Subscribe to real-time updates
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const giftList: GiftCatalog[] = [];
          
          snapshot.forEach((doc) => {
            giftList.push({
              id: doc.id,
              ...doc.data(),
            } as GiftCatalog);
          });

          // Apply sorting based on sortBy option
          let sortedGifts = giftList;
          
          switch (sortBy) {
            case 'rarity':
              sortedGifts = sortGiftsByRarity(giftList);
              break;
            case 'price':
              sortedGifts = giftList.sort((a, b) => b.priceTokens - a.priceTokens);
              break;
            case 'name':
              sortedGifts = giftList.sort((a, b) => a.name.localeCompare(b.name));
              break;
          }

          setGifts(sortedGifts);
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching gift catalog:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up gift catalog listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [activeOnly, sortBy, refetchTrigger]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return {
    gifts,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook to fetch a single gift by ID
 */
export function useGift(giftId: string | null): {
  gift: GiftCatalog | null;
  loading: boolean;
  error: Error | null;
} {
  const [gift, setGift] = useState<GiftCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!giftId) {
      setGift(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const giftRef = collection(db, 'gift_catalog');
      const q = query(giftRef, where('id', '==', giftId));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            setGift({
              id: doc.id,
              ...doc.data(),
            } as GiftCatalog);
          } else {
            setGift(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching gift:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up gift listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [giftId]);

  return { gift, loading, error };
}