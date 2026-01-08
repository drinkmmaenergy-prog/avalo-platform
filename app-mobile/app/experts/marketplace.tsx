/**
 * PACK 136: Expert Marketplace Screen
 * Browse all verified experts by category
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ExpertCard from "@/components/ExpertCard";
import {
  ExpertProfile,
  ExpertCategory,
  getAllActiveExperts,
  getExpertsByCategory,
  formatCategoryName,
} from "@/services/expertMarketplaceService";

export default function ExpertMarketplaceScreen() {
  const [experts, setExperts] = useState<ExpertProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ExpertCategory | 'all'>('all');

  useEffect(() => {
    loadExperts();
  }, [selectedCategory]);

  const loadExperts = async () => {
    try {
      setLoading(true);
      let data: ExpertProfile[];

      if (selectedCategory === 'all') {
        data = await getAllActiveExperts(50);
      } else {
        data = await getExpertsByCategory(selectedCategory, 50);
      }

      setExperts(data);
    } catch (error) {
      console.error('Error loading experts:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories: Array<ExpertCategory | 'all'> = [
    'all',
    ExpertCategory.FITNESS,
    ExpertCategory.LIFESTYLE,
    ExpertCategory.LANGUAGE,
    ExpertCategory.FINANCE,
    ExpertCategory.BEAUTY,
    ExpertCategory.CREATIVE,
    ExpertCategory.EDUCATION,
    ExpertCategory.PRODUCTIVITY,
    ExpertCategory.WELLNESS,
    ExpertCategory.COOKING,
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Expert Marketplace</Text>
        <Text style={styles.subtitle}>Find verified coaches & mentors</Text>
      </View>

      <FlatList
        horizontal
        data={categories}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === item && styles.categoryChipSelected,
            ]}
            onPress={() => setSelectedCategory(item)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === item && styles.categoryTextSelected,
              ]}
            >
              {item === 'all' ? 'All' : formatCategoryName(item)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : experts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No experts found</Text>
          <Text style={styles.emptySubtext}>Try selecting a different category</Text>
        </View>
      ) : (
        <FlatList
          data={experts}
          keyExtractor={(item) => item.expertId}
          renderItem={({ item }) => <ExpertCard expert={item} />}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  categoryTextSelected: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
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
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
