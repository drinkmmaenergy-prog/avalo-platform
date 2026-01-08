/**
 * PACK 279D - AI Discovery Screen
 * Browse and filter AI Companions across Avalo
 * 
 * Features:
 * - Filters: Gender, Language, Style, Rating, Creator Type
 * - Sorting: Popular, New, Top Rated, Royal Exclusive
 * - Display pricing from PACK 279A/B/322
 * - Route to AI Profile → Chat/Voice/Video
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from "@/lib/firebase";

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
  chatPrice: number; // 100 tokens per bucket
  voicePriceTier: 'STANDARD' | 'VIP' | 'ROYAL';
  videoPriceTier: 'STANDARD' | 'VIP' | 'ROYAL';
}

type FilterGender = 'all' | 'male' | 'female' | 'other';
type FilterLanguage = 'all' | 'en' | 'pl' | 'es' | 'de' | 'fr';
type FilterStyle = 'all' | 'flirty' | 'romantic' | 'friendly' | 'roleplay' | 'professional';
type FilterCreator = 'all' | 'USER_CREATED' | 'AVALO_CREATED';
type SortOption = 'popular' | 'new' | 'top_rated' | 'royal_exclusive';

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIDiscoveryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // State
  const [companions, setCompanions] = useState<AICompanionProfile[]>([]);
  const [filteredCompanions, setFilteredCompanions] = useState<AICompanionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        chatPrice: 100, // Fixed per PACK 279A
        voicePriceTier: doc.data().voicePriceTier || 'STANDARD',
        videoPriceTier: doc.data().videoPriceTier || 'STANDARD',
      }));

      setCompanions(loadedCompanions);
    } catch (error) {
      console.error('Error loading AI companions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        // Assuming newer companions have higher IDs (could use createdAt if available)
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

  const handleRefresh = () => {
    setRefreshing(true);
    loadCompanions();
  };

  const renderCompanionTile = ({ item }: { item: AICompanionProfile }) => (
    <TouchableOpacity
      style={[styles.companionTile, isDark && styles.companionTileDark]}
      onPress={() => router.push(`/ai/profile/${item.id}` as any)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {item.avatar.startsWith('http') ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <Text style={styles.avatarEmoji}>{item.avatar}</Text>
        )}
        {item.isRoyalExclusive && (
          <View style={styles.royalBadge}>
            <Text style={styles.royalBadgeText}>👑</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.companionContent}>
        <Text style={[styles.companionName, isDark && styles.textDark]}>
          {item.name}
        </Text>

        {/* Style badges */}
        <View style={styles.styleBadges}>
          {item.style.slice(0, 2).map((style, index) => (
            <View key={index} style={styles.styleBadge}>
              <Text style={styles.styleBadgeText}>{style}</Text>
            </View>
          ))}
        </View>

        {/* Rating */}
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>
            ⭐ {item.rating.toFixed(1)}
          </Text>
          <Text style={[styles.reviewCount, isDark && styles.textSecondaryDark]}>
            ({item.reviewCount} reviews)
          </Text>
        </View>

        {/* Pricing preview */}
        <View style={styles.pricingPreview}>
          <Text style={[styles.priceText, isDark && styles.textSecondaryDark]}>
            💬 Chat: {item.chatPrice} tokens/bucket
          </Text>
        </View>

        {/* Creator badge */}
        <View style={styles.creatorBadge}>
          <Text style={styles.creatorBadgeText}>
            {item.creatorType === 'AVALO_CREATED' ? '🏢 Avalo AI' : '👤 User Created'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFilters = () => (
    <View style={[styles.filtersContainer, isDark && styles.filtersContainerDark]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* Gender Filter */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, isDark && styles.textSecondaryDark]}>Gender</Text>
          <View style={styles.filterButtons}>
            {(['all', 'male', 'female', 'other'] as FilterGender[]).map((gender) => (
              <TouchableOpacity
                key={gender}
                style={[
                  styles.filterButton,
                  filterGender === gender && styles.filterButtonActive,
                ]}
                onPress={() => setFilterGender(gender)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterGender === gender && styles.filterButtonTextActive,
                  ]}
                >
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Language Filter */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, isDark && styles.textSecondaryDark]}>Language</Text>
          <View style={styles.filterButtons}>
            {(['all', 'en', 'pl'] as FilterLanguage[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.filterButton,
                  filterLanguage === lang && styles.filterButtonActive,
                ]}
                onPress={() => setFilterLanguage(lang)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterLanguage === lang && styles.filterButtonTextActive,
                  ]}
                >
                  {lang === 'all' ? 'All' : lang.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Style Filter */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, isDark && styles.textSecondaryDark]}>Style</Text>
          <View style={styles.filterButtons}>
            {(['all', 'flirty', 'romantic', 'friendly', 'roleplay'] as FilterStyle[]).map((style) => (
              <TouchableOpacity
                key={style}
                style={[
                  styles.filterButton,
                  filterStyle === style && styles.filterButtonActive,
                ]}
                onPress={() => setFilterStyle(style)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterStyle === style && styles.filterButtonTextActive,
                  ]}
                >
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Creator Type Filter */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, isDark && styles.textSecondaryDark]}>Creator</Text>
          <View style={styles.filterButtons}>
            {(['all', 'AVALO_CREATED', 'USER_CREATED'] as FilterCreator[]).map((creator) => (
              <TouchableOpacity
                key={creator}
                style={[
                  styles.filterButton,
                  filterCreator === creator && styles.filterButtonActive,
                ]}
                onPress={() => setFilterCreator(creator)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterCreator === creator && styles.filterButtonTextActive,
                  ]}
                >
                  {creator === 'all' ? 'All' : creator.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderSortButtons = () => (
    <View style={[styles.sortContainer, isDark && styles.sortContainerDark]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(['popular', 'new', 'top_rated', 'royal_exclusive'] as SortOption[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.sortButton,
              sortBy === option && styles.sortButtonActive,
            ]}
            onPress={() => setSortBy(option)}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortBy === option && styles.sortButtonTextActive,
              ]}
            >
              {option === 'popular' && '🔥 Popular'}
              {option === 'new' && '✨ New'}
              {option === 'top_rated' && '⭐ Top Rated'}
              {option === 'royal_exclusive' && '👑 Royal'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
          Loading AI Companions...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>
          AI Discovery
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Sort buttons */}
      {renderSortButtons()}

      {/* Filters */}
      {renderFilters()}

      {/* Results count */}
      <View style={styles.resultsHeader}>
        <Text style={[styles.resultsText, isDark && styles.textSecondaryDark]}>
          {filteredCompanions.length} AI Companions
        </Text>
      </View>

      {/* Companions grid */}
      <FlatList
        data={filteredCompanions}
        keyExtractor={(item) => item.id}
        renderItem={renderCompanionTile}
        numColumns={2}
        contentContainerStyle={styles.gridContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              No AI Companions Found
            </Text>
            <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
              Try adjusting your filters
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerSpacer: {
    width: 40,
  },
  sortContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sortContainerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: '#007AFF',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  sortButtonTextActive: {
    color: '#FFFFFF',
  },
  filtersContainer: {
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filtersContainerDark: {
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#38383A',
  },
  filterGroup: {
    marginLeft: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#34C759',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  gridContent: {
    padding: 8,
  },
  companionTile: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  companionTileDark: {
    backgroundColor: '#1C1C1E',
  },
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarEmoji: {
    fontSize: 64,
  },
  royalBadge: {
    position: 'absolute',
    top: 0,
    right: 20,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    padding: 4,
  },
  royalBadgeText: {
    fontSize: 16,
  },
  companionContent: {
    flex: 1,
  },
  companionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
    textAlign: 'center',
  },
  styleBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 8,
  },
  styleBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    margin: 2,
  },
  styleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#007AFF',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 11,
    color: '#8E8E93',
  },
  pricingPreview: {
    marginTop: 8,
    marginBottom: 4,
  },
  priceText: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
  },
  creatorBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'center',
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});
