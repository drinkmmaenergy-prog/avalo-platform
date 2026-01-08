/**
 * PACK 340 - AI Discovery Page (Web)
 * Browse AI companions with filters and sorting
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  discoverAICompanions,
  type AICompanion,
  type AIDiscoveryParams,
  type Gender,
  type CreatorType,
  formatTokens,
  formatRating,
  getCreatorBadge,
} from '../../../packages/ui-ai';

export default function AIDiscoveryPage() {
  const [companions, setCompanions] = useState<AICompanion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [gender, setGender] = useState<Gender | undefined>();
  const [creatorType, setCreatorType] = useState<CreatorType | undefined>();
  const [sortBy, setSortBy] = useState<'popular' | 'new' | 'priceLow' | 'priceHigh' | 'rating'>('popular');

  useEffect(() => {
    loadCompanions();
  }, [gender, creatorType, sortBy]);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const params: AIDiscoveryParams = {
        filters: { gender, creatorType },
        sortBy,
      };

      const result = await discoverAICompanions(params);
      setCompanions(result.companions);
    } catch (error) {
      console.error('Error loading companions:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setGender(undefined);
    setCreatorType(undefined);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold text-gray-900">AI Companions</h1>
          <p className="mt-2 text-lg text-red-600 font-semibold">18+ only · Tokens required</p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Sort */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="popular">🔥 Popular</option>
                <option value="new">✨ New</option>
                <option value="priceLow">💰 Price: Low to High</option>
                <option value="priceHigh">💎 Price: High to Low</option>
                <option value="rating">⭐ Rating</option>
              </select>
            </div>

            {/* Filters */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🔍 Filters
              {(gender || creatorType) && (
                <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block"></span>
              )}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <div className="flex flex-wrap gap-2">
                    {['MALE', 'FEMALE', 'NON_BINARY', 'OTHER'].map((g) => (
                      <button
                        key={g}
                        onClick={() => setGender(gender === g ? undefined : g as Gender)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          gender === g
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Creator Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Creator</label>
                  <div className="flex flex-wrap gap-2">
                    {['USER', 'AVALO'].map((ct) => (
                      <button
                        key={ct}
                        onClick={() => setCreatorType(creatorType === ct ? undefined : ct as CreatorType)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          creatorType === ct
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
                        }`}
                      >
                        {ct} AI
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Companions Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : companions.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-gray-600 mb-4">No AI companions found</p>
            <button
              onClick={clearFilters}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companions.map((companion) => {
              const badge = getCreatorBadge(companion);
              return (
                <Link
                  key={companion.companionId}
                  href={`/ai/${companion.companionId}`}
                  className="block bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                        <Image
                          src={companion.avatarUrl}
                          alt={companion.name}
                          fill
                          className="object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-bold text-gray-900 truncate">
                            {companion.name}
                          </h3>
                          <span
                            className="px-2 py-1 text-xs font-bold text-white rounded"
                            style={{ backgroundColor: badge.color }}
                          >
                            {badge.text}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                          {companion.shortBio}
                        </p>

                        <div className="flex items-center text-sm text-gray-500 space-x-3 mb-3">
                          <span>{formatRating(companion.averageRating)}</span>
                          <span>•</span>
                          <span>{companion.totalChats} chats</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Chat:</span>
                          <span className="text-sm font-semibold text-blue-600">
                            {formatTokens(companion.chatBucketPrice)} tokens
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
