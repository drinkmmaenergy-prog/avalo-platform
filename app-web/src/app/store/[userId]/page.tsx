'use client';

/**
 * Creator Store Page — /store/[userId]
 *
 * FIX 125: Creator Store frontend for digital products.
 * Backend: creatorShop.ts (31KB), creatorStore.ts (18KB).
 * Creators sell digital products: photos, videos, presets, guides, audio.
 * Revenue split: 65/35 (UNLOCK_MEDIA).
 *
 * Features:
 *   - Creator header with avatar and store name
 *   - Product grid with preview images (blurred for unpurchased)
 *   - Purchase flow via Cloud Functions (purchaseDigitalProduct)
 *   - Download links for purchased products
 *   - Product type badges
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Purchases go through Cloud Functions — NOT direct Firestore writes.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { requireDb, functions } from '@/lib/firebase';
import EmptyState from '@/components/ui/EmptyState';

/** Product type icon map */
const TYPE_ICONS: Record<string, string> = {
  photo: '📸',
  video: '🎬',
  audio: '🎵',
  preset: '🎨',
  guide: '📖',
  document: '📄',
};

export default function CreatorStorePage() {
  const params = useParams();
  const userId = params?.userId as string;
  const { firebaseUser } = useAuth();
  const [creator, setCreator] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const db = requireDb();
    let active = true;

    const loadStore = async () => {
      try {
        // Load creator profile
        const profileSnap = await getDoc(doc(db, 'public_profiles', userId));
        if (active && profileSnap.exists()) {
          setCreator(profileSnap.data());
        }

        // Load active products
        const productsQuery = query(
          collection(db, 'shops', userId, 'items'),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
        );
        const productsSnap = await getDocs(productsQuery);
        if (active) {
          setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }

        // Load purchased items for current user
        if (firebaseUser?.uid) {
          const purchasesQuery = query(
            collection(db, 'media_purchases'),
            where('buyerId', '==', firebaseUser.uid),
            where('creatorId', '==', userId),
          );
          const purchasesSnap = await getDocs(purchasesQuery);
          if (active) {
            setPurchased(new Set(purchasesSnap.docs.map((d) => d.data().itemId)));
          }
        }
      } catch (err) {
        console.error('[CreatorStorePage] Load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadStore();
    return () => { active = false; };
  }, [userId, firebaseUser?.uid]);

  const handlePurchase = async (item: any) => {
    if (!firebaseUser?.uid) {
      alert('Please sign in to purchase');
      return;
    }
    if (purchased.has(item.id)) {
      alert('Already purchased!');
      return;
    }
    if (!confirm(`Buy "${item.title}" for ${item.price} tokens? (Creator gets 65%)`)) {
      return;
    }

    setPurchasing(item.id);
    try {
      const fn = httpsCallable(functions, 'purchaseDigitalProduct');
      await fn({ itemId: item.id, creatorId: userId, price: item.price });
      setPurchased((prev) => new Set([...prev, item.id]));
      alert('Purchased! Content unlocked.');
    } catch (err) {
      console.error('[CreatorStorePage] Purchase error:', err);
      alert('Purchase failed — check your balance');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#E4458F]" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* Creator header */}
      {creator && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
            {creator.photoURL ? (
              <img
                src={creator.photoURL}
                alt={creator.displayName || 'Creator'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6]" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">{creator.displayName}&apos;s Store</h1>
            <p className="text-sm text-gray-500">{products.length} items</p>
          </div>
        </div>
      )}

      {/* Products grid */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {products.map((item) => (
            <div key={item.id} className="border rounded-xl overflow-hidden bg-white dark:bg-gray-900">
              <div className="relative h-40">
                {item.previewURL ? (
                  <img
                    src={item.previewURL}
                    alt={item.title || 'Product preview'}
                    className={`w-full h-full object-cover ${
                      !purchased.has(item.id) ? 'blur-sm' : ''
                    }`}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-3xl">
                    {TYPE_ICONS[item.type] || '📄'}
                  </div>
                )}
                {!purchased.has(item.id) && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <span className="text-2xl">🔒</span>
                  </div>
                )}
                <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full capitalize">
                  {item.type}
                </span>
              </div>
              <div className="p-3">
                <p className="font-medium text-sm truncate">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                {purchased.has(item.id) ? (
                  <a
                    href={item.contentURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block w-full py-1.5 bg-green-500 text-white rounded-lg text-xs text-center font-medium hover:bg-green-600 transition-colors"
                  >
                    📥 Download
                  </a>
                ) : (
                  <button
                    onClick={() => handlePurchase(item)}
                    disabled={purchasing === item.id}
                    className="mt-2 w-full py-1.5 bg-[#E4458F] text-white rounded-lg text-xs font-medium hover:bg-[#D03A7D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {purchasing === item.id ? (
                      <span className="flex items-center justify-center gap-1">
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                        Processing...
                      </span>
                    ) : (
                      `Unlock — ${item.price} tokens`
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {products.length === 0 && (
        <EmptyState
          icon="🛍️"
          title="No products yet"
          description="This creator hasn't added any products to their store."
        />
      )}
    </div>
  );
}
