/**
 * PACK 196 — Product Detail Screen
 * View product details, reviews, and purchase
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { auth, db as firestore } from '../../../lib/firebase';

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
  type: 'physical' | 'digital';
  stock?: number;
  status: string;
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const functions = getFunctions();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [userBalance, setUserBalance] = useState(0);

  useEffect(() => {
    loadProduct();
    loadUserBalance();
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const productRef = doc(firestore, 'products', id as string);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        setProduct({
          productId: productDoc.id,
          ...productDoc.data(),
        } as Product);
      }
    } catch (error) {
      console.error('Error loading product:', error);
      Alert.alert('Error', 'Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const loadUserBalance = async () => {
    if (!auth.currentUser) return;
    
    try {
      const walletRef = doc(
        firestore,
        'balances',
        auth.currentUser.uid,
        'wallet',
        'wallet'
      );
      const walletDoc = await getDoc(walletRef);
      setUserBalance(walletDoc.data()?.tokens || 0);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const handlePurchase = async () => {
    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to purchase products');
      return;
    }

    if (!product) return;

    if (userBalance < product.priceTokens) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${product.priceTokens} tokens but only have ${userBalance} tokens.`
      );
      return;
    }

    Alert.alert(
      'Confirm Purchase',
      `Purchase ${product.name} for ${product.priceTokens} tokens?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            try {
              setPurchasing(true);
              
              const purchaseProduct = httpsCallable(functions, 'marketplace_purchaseProduct');
              const result = await purchaseProduct({
                productId: product.productId,
                // For physical products, we'd collect shipping address here
              });

              const data = result.data as any;
              if (data.success) {
                Alert.alert(
                  'Success!',
                  'Your purchase is complete! Check your orders for details.',
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Purchase failed');
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Product Images */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.imageScroller}
        >
          {product.imageUrls && product.imageUrls.length > 0 ? (
            product.imageUrls.map((url, index) => (
              <Image key={index} source={{ uri: url }} style={styles.productImage} />
            ))
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>📦</Text>
            </View>
          )}
        </ScrollView>

        {/* Product Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.productName}>{product.name}</Text>
          
          <View style={styles.statsRow}>
            {product.averageRating > 0 && (
              <View style={styles.rating}>
                <Text style={styles.ratingText}>⭐ {product.averageRating.toFixed(1)}</Text>
                <Text style={styles.reviewCount}>({product.totalReviews} reviews)</Text>
              </View>
            )}
            {product.totalSales > 0 && (
              <Text style={styles.sales}>🛒 {product.totalSales} sold</Text>
            )}
          </View>

          <View style={styles.priceContainer}>
            <Text style={styles.price}>🪙 {product.priceTokens} tokens</Text>
            {product.type === 'physical' && product.stock !== undefined && (
              <Text style={styles.stock}>
                {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
              </Text>
            )}
          </View>

          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>📁 {product.category.replace('_', ' ')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛡️ Safety Notice</Text>
            <Text style={styles.safetyText}>
              All Avalo Marketplace products are verified to be safe, legal, and non-exploitative.
              No body-selling, no romantic content, no escort services.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Purchase Button */}
      {product.status === 'active' && (
        <View style={styles.footer}>
          <View style={styles.balanceInfo}>
            <Text style={styles.balanceText}>Your balance: 🪙 {userBalance} tokens</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.purchaseButton,
              (purchasing || (product.type === 'physical' && product.stock === 0)) && styles.purchaseButtonDisabled,
            ]}
            onPress={handlePurchase}
            disabled={purchasing || (product.type === 'physical' && product.stock === 0)}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.purchaseButtonText}>
                {product.type === 'physical' && product.stock === 0
                  ? 'Out of Stock'
                  : `Purchase for ${product.priceTokens} tokens`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    color: '#6b7280',
  },
  imageScroller: {
    height: 300,
  },
  productImage: {
    width: 400,
    height: 300,
    backgroundColor: '#f3f4f6',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 80,
  },
  infoContainer: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f59e0b',
  },
  reviewCount: {
    fontSize: 13,
    color: '#9ca3af',
    marginLeft: 4,
  },
  sales: {
    fontSize: 13,
    color: '#6b7280',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  stock: {
    fontSize: 14,
    color: '#6b7280',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    marginBottom: 24,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#4b5563',
  },
  safetyText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#059669',
    backgroundColor: '#d1fae5',
    padding: 12,
    borderRadius: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
    backgroundColor: '#fff',
  },
  balanceInfo: {
    marginBottom: 12,
  },
  balanceText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  purchaseButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  purchaseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});