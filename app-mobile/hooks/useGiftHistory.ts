/**
 * PACK 79 — In-Chat Paid Gifts
 * Hook: useGiftHistory
 * Fetches gift transaction history for a specific chat
 */

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GiftTransaction } from '../types/gifts';

interface UseGiftHistoryOptions {
  pageSize?: number;
  userId?: string; // Filter by specific user (sender or receiver)
}

interface UseGiftHistoryReturn {
  gifts: GiftTransaction[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => void;
}

/**
 * Hook to fetch gift history for a specific chat
 */
export function useGiftHistory(
  chatId: string,
  options: UseGiftHistoryOptions = {}
): UseGiftHistoryReturn {
  const [gifts, setGifts] = useState<GiftTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const { pageSize = 20, userId } = options;

  useEffect(() => {
    if (!chatId) {
      setGifts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query
      const giftsRef = collection(db, 'gift_transactions');
      let q = query(
        giftsRef,
        where('chatId', '==', chatId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      // Filter by user if specified
      if (userId) {
        // Note: This requires a composite index
        q = query(
          giftsRef,
          where('chatId', '==', chatId),
          where('senderId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
      }

      // Subscribe to real-time updates
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const giftList: GiftTransaction[] = [];
          
          snapshot.forEach((doc) => {
            giftList.push({
              id: doc.id,
              ...doc.data(),
            } as GiftTransaction);
          });

          setGifts(giftList);
          setHasMore(giftList.length === pageSize);
          
          if (!snapshot.empty) {
            setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          }
          
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching gift history:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up gift history listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [chatId, userId, pageSize, refetchTrigger]);

  const loadMore = async () => {
    if (!hasMore || !lastDoc) return;

    try {
      const giftsRef = collection(db, 'gift_transactions');
      let q = query(
        giftsRef,
        where('chatId', '==', chatId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );

      if (userId) {
        q = query(
          giftsRef,
          where('chatId', '==', chatId),
          where('senderId', '==', userId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const moreGifts: GiftTransaction[] = [];

      snapshot.forEach((doc) => {
        moreGifts.push({
          id: doc.id,
          ...doc.data(),
        } as GiftTransaction);
      });

      setGifts((prev) => [...prev, ...moreGifts]);
      setHasMore(moreGifts.length === pageSize);

      if (!snapshot.empty) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
    } catch (err) {
      console.error('Error loading more gifts:', err);
      setError(err as Error);
    }
  };

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
    setLastDoc(null);
  };

  return {
    gifts,
    loading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}

/**
 * Hook to fetch user's gift statistics
 */
export function useUserGiftStats(userId: string) {
  const [stats, setStats] = useState({
    totalSent: 0,
    totalReceived: 0,
    tokensSpent: 0,
    tokensEarned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userRef = collection(db, 'users');
      const q = query(userRef, where('id', '==', userId));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            const giftStats = userData.giftStats || {};

            setStats({
              totalSent: giftStats.totalSent || 0,
              totalReceived: giftStats.totalReceived || 0,
              tokensSpent: giftStats.tokensSpent || 0,
              tokensEarned: giftStats.tokensEarned || 0,
            });
          }
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching user gift stats:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up gift stats listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [userId]);

  return { stats, loading, error };
}

/**
 * Hook to fetch a single gift transaction
 */
export function useGiftTransaction(transactionId: string | null) {
  const [transaction, setTransaction] = useState<GiftTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setTransaction(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const transactionRef = collection(db, 'gift_transactions');
      const q = query(transactionRef, where('id', '==', transactionId));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            setTransaction({
              id: doc.id,
              ...doc.data(),
            } as GiftTransaction);
          } else {
            setTransaction(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching gift transaction:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up transaction listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [transactionId]);

  return { transaction, loading, error };
}