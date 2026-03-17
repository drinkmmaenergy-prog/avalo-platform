'use client';

/**
 * Discover Page — Creator/content discovery
 * Layout provides AppShell wrapping.
 *
 * Features:
 *   - Grid of user cards from Firestore 'public_profiles' collection
 *   - Each card: avatar, name, age, earn_on badge, chat price badge, online indicator
 *   - Click card → navigate to /profile?uid=xxx
 *   - Filter bar: online only, earn_on only, price range
 *   - Infinite scroll using Firestore pagination (limit 20, startAfter cursor)
 *   - Loading skeleton and empty state
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import {
  Compass,
  Search,
  Loader2,
  Filter,
  Wifi,
  DollarSign,
  BadgeCheck,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  fetchPublicProfiles,
  type PaginatedProfilesResult,
} from '@/lib/services/discoveryService';
import type {
  PublicProfile,
  DiscoverFilters,
} from '@/lib/types/publicProfile';
import { DEFAULT_DISCOVER_FILTERS } from '@/lib/types/publicProfile';
import type { DocumentSnapshot } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCROLL_THRESHOLD_PX = 300;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Loading skeleton matching the card layout */
function CardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
      </div>
    </div>
  );
}

/** Grid skeleton for initial load */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Empty state when no profiles match */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
        <Compass className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {hasFilters ? 'No matches found' : 'Discovery is growing'}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your filters to see more creators.'
          : 'More creators join every day. Check back soon!'}
      </p>
    </div>
  );
}

/** Error state */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4 flex items-center justify-center">
        <X className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Something went wrong
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
        Could not load profiles. Please try again.
      </p>
      <button onClick={onRetry} className="btn btn-primary">
        Retry
      </button>
    </div>
  );
}

/** Single profile card */
function ProfileCard({
  profile,
  onClick,
}: {
  profile: PublicProfile;
  onClick: () => void;
}) {
  const initials = profile.displayName
    ? profile.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <button
      onClick={onClick}
      className="card p-4 text-left w-full hover:ring-2 hover:ring-primary-500/50 transition-all duration-200 cursor-pointer group"
    >
      {/* Avatar row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative flex-shrink-0">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-primary-400 transition-all"
              loading="lazy"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary-500 text-white flex items-center justify-center text-lg font-bold">
              {initials}
            </div>
          )}
          {/* Online indicator */}
          {profile.online && (
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"
              title="Online"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {profile.displayName}
            </h3>
            {profile.verified && (
              <BadgeCheck className="w-4 h-4 text-primary-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {profile.age !== null && profile.age > 0 && (
              <span>{profile.age} y/o</span>
            )}
            {profile.age !== null && profile.age > 0 && profile.location && (
              <span className="mx-1">·</span>
            )}
            {profile.location && <span>{profile.location}</span>}
          </p>
        </div>
      </div>

      {/* Bio preview */}
      {profile.bio && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
          {profile.bio}
        </p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5">
        {profile.earn_on && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
            <DollarSign className="w-3 h-3" />
            Earn On
          </span>
        )}
        {profile.earn_on && profile.chat_price > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
            {profile.chat_price} tokens
          </span>
        )}
        {profile.online && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
            <Wifi className="w-3 h-3" />
            Online
          </span>
        )}
      </div>

      {/* Stats row */}
      {profile.stats && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCount(profile.stats.followers)}
            </span>{' '}
            followers
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCount(profile.stats.posts)}
            </span>{' '}
            posts
          </div>
        </div>
      )}
    </button>
  );
}

/** Filter bar component */
function FilterBar({
  filters,
  onFiltersChange,
  onClear,
}: {
  filters: DiscoverFilters;
  onFiltersChange: (filters: DiscoverFilters) => void;
  onClear: () => void;
}) {
  const [showPriceRange, setShowPriceRange] = useState(false);
  const [priceMinInput, setPriceMinInput] = useState('');
  const [priceMaxInput, setPriceMaxInput] = useState('');

  const hasActiveFilters =
    filters.onlineOnly ||
    filters.earnOnOnly ||
    filters.priceMin !== null ||
    filters.priceMax !== null;

  const handleApplyPrice = () => {
    const min = priceMinInput ? parseInt(priceMinInput, 10) : null;
    const max = priceMaxInput ? parseInt(priceMaxInput, 10) : null;
    onFiltersChange({
      ...filters,
      priceMin: min && !isNaN(min) && min > 0 ? min : null,
      priceMax: max && !isNaN(max) && max > 0 ? max : null,
    });
    setShowPriceRange(false);
  };

  const handleClearAll = () => {
    setPriceMinInput('');
    setPriceMaxInput('');
    setShowPriceRange(false);
    onClear();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mr-1">
        <Filter className="w-4 h-4" />
        <span className="hidden sm:inline">Filters</span>
      </div>

      {/* Online Only toggle */}
      <button
        onClick={() =>
          onFiltersChange({ ...filters, onlineOnly: !filters.onlineOnly })
        }
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
          filters.onlineOnly
            ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
        }`}
      >
        <Wifi className="w-3 h-3" />
        Online Only
      </button>

      {/* Earn On toggle */}
      <button
        onClick={() =>
          onFiltersChange({ ...filters, earnOnOnly: !filters.earnOnOnly })
        }
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
          filters.earnOnOnly
            ? 'bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
        }`}
      >
        <DollarSign className="w-3 h-3" />
        Earn On
      </button>

      {/* Price Range dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowPriceRange(!showPriceRange)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            filters.priceMin !== null || filters.priceMax !== null
              ? 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
          }`}
        >
          Price Range
          <ChevronDown className="w-3 h-3" />
        </button>

        {showPriceRange && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[200px]">
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                placeholder="Min"
                value={priceMinInput}
                onChange={(e) => setPriceMinInput(e.target.value)}
                className="input text-xs w-20 py-1"
                min="0"
              />
              <span className="text-gray-400 self-center">–</span>
              <input
                type="number"
                placeholder="Max"
                value={priceMaxInput}
                onChange={(e) => setPriceMaxInput(e.target.value)}
                className="input text-xs w-20 py-1"
                min="0"
              />
            </div>
            <button
              onClick={handleApplyPrice}
              className="btn btn-primary text-xs w-full py-1"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={handleClearAll}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format large numbers (e.g. 1200 → "1.2K") */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function DiscoverPage() {
  const { t } = useI18n();
  const router = useRouter();

  // ── State ───────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DiscoverFilters>(
    DEFAULT_DISCOVER_FILTERS
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Ref for infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // ── Initial + filter-change fetch ───────────────────────────────────
  const loadProfiles = useCallback(
    async (resetCursor: boolean = false) => {
      try {
        if (resetCursor) {
          setLoading(true);
          setError(null);
        } else {
          if (loadingMoreRef.current) return;
          setLoadingMore(true);
        }
        loadingMoreRef.current = true;

        const result: PaginatedProfilesResult = await fetchPublicProfiles(
          resetCursor ? null : cursor,
          filters
        );

        if (resetCursor) {
          setProfiles(result.items);
        } else {
          setProfiles((prev) => [...prev, ...result.items]);
        }

        setCursor(result.lastDoc);
        setHasMore(result.hasMore);
      } catch (err: any) {
        console.error('[DiscoverPage] Load error:', err);
        setError(err.message || 'Failed to load profiles');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [cursor, filters]
  );

  // Initial load
  useEffect(() => {
    void loadProfiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ── Infinite scroll via IntersectionObserver ────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          hasMore &&
          !loadingMoreRef.current &&
          !loading
        ) {
          void loadProfiles(false);
        }
      },
      { rootMargin: `${SCROLL_THRESHOLD_PX}px` }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadProfiles]);

  // ── Filter handlers ─────────────────────────────────────────────────
  const handleFiltersChange = useCallback((newFilters: DiscoverFilters) => {
    setFilters(newFilters);
    setCursor(null);
    setHasMore(true);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_DISCOVER_FILTERS);
    setCursor(null);
    setHasMore(true);
  }, []);

  // ── Card click → navigate to public profile ─────────────────────────
  const handleCardClick = useCallback(
    (uid: string) => {
      router.push(`/profile?uid=${uid}`);
    },
    [router]
  );

  // ── Retry on error ──────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setCursor(null);
    setHasMore(true);
    setError(null);
    void loadProfiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ── Client-side search filter (supplements server filters) ──────────
  const filteredProfiles = searchQuery.trim()
    ? profiles.filter(
        (p) =>
          p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.location &&
            p.location.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : profiles;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
        {t('placeholder.discoverTitle')}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('placeholder.discoverDesc')}
      </p>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input pl-10"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClear={handleClearFilters}
      />

      {/* Loading state */}
      {loading && <GridSkeleton />}

      {/* Error state */}
      {!loading && error && <ErrorState onRetry={handleRetry} />}

      {/* Empty state */}
      {!loading && !error && filteredProfiles.length === 0 && (
        <EmptyState
          hasFilters={
            filters.onlineOnly ||
            filters.earnOnOnly ||
            filters.priceMin !== null ||
            filters.priceMax !== null ||
            searchQuery.trim().length > 0
          }
        />
      )}

      {/* Profile grid */}
      {!loading && !error && filteredProfiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.uid}
              profile={profile}
              onClick={() => handleCardClick(profile.uid)}
            />
          ))}
        </div>
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      )}

      {/* No more results */}
      {!loading &&
        !error &&
        !hasMore &&
        filteredProfiles.length > 0 &&
        !searchQuery.trim() && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            You&apos;ve reached the end
          </p>
        )}

      {/* Infinite scroll sentinel — invisible element observed by IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
