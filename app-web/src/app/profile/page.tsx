'use client';

/**
 * Profile Page — user profile view
 * Layout provides AppShell wrapping.
 *
 * Routes:
 *   /profile          → Own profile (authenticated user)
 *   /profile?uid=xxx  → Public profile view (from Discover page)
 *
 * The public profile view includes:
 *   - Photos carousel
 *   - Bio, stats, badges
 *   - "Start Chat" button (if earn_on active)
 *   - "Start Chat" creates/opens conversation in Firestore, navigates to /chat?chatId=xxx
 */

import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import {
  Wallet,
  Shield,
  MessageCircle,
  Loader2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  MapPin,
  Users,
  FileText,
  UserPlus,
  DollarSign,
  Wifi,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { getTokenBalance } from '@/lib/services/tokenService';
import {
  getPublicProfile,
  findOrCreateChat,
} from '@/lib/services/discoveryService';
import type { PublicProfile } from '@/lib/types/publicProfile';

// ============================================================================
// OWN PROFILE (original canonical logic — unchanged)
// ============================================================================

function OwnProfileView() {
  const { user, firebaseUser } = useAuth();
  const { t } = useI18n();
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  useEffect(() => {
    const resolvedUid = firebaseUser?.uid ?? user?.uid;
    if (!resolvedUid) return;
    let active = true;

    const refreshFromCallable = async () => {
      const balance = await getTokenBalance(resolvedUid);
      if (active) setTokenBalance(balance);
    };

    // Seed from backend callable so profile reflects current balance after checkout redirect.
    void refreshFromCallable();

    const unsub = onSnapshot(
      doc(requireDb(), 'wallets', resolvedUid),
      (snap) => {
        if (snap.exists()) {
          setTokenBalance(snap.data().tokensBalance ?? snap.data().tokenBalance ?? 0);
        } else {
          void refreshFromCallable();
        }
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.error('[Profile] Token balance listener failed:', error);
        }
        void refreshFromCallable();
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [firebaseUser?.uid, user?.uid]);

  const displayName = user?.displayName ?? firebaseUser?.displayName ?? '';
  const email = user?.email ?? firebaseUser?.email ?? '';
  const photoURL = user?.photoURL ?? firebaseUser?.photoURL ?? '';
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('placeholder.profileTitle')}
        </h1>
        <Link
          href="/account"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-500 text-white font-semibold rounded-lg hover:bg-pink-600 transition-colors shadow-sm"
        >
          <Pencil className="w-4 h-4" />
          Edit Profile
        </Link>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-500 text-white flex items-center justify-center text-2xl font-bold">
              {initials}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{displayName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{email}</p>
            {user?.isCreator && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
                Creator
              </span>
            )}
          </div>
        </div>

        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          {t('placeholder.profileDesc')}
        </p>

        {user && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-primary-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('wallet.tokenBalance')}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{tokenBalance}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-green-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user.accountStatus ?? 'ACTIVE'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PUBLIC PROFILE VIEW (new — for /profile?uid=xxx from Discover)
// ============================================================================

/** Photo carousel for public profile */
function PhotoCarousel({ photos, displayName }: { photos: string[]; displayName: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <div className="w-full aspect-[4/5] bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="text-6xl text-gray-300 dark:text-gray-600">📷</div>
      </div>
    );
  }

  const goNext = () => setCurrentIndex((i) => (i + 1) % photos.length);
  const goPrev = () => setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);

  return (
    <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group">
      <img
        src={photos[currentIndex]}
        alt={`${displayName} photo ${currentIndex + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Navigation arrows (visible on hover when multiple photos) */}
      {photos.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Next photo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dots indicator */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex
                    ? 'bg-white w-4'
                    : 'bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`Photo ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Counter badge */}
      {photos.length > 1 && (
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          {currentIndex + 1}/{photos.length}
        </div>
      )}
    </div>
  );
}

/** Loading skeleton for public profile */
function PublicProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
      <div className="w-full aspect-[4/5] bg-gray-200 dark:bg-gray-700 rounded-xl mb-6" />
      <div className="flex items-center gap-3 mb-4">
        <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-10" />
      </div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
      <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
      <div className="flex gap-4 mb-6">
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
      </div>
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
    </div>
  );
}

/** Not found state */
function ProfileNotFound() {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto mb-4 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Profile not found
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        This user doesn&apos;t exist or their profile is no longer public.
      </p>
      <button
        onClick={() => router.push('/discover')}
        className="btn btn-primary"
      >
        Back to Discover
      </button>
    </div>
  );
}

/** Format large numbers (e.g. 1200 → "1.2K") */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Main public profile view */
function PublicProfileView({ uid }: { uid: string }) {
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // ── Fetch public profile ────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setNotFound(false);
        const result = await getPublicProfile(uid);
        if (!active) return;

        if (!result) {
          setNotFound(true);
        } else {
          setProfile(result);
        }
      } catch (err) {
        console.error('[PublicProfileView] Load error:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [uid]);

  // ── Start Chat handler ──────────────────────────────────────────────
  const handleStartChat = useCallback(async () => {
    if (!user?.uid) {
      router.push('/auth/login');
      return;
    }

    if (user.uid === uid) {
      return; // Can't chat with yourself
    }

    try {
      setStartingChat(true);
      setChatError(null);

      const { chatId } = await findOrCreateChat({
        currentUserId: user.uid,
        targetUserId: uid,
      });

      router.push(`/chat?chatId=${chatId}`);
    } catch (err: any) {
      console.error('[PublicProfileView] Start chat error:', err);
      setChatError(err.message || 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  }, [user, uid, router]);

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) return <PublicProfileSkeleton />;

  // ── Not found state ─────────────────────────────────────────────────
  if (notFound || !profile) return <ProfileNotFound />;

  const initials = profile.displayName
    ? profile.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const isOwnProfile = user?.uid === uid;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => router.push('/discover')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Discover
      </button>

      {/* Photo carousel */}
      <PhotoCarousel
        photos={profile.photos ?? []}
        displayName={profile.displayName}
      />

      {/* Name, age, verification */}
      <div className="mt-6 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {profile.displayName}
        </h1>
        {profile.age !== null && profile.age > 0 && (
          <span className="text-xl text-gray-500 dark:text-gray-400">
            {profile.age}
          </span>
        )}
        {profile.verified && (
          <BadgeCheck className="w-6 h-6 text-primary-500 flex-shrink-0" />
        )}
        {profile.online && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
            <Wifi className="w-3 h-3" />
            Online
          </span>
        )}
      </div>

      {/* Location */}
      {profile.location && (
        <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
          <MapPin className="w-4 h-4" />
          <span>{profile.location}</span>
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mt-4">
        {profile.earn_on && (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
            <DollarSign className="w-3 h-3" />
            Earn On — Chat Available
          </span>
        )}
        {profile.earn_on && profile.chat_price > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
            {profile.chat_price} tokens / message
          </span>
        )}
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            About
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Stats */}
      {profile.stats && (
        <div className="flex gap-0 mt-6 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="flex-1 text-center py-4 border-r border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCount(profile.stats.followers)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
          </div>
          <div className="flex-1 text-center py-4 border-r border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-1 mb-1">
              <UserPlus className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCount(profile.stats.following)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
          </div>
          <div className="flex-1 text-center py-4">
            <div className="flex items-center justify-center gap-1 mb-1">
              <FileText className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCount(profile.stats.posts)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Posts</p>
          </div>
        </div>
      )}

      {/* Start Chat button — only shown if earn_on and not own profile */}
      {profile.earn_on && !isOwnProfile && (
        <div className="mt-8">
          <button
            onClick={handleStartChat}
            disabled={startingChat}
            className="btn btn-primary w-full py-3 text-base font-semibold flex items-center justify-center gap-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startingChat ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Starting Chat...
              </>
            ) : (
              <>
                <MessageCircle className="w-5 h-5" />
                Start Chat
                {profile.chat_price > 0 && (
                  <span className="text-sm opacity-80 ml-1">
                    ({profile.chat_price} tokens/msg)
                  </span>
                )}
              </>
            )}
          </button>
          {chatError && (
            <p className="text-center text-sm text-red-500 mt-2">{chatError}</p>
          )}
        </div>
      )}

      {/* Info for non-earner profiles */}
      {!profile.earn_on && !isOwnProfile && (
        <div className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This user is not currently accepting paid chats.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ROUTER — decides between own profile and public profile
// ============================================================================

function ProfileRouter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const uid = searchParams?.get('uid') ?? null;

  // If ?uid=xxx is present, redirect to the new /profile/[userId] route
  // (backward-compatible: old links like /profile?uid=xxx still work)
  useEffect(() => {
    if (uid) {
      router.replace(`/profile/${uid}`);
    }
  }, [uid, router]);

  // Show loading skeleton while redirecting
  if (uid) {
    return <PublicProfileSkeleton />;
  }

  // Otherwise show the user's own profile (original behavior)
  return <OwnProfileView />;
}

// ============================================================================
// MAIN EXPORT — Suspense boundary for useSearchParams()
// ============================================================================

export default function ProfilePage() {
  return (
    <Suspense
      fallback={<PublicProfileSkeleton />}
    >
      <ProfileRouter />
    </Suspense>
  );
}
