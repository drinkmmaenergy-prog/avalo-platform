/**
 * PACK 188 - AI Narrative & Fantasy Engine
 * Story Mode Home Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface StoryArc {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedDuration: number;
  chaptersCount: number;
  popularityScore: number;
  characterId: string;
  tags: string[];
}

const CATEGORY_ICONS = {
  romance: '❤️',
  adventure: '⚔️',
  fantasy: '🔮',
  mystery: '🔍',
  slice_of_life: '☕',
  comedy: '😄',
  workplace: '💼'
};

const CATEGORY_COLORS = {
  romance: '#FF6B9D',
  adventure: '#FF8C42',
  fantasy: '#9B59B6',
  mystery: '#34495E',
  slice_of_life: '#3498DB',
  comedy: '#F39C12',
  workplace: '#27AE60'
};

export default function StoryModeHome() {
  const router = useRouter();
  const [storyArcs, setStoryArcs] = useState<StoryArc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadStoryArcs();
  }, [selectedCategory]);

  const loadStoryArcs = async () => {
    try {
      setLoading(true);
      const listStoryArcsFunc = httpsCallable(functions, 'listStoryArcs');
      const result = await listStoryArcsFunc({
        category: selectedCategory,
        limit: 20
      });

      const data = result.data as any;
      if (data.success) {
        setStoryArcs(data.arcs);
      }
    } catch (error) {
      console.error('Error loading story arcs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadStoryArcs();
  };

  const startStory = async (arcId: string) => {
    try {
      router.push(`/ai-story/arc/${arcId}` as any);
    } catch (error) {
      console.error('Error starting story:', error);
    }
  };

  const renderCategoryFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      contentContainerStyle={styles.categoryContainer}
    >
      <TouchableOpacity
        style={[
          styles.categoryChip,
          !selectedCategory && styles.categoryChipActive
        ]}
        onPress={() => setSelectedCategory(null)}
      >
        <Text style={[
          styles.categoryText,
          !selectedCategory && styles.categoryTextActive
        ]}>
          All Stories
        </Text>
      </TouchableOpacity>

      {Object.entries(CATEGORY_ICONS).map(([category, icon]) => (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryChip,
            selectedCategory === category && styles.categoryChipActive,
            { borderColor: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] }
          ]}
          onPress={() => setSelectedCategory(category)}
        >
          <Text style={styles.categoryEmoji}>{icon}</Text>
          <Text style={[
            styles.categoryText,
            selectedCategory === category && styles.categoryTextActive
          ]}>
            {category.replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderStoryCard = (arc: StoryArc) => (
    <TouchableOpacity
      key={arc.id}
      style={styles.storyCard}
      onPress={() => startStory(arc.id)}
    >
      <View style={[
        styles.categoryBadge,
        { backgroundColor: CATEGORY_COLORS[arc.category as keyof typeof CATEGORY_COLORS] }
      ]}>
        <Text style={styles.categoryBadgeText}>
          {CATEGORY_ICONS[arc.category as keyof typeof CATEGORY_ICONS]} {arc.category}
        </Text>
      </View>

      <Text style={styles.storyTitle}>{arc.title}</Text>
      <Text style={styles.storyDescription} numberOfLines={3}>
        {arc.description}
      </Text>

      <View style={styles.storyMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="book-outline" size={16} color="#666" />
          <Text style={styles.metaText}>{arc.chaptersCount} chapters</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.metaText}>{arc.estimatedDuration} min</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="trending-up-outline" size={16} color="#666" />
          <Text style={styles.metaText}>{arc.difficulty}</Text>
        </View>
      </View>

      <View style={styles.tagsContainer}>
        {arc.tags.slice(0, 3).map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.startButton}>
        <Text style={styles.startButtonText}>Begin Story</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Story Mode</Text>
        <TouchableOpacity onPress={() => router.push('/ai-story/lore-journal' as any)}>
          <Ionicons name="book" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🎭 Interactive Stories</Text>
        <Text style={styles.bannerSubtitle}>
          Immersive roleplay adventures with your AI companions
        </Text>
      </View>

      {renderCategoryFilter()}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.loadingText}>Loading stories...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {storyArcs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={64} color="#CCC" />
              <Text style={styles.emptyText}>No stories available</Text>
              <Text style={styles.emptySubtext}>
                Try selecting a different category
              </Text>
            </View>
          ) : (
            storyArcs.map(renderStoryCard)
          )}

          <View style={styles.safetyNotice}>
            <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
            <Text style={styles.safetyText}>
              All stories are SFW and designed for healthy escapism
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  banner: {
    backgroundColor: '#9B59B6',
    padding: 20,
    alignItems: 'center'
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8
  },
  bannerSubtitle: {
    fontSize: 14,
    color: '#FFF',
    opacity: 0.9,
    textAlign: 'center'
  },
  categoryScroll: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  categoryContainer: {
    paddingHorizontal: 15,
    paddingVertical: 12
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF'
  },
  categoryChipActive: {
    backgroundColor: '#9B59B6',
    borderColor: '#9B59B6'
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 6
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize'
  },
  categoryTextActive: {
    color: '#FFF',
    fontWeight: '600'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    padding: 16
  },
  storyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12
  },
  categoryBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  storyDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12
  },
  storyMeta: {
    flexDirection: 'row',
    marginBottom: 12
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12
  },
  tag: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4
  },
  tagText: {
    fontSize: 11,
    color: '#666'
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: '#9B59B6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8
  },
  safetyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
    backgroundColor: '#E8F5E9',
    borderRadius: 8
  },
  safetyText: {
    fontSize: 12,
    color: '#27AE60',
    marginLeft: 8,
    flex: 1
  }
});
