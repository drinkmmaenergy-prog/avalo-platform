/**
 * PACK 116: My Digital Products Screen
 * View purchased digital products
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import {
  DigitalProductPurchase,
  subscribeToUserPurchases,
  getDownloadUrl,
} from "@/services/digitalProductService";
import * as Linking from 'expo-linking';

export default function MyDigitalProductsScreen() {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<DigitalProductPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToUserPurchases(
      user.uid,
      (fetchedPurchases) => {
        setPurchases(fetchedPurchases);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handleDownload = async (purchase: DigitalProductPurchase) => {
    if (downloading) return;

    setDownloading(purchase.purchaseId);
    try {
      const result = await getDownloadUrl(purchase.purchaseId);
      
      Alert.alert(
        'Download Ready',
        `Downloads remaining: ${result.remainingDownloads}/${purchase.maxDownloads}\n\nOpening download link...`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Download',
            onPress: () => {
              Linking.openURL(result.downloadUrl);
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Download Failed', error.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading your products...</Text>
      </View>
    );
  }

  if (purchases.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Products Yet</Text>
        <Text style={styles.emptySubtitle}>
          Purchase digital products to access them here
        </Text>
        <TouchableOpacity
          style={styles.exploreButton}
          onPress={() => router.push('/' as any)}
        >
          <Text style={styles.exploreButtonText}>Explore Creators</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderPurchaseItem = ({ item }: { item: DigitalProductPurchase }) => {
    const isDownloading = downloading === item.purchaseId;
    const downloadProgress = `${item.downloadCount}/${item.maxDownloads}`;
    const canDownload = item.downloadCount < item.maxDownloads;

    return (
      <View style={styles.purchaseCard}>
        <View style={styles.purchaseHeader}>
          <View style={styles.purchaseInfo}>
            <Text style={styles.productTitle}>{item.productTitle}</Text>
            <Text style={styles.creatorName}>by {item.creatorName}</Text>
          </View>
          <View style={styles.tokenBadge}>
            <Text style={styles.tokenBadgeText}>{item.tokensAmount}</Text>
          </View>
        </View>

        <View style={styles.purchaseDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Purchased</Text>
            <Text style={styles.detailValue}>
              {item.purchasedAt.toDate().toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Downloads</Text>
            <Text style={styles.detailValue}>{downloadProgress}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Watermark ID</Text>
            <Text style={styles.detailValue}>{item.watermarkId}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.downloadButton,
            (!canDownload || isDownloading) && styles.downloadButtonDisabled,
          ]}
          onPress={() => handleDownload(item)}
          disabled={!canDownload || isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.downloadButtonText}>
              {canDownload ? '📥 Download' : '❌ Download Limit Reached'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Digital Products</Text>
        <Text style={styles.headerSubtitle}>
          {purchases.length} {purchases.length === 1 ? 'product' : 'products'} owned
        </Text>
      </View>

      {/* Purchases List */}
      <FlatList
        data={purchases}
        keyExtractor={(item) => item.purchaseId}
        renderItem={renderPurchaseItem}
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

      {/* Info Notice */}
      <View style={styles.infoNotice}>
        <Text style={styles.infoText}>
          ℹ️ Each product can be downloaded up to 5 times. Downloads are watermarked
          for security.
        </Text>
      </View>
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
    padding: 16,
    paddingBottom: 100,
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
    marginBottom: 20,
  },
  exploreButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  purchaseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  purchaseInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  creatorName: {
    fontSize: 14,
    color: '#666',
  },
  tokenBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 12,
  },
  tokenBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  purchaseDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
  },
  detailValue: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  downloadButton: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoNotice: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fef3c7',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#fde047',
  },
  infoText: {
    fontSize: 12,
    color: '#78350f',
    textAlign: 'center',
  },
});
