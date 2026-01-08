import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProductCard } from "@/components/brands/ProductCard";
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function BrandProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const brandId = params.brandId as string;
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'draft' | 'inactive'>('active');

  useEffect(() => {
    if (brandId) {
      loadProducts();
    }
  }, [brandId, filter]);

  const loadProducts = async () => {
    try {
      const functions = getFunctions();
      const listBrandProducts = httpsCallable(functions, 'listBrandProducts');
      
      const result = await listBrandProducts({
        brand_id: brandId,
        status: filter,
        limit: 50,
      });

      const data = result.data as any;
      if (data.success) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      Alert.alert('Error', 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const updateProductStatus = async (productId: string, status: string) => {
    try {
      const functions = getFunctions();
      const updateStatus = httpsCallable(functions, 'updateProductStatus');
      
      const result = await updateStatus({
        product_id: productId,
        status,
      });
      
      const data = result.data as any;
      if (data.success) {
        Alert.alert('Success', `Product ${status}`);
        loadProducts();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  };

  const handleProductPress = (productId: string) => {
    router.push(`/brands/products/${productId}` as any);
  };

  const renderProduct = ({ item }: { item: any }) => (
    <View>
      <ProductCard product={item} onPress={() => handleProductPress(item.id)} />
      {(filter === 'draft' || filter === 'inactive') && (
        <View style={styles.productActions}>
          {filter === 'draft' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.activateButton]}
              onPress={() => updateProductStatus(item.id, 'active')}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionText}>Activate</Text>
            </TouchableOpacity>
          )}
          {filter === 'inactive' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.activateButton]}
              onPress={() => updateProductStatus(item.id, 'active')}
            >
              <Ionicons name="play-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionText}>Reactivate</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() => router.push(`/brands/products/${item.id}/edit` as any)}
          >
            <Ionicons name="create-outline" size={20} color="#007AFF" />
            <Text style={[styles.actionText, { color: '#007AFF' }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Brand Products',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/brands/products/new?brandId=${brandId}` as any)}
              style={styles.headerButton}
            >
              <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.filterContainer}>
          {['active', 'draft', 'inactive'].map((filterOption) => (
            <TouchableOpacity
              key={filterOption}
              style={[
                styles.filterButton,
                filter === filterOption && styles.filterButtonActive,
              ]}
              onPress={() => {
                setFilter(filterOption as any);
                setLoading(true);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === filterOption && styles.filterTextActive,
                ]}
              >
                {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={renderProduct}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No products yet</Text>
                <Text style={styles.emptySubtext}>
                  Create your first product
                </Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push(`/brands/products/new?brandId=${brandId}` as any)}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#fff" />
                  <Text style={styles.createButtonText}>Create Product</Text>
                </TouchableOpacity>
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
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  filterTextActive: {
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
  productActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activateButton: {
    backgroundColor: '#4CAF50',
  },
  editButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
