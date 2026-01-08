/**
 * PACK 170 — Avalo Universal Search 3.0
 * Universal Search Screen - Mobile
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Modal
} from 'react-native';
import { SearchSDK, SearchCategory, SearchResult, SearchSuggestion, SearchFilters } from "@/lib/search.sdk";
import { SearchResultCard } from "@/components/SearchResultCard";
import { SearchFiltersModal } from "@/components/SearchFiltersModal";

export default function UniversalSearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory | undefined>();
  const [filters, setFilters] = useState<Partial<SearchFilters>>({ safeSearchEnabled: true });
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (query.length >= 2) {
      fetchSuggestions();
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  const fetchSuggestions = async () => {
    try {
      const response = await SearchSDK.getAutocompleteSuggestions(query);
      setSuggestions(response.suggestions);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  const performSearch = async (searchQuery?: string, resetOffset: boolean = true) => {
    const actualQuery = searchQuery || query;
    if (!actualQuery.trim()) return;

    setLoading(true);
    setError(null);
    const searchOffset = resetOffset ? 0 : offset;

    try {
      const response = await SearchSDK.search(actualQuery, filters, {
        category: selectedCategory,
        limit: 20,
        offset: searchOffset
      });

      if (resetOffset) {
        setResults(response.results);
        setOffset(20);
      } else {
        setResults([...results, ...response.results]);
        setOffset(searchOffset + 20);
      }

      setHasMore(response.hasMore);
      setShowSuggestions(false);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionPress = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    if (suggestion.category) {
      setSelectedCategory(suggestion.category);
    }
    setShowSuggestions(false);
    performSearch(suggestion.text);
  };

  const handleCategorySelect = (category: SearchCategory | undefined) => {
    setSelectedCategory(category);
    if (query.trim()) {
      performSearch(undefined, true);
    }
  };

  const handleFilterApply = (newFilters: Partial<SearchFilters>) => {
    setFilters({ ...newFilters, safeSearchEnabled: true });
    setShowFilters(false);
    if (query.trim()) {
      performSearch(undefined, true);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      performSearch(undefined, false);
    }
  };

  const renderSearchBar = () => (
    <View style={styles.searchBarContainer}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search creators, courses, events..."
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => performSearch()}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => setShowFilters(true)}
      >
        <Text style={styles.filterButtonText}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.categoriesContainer}>
      <TouchableOpacity
        style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
        onPress={() => handleCategorySelect(undefined)}
      >
        <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
          All
        </Text>
      </TouchableOpacity>
      {Object.values(SearchCategory).map((cat) => (
        <TouchableOpacity
          key={cat}
          style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
          onPress={() => handleCategorySelect(cat)}
        >
          <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}>
            {cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSuggestions = () => {
    if (!showSuggestions || suggestions.length === 0) return null;

    return (
      <View style={styles.suggestionsContainer}>
        {suggestions.map((suggestion, index) => (
          <TouchableOpacity
            key={index}
            style={styles.suggestionItem}
            onPress={() => handleSuggestionPress(suggestion)}
          >
            <Text style={styles.suggestionIcon}>
              {suggestion.type === 'recent' ? '🕐' : suggestion.type === 'creator' ? '👤' : '🔍'}
            </Text>
            <Text style={styles.suggestionText}>{suggestion.text}</Text>
            {suggestion.category && (
              <Text style={styles.suggestionCategory}>
                in {suggestion.category}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderResults = () => {
    if (loading && results.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => performSearch()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (results.length === 0 && query.trim()) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try different keywords or filters</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SearchResultCard result={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? <ActivityIndicator style={styles.loadingMore} /> : null
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderSearchBar()}
      {renderCategories()}
      {renderSuggestions()}
      {renderResults()}

      <SearchFiltersModal
        visible={showFilters}
        filters={filters}
        onApply={handleFilterApply}
        onClose={() => setShowFilters(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchBarContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterButtonText: {
    fontSize: 20,
  },
  categoriesContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  suggestionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  suggestionCategory: {
    fontSize: 12,
    color: '#999999',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    color: '#666666',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
  },
  loadingMore: {
    padding: 20,
  },
});
