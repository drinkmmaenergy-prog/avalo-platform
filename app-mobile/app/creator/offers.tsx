/**
 * Creator Offers Management Screen
 * Pack 33-6 — Limited-Time Bundles & Deals
 * UI-only, AsyncStorage-based creator offer creation and management
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Animated,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getActiveOffersForCreator,
  createOrUpdateOffer,
  deactivateOffer,
  getAllowedTokenPrices,
  getAllowedDurations,
  CreatorOffer,
  CreatorOfferType,
  CreatorOfferPerk,
} from "@/services/creatorOfferService";

export default function CreatorOffersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [activeOffers, setActiveOffers] = useState<CreatorOffer[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [offerType, setOfferType] = useState<CreatorOfferType>('BUNDLE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPrice, setSelectedPrice] = useState<number>(200);
  const [selectedDuration, setSelectedDuration] = useState<number>(24);
  const [selectedPerks, setSelectedPerks] = useState<Set<string>>(new Set());

  const tokenPrices = getAllowedTokenPrices();
  const durations = getAllowedDurations();

  useEffect(() => {
    loadOffers();
    
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadOffers = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const offers = await getActiveOffersForCreator(user.uid);
      setActiveOffers(offers);
    } catch (error) {
      console.error('Error loading offers:', error);
      Alert.alert('Error', 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  const getTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const handleDeactivate = async (offerId: string) => {
    if (!user?.uid) return;
    
    Alert.alert(
      t('creatorOffers.deactivateConfirm') || 'Deactivate offer?',
      t('creatorOffers.deactivateWarning') || 'This action cannot be undone.',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('creatorOffers.btn_deactivateOffer') || 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateOffer(user.uid, offerId);
              await loadOffers();
              Alert.alert('Success', 'Offer deactivated');
            } catch (error) {
              console.error('Error deactivating offer:', error);
              Alert.alert('Error', 'Failed to deactivate offer');
            }
          },
        },
      ]
    );
  };

  const togglePerk = (perkType: string) => {
    const newPerks = new Set(selectedPerks);
    if (newPerks.has(perkType)) {
      newPerks.delete(perkType);
    } else {
      newPerks.add(perkType);
    }
    setSelectedPerks(newPerks);
  };

  const buildPerksArray = (): CreatorOfferPerk[] => {
    const perks: CreatorOfferPerk[] = [];
    
    if (selectedPerks.has('ppv')) {
      perks.push({
        type: 'PPV_UNLOCK_PACK',
        label: t('creatorOffers.perk_ppv') || '3 premium items',
        durationHours: null,
      });
    }
    
    if (selectedPerks.has('vip')) {
      perks.push({
        type: 'VIP_ROOM_ACCESS',
        label: t('creatorOffers.perk_vip') || '7 days VIP access',
        durationHours: 168, // 7 days
      });
    }
    
    if (selectedPerks.has('frame')) {
      perks.push({
        type: 'COSMETIC_BOOST',
        label: t('creatorOffers.perk_frame') || 'Golden frame',
        durationHours: 168,
      });
    }
    
    if (selectedPerks.has('spotlight')) {
      perks.push({
        type: 'COSMETIC_BOOST',
        label: t('creatorOffers.perk_spotlight') || 'Profile spotlight',
        durationHours: 24,
      });
    }
    
    return perks;
  };

  const handleCreateOffer = async () => {
    if (!user?.uid) return;
    
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    
    if (selectedPerks.size === 0) {
      Alert.alert('Error', 'Please select at least one perk');
      return;
    }
    
    if (activeOffers.length >= 2) {
      Alert.alert(
        'Limit Reached',
        'You can only have 2 active offers at once. Please deactivate an existing offer first.'
      );
      return;
    }
    
    try {
      const perks = buildPerksArray();
      const now = Date.now();
      const expiresAt = now + selectedDuration * 60 * 60 * 1000;
      
      await createOrUpdateOffer(user.uid, {
        type: offerType,
        title: title.trim(),
        description: description.trim(),
        tokenPrice: selectedPrice,
        perks,
        expiresAt,
      });
      
      // Reset form
      setTitle('');
      setDescription('');
      setSelectedPerks(new Set());
      setOfferType('BUNDLE');
      
      await loadOffers();
      Alert.alert('Success', 'Offer created successfully!');
    } catch (error: any) {
      console.error('Error creating offer:', error);
      Alert.alert('Error', error.message || 'Failed to create offer');
    }
  };

  const getOfferTypeBadgeColor = (type: CreatorOfferType) => {
    switch (type) {
      case 'BUNDLE':
        return '#D4AF37';
      case 'LAUNCH':
        return '#40E0D0';
      case 'FLASH':
        return '#FF6B6B';
      default:
        return '#D4AF37';
    }
  };

  const creatorEarnings = Math.floor(selectedPrice * 0.65);
  const avaloFee = Math.floor(selectedPrice * 0.35);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View style={{ opacity: fadeAnim }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('creatorOffers.title')}</Text>
          <Text style={styles.headerEmoji}>🎁</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            {t('creatorOffers.subtitle') || 'Create limited-time bundles to boost your earnings. Fans pay tokens once, you earn 65%, Avalo takes 35%.'}
          </Text>
        </View>

        {/* Active Offers Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorOffers.currentOffers')}</Text>
          
          {loading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : activeOffers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('creatorOffers.noOffers')}</Text>
            </View>
          ) : (
            activeOffers.map((offer) => (
              <View key={offer.id} style={styles.offerCard}>
                <View style={styles.offerHeader}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: getOfferTypeBadgeColor(offer.type) },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {t(`creatorOffers.offerType_${offer.type.toLowerCase()}`) || offer.type}
                    </Text>
                  </View>
                  <Text style={styles.offerPrice}>
                    {t('creatorOffers.priceLabel', { tokens: offer.tokenPrice })}
                  </Text>
                </View>
                
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
                
                <View style={styles.offerFooter}>
                  <View>
                    <Text style={styles.offerStat}>
                      ⏰ {getTimeRemaining(offer.expiresAt)}
                    </Text>
                    <Text style={styles.offerStat}>
                      👥 {offer.purchasersCount} {t('creatorOffers.purchases') || 'purchases'}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.deactivateButton}
                    onPress={() => handleDeactivate(offer.id)}
                  >
                    <Text style={styles.deactivateButtonText}>
                      {t('creatorOffers.btn_deactivateOffer')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Create New Offer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorOffers.createNew')}</Text>
          
          {/* Offer Type Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Offer Type</Text>
            <View style={styles.typeSelector}>
              {(['BUNDLE', 'LAUNCH', 'FLASH'] as CreatorOfferType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    offerType === type && styles.typeChipActive,
                  ]}
                  onPress={() => setOfferType(type)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      offerType === type && styles.typeChipTextActive,
                    ]}
                  >
                    {t(`creatorOffers.offerType_${type.toLowerCase()}`) || type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Title Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., VIP Starter Pack"
              placeholderTextColor="#707070"
              maxLength={60}
            />
          </View>

          {/* Description Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what fans get..."
              placeholderTextColor="#707070"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Token Price Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Token Price</Text>
            <View style={styles.priceGrid}>
              {tokenPrices.map((price) => (
                <TouchableOpacity
                  key={price}
                  style={[
                    styles.priceChip,
                    selectedPrice === price && styles.priceChipActive,
                  ]}
                  onPress={() => setSelectedPrice(price)}
                >
                  <Text
                    style={[
                      styles.priceChipText,
                      selectedPrice === price && styles.priceChipTextActive,
                    ]}
                  >
                    {price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Duration Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Duration</Text>
            <View style={styles.durationSelector}>
              {durations.map((hours) => (
                <TouchableOpacity
                  key={hours}
                  style={[
                    styles.durationChip,
                    selectedDuration === hours && styles.durationChipActive,
                  ]}
                  onPress={() => setSelectedDuration(hours)}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      selectedDuration === hours && styles.durationChipTextActive,
                    ]}
                  >
                    {t(`creatorOffers.duration_${hours}h`) || `${hours}h`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Perks Checklist */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Perks Included</Text>
            
            <TouchableOpacity
              style={styles.perkItem}
              onPress={() => togglePerk('ppv')}
            >
              <Switch
                value={selectedPerks.has('ppv')}
                onValueChange={() => togglePerk('ppv')}
                trackColor={{ false: '#3A3A3A', true: '#D4AF37' }}
                thumbColor="#FFFFFF"
              />
              <Text style={styles.perkLabel}>
                🎥 {t('creatorOffers.perk_ppv')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.perkItem}
              onPress={() => togglePerk('vip')}
            >
              <Switch
                value={selectedPerks.has('vip')}
                onValueChange={() => togglePerk('vip')}
                trackColor={{ false: '#3A3A3A', true: '#D4AF37' }}
                thumbColor="#FFFFFF"
              />
              <Text style={styles.perkLabel}>
                👑 {t('creatorOffers.perk_vip')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.perkItem}
              onPress={() => togglePerk('frame')}
            >
              <Switch
                value={selectedPerks.has('frame')}
                onValueChange={() => togglePerk('frame')}
                trackColor={{ false: '#3A3A3A', true: '#D4AF37' }}
                thumbColor="#FFFFFF"
              />
              <Text style={styles.perkLabel}>
                ✨ {t('creatorOffers.perk_frame')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.perkItem}
              onPress={() => togglePerk('spotlight')}
            >
              <Switch
                value={selectedPerks.has('spotlight')}
                onValueChange={() => togglePerk('spotlight')}
                trackColor={{ false: '#3A3A3A', true: '#D4AF37' }}
                thumbColor="#FFFFFF"
              />
              <Text style={styles.perkLabel}>
                🌟 {t('creatorOffers.perk_spotlight')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Offer Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t('creatorOffers.summary_fanPays', { tokens: selectedPrice })}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t('creatorOffers.summary_creatorEarns', { tokens: creatorEarnings })}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t('creatorOffers.summary_avaloFee', { tokens: avaloFee })}
              </Text>
            </View>
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateOffer}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>
              {t('creatorOffers.btn_createOffer')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 60,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerEmoji: {
    fontSize: 28,
  },
  descriptionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#D4AF37',
  },
  descriptionText: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  loadingText: {
    color: '#707070',
    textAlign: 'center',
    padding: 20,
  },
  emptyCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#707070',
  },
  offerCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  offerPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  offerDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 16,
  },
  offerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  offerStat: {
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 4,
  },
  deactivateButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  deactivateButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: '#2A2410',
    borderColor: '#D4AF37',
  },
  typeChipText: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#D4AF37',
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceChip: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    minWidth: 80,
    alignItems: 'center',
  },
  priceChipActive: {
    backgroundColor: '#2A2410',
    borderColor: '#D4AF37',
  },
  priceChipText: {
    fontSize: 16,
    color: '#A0A0A0',
    fontWeight: '700',
  },
  priceChipTextActive: {
    color: '#D4AF37',
  },
  durationSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  durationChipActive: {
    backgroundColor: '#2A2410',
    borderColor: '#D4AF37',
  },
  durationChipText: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '600',
  },
  durationChipTextActive: {
    color: '#D4AF37',
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  perkLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 12,
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#1A1610',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
  },
  summaryRow: {
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  createButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 0.5,
  },
  bottomPadding: {
    height: 40,
  },
});
