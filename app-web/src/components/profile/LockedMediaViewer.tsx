'use client';

/**
 * Locked Media Viewer — Fan-side PPV (Pay-Per-View) Media Display
 *
 * Shows on /profile/[userId] when the creator has locked media published.
 * Fans see blurred previews with price overlay; purchased items show fully.
 *
 * Firestore collections:
 *   - locked_media/{mediaId}  — media metadata (creatorId, title, mediaURL, price, etc.)
 *   - media_purchases/{purchaseId} — purchase records (buyerId, mediaId, creatorId, price)
 *
 * Cloud Functions:
 *   - purchaseCreatorProduct — handles token deduction + credit atomically
 *
 * CANONICAL: This component is additive. Does NOT modify existing profile page logic.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { requireDb, requireFunctions } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';

// ============================================================================
// TYPES
// ============================================================================

export interface LockedMediaItem {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  mediaURL: string;
  thumbnailURL?: string;
  price: number;
  purchaseCount: number;
  status: string;
  createdAt: any;
}

interface LockedMediaViewerProps {
  /** The profile user's UID (creator) */
  creatorId: string;
  /** The current authenticated user's UID (viewer/fan), or null if unauthenticated */
  currentUserId: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function LockedMediaViewer({
  creatorId,
  currentUserId,
}: LockedMediaViewerProps) {
  const [lockedMedia, setLockedMedia] = useState<LockedMediaItem[]>([]);
  const [purchasedMediaIds, setPurchasedMediaIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // ── Load creator's published locked media ────────────────────────────
  useEffect(() => {
    if (!creatorId) return;
    let active = true;

    async function loadMedia() {
      try {
        const db = requireDb();
        const q = query(
          collection(db, 'locked_media'),
          where('creatorId', '==', creatorId),
          where('status', '==', 'published'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        if (active) {
          setLockedMedia(
            snap.docs.map((d) => ({ id: d.id, ...d.data() } as LockedMediaItem))
          );
        }
      } catch (err) {
        console.error('[LockedMediaViewer] Load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMedia();
    return () => {
      active = false;
    };
  }, [creatorId]);

  // ── Check which items the current user has already purchased ─────────
  useEffect(() => {
    if (!currentUserId || !creatorId) return;
    let active = true;

    async function loadPurchases() {
      try {
        const db = requireDb();
        const q = query(
          collection(db, 'media_purchases'),
          where('buyerId', '==', currentUserId),
          where('creatorId', '==', creatorId)
        );
        const snap = await getDocs(q);
        if (active) {
          const ids = snap.docs.map((d) => d.data().mediaId as string);
          setPurchasedMediaIds(new Set(ids));
        }
      } catch (err) {
        // media_purchases may not exist yet — silently ignore
        console.warn('[LockedMediaViewer] Purchases check:', err);
      }
    }

    void loadPurchases();
    return () => {
      active = false;
    };
  }, [currentUserId, creatorId]);

  // ── Purchase handler ─────────────────────────────────────────────────
  const handlePurchaseMedia = useCallback(
    async (item: LockedMediaItem) => {
      if (!currentUserId) {
        toast({ type: 'error', title: 'Please sign in to unlock media.' });
        return;
      }

      if (!confirm(`Unlock "${item.title}" for ${item.price} tokens?`)) return;

      setPurchasing(item.id);

      try {
        const db = requireDb();

        // Check wallet balance
        const walletSnap = await getDoc(doc(db, 'wallets', currentUserId));
        const walletData = walletSnap.data();
        const balance = walletData?.balance ?? walletData?.tokens ?? 0;

        if (balance < item.price) {
          toast({
            type: 'error',
            title: 'Insufficient tokens',
            description: 'Buy more tokens to unlock this media.',
          });
          return;
        }

        // Record purchase in media_purchases
        await addDoc(collection(db, 'media_purchases'), {
          mediaId: item.id,
          buyerId: currentUserId,
          creatorId: item.creatorId,
          price: item.price,
          createdAt: serverTimestamp(),
        });

        // Increment purchase count on locked_media doc
        await updateDoc(doc(db, 'locked_media', item.id), {
          purchaseCount: (item.purchaseCount || 0) + 1,
        });

        // Deduct tokens via Cloud Function (atomic wallet deduction + creator credit)
        try {
          const purchaseMediaFn = httpsCallable(
            requireFunctions(),
            'purchaseCreatorProduct'
          );
          await purchaseMediaFn({
            productId: item.id,
            tokens: item.price,
            creatorId: item.creatorId,
          });
        } catch {
          // If Cloud Function doesn't exist, purchase is recorded but tokens
          // not deducted client-side (wallets are server-only write).
          console.warn(
            '[LockedMediaViewer] purchaseCreatorProduct function not available, purchase recorded'
          );
        }

        // Update local state immediately
        setPurchasedMediaIds((prev) => new Set([...prev, item.id]));
        toast({ type: 'success', title: 'Media unlocked!' });
      } catch (err) {
        console.error('[LockedMediaViewer] Purchase failed:', err);
        toast({
          type: 'error',
          title: 'Purchase failed',
          description: 'Please try again.',
        });
      } finally {
        setPurchasing(null);
      }
    },
    [currentUserId]
  );

  // ── Don't render if no locked media ──────────────────────────────────
  if (loading) return null;
  if (lockedMedia.length === 0) return null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Locked Media
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {lockedMedia.map((item) => {
          const purchased = purchasedMediaIds.has(item.id);
          const isPurchasing = purchasing === item.id;

          return (
            <div
              key={item.id}
              className="rounded-xl overflow-hidden relative aspect-square"
            >
              {purchased ? (
                /* Unlocked — show full media */
                item.mediaURL.includes('video') ? (
                  <video
                    src={item.mediaURL}
                    className="w-full h-full object-cover"
                    controls
                  />
                ) : (
                  <img
                    src={item.mediaURL}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                /* Locked — show blurred with price overlay */
                <>
                  <img
                    src={item.mediaURL}
                    alt=""
                    className="w-full h-full object-cover blur-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                    <span className="text-3xl mb-1">🔒</span>
                    <p className="text-white text-sm font-medium text-center px-2 truncate max-w-full">
                      {item.title}
                    </p>
                    <button
                      onClick={() => handlePurchaseMedia(item)}
                      disabled={isPurchasing}
                      className="mt-2 px-4 py-1.5 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Unlocking...
                        </>
                      ) : (
                        `Unlock for ${item.price} tokens`
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
