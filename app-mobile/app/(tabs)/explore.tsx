/**
 * Explore Screen - Pack 35
 * Global Discovery & Smart Explore with Search, Filters, and Categorized Sections
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, ProfileData } from "@/lib/profileService";
import { ExploreProfileCard } from "@/components/ExploreProfileCard";
import { 
  useExploreDiscovery, 
  DistanceFilter, 
  GenderFilter, 
  ActivityFilter,
  ExploreSection 
} from "@/hooks/useExploreDiscovery";

export default function ExploreScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const {
    sections,
    filteredProfiles,
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    refresh,
  } = useExploreDiscovery(user?.uid || '', userProfile);

  React.useEffect(() => {
    if (user?.uid) {
      loadUserProfile();
    }
  }, [user?.uid]);

  const loadUserProfile = async () => {
    if (!user?.uid) return;
    try {
      const profile = await getProfile(user.uid);
      setUserProfile(profile);
    } catch (err) {
      console.error('Error loading user profile:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleProfilePress = (profile: ProfileData) => {
    router.push(`/profile/${profile.uid}` as any);
  };

  const handleFilterChange = (
    type: 'distance' | 'gender' | 'activity',
    value: DistanceFilter | GenderFilter | ActivityFilter
  ) => {
    setFilters({
      ...filters,
      [type]: value,
    });
  };

  const renderFilterChip = (
    label: string,
    active: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSection = (section: ExploreSection) => (
    <View key={section.id} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.subtitle && (
          <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
        )}
      </View>
      
      <FlatList
        horizontal
        data={section.profiles}
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <ExploreProfileCard
              profile={item}
              onPress={() => handleProfilePress(item)}
              showBoostBadge={item.isBoostedUntil ? new Date(item.isBoostedUntil) > new Date() : false}
              showCreatorBadge={item.membership === 'vip' || item.membership === 'royal' || item.isVIP}
              showLiveBadge={false}
              showPPVBadge={false}
              showAIBadge={false}
            />
          </View>
        )}
        keyExtractor={(item) => item.uid}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionList}
      />
    </View>
  );

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>Loading Explore...</Text>
      </View>
    );
  }

  if (!userProfile?.profileComplete) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={styles.emptyTitle}>Complete Your Profile</Text>
        <Text style={styles.emptyText}>
          Finish setting up your profile to start exploring!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✨ Explore</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            colors={['#40E0D0']}
            tintColor="#40E0D0"
          />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, city, interests…"
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {/* Distance Filters */}
          {renderFilterChip('Nearby', filters.distance === 'nearby', () =>
            handleFilterChange('distance', 'nearby')
          )}
          {renderFilterChip('My city', filters.distance === 'city', () =>
            handleFilterChange('distance', 'city')
          )}
          {renderFilterChip('My country', filters.distance === 'country', () =>
            handleFilterChange('distance', 'country')
          )}
          {renderFilterChip('Global', filters.distance === 'global', () =>
            handleFilterChange('distance', 'global')
          )}

          <View style={styles.filterDivider} />

          {/* Gender Filters */}
          {renderFilterChip('All', filters.gender === 'all', () =>
            handleFilterChange('gender', 'all')
          )}
          {renderFilterChip('Women', filters.gender === 'female', () =>
            handleFilterChange('gender', 'female')
          )}
          {renderFilterChip('Men', filters.gender === 'male', () =>
            handleFilterChange('gender', 'male')
          )}

          <View style={styles.filterDivider} />

          {/* Activity Filters */}
          {renderFilterChip('All', filters.activity === 'all', () =>
            handleFilterChange('activity', 'all')
          )}
          {renderFilterChip('Online recently', filters.activity === 'online', () =>
            handleFilterChange('activity', 'online')
          )}
          {renderFilterChip('Very active', filters.activity === 'active', () =>
            handleFilterChange('activity', 'active')
          )}
          {renderFilterChip('New profiles', filters.activity === 'new', () =>
            handleFilterChange('activity', 'new')
          )}
        </ScrollView>

        {/* Sections or Search Results */}
        {searchQuery.trim() ? (
          // Search Results View
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>
              Search results ({filteredProfiles.length})
            </Text>
            <View style={styles.gridContainer}>
              {filteredProfiles.map((profile) => (
                <ExploreProfileCard
                  key={profile.uid}
                  profile={profile}
                  onPress={() => handleProfilePress(profile)}
                  showBoostBadge={profile.isBoostedUntil ? new Date(profile.isBoostedUntil) > new Date() : false}
                  showCreatorBadge={profile.membership === 'vip' || profile.membership === 'royal' || profile.isVIP}
                />
              ))}
            </View>
            {filteredProfiles.length === 0 && (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchEmoji}>🔍</Text>
                <Text style={styles.emptySearchTitle}>No results found</Text>
                <Text style={styles.emptySearchText}>
                  Try different keywords or filters
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Sections View
          <>
            {sections.length === 0 && !loading && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>😊</Text>
                <Text style={styles.emptyTitle}>Nothing to show yet</Text>
                <Text style={styles.emptyText}>
                  Try changing filters or check back later
                </Text>
              </View>
            )}
            {sections.map(renderSection)}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#CCCCCC',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  searchIcon: {
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  clearIcon: {
    fontSize: 18,
    color: '#666',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#40E0D0',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#40E0D0',
  },
  sectionList: {
    paddingLeft: 20,
    paddingRight: 12,
  },
  cardWrapper: {
    marginRight: 8,
  },
  searchResults: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptySearch: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptySearchEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptySearchTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySearchText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
