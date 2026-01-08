import { useState, useEffect, useMemo } from 'react';
import { ProfileData } from '../lib/profileService';
import { getDiscoveryProfiles } from '../services/discoveryService';
import { isProfileBoosted } from '../services/boostService';

export type DistanceFilter = 'nearby' | 'city' | 'country' | 'global';
export type GenderFilter = 'all' | 'female' | 'male';
export type ActivityFilter = 'all' | 'online' | 'active' | 'new';

export interface ExploreFilters {
  distance: DistanceFilter;
  gender: GenderFilter;
  activity: ActivityFilter;
}

export interface ExploreSection {
  id: string;
  title: string;
  subtitle?: string;
  profiles: ProfileData[];
}

interface UseExploreDiscoveryReturn {
  profiles: ProfileData[];
  sections: ExploreSection[];
  filteredProfiles: ProfileData[];
  filters: ExploreFilters;
  setFilters: (filters: ExploreFilters) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useExploreDiscovery = (
  currentUserId: string,
  userProfile: ProfileData | null
): UseExploreDiscoveryReturn => {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [boostedProfiles, setBoostedProfiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<ExploreFilters>({
    distance: 'global',
    gender: 'all',
    activity: 'all',
  });
  
  const [searchQuery, setSearchQuery] = useState('');

  const loadProfiles = async () => {
    if (!userProfile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch discovery profiles
      const discoveryProfiles = await getDiscoveryProfiles(
        currentUserId,
        userProfile,
        100 // Fetch more for filtering
      );

      // Check boost status for all profiles
      const boostedSet = new Set<string>();
      await Promise.all(
        discoveryProfiles.map(async (p) => {
          const isBoosted = await isProfileBoosted(p.uid);
          if (isBoosted) {
            boostedSet.add(p.uid);
          }
        })
      );

      setBoostedProfiles(boostedSet);
      setProfiles(discoveryProfiles);
    } catch (err) {
      console.error('Error loading explore profiles:', err);
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [currentUserId, userProfile?.uid]);

  const refresh = async () => {
    await loadProfiles();
  };

  // Apply filters to profiles
  const filteredProfiles = useMemo(() => {
    let filtered = [...profiles];

    // Distance filter
    if (filters.distance !== 'global' && userProfile) {
      if (filters.distance === 'city') {
        filtered = filtered.filter(p => p.city === userProfile.city);
      } else if (filters.distance === 'country') {
        // Approximate: filter by country code if available
        // For now, use city as proxy
        filtered = filtered.filter(p => 
          p.city && userProfile.city && 
          p.city.split(',')[1]?.trim() === userProfile.city.split(',')[1]?.trim()
        );
      } else if (filters.distance === 'nearby') {
        // Nearby: same city or close proximity
        filtered = filtered.filter(p => p.city === userProfile.city);
      }
    }

    // Gender filter
    if (filters.gender !== 'all') {
      filtered = filtered.filter(p => {
        const gender = p.gender === 'prefer-not-to-say' ? 'non-binary' : p.gender;
        return gender === filters.gender;
      });
    }

    // Activity filter
    if (filters.activity !== 'all') {
      const now = Date.now();
      if (filters.activity === 'online') {
        // Filter profiles active in last 30 min (if we had lastActiveAt)
        // For now, show all as we don't have real-time data
      } else if (filters.activity === 'active') {
        // Filter very active profiles (could use engagement metrics)
        // For now, show all
      } else if (filters.activity === 'new') {
        // Filter profiles created in last 7-14 days
        filtered = filtered.filter(p => {
          const createdAt = p.createdAt instanceof Date ? p.createdAt.getTime() : 0;
          const daysSince = (now - createdAt) / (1000 * 60 * 60 * 24);
          return daysSince <= 14;
        });
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => {
        const name = p.name?.toLowerCase() || '';
        const city = p.city?.toLowerCase() || '';
        const bio = p.bio?.toLowerCase() || '';
        const interests = p.interests?.map(i => i.toLowerCase()).join(' ') || '';
        
        return (
          name.includes(query) ||
          city.includes(query) ||
          bio.includes(query) ||
          interests.includes(query)
        );
      });
    }

    return filtered;
  }, [profiles, filters, searchQuery, userProfile]);

  // Generate sections from filtered profiles
  const sections = useMemo((): ExploreSection[] => {
    const sectionList: ExploreSection[] = [];
    
    if (filteredProfiles.length === 0) {
      return sectionList;
    }

    // Section 1: Trending near you (boosted + same city)
    const trendingNearby = filteredProfiles.filter(p => 
      (boostedProfiles.has(p.uid) || p.isVIP || p.membership === 'vip' || p.membership === 'royal') &&
      p.city === userProfile?.city
    ).slice(0, 10);
    
    if (trendingNearby.length > 0) {
      sectionList.push({
        id: 'trending-nearby',
        title: userProfile?.city ? 'Trending near you' : 'Trending globally',
        subtitle: userProfile?.city || undefined,
        profiles: trendingNearby,
      });
    }

    // Section 2: New this week
    const now = Date.now();
    const newProfiles = filteredProfiles.filter(p => {
      const createdAt = p.createdAt instanceof Date ? p.createdAt.getTime() : 0;
      const daysSince = (now - createdAt) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    }).slice(0, 10);
    
    if (newProfiles.length > 0) {
      sectionList.push({
        id: 'new-week',
        title: 'New this week',
        profiles: newProfiles,
      });
    }

    // Section 3: Creators in your region
    const creators = filteredProfiles.filter(p => 
      p.membership === 'vip' || p.membership === 'royal' || p.isVIP
    ).slice(0, 10);
    
    if (creators.length > 0) {
      sectionList.push({
        id: 'creators',
        title: 'Creators in your region',
        profiles: creators,
      });
    }

    // Section 4: Recently active
    const recentlyActive = filteredProfiles.slice(0, 10);
    
    if (recentlyActive.length > 0) {
      sectionList.push({
        id: 'recently-active',
        title: 'Recently active',
        profiles: recentlyActive,
      });
    }

    // Section 5: Because you viewed... (similar interests)
    if (userProfile?.interests && userProfile.interests.length > 0) {
      const similarInterests = filteredProfiles.filter(p => {
        const sharedInterests = p.interests?.filter(i => 
          userProfile.interests.includes(i)
        ).length || 0;
        return sharedInterests >= 2;
      }).slice(0, 10);
      
      if (similarInterests.length > 0) {
        sectionList.push({
          id: 'similar',
          title: 'Because you viewed…',
          subtitle: 'Profiles with similar interests',
          profiles: similarInterests,
        });
      }
    }

    return sectionList;
  }, [filteredProfiles, boostedProfiles, userProfile]);

  return {
    profiles,
    sections,
    filteredProfiles,
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    refresh,
  };
};