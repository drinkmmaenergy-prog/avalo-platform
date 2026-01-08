/**
 * VIP Room Screen
 * Phase 33-3 + 33-4: Subscriber-only premium content feed with PPV media
 *
 * Shows premium content grid for subscribers with PPV lock support
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { isSubscribed } from '../../../services/subscriptionService';
import { getProfile } from '../../../lib/profileService';
import { PPVMediaLock } from '../../../components/PPVMediaLock';
import { MediaEarningBadge } from '../../../components/MediaEarningBadge';
import {
  checkUnlocked,
  getPrice,
  getUnlockCount
} from '../../../services/ppvService';

const { width } = Dimensions.get('window');
const GRID_SPACING = 2;
const GRID_ITEMS_PER_ROW = 3;
const ITEM_SIZE = (width - (GRID_SPACING * (GRID_ITEMS_PER_ROW + 1))) / GRID_ITEMS_PER_ROW;

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  thumbnail: string;
  locked: boolean;
  price: number;
  unlockCount: number;
}

// Placeholder premium content with PPV pricing
const PLACEHOLDER_CONTENT: MediaItem[] = [
  { id: 'ppv_1', type: 'image', thumbnail: 'https://picsum.photos/400/400?random=1', locked: false, price: 25, unlockCount: 0 },
  { id: 'ppv_2', type: 'video', thumbnail: 'https://picsum.photos/400/400?random=2', locked: false, price: 40, unlockCount: 0 },
  { id: 'ppv_3', type: 'image', thumbnail: 'https://picsum.photos/400/400?random=3', locked: false, price: 15, unlockCount: 0 },
  { id: 'ppv_4', type: 'image', thumbnail: 'https://picsum.photos/400/400?random=4', locked: false, price: 60, unlockCount: 0 },
  { id: 'ppv_5', type: 'video', thumbnail: 'https://picsum.photos/400/400?random=5', locked: false, price: 80, unlockCount: 0 },
  { id: 'ppv_6', type: 'image', thumbnail: 'https://picsum.photos/400/400?random=6', locked: false, price: 25, unlockCount: 0 },
];

export default function VIPRoomScreen() {
  const router = useRouter();
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [creatorName, setCreatorName] = useState('Creator');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [userBalance] = useState(500); // Placeholder balance

  useEffect(() => {
    checkAccess();
  }, [user, creatorId]);

  const checkAccess = async () => {
    if (!user?.uid || !creatorId) {
      setLoading(false);
      return;
    }

    try {
      // Check if user is subscribed
      const subscribed = await isSubscribed(user.uid, creatorId);
      setHasAccess(subscribed);

      // Load creator info
      const profile = await getProfile(creatorId);
      if (profile) {
        setCreatorName(profile.name || 'Creator');
      }

      // Load media unlock status
      if (subscribed) {
        await loadMediaItems();
      }
    } catch (error) {
      console.error('Error checking VIP access:', error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMediaItems = async () => {
    if (!user?.uid) return;

    try {
      const itemsWithStatus = await Promise.all(
        PLACEHOLDER_CONTENT.map(async (item) => {
          const unlocked = await checkUnlocked(user.uid, item.id);
          const price = await getPrice(item.id);
          const unlockCount = await getUnlockCount(item.id);
          return { ...item, locked: !unlocked, price, unlockCount };
        })
      );
      setMediaItems(itemsWithStatus);
    } catch (error) {
      console.error('Error loading media items:', error);
      setMediaItems(PLACEHOLDER_CONTENT);
    }
  };

  const handleUnlock = async () => {
    // Reload media items after unlock
    await loadMediaItems();
  };

  const handleBuyTokens = () => {
    router.push('/(tabs)/wallet' as any);
  };

  const handleContentPress = (item: MediaItem) => {
    if (item.locked) {
      // Don't open locked content
      return;
    }
    // TODO: Implement content viewer for unlocked content
    console.log('Open content:', item.id);
  };

  const isCreator = user?.uid === creatorId;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VIP Room</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.noAccessContainer}>
          <Text style={styles.noAccessIcon}>🔒</Text>
          <Text style={styles.noAccessTitle}>
            {t('subscriptions.vipRoomLocked')}
          </Text>
          <Text style={styles.noAccessText}>
            {t('subscriptions.subscribeToAccess', { name: creatorName })}
          </Text>
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => router.back()}
          >
            <Text style={styles.subscribeButtonText}>
              {t('subscriptions.goBack')}
            </Text>
          </TouchableOpacity>
        </View>
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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {t('subscriptions.vipRoomTitle')}
          </Text>
          <Text style={styles.headerSubtitle}>{creatorName}</Text>
        </View>
        <View style={styles.vipBadge}>
          <Text style={styles.vipBadgeText}>VIP</Text>
        </View>
      </View>

      {/* Premium Content Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Banner */}
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeIcon}>🎭</Text>
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.welcomeTitle}>
              {t('subscriptions.welcomeVIP')}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {t('subscriptions.exclusiveAccess')}
            </Text>
          </View>
        </View>

        {/* Content Grid */}
        <View style={styles.grid}>
          {mediaItems.map((item, index) => (
            <View key={item.id} style={styles.gridItem}>
              {item.locked ? (
                // Locked PPV content
                <PPVMediaLock
                  mediaId={item.id}
                  creatorId={creatorId}
                  basePrice={item.price}
                  isVIPSubscriber={hasAccess}
                  userBalance={userBalance}
                  thumbnailUrl={item.thumbnail}
                  onUnlock={handleUnlock}
                  onBuyTokens={handleBuyTokens}
                />
              ) : (
                // Unlocked content
                <TouchableOpacity
                  style={styles.unlockedMedia}
                  onPress={() => handleContentPress(item)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item.thumbnail }}
                    style={styles.gridItemImage}
                    resizeMode="cover"
                  />
                  {item.type === 'video' && (
                    <View style={styles.videoOverlay}>
                      <View style={styles.playButton}>
                        <Text style={styles.playIcon}>▶</Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>⭐</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Creator earnings badge */}
              {isCreator && item.unlockCount > 0 && (
                <View style={styles.earningsBadge}>
                  <MediaEarningBadge
                    salePrice={item.price}
                    unlockCount={item.unlockCount}
                    showAnimation={false}
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Coming Soon Placeholder */}
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonIcon}>🚀</Text>
          <Text style={styles.comingSoonTitle}>
            {t('subscriptions.moreComing')}
          </Text>
          <Text style={styles.comingSoonText}>
            {t('subscriptions.stayTuned')}
          </Text>
        </View>
      </ScrollView>
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
    borderBottomColor: '#D4AF37',
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  vipBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  vipBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  welcomeIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: GRID_SPACING,
  },
  gridItem: {
    width: ITEM_SIZE,
    margin: GRID_SPACING / 2,
  },
  unlockedMedia: {
    width: '100%',
    height: ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  gridItemImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 16,
    color: '#0F0F0F',
    marginLeft: 3,
  },
  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.9)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumBadgeText: {
    fontSize: 12,
  },
  earningsBadge: {
    marginTop: 8,
  },
  comingSoonCard: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 24,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  comingSoonIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noAccessIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  noAccessTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
    textAlign: 'center',
  },
  noAccessText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  subscribeButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 18,
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});