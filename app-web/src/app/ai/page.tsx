'use client';

/**
 * AI Discovery Feed — Main /ai page
 *
 * Card grid layout matching /discover page but for AI companion profiles only.
 * Data source: Firestore 'ai_avatars' collection.
 * Platform bots (isAvaloPlatform: true) appear first before community bots.
 *
 * Features:
 *   - Profile photo, name, age, purple AI badge
 *   - One-line bio, personality trait tags
 *   - "Chat" button → /ai/chat/[avatarId]
 *   - Creator attribution for user-created bots
 *   - Filter bar: Gender, Age range, Personality type, Created By
 *   - Search bar: search by name or personality
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { AI_PERSONALITY_TRAITS } from '@/lib/aiEconomyConfig';
import type { AIAvatar, AIDiscoveryFilters } from '@/lib/types/aiAvatar';
import { DEFAULT_AI_DISCOVERY_FILTERS } from '@/lib/types/aiAvatar';
import {
  Search,
  Bot,
  MessageCircle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const GENDER_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const CREATED_BY_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'avalo' as const, label: 'Avalo' },
  { value: 'community' as const, label: 'Community' },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Loading skeleton matching the card layout */
function CardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="w-full aspect-[3/4] rounded-lg bg-gray-200 dark:bg-gray-700 mb-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8" />
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
      <div className="flex gap-1.5 mb-3">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
      </div>
      <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded-lg w-full" />
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

/** Empty state when no companions match */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-900/30 mx-auto mb-4 flex items-center justify-center">
        <Bot className="w-8 h-8 text-purple-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {hasFilters ? 'No companions match your filters' : 'No AI companions yet'}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your filters or search to find more AI companions.'
          : 'AI companions are coming soon. Check back later!'}
      </p>
    </div>
  );
}

/** Single AI companion card */
function AICompanionCard({
  avatar,
  onChat,
  onProfile,
}: {
  avatar: AIAvatar;
  onChat: () => void;
  onProfile: () => void;
}) {
  const primaryPhoto = avatar.photos && avatar.photos.length > 0 ? avatar.photos[0] : null;

  return (
    <div className="card overflow-hidden hover:ring-2 hover:ring-purple-500/50 transition-all duration-200 group">
      {/* Photo — click navigates to profile */}
      <button
        onClick={onProfile}
        className="relative w-full aspect-[3/4] bg-gray-100 dark:bg-gray-800 overflow-hidden focus:outline-none"
      >
        {primaryPhoto ? (
          <img
            src={primaryPhoto}
            alt={avatar.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Bot className="w-16 h-16" />
          </div>
        )}

        {/* AI Badge overlay */}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full shadow-lg">
          <Bot className="w-3 h-3" />
          AI
        </span>
      </button>

      {/* Info section */}
      <div className="p-4">
        {/* Name + Age */}
        <button onClick={onProfile} className="text-left w-full focus:outline-none">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {avatar.name}
            </h3>
            {avatar.age > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                {avatar.age}
              </span>
            )}
          </div>
        </button>

        {/* Bio */}
        {avatar.bio && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-2">
            {avatar.bio}
          </p>
        )}

        {/* Personality trait tags */}
        {avatar.personalityTraits && avatar.personalityTraits.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {avatar.personalityTraits.slice(0, 3).map((trait) => (
              <span
                key={trait}
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full"
              >
                {trait}
              </span>
            ))}
          </div>
        )}

        {/* Creator attribution */}
        {!avatar.isAvaloPlatform && avatar.creatorDisplayName && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 truncate">
            by {avatar.creatorDisplayName}
          </p>
        )}

        {/* Chat button */}
        <button
          onClick={onChat}
          className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
        >
          <MessageCircle className="w-4 h-4" />
          Chat
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIDiscoveryFeedPage() {
  const router = useRouter();

  // ── Data state ──────────────────────────────────────────────────────
  const [allAvatars, setAllAvatars] = useState<AIAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter state ────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AIDiscoveryFilters>(DEFAULT_AI_DISCOVERY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Load all avatars from Firestore ─────────────────────────────────
  useEffect(() => {
    loadAvatars();
  }, []);

  const loadAvatars = async () => {
    try {
      setLoading(true);
      setError(null);
      const avatarsRef = collection(requireDb(), 'ai_avatars');
      const q = query(avatarsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const loaded: AIAvatar[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || 'AI Companion',
          age: d.age || 0,
          gender: d.gender || 'other',
          ethnicity: d.ethnicity || '',
          bodyType: d.bodyType || '',
          hairColor: d.hairColor || '',
          eyeColor: d.eyeColor || '',
          personalityTraits: d.personalityTraits || [],
          bio: d.bio || '',
          backstory: d.backstory || '',
          interests: d.interests || [],
          photos: d.photos || [],
          voiceType: d.voiceType || '',
          creatorId: d.creatorId || null,
          creatorDisplayName: d.creatorDisplayName || null,
          isAvaloPlatform: d.isAvaloPlatform === true,
          totalConversations: d.totalConversations || 0,
          averageRating: d.averageRating || 0,
          ratingCount: d.ratingCount || 0,
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        };
      });

      setAllAvatars(loaded);
    } catch (err) {
      console.error('[AIDiscoveryFeed] Error loading avatars:', err);
      setError('Failed to load AI companions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Filter + search + sort logic ────────────────────────────────────
  const filteredAvatars = useMemo(() => {
    let result = [...allAvatars];

    // Gender filter
    if (filters.gender !== 'all') {
      result = result.filter((a) => a.gender === filters.gender);
    }

    // Age range filter
    result = result.filter(
      (a) => a.age >= filters.ageMin && a.age <= filters.ageMax
    );

    // Personality type filter
    if (filters.personalityType !== 'all') {
      result = result.filter((a) =>
        a.personalityTraits.some(
          (t) => t.toLowerCase() === filters.personalityType.toLowerCase()
        )
      );
    }

    // Created by filter
    if (filters.createdBy === 'avalo') {
      result = result.filter((a) => a.isAvaloPlatform);
    } else if (filters.createdBy === 'community') {
      result = result.filter((a) => !a.isAvaloPlatform);
    }

    // Search query
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.personalityTraits.some((t) => t.toLowerCase().includes(q)) ||
          a.bio.toLowerCase().includes(q)
      );
    }

    // Sort: platform bots first, then by createdAt desc
    result.sort((a, b) => {
      if (a.isAvaloPlatform && !b.isAvaloPlatform) return -1;
      if (!a.isAvaloPlatform && b.isAvaloPlatform) return 1;
      return 0; // preserve existing order (already sorted by createdAt desc)
    });

    return result;
  }, [allAvatars, filters]);

  const hasActiveFilters =
    filters.gender !== 'all' ||
    filters.ageMin !== 18 ||
    filters.ageMax !== 99 ||
    filters.personalityType !== 'all' ||
    filters.createdBy !== 'all' ||
    filters.searchQuery.trim() !== '';

  const resetFilters = () => {
    setFilters(DEFAULT_AI_DISCOVERY_FILTERS);
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-purple-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Companions
              </h1>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredAvatars.length}
              </span>
            </div>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtersOpen || hasActiveFilters
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-purple-500" />
              )}
              {filtersOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              placeholder="Search by name or personality..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {filters.searchQuery && (
              <button
                onClick={() =>
                  setFilters((prev) => ({ ...prev, searchQuery: '' }))
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible filters panel */}
        {filtersOpen && (
          <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
              {/* Gender filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Gender
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENDER_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, gender: opt.value }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filters.gender === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age range */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Age Range: {filters.ageMin} – {filters.ageMax}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={18}
                    max={99}
                    value={filters.ageMin}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        ageMin: Math.min(Number(e.target.value), prev.ageMax),
                      }))
                    }
                    className="flex-1 accent-purple-600"
                  />
                  <span className="text-xs text-gray-500 w-6 text-center">–</span>
                  <input
                    type="range"
                    min={18}
                    max={99}
                    value={filters.ageMax}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        ageMax: Math.max(Number(e.target.value), prev.ageMin),
                      }))
                    }
                    className="flex-1 accent-purple-600"
                  />
                </div>
              </div>

              {/* Personality type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Personality Type
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, personalityType: 'all' }))
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filters.personalityType === 'all'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    All
                  </button>
                  {AI_PERSONALITY_TRAITS.map((trait) => (
                    <button
                      key={trait}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, personalityType: trait }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filters.personalityType === trait
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {trait}
                    </button>
                  ))}
                </div>
              </div>

              {/* Created by */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Created By
                </label>
                <div className="flex flex-wrap gap-2">
                  {CREATED_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, createdBy: opt.value }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filters.createdBy === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset button */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="text-sm text-purple-600 dark:text-purple-400 font-medium hover:underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* "First 3 messages FREE" banner */}
        <div className="w-full rounded-xl bg-gradient-to-r from-purple-600 via-violet-500 to-pink-500 px-4 py-2.5 mb-6">
          <div className="flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4 text-white/90" />
            <p className="text-sm font-medium text-white">
              First 3 messages are FREE — try any AI companion!
            </p>
          </div>
        </div>

        {loading ? (
          <GridSkeleton />
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={loadAvatars} className="btn btn-primary">
              Retry
            </button>
          </div>
        ) : filteredAvatars.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAvatars.map((avatar) => (
              <AICompanionCard
                key={avatar.id}
                avatar={avatar}
                onChat={() => router.push(`/ai/chat/${avatar.id}`)}
                onProfile={() => router.push(`/ai/profile/${avatar.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
