/**
 * Media Manager Screen
 * Phase 33-4: PPV media manager for creators
 * 
 * Features:
 * - Upload button (placeholder - no real upload logic)
 * - Price setter per post
 * - Grid view of media items
 * - Dark theme with gold/turquoise accents
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { PPVPriceSetter } from "@/components/PPVPriceSetter";
import { MediaEarningBadge } from "@/components/MediaEarningBadge";
import { 
  getCreatorMediaPrices, 
  getPrice, 
  getUnlockCount,
  getEarnings,
} from "@/services/ppvService";

const { width } = Dimensions.get('window');
const GRID_SPACING = 12;
const GRID_ITEMS_PER_ROW = 2;
const ITEM_SIZE = (width - (GRID_SPACING * (GRID_ITEMS_PER_ROW + 1))) / GRID_ITEMS_PER_ROW;

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  thumbnail: string;
  price: number;
  unlockCount: number;
}

export default function MediaManagerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [showPriceSetter, setShowPriceSetter] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    loadMediaItems();
    loadEarnings();
  }, []);

  const loadMediaItems = async () => {
    try {
      setLoading(true);
      // Placeholder media items - in real app, fetch from backend
      const placeholderMedia: MediaItem[] = [
        {
          id: 'media_1',
          type: 'image',
          thumbnail: 'https://picsum.photos/400/400?random=1',
          price: 0,
          unlockCount: 0,
        },
        {
          id: 'media_2',
          type: 'video',
          thumbnail: 'https://picsum.photos/400/400?random=2',
          price: 0,
          unlockCount: 0,
        },
        {
          id: 'media_3',
          type: 'image',
          thumbnail: 'https://picsum.photos/400/400?random=3',
          price: 0,
          unlockCount: 0,
        },
        {
          id: 'media_4',
          type: 'image',
          thumbnail: 'https://picsum.photos/400/400?random=4',
          price: 0,
          unlockCount: 0,
        },
      ];

      // Load prices and unlock counts
      const itemsWithData = await Promise.all(
        placeholderMedia.map(async (item) => {
          const price = await getPrice(item.id);
          const unlockCount = await getUnlockCount(item.id);
          return { ...item, price, unlockCount };
        })
      );

      setMediaItems(itemsWithData);
    } catch (error) {
      console.error('Error loading media items:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEarnings = async () => {
    if (!user?.uid) return;
    
    try {
      const earnings = await getEarnings(user.uid);
      setTotalEarnings(earnings.totalEarned);
    } catch (error) {
      console.error('Error loading earnings:', error);
    }
  };

  const handleUploadPress = () => {
    // Placeholder - no real upload logic
    console.log('Upload pressed - placeholder functionality');
  };

  const handleSetPrice = (mediaId: string) => {
    setSelectedMediaId(mediaId);
    setShowPriceSetter(true);
  };

  const handlePriceSet = async (price: number) => {
    // Reload media items to reflect new price
    await loadMediaItems();
  };

  const renderMediaItem = (item: MediaItem) => {
    const hasPrice = item.price > 0;

    return (
      <View key={item.id} style={styles.mediaItem}>
        <Image
          source={{ uri: item.thumbnail }}
          style={styles.mediaItemImage}
          resizeMode="cover"
        />
        
        {/* Video indicator */}
        {item.type === 'video' && (
          <View style={styles.videoIndicator}>
            <Text style={styles.videoIcon}>▶</Text>
          </View>
        )}

        {/* Price badge */}
        {hasPrice ? (
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>{item.price} 💎</Text>
          </View>
        ) : (
          <View style={styles.noPriceBadge}>
            <Text style={styles.noPriceText}>{t('ppv.noPrice')}</Text>
          </View>
        )}

        {/* Unlock count */}
        {item.unlockCount > 0 && (
          <View style={styles.unlockCountBadge}>
            <Text style={styles.unlockCountText}>
              {item.unlockCount} {t('ppv.unlocks')}
            </Text>
          </View>
        )}

        {/* Set price button */}
        <TouchableOpacity
          style={styles.setPriceButton}
          onPress={() => handleSetPrice(item.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.setPriceButtonIcon}>💰</Text>
          <Text style={styles.setPriceButtonText}>
            {hasPrice ? t('ppv.editPrice') : t('ppv.setPrice')}
          </Text>
        </TouchableOpacity>

        {/* Earnings badge */}
        {item.unlockCount > 0 && (
          <View style={styles.earningsBadgeContainer}>
            <MediaEarningBadge
              salePrice={item.price}
              unlockCount={item.unlockCount}
              showAnimation={false}
            />
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('ppv.mediaManager')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Earnings card */}
      <View style={styles.earningsCard}>
        <View style={styles.earningsHeader}>
          <Text style={styles.earningsLabel}>{t('ppv.totalEarnings')}</Text>
          <View style={styles.earningsAmount}>
            <Text style={styles.earningsValue}>{totalEarnings}</Text>
            <Text style={styles.earningsIcon}>💎</Text>
          </View>
        </View>
        <Text style={styles.earningsNote}>
          {t('ppv.earningsNote')}
        </Text>
      </View>

      {/* Upload button */}
      <View style={styles.uploadSection}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={handleUploadPress}
          activeOpacity={0.7}
        >
          <Text style={styles.uploadIcon}>📸</Text>
          <Text style={styles.uploadText}>{t('ppv.uploadMedia')}</Text>
        </TouchableOpacity>
        <Text style={styles.uploadNote}>{t('ppv.uploadNote')}</Text>
      </View>

      {/* Media grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {mediaItems.length > 0 ? (
          <View style={styles.mediaGrid}>
            {mediaItems.map(item => renderMediaItem(item))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyTitle}>{t('ppv.noMedia')}</Text>
            <Text style={styles.emptyText}>{t('ppv.uploadFirst')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Price setter modal */}
      {selectedMediaId && (
        <PPVPriceSetter
          visible={showPriceSetter}
          onClose={() => setShowPriceSetter(false)}
          mediaId={selectedMediaId}
          onPriceSet={handlePriceSet}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#D4AF37',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  headerSpacer: {
    width: 40,
  },
  earningsCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  earningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  earningsLabel: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  earningsAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  earningsIcon: {
    fontSize: 20,
  },
  earningsNote: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  uploadSection: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    gap: 10,
  },
  uploadIcon: {
    fontSize: 24,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  uploadNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  mediaItem: {
    width: ITEM_SIZE,
    marginBottom: GRID_SPACING,
  },
  mediaItemImage: {
    width: '100%',
    height: ITEM_SIZE,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
  },
  videoIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(64, 224, 208, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIcon: {
    fontSize: 12,
    color: '#0F0F0F',
    marginLeft: 2,
  },
  priceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  noPriceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  noPriceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  unlockCountBadge: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    backgroundColor: 'rgba(64, 224, 208, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  unlockCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  setPriceButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4AF37',
    gap: 6,
  },
  setPriceButtonIcon: {
    fontSize: 16,
  },
  setPriceButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  earningsBadgeContainer: {
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
