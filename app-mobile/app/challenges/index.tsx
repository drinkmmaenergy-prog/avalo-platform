/**
 * PACK 137: Challenges Browse Screen
 * Browse and discover active challenges
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  listChallenges,
  ChallengeCategory,
  Challenge,
  formatCategory,
  formatDuration,
  getCategoryColor,
  getCategoryIcon,
  getDaysRemaining,
} from "@/services/challengesService";

export default function ChallengesScreen() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ChallengeCategory | null>(null);

  useEffect(() => {
    loadChallenges();
  }, [selectedCategory]);

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const data = await listChallenges({
        category: selectedCategory || undefined,
        limit: 50,
      });
      setChallenges(data);
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChallenges();
    setRefreshing(false);
  };

  const categories = Object.values(ChallengeCategory);

  const renderCategoryFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      contentContainerStyle={styles.categoryScrollContent}
    >
      <TouchableOpacity
        style={[
          styles.categoryChip,
          !selectedCategory && styles.categoryChipActive,
        ]}
        onPress={() => setSelectedCategory(null)}
      >
        <Text
          style={[
            styles.categoryChipText,
            !selectedCategory && styles.categoryChipTextActive,
          ]}
        >
          All
        </Text>
      </TouchableOpacity>
      {categories.map((category) => (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryChip,
            selectedCategory === category && styles.categoryChipActive,
            selectedCategory === category && {
              backgroundColor: getCategoryColor(category),
            },
          ]}
          onPress={() => setSelectedCategory(category)}
        >
          <Text style={styles.categoryIcon}>{getCategoryIcon(category)}</Text>
          <Text
            style={[
              styles.categoryChipText,
              selectedCategory === category && styles.categoryChipTextActive,
            ]}
          >
            {formatCategory(category)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderChallengeCard = ({ item }: { item: Challenge }) => {
    const daysRemaining = getDaysRemaining(item.endDate.toDate());
    const isFull = item.maxParticipants && item.currentParticipants >= item.maxParticipants;

    return (
      <TouchableOpacity
        style={styles.challengeCard}
        onPress={() => router.push(`/challenges/${item.challengeId}`)}
      >
        <View style={styles.challengeHeader}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: getCategoryColor(item.category) },
            ]}
          >
            <Text style={styles.categoryBadgeText}>
              {getCategoryIcon(item.category)} {formatCategory(item.category)}
            </Text>
          </View>
          {item.isPaid && (
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText}>💎 {item.entryTokens}</Text>
            </View>
          )}
        </View>

        <Text style={styles.challengeTitle}>{item.title}</Text>
        <Text style={styles.challengeDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.challengeStats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Duration</Text>
            <Text style={styles.statValue}>{formatDuration(item.duration)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Participants</Text>
            <Text style={styles.statValue}>
              {item.currentParticipants}
              {item.maxParticipants ? `/${item.maxParticipants}` : ''}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Days Left</Text>
            <Text style={styles.statValue}>{daysRemaining}d</Text>
          </View>
        </View>

        {isFull && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>🔒 Challenge Full</Text>
          </View>
        )}

        <View style={styles.taskPreview}>
          <Text style={styles.taskPreviewLabel}>Daily Task:</Text>
          <Text style={styles.taskPreviewText} numberOfLines={1}>
            {item.taskTitle}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading challenges...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Challenges</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/challenges/create')}
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>🎯</Text>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>Join Skill-Based Challenges</Text>
          <Text style={styles.infoText}>
            Compete on consistency, not appearance. Rankings based 100% on completion rate.
          </Text>
        </View>
      </View>

      {renderCategoryFilter()}

      <FlatList
        data={challenges}
        renderItem={renderChallengeCard}
        keyExtractor={(item) => item.challengeId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>No Challenges Yet</Text>
            <Text style={styles.emptyText}>
              Be the first to create a challenge in this category!
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.myChallengesButton}
        onPress={() => router.push('/challenges/my-challenges')}
      >
        <Text style={styles.myChallengesButtonText}>📊 My Challenges</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#1976D2',
    lineHeight: 18,
  },
  categoryScroll: {
    maxHeight: 60,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 16,
  },
  challengeCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  priceBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  challengeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  challengeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  challengeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  fullBadge: {
    backgroundColor: '#FFE5E5',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  fullBadgeText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '600',
  },
  taskPreview: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
  },
  taskPreviewLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  taskPreviewText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  myChallengesButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  myChallengesButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
