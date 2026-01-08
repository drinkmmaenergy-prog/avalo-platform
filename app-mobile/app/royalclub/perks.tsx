/**
 * PACK 144 - Royal Club Lifestyle Perks Gallery
 * Premium UI/UX enhancements and lifestyle features
 * 
 * CONSTRAINTS: No monetary value, no performance advantages
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";

interface Perk {
  rewardId: string;
  type: 'ui_skin' | 'profile_theme' | 'chat_sticker' | 'lifestyle_channel' | 'early_feature' | 'vip_concierge';
  name: string;
  description: string;
  imageUrl?: string;
  minLevel: string;
  isUnlocked: boolean;
  isActive?: boolean;
}

const PERK_TYPE_CONFIG = {
  ui_skin: { icon: 'color-palette', color: '#E91E63', label: 'UI Skin' },
  profile_theme: { icon: 'brush', color: '#9C27B0', label: 'Profile Theme' },
  chat_sticker: { icon: 'happy', color: '#FF9800', label: 'Chat Stickers' },
  lifestyle_channel: { icon: 'people', color: '#2196F3', label: 'Lifestyle Channel' },
  early_feature: { icon: 'flash', color: '#4CAF50', label: 'Early Access' },
  vip_concierge: { icon: 'headset', color: '#F44336', label: 'VIP Support' }
};

const LEVEL_COLORS = {
  RC1_BRONZE: '#CD7F32',
  RC2_SILVER: '#C0C0C0',
  RC3_GOLD: '#FFD700',
  RC4_DIAMOND: '#B9F2FF',
  RC5_ROYAL_ELITE: '#9B59B6'
};

export default function RoyalClubPerksScreen() {
  const router = useRouter();
  const [perks, setPerks] = useState<Perk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadPerks();
  }, []);

  const loadPerks = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/perks`,
        {
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPerks(data);
      }
    } catch (error) {
      console.error('Error loading perks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivatePerk = async (perk: Perk) => {
    if (!perk.isUnlocked) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/royalclub/perks/${perk.rewardId}/activate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        }
      );

      if (response.ok) {
        await loadPerks();
      }
    } catch (error) {
      console.error('Error activating perk:', error);
    }
  };

  const filteredPerks = selectedCategory
    ? perks.filter(p => p.type === selectedCategory)
    : perks;

  const unlockedCount = perks.filter(p => p.isUnlocked).length;
  const totalCount = perks.length;

  const renderPerkCard = (perk: Perk) => {
    const config = PERK_TYPE_CONFIG[perk.type];
    const levelColor = LEVEL_COLORS[perk.minLevel as keyof typeof LEVEL_COLORS];

    return (
      <TouchableOpacity
        key={perk.rewardId}
        style={[
          styles.perkCard,
          !perk.isUnlocked && styles.perkCardLocked
        ]}
        onPress={() => handleActivatePerk(perk)}
        disabled={!perk.isUnlocked}
      >
        {perk.imageUrl ? (
          <Image source={{ uri: perk.imageUrl }} style={styles.perkImage} />
        ) : (
          <View style={[styles.perkImagePlaceholder, { backgroundColor: config.color + '20' }]}>
            <Ionicons name={config.icon as any} size={48} color={config.color} />
          </View>
        )}

        <View style={styles.perkContent}>
          <View style={styles.perkHeader}>
            <View style={[styles.perkTypeTag, { backgroundColor: config.color + '20' }]}>
              <Text style={[styles.perkTypeText, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
            {perk.isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            )}
          </View>

          <Text style={[styles.perkName, !perk.isUnlocked && styles.perkNameLocked]}>
            {perk.name}
          </Text>
          <Text style={[styles.perkDescription, !perk.isUnlocked && styles.perkDescriptionLocked]}>
            {perk.description}
          </Text>

          <View style={styles.perkFooter}>
            {perk.isUnlocked ? (
              <View style={styles.unlockedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
                <Text style={styles.unlockedText}>Unlocked</Text>
              </View>
            ) : (
              <View style={styles.levelRequirement}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={styles.levelRequirementText}>
                  Requires {perk.minLevel.replace('RC', 'Level ').replace('_', ' ')} level
                </Text>
              </View>
            )}
          </View>
        </View>

        {!perk.isUnlocked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={32} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lifestyle Perks</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress Banner */}
      <View style={styles.progressBanner}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressValue}>{unlockedCount} / {totalCount}</Text>
          <Text style={styles.progressLabel}>Perks Unlocked</Text>
        </View>
        <View style={styles.progressCircle}>
          <Text style={styles.progressPercentage}>
            {Math.round((unlockedCount / totalCount) * 100)}%
          </Text>
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {Object.entries(PERK_TYPE_CONFIG).map(([type, config]) => (
          <TouchableOpacity
            key={type}
            style={[styles.categoryChip, selectedCategory === type && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(type)}
          >
            <Ionicons name={config.icon as any} size={16} color={selectedCategory === type ? '#FFFFFF' : config.color} />
            <Text style={[styles.categoryChipText, selectedCategory === type && styles.categoryChipTextActive]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scrollView}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading perks...</Text>
          </View>
        ) : filteredPerks.length > 0 ? (
          <View style={styles.perksGrid}>
            {filteredPerks.map(renderPerkCard)}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎁</Text>
            <Text style={styles.emptyTitle}>No Perks Available</Text>
            <Text style={styles.emptyText}>
              Continue your journey to unlock amazing perks!
            </Text>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Lifestyle Perks</Text>
          <View style={styles.infoItem}>
            <Ionicons name="sparkles" size={20} color="#9B59B6" />
            <Text style={styles.infoText}>
              Customize your Avalo experience with premium UI skins and themes
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
            <Text style={styles.infoText}>
              Perks are purely cosmetic and do not affect platform performance
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="gift" size={20} color="#F39C12" />
            <Text style={styles.infoText}>
              Unlock more perks by advancing through Royal Club levels
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50'
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 1
  },
  progressInfo: {
    flex: 1
  },
  progressValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 4
  },
  progressLabel: {
    fontSize: 14,
    color: '#7F8C8D'
  },
  progressCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#9B59B6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  categoryScroll: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 1
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    marginRight: 8
  },
  categoryChipActive: {
    backgroundColor: '#9B59B6'
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7F8C8D'
  },
  categoryChipTextActive: {
    color: '#FFFFFF'
  },
  scrollView: {
    flex: 1
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D'
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center'
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center'
  },
  perksGrid: {
    padding: 16,
    gap: 12
  },
  perkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  perkCardLocked: {
    opacity: 0.6
  },
  perkImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#ECF0F1'
  },
  perkImagePlaceholder: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
    alignItems: 'center'
  },
  perkContent: {
    padding: 16
  },
  perkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  perkTypeTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  perkTypeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  activeBadge: {
    backgroundColor: '#27AE60',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  perkName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 6
  },
  perkNameLocked: {
    color: '#95A5A6'
  },
  perkDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
    marginBottom: 12
  },
  perkDescriptionLocked: {
    color: '#BDC3C7'
  },
  perkFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1'
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  unlockedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#27AE60'
  },
  levelRequirement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  levelRequirementText: {
    fontSize: 12,
    color: '#95A5A6',
    fontWeight: '500'
  },
  lockOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    gap: 12
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18
  }
});
