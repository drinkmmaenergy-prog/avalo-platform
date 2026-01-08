/**
 * Drops Marketplace - Browse Screen
 * Allows users to browse and purchase drops
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
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { listDrops, formatTimeRemaining, type DropPublicInfo } from "@/services/dropsService";

export default function DropsMarketplace() {
  const [drops, setDrops] = useState<DropPublicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP'>('all');

  useEffect(() => {
    loadDrops();
  }, [filter]);

  const loadDrops = async () => {
    try {
      setLoading(true);
      const filters = filter === 'all' ? {} : { type: filter };
      const dropsData = await listDrops({ ...filters, activeOnly: true });
      setDrops(dropsData);
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

  const renderDropCard = (drop: DropPublicInfo) => {
    const isLowStock = drop.stockRemaining !== null && drop.stockRemaining <= 5;
    const isFlash = drop.type === 'FLASH_DROP';

    return (
      <TouchableOpacity
        key={drop.dropId}
        style={styles.dropCard}
        onPress={() => router.push(`/drops/${drop.dropId}` as any)}
      >
        <Image
          source={{ uri: drop.coverImageUrl }}
          style={styles.dropImage}
          resizeMode="cover"
        />

        {isFlash && drop.timeRemaining && (
          <View style={styles.flashBadge}>
            <Text style={styles.flashBadgeText}>
              ⚡ {formatTimeRemaining(drop.timeRemaining)}
            </Text>
          </View>
        )}

        <View style={styles.dropContent}>
          <View style={styles.dropHeader}>
            <Text style={styles.dropTitle} numberOfLines={2}>
              {drop.title}
            </Text>
            <View style={styles.dropBadge}>
              <Text style={styles.dropBadgeText}>
                {drop.type.replace('_DROP', '')}
              </Text>
            </View>
          </View>

          <Text style={styles.dropCreator} numberOfLines={1}>
            by {drop.creatorNames.join(', ')}
          </Text>

          {drop.tags.length > 0 && (
            <View style={styles.tags}>
              {drop.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.dropFooter}>
            <Text style={styles.dropPrice}>{drop.priceTokens} 🪙</Text>
            <View style={styles.dropStats}>
              {drop.stockRemaining !== null && (
                <Text
                  style={[
                    styles.dropStock,
                    isLowStock && styles.dropStockLow,
                  ]}
                >
                  {drop.stockRemaining === 0
                    ? 'SOLD OUT'
                    : `${drop.stockRemaining} left`}
                </Text>
              )}
              <Text style={styles.dropSold}>{drop.soldCount} sold</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Drops Marketplace</Text>
        <TouchableOpacity onPress={() => router.push('/profile/drops' as any)}>
          <Text style={styles.myDropsButton}>My Drops</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'STANDARD_DROP' && styles.filterButtonActive]}
          onPress={() => setFilter('STANDARD_DROP')}
        >
          <Text style={[styles.filterButtonText, filter === 'STANDARD_DROP' && styles.filterButtonTextActive]}>
            Standard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'FLASH_DROP' && styles.filterButtonActive]}
          onPress={() => setFilter('FLASH_DROP')}
        >
          <Text style={[styles.filterButtonText, filter === 'FLASH_DROP' && styles.filterButtonTextActive]}>
            ⚡ Flash
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'LOOTBOX_DROP' && styles.filterButtonActive]}
          onPress={() => setFilter('LOOTBOX_DROP')}
        >
          <Text style={[styles.filterButtonText, filter === 'LOOTBOX_DROP' && styles.filterButtonTextActive]}>
            🎁 Lootbox
          </Text>
        </TouchableOpacity>
      </ScrollView>

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
            <Text style={styles.emptyText}>No drops available</Text>
            <Text style={styles.emptySubtext}>
              Check back later for new drops!
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
  myDropsButton: {
    fontSize: 14,
    color: '#00ff88',
    fontWeight: '600',
  },
  filterScroll: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#000',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  filterButtonActive: {
    backgroundColor: '#00ff88',
    borderColor: '#00ff88',
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#000',
  },
  dropsList: {
    flex: 1,
    padding: 16,
  },
  dropCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  dropImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#222',
  },
  flashBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  flashBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dropContent: {
    padding: 16,
  },
  dropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dropTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  dropBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  dropBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  dropCreator: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#222',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#00ff88',
  },
  dropFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  dropStats: {
    alignItems: 'flex-end',
  },
  dropStock: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  dropStockLow: {
    color: '#ff6b6b',
  },
  dropSold: {
    fontSize: 12,
    color: '#666',
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
});
