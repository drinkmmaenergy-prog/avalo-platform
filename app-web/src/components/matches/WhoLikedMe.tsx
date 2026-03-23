'use client';

/**
 * FIX 111: "Who liked me" / "Who viewed my profile"
 *
 * MASSIVE monetization driver — Tinder charges for this.
 * - Free users: blurred list ("5 people liked you — upgrade to see who")
 * - VIP/Royal: full list with names and photos
 *
 * Reads from Firestore: likes collection where toUserId == current user.
 * Enriches with public_profiles for display.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard.
 *   - Uses useAuth() from AuthProvider.
 *   - FIX 113: Avatar component for optimized image loading.
 *   - likes collection is server-only write (created by likeUserV1).
 *   - Subscription tier from user profile (subscription field).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

interface LikeEntry {
  fromUserId: string;
  toUserId: string;
  mutual: boolean;
  createdAt: any;
  profile?: {
    displayName?: string;
    photoURL?: string;
    city?: string;
  } | null;
}

export default function WhoLikedMe() {
  const { firebaseUser, user } = useAuth();
  const router = useRouter();
  const [likedMe, setLikedMe] = useState<LikeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Determine VIP status from user profile
  const userSubscription = (user as any)?.subscription || (user as any)?.membershipTier || 'free';
  const isVIP = userSubscription === 'vip' || userSubscription === 'royal';

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();

    const loadLikes = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'likes'),
            where('toUserId', '==', firebaseUser.uid),
            where('mutual', '==', false),
            orderBy('createdAt', 'desc'),
            limit(20)
          )
        );

        const likes = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as LikeEntry;
            let profile: LikeEntry['profile'] = null;
            try {
              const profileSnap = await getDoc(
                doc(db, 'public_profiles', data.fromUserId)
              );
              profile = profileSnap.exists() ? (profileSnap.data() as LikeEntry['profile']) : null;
            } catch {
              // Silently fail — profile may not be accessible
            }
            return { ...data, profile } as LikeEntry;
          })
        );

        setLikedMe(likes.filter((l) => l.profile));
      } catch (err) {
        console.debug('[WhoLikedMe] Load error:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadLikes();
  }, [firebaseUser?.uid]);

  // Don't render if loading or no likes
  if (loading || likedMe.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-500 mb-3">
        ❤️ {likedMe.length} people liked you
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {likedMe.map((l, i) => (
          <div key={l.fromUserId || i} className="flex-shrink-0 w-20 text-center">
            <div
              className={`w-16 h-16 rounded-full mx-auto overflow-hidden border-2 border-pink-300 ${
                !isVIP ? 'blur-md' : ''
              }`}
            >
              <Avatar src={l.profile?.photoURL} name={l.profile?.displayName} size={64} />
            </div>
            <p className="text-[10px] mt-1 truncate">
              {isVIP ? l.profile?.displayName || 'Someone' : '???'}
            </p>
          </div>
        ))}
      </div>
      {!isVIP && likedMe.length > 0 && (
        <button
          onClick={() => router.push('/account/billing')}
          className="mt-2 w-full py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl text-sm font-medium"
        >
          👑 Upgrade to VIP to see who likes you
        </button>
      )}
    </div>
  );
}
