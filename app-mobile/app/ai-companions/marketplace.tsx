/**
 * PACK 311 — AI Companions Marketplace
 * Main marketplace discovery screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { AIMarketplaceCard } from "@/components/AIMarketplaceCard";
import type { AIMarketplaceResponse, MarketplaceQueryParams } from "@/types/aiMarketplace";

export default function AIMarketplaceScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marketplaceData, setMarketplaceData] = useState<AIMarketplaceResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();

  const loadMarketplace = async (page: number = 1, refresh: boolean = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params: MarketplaceQueryParams = {
        page,
        pageSize: 20,
      };

      if (selectedLanguage) {
        params.lang = selectedLanguage;
      }

      if (selectedCategory) {
        params.categoryTag = selectedCategory;
      }

      const getMarketplace = httpsCallable<MarketplaceQueryParams, AIMarketplaceResponse>(
        functions,
        'getAIMarketplace'
      );

      const result = await getMarketplace(params);
      setMarketplaceData(result.data);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading marketplace:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAvatarView = async (avatarId: string) => {
    try {
      // Track view event
      const trackView = httpsCallable(functions, 'trackAIAvatarView');
      await trackView({ avatarId });
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const handleRefresh = () => {
    loadMarketplace(1, true);
  };

  const handleNextPage = () => {
    if (marketplaceData?.hasMore) {
      loadMarketplace(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      loadMarketplace(currentPage - 1);
    }
  };

  const handleLanguageFilter = (lang: string) => {
    setSelectedLanguage(selectedLanguage === lang ? undefined : lang);
  };

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(selectedCategory === category ? undefined : category);
  };

  useEffect(() => {
    loadMarketplace(1);
  }, [selectedLanguage, selectedCategory]);

  if (loading && !marketplaceData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading AI Companions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🤖 AI Companions Marketplace</Text>
          <Text style={styles.subtitle}>
            Discover and chat with AI-powered companions
          </Text>
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Languages:</Text>
          <View style={styles.filterChips}>
            {['en', 'pl'].map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.filterChip,
                  selectedLanguage === lang && styles.filterChipActive,
                ]}
                onPress={() => handleLanguageFilter(lang)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedLanguage === lang && styles.filterChipTextActive,
                  ]}
                >
                  {lang.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Categories:</Text>
          <View style={styles.filterChips}>
            {['romantic', 'chatty', 'coach', 'intellectual'].map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.filterChip,
                  selectedCategory === category && styles.filterChipActive,
                ]}
                onPress={() => handleCategoryFilter(category)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedCategory === category && styles.filterChipTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Marketplace Items */}
        <View style={styles.itemsContainer}>
          {marketplaceData?.items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No AI Companions found with these filters
              </Text>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={() => {
                  setSelectedLanguage(undefined);
                  setSelectedCategory(undefined);
                }}
              >
                <Text style={styles.clearFiltersText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            marketplaceData?.items.map((avatar) => (
              <AIMarketplaceCard
                key={avatar.avatarId}
                avatar={avatar}
                onView={handleAvatarView}
              />
            ))
          )}
        </View>

        {/* Pagination */}
        {marketplaceData && marketplaceData.items.length > 0 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === 1 && styles.paginationButtonDisabled,
              ]}
              onPress={handlePreviousPage}
              disabled={currentPage === 1}
            >
              <Text
                style={[
                  styles.paginationButtonText,
                  currentPage === 1 && styles.paginationButtonTextDisabled,
                ]}
              >
                ← Previous
              </Text>
            </TouchableOpacity>

            <Text style={styles.paginationText}>Page {currentPage}</Text>

            <TouchableOpacity
              style={[
                styles.paginationButton,
                !marketplaceData.hasMore && styles.paginationButtonDisabled,
              ]}
              onPress={handleNextPage}
              disabled={!marketplaceData.hasMore}
            >
              <Text
                style={[
                  styles.paginationButtonText,
                  !marketplaceData.hasMore && styles.paginationButtonTextDisabled,
                ]}
              >
                Next →
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
    fontSize: 14,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterChipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  filterChipText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  itemsContainer: {
    paddingHorizontal: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  clearFiltersButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  clearFiltersText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 16,
  },
  paginationButton: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  paginationButtonDisabled: {
    opacity: 0.4,
  },
  paginationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  paginationButtonTextDisabled: {
    color: '#6b7280',
  },
  paginationText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
});
