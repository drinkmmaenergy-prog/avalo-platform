/**
 * PACK 161 — Smart Social Graph Discovery Screen
 * Interest-driven discovery with multi-mode personalization
 * 
 * NO romantic mode, NO dating features
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// ============================================================================
// TYPES
// ============================================================================

type DiscoveryMode = 
  | 'PROFESSIONAL' 
  | 'SOCIAL_LIFESTYLE' 
  | 'ENTERTAINMENT' 
  | 'LEARNING' 
  | 'LOCAL_EVENTS';

type DiscoveryCategory =
  | 'SKILLS'
  | 'LIFESTYLE'
  | 'BUSINESS'
  | 'CREATIVE'
  | 'ENTERTAINMENT'
  | 'LOCAL_EVENTS'
  | 'DIGITAL_PRODUCTS';

interface CreatorCard {
  creatorId: string;
  displayName: string;
  primaryCategory: DiscoveryCategory;
  expertise: string[];
  contentType: string;
  recentActivity: string;
  contentQuality: number;
  safetyRating: number;
  thumbnailUrl?: string;
  bio?: string;
}

interface FeedResponse {
  items: CreatorCard[];
  cursor?: string;
  hasMore: boolean;
  explanation: string;
  diversityAchieved: boolean;
}

// ============================================================================
// MODE CONFIGURATION
// ============================================================================

const MODE_CONFIG: Record<DiscoveryMode, { label: string; icon: string; description: string }> = {
  PROFESSIONAL: {
    label: 'Professional',
    icon: '💼',
    description: 'Business, skills, and networking',
  },
  SOCIAL_LIFESTYLE: {
    label: 'Lifestyle',
    icon: '🌟',
    description: 'Lifestyle and social content',
  },
  ENTERTAINMENT: {
    label: 'Entertainment',
    icon: '🎮',
    description: 'Entertainment and creative content',
  },
  LEARNING: {
    label: 'Learning',
    icon: '📚',
    description: 'Education and skill-building',
  },
  LOCAL_EVENTS: {
    label: 'Events',
    icon: '📍',
    description: 'Local workshops and meetups',
  },
};

const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  SKILLS: '🎯 Skills',
  LIFESTYLE: '✨ Lifestyle',
  BUSINESS: '💼 Business',
  CREATIVE: '🎨 Creative',
  ENTERTAINMENT: '🎮 Entertainment',
  LOCAL_EVENTS: '📍 Events',
  DIGITAL_PRODUCTS: '📦 Products',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SmartFeedScreen() {
  const [currentMode, setCurrentMode] = useState<DiscoveryMode>('SOCIAL_LIFESTYLE');
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const functions = getFunctions();
  const auth = getAuth();

  // ============================================================================
  // FEED LOADING
  // ============================================================================

  const loadFeed = useCallback(async (mode: DiscoveryMode, reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
        setCreators([]);
        setCursor(undefined);
        setError(null);
      }

      const user = auth.currentUser;
      if (!user) {
        setError('Please log in to view discovery feed');
        return;
      }

      const getSmartDiscoveryFeed = httpsCallable<any, FeedResponse>(
        functions,
        'getSmartDiscoveryFeed'
      );

      const response = await getSmartDiscoveryFeed({
        userId: user.uid,
        mode,
        cursor: reset ? undefined : cursor,
        limit: 20,
      });

      const data = response.data;

      if (reset) {
        setCreators(data.items);
      } else {
        setCreators(prev => [...prev, ...data.items]);
      }

      setCursor(data.cursor);
      setHasMore(data.hasMore);
      setExplanation(data.explanation);
    } catch (err: any) {
      console.error('Error loading feed:', err);
      setError(err.message || 'Failed to load discovery feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor, auth, functions]);

  // Load initial feed
  useEffect(() => {
    loadFeed(currentMode, true);
  }, [currentMode]);

  // ============================================================================
  // MODE SWITCHING
  // ============================================================================

  const handleModeChange = async (mode: DiscoveryMode) => {
    try {
      setCurrentMode(mode);

      // Update backend preference
      const switchDiscoveryMode = httpsCallable(functions, 'switchDiscoveryMode');
      await switchDiscoveryMode({ mode });

      // Reload feed
      await loadFeed(mode, true);
    } catch (err: any) {
      console.error('Error switching mode:', err);
      setError('Failed to switch mode');
    }
  };

  // ============================================================================
  // REFRESH & PAGINATION
  // ============================================================================

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed(currentMode, true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore && cursor) {
      loadFeed(currentMode, false);
    }
  };

  // ============================================================================
  // CREATOR CARD RENDERING
  // ============================================================================

  const renderCreatorCard = ({ item }: { item: CreatorCard }) => (
    <TouchableOpacity
      style={styles.creatorCard}
      onPress={() => {
        // Navigate to creator profile
        console.log('Navigate to creator:', item.creatorId);
      }}
    >
      {item.thumbnailUrl && (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      )}
      
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.creatorName}>{item.displayName}</Text>
          <Text style={styles.category}>
            {CATEGORY_LABELS[item.primaryCategory]}
          </Text>
        </View>

        {item.bio && (
          <Text style={styles.bio} numberOfLines={2}>
            {item.bio}
          </Text>
        )}

        {item.expertise.length > 0 && (
          <View style={styles.expertiseContainer}>
            {item.expertise.slice(0, 3).map((skill, index) => (
              <View key={index} style={styles.expertiseTag}>
                <Text style={styles.expertiseText}>{skill}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Quality</Text>
            <Text style={styles.metricValue}>{item.contentQuality}/100</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Safety</Text>
            <Text style={styles.metricValue}>{item.safetyRating}/100</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Type</Text>
            <Text style={styles.metricValue}>{item.contentType}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ============================================================================
  // MODE SELECTOR RENDERING
  // ============================================================================

  const renderModeSelector = () => (
    <View style={styles.modeSelector}>
      <Text style={styles.modeSelectorTitle}>Discovery Mode</Text>
      <View style={styles.modeButtons}>
        {(Object.keys(MODE_CONFIG) as DiscoveryMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.modeButton,
              currentMode === mode && styles.modeButtonActive,
            ]}
            onPress={() => handleModeChange(mode)}
          >
            <Text style={styles.modeIcon}>{MODE_CONFIG[mode].icon}</Text>
            <Text
              style={[
                styles.modeLabel,
                currentMode === mode && styles.modeLabelActive,
              ]}
            >
              {MODE_CONFIG[mode].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.modeDescription}>
        {MODE_CONFIG[currentMode].description}
      </Text>
    </View>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Smart Discovery</Text>
        <Text style={styles.headerSubtitle}>Interest-driven, not appearance-based</Text>
      </View>

      {/* Mode Selector */}
      {renderModeSelector()}

      {/* Feed Explanation */}
      {explanation && (
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationText}>{explanation}</Text>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Creator Feed */}
      <FlatList
        data={creators}
        renderItem={renderCreatorCard}
        keyExtractor={(item) => item.creatorId}
        contentContainerStyle={styles.feedContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading creators...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No creators found</Text>
              <Text style={styles.emptySubtext}>
                Try switching to a different mode or check back later
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && creators.length > 0 ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null
        }
      />

      {/* NO romantic/dating features notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          ℹ️ This is NOT a dating app. Rankings are based on content relevance, not appearance.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  modeSelector: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modeSelectorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  modeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
  },
  modeIcon: {
    fontSize: 16,
  },
  modeLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  modeLabelActive: {
    color: '#FFFFFF',
  },
  modeDescription: {
    fontSize: 13,
    color: '#666666',
    marginTop: 8,
  },
  explanationContainer: {
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#90CAF9',
  },
  explanationText: {
    fontSize: 13,
    color: '#1976D2',
    lineHeight: 18,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderBottomWidth: 1,
    borderBottomColor: '#EF9A9A',
  },
  errorText: {
    fontSize: 13,
    color: '#C62828',
  },
  feedContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  creatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnail: {
    width: '100%',
    height: 150,
    backgroundColor: '#E0E0E0',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  creatorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  category: {
    fontSize: 12,
    color: '#666666',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 12,
  },
  expertiseContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  expertiseTag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  expertiseText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#999999',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  notice: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: '#FFF9C4',
    borderTopWidth: 1,
    borderTopColor: '#F57F17',
  },
  noticeText: {
    fontSize: 12,
    color: '#F57F17',
    textAlign: 'center',
  },
});
