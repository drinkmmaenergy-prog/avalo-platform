'use client';

/**
 * PACK 343 — Profile Edit Page (REDIRECT)
 * Route: /account/profile
 *
 * Profile editing has been merged into the Overview tab (/account).
 * This page now redirects to /account for backwards compatibility.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileEditPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/account');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to account...</p>
      </div>
    </div>
  );
}
