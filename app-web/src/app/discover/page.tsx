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

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { calculateDistanceKm } from '@/lib/services/geocodingService';
import { OptimizedImage } from '@/components/ui/Avatar';
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
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, serverTimestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { requireDb, functions } from '@/lib/firebase';
import ActiveLivesBanner from '@/components/feed/ActiveLivesBanner';
import SponsoredAdCard, { type SponsoredAd } from '@/components/ads/SponsoredAdCard';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCROLL_THRESHOLD_PX = 300;

// FIX 91: Discovery question cards — compatibility icebreaker questions
const DISCOVERY_QUESTIONS = [
  'What makes you laugh the most?',
  'Where do you see yourself in 5 years?',
  'What\'s your love language?',
  'City life or countryside?',
  'Morning person or night owl?',
  'What\'s your guilty pleasure?',
  'If you won the lottery tomorrow, what\'s the first thing you\'d do?',
  'What quality do you value most in a partner?',
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * FIX 91: Discovery Question Card — icebreaker questions between profiles.
 * Answers saved to users/{uid}/answers collection and visible on profile.
 */
function DiscoveryQuestionCard({
  question,
  userId,
}: {
  question: string;
  userId: string | undefined;
}) {
  const [answer, setAnswer] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async () => {
    if (!answer.trim() || !userId) return;
    try {
      const db = requireDb();
      await addDoc(collection(db, 'users', userId, 'answers'), {
        question,
        answer: answer.trim(),
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('[DiscoveryQuestionCard] Submit error:', err);
    }
  };

  if (submitted) {
    return (
      <div className="col-span-full p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl my-2">
        <p className="text-xs text-green-600 font-medium">✓ Answer shared on your profile!</p>
      </div>
    );
  }

  return (
    <div className="col-span-full p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl my-2">
      <p className="text-xs text-[#E4458F] font-medium mb-1">Quick Question</p>
      <p className="text-sm font-medium">{question}</p>
      <div className="flex gap-2 mt-3">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer..."
          className="flex-1 px-3 py-1.5 border rounded-full text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={!answer.trim()}
          className="px-3 py-1.5 bg-[#E4458F] text-white rounded-full text-xs disabled:opacity-50"
        >
          Share
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Answers visible on your profile — great conversation starters!</p>
    </div>
  );
}

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
  userLocation,
  onLike,
  onSuperLike,
  isLiked,
  showFreeChatBadge,
  onFreeChat,
}: {
  profile: PublicProfile;
  onClick: () => void;
  userLocation?: { lat: number; lng: number } | null;
  onLike?: (uid: string) => void;
  onSuperLike?: (uid: string) => void;
  isLiked?: boolean;
  showFreeChatBadge?: boolean;
  onFreeChat?: (uid: string) => void;
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
      className={`relative w-full aspect-[3/4] rounded-xl overflow-hidden cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm hover:shadow-md transition-shadow duration-200 ${isLiked ? 'opacity-50' : ''}`}
    >
      {/* FIX 72: Free Chat badge for less popular profiles */}
      {showFreeChatBadge && (
        <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-medium z-20">
          Free Chat
        </span>
      )}

      {/* Photo or gradient placeholder — edge-to-edge, no padding */}
      {photoSrc ? (
        <OptimizedImage
          src={photoSrc}
          alt={profile.displayName}
          width={200}
          height={250}
          fill
          className="group-hover:scale-105 transition-transform duration-300"
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
            {/* FIX 50D: Show distance if user location and profile location are available */}
            {userLocation && profile.location && typeof profile.location !== 'string' && profile.location.lat && profile.location.lng && (
              <span className="ml-1 text-white/70">
                · {Math.round(calculateDistanceKm(userLocation.lat, userLocation.lng, profile.location.lat, profile.location.lng))} km
              </span>
            )}
          </p>
        )}
      </div>

      {/* FIX 68: Like / SuperLike / FreeChat action buttons */}
      <div className="absolute bottom-2 right-2 flex gap-1 z-20">
        {showFreeChatBadge && onFreeChat && (
          <button
            onClick={(e) => { e.stopPropagation(); onFreeChat(profile.uid); }}
            className="w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-green-50 transition"
            title="Free Chat"
          >
            💬
          </button>
        )}
        {onLike && (
          <button
            onClick={(e) => { e.stopPropagation(); onLike(profile.uid); }}
            className="w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-pink-50 transition"
            title="Like"
          >
            ❤️
          </button>
        )}
        {onSuperLike && (
          <button
            onClick={(e) => { e.stopPropagation(); onSuperLike(profile.uid); }}
            className="w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-yellow-50 transition"
            title="SuperLike (50 tokens)"
          >
            ⭐
          </button>
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
    filters.verifiedOnly ||
    filters.ageMin > 18 ||
    filters.ageMax < 99 ||
    filters.genders.length > 0 ||
    filters.bodyTypes.length > 0 ||
    filters.hairColors.length > 0 ||
    filters.interests.length > 0;

  const activeCount = [
    filters.onlineOnly,
    filters.earnOnOnly,
    filters.verifiedOnly,
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

        {/* FIX 78: Verified Only toggle */}
        <button
          onClick={() =>
            onFiltersChange({ ...filters, verifiedOnly: !filters.verifiedOnly })
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            filters.verifiedOnly
              ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-750'
          }`}
        >
          <BadgeCheck className="w-3 h-3" />
          Verified Only
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

  // FIX 50C: User location for distance filtering and display
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // FIX 59D: Blocked user IDs for client-side filtering
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  // FIX 68: Track liked profiles to gray them out
  const [likedProfiles, setLikedProfiles] = useState<Set<string>>(new Set());

  // FIX 68: Match animation overlay state
  const [matchAnimation, setMatchAnimation] = useState<{ userId: string; chatId: string } | null>(null);

  // FIX 74C: Sponsored ads for discover grid
  const [discoverAds, setDiscoverAds] = useState<SponsoredAd[]>([]);

  // FIX 72: Free daily chat usage tracking
  const [freeChatUsedToday, setFreeChatUsedToday] = useState(false);

  // FIX 126: Swipe card mode — Tinder-style alternative to grid
  const [viewMode, setViewMode] = useState<'grid' | 'swipe'>('grid');
  const [currentSwipeIndex, setCurrentSwipeIndex] = useState(0);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);
  const [swipeTouchStartX, setSwipeTouchStartX] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState<'left' | 'right' | null>(null);

  // Ref for infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // FIX 59D: Load blocked user IDs
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    getDocs(query(collection(requireDb(), 'blocks'), where('blockerId', '==', firebaseUser.uid)))
      .then((snap) => {
        setBlockedIds(snap.docs.map(d => d.data().blockedId));
      }).catch(() => {});
  }, [firebaseUser?.uid]);

  // FIX 74C: Load sponsored ads for discovery page
  useEffect(() => {
    const loadDiscoverAds = async () => {
      try {
        const fn = httpsCallable(functions, 'getAdForFeed');
        const result = await fn({ placement: 'discover' });
        setDiscoverAds(((result.data as any)?.ads || []) as SponsoredAd[]);
      } catch {
        try {
          const q = query(
            collection(requireDb(), 'ad_campaigns'),
            where('status', '==', 'active'),
            limit(3)
          );
          const snap = await getDocs(q);
          setDiscoverAds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SponsoredAd)));
        } catch {
          // Ads not critical — fail silently
        }
      }
    };
    loadDiscoverAds();
  }, []);

  // FIX 72: Load free chat usage for today
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const todayKey = new Date().toISOString().split('T')[0];
    getDoc(doc(requireDb(), 'users', firebaseUser.uid, 'daily_free_chats', todayKey)).then(snap => {
      setFreeChatUsedToday(snap.exists());
    }).catch(() => {});
  }, [firebaseUser?.uid]);

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

  // FIX 50C: Load user location for distance calculation
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    // Try saved profile location first
    const loadUserLocation = async () => {
      try {
        const profileDoc = await getDoc(doc(requireDb(), 'public_profiles', firebaseUser.uid));
        const loc = profileDoc.data()?.location;
        if (loc && loc.lat && loc.lng) {
          setUserLocation({ lat: loc.lat, lng: loc.lng });
          return;
        }
      } catch {
        // Fall through to geolocation
      }

      // Fallback: request browser geolocation
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => console.debug('[DiscoverPage] Geolocation denied or unavailable')
        );
      }
    };

    void loadUserLocation();
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

  // ── FIX 68: Like handler — calls backend likeUserV1 ─────────────────
  const handleLike = async (targetUserId: string) => {
    if (!firebaseUser?.uid) return;
    try {
      const likeFn = httpsCallable(functions, 'likeUserV1');
      const result = await likeFn({ targetUserId });
      const data = result.data as any;

      if (data.mutual) {
        // MATCH! Show animation + notification
        setMatchAnimation({ userId: targetUserId, chatId: data.chatId });
        setTimeout(() => setMatchAnimation(null), 3000);
      } else {
        // Like sent silently — small heart animation on card
        setLikedProfiles(prev => new Set([...prev, targetUserId]));
      }
    } catch (err: any) {
      if (err.code === 'resource-exhausted') alert('Daily like limit reached!');
      else if (err.code === 'already-exists') { /* silently ignore */ }
      else console.error('Like failed:', err);
    }
  };

  // ── FIX 68: SuperLike handler (50 tokens) ───────────────────────────
  const handleSuperLike = async (targetUserId: string) => {
    if (!firebaseUser?.uid) return;
    // Check balance (50 tokens)
    const walletSnap = await getDoc(doc(requireDb(), 'wallets', firebaseUser.uid));
    const balance = walletSnap.data()?.balance || walletSnap.data()?.tokens || 0;
    if (balance < 50) { alert('Need 50 tokens for SuperLike'); return; }
    if (!confirm('Send SuperLike for 50 tokens?')) return;

    try {
      const superLikeFn = httpsCallable(functions, 'superLikeUser');
      await superLikeFn({ targetUserId });
      setLikedProfiles(prev => new Set([...prev, targetUserId]));
    } catch (err) { console.error('SuperLike failed:', err); }
  };

  // ── FIX 71: Boost handler (2 hours, 50 tokens) ─────────────────────
  const handleBoost = async () => {
    if (!firebaseUser?.uid) return;
    const walletSnap = await getDoc(doc(requireDb(), 'wallets', firebaseUser.uid));
    const balance = walletSnap.data()?.balance || 0;
    if (balance < 50) { alert('Need 50 tokens for Boost'); return; }
    if (!confirm('Boost your profile for 2 hours? Cost: 50 tokens')) return;
    try {
      const boostFn = httpsCallable(functions, 'createBoostCampaignV1');
      await boostFn({ type: 'DISCOVERY_PROFILE', tier: 'basic', durationMinutes: 120 });
      alert('Profile boosted for 2 hours! 🚀');
    } catch (err) { console.error(err); alert('Boost failed'); }
  };

  // ── FIX 72: Free chat with less popular profiles ────────────────────
  const handleFreeChat = async (targetUserId: string) => {
    if (!firebaseUser?.uid) return;
    const todayKey = new Date().toISOString().split('T')[0];
    await setDoc(doc(requireDb(), 'users', firebaseUser.uid, 'daily_free_chats', todayKey), {
      targetUserId, usedAt: serverTimestamp()
    });
    // Create chat without escrow
    const chatId = `dm_${[firebaseUser.uid, targetUserId].sort().join('_')}`;
    await setDoc(doc(requireDb(), 'chats', chatId), {
      participants: [firebaseUser.uid, targetUserId],
      freeMessagesRemaining: 8, // FREE_MESSAGES_LESS_POPULAR = 8
      status: 'pending_accept',
      createdAt: serverTimestamp(),
      metadata: { type: 'free_daily_chat' }
    }, { merge: true });
    setFreeChatUsedToday(true);
    router.push(`/chat/${chatId}`);
  };

  // ── FIX 126: Swipe mode handlers ───────────────────────────────────
  const handleSwipe = async (decision: 'like' | 'dislike') => {
    const currentProfile = filteredProfiles[currentSwipeIndex];
    if (!currentProfile) return;

    // Animate card flying off screen
    setSwipeAnimating(decision === 'like' ? 'right' : 'left');
    await new Promise((r) => setTimeout(r, 300));
    setSwipeAnimating(null);
    setSwipeDeltaX(0);

    if (decision === 'like') {
      await handleLike(currentProfile.uid);
    }
    setCurrentSwipeIndex((prev) => Math.min(prev + 1, filteredProfiles.length - 1));

    // Load more profiles when running low
    if (currentSwipeIndex >= filteredProfiles.length - 5 && hasMore) {
      void loadProfiles(false);
    }
  };

  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    setSwipeTouchStartX(e.touches[0].clientX);
  };

  const handleSwipeTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - swipeTouchStartX;
    setSwipeDeltaX(deltaX);
  };

  const handleSwipeTouchEnd = () => {
    if (swipeDeltaX > 100) {
      void handleSwipe('like');
    } else if (swipeDeltaX < -100) {
      void handleSwipe('dislike');
    } else {
      setSwipeDeltaX(0);
    }
  };

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
  const searchFilteredProfiles = searchQuery.trim()
    ? profiles.filter(
        (p) =>
          p.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.city?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : profiles;

  // FIX 59D: Filter out blocked users from discovery results
  const unblockedProfiles = searchFilteredProfiles.filter(
    (p) => !blockedIds.includes(p.uid)
  );

  // FIX 78: Apply verified-only filter client-side
  const verifiedFilteredProfiles = filters.verifiedOnly
    ? unblockedProfiles.filter((p) => p.verified === true)
    : unblockedProfiles;

  // FIX 50C: Apply distance filter client-side when user location is available
  const filteredProfiles = verifiedFilteredProfiles.filter((p) => {
    if (searchRadius === 'international') return true;
    if (searchRadius === 'entire_country') return true;
    if (!userLocation) return true; // Can't calculate distance, include all
    const pLoc = p.location;
    if (!pLoc || typeof pLoc === 'string' || !pLoc.lat || !pLoc.lng) return true; // No geo location, include
    const dist = calculateDistanceKm(userLocation.lat, userLocation.lng, pLoc.lat, pLoc.lng);
    const maxKm = typeof searchRadius === 'number' ? searchRadius : 9999;
    return dist <= maxKm;
  });

  // ── Check if any filters are active (for empty state) ───────────────
  const hasActiveFilters =
    filters.onlineOnly ||
    filters.earnOnOnly ||
    filters.verifiedOnly ||
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
      {/* FIX 57B: LIVE banner — active lives from followed creators */}
      <ActiveLivesBanner uid={firebaseUser?.uid ?? null} />

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

      {/* FIX 71: Boost button — 2 hours, 50 tokens */}
      {firebaseUser && (
        <div className="mb-4 flex justify-end">
          <button onClick={handleBoost}
            className="px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full text-sm font-medium hover:from-amber-500 hover:to-orange-600 transition-all shadow">
            🚀 Boost (2h) — 50 tokens
          </button>
        </div>
      )}

      {/* FIX 126: View mode toggle — Grid vs Swipe */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('grid')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            viewMode === 'grid'
              ? 'bg-[#E4458F] text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          }`}
        >
          ▦ Grid
        </button>
        <button
          onClick={() => setViewMode('swipe')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            viewMode === 'swipe'
              ? 'bg-[#E4458F] text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          }`}
        >
          ◻️ Swipe
        </button>
      </div>

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

      {/* FIX 126: Swipe card mode — Tinder-style */}
      {viewMode === 'swipe' && !loading && !error && filteredProfiles.length > 0 && (
        <div className="relative h-[70vh] max-w-sm mx-auto">
          {currentSwipeIndex < filteredProfiles.length ? (
            <>
              {/* Current card */}
              <div
                className={`absolute inset-0 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden transition-transform ${
                  swipeAnimating === 'right'
                    ? 'translate-x-[120%] rotate-12 opacity-0'
                    : swipeAnimating === 'left'
                    ? '-translate-x-[120%] -rotate-12 opacity-0'
                    : ''
                }`}
                style={{
                  transform: !swipeAnimating && swipeDeltaX
                    ? `translateX(${swipeDeltaX}px) rotate(${swipeDeltaX * 0.05}deg)`
                    : undefined,
                  transition: swipeAnimating ? 'transform 0.3s ease-out, opacity 0.3s ease-out' : swipeDeltaX ? 'none' : 'transform 0.2s ease',
                }}
                onTouchStart={handleSwipeTouchStart}
                onTouchMove={handleSwipeTouchMove}
                onTouchEnd={handleSwipeTouchEnd}
              >
                <img
                  src={filteredProfiles[currentSwipeIndex]?.photoURL || (filteredProfiles[currentSwipeIndex] as any)?.photos?.[0] || ''}
                  alt={filteredProfiles[currentSwipeIndex]?.displayName || ''}
                  className="w-full h-3/4 object-cover"
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                  <h2 className="text-2xl font-bold text-white">
                    {filteredProfiles[currentSwipeIndex]?.displayName}
                    {(filteredProfiles[currentSwipeIndex] as any)?.age ? `, ${(filteredProfiles[currentSwipeIndex] as any).age}` : ''}
                  </h2>
                  <p className="text-white/70 text-sm">
                    {(filteredProfiles[currentSwipeIndex] as any)?.city || (filteredProfiles[currentSwipeIndex] as any)?.location || ''}
                  </p>
                  <p className="text-white/60 text-xs mt-1 line-clamp-2">
                    {(filteredProfiles[currentSwipeIndex] as any)?.bio || ''}
                  </p>
                </div>
                {/* Swipe direction indicators */}
                {swipeDeltaX > 50 && (
                  <div className="absolute top-8 left-8 border-4 border-green-500 text-green-500 rounded-xl px-4 py-2 text-2xl font-black rotate-[-20deg]">
                    LIKE
                  </div>
                )}
                {swipeDeltaX < -50 && (
                  <div className="absolute top-8 right-8 border-4 border-red-500 text-red-500 rounded-xl px-4 py-2 text-2xl font-black rotate-[20deg]">
                    NOPE
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="absolute -bottom-6 inset-x-0 flex items-center justify-center gap-4">
                <button
                  onClick={() => handleSwipe('dislike')}
                  className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center text-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  ✕
                </button>
                <button
                  onClick={() => {
                    const profile = filteredProfiles[currentSwipeIndex];
                    if (profile) handleSuperLike(profile.uid);
                  }}
                  className="w-11 h-11 rounded-full bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center text-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                >
                  ⭐
                </button>
                <button
                  onClick={() => handleSwipe('like')}
                  className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center text-2xl hover:bg-green-50 dark:hover:bg-green-900/20 transition"
                >
                  ❤️
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-gray-500">No more profiles</p>
                <p className="text-sm text-gray-400 mt-1">Try changing your filters</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile grid — 2-col mobile, 3-col tablet, 4-col desktop */}
      {viewMode === 'grid' && !loading && !error && filteredProfiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredProfiles.map((profile, i) => (
            <React.Fragment key={profile.uid}>
              <ProfileCard
                profile={profile}
                onClick={() => handleCardClick(profile.uid)}
                userLocation={userLocation}
                onLike={handleLike}
                onSuperLike={handleSuperLike}
                isLiked={likedProfiles.has(profile.uid)}
                showFreeChatBadge={!freeChatUsedToday && (profile as any).matchCount < 10}
                onFreeChat={handleFreeChat}
              />
              {/* FIX 74C: Insert sponsored ad after every 8 profiles */}
              {i > 0 && i % 8 === 7 && discoverAds[Math.floor(i / 8)] && (
                <SponsoredAdCard
                  ad={discoverAds[Math.floor(i / 8)]}
                  variant="discover"
                />
              )}
              {/* FIX 91: Insert question card every 6 profiles */}
              {i > 0 && i % 6 === 5 && (
                <DiscoveryQuestionCard
                  question={DISCOVERY_QUESTIONS[Math.floor(i / 6) % DISCOVERY_QUESTIONS.length]}
                  userId={firebaseUser?.uid}
                />
              )}
            </React.Fragment>
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

      {/* FIX 68: Match animation overlay */}
      {matchAnimation && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fadeIn">
          <div className="text-center">
            <p className="text-6xl mb-4">🎉</p>
            <h2 className="text-3xl font-bold text-white mb-2">It&apos;s a Match!</h2>
            <p className="text-white/70 mb-6">You and this person liked each other</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push(`/chat/${matchAnimation.chatId}`)}
                className="px-6 py-3 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full font-medium">
                Send Message
              </button>
              <button onClick={() => setMatchAnimation(null)}
                className="px-6 py-3 bg-white/20 text-white rounded-full">
                Keep Browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
