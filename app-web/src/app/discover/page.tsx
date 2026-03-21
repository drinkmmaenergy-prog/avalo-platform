'use client';

/**
 * Discover Page — Creator/content discovery
 * Layout provides AppShell wrapping.
 *
 * Features:
 *   - "First message is free" banner at top
 *   - Grid of user cards from Firestore 'public_profiles' collection
 *   - Each card: avatar, name, age, earn_on badge, chat price badge, online indicator
 *   - Click card → navigate to /profile/[userId]
 *   - Search radius km selector (saved to users/{uid}.searchRadius in Firestore)
 *   - Collapsible dating-app style filters panel:
 *       Age range, gender, body type, hair color, interests, online only, earn on
 *   - Infinite scroll using Firestore pagination (limit 20, startAfter cursor)
 *   - Loading skeleton and empty state
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  Compass,
  Search,
  Loader2,
  Filter,
  Wifi,
  DollarSign,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
} from 'lucide-react';
import {
  fetchPublicProfiles,
  type PaginatedProfilesResult,
} from '@/lib/services/discoveryService';
import type {
  PublicProfile,
  DiscoverFilters,
  SearchRadiusValue,
} from '@/lib/types/publicProfile';
import {
  DEFAULT_DISCOVER_FILTERS,
  SEARCH_RADIUS_OPTIONS,
  DEFAULT_SEARCH_RADIUS,
  GENDER_OPTIONS,
  BODY_TYPE_OPTIONS,
  HAIR_COLOR_OPTIONS,
  INTEREST_OPTIONS,
} from '@/lib/types/publicProfile';
import type { DocumentSnapshot } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCROLL_THRESHOLD_PX = 300;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** "First message is free" promotional banner */
function FreeMessageBanner() {
  return (
    <div className="w-full rounded-xl bg-gradient-to-r from-primary-600 via-purple-500 to-pink-500 px-4 py-2.5 mb-6">
      <div className="flex items-center justify-center gap-2">
        <MessageCircle className="w-4 h-4 text-white/90" />
        <p className="text-sm font-medium text-white">
          First message is free — start a conversation!
        </p>
      </div>
    </div>
  );
}

/** Loading skeleton matching the photo card layout */
function CardSkeleton() {
  return (
    <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 animate-pulse">
      <div className="absolute inset-x-0 bottom-0 p-2 space-y-1">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3" />
        <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/3" />
      </div>
    </div>
  );
}

/** Grid skeleton for initial load */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Empty state when no profiles match */
function EmptyState({
  hasFilters,
  onSearchInternationally,
}: {
  hasFilters: boolean;
  onSearchInternationally: () => void;
}) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
        <Search className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        🔍 No profiles found nearby
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto mb-4">
        {hasFilters
          ? 'Try adjusting your filters or expand your search.'
          : 'Try expanding your search.'}
      </p>
      <button
        onClick={onSearchInternationally}
        className="inline-flex items-center px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition text-sm"
      >
        <MapPin className="w-4 h-4 mr-2" />
        Search Internationally
      </button>
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

/** Single profile card — Tinder/Badoo-style photo card with name, age, city overlay.
 *  Clicking navigates to /profile/[userId] */
function ProfileCard({
  profile,
  onClick,
}: {
  profile: PublicProfile;
  onClick: () => void;
}) {
  const photoSrc = profile.photoURL || (profile.photos && profile.photos.length > 0 ? profile.photos[0] : null);

  // Calculate age from dateOfBirth if available, otherwise fall back to pre-computed age field
  const age = profile.dateOfBirth
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : profile.age;

  const initial = profile.displayName?.charAt(0)?.toUpperCase() || '?';

  return (
    <button
      onClick={onClick}
      className="relative w-full aspect-[3/4] rounded-xl overflow-hidden cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm hover:shadow-md transition-shadow duration-200"
    >
      {/* Photo or gradient placeholder — edge-to-edge, no padding */}
      {photoSrc ? (
        <img
          src={photoSrc}
          alt={profile.displayName}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <span className="text-4xl font-bold text-white/80">{initial}</span>
        </div>
      )}

      {/* Online indicator — top right */}
      {profile.online && (
        <span
          className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full z-10"
          title="Online"
        />
      )}

      {/* Verified badge — top left */}
      {profile.verified && (
        <div className="absolute top-2 left-2 z-10">
          <BadgeCheck className="w-4 h-4 text-blue-400 drop-shadow-lg" />
        </div>
      )}

      {/* Earn-on / chat price badges — top right (below online dot) */}
      {profile.earn_on && (
        <div className="absolute top-7 right-2 flex flex-col gap-1 z-10">
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-medium bg-emerald-500/80 text-white rounded-full backdrop-blur-sm">
            <DollarSign className="w-2 h-2" />
            Earn
          </span>
          {profile.chat_price > 0 && (
            <span className="inline-flex items-center px-1 py-0.5 text-[9px] font-medium bg-amber-500/80 text-white rounded-full backdrop-blur-sm">
              {profile.chat_price}t
            </span>
          )}
        </div>
      )}

      {/* Dark gradient overlay at bottom for text readability */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

      {/* Name + Age + City — bottom left over gradient */}
      <div className="absolute inset-x-0 bottom-0 p-2 z-10">
        <div className="flex items-center gap-1">
          <p className="text-white font-bold text-sm leading-snug drop-shadow-md truncate">
            {profile.displayName}{age !== null && age > 0 ? `, ${age}` : ''}
          </p>
          {profile.verified && (
            <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 drop-shadow-md" />
          )}
        </div>
        {profile.city && (
          <p className="text-white/80 text-xs drop-shadow-md truncate mt-0.5">
            {profile.city}
          </p>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// SEARCH RADIUS SELECTOR
// ============================================================================

/** Granular km selector for search radius */
function SearchRadiusSelector({
  value,
  onChange,
}: {
  value: SearchRadiusValue;
  onChange: (v: SearchRadiusValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel =
    SEARCH_RADIUS_OPTIONS.find((o) => o.value === value)?.label ?? '50 km';

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-4 h-4 text-primary-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Search radius
        </span>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-750 transition-colors"
      >
        {currentLabel}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
          {SEARCH_RADIUS_OPTIONS.map((option) => (
            <button
              key={String(option.value)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                option.value === value
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-750'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE FILTERS PANEL
// ============================================================================

/** Dual-thumb age range slider (simplified with two range inputs) */
function AgeRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
        Age range: {min} – {max}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={18}
          max={99}
          value={min}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(Math.min(v, max - 1), max);
          }}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-primary-500"
        />
        <input
          type="range"
          min={18}
          max={99}
          value={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(min, Math.max(v, min + 1));
          }}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-pink-500"
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>18</span>
        <span>99</span>
      </div>
    </div>
  );
}

/** Multi-select checkbox group */
function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              selected.includes(opt.value)
                ? 'bg-primary-100 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-700 dark:text-primary-400'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Multi-select chip group (for strings like body type, hair color, interests) */
function ChipGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              selected.includes(opt)
                ? 'bg-pink-100 border-pink-300 text-pink-700 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-400'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Collapsible dating-app style filters panel */
function FiltersPanel({
  filters,
  onFiltersChange,
  onClear,
  searchRadius,
  onSearchRadiusChange,
}: {
  filters: DiscoverFilters;
  onFiltersChange: (filters: DiscoverFilters) => void;
  onClear: () => void;
  searchRadius: SearchRadiusValue;
  onSearchRadiusChange: (v: SearchRadiusValue) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters =
    filters.onlineOnly ||
    filters.earnOnOnly ||
    filters.ageMin > 18 ||
    filters.ageMax < 99 ||
    filters.genders.length > 0 ||
    filters.bodyTypes.length > 0 ||
    filters.hairColors.length > 0 ||
    filters.interests.length > 0;

  const activeCount = [
    filters.onlineOnly,
    filters.earnOnOnly,
    filters.ageMin > 18 || filters.ageMax < 99,
    filters.genders.length > 0,
    filters.bodyTypes.length > 0,
    filters.hairColors.length > 0,
    filters.interests.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="mb-6">
      {/* Top row: quick toggles + Filters button + search radius */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
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

        {/* Filters toggle button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            hasActiveFilters
              ? 'bg-primary-100 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-700 dark:text-primary-400'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-primary-500 text-white">
              {activeCount}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}

        {/* Search radius selector — right side */}
        <div className="ml-auto">
          <SearchRadiusSelector
            value={searchRadius}
            onChange={onSearchRadiusChange}
          />
        </div>
      </div>

      {/* Collapsible panel body */}
      {expanded && (
        <div className="card p-4 space-y-5 animate-slide-down">
          {/* Age range */}
          <AgeRangeSlider
            min={filters.ageMin}
            max={filters.ageMax}
            onChange={(ageMin, ageMax) =>
              onFiltersChange({ ...filters, ageMin, ageMax })
            }
          />

          {/* Gender */}
          <CheckboxGroup
            label="Gender"
            options={GENDER_OPTIONS}
            selected={filters.genders}
            onChange={(genders) =>
              onFiltersChange({
                ...filters,
                genders: genders as Array<'Man' | 'Woman' | 'Non-binary' | 'Other'>,
              })
            }
          />

          {/* Body type */}
          <ChipGroup
            label="Body type"
            options={BODY_TYPE_OPTIONS}
            selected={filters.bodyTypes}
            onChange={(bodyTypes) =>
              onFiltersChange({ ...filters, bodyTypes })
            }
          />

          {/* Hair color */}
          <ChipGroup
            label="Hair color"
            options={HAIR_COLOR_OPTIONS}
            selected={filters.hairColors}
            onChange={(hairColors) =>
              onFiltersChange({ ...filters, hairColors })
            }
          />

          {/* Interests / hobbies */}
          <ChipGroup
            label="Interests / hobbies"
            options={INTEREST_OPTIONS}
            selected={filters.interests}
            onChange={(interests) =>
              onFiltersChange({ ...filters, interests })
            }
          />
        </div>
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
  const { firebaseUser } = useAuth();

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
  const [searchRadius, setSearchRadius] =
    useState<SearchRadiusValue>(DEFAULT_SEARCH_RADIUS);

  // Ref for infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // ── Load saved search radius from Firestore ─────────────────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    const loadSavedRadius = async () => {
      try {
        const userDoc = await getDoc(
          doc(requireDb(), 'users', firebaseUser.uid)
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.searchRadius !== undefined) {
            setSearchRadius(data.searchRadius as SearchRadiusValue);
          }
        }
      } catch (err) {
        console.warn('[DiscoverPage] Failed to load saved search radius:', err);
      }
    };

    void loadSavedRadius();
  }, [firebaseUser?.uid]);

  // ── Save search radius to Firestore ─────────────────────────────────
  const handleSearchRadiusChange = useCallback(
    async (newRadius: SearchRadiusValue) => {
      setSearchRadius(newRadius);

      if (!firebaseUser?.uid) return;

      try {
        await setDoc(
          doc(requireDb(), 'users', firebaseUser.uid),
          { searchRadius: newRadius },
          { merge: true }
        );
      } catch (err) {
        console.warn('[DiscoverPage] Failed to save search radius:', err);
      }
    },
    [firebaseUser?.uid]
  );

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
      router.push(`/profile/${uid}`);
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
  // Uses partial (case-insensitive) match on displayName and city fields
  const filteredProfiles = searchQuery.trim()
    ? profiles.filter(
        (p) =>
          p.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.city?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : profiles;

  // ── Check if any filters are active (for empty state) ───────────────
  const hasActiveFilters =
    filters.onlineOnly ||
    filters.earnOnOnly ||
    filters.ageMin > 18 ||
    filters.ageMax < 99 ||
    filters.genders.length > 0 ||
    filters.bodyTypes.length > 0 ||
    filters.hairColors.length > 0 ||
    filters.interests.length > 0 ||
    searchQuery.trim().length > 0;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Free message banner */}
      <FreeMessageBanner />

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

      {/* Filters panel (collapsible, includes search radius) */}
      <FiltersPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClear={handleClearFilters}
        searchRadius={searchRadius}
        onSearchRadiusChange={handleSearchRadiusChange}
      />

      {/* Loading state */}
      {loading && <GridSkeleton />}

      {/* Error state */}
      {!loading && error && <ErrorState onRetry={handleRetry} />}

      {/* Empty state */}
      {!loading && !error && filteredProfiles.length === 0 && (
        <EmptyState
          hasFilters={hasActiveFilters}
          onSearchInternationally={() => handleSearchRadiusChange('international')}
        />
      )}

      {/* Profile grid — 2-col mobile, 3-col tablet, 4-col desktop */}
      {!loading && !error && filteredProfiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
