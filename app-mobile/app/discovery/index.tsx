/**
 * PACK 294 - Search & Discovery Filters (Enhanced)
 * Built on PACK 271 - Discovery Engine
 *
 * Features:
 * - Advanced filtering (age, distance, interests, languages, verification)
 * - Name/username search
 * - Responsive grid (2 cols mobile, 3-4 tablet, 4-6 web)
 * - Profile ranking with fairness boost & tier boosts
 * - Nearby/Passport tabs
 * - Infinite scroll pagination
 * - Safety enforcement (18+, no banned/shadow-banned)
 * - 100% FREE access
 * - Analytics tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFirestore, collection, query, where, orderBy, limit, startAfter, getDocs, DocumentSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import * as Location from 'expo-location';
import { colors, spacing, fontSizes, fontWeights, radius } from "@/shared/theme";
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import DiscoveryGrid from './grid';
import DiscoveryFilters, { DiscoveryFilterOptions } from './filters';
import SearchBar from './search-bar';
import { DiscoveryProfile, TabMode } from './types';
import { rankProfiles } from './ranking';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PROFILES_PER_PAGE = 30;

export default function DiscoveryScreen() {
  const router = useRouter();
  const auth = getAuth();
  const db = getFirestore();
  
  // State
  const [currentTab, setCurrentTab] = useState<TabMode>('nearby');
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [passportLocation, setPassportLocation] = useState<{ 
    enabled: boolean;
    city: string;
    country: string;
    lat: number;
    lng: number;
  } | null>(null);
  
  // Filters (PACK 294 enhanced filters)
  const [filters, setFilters] = useState<DiscoveryFilterOptions>({
    ageMin: 18,
    ageMax: 99,
    distanceKmMax: 100,
    gender: 'ANY',
    lookingFor: 'ANY',
    interests: [],
    languages: [],
    hasProfilePhoto: false,
    hasVideoIntro: false,
    isVerifiedOnly: false,
    minPopularityScore: 0,
    influencerOnly: false,
    royalOnly: false,
  });
  
  // Get user location on mount
  useEffect(() => {
    getUserLocation();
    loadPassportSettings();
  }, []);
  
  // Load profiles when tab or filters change
  useEffect(() => {
    loadProfiles(true);
  }, [currentTab, filters]);
  
  /**
   * Get user's GPS location
   */
  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location to use Discovery.');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };
  
  /**
   * Load passport settings from Firestore
   */
  const loadPassportSettings = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      // TODO: Load from Firestore user settings
      // const userDoc = await getDoc(doc(db, 'users', user.uid));
      // const passport = userDoc.data()?.location?.passport;
      // if (passport?.enabled) {
      //   setPassportLocation(passport);
      // }
    } catch (error) {
      console.error('Error loading passport settings:', error);
    }
  };
  
  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  
  /**
   * Load profiles using PACK 294 backend search endpoint
   */
  const loadProfiles = async (reset: boolean = false) => {
    const functions = getFunctions();
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Login Required', 'Please log in to use Discovery.');
        return;
      }
      
      // Determine which location to use
      const useLocation = currentTab === 'passport' && passportLocation?.enabled
        ? { lat: passportLocation.lat, lng: passportLocation.lng }
        : userLocation;
      
      if (!useLocation) {
        Alert.alert('Location Required', 'Unable to determine your location.');
        return;
      }
      
      if (reset) {
        setLoading(true);
        setProfiles([]);
        setCursor(null);
        setHasMore(true);
      }
      
      // Call backend discovery search endpoint (PACK 294)
      const discoverySearch = httpsCallable(functions, 'discoverySearch');
      const token = await user.getIdToken();
      
      const response = await discoverySearch({
        ageMin: filters.ageMin,
        ageMax: filters.ageMax,
        distanceKmMax: filters.distanceKmMax,
        gender: filters.gender,
        lookingFor: filters.lookingFor,
        interests: filters.interests?.join(','),
        languages: filters.languages?.join(','),
        hasProfilePhoto: filters.hasProfilePhoto,
        hasVideoIntro: filters.hasVideoIntro,
        isVerifiedOnly: filters.isVerifiedOnly,
        minPopularityScore: filters.minPopularityScore,
        influencerOnly: filters.influencerOnly,
        royalOnly: filters.royalOnly,
        viewerLat: useLocation.lat,
        viewerLng: useLocation.lng,
        cursor: reset ? null : cursor,
        limit: PROFILES_PER_PAGE,
      }) as any;
      
      const data = response.data;
      
      // Map backend results to DiscoveryProfile format
      const newProfiles = data.items.map((item: any) => ({
        userId: item.userId,
        displayName: item.displayName,
        age: item.age,
        distance: item.distanceKm || 0,
        photos: [], // Will be loaded separately if needed
        primaryPhoto: '', // Will be loaded separately
        isOnline: false, // Will be determined from presence
        lastActive: new Date(item.lastActiveAt),
        hasNewPost: false,
        lastPostDate: undefined,
        isVerified: item.isVerified,
        isRoyal: item.royalBadge,
        hasAIAvatar: false,
        earnModeEnabled: false,
        incognito: false,
        profileQuality: item.popularityScore,
        popularity: item.popularityScore,
        activityScore: item.recentActivityScore,
        swipeEligible: true,
        location: {
          city: item.city,
          country: item.country,
          coordinates: { lat: 0, lng: 0 },
        },
        bio: '',
        interests: item.interests || [],
        gender: item.gender.toLowerCase(),
        preferredGender: [],
      }));
      
      // Update state
      if (reset) {
        setProfiles(newProfiles);
      } else {
        setProfiles(prev => [...prev, ...newProfiles]);
      }
      
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (error: any) {
      console.error('Error loading profiles:', error);
      Alert.alert('Error', 'Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  /**
   * Handle refresh
   */
  const handleRefresh = () => {
    setRefreshing(true);
    loadProfiles(true);
  };
  
  /**
   * Handle load more (infinite scroll)
   */
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadProfiles(false);
    }
  };
  
  /**
   * Handle profile press - open full profile
   */
  const handleProfilePress = (profile: DiscoveryProfile) => {
    // Navigate to profile screen
    router.push(`/profile/${profile.userId}` as any);
  };
  
  /**
   * Handle swipe session start
   */
  const handleStartSwipe = () => {
    router.push('/swipe' as any);
  };
  
  /**
   * Switch between Nearby and Passport tabs
   */
  const handleTabSwitch = (tab: TabMode) => {
    if (tab === 'passport' && (!passportLocation || !passportLocation.enabled)) {
      Alert.alert(
        'Passport Required',
        'Enable Passport mode to browse users in other locations.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable Passport', onPress: () => router.push('/profile/settings/passport' as any) },
        ]
      );
      return;
    }
    setCurrentTab(tab);
  };
  
  /**
   * Render tab selector
   */
  const renderTabs = () => (
    <View style={styles.tabs}>
      <TouchableOpacity
        style={[styles.tab, currentTab === 'nearby' && styles.tabActive]}
        onPress={() => handleTabSwitch('nearby')}
      >
        <Text style={[styles.tabText, currentTab === 'nearby' && styles.tabTextActive]}>
          📍 Nearby
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tab, currentTab === 'passport' && styles.tabActive]}
        onPress={() => handleTabSwitch('passport')}
      >
        <Text style={[styles.tabText, currentTab === 'passport' && styles.tabTextActive]}>
          🌍 Passport
        </Text>
      </TouchableOpacity>
    </View>
  );
  
  /**
   * Handle filter apply
   */
  const handleApplyFilters = (newFilters: DiscoveryFilterOptions) => {
    setFilters(newFilters);
    loadProfiles(true);
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader
        title="Discovery"
        rightAction={
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <TouchableOpacity onPress={() => setShowSearch(true)}>
              <Text style={styles.filterIcon}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFilters(true)}>
              <Text style={styles.filterIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        }
      />
      
      {/* Tabs */}
      {renderTabs()}
      
      {/* Free Access Notice */}
      <View style={styles.freeNotice}>
        <Text style={styles.freeNoticeText}>
          🆓 Discovery is 100% FREE for everyone
        </Text>
      </View>
      
      {/* Grid */}
      <DiscoveryGrid
        profiles={profiles}
        loading={loading}
        refreshing={refreshing}
        hasMore={hasMore}
        onRefresh={handleRefresh}
        onLoadMore={handleLoadMore}
        onProfilePress={handleProfilePress}
        currentTab={currentTab}
      />
      
      {/* Swipe FAB */}
      <TouchableOpacity style={styles.swipeFab} onPress={handleStartSwipe}>
        <Text style={styles.swipeFabIcon}>🔥</Text>
      </TouchableOpacity>
      
      {/* Filter Modal (PACK 294) */}
      <DiscoveryFilters
        visible={showFilters}
        filters={filters}
        onClose={() => setShowFilters(false)}
        onApply={handleApplyFilters}
      />
      
      {/* Search Bar (PACK 294) */}
      <SearchBar
        visible={showSearch}
        onClose={() => setShowSearch(false)}
      />
      
      <BottomNavigation />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  freeNotice: {
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  freeNoticeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.white,
    textAlign: 'center',
  },
  filterIcon: {
    fontSize: 24,
  },
  swipeFab: {
    position: 'absolute',
    bottom: 80,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  swipeFabIcon: {
    fontSize: 28,
  },
});
