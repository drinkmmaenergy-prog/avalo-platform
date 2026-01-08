/**
 * PACK 135: Offline Promotions Main Screen
 * Hub for QR codes, posters, and print materials
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getQRProfile, getMyAssets, type OfflineAsset, type QRProfileData } from "@/lib/offline-presence";

export default function OfflinePromotionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [qrProfile, setQrProfile] = useState<QRProfileData | null>(null);
  const [assets, setAssets] = useState<OfflineAsset[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileData, assetsData] = await Promise.all([
        getQRProfile(),
        getMyAssets(),
      ]);
      setQrProfile(profileData);
      setAssets(assetsData);
    } catch (error) {
      console.error('Error loading offline promotions:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
        <Text style={styles.loadingText}>Loading your promotion tools...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline Promotions</Text>
        <Text style={styles.subtitle}>
          Share your Avalo profile in the real world
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your QR Code</Text>
        <Text style={styles.sectionDescription}>
          Download or share your unique profile QR code
        </Text>
        
        <TouchableOpacity
          style={styles.qrCard}
          onPress={() => router.push('/profile/offline-promotions/qr-code')}
        >
          {qrProfile && (
            <Image
              source={{ uri: qrProfile.staticQrUrl }}
              style={styles.qrPreview}
              resizeMode="contain"
            />
          )}
          <View style={styles.qrCardContent}>
            <Text style={styles.qrCardTitle}>View QR Code</Text>
            <Text style={styles.qrCardSubtitle}>
              Download in multiple sizes & formats
            </Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Print Materials</Text>
        <Text style={styles.sectionDescription}>
          Create posters, business cards, and stickers
        </Text>

        <View style={styles.posterGrid}>
          <TouchableOpacity
            style={styles.posterOption}
            onPress={() => router.push('/profile/offline-promotions/create-poster?format=square')}
          >
            <View style={[styles.posterIcon, { aspectRatio: 1 }]}>
              <Text style={styles.posterIconText}>□</Text>
            </View>
            <Text style={styles.posterOptionText}>Square Poster</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.posterOption}
            onPress={() => router.push('/profile/offline-promotions/create-poster?format=vertical')}
          >
            <View style={[styles.posterIcon, { aspectRatio: 9/16 }]}>
              <Text style={styles.posterIconText}>▯</Text>
            </View>
            <Text style={styles.posterOptionText}>Vertical Poster</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.posterOption}
            onPress={() => router.push('/profile/offline-promotions/create-poster?format=business-card')}
          >
            <View style={[styles.posterIcon, { aspectRatio: 16/9 }]}>
              <Text style={styles.posterIconText}>▬</Text>
            </View>
            <Text style={styles.posterOptionText}>Business Card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.posterOption}
            onPress={() => router.push('/profile/offline-promotions/create-poster?format=sticker')}
          >
            <View style={[styles.posterIcon, { aspectRatio: 1 }]}>
              <Text style={styles.posterIconText}>●</Text>
            </View>
            <Text style={styles.posterOptionText}>Sticker</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Materials</Text>
          <TouchableOpacity onPress={loadData}>
            <Text style={styles.refreshButton}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {assets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No materials created yet
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Create your first poster or QR code above
            </Text>
          </View>
        ) : (
          <View style={styles.assetsList}>
            {assets.slice(0, 5).map((asset) => (
              <TouchableOpacity
                key={asset.id}
                style={styles.assetItem}
                onPress={() => router.push(`/profile/offline-promotions/asset/${asset.id}`)}
              >
                <View style={styles.assetInfo}>
                  <Text style={styles.assetType}>
                    {asset.format || asset.type}
                  </Text>
                  <Text style={styles.assetStatus}>
                    Status: {asset.status}
                  </Text>
                </View>
                <Text style={styles.arrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.analyticsCard}
          onPress={() => router.push('/profile/offline-promotions/analytics')}
        >
          <Text style={styles.analyticsTitle}>📊 Scan Analytics</Text>
          <Text style={styles.analyticsSubtitle}>
            View insights about your QR code scans
          </Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Brand Safety</Text>
          <Text style={styles.infoText}>
            • All materials are moderated for brand safety{'\n'}
            • No external payment links allowed{'\n'}
            • Materials must follow Avalo guidelines{'\n'}
            • Scans don't affect feed ranking
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  header: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
  },
  refreshButton: {
    fontSize: 14,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  qrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  qrPreview: {
    width: 60,
    height: 60,
    marginRight: 16,
  },
  qrCardContent: {
    flex: 1,
  },
  qrCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  qrCardSubtitle: {
    fontSize: 14,
    color: '#666666',
  },
  arrow: {
    fontSize: 20,
    color: '#6C5CE7',
    fontWeight: 'bold',
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  posterOption: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  posterIcon: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#6C5CE7',
    marginBottom: 8,
  },
  posterIconText: {
    fontSize: 32,
    color: '#6C5CE7',
  },
  posterOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  assetsList: {
    gap: 12,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  assetInfo: {
    flex: 1,
  },
  assetType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  assetStatus: {
    fontSize: 14,
    color: '#666666',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  analyticsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
  },
  analyticsTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  analyticsSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE68C',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
});
