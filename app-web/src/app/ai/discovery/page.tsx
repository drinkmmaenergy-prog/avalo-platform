/**
 * PACK 279D - AI Discovery Page (Web)
 * Browse and filter AI Companions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface AICompanionProfile {
  id: string;
  name: string;
  avatar: string;
  gender: 'male' | 'female' | 'other';
  language: string;
  style: string[];
  rating: number;
  reviewCount: number;
  creatorType: 'USER_CREATED' | 'AVALO_CREATED';
  isRoyalExclusive: boolean;
  description: string;
  chatPrice: number;
  voicePricing: { standard: number; vip: number; royal: number };
  videoPricing: { standard: number; vip: number; royal: number };
}

type FilterGender = 'all' | 'male' | 'female' | 'other';
type FilterLanguage = 'all' | 'en' | 'pl' | 'es' | 'de' | 'fr';
type FilterStyle = 'all' | 'flirty' | 'romantic' | 'friendly' | 'roleplay' | 'professional';
type FilterCreator = 'all' | 'USER_CREATED' | 'AVALO_CREATED';
type SortOption = 'popular' | 'new' | 'top_rated' | 'royal_exclusive';

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIDiscoveryPage() {
  const router = useRouter();

  // State
  const [companions, setCompanions] = useState<AICompanionProfile[]>([]);
  const [filteredCompanions, setFilteredCompanions] = useState<AICompanionProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterGender, setFilterGender] = useState<FilterGender>('all');
  const [filterLanguage, setFilterLanguage] = useState<FilterLanguage>('all');
  const [filterStyle, setFilterStyle] = useState<FilterStyle>('all');
  const [filterCreator, setFilterCreator] = useState<FilterCreator>('all');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popular');

  // Load companions
  useEffect(() => {
    loadCompanions();
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    applyFiltersAndSort();
  }, [companions, filterGender, filterLanguage, filterStyle, filterCreator, minRating, sortBy]);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const companionsRef = collection(db, 'aiCompanions');
      const snapshot = await getDocs(companionsRef);

      const loadedCompanions: AICompanionProfile[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || 'AI Companion',
        avatar: doc.data().avatarUrl || '🤖',
        gender: doc.data().gender || 'other',
        language: doc.data().language || 'en',
        style: doc.data().style || [],
        rating: doc.data().rating || 0,
        reviewCount: doc.data().reviewCount || 0,
        creatorType: doc.data().creatorType || 'AVALO_CREATED',
        isRoyalExclusive: doc.data().isRoyalExclusive || false,
        description: doc.data().description || '',
        chatPrice: 100,
        voicePricing: { standard: 10, vip: 7, royal: 5 },
        videoPricing: { standard: 20, vip: 14, royal: 10 },
      }));

      setCompanions(loadedCompanions);
    } catch (error) {
      console.error('Error loading AI companions:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...companions];

    // Apply filters
    if (filterGender !== 'all') {
      filtered = filtered.filter((c) => c.gender === filterGender);
    }

    if (filterLanguage !== 'all') {
      filtered = filtered.filter((c) => c.language === filterLanguage);
    }

    if (filterStyle !== 'all') {
      filtered = filtered.filter((c) => c.style.includes(filterStyle));
    }

    if (filterCreator !== 'all') {
      filtered = filtered.filter((c) => c.creatorType === filterCreator);
    }

    if (minRating > 0) {
      filtered = filtered.filter((c) => c.rating >= minRating);
    }

    // Apply sorting
    switch (sortBy) {
      case 'popular':
        filtered.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'new':
        filtered.reverse();
        break;
      case 'top_rated':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'royal_exclusive':
        filtered.sort((a, b) => (b.isRoyalExclusive ? 1 : 0) - (a.isRoyalExclusive ? 1 : 0));
        break;
    }

    setFilteredCompanions(filtered);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading AI Companions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            AI Discovery
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Browse {filteredCompanions.length} AI Companions
          </p>
        </div>
      </div>

      {/* Filters Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sort Options */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['popular', 'new', 'top_rated', 'royal_exclusive'] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                sortBy === option
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {option === 'popular' && '🔥 Popular'}
              {option === 'new' && '✨ New'}
              {option === 'top_rated' && '⭐ Top Rated'}
              {option === 'royal_exclusive' && '👑 Royal'}
            </button>
          ))}
        </div>

        {/* Filter Groups */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 space-y-4">
          {/* Gender Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Gender
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'male', 'female', 'other'] as FilterGender[]).map((gender) => (
                <button
                  key={gender}
                  onClick={() => setFilterGender(gender)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterGender === gender
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Language Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Language
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'en', 'pl'] as FilterLanguage[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setFilterLanguage(lang)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterLanguage === lang
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {lang === 'all' ? 'All' : lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Style Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Style
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'flirty', 'romantic', 'friendly', 'roleplay'] as FilterStyle[]).map((style) => (
                <button
                  key={style}
                  onClick={() => setFilterStyle(style)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStyle === style
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Creator Type Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Creator Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'AVALO_CREATED', 'USER_CREATED'] as FilterCreator[]).map((creator) => (
                <button
                  key={creator}
                  onClick={() => setFilterCreator(creator)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterCreator === creator
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {creator === 'all' ? 'All' : creator.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Companions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCompanions.map((companion) => (
            <div
              key={companion.id}
              onClick={() => router.push(`/ai/profile/${companion.id}`)}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow hover:shadow-lg transition-all cursor-pointer"
            >
              {/* Avatar */}
              <div className="flex justify-center mb-4">
                {companion.avatar.startsWith('http') ? (
                  <img
                    src={companion.avatar}
                    alt={companion.name}
                    className="w-24 h-24 rounded-full"
                  />
                ) : (
                  <div className="text-6xl">{companion.avatar}</div>
                )}
                {companion.isRoyalExclusive && (
                  <span className="absolute mt-16 ml-16 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs font-bold">
                    👑
                  </span>
                )}
              </div>

              {/* Name */}
              <h3 className="text-xl font-bold text-center mb-2 text-gray-900 dark:text-white">
                {companion.name}
              </h3>

              {/* Style Badges */}
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {companion.style.slice(0, 2).map((style, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg"
                  >
                    {style}
                  </span>
                ))}
              </div>

              {/* Rating */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-yellow-500">⭐ {companion.rating.toFixed(1)}</span>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  ({companion.reviewCount} reviews)
                </span>
              </div>

              {/* Pricing Preview */}
              <div className="text-center text-sm text-gray-600 dark:text-gray-400 mb-2">
                💬 Chat: {companion.chatPrice} tokens/bucket
              </div>

              {/* Creator Badge */}
              <div className="flex justify-center">
                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded">
                  {companion.creatorType === 'AVALO_CREATED' ? '🏢 Avalo AI' : '👤 User Created'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredCompanions.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              No AI Companions Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Try adjusting your filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}