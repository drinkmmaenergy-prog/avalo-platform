import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BrandCard } from "@/components/brands/BrandCard";
import { getFunctions, httpsCallable } from 'firebase/functions';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'physical_merch', label: 'Merch', icon: 'shirt-outline' },
  { id: 'fitness_wellness', label: 'Fitness', icon: 'fitness-outline' },
  { id: 'beauty', label: 'Beauty', icon: 'sparkles-outline' },
  { id: 'education', label: 'Education', icon: 'book-outline' },
  { id: 'art_creativity', label: 'Art', icon: 'color-palette-outline' },
  { id: 'tech', label: 'Tech', icon: 'hardware-chip-outline' },
];

export default function BrandsScreen() {
  const router = useRouter();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadBrands();
  }, [selectedCategory]);

  const loadBrands = async () => {
    try {
      const functions = getFunctions();
      const searchBrands = httpsCallable(functions, 'searchBrands');
      
      const result = await searchBrands({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search_term: searchTerm || undefined,
        limit: 20,
      });

      const data = result.data as any;
      if (data.success) {
        setBrands(data.brands);
      }
    } catch (error) {
      console.error('Error loading brands:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBrands();
  };

  const handleSearch = () => {
    setLoading(true);
    loadBrands();
  };

  const renderCategoryFilter = () => (
    <FlatList
      horizontal
      data={CATEGORIES}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoriesContainer}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.categoryChip,
            selectedCategory === item.id && styles.categoryChipActive,
          ]}
          onPress={() => {
            setSelectedCategory(item.id);
            setLoading(true);
          }}
        >
          <Ionicons
            name={item.icon as any}
            size={18}
            color={selectedCategory === item.id ? '#fff' : '#666'}
          />
          <Text
            style={[
              styles.categoryLabel,
              selectedCategory === item.id && styles.categoryLabelActive,
            ]}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      )}
    />
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Brand Collections',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/brands/create' as any)}
              style={styles.headerButton}
            >
              <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search brands..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity onPress={() => {
                setSearchTerm('');
                setLoading(true);
                loadBrands();
              }}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {renderCategoryFilter()}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <FlatList
            data={brands}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BrandCard
                brand={item}
                onPress={() => router.push(`/brands/${item.id}` as any)}
              />
            )}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="storefront-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No brands found</Text>
                <Text style={styles.emptySubtext}>
                  Try adjusting your filters or search
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerButton: {
    marginRight: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#007AFF',
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  categoryLabelActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
