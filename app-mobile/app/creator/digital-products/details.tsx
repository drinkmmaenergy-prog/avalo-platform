/**
 * PACK 116: Digital Product Details Screen
 * View and purchase digital products
 */

import React, { useEffect, useState } from 'react';
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
import { useLocalSearchParams, router } from 'expo-router';
import {
  DigitalProduct,
  getProduct,
  purchaseProduct,
  getProductTypeDisplay,
  getCategoryDisplay,
  formatFileSize,
  calculateRevenueSplit,
} from "@/services/digitalProductService";
import { useAuth } from "@/contexts/AuthContext";

export default function DigitalProductDetailsScreen() {
  const params = useLocalSearchParams();
  const productId = params.productId as string;
  const { user } = useAuth();

  const [product, setProduct] = useState<DigitalProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const loadProduct = async () => {
    try {
      const fetchedProduct = await getProduct(productId);
      setProduct(fetchedProduct);
    } catch (error) {
      console.error('Error loading product:', error);
      Alert.alert('Error', 'Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!product || !user) return;

    Alert.alert(
      'Confirm Purchase',
      `Purchase "${product.title}" for ${product.priceTokens} tokens?\n\nYou will receive: Download access\nCreator receives: ${calculateRevenueSplit(product.priceTokens).creatorEarnings} tokens (65%)\nPlatform fee: ${calculateRevenueSplit(product.priceTokens).platformFee} tokens (35%)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            setPurchasing(true);
            try {
              const result = await purchaseProduct(productId);
              Alert.alert(
                'Success!',
                result.message,
                [
                  {
                    text: 'View My Products',
                    onPress: () => router.push('/profile/my-products' as any),
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert('Purchase Failed', error.message);
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  const isOwnProduct = user?.uid === product.creatorUserId;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Preview Image */}
      <Image
        source={{ uri: product.previewImageRef || 'https://via.placeholder.com/400x300' }}
        style={styles.previewImage}
        resizeMode="cover"
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Type Badge */}
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {getProductTypeDisplay(product.type)}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{product.title}</Text>

        {/* Creator Info */}
        <View style={styles.creatorRow}>
          {product.creatorAvatar && (
            <Image
              source={{ uri: product.creatorAvatar }}
              style={styles.creatorAvatar}
            />
          )}
          <Text style={styles.creatorName}>by {product.creatorName}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{product.purchaseCount}</Text>
            <Text style={styles.statLabel}>sales</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{product.viewCount}</Text>
            <Text style={styles.statLabel}>views</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatFileSize(product.fileSize)}</Text>
            <Text style={styles.statLabel}>size</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{product.description}</Text>
        </View>

        {/* Categories */}
        {product.categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <View style={styles.categoriesRow}>
              {product.categories.map((cat, index) => (
                <View key={index} style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    {getCategoryDisplay(cat as any)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Content Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Rating</Text>
          <View style={styles.safeBadge}>
            <Text style={styles.safeBadgeText}>✓ SAFE Content</Text>
          </View>
          <Text style={styles.safeDescription}>
            This product contains only safe, appropriate content suitable for all audiences.
          </Text>
        </View>

        {/* What You Get */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What You Get</Text>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>📥</Text>
            <Text style={styles.featureText}>Downloadable file ({product.fileMimeType})</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text style={styles.featureText}>Watermarked for your protection</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>♾️</Text>
            <Text style={styles.featureText}>Up to 5 downloads</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>⏱️</Text>
            <Text style={styles.featureText}>7-day access</Text>
          </View>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Breakdown</Text>
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Total Price</Text>
              <Text style={styles.priceValue}>{product.priceTokens} tokens</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabelSmall}>Creator Earnings (65%)</Text>
              <Text style={styles.priceValueSmall}>
                {calculateRevenueSplit(product.priceTokens).creatorEarnings} tokens
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabelSmall}>Platform Fee (35%)</Text>
              <Text style={styles.priceValueSmall}>
                {calculateRevenueSplit(product.priceTokens).platformFee} tokens
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Purchase Button */}
      {!isOwnProduct && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
            onPress={handlePurchase}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.purchaseButtonText}>
                  Purchase for {product.priceTokens} tokens
                </Text>
                <Text style={styles.purchaseButtonSubtext}>
                  Instant download access
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isOwnProduct && (
        <View style={styles.ownProductNotice}>
          <Text style={styles.ownProductText}>
            This is your product. You cannot purchase it.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  previewImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  typeBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  creatorName: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  safeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  safeBadgeText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },
  safeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#666',
  },
  priceBreakdown: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
  },
  priceLabelSmall: {
    fontSize: 14,
    color: '#666',
  },
  priceValueSmall: {
    fontSize: 14,
    color: '#666',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  purchaseButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  purchaseButtonSubtext: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },
  ownProductNotice: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  ownProductText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
