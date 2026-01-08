import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AiSeedMarketplaceListing } from "@/types/pack189-ai-federation.types";

export default function Marketplace() {
  const router = useRouter();
  const { user } = useAuth();
  const [listings, setListings] = useState<AiSeedMarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'featured' | 'popular'>('all');

  useEffect(() => {
    loadListings();
  }, [filter]);

  const loadListings = async () => {
    try {
      let listingsQuery = query(
        collection(db, 'ai_seed_marketplace'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      if (filter === 'featured') {
        listingsQuery = query(
          collection(db, 'ai_seed_marketplace'),
          where('status', '==', 'active'),
          where('featured', '==', true),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
      } else if (filter === 'popular') {
        listingsQuery = query(
          collection(db, 'ai_seed_marketplace'),
          where('status', '==', 'active'),
          orderBy('salesCount', 'desc'),
          limit(20)
        );
      }

      const snapshot = await getDocs(listingsQuery);
      const loadedListings: AiSeedMarketplaceListing[] = [];

      snapshot.forEach((doc) => {
        loadedListings.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
        } as AiSeedMarketplaceListing);
      });

      setListings(loadedListings);
    } catch (error) {
      Alert.alert('Error', 'Failed to load marketplace listings');
    } finally {
      setLoading(false);
    }
  };

  const filteredListings = listings.filter((listing) =>
    listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderListingCard = ({ item }: { item: AiSeedMarketplaceListing }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/ai-federation/listing-details?id=${item.id}` as any)}
    >
      {item.featured && (
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>Featured</Text>
        </View>
      )}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardPrice}>${(item.price / 100).toFixed(2)}</Text>
      </View>
      <Text style={styles.cardDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.cardTags}>
        {item.tags.slice(0, 3).map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatLabel}>Sales:</Text>
          <Text style={styles.cardStatValue}>{item.salesCount}</Text>
        </View>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatLabel}>Rating:</Text>
          <Text style={styles.cardStatValue}>
            {item.rating > 0 ? `${item.rating.toFixed(1)} ⭐` : 'New'}
          </Text>
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {item.type === 'one_time' ? 'One-time' : item.type === 'subscription' ? 'Subscription' : 'Chapter'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6c5ce7" />
        <Text style={styles.loadingText}>Loading marketplace...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Seed Marketplace</Text>
        <Text style={styles.subtitle}>Discover and license AI characters</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search AI Seeds..."
          placeholderTextColor="#666"
        />
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'featured' && styles.filterButtonActive]}
          onPress={() => setFilter('featured')}
        >
          <Text style={[styles.filterButtonText, filter === 'featured' && styles.filterButtonTextActive]}>
            Featured
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'popular' && styles.filterButtonActive]}
          onPress={() => setFilter('popular')}
        >
          <Text style={[styles.filterButtonText, filter === 'popular' && styles.filterButtonTextActive]}>
            Popular
          </Text>
        </TouchableOpacity>
      </View>

      {filteredListings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No listings found</Text>
          <Text style={styles.emptyStateText}>Try adjusting your search or filters</Text>
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          renderItem={renderListingCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 0,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  filterButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: '#6c5ce7',
    borderColor: '#6c5ce7',
  },
  filterButtonText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
    marginTop: 16,
  },
  list: {
    padding: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#f39c12',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 1,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingRight: 80,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00b894',
  },
  cardDescription: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  tag: {
    backgroundColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStatLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  cardStatValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: '#6c5ce7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
