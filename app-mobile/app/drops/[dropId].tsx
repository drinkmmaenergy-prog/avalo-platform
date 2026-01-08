/**
 * Drop Detail Screen
 * Shows drop details and allows purchase
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDrop, purchaseDrop, formatTimeRemaining, type DropPublicInfo } from '../../services/dropsService';
import { getTokenBalance } from '../../services/tokenService';

export default function DropDetailScreen() {
  const { dropId } = useLocalSearchParams<{ dropId: string }>();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [drop, setDrop] = useState<DropPublicInfo | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);

  useEffect(() => {
    loadDrop();
    loadBalance();
  }, [dropId]);

  const loadDrop = async () => {
    try {
      setLoading(true);
      const dropData = await getDrop(dropId as string);
      setDrop(dropData);
    } catch (error) {
      Alert.alert('Error', 'Failed to load drop');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = async () => {
    try {
      const balance = await getTokenBalance('current_user_id'); // Replace with actual user ID
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const handlePurchase = async () => {
    if (!drop) return;

    if (tokenBalance < drop.priceTokens) {
      Alert.alert(
        'Insufficient Tokens',
        `You need ${drop.priceTokens} tokens but only have ${tokenBalance}. Would you like to buy more?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/wallet' as any) },
        ]
      );
      return;
    }

    if (!drop.isAvailable) {
      Alert.alert('Unavailable', 'This drop is no longer available');
      return;
    }

    Alert.alert(
      'Confirm Purchase',
      `Purchase "${drop.title}" for ${drop.priceTokens} tokens?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy Now',
          onPress: async () => {
            try {
              setPurchasing(true);
              await purchaseDrop(dropId as string);
              Alert.alert(
                'Success!',
                'Drop purchased successfully! Check your owned drops.',
                [
                  { text: 'OK', onPress: () => router.push('/profile/drops' as any) },
                ]
              );
            } catch (error: any) {
              let message = 'Failed to purchase drop';
              if (error.message === 'INSUFFICIENT_TOKENS') {
                message = 'Insufficient tokens';
              } else if (error.message === 'SOLD_OUT') {
                message = 'This drop is sold out';
              } else if (error.message === 'DROP_ENDED') {
                message = 'This flash drop has ended';
              } else if (error.message === 'AGE_RESTRICTED') {
                message = 'This drop is 18+ only';
              }
              Alert.alert('Error', message);
              loadDrop(); // Refresh drop data
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00ff88" style={{ marginTop: 100 }} />
      </View>
    );
  }

  if (!drop) {
    return null;
  }

  const isAvailable = drop.isAvailable && 
    (drop.stockRemaining === null || drop.stockRemaining > 0) &&
    (drop.timeRemaining === null || drop.timeRemaining > 0);

  return (
    <View style={styles.container}>
      <ScrollView>
        <Image
          source={{ uri: drop.coverImageUrl }}
          style={styles.coverImage}
          resizeMode="cover"
        />

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{drop.title}</Text>
              <View style={styles.badges}>
                <View style={[styles.badge, getBadgeColor(drop.type)]}>
                  <Text style={styles.badgeText}>
                    {drop.type.replace('_DROP', '')}
                  </Text>
                </View>
                {drop.is18Plus && (
                  <View style={[styles.badge, styles.badge18]}>
                    <Text style={styles.badgeText}>18+</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.creatorInfo}>
            <Text style={styles.creatorLabel}>By</Text>
            <Text style={styles.creatorName}>{drop.creatorNames.join(', ')}</Text>
          </View>

          {drop.tags.length > 0 && (
            <View style={styles.tags}>
              {drop.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.description}>{drop.description}</Text>

          {drop.type === 'FLASH_DROP' && drop.timeRemaining !== null && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>⚡ Time Remaining</Text>
              <Text style={styles.infoValue}>
                {formatTimeRemaining(drop.timeRemaining)}
              </Text>
            </View>
          )}

          {drop.stockRemaining !== null && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Stock Available</Text>
              <Text style={[
                styles.infoValue,
                drop.stockRemaining <= 5 && styles.infoValueWarning,
              ]}>
                {drop.stockRemaining === 0 ? 'SOLD OUT' : `${drop.stockRemaining} left`}
              </Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Sales</Text>
            <Text style={styles.infoValue}>{drop.soldCount} sold</Text>
          </View>

          {drop.type === 'LOOTBOX_DROP' && drop.lootboxCategories && (
            <View style={styles.lootboxInfo}>
              <Text style={styles.lootboxTitle}>🎁 Lootbox Contents</Text>
              <Text style={styles.lootboxText}>
                Contains random items from categories:
              </Text>
              <View style={styles.categoriesList}>
                {drop.lootboxCategories.map((cat) => (
                  <View key={cat} style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{cat}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {drop.contentPreview && drop.contentPreview.length > 0 && (
            <View style={styles.contentPreview}>
              <Text style={styles.contentTitle}>📦 What's Included</Text>
              {drop.contentPreview.slice(0, 5).map((item, index) => (
                <View key={index} style={styles.contentItem}>
                  <Text style={styles.contentItemText}>• {item.title}</Text>
                </View>
              ))}
              {drop.contentPreview.length > 5 && (
                <Text style={styles.contentMore}>
                  +{drop.contentPreview.length - 5} more items
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.price}>{drop.priceTokens} 🪙</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.buyButton,
            (!isAvailable || purchasing) && styles.buyButtonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={!isAvailable || purchasing}
        >
          <Text style={styles.buyButtonText}>
            {purchasing
              ? 'Processing...'
              : !isAvailable
              ? 'Unavailable'
              : 'Buy Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getBadgeColor = (type: string) => {
  switch (type) {
    case 'STANDARD_DROP':
      return { backgroundColor: '#4a90e2' };
    case 'FLASH_DROP':
      return { backgroundColor: '#ff6b6b' };
    case 'LOOTBOX_DROP':
      return { backgroundColor: '#ffd700' };
    case 'COOP_DROP':
      return { backgroundColor: '#9b59b6' };
    default:
      return { backgroundColor: '#4a90e2' };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  coverImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#222',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  titleContainer: {
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badge18: {
    backgroundColor: '#ff4444',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  creatorLabel: {
    fontSize: 14,
    color: '#888',
    marginRight: 8,
  },
  creatorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ff88',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: '#222',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#00ff88',
  },
  description: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 24,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  infoValueWarning: {
    color: '#ff6b6b',
  },
  lootboxInfo: {
    backgroundColor: '#1a1a00',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  lootboxTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffd700',
    marginBottom: 8,
  },
  lootboxText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 12,
  },
  categoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#ffd700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  contentPreview: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  contentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  contentItem: {
    marginBottom: 8,
  },
  contentItemText: {
    fontSize: 14,
    color: '#ccc',
  },
  contentMore: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    gap: 16,
  },
  priceContainer: {
    justifyContent: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#888',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  buyButton: {
    flex: 1,
    backgroundColor: '#00ff88',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: '#333',
  },
  buyButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});