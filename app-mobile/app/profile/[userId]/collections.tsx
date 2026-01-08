/**
 * Profile Collections Viewer Screen
 * Phase 33-10: View and purchase creator collections
 * 
 * Features:
 * - Collection grid display
 * - "Unlock for X tokens" CTA
 * - VIP discount banner
 * - Show collection content after purchase
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getCollections,
  getCollectionById,
  purchaseCollection,
  hasAccess,
  getEffectivePrice,
  calculateCreatorEarnings,
  calculateVIPPrice,
  Collection,
} from '../../../services/creatorCollectionsService';
import { deductTokens } from '../../../services/tokenService';

const GOLD = '#D4AF37';
const TURQUOISE = '#40E0D0';
const BACKGROUND = '#0F0F0F';
const CARD_BG = '#1A1A1A';

// Temporary: i18n strings will be loaded from strings.json via proper i18n system
const t = (key: string) => key; // Placeholder function

export default function ProfileCollectionsScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [currentUserId] = useState('current_user_id'); // Replace with actual auth
  const [userBalance] = useState(1000); // Replace with actual balance from tokenService
  const [isVIP] = useState(false); // Replace with actual VIP status
  const [purchasing, setPurchasing] = useState(false);
  const [accessMap, setAccessMap] = useState<{ [key: string]: boolean }>({});

  // Animation
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    loadCollections();
    startPulseAnimation();
  }, [userId]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const loadCollections = async () => {
    try {
      setLoading(true);
      const collectionsData = await getCollections(userId as string);
      setCollections(collectionsData);

      // Check access for each collection
      const access: { [key: string]: boolean } = {};
      for (const collection of collectionsData) {
        access[collection.id] = await hasAccess(currentUserId, collection.id);
      }
      setAccessMap(access);
    } catch (error) {
      console.error('Error loading collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCollectionPress = async (collection: Collection) => {
    const fullCollection = await getCollectionById(collection.id);
    if (fullCollection) {
      setSelectedCollection(fullCollection);
      setShowModal(true);
    }
  };

  const handlePurchase = async () => {
    if (!selectedCollection) return;

    const effectivePrice = await getEffectivePrice(selectedCollection.id, isVIP);
    
    if (userBalance < effectivePrice) {
      Alert.alert(
        t('creatorCollections.insufficientTokens'),
        t('creatorCollections.needMoreTokens')
      );
      return;
    }

    Alert.alert(
      t('creatorCollections.confirmPurchase'),
      `${t('creatorCollections.unlockFor')} ${effectivePrice} ${t('common.tokens')}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('creatorCollections.unlock'),
          onPress: async () => {
            setPurchasing(true);
            try {
              // Deduct tokens
              await deductTokens(currentUserId, effectivePrice);
              
              // Purchase collection
              const result = await purchaseCollection(
                currentUserId,
                selectedCollection.id,
                effectivePrice
              );

              if (result.success) {
                Alert.alert(
                  t('common.success'),
                  t('creatorCollections.purchaseSuccess')
                );
                await loadCollections();
                setShowModal(false);
              } else {
                Alert.alert(t('common.error'), result.error);
              }
            } catch (error) {
              Alert.alert(t('common.error'), t('creatorCollections.purchaseFailed'));
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
  };

  const renderCollectionCard = (collection: Collection) => {
    const hasUserAccess = accessMap[collection.id];
    const effectivePrice = isVIP 
      ? calculateVIPPrice(collection.price)
      : collection.price;
    const discount = collection.price - effectivePrice;

    return (
      <TouchableOpacity
        key={collection.id}
        style={styles.collectionCard}
        onPress={() => handleCollectionPress(collection)}
        activeOpacity={0.8}
      >
        {collection.coverImage ? (
          <Image source={{ uri: collection.coverImage }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverImage, styles.placeholderCover]}>
            <Ionicons name="folder" size={48} color="#444" />
          </View>
        )}

        {hasUserAccess && (
          <View style={styles.unlockedBadge}>
            <Ionicons name="checkmark-circle" size={24} color={TURQUOISE} />
          </View>
        )}

        {isVIP && discount > 0 && !hasUserAccess && (
          <View style={styles.vipBadge}>
            <Text style={styles.vipBadgeText}>VIP -{discount}</Text>
          </View>
        )}

        <View style={styles.collectionCardContent}>
          <Text style={styles.collectionCardName} numberOfLines={1}>
            {collection.name}
          </Text>
          <Text style={styles.collectionCardDescription} numberOfLines={2}>
            {collection.description}
          </Text>
          
          <View style={styles.collectionCardFooter}>
            <Text style={styles.mediaCount}>
              {collection.media.length} {t('creatorCollections.items')}
            </Text>
            {hasUserAccess ? (
              <View style={styles.unlockedTag}>
                <Text style={styles.unlockedTagText}>
                  {t('creatorCollections.unlocked')}
                </Text>
              </View>
            ) : (
              <View style={styles.priceTag}>
                <Text style={styles.priceTagText}>
                  {effectivePrice} {t('common.tokens')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCollectionModal = () => {
    if (!selectedCollection) return null;

    const hasUserAccess = accessMap[selectedCollection.id];
    const effectivePrice = isVIP 
      ? calculateVIPPrice(selectedCollection.price)
      : selectedCollection.price;
    const discount = selectedCollection.price - effectivePrice;
    const creatorEarns = calculateCreatorEarnings(effectivePrice);

    return (
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="arrow-back" size={28} color={GOLD} />
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedCollection.name}
              </Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Cover Image */}
              {selectedCollection.coverImage ? (
                <Image
                  source={{ uri: selectedCollection.coverImage }}
                  style={styles.modalCover}
                />
              ) : (
                <View style={[styles.modalCover, styles.placeholderCover]}>
                  <Ionicons name="folder" size={80} color="#444" />
                </View>
              )}

              {/* VIP Discount Banner */}
              {isVIP && discount > 0 && !hasUserAccess && (
                <View style={styles.vipBanner}>
                  <Ionicons name="star" size={20} color={GOLD} />
                  <Text style={styles.vipBannerText}>
                    {t('creatorCollections.vipDiscount')}: {discount} {t('common.tokens')}
                  </Text>
                </View>
              )}

              {/* Description */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  {t('creatorCollections.about')}
                </Text>
                <Text style={styles.modalDescription}>
                  {selectedCollection.description}
                </Text>
              </View>

              {/* Content Preview */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  {t('creatorCollections.whatYouGet')}
                </Text>
                <View style={styles.contentTypes}>
                  {selectedCollection.media.some(m => m.type === 'photo') && (
                    <View style={styles.contentType}>
                      <Ionicons name="image" size={20} color={TURQUOISE} />
                      <Text style={styles.contentTypeText}>
                        {t('creatorCollections.photos')}
                      </Text>
                    </View>
                  )}
                  {selectedCollection.media.some(m => m.type === 'video') && (
                    <View style={styles.contentType}>
                      <Ionicons name="videocam" size={20} color={TURQUOISE} />
                      <Text style={styles.contentTypeText}>
                        {t('creatorCollections.videos')}
                      </Text>
                    </View>
                  )}
                  {selectedCollection.media.some(m => m.type === 'voice') && (
                    <View style={styles.contentType}>
                      <Ionicons name="mic" size={20} color={TURQUOISE} />
                      <Text style={styles.contentTypeText}>
                        {t('creatorCollections.voiceNotes')}
                      </Text>
                    </View>
                  )}
                  {selectedCollection.media.some(m => m.type === 'live_replay') && (
                    <View style={styles.contentType}>
                      <Ionicons name="play-circle" size={20} color={TURQUOISE} />
                      <Text style={styles.contentTypeText}>
                        {t('creatorCollections.liveReplay')}
                      </Text>
                    </View>
                  )}
                  {selectedCollection.media.some(m => m.type === 'ai_prompt') && (
                    <View style={styles.contentType}>
                      <Ionicons name="sparkles" size={20} color={GOLD} />
                      <Text style={styles.contentTypeText}>
                        {t('creatorCollections.aiPrompts')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemCount}>
                  {selectedCollection.media.length} {t('creatorCollections.totalItems')}
                </Text>
              </View>

              {/* Pricing Info */}
              {!hasUserAccess && (
                <View style={styles.pricingCard}>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingLabel}>
                      {t('creatorCollections.price')}
                    </Text>
                    <Text style={styles.pricingValue}>
                      {effectivePrice} {t('common.tokens')}
                    </Text>
                  </View>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingLabelSmall}>
                      {t('creatorCollections.creatorEarns')}
                    </Text>
                    <Text style={styles.pricingValueSmall}>
                      {creatorEarns} {t('common.tokens')} (65%)
                    </Text>
                  </View>
                </View>
              )}

              {/* Access Info */}
              {hasUserAccess && (
                <View style={styles.accessCard}>
                  <Ionicons name="checkmark-circle" size={32} color={TURQUOISE} />
                  <Text style={styles.accessTitle}>
                    {t('creatorCollections.youHaveAccess')}
                  </Text>
                  <Text style={styles.accessSubtitle}>
                    {t('creatorCollections.viewAllContent')}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Action Button */}
            {!hasUserAccess && (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={styles.unlockButton}
                  onPress={handlePurchase}
                  disabled={purchasing}
                >
                  {purchasing ? (
                    <ActivityIndicator color={BACKGROUND} />
                  ) : (
                    <>
                      <Ionicons name="lock-open" size={24} color={BACKGROUND} />
                      <Text style={styles.unlockButtonText}>
                        {t('creatorCollections.unlockFor')} {effectivePrice} {t('common.tokens')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creatorCollections.collections')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* VIP Banner */}
        {isVIP && (
          <View style={styles.vipInfoBanner}>
            <Ionicons name="star" size={24} color={GOLD} />
            <Text style={styles.vipInfoText}>
              {t('creatorCollections.vipDiscountInfo')}
            </Text>
          </View>
        )}

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#444" />
            <Text style={styles.emptyStateText}>
              {t('creatorCollections.noCollectionsAvailable')}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {collections.map(renderCollectionCard)}
          </View>
        )}
      </ScrollView>

      {/* Collection Detail Modal */}
      {renderCollectionModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: GOLD,
  },
  vipInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2416',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
  },
  vipInfoText: {
    flex: 1,
    fontSize: 14,
    color: GOLD,
    marginLeft: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  collectionCard: {
    width: '47%',
    backgroundColor: CARD_BG,
    borderRadius: 18,
    overflow: 'hidden',
    margin: '1.5%',
    borderWidth: 1,
    borderColor: '#333',
  },
  coverImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#2A2A2A',
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 20,
    padding: 4,
  },
  vipBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: GOLD,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vipBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  collectionCardContent: {
    padding: 12,
  },
  collectionCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: GOLD,
    marginBottom: 6,
  },
  collectionCardDescription: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 12,
    minHeight: 32,
  },
  collectionCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mediaCount: {
    fontSize: 11,
    color: '#888',
  },
  priceTag: {
    backgroundColor: TURQUOISE,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priceTagText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  unlockedTag: {
    backgroundColor: '#1A4A3A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  unlockedTagText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TURQUOISE,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: GOLD,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  modalCover: {
    width: '100%',
    height: 240,
    backgroundColor: '#2A2A2A',
  },
  vipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2416',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
  },
  vipBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: GOLD,
    marginLeft: 12,
  },
  modalSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 22,
  },
  contentTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  contentType: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  contentTypeText: {
    fontSize: 13,
    color: '#FFF',
    marginLeft: 8,
  },
  itemCount: {
    fontSize: 14,
    color: TURQUOISE,
    marginTop: 12,
    fontWeight: 'bold',
  },
  pricingCard: {
    backgroundColor: CARD_BG,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: TURQUOISE,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pricingLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  pricingValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TURQUOISE,
  },
  pricingLabelSmall: {
    fontSize: 12,
    color: '#AAA',
  },
  pricingValueSmall: {
    fontSize: 12,
    color: '#AAA',
  },
  accessCard: {
    backgroundColor: '#1A4A3A',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 24,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TURQUOISE,
  },
  accessTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TURQUOISE,
    marginTop: 12,
  },
  accessSubtitle: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 6,
    textAlign: 'center',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    marginHorizontal: 20,
    marginVertical: 20,
    padding: 18,
    borderRadius: 18,
  },
  unlockButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BACKGROUND,
    marginLeft: 8,
  },
});