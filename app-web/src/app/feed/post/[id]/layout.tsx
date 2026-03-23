/**
 * FIX 97B — Post SSR Metadata Layout
 *
 * Server Component that provides dynamic Open Graph / Twitter meta tags
 * for individual post pages. Fetches post data from Firestore via
 * firebase-admin so social media link previews render correctly.
 *
 * NOTE: The actual post UI is in page.tsx (a Client Component).
 * This layout only adds metadata; it does NOT render any visible UI.
 */

import type { Metadata } from 'next';
import { getAdminFirestore } from '@/lib/firebaseAdmin';

// ── Metadata generation ────────────────────────────────
interface PostLayoutProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PostLayoutProps): Promise<Metadata> {
  const { id: postId } = await params;

  try {
    const adminDb = getAdminFirestore();
    const postSnap = await adminDb.collection('posts').doc(postId).get();
    const post = postSnap.data();

    if (!post) {
      return {
        title: 'Post — Avalo',
        description: 'See this post on Avalo',
      };
    }

    const authorName = post.authorDisplayName || post.authorName || 'Someone';
    const title = `${authorName}'s post — Avalo`;
    const description = post.caption?.slice(0, 160) || `See this post on Avalo`;
    const imageUrl = post.mediaURLs?.[0] || post.thumbnailURL || null;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        images: imageUrl ? [{ url: imageUrl }] : [],
        siteName: 'Avalo',
      },
      twitter: {
        card: imageUrl ? 'summary_large_image' : 'summary',
        title,
        description,
        images: imageUrl ? [imageUrl] : [],
      },
    };
  } catch {
    // Graceful fallback if firebase-admin is not configured
    return {
      title: 'Post — Avalo',
      description: 'See this post on Avalo',
    };
  }
}

// ── Layout component (pass-through) ───────────────────
export default function PostIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
