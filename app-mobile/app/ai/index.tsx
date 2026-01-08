/**
 * PACK 340 - AI Discovery Screen (Mobile)
 * Browse AI companions with filters and sorting
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import {
  discoverAICompanions,
  type AICompanion,
  type AIDiscoveryParams,
  type Gender,
  type Language,
  type CreatorType,
  formatTokens,
  formatRating,
  getCreatorBadge,
  sortCompanions,
} from "@/types/aiCompanion";

export default function AIDiscoveryScreen() {
  const [companions, setCompanions] = useState<AICompanion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [gender, setGender] = useState<Gender | undefined>();
  const [language, setLanguage] = useState<Language | undefined>();
  const [minPrice, setMinPrice] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [minRating, setMinRating] = useState<number | undefined>();
  const [creatorType, setCreatorType] = useState<CreatorType | undefined>();

  // Sorting
  const [sortBy, setSortBy] = useState<'popular' | 'new' | 'priceLow' | 'priceHigh' | 'rating'>('popular');

  useEffect(() => {
    loadCompanions();
  }, [gender, language, minPrice, maxPrice, minRating, creatorType, sortBy]);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const params: AIDiscoveryParams = {
        filters: {
          gender,
          language,
          minPrice,
          maxPrice,
          minRating,
          creatorType,
        },
        sortBy,
      };

      const result = await discoverAICompanions(params);
      setCompanions(result.companions);
    } catch (error) {
      console.error('Error loading companions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCompanions();
  };

  const clearFilters = () => {
    setGender(undefined);
    setLanguage(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setMinRating(undefined);
    setCreatorType(undefined);
  };

  const renderCompanion = ({ item }: { item: AICompanion }) => {
    const badge = getCreatorBadge(item);

    return (
      <TouchableOpacity
        style={styles.companionCard}
        onPress={() => router.push(`/ai/${item.companionId}` as any)}
      >
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        <View style={styles.companionInfo}>
          <View style={styles.header}>
            <Text style={styles.companionName}>{item.name}</Text>
            <View style={[styles.badge, { backgroundColor: badge.color }]}>
              <Text style={styles.badgeText}>{badge.text}</Text>
            </View>
          </View>

          <Text style={styles.bio} numberOfLines={2}>
            {item.shortBio}
          </Text>

          <View style={styles.statsRow}>
            <Text style={styles.stat}>{formatRating(item.averageRating)}</Text>
            <Text style={styles.stat}>•</Text>
            <Text style={styles.stat}>{item.totalChats} chats</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Chat:</Text>
            <Text style={styles.price}>{formatTokens(item.chatBucketPrice)} tokens</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>AI Companions</Text>
        <Text style={styles.subtitle}>18+ only · Tokens required</Text>
      </View>

      {/* Sort & Filter Bar */}
      <View style={styles.controlBar}>
        <View style={styles.sortContainer}>
          <Text style={styles.label}>Sort:</Text>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              const options: typeof sortBy[] = ['popular', 'new', 'priceLow', 'priceHigh', 'rating'];
              const currentIndex = options.indexOf(sortBy);
              const nextIndex = (currentIndex + 1) % options.length;
              setSortBy(options[nextIndex]);
            }}
          >
            <Text style={styles.sortText}>
              {sortBy === 'popular' && '🔥 Popular'}
              {sortBy === 'new' && '✨ New'}
              {sortBy === 'priceLow' && '💰 Price ↓'}
              {sortBy === 'priceHigh' && '💎 Price ↑'}
              {sortBy === 'rating' && '⭐ Rating'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(true)}
        >
          <Text style={styles.filterText}>🔍 Filters</Text>
          {(gender || language || minPrice || maxPrice || minRating || creatorType) && (
            <View style={styles.filterIndicator} />
          )}
        </TouchableOpacity>
      </View>

      {/* Companions List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={companions}
          keyExtractor={(item) => item.companionId}
          renderItem={renderCompanion}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No AI companions found</Text>
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Filters Modal */}
      <Modal visible={showFilters} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.closeButton}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterContent}>
            {/* Gender Filter */}
            <Text style={styles.filterLabel}>Gender</Text>
            <View style={styles.chipGroup}>
              {['MALE', 'FEMALE', 'NON_BINARY', 'OTHER'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, gender === g && styles.chipActive]}
                  onPress={() => setGender(gender === g ? undefined : g as Gender)}
                >
                  <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Creator Type Filter */}
            <Text style={styles.filterLabel}>Creator</Text>
            <View style={styles.chipGroup}>
              {['USER', 'AVALO'].map((ct) => (
                <TouchableOpacity
                  key={ct}
                  style={[styles.chip, creatorType === ct && styles.chipActive]}
                  onPress={() => setCreatorType(creatorType === ct ? undefined : ct as CreatorType)}
                >
                  <Text style={[styles.chipText, creatorType === ct && styles.chipTextActive]}>
                    {ct} AI
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Clear All */}
            <TouchableOpacity style={styles.clearAllButton} onPress={clearFilters}>
              <Text style={styles.clearAllText}>Clear All Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerContainer: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
  },
  subtitle: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 4,
    fontWeight: '600',
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  sortText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginLeft: 6,
  },
  listContent: {
    padding: 16,
  },
  companionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0E0E0',
  },
  companionInfo: {
    flex: 1,
    marginLeft: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  companionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  stat: {
    fontSize: 13,
    color: '#8E8E93',
    marginRight: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  priceLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginRight: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 16,
  },
  clearButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  filterContent: {
    padding: 20,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginTop: 24,
    marginBottom: 12,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  chipText: {
    fontSize: 14,
    color: '#000000',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  clearAllButton: {
    marginTop: 32,
    paddingVertical: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    alignItems: 'center',
  },
  clearAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

