/**
 * PACK 151 - Sponsorship Marketplace Screen
 * Browse and discover ethical brand sponsorship opportunities
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { SponsorshipOffer, SponsorshipDealType } from "@/lib/sponsorships/types";
import {
  getDealTypeLabel,
  formatCurrency,
  getDealTypeColor,
  getStatusColor,
  isOfferExpired
} from "@/lib/sponsorships/sdk";

export default function SponsorshipMarketplace() {
  const router = useRouter();
  const { user } = useAuth();
  const [offers, setOffers] = useState<SponsorshipOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<SponsorshipDealType | 'all'>('all');

  useEffect(() => {
    loadOffers();
  }, [filterType]);

  const loadOffers = async () => {
    try {
      setLoading(true);
      
      let q = query(
        collection(db, 'sponsorship_offers'),
        where('status', '==', 'open'),
        where('metadata.isActive', '==', true),
        orderBy('metadata.createdAt', 'desc')
      );

      if (filterType !== 'all') {
        q = query(q, where('dealType', '==', filterType));
      }

      const snapshot = await getDocs(q);
      const offersData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          metadata: {
            ...data.metadata,
            createdAt: data.metadata.createdAt instanceof Timestamp 
              ? data.metadata.createdAt.toDate() 
              : new Date(data.metadata.createdAt),
            updatedAt: data.metadata.updatedAt instanceof Timestamp 
              ? data.metadata.updatedAt.toDate() 
              : new Date(data.metadata.updatedAt),
            expiresAt: data.metadata.expiresAt 
              ? (data.metadata.expiresAt instanceof Timestamp 
                ? data.metadata.expiresAt.toDate() 
                : new Date(data.metadata.expiresAt))
              : undefined
          }
        } as SponsorshipOffer;
      });

      const activeOffers = offersData.filter(offer => !isOfferExpired(offer.metadata.expiresAt));
      setOffers(activeOffers);
    } catch (error) {
      console.error('Error loading sponsorship offers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadOffers();
  };

  const filteredOffers = offers.filter(offer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      offer.title.toLowerCase().includes(query) ||
      offer.description.toLowerCase().includes(query) ||
      offer.brandName.toLowerCase().includes(query)
    );
  });

  const renderOffer = ({ item }: { item: SponsorshipOffer }) => (
    <TouchableOpacity
      style={styles.offerCard}
      onPress={() => router.push(`/sponsorships/${item.id}` as any)}
    >
      <View style={styles.offerHeader}>
        {item.brandLogo && (
          <Image source={{ uri: item.brandLogo }} style={styles.brandLogo} />
        )}
        <View style={styles.offerHeaderText}>
          <Text style={styles.brandName}>{item.brandName}</Text>
          <View style={[styles.dealTypeBadge, { backgroundColor: getDealTypeColor(item.dealType) }]}>
            <Text style={styles.dealTypeText}>{getDealTypeLabel(item.dealType)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.offerTitle}>{item.title}</Text>
      <Text style={styles.offerDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.offerDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Compensation:</Text>
          <Text style={styles.detailValue}>
            {item.compensation.useTokens ? '🪙 ' : ''}
            {formatCurrency(item.compensation.amount, item.compensation.currency)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Deliverables:</Text>
          <Text style={styles.detailValue}>{item.requirements.deliverableCount}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Spots:</Text>
          <Text style={styles.detailValue}>
            {item.currentCreators}/{item.maxCreators}
          </Text>
        </View>
      </View>

      {item.metadata.expiresAt && (
        <Text style={styles.expiresText}>
          Expires: {new Date(item.metadata.expiresAt).toLocaleDateString()}
        </Text>
      )}
    </TouchableOpacity>
  );

  const dealTypes: Array<{ value: SponsorshipDealType | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'product_placement', label: 'Product' },
    { value: 'branded_content', label: 'Content' },
    { value: 'challenge_sponsorship', label: 'Challenge' },
    { value: 'event_sponsorship', label: 'Event' },
    { value: 'curriculum_sponsorship', label: 'Education' }
  ];

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading sponsorships...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sponsorship Marketplace</Text>
        <Text style={styles.headerSubtitle}>Ethical brand collaborations</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search sponsorships..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholderTextColor="#9CA3AF"
      />

      <View style={styles.filterContainer}>
        {dealTypes.map(type => (
          <TouchableOpacity
            key={type.value}
            style={[
              styles.filterButton,
              filterType === type.value && styles.filterButtonActive
            ]}
            onPress={() => setFilterType(type.value)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filterType === type.value && styles.filterButtonTextActive
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredOffers}
        keyExtractor={item => item.id}
        renderItem={renderOffer}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No active sponsorships found</Text>
            <Text style={styles.emptySubtext}>
              Check back later for new opportunities
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280'
  },
  header: {
    padding: 20,
    backgroundColor: '#8B5CF6',
    paddingTop: 60
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E9D5FF'
  },
  searchInput: {
    margin: 16,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  filterButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6'
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600'
  },
  filterButtonTextActive: {
    color: '#FFFFFF'
  },
  listContainer: {
    padding: 16
  },
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  brandLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12
  },
  offerHeaderText: {
    flex: 1
  },
  brandName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  dealTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  dealTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8
  },
  offerDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20
  },
  offerDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB'
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280'
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827'
  },
  expiresText: {
    marginTop: 8,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF'
  }
});
