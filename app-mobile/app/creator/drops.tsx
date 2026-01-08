/**
 * Creator Drops Management Screen - Pack 33-7
 * Limited-seat, time-limited monetized bundles
 * UI-only with AsyncStorage persistence
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  createDrop,
  getActiveDrop,
  deleteDrop,
  getDropStats,
  calculateEarnings,
  getPerkInfo,
  formatTimeRemaining,
  PRICE_PRESETS,
  SEAT_PRESETS,
  DURATION_PRESETS,
  type CreatorDrop,
  type DropPerk,
  type DropStats,
} from "@/services/creatorDropsService";

const AVAILABLE_PERKS: DropPerk[] = [
  'vip_room_48h',
  'smartmatch_boost_72h',
  'gold_frame_7d',
  'vip_chat_group',
  'unlock_ppv_media',
];

export default function CreatorDropsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeDrop, setActiveDrop] = useState<CreatorDrop | null>(null);
  const [stats, setStats] = useState<DropStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create drop form state
  const [selectedPrice, setSelectedPrice] = useState<number>(PRICE_PRESETS[0]);
  const [selectedSeats, setSelectedSeats] = useState<number>(SEAT_PRESETS[0]);
  const [selectedDuration, setSelectedDuration] = useState<number>(DURATION_PRESETS[0].hours);
  const [selectedPerks, setSelectedPerks] = useState<DropPerk[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  const loadData = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const [drop, dropStats] = await Promise.all([
        getActiveDrop(user.uid),
        getDropStats(user.uid),
      ]);

      setActiveDrop(drop);
      setStats(dropStats);
    } catch (error) {
      console.error('Error loading drops:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDrop = async () => {
    if (!user?.uid) return;

    if (selectedPerks.length === 0) {
      Alert.alert(t('common.error'), 'Please select at least 1 perk');
      return;
    }

    if (selectedPerks.length > 5) {
      Alert.alert(t('common.error'), 'Maximum 5 perks allowed');
      return;
    }

    setCreating(true);
    try {
      const result = await createDrop(user.uid, {
        price: selectedPrice,
        seats: selectedSeats,
        duration: selectedDuration,
        perks: selectedPerks,
      });

      if (result.success) {
        Alert.alert(
          t('common.success'),
          t('creatorDrops.dropCreated') || 'Drop created successfully!'
        );
        setShowCreateModal(false);
        resetForm();
        await loadData();
      } else {
        Alert.alert(t('common.error'), result.error || 'Failed to create drop');
      }
    } catch (error) {
      console.error('Error creating drop:', error);
      Alert.alert(t('common.error'), 'Failed to create drop');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDrop = async () => {
    if (!user?.uid || !activeDrop) return;

    Alert.alert(
      t('creatorDrops.deleteDrop') || 'Delete Drop',
      t('creatorDrops.deleteConfirm') || 'Are you sure you want to delete this drop?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const success = await deleteDrop(user.uid, activeDrop.dropId);
            if (success) {
              Alert.alert(t('common.success'), 'Drop deleted successfully');
              await loadData();
            } else {
              Alert.alert(t('common.error'), 'Failed to delete drop');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setSelectedPrice(PRICE_PRESETS[0]);
    setSelectedSeats(SEAT_PRESETS[0]);
    setSelectedDuration(DURATION_PRESETS[0].hours);
    setSelectedPerks([]);
  };

  const togglePerk = (perk: DropPerk) => {
    if (selectedPerks.includes(perk)) {
      setSelectedPerks(selectedPerks.filter((p) => p !== perk));
    } else {
      if (selectedPerks.length < 5) {
        setSelectedPerks([...selectedPerks, perk]);
      }
    }
  };

  const renderActiveDropCard = () => {
    if (!activeDrop) return null;

    const seatsLeft = activeDrop.seats - activeDrop.purchasedBy.length;
    const timeLeft = formatTimeRemaining(activeDrop.expiresAt);
    const earnings = calculateEarnings(activeDrop.price * activeDrop.purchasedBy.length);

    return (
      <View style={styles.activeDropCard}>
        <View style={styles.activeDropHeader}>
          <Text style={styles.activeDropTitle}>
            {t('creatorDrops.activeDrop') || 'Active Drop'}
          </Text>
          <View style={[styles.statusBadge, styles.statusActive]}>
            <View style={styles.pulseIndicator} />
            <Text style={styles.statusText}>
              {t('creatorDrops.live') || 'LIVE'}
            </Text>
          </View>
        </View>

        <View style={styles.dropInfoGrid}>
          <View style={styles.dropInfoItem}>
            <Text style={styles.dropInfoLabel}>
              {t('creatorDrops.price') || 'Price'}
            </Text>
            <Text style={styles.dropInfoValue}>{activeDrop.price} 💎</Text>
          </View>

          <View style={styles.dropInfoItem}>
            <Text style={styles.dropInfoLabel}>
              {t('creatorDrops.seatsLeft') || 'Seats Left'}
            </Text>
            <Text style={styles.dropInfoValue}>
              {seatsLeft}/{activeDrop.seats}
            </Text>
          </View>

          <View style={styles.dropInfoItem}>
            <Text style={styles.dropInfoLabel}>
              {t('creatorDrops.endsIn') || 'Ends In'}
            </Text>
            <Text style={styles.dropInfoValue}>{timeLeft}</Text>
          </View>

          <View style={styles.dropInfoItem}>
            <Text style={styles.dropInfoLabel}>
              {t('creatorDrops.purchased') || 'Purchased'}
            </Text>
            <Text style={styles.dropInfoValue}>
              {activeDrop.purchasedBy.length}
            </Text>
          </View>
        </View>

        <View style={styles.perksSection}>
          <Text style={styles.perksSectionTitle}>
            {t('creatorDrops.perks') || 'Perks'}
          </Text>
          <View style={styles.perksList}>
            {activeDrop.perks.map((perk) => {
              const perkInfo = getPerkInfo(perk);
              return (
                <View key={perk} style={styles.perkChip}>
                  <Text style={styles.perkIcon}>{perkInfo.icon}</Text>
                  <Text style={styles.perkText}>
                    {t(`creatorDrops.perk_${perkInfo.key}`) || perkInfo.key}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.earningsSection}>
          <Text style={styles.earningsSectionTitle}>
            {t('creatorDrops.earningsSummary') || 'Earnings Summary'}
          </Text>
          <View style={styles.earningsGrid}>
            <View style={styles.earningsItem}>
              <Text style={styles.earningsLabel}>
                {t('creatorDrops.yourShare') || 'Your Share (65%)'}
              </Text>
              <Text style={styles.earningsValue}>
                {earnings.creatorEarns} 💎
              </Text>
            </View>
            <View style={styles.earningsItem}>
              <Text style={styles.earningsLabel}>
                {t('creatorDrops.avaloFee') || 'Avalo Fee (35%)'}
              </Text>
              <Text style={styles.earningsValueSecondary}>
                {earnings.avaloFee} 💎
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteDrop}
        >
          <Text style={styles.deleteButtonText}>
            {t('creatorDrops.deleteDrop') || 'Delete Drop'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStatsCard = () => {
    if (!stats) return null;

    return (
      <View style={styles.statsCard}>
        <Text style={styles.statsCardTitle}>
          {t('creatorDrops.totalEarnings') || 'Total Earnings'}
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalEarnings} 💎</Text>
            <Text style={styles.statLabel}>
              {t('creatorDrops.earned') || 'Earned (65%)'}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.purchaseCount}</Text>
            <Text style={styles.statLabel}>
              {t('creatorDrops.totalSales') || 'Total Sales'}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValueSecondary}>
              {stats.totalRevenue} 💎
            </Text>
            <Text style={styles.statLabel}>
              {t('creatorDrops.grossRevenue') || 'Total Revenue'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCreateModal = () => {
    const earnings = calculateEarnings(selectedPrice);

    return (
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t('creatorDrops.createDrop') || 'Create Drop'}
                </Text>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Price Selection */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  {t('creatorDrops.price') || 'Price'} (💎)
                </Text>
                <View style={styles.optionsGrid}>
                  {PRICE_PRESETS.map((price) => (
                    <TouchableOpacity
                      key={price}
                      style={[
                        styles.option,
                        selectedPrice === price && styles.optionSelected,
                      ]}
                      onPress={() => setSelectedPrice(price)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selectedPrice === price && styles.optionTextSelected,
                        ]}
                      >
                        {price}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Seats Selection */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  {t('creatorDrops.seats') || 'Seats'}
                </Text>
                <View style={styles.optionsGrid}>
                  {SEAT_PRESETS.map((seats) => (
                    <TouchableOpacity
                      key={seats}
                      style={[
                        styles.option,
                        selectedSeats === seats && styles.optionSelected,
                      ]}
                      onPress={() => setSelectedSeats(seats)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selectedSeats === seats && styles.optionTextSelected,
                        ]}
                      >
                        {seats}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Duration Selection */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  {t('creatorDrops.duration') || 'Duration'}
                </Text>
                <View style={styles.optionsGrid}>
                  {DURATION_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.hours}
                      style={[
                        styles.option,
                        selectedDuration === preset.hours && styles.optionSelected,
                      ]}
                      onPress={() => setSelectedDuration(preset.hours)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selectedDuration === preset.hours &&
                            styles.optionTextSelected,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Perks Selection */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  {t('creatorDrops.perks') || 'Perks'} (
                  {t('creatorDrops.selectUpTo5') || 'Select up to 5'})
                </Text>
                <View style={styles.perksGrid}>
                  {AVAILABLE_PERKS.map((perk) => {
                    const perkInfo = getPerkInfo(perk);
                    const isSelected = selectedPerks.includes(perk);
                    return (
                      <TouchableOpacity
                        key={perk}
                        style={[
                          styles.perkOption,
                          isSelected && styles.perkOptionSelected,
                        ]}
                        onPress={() => togglePerk(perk)}
                      >
                        <Text style={styles.perkOptionIcon}>
                          {perkInfo.icon}
                        </Text>
                        <Text
                          style={[
                            styles.perkOptionText,
                            isSelected && styles.perkOptionTextSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {t(`creatorDrops.perk_${perkInfo.key}`) || perkInfo.key}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Earnings Preview */}
              <View style={styles.earningsPreview}>
                <Text style={styles.earningsPreviewTitle}>
                  {t('creatorDrops.earningsBreakdown') || 'Revenue Split'}
                </Text>
                <View style={styles.earningsPreviewRow}>
                  <Text style={styles.earningsPreviewLabel}>
                    {t('creatorDrops.yourShare') || 'Your Share (65%)'}
                  </Text>
                  <Text style={styles.earningsPreviewValue}>
                    {earnings.creatorEarns} 💎
                  </Text>
                </View>
                <View style={styles.earningsPreviewRow}>
                  <Text style={styles.earningsPreviewLabel}>
                    {t('creatorDrops.avaloFee') || 'Avalo Fee (35%)'}
                  </Text>
                  <Text style={styles.earningsPreviewValueSecondary}>
                    {earnings.avaloFee} 💎
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateDrop}
                disabled={creating || selectedPerks.length === 0}
              >
                {creating ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.createButtonText}>
                    {t('creatorDrops.createDrop') || 'Create Drop'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.bottomPadding} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('creatorDrops.title') || 'Creator Drops'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {stats && renderStatsCard()}

        {activeDrop ? (
          renderActiveDropCard()
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎁</Text>
            <Text style={styles.emptyTitle}>
              {t('creatorDrops.noActiveDrop') || 'No Active Drop'}
            </Text>
            <Text style={styles.emptyText}>
              {t('creatorDrops.createFirstDrop') ||
                'Create limited-time bundles with exclusive perks'}
            </Text>
            <TouchableOpacity
              style={styles.createDropButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.createDropButtonText}>
                {t('creatorDrops.createDrop') || 'Create Drop'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {t('creatorDrops.howItWorks') || 'How Creator Drops Work'}
          </Text>
          <Text style={styles.infoText}>
            • {t('creatorDrops.info1') || 'Set price, seats, and duration'}
          </Text>
          <Text style={styles.infoText}>
            • {t('creatorDrops.info2') || 'Add up to 5 exclusive perks'}
          </Text>
          <Text style={styles.infoText}>
            • {t('creatorDrops.info3') || 'VIP subscribers get 5% off'}
          </Text>
          <Text style={styles.infoText}>
            • {t('creatorDrops.info4') || 'You earn 65% of all sales'}
          </Text>
          <Text style={styles.infoText}>
            • {t('creatorDrops.info5') || 'Max 1 active drop per creator'}
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {renderCreateModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    width: 40,
  },
  backButtonText: {
    color: '#D4AF37',
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  statsCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  statValueSecondary: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  activeDropCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  activeDropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  activeDropTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusActive: {
    backgroundColor: 'rgba(64, 224, 208, 0.2)',
  },
  pulseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#40E0D0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  dropInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  dropInfoItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
  },
  dropInfoLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  dropInfoValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  perksSection: {
    marginBottom: 20,
  },
  perksSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  perksList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  perkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  perkIcon: {
    fontSize: 16,
  },
  perkText: {
    fontSize: 12,
    color: '#fff',
  },
  earningsSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  earningsSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
  },
  earningsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  earningsItem: {
    flex: 1,
  },
  earningsLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  earningsValueSecondary: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#111',
    borderRadius: 18,
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  createDropButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 18,
  },
  createDropButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalClose: {
    fontSize: 28,
    color: '#888',
  },
  formSection: {
    padding: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  option: {
    flex: 1,
    minWidth: 80,
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: '#2a2a2a',
    borderColor: '#D4AF37',
  },
  optionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#888',
  },
  optionTextSelected: {
    color: '#D4AF37',
  },
  perksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  perkOption: {
    width: '31%',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  perkOptionSelected: {
    borderColor: '#40E0D0',
    backgroundColor: '#2a2a2a',
  },
  perkOptionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  perkOptionText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
  },
  perkOptionTextSelected: {
    color: '#40E0D0',
  },
  earningsPreview: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  earningsPreviewTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
  },
  earningsPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  earningsPreviewLabel: {
    fontSize: 13,
    color: '#888',
  },
  earningsPreviewValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  earningsPreviewValueSecondary: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  createButton: {
    backgroundColor: '#D4AF37',
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});
