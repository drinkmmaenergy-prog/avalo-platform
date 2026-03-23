/**
 * FIX 97A — Profile SSR Metadata Layout
 *
 * Server Component that provides dynamic Open Graph / Twitter meta tags
 * for public profile pages. Fetches profile data from Firestore via
 * firebase-admin so crawlers and social media link previews render correctly.
 *
 * NOTE: The actual profile UI is in page.tsx (a Client Component).
 * This layout only adds metadata; it does NOT render any visible UI.
 */

import type { Metadata } from 'next';
import { getAdminFirestore } from '@/lib/firebaseAdmin';

// ── Helpers ────────────────────────────────────────────
function calculateAge(dateOfBirth: string | { seconds: number }): number | null {
  try {
    let birthDate: Date;
    if (typeof dateOfBirth === 'string') {
      birthDate = new Date(dateOfBirth);
    } else if (dateOfBirth && typeof dateOfBirth === 'object' && 'seconds' in dateOfBirth) {
      birthDate = new Date(dateOfBirth.seconds * 1000);
    } else {
      return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 && age < 150 ? age : null;
  } catch {
    return null;
  }
}

// ── Metadata generation ────────────────────────────────
interface ProfileLayoutProps {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: ProfileLayoutProps): Promise<Metadata> {
  const { userId } = await params;

  try {
    const adminDb = getAdminFirestore();
    const profileSnap = await adminDb.collection('public_profiles').doc(userId).get();
    const profile = profileSnap.data();

    if (!profile) {
      return {
        title: 'Profile — Avalo',
        description: 'Connect on Avalo',
      };
    }

    const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;
    const title = `${profile.displayName || 'User'}${age ? `, ${age}` : ''} — Avalo`;
    const description = profile.bio || `Meet ${profile.displayName || 'this user'} on Avalo`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'profile',
        images: profile.photoURL ? [{ url: profile.photoURL, width: 400, height: 400 }] : [],
        siteName: 'Avalo',
      },
      twitter: {
        card: 'summary',
        title,
        description,
        images: profile.photoURL ? [profile.photoURL] : [],
      },
    };
  } catch {
    // Graceful fallback if firebase-admin is not configured
    return {
      title: 'Profile — Avalo',
      description: 'Connect on Avalo',
    };
  }
}

// ── Layout component (pass-through) ───────────────────
export default function ProfileUserIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
