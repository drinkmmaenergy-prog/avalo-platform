/**
 * User Owned Drops Screen
 * Shows all drops purchased by the user
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
import { getUserOwnedDrops, type DropPublicInfo } from "@/services/dropsService";

export default function UserOwnedDropsScreen() {
  const [drops, setDrops] = useState<DropPublicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOwnedDrops();
  }, []);

  const loadOwnedDrops = async () => {
    try {
      setLoading(true);
      const ownedDrops = await getUserOwnedDrops();
      setDrops(ownedDrops);
    } catch (error) {
      console.error('Error loading owned drops:', error);
      Alert.alert('Error', 'Failed to load your drops');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOwnedDrops();
    setRefreshing(false);
  };

  const renderDropCard = (drop: DropPublicInfo) => {
    return (
      <TouchableOpacity
        key={drop.dropId}
        style={styles.dropCard}
        onPress={() => {
          // In a full implementation, this would show the actual content
          Alert.alert(
            drop.title,
            'Content viewing feature would open here with your purchased items.',
            [{ text: 'OK' }]
          );
        }}
      >
        <Image
          source={{ uri: drop.coverImageUrl }}
          style={styles.dropImage}
          resizeMode="cover"
        />
        <View style={styles.dropContent}>
          <Text style={styles.dropTitle} numberOfLines={2}>
            {drop.title}
          </Text>
          <Text style={styles.dropCreator} numberOfLines={1}>
            by {drop.creatorNames.join(', ')}
          </Text>
          <View style={styles.dropFooter}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {drop.type.replace('_DROP', '')}
              </Text>
            </View>
            <Text style={styles.dropPrice}>{drop.priceTokens} 🪙</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Drops</Text>
        <View style={{ width: 60 }} />
      </View>

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
              Browse the marketplace to purchase drops!
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push('/drops' as any)}
            >
              <Text style={styles.browseButtonText}>Browse Marketplace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {drops.map(renderDropCard)}
          </View>
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
  backButton: {
    fontSize: 16,
    color: '#00ff88',
    width: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  dropsList: {
    flex: 1,
  },
  grid: {
    padding: 16,
    gap: 16,
  },
  dropCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  dropImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#222',
  },
  dropContent: {
    padding: 12,
  },
  dropTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  dropCreator: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  dropFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  dropPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ff88',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
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
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
