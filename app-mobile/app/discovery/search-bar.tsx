/**
 * PACK 294 - Search & Discovery Filters
 * Search Bar Component for Name/Username Search
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSizes, fontWeights, radius } from "@/shared/theme";
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SearchResult {
  userId: string;
  displayName: string;
  age: number;
  city: string;
  country: string;
  isVerified: boolean;
  influencerBadge: boolean;
  royalBadge: boolean;
}

interface SearchBarProps {
  visible: boolean;
  onClose: () => void;
}

export default function SearchBar({ visible, onClose }: SearchBarProps) {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      // Call profile search function
      const searchFunc = httpsCallable(functions, 'profileSearch');
      const token = await auth.currentUser?.getIdToken();
      
      const response = await searchFunc({
        query: searchQuery.trim(),
        limit: 10,
      }) as any;

      setResults(response.data.items || []);
    } catch (err: any) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [auth, functions]);

  const handleProfilePress = (userId: string) => {
    onClose();
    router.push(`/profile/${userId}` as any);
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            handleSearch(text);
          }}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => handleSearch(query)}
        />
        <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {searching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!searching && results.length === 0 && query.length >= 2 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleProfilePress(item.userId)}
            >
              <View style={styles.resultInfo}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultName}>{item.displayName}</Text>
                  {item.isVerified && <Text style={styles.badge}>✓</Text>}
                  {item.influencerBadge && <Text style={styles.badge}>⭐</Text>}
                  {item.royalBadge && <Text style={styles.badge}>👑</Text>}
                </View>
                <Text style={styles.resultDetails}>
                  {item.age} • {item.city}, {item.country}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          style={styles.resultsList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 1000,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    marginRight: spacing.md,
  },
  cancelButton: {
    padding: spacing.sm,
  },
  cancelText: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  errorContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSizes.base,
    color: colors.error,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultInfo: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  resultName: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  badge: {
    fontSize: fontSizes.sm,
  },
  resultDetails: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
});
