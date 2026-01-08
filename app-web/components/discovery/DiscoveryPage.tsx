/**
 * PACK 294 - Search & Discovery Filters
 * Web Discovery Page Component
 * 
 * Features:
 * - Advanced filtering sidebar
 * - Search bar
 * - Responsive grid layout
 * - Infinite scroll
 * - Profile cards with quick actions
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface DiscoveryProfile {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  city: string;
  country: string;
  distanceKm: number | null;
  isVerified: boolean;
  influencerBadge: boolean;
  royalBadge: boolean;
  vipBadge: boolean;
  hasProfilePhoto: boolean;
  hasVideoIntro: boolean;
  interests: string[];
  popularityScore: number;
  recentActivityScore: number;
  lastActiveAt: string;
}

interface Filters {
  ageMin: number;
  ageMax: number;
  distanceKmMax: number;
  gender?: string;
  lookingFor?: string;
  interests?: string[];
  languages?: string[];
  hasProfilePhoto?: boolean;
  hasVideoIntro?: boolean;
  isVerifiedOnly?: boolean;
  influencerOnly?: boolean;
  royalOnly?: boolean;
}

export default function DiscoveryPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [filters, setFilters] = useState<Filters>({
    ageMin: 18,
    ageMax: 99,
    distanceKmMax: 100,
    gender: 'ANY',
    lookingFor: 'ANY',
    interests: [],
    languages: [],
  });

  const loadProfiles = useCallback(async (reset: boolean = false) => {
    if (!user || loading) return;
    
    setLoading(true);
    
    try {
      const functions = getFunctions();
      const discoverySearch = httpsCallable(functions, 'discoverySearch');
      
      const response = await discoverySearch({
        ...filters,
        interests: filters.interests?.join(','),
        languages: filters.languages?.join(','),
        cursor: reset ? null : cursor,
        limit: 24,
      }) as any;
      
      const data = response.data;
      
      if (reset) {
        setProfiles(data.items);
      } else {
        setProfiles(prev => [...prev, ...data.items]);
      }
      
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filters, cursor, loading]);

  useEffect(() => {
    loadProfiles(true);
  }, [filters]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadProfiles(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Discovery</h1>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-xl mx-8">
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
          </div>
          
          {/* Free Banner */}
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
            <span className="text-green-800 font-semibold">
              🆓 Discovery is 100% FREE for everyone
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filters Sidebar */}
          {showFilters && (
            <aside className="w-80 flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
                <h2 className="text-lg font-semibold mb-4">Filters</h2>
                
                {/* Age Range */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="18"
                      max="99"
                      value={filters.ageMin}
                      onChange={(e) => setFilters({ ...filters, ageMin: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <span className="py-2">-</span>
                    <input
                      type="number"
                      min="18"
                      max="99"
                      value={filters.ageMax}
                      onChange={(e) => setFilters({ ...filters, ageMax: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                
                {/* Distance */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Distance: {filters.distanceKmMax} km
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="10"
                    value={filters.distanceKmMax}
                    onChange={(e) => setFilters({ ...filters, distanceKmMax: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10km</span>
                    <span>500km</span>
                  </div>
                </div>
                
                {/* Gender */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    value={filters.gender}
                    onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="ANY">All</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="NONBINARY">Non-binary</option>
                  </select>
                </div>
                
                {/* Toggles */}
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.isVerifiedOnly}
                      onChange={(e) => setFilters({ ...filters, isVerifiedOnly: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Verified Only</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.hasProfilePhoto}
                      onChange={(e) => setFilters({ ...filters, hasProfilePhoto: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">With Profile Photo</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.hasVideoIntro}
                      onChange={(e) => setFilters({ ...filters, hasVideoIntro: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">With Video Intro</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.influencerOnly}
                      onChange={(e) => setFilters({ ...filters, influencerOnly: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Influencers Only</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.royalOnly}
                      onChange={(e) => setFilters({ ...filters, royalOnly: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Royal Only</span>
                  </label>
                </div>
                
                {/* Reset Button */}
                <button
                  onClick={() => setFilters({
                    ageMin: 18,
                    ageMax: 99,
                    distanceKmMax: 100,
                    gender: 'ANY',
                    lookingFor: 'ANY',
                    interests: [],
                    languages: [],
                  })}
                  className="w-full mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Reset Filters
                </button>
              </div>
            </aside>
          )}

          {/* Profile Grid */}
          <main className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {profiles.map((profile) => (
                <div key={profile.userId} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition">
                  {/* Profile Image Placeholder */}
                  <div className="aspect-square bg-gradient-to-br from-blue-400 to-purple-500" />
                  
                  {/* Profile Info */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{profile.displayName}</h3>
                      {profile.isVerified && <span className="text-blue-500">✓</span>}
                      {profile.influencerBadge && <span>⭐</span>}
                      {profile.royalBadge && <span>👑</span>}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                      {profile.age} • {profile.city}, {profile.country}
                    </p>
                    
                    {profile.distanceKm && (
                      <p className="text-sm text-gray-500 mb-3">
                        📍 {profile.distanceKm} km away
                      </p>
                    )}
                    
                    {profile.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {profile.interests.slice(0, 3).map((interest) => (
                          <span key={interest} className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {interest}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm">
                        View Profile
                      </button>
                      <button className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                        ❤️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Load More */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
              </div>
            )}
            
            {!loading && hasMore && (
              <div className="text-center py-8">
                <button
                  onClick={handleLoadMore}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  Load More
                </button>
              </div>
            )}
            
            {!loading && !hasMore && profiles.length > 0 && (
              <div className="text-center py-8 text-gray-500">
                No more profiles to show
              </div>
            )}
            
            {!loading && profiles.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No profiles found</p>
                <p className="text-gray-400 text-sm mt-2">Try adjusting your filters</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}