/**
 * PACK 271 - Discovery Grid View
 * Responsive grid layout with profile cards
 * 2 cols mobile, 3-4 tablet, 4-6 web
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSizes, fontWeights, radius } from "@/shared/theme";
import { DiscoveryProfile, TabMode } from './types';
import { getActivityIndicator, prepareDiscoveryProfiles } from './ranking';
import BadgeDisplay from "@/components/BadgeDisplay";

interface DiscoveryGridProps {
  profiles: DiscoveryProfile[];
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onProfilePress: (profile: DiscoveryProfile) => void;
  currentTab: TabMode;
}

/**
 * Calculate number of columns based on screen width
 */
function useGridColumns(): number {
  const [columns, setColumns] = useState(2);
  
  useEffect(() => {
    const updateColumns = () => {
      const width = Dimensions.get('window').width;
      
      if (Platform.OS === 'web') {
        // Web: 4-6 columns
        if (width >= 1440) setColumns(6);
        else if (width >= 1024) setColumns(5);
        else if (width >= 768) setColumns(4);
        else if (width >= 640) setColumns(3);
        else setColumns(2);
      } else {
        // Mobile/Tablet
        if (width >= 768) setColumns(4); // Tablet: 3-4 columns
        else if (width >= 640) setColumns(3);
        else setColumns(2); // Mobile: 2 columns
      }
    };
    
    updateColumns();
    const subscription = Dimensions.addEventListener('change', updateColumns);
    
    return () => subscription?.remove();
  }, []);
  
  return columns;
}

/**
 * Profile Card Component
 */
function ProfileCard({ profile, onPress }: { profile: DiscoveryProfile; onPress: () => void }) {
  const activityIndicator = getActivityIndicator(profile);
  
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Primary Photo */}
      <Image
        source={{ uri: profile.primaryPhoto }}
        style={styles.photo}
        resizeMode="cover"
      />
      
      {/* Activity Indicator */}
      {activityIndicator.label && (
        <View style={[styles.activityBadge, { backgroundColor: activityIndicator.color }]}>
          <Text style={styles.activityText}>{activityIndicator.label}</Text>
        </View>
      )}
      
      {/* Online Indicator */}
      {profile.isOnline && (
        <View style={styles.onlineDot} />
      )}
      
      {/* New Post Badge */}
      {profile.hasNewPost && (
        <View style={styles.newPostBadge}>
          <Text style={styles.newPostText}>NEW ✨</Text>
        </View>
      )}
      
      {/* Profile Info Overlay */}
      <View style={styles.infoOverlay}>
        <View style={styles.infoTop}>
          {/* User Badges */}
          <BadgeDisplay
            userBadges={{
              hasRoyal: profile.isRoyal,
              influencerLevel: null,
              earnOnChat: profile.earnModeEnabled,
              incognito: false,
            }}
            size="small"
            showLabel={false}
            maxBadges={1}
          />
        </View>
        
        <View style={styles.infoBottom}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.displayName}
            </Text>
            {profile.isVerified && (
              <Text style={styles.verifiedBadge}>✓</Text>
            )}
          </View>
          
          <View style={styles.detailsRow}>
            <Text style={styles.details}>
              {profile.age}
            </Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.details}>
              {profile.distance < 1 
                ? '<1 km away' 
                : `${Math.round(profile.distance)} km away`}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Main Discovery Grid Component
 */
export default function DiscoveryGrid({
  profiles,
  loading,
  refreshing,
  hasMore,
  onRefresh,
  onLoadMore,
  onProfilePress,
  currentTab,
}: DiscoveryGridProps) {
  const router = useRouter();
  const numColumns = useGridColumns();
  
  // Rank profiles for display
  const rankedProfiles = useMemo(() => {
    return prepareDiscoveryProfiles(profiles) as DiscoveryProfile[];
  }, [profiles]);
  
  const renderItem = useCallback(
    ({ item }: { item: DiscoveryProfile }) => (
      <ProfileCard profile={item} onPress={() => onProfilePress(item)} />
    ),
    [onProfilePress]
  );
  
  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.emptyText}>Loading profiles...</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🔍</Text>
        <Text style={styles.emptyTitle}>No profiles found</Text>
        <Text style={styles.emptyText}>
          {currentTab === 'passport'
            ? 'No users in this location. Try a different city.'
            : 'Adjust your filters or check back later.'}
        </Text>
      </View>
    );
  };
  
  const renderFooter = () => {
    if (!loading || profiles.length === 0) return null;
    
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  };
  
  return (
    <FlatList
      data={rankedProfiles}
      renderItem={renderItem}
      keyExtractor={(item) => item.userId}
      numColumns={numColumns}
      key={`grid-${numColumns}`} // Force re-render when columns change
      contentContainerStyle={styles.gridContainer}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={renderEmptyState}
      ListFooterComponent={renderFooter}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={10}
      windowSize={10}
    />
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    padding: spacing.sm,
    paddingBottom: spacing.massive,
  },
  row: {
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    aspectRatio: 0.75, // 3:4 ratio (portrait)
    margin: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundCard,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.backgroundElevated,
  },
  activityBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  activityText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  onlineDot: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.white,
  },
  newPostBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  newPostText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  infoTop: {
    marginBottom: spacing.sm,
  },
  infoBottom: {
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.white,
    flex: 1,
  },
  verifiedBadge: {
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  details: {
    fontSize: fontSizes.sm,
    color: colors.white,
  },
  dotSeparator: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    minHeight: 300,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  footerText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
});
