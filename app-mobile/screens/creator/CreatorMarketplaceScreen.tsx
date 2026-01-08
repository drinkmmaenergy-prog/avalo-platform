/**
 * PACK 52: Creator Marketplace Screen
 * 
 * Shows a browsable list of creators who earn from chat.
 * Includes filters for language, country, price range, and Royal-only.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/firebase';
import {
  fetchCreatorMarketplace,
  CreatorMarketplaceItem,
  CreatorMarketplaceFilters,
  getSavedMarketplaceFilters,
  saveMarketplaceFilters,
} from '../../services/creatorService';

// ============================================================================
// CREATOR CARD COMPONENT
// ============================================================================

interface CreatorCardProps {
  creator: CreatorMarketplaceItem;
  onPress: () => void;
}

const CreatorCard: React.FC<CreatorCardProps> = ({ creator, onPress }) => {
  const { t } = useTranslation();

  const getRoyalBadgeColor = () => {
    switch (creator.royalTier) {
      case 'ROYAL_PLATINUM':
        return '#E5E4E2';
      case 'ROYAL_GOLD':
        return '#FFD700';
      case 'ROYAL_SILVER':
        return '#C0C0C0';
      default:
        return 'transparent';
    }
  };

  const getRoyalLabel = () => {
    switch (creator.royalTier) {
      case 'ROYAL_PLATINUM':
        return 'Platinum';
      case 'ROYAL_GOLD':
        return 'Gold';
      case 'ROYAL_SILVER':
        return 'Silver';
      default:
        return '';
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Image
          source={{ uri: creator.avatarUrl || 'https://via.placeholder.com/80' }}
          style={styles.avatar}
        />
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {creator.displayName}
            </Text>
            {creator.royalTier !== 'NONE' && (
              <View
                style={[
                  styles.royalBadge,
                  { backgroundColor: getRoyalBadgeColor() },
                ]}
              >
                <Text style={styles.royalText}>{getRoyalLabel()}</Text>
              </View>
            )}
          </View>

          {creator.mainLocationCity && creator.mainLocationCountry && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#666" />
              <Text style={styles.locationText}>
                {creator.mainLocationCity}, {creator.mainLocationCountry}
              </Text>
            </View>
          )}

          {creator.languages && creator.languages.length > 0 && (
            <View style={styles.languagesRow}>
              <Ionicons name="language-outline" size={14} color="#666" />
              <Text style={styles.languagesText}>
                {creator.languages.join(', ')}
              </Text>
            </View>
          )}

          <Text style={styles.priceText}>
            {t('creator.card.fromPrice', { tokens: creator.baseMessageTokenCost })}
          </Text>
        </View>
      </View>

      {creator.shortBio && (
        <Text style={styles.bio} numberOfLines={2}>
          {creator.shortBio}
        </Text>
      )}

      {creator.isHighRisk && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={16} color="#FF3B30" />
          <Text style={styles.warningText}>
            {t('creator.highRiskWarning')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ============================================================================
// FILTER MODAL COMPONENT
// ============================================================================

interface FilterModalProps {
  visible: boolean;
  filters: CreatorMarketplaceFilters;
  onApply: (filters: CreatorMarketplaceFilters) => void;
  onClose: () => void;
}

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  filters,
  onApply,
  onClose,
}) => {
  const { t } = useTranslation();
  const [localFilters, setLocalFilters] = useState<CreatorMarketplaceFilters>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  if (!visible) return null;

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleClear = () => {
    const emptyFilters: CreatorMarketplaceFilters = {};
    setLocalFilters(emptyFilters);
    onApply(emptyFilters);
    onClose();
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t('creator.filters.title')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filterScroll}>
          {/* Language Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{t('creator.filters.language')}</Text>
            <View style={styles.chipContainer}>
              {['en', 'pl', 'es', 'de', 'fr'].map(lang => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.chip,
                    localFilters.language === lang && styles.chipSelected,
                  ]}
                  onPress={() =>
                    setLocalFilters({
                      ...localFilters,
                      language: localFilters.language === lang ? undefined : lang,
                    })
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      localFilters.language === lang && styles.chipTextSelected,
                    ]}
                  >
                    {lang.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Price Range Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{t('creator.filters.priceRange')}</Text>
            <View style={styles.priceRangeRow}>
              <TouchableOpacity
                style={[
                  styles.priceButton,
                  localFilters.maxPriceTokens === 5 && styles.priceButtonSelected,
                ]}
                onPress={() =>
                  setLocalFilters({
                    ...localFilters,
                    minPriceTokens: undefined,
                    maxPriceTokens: localFilters.maxPriceTokens === 5 ? undefined : 5,
                  })
                }
              >
                <Text style={styles.priceButtonText}>0-5 tokens</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.priceButton,
                  localFilters.minPriceTokens === 6 &&
                  localFilters.maxPriceTokens === 10 &&
                  styles.priceButtonSelected,
                ]}
                onPress={() =>
                  setLocalFilters({
                    ...localFilters,
                    minPriceTokens:
                      localFilters.minPriceTokens === 6 ? undefined : 6,
                    maxPriceTokens:
                      localFilters.maxPriceTokens === 10 ? undefined : 10,
                  })
                }
              >
                <Text style={styles.priceButtonText}>6-10 tokens</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.priceButton,
                  localFilters.minPriceTokens === 11 && styles.priceButtonSelected,
                ]}
                onPress={() =>
                  setLocalFilters({
                    ...localFilters,
                    minPriceTokens:
                      localFilters.minPriceTokens === 11 ? undefined : 11,
                    maxPriceTokens: undefined,
                  })
                }
              >
                <Text style={styles.priceButtonText}>11+ tokens</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Royal Only Filter */}
          <View style={styles.filterSection}>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() =>
                setLocalFilters({
                  ...localFilters,
                  royalOnly: !localFilters.royalOnly,
                })
              }
            >
              <View
                style={[
                  styles.checkbox,
                  localFilters.royalOnly && styles.checkboxChecked,
                ]}
              >
                {localFilters.royalOnly && (
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                )}
              </View>
              <Text style={styles.checkLabel}>{t('creator.filters.royalOnly')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>{t('common.clear')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function CreatorMarketplaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [creators, setCreators] = useState<CreatorMarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<CreatorMarketplaceFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const currentUser = auth.currentUser;

  // Load saved filters on mount
  useEffect(() => {
    loadSavedFilters();
  }, []);

  // Load creators when filters change
  useEffect(() => {
    if (currentUser) {
      loadCreators();
    }
  }, [filters, currentUser]);

  const loadSavedFilters = async () => {
    try {
      const saved = await getSavedMarketplaceFilters();
      if (saved) {
        setFilters(saved);
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const loadCreators = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const items = await fetchCreatorMarketplace(currentUser.uid, filters);
      setCreators(items);
    } catch (error) {
      console.error('Error loading creators:', error);
      Alert.alert(
        t('error.title'),
        t('error.loadingCreators', { defaultValue: 'Failed to load creators' })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;

    try {
      setRefreshing(true);
      const items = await fetchCreatorMarketplace(currentUser.uid, filters);
      setCreators(items);
    } catch (error) {
      console.error('Error refreshing creators:', error);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser, filters]);

  const handleApplyFilters = async (newFilters: CreatorMarketplaceFilters) => {
    setFilters(newFilters);
    await saveMarketplaceFilters(newFilters);
  };

  const handleCreatorPress = (creator: CreatorMarketplaceItem) => {
    router.push(`/creator/profile/${creator.userId}`);
  };

  const activeFilterCount = Object.keys(filters).filter(
    key => filters[key as keyof CreatorMarketplaceFilters] !== undefined
  ).length;

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            {t('auth.loginRequired', { defaultValue: 'Please log in to continue' })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('creator.marketplaceTitle')}</Text>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          style={styles.filterButton}
        >
          <Ionicons name="filter" size={24} color="#000" />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Creators List */}
      {loading && !refreshing ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : creators.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="person-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>
            {t('creator.noCreators', { defaultValue: 'No creators found' })}
          </Text>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              onPress={() => handleApplyFilters({})}
              style={styles.clearFiltersButton}
            >
              <Text style={styles.clearFiltersText}>
                {t('creator.clearFilters', { defaultValue: 'Clear filters' })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={creators}
          keyExtractor={item => item.userId}
          renderItem={({ item }) => (
            <CreatorCard
              creator={item}
              onPress={() => handleCreatorPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      {/* Filter Modal */}
      <FilterModal
        visible={showFilters}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setShowFilters(false)}
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
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  filterButton: {
    padding: 8,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
    flex: 1,
  },
  royalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  royalText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  languagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  languagesText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 4,
  },
  bio: {
    fontSize: 14,
    color: '#333',
    marginTop: 12,
    lineHeight: 20,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3F3',
    padding: 8,
    borderRadius: 6,
    marginTop: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#FF3B30',
    marginLeft: 6,
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  clearFiltersText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  filterScroll: {
    maxHeight: 400,
  },
  filterSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
  },
  chipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  chipText: {
    fontSize: 14,
    color: '#000',
  },
  chipTextSelected: {
    color: '#FFF',
  },
  priceRangeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priceButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  priceButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  priceButtonText: {
    fontSize: 12,
    color: '#000',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CCC',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkLabel: {
    fontSize: 14,
    color: '#000',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
