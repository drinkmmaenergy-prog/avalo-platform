'use client';

/**
 * useAuthGuard — Central auth guard hook.
 *
 * Implements the required behavior:
 *   - If user NOT logged in → show AuthModal (not redirect to onboarding)
 *   - If user logged in AND onboarding incomplete → redirect to /onboarding
 *   - If user logged in AND onboarding complete → allow access
 *
 * PUBLIC ROUTES (no auth required):
 *   /, /features, /download, /creators, /investor, /legal/*
 *
 * All other routes require auth.
 *
 * INVARIANTS:
 *   - No automatic redirect to onboarding if not logged in.
 *   - Auth modal is shown, not a page redirect.
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthModal } from '@/components/AuthModal';

/** Routes that do not require authentication. */
const PUBLIC_ROUTES = [
  '/',
  '/features',
  '/download',
  '/creators',
  '/investor',
  '/investors',
  '/safety',
  '/auth',
  '/auth/login',
  '/auth/register',
  '/auth/signup',
  '/auth/forgot-password',
];

/** Route prefixes that do not require authentication. */
const PUBLIC_PREFIXES = ['/legal/', '/(marketing)'];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

interface UseAuthGuardOptions {
  /** Override: force require auth even on public routes */
  requireAuth?: boolean;
  /** Where to redirect after auth completes */
  redirectAfterAuth?: string;
}

interface UseAuthGuardResult {
  /** Whether the user is allowed to see the current page */
  isAllowed: boolean;
  /** Whether auth state is still loading */
  isLoading: boolean;
  /** The current user (null if not logged in) */
  user: ReturnType<typeof useAuth>['user'];
  /** The Firebase user (null if not logged in) */
  firebaseUser: ReturnType<typeof useAuth>['firebaseUser'];
}

export function useAuthGuard(options: UseAuthGuardOptions = {}): UseAuthGuardResult {
  const { requireAuth = false, redirectAfterAuth } = options;
  const router = useRouter();
  const pathname = usePathname();
  const { user, firebaseUser, loading, needsOnboarding } = useAuth();
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    if (loading) return;

    const isPublic = isPublicRoute(pathname ?? '/');

    // Not logged in
    if (!firebaseUser) {
      if (!isPublic || requireAuth) {
        // Show auth modal instead of redirecting
        openAuthModal(redirectAfterAuth ?? pathname ?? '/feed');
      }
      return;
    }

    // Logged in but needs onboarding
    if (needsOnboarding && pathname !== '/onboarding') {
      router.replace('/onboarding');
      return;
    }
  }, [loading, firebaseUser, needsOnboarding, pathname, requireAuth, redirectAfterAuth, router, openAuthModal]);

  const isPublic = isPublicRoute(pathname ?? '/');
  const isAllowed =
    loading ||
    isPublic ||
    (!!firebaseUser && !needsOnboarding) ||
    pathname === '/onboarding';

  return {
    isAllowed,
    isLoading: loading,
    user,
    firebaseUser,
  };
}

export default useAuthGuard;
