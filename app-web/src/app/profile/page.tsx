'use client';

/**
 * Profile Page — redirects to the full public profile view.
 * FIX 14: /profile now navigates to /profile/{uid} for the full public profile view.
 *
 * Layout provides AppShell wrapping.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

export default function ProfilePage() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const uid = firebaseUser?.uid ?? user?.uid;
    if (uid) {
      router.replace(`/profile/${uid}`);
    }
  }, [user, firebaseUser, router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading profile...</p>
      </div>
    </div>
  );
}
