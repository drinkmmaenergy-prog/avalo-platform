/**
 * PACK 141 - AI Companions Home Screen
 * Browse and select AI companions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface AICompanion {
  companionId: string;
  name: string;
  category: string;
  description: string;
  avatarUrl: string;
  capabilities: string[];
}

export default function AICompanionsHomeScreen() {
  const [companions, setCompanions] = useState<AICompanion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'ALL', label: 'All' },
    { id: 'PRODUCTIVITY', label: 'Productivity' },
    { id: 'FITNESS_WELLNESS', label: 'Fitness' },
    { id: 'LANGUAGE_LEARNING', label: 'Languages' },
    { id: 'ENTERTAINMENT', label: 'Entertainment' },
    { id: 'CREATIVITY', label: 'Creativity' },
  ];

  useEffect(() => {
    loadCompanions();
  }, [selectedCategory]);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const getCompanions = httpsCallable(functions, 'getAICompanions');
      const result = await getCompanions({
        category: selectedCategory === 'ALL' ? undefined : selectedCategory,
      });
      
      const data = result.data as { companions: AICompanion[] };
      setCompanions(data.companions);
    } catch (error) {
      console.error('Error loading companions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCompanions();
  };

  const renderCompanion = ({ item }: { item: AICompanion }) => (
    <TouchableOpacity
      style={styles.companionCard}
      onPress={() => router.push(`/ai-companions/${item.companionId}` as any)}
    >
      <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
      <View style={styles.companionInfo}>
        <Text style={styles.companionName}>{item.name}</Text>
        <Text style={styles.companionCategory}>{item.category.replace('_', ' ')}</Text>
        <Text style={styles.companionDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.capabilitiesContainer}>
          {item.capabilities.slice(0, 3).map((cap, index) => (
            <Text key={index} style={styles.capability}>• {cap}</Text>
          ))}
        </View>
      </View>
      <Text style={styles.chatButton}>Chat →</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Companions</Text>
        <Text style={styles.subtitle}>Safe, helpful AI assistants for your goals</Text>
      </View>

      {/* Safety Notice */}
      <View style={styles.safetyNotice}>
        <Text style={styles.safetyText}>
          ✓ Zero romance • Zero NSFW • 100% focused on helping you succeed
        </Text>
      </View>

      {/* Category Filter */}
      <FlatList
        horizontal
        data={categories}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === item.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(item.id)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === item.id && styles.categoryTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Companions List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={companions}
          keyExtractor={(item) => item.companionId}
          renderItem={renderCompanion}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No AI companions found</Text>
            </View>
          }
        />
      )}

      {/* Pricing Info */}
      <TouchableOpacity
        style={styles.pricingButton}
        onPress={() => router.push('/ai-companions/pricing' as any)}
      >
        <Text style={styles.pricingButtonText}>View Pricing</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  safetyNotice: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 8,
  },
  safetyText: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
  },
  categoryList: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 50,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryText: {
    fontSize: 14,
    color: '#666666',
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  companionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0E0E0',
  },
  companionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  companionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  companionCategory: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  companionDescription: {
    fontSize: 13,
    color: '#333333',
    marginTop: 4,
  },
  capabilitiesContainer: {
    marginTop: 6,
  },
  capability: {
    fontSize: 11,
    color: '#666666',
  },
  chatButton: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999999',
  },
  pricingButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pricingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
