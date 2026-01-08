/**
 * Creator Collections Screen
 * Phase 33-10: Creator Collections Management
 * 
 * Features:
 * - Collection list
 * - "Create Collection" CTA
 * - Creation wizard (name, description, cover, price preset, select media assets)
 * - Earnings summary
 * - "Publish" button
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  createCollection,
  getCollections,
  getCollectionStats,
  addMediaToCollection,
  deactivateCollection,
  COLLECTION_PRICE_PRESETS,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  Collection,
  CollectionMedia,
} from "@/services/creatorCollectionsService";
// Temporary: i18n strings will be loaded from strings.json via proper i18n system
const t = (key: string) => key; // Placeholder function

const GOLD = '#D4AF37';
const TURQUOISE = '#40E0D0';
const BACKGROUND = '#0F0F0F';
const CARD_BG = '#1A1A1A';

export default function CreatorCollectionsScreen() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState({
    totalEarned: 0,
    totalSales: 0,
    avaloCommission: 0,
    purchaseCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [currentUserId] = useState('current_user_id'); // Replace with actual auth

  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [selectedPrice, setSelectedPrice] = useState(COLLECTION_PRICE_PRESETS[0]);
  const [selectedMedia, setSelectedMedia] = useState<CollectionMedia[]>([]);

  // Animation
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    loadData();
    startPulseAnimation();
  }, []);

  useEffect(() => {
    if (!showWizard) {
      resetWizard();
    }
  }, [showWizard]);

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

  const loadData = async () => {
    try {
      setLoading(true);
      const [collectionsData, statsData] = await Promise.all([
        getCollections(currentUserId),
        getCollectionStats(currentUserId),
      ]);
      setCollections(collectionsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setCollectionName('');
    setCollectionDescription('');
    setSelectedPrice(COLLECTION_PRICE_PRESETS[0]);
    setSelectedMedia([]);
  };

  const handleCreateCollection = async () => {
    if (!collectionName.trim()) {
      Alert.alert(t('common.error'), t('creatorCollections.nameRequired'));
      return;
    }

    if (!collectionDescription.trim()) {
      Alert.alert(t('common.error'), t('creatorCollections.descriptionRequired'));
      return;
    }

    const result = await createCollection(currentUserId, {
      name: collectionName,
      description: collectionDescription,
      price: selectedPrice,
    });

    if (result.success && result.collectionId) {
      // Add media to collection
      for (const media of selectedMedia) {
        await addMediaToCollection(result.collectionId, media);
      }

      Alert.alert(
        t('common.success'),
        t('creatorCollections.collectionCreated'),
        [{ text: t('common.ok'), onPress: () => setShowWizard(false) }]
      );
      await loadData();
    } else {
      Alert.alert(t('common.error'), result.error || t('creatorCollections.createFailed'));
    }
  };

  const handleDeactivateCollection = async (collectionId: string) => {
    Alert.alert(
      t('creatorCollections.deactivate'),
      t('creatorCollections.deactivateConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('creatorCollections.deactivate'),
          style: 'destructive',
          onPress: async () => {
            const result = await deactivateCollection(collectionId);
            if (result.success) {
              await loadData();
            } else {
              Alert.alert(t('common.error'), result.error);
            }
          },
        },
      ]
    );
  };

  const renderEarningsSummary = () => (
    <View style={styles.earningsCard}>
      <View style={styles.shimmerOverlay} />
      <Text style={styles.earningsTitle}>{t('creatorCollections.totalEarnings')}</Text>
      <Text style={styles.earningsAmount}>{stats.totalEarned}</Text>
      <Text style={styles.earningsTokens}>{t('common.tokens')}</Text>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('creatorCollections.sales')}</Text>
          <Text style={styles.statValue}>{stats.purchaseCount}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('creatorCollections.revenue')}</Text>
          <Text style={styles.statValue}>{stats.totalSales}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('creatorCollections.commission')}</Text>
          <Text style={styles.statValue}>{stats.avaloCommission}</Text>
        </View>
      </View>
    </View>
  );

  const renderCollectionItem = (collection: Collection) => (
    <View key={collection.id} style={styles.collectionCard}>
      {collection.coverImage && (
        <Image source={{ uri: collection.coverImage }} style={styles.coverImage} />
      )}
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName}>{collection.name}</Text>
        <Text style={styles.collectionDescription} numberOfLines={2}>
          {collection.description}
        </Text>
        <View style={styles.collectionMeta}>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>{collection.price} {t('common.tokens')}</Text>
          </View>
          <Text style={styles.mediaCount}>
            {collection.media.length} {t('creatorCollections.items')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deactivateButton}
        onPress={() => handleDeactivateCollection(collection.id)}
      >
        <Ionicons name="close-circle" size={24} color="#FF4444" />
      </TouchableOpacity>
    </View>
  );

  const renderWizardStep1 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.wizardTitle}>{t('creatorCollections.step1Title')}</Text>
      <Text style={styles.wizardSubtitle}>{t('creatorCollections.step1Subtitle')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('creatorCollections.collectionName')}
        placeholderTextColor="#666"
        value={collectionName}
        onChangeText={setCollectionName}
        maxLength={50}
      />

      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={t('creatorCollections.collectionDescription')}
        placeholderTextColor="#666"
        value={collectionDescription}
        onChangeText={setCollectionDescription}
        multiline
        numberOfLines={4}
        maxLength={200}
      />

      <TouchableOpacity
        style={[styles.nextButton, !collectionName.trim() && styles.buttonDisabled]}
        onPress={() => setWizardStep(2)}
        disabled={!collectionName.trim()}
      >
        <Text style={styles.nextButtonText}>{t('common.next')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderWizardStep2 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.wizardTitle}>{t('creatorCollections.step2Title')}</Text>
      <Text style={styles.wizardSubtitle}>{t('creatorCollections.step2Subtitle')}</Text>

      <View style={styles.priceGrid}>
        {COLLECTION_PRICE_PRESETS.map((price) => {
          const creatorEarns = calculateCreatorEarnings(price);
          const avaloFee = calculateAvaloCommission(price);
          const isSelected = selectedPrice === price;

          return (
            <TouchableOpacity
              key={price}
              style={[styles.priceOption, isSelected && styles.priceOptionSelected]}
              onPress={() => setSelectedPrice(price)}
            >
              <Text style={[styles.priceOptionAmount, isSelected && styles.priceOptionAmountSelected]}>
                {price}
              </Text>
              <Text style={styles.priceOptionLabel}>{t('common.tokens')}</Text>
              <View style={styles.priceBreakdown}>
                <Text style={styles.priceBreakdownText}>
                  {t('creatorCollections.youEarn')}: {creatorEarns}
                </Text>
                <Text style={styles.priceBreakdownFee}>
                  {t('creatorCollections.fee')}: {avaloFee}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.wizardButtons}>
        <TouchableOpacity style={styles.backButton} onPress={() => setWizardStep(1)}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextButton} onPress={() => setWizardStep(3)}>
          <Text style={styles.nextButtonText}>{t('common.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWizardStep3 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.wizardTitle}>{t('creatorCollections.step3Title')}</Text>
      <Text style={styles.wizardSubtitle}>{t('creatorCollections.step3Subtitle')}</Text>

      <View style={styles.mediaTypeButtons}>
        <TouchableOpacity style={styles.mediaTypeButton}>
          <Ionicons name="image" size={24} color={TURQUOISE} />
          <Text style={styles.mediaTypeText}>{t('creatorCollections.photos')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaTypeButton}>
          <Ionicons name="videocam" size={24} color={TURQUOISE} />
          <Text style={styles.mediaTypeText}>{t('creatorCollections.videos')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaTypeButton}>
          <Ionicons name="mic" size={24} color={TURQUOISE} />
          <Text style={styles.mediaTypeText}>{t('creatorCollections.voice')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaTypeButton}>
          <Ionicons name="sparkles" size={24} color={GOLD} />
          <Text style={styles.mediaTypeText}>{t('creatorCollections.aiPrompts')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.selectedMediaCount}>
        {selectedMedia.length} {t('creatorCollections.itemsSelected')}
      </Text>

      <View style={styles.wizardButtons}>
        <TouchableOpacity style={styles.backButton} onPress={() => setWizardStep(2)}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.publishButton}
            onPress={handleCreateCollection}
          >
            <Text style={styles.publishButtonText}>{t('creatorCollections.publish')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );

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
          <Text style={styles.headerTitle}>{t('creatorCollections.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Earnings Summary */}
        {renderEarningsSummary()}

        {/* Collections List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('creatorCollections.myCollections')}</Text>
            <Text style={styles.collectionLimit}>
              {collections.length}/4 {t('creatorCollections.active')}
            </Text>
          </View>

          {collections.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={64} color="#444" />
              <Text style={styles.emptyStateText}>
                {t('creatorCollections.noCollections')}
              </Text>
              <Text style={styles.emptyStateSubtext}>
                {t('creatorCollections.createFirstCollection')}
              </Text>
            </View>
          ) : (
            collections.map(renderCollectionItem)
          )}
        </View>

        {/* Create Button */}
        {collections.length < 4 && (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowWizard(true)}
            >
              <Ionicons name="add-circle" size={24} color={BACKGROUND} />
              <Text style={styles.createButtonText}>
                {t('creatorCollections.createCollection')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>

      {/* Creation Wizard Modal */}
      <Modal
        visible={showWizard}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWizard(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('creatorCollections.createCollection')}
              </Text>
              <TouchableOpacity onPress={() => setShowWizard(false)}>
                <Ionicons name="close" size={28} color={GOLD} />
              </TouchableOpacity>
            </View>

            {/* Step Indicator */}
            <View style={styles.stepIndicator}>
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={[
                    styles.stepDot,
                    wizardStep >= step && styles.stepDotActive,
                  ]}
                />
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {wizardStep === 1 && renderWizardStep1()}
              {wizardStep === 2 && renderWizardStep2()}
              {wizardStep === 3 && renderWizardStep3()}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  earningsCard: {
    backgroundColor: CARD_BG,
    margin: 20,
    padding: 24,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: GOLD,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  earningsTitle: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: GOLD,
  },
  earningsTokens: {
    fontSize: 16,
    color: '#AAA',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TURQUOISE,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  collectionLimit: {
    fontSize: 14,
    color: '#AAA',
  },
  collectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  coverImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#2A2A2A',
  },
  collectionInfo: {
    padding: 16,
  },
  collectionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: GOLD,
    marginBottom: 8,
  },
  collectionDescription: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 12,
  },
  collectionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceTag: {
    backgroundColor: TURQUOISE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  mediaCount: {
    fontSize: 14,
    color: '#AAA',
  },
  deactivateButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 8,
  },
  createButton: {
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
    padding: 18,
    borderRadius: 18,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BACKGROUND,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: BACKGROUND,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: GOLD,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  stepDot: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  stepDotActive: {
    backgroundColor: GOLD,
  },
  wizardContent: {
    paddingHorizontal: 20,
  },
  wizardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  wizardSubtitle: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 24,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  priceOption: {
    width: '47%',
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  priceOptionSelected: {
    borderColor: GOLD,
    backgroundColor: '#2A2416',
  },
  priceOptionAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  priceOptionAmountSelected: {
    color: GOLD,
  },
  priceOptionLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 8,
  },
  priceBreakdown: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 8,
  },
  priceBreakdownText: {
    fontSize: 11,
    color: TURQUOISE,
    textAlign: 'center',
  },
  priceBreakdownFee: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  mediaTypeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  mediaTypeButton: {
    width: '47%',
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  mediaTypeText: {
    fontSize: 14,
    color: '#FFF',
    marginTop: 8,
  },
  selectedMediaCount: {
    fontSize: 16,
    color: TURQUOISE,
    textAlign: 'center',
    marginBottom: 24,
  },
  wizardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: CARD_BG,
    padding: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  nextButton: {
    flex: 1,
    backgroundColor: TURQUOISE,
    padding: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  publishButton: {
    flex: 1,
    backgroundColor: GOLD,
    padding: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
