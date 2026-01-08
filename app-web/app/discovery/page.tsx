/**
 * PACK 271 - Discovery Engine (Web Version)
 * Desktop/Web implementation with same features as mobile
 * 
 * Features:
 * - Responsive grid (4-6 columns desktop, 3-4 tablet, 2 mobile)
 * - Profile ranking with fairness boost
 * - Nearby/Passport tabs
 * - Infinite scroll pagination
 * - Safety filters & photo validation
 * - 100% FREE access
 * - Swipe integration
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  DocumentSnapshot 
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { DiscoveryProfile, DiscoveryFilters, TabMode } from './types';
import { rankProfiles, getActivityIndicator } from './ranking';

const PROFILES_PER_PAGE = 30;

export default function DiscoveryPage() {
  const router = useRouter();
  
  // State
  const [currentTab, setCurrentTab] = useState<TabMode>('nearby');
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [passportLocation, setPassportLocation] = useState<any>(null);
  
  // Filters
  const [filters, setFilters] = useState<DiscoveryFilters>({
    ageMin: 18,
    ageMax: 80,
    distanceMax: 100,
    showEarnMode: true,
    onlyVerified: false,
  });
  
  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  }, []);
  
  // Load profiles on mount and filter changes
  useEffect(() => {
    if (userLocation) {
      loadProfiles(true);
    }
  }, [currentTab, filters, userLocation]);
  
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  
  const loadProfiles = async (reset: boolean = false) => {
    try {
      const user = auth.currentUser;
      if (!user || !userLocation) return;
      
      if (reset) {
        setLoading(true);
        setProfiles([]);
        setLastDoc(null);
        setHasMore(true);
      }
      
      const useLocation = currentTab === 'passport' && passportLocation?.enabled
        ? { lat: passportLocation.lat, lng: passportLocation.lng }
        : userLocation;
      
      const usersRef = collection(db, 'users');
      let q = query(
        usersRef,
        where('age', '>=', filters.ageMin),
        where('age', '<=', filters.ageMax),
        where('incognito', '==', false),
        orderBy('age'),
        orderBy('lastActive', 'desc'),
        limit(PROFILES_PER_PAGE)
      );
      
      if (!reset && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }
      
      if (filters.onlyVerified) {
        q = query(q, where('isVerified', '==', true));
      }
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      const newProfiles: DiscoveryProfile[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (doc.id === user.uid) return;
        
        const profileLat = data.location?.coordinates?.lat || 0;
        const profileLng = data.location?.coordinates?.lng || 0;
        const distance = calculateDistance(
          useLocation.lat,
          useLocation.lng,
          profileLat,
          profileLng
        );
        
        if (distance > filters.distanceMax) return;
        
        const photos = data.photos || [];
        const validPhotos = photos.slice(0, 6).every((photo: any) => photo.containsFace === true);
        if (!validPhotos) return;
        
        const profile: DiscoveryProfile = {
          userId: doc.id,
          displayName: data.displayName || 'User',
          age: data.age || 18,
          distance: Math.round(distance * 10) / 10,
          photos: photos.map((p: any) => p.url),
          primaryPhoto: photos[0]?.url || '',
          isOnline: data.presence?.status === 'online',
          lastActive: data.lastActive?.toDate() || new Date(),
          hasNewPost: data.hasNewPost || false,
          lastPostDate: data.lastPostDate?.toDate(),
          isVerified: data.isVerified || false,
          isRoyal: data.subscription?.tier === 'royal' || false,
          hasAIAvatar: data.hasAIAvatar || false,
          earnModeEnabled: data.earnMode?.enabled || false,
          incognito: data.incognito || false,
          profileQuality: data.profileQuality || 50,
          popularity: data.metrics?.popularity || 50,
          activityScore: data.metrics?.activityScore || 50,
          swipeEligible: true,
          location: {
            city: data.location?.city,
            country: data.location?.country,
            coordinates: { lat: profileLat, lng: profileLng },
          },
          bio: data.bio,
          interests: data.interests,
          gender: data.gender || 'other',
          preferredGender: data.preferences?.gender,
        };
        
        newProfiles.push(profile);
      });
      
      const rankedProfiles = rankProfiles(newProfiles);
      
      if (reset) {
        setProfiles(rankedProfiles);
      } else {
        setProfiles(prev => [...prev, ...rankedProfiles]);
      }
      
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === PROFILES_PER_PAGE);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleScroll = useCallback(() => {
    if (loading || !hasMore) return;
    
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;
    
    if (scrollTop + clientHeight >= scrollHeight - 500) {
      loadProfiles(false);
    }
  }, [loading, hasMore]);
  
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Discovery</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            ⚙️
          </button>
        </div>
        
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-2 pb-2">
          <button
            onClick={() => setCurrentTab('nearby')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              currentTab === 'nearby'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📍 Nearby
          </button>
          <button
            onClick={() => setCurrentTab('passport')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              currentTab === 'passport'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🌍 Passport
          </button>
        </div>
        
        {/* Free Notice */}
        <div className="bg-green-600 py-2 px-4 text-center">
          <p className="text-sm font-bold">🆓 Discovery is 100% FREE for everyone</p>
        </div>
      </header>
      
      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {profiles.map((profile) => {
            const activity = getActivityIndicator(profile);
            
            return (
              <div
                key={profile.userId}
                onClick={() => router.push(`/profile/${profile.userId}`)}
                className="relative aspect-[3/4] rounded-lg overflow-hidden bg-gray-800 cursor-pointer hover:ring-2 hover:ring-cyan-500 transition-all group"
              >
                {/* Photo */}
                <img
                  src={profile.primaryPhoto}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
                
                {/* Activity Badge */}
                {activity.label && (
                  <div
                    className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: activity.color }}
                  >
                    {activity.label}
                  </div>
                )}
                
                {/* Online Dot */}
                {profile.isOnline && (
                  <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                )}
                
                {/* New Post Badge */}
                {profile.hasNewPost && (
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-red-500 text-xs font-bold text-white">
                    NEW ✨
                  </div>
                )}
                
                {/* Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center gap-1 mb-1">
                    <p className="font-bold text-lg">{profile.displayName}</p>
                    {profile.isVerified && <span className="text-cyan-500">✓</span>}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-300">
                    <span>{profile.age}</span>
                    <span>•</span>
                    <span>
                      {profile.distance < 1 
                        ? '<1 km away' 
                        : `${Math.round(profile.distance)} km away`}
                    </span>
                  </div>
                </div>
                
                {/* Royal Badge */}
                {profile.isRoyal && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-yellow-500/20 backdrop-blur-sm">
                    <span className="text-yellow-500 text-xs font-bold">♛</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            <p className="ml-3 text-gray-400">Loading profiles...</p>
          </div>
        )}
        
        {/* Empty State */}
        {!loading && profiles.length === 0 && (
          <div className="text-center py-16">
            <p className="text-6xl mb-4">🔍</p>
            <h3 className="text-2xl font-bold mb-2">No profiles found</h3>
            <p className="text-gray-400">
              {currentTab === 'passport'
                ? 'No users in this location. Try a different city.'
                : 'Adjust your filters or check back later.'}
            </p>
          </div>
        )}
      </main>
      
      {/* Swipe FAB */}
      <button
        onClick={() => router.push('/swipe')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-110"
      >
        🔥
      </button>
      
      {/* Filter Modal */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Filters</h2>
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Age Range */}
              <div>
                <label className="block text-sm font-medium mb-2">Age Range</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filters.ageMin}
                    onChange={(e) => setFilters((prev: DiscoveryFilters) => ({ ...prev, ageMin: parseInt(e.target.value) }))}
                    className="flex-1 bg-gray-700 rounded-lg px-3 py-2"
                    placeholder="Min"
                  />
                  <span className="self-center">-</span>
                  <input
                    type="number"
                    value={filters.ageMax}
                    onChange={(e) => setFilters((prev: DiscoveryFilters) => ({ ...prev, ageMax: parseInt(e.target.value) }))}
                    className="flex-1 bg-gray-700 rounded-lg px-3 py-2"
                    placeholder="Max"
                  />
                </div>
              </div>
              
              {/* Distance */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Distance: {filters.distanceMax} km
                </label>
                <input
                  type="range"
                  min="1"
                  max="500"
                  value={filters.distanceMax}
                  onChange={(e) => setFilters((prev: DiscoveryFilters) => ({ ...prev, distanceMax: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              {/* Toggles */}
              <div className="space-y-2">
                <label className="flex items-center justify-between">
                  <span>Only Verified Users</span>
                  <input
                    type="checkbox"
                    checked={filters.onlyVerified}
                    onChange={(e) => setFilters((prev: DiscoveryFilters) => ({ ...prev, onlyVerified: e.target.checked }))}
                    className="w-5 h-5"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span>Show Earn Mode Users</span>
                  <input
                    type="checkbox"
                    checked={filters.showEarnMode}
                    onChange={(e) => setFilters((prev: DiscoveryFilters) => ({ ...prev, showEarnMode: e.target.checked }))}
                    className="w-5 h-5"
                  />
                </label>
              </div>
            </div>
            
            <button
              onClick={() => {
                setShowFilters(false);
                loadProfiles(true);
              }}
              className="w-full mt-6 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}