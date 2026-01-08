/**
 * PACK 196 — Marketplace Home Screen
 * Product Discovery Feed with Safe Categories
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from "@/lib/firebase";

interface Product {
  productId: string;
  name: string;
  description: string;
  category: string;
  priceTokens: number;
  imageUrls: string[];
  averageRating: number;
  totalReviews: number;
  totalSales: number;
  creatorId: string;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🛍️' },
  { id: 'fitness', label: 'Fitness', icon: '💪' },
  { id: 'fashion', label: 'Fashion', icon: '👗' },
  { id: 'digital_skills', label: 'Digital', icon: '💻' },
  { id: 'beauty', label: 'Beauty', icon: '💄' },
  { id: 'gadgets', label: 'Gadgets', icon: '📱' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'home_lifestyle', label: 'Home', icon: '🏠' },
];

export default function MarketplaceHomeScreen() {
  const router = useRouter();
  const functions = getFunctions();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'sales'>('newest');

  useEffect(() => {
    loadProducts();
  }, [selectedCategory, sortBy]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const getProductFeed = httpsCallable(functions, 'marketplace_getProductFeed');
      
      const result = await getProductFeed({
        category: selectedCategory === 'all' ? null : selectedCategory,
        sortBy,
        limit: 20,
        offset: 0,
      });

      const data = result.data as any;
      if (data.success) {
        setProducts(data.products || []);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const renderCategoryPill = ({ item }: { item: typeof CATEGORIES[0] }) => (
    <TouchableOpacity
      style={[
        styles.categoryPill,
        selectedCategory === item.id && styles.categoryPillActive,
      ]}
      onPress={() => setSelectedCategory(item.id)}
    >
      <Text style={styles.categoryIcon}>{item.icon}</Text>
      <Text
        style={[
          styles.categoryText,
          selectedCategory === item.id && styles.categoryTextActive,
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => router.push(`/marketplace/product/${item.productId}`)}
    >
      {item.imageUrls && item.imageUrls.length > 0 ? (
        <Image source={{ uri: item.imageUrls[0] }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.placeholderImage]}>
          <Text style={styles.placeholderText}>📦</Text>
        </View>
      )}
      
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        
        <View style={styles.productStats}>
          {item.averageRating > 0 && (
            <View style={styles.rating}>
              <Text style={styles.ratingText}>⭐ {item.averageRating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({item.totalReviews})</Text>
            </View>
          )}
          {item.totalSales > 0 && (
            <Text style={styles.salesCount}>🛒 {item.totalSales} sold</Text>
          )}
        </View>
        
        <View style={styles.priceRow}>
          <Text style={styles.price}>🪙 {item.priceTokens} tokens</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛍️ Marketplace</Text>
        <Text style={styles.headerSubtitle}>Safe Products Only • Zero Body-Selling</Text>
      </View>

      {/* Category Filter */}
      <FlatList
        horizontal
        data={CATEGORIES}
        renderItem={renderCategoryPill}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryList}
        contentContainerStyle={styles.categoryListContent}
      />

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'newest' && styles.sortButtonActive]}
          onPress={() => setSortBy('newest')}
        >
          <Text style={[styles.sortText, sortBy === 'newest' && styles.sortTextActive]}>
            🆕 Newest
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'rating' && styles.sortButtonActive]}
          onPress={() => setSortBy('rating')}
        >
          <Text style={[styles.sortText, sortBy === 'rating' && styles.sortTextActive]}>
            ⭐ Top Rated
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'sales' && styles.sortButtonActive]}
          onPress={() => setSortBy('sales')}
        >
          <Text style={[styles.sortText, sortBy === 'sales' && styles.sortTextActive]}>
            🔥 Best Selling
          </Text>
        </TouchableOpacity>
      </View>

      {/* Products Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No products found</Text>
          <Text style={styles.emptySubtext}>Try selecting a different category</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item) => item.productId}
          numColumns={2}
          contentContainerStyle={styles.productGrid}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Creator CTA */}
      {auth.currentUser && (
        <TouchableOpacity
          style={styles.creatorCTA}
          onPress={() => router.push('/marketplace/upload')}
        >
          <Text style={styles.creatorCTAText}>💼 Sell Your Products</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  categoryList: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  categoryListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  categoryPillActive: {
    backgroundColor: '#6366f1',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  categoryTextActive: {
    color: '#fff',
  },
  sortContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
  },
  sortButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  sortButtonActive: {
    backgroundColor: '#eef2ff',
  },
  sortText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  sortTextActive: {
    color: '#6366f1',
  },
  productGrid: {
    padding: 8,
  },
  productCard: {
    flex: 1,
    margin: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f3f4f6',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    minHeight: 40,
  },
  productStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
  reviewCount: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 2,
  },
  salesCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  creatorCTA: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  creatorCTAText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
});
