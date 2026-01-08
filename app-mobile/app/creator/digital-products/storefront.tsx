/**
 * PACK 116: Creator Storefront Screen
 * Display all digital products from a creator
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { DigitalProductCard } from "@/components/DigitalProductCard";

import {
  DigitalProduct,
  subscribeToCreatorProducts,
} from "@/services/digitalProductService";

export default function CreatorStorefrontScreen() {
  const params = useLocalSearchParams();
  const creatorUserId = params.creatorUserId as string;
  const creatorName = params.creatorName as string;

  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!creatorUserId) return;

    const unsubscribe = subscribeToCreatorProducts(
      creatorUserId,
      (fetchedProducts) => {
        setProducts(fetchedProducts);
        setLoading(false);
        setRefreshing(false);
      },
      true
    );

    return () => unsubscribe();
  }, [creatorUserId]);

  const handleProductPress = (product: DigitalProduct) => {
    router.push({
      pathname: '/creator/digital-products/details',
      params: { productId: product.productId },
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Products Yet</Text>
        <Text style={styles.emptySubtitle}>
          {creatorName} hasn't added any digital products yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{creatorName}'s Store</Text>
        <Text style={styles.headerSubtitle}>
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </Text>
      </View>

      {/* Products List */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.productId}
        renderItem={({ item }) => (
          <DigitalProductCard
            product={item}
            onPress={handleProductPress}
            showCreatorInfo={false}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563eb']}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
