/**
 * Creator Drops Dashboard
 * Lists all drops created by the creator with stats and management options
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { getCreatorDrops, disableDrop, type Drop } from "@/services/dropsService";

export default function CreatorDropsDashboard() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDrops();
  }, []);

  const loadDrops = async () => {
    try {
      setLoading(true);
      const creatorDrops = await getCreatorDrops();
      setDrops(creatorDrops);
    } catch (error) {
      console.error('Error loading drops:', error);
      Alert.alert('Error', 'Failed to load drops');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDrops();
    setRefreshing(false);
  };

  const handleDisableDrop = async (dropId: string, title: string) => {
    Alert.alert(
      'Disable Drop',
      `Are you sure you want to disable "${title}"? This will prevent new purchases.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            try {
              await disableDrop(dropId);
              Alert.alert('Success', 'Drop disabled successfully');
              loadDrops();
            } catch (error) {
              Alert.alert('Error', 'Failed to disable drop');
            }
          },
        },
      ]
    );
  };

  const renderDropCard = (drop: Drop) => {
    const stockText = drop.maxQuantity
      ? `${drop.soldCount}/${drop.maxQuantity} sold`
      : `${drop.soldCount} sold`;

    const revenue = drop.totalRevenue || 0;

    let timeStatus = '';
    if (drop.type === 'FLASH_DROP' && drop.endAt) {
      const timeRemaining = new Date(drop.endAt).getTime() - Date.now();
      if (timeRemaining > 0) {
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        timeStatus = days > 0 ? `${days}d left` : `${hours}h left`;
      } else {
        timeStatus = 'Ended';
      }
    }

    return (
      <TouchableOpacity
        key={drop.dropId}
        style={[
          styles.dropCard,
          !drop.isActive && styles.dropCardInactive,
        ]}
        onPress={() => router.push(`/creator/drops/${drop.dropId}`)}
      >
        <View style={styles.dropHeader}>
          <View style={styles.dropTitleContainer}>
            <Text style={styles.dropTitle} numberOfLines={1}>
              {drop.title}
            </Text>
            <View style={styles.badges}>
              <View style={[styles.badge, getBadgeColor(drop.type)]}>
                <Text style={styles.badgeText}>
                  {drop.type.replace('_DROP', '')}
                </Text>
              </View>
              {!drop.isActive && (
                <View style={[styles.badge, styles.badgeInactive]}>
                  <Text style={styles.badgeText}>INACTIVE</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.dropPrice}>{drop.priceTokens}🪙</Text>
        </View>

        <View style={styles.dropStats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Stock</Text>
            <Text style={styles.statValue}>{stockText}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Revenue</Text>
            <Text style={styles.statValue}>{revenue}🪙</Text>
          </View>
          {timeStatus && (
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{timeStatus}</Text>
            </View>
          )}
        </View>

        <View style={styles.dropActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/creator/drops/${drop.dropId}`)}
          >
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          {drop.isActive && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDanger]}
              onPress={() => handleDisableDrop(drop.dropId, drop.title)}
            >
              <Text style={styles.actionButtonText}>Disable</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'STANDARD_DROP':
        return styles.badgeStandard;
      case 'FLASH_DROP':
        return styles.badgeFlash;
      case 'LOOTBOX_DROP':
        return styles.badgeLootbox;
      case 'COOP_DROP':
        return styles.badgeCoop;
      default:
        return styles.badgeStandard;
    }
  };

  const totalRevenue = drops.reduce((sum, drop) => sum + (drop.totalRevenue || 0), 0);
  const totalSales = drops.reduce((sum, drop) => sum + drop.soldCount, 0);
  const activeDrops = drops.filter(d => d.isActive).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Drops</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/creator/drops/new')}
        >
          <Text style={styles.createButtonText}>+ Create Drop</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCards}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{activeDrops}</Text>
          <Text style={styles.summaryLabel}>Active Drops</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalSales}</Text>
          <Text style={styles.summaryLabel}>Total Sales</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalRevenue}🪙</Text>
          <Text style={styles.summaryLabel}>Revenue</Text>
        </View>
      </View>

      {/* Creator Academy CTA */}
      <TouchableOpacity
        style={styles.academyCta}
        onPress={() => router.push('/creator/academy' as any)}
      >
        <Text style={styles.academyCtaIcon}>🎓</Text>
        <View style={styles.academyCtaContent}>
          <Text style={styles.academyCtaTitle}>
            Learn How to Maximize Earnings
          </Text>
          <Text style={styles.academyCtaSubtitle}>Creator Academy →</Text>
        </View>
      </TouchableOpacity>

      <ScrollView
        style={styles.dropsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && drops.length === 0 ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : drops.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No drops yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first drop to start earning!
            </Text>
          </View>
        ) : (
          drops.map(renderDropCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#111',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#000',
    fontWeight: '600',
  },
  summaryCards: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  dropsList: {
    flex: 1,
    padding: 16,
  },
  dropCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dropCardInactive: {
    opacity: 0.6,
  },
  dropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dropTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  dropTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeStandard: {
    backgroundColor: '#4a90e2',
  },
  badgeFlash: {
    backgroundColor: '#ff6b6b',
  },
  badgeLootbox: {
    backgroundColor: '#ffd700',
  },
  badgeCoop: {
    backgroundColor: '#9b59b6',
  },
  badgeInactive: {
    backgroundColor: '#555',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  dropPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  dropStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dropActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonDanger: {
    backgroundColor: '#ff4444',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  academyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2A2A',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  academyCtaIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  academyCtaContent: {
    flex: 1,
  },
  academyCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  academyCtaSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
});
