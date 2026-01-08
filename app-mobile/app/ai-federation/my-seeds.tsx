import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AiSeed } from "@/types/pack189-ai-federation.types";

export default function MySeeds() {
  const router = useRouter();
  const { user } = useAuth();
  const [seeds, setSeeds] = useState<AiSeed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSeeds();
  }, [user]);

  const loadSeeds = async () => {
    if (!user) return;

    try {
      const seedsQuery = query(
        collection(db, 'ai_seeds'),
        where('ownerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(seedsQuery);
      const loadedSeeds: AiSeed[] = [];

      snapshot.forEach((doc) => {
        loadedSeeds.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          metadata: {
            ...doc.data().metadata,
            lastActiveAt: doc.data().metadata?.lastActiveAt?.toDate(),
          },
        } as AiSeed);
      });

      setSeeds(loadedSeeds);
    } catch (error) {
      Alert.alert('Error', 'Failed to load AI Seeds');
    } finally {
      setLoading(false);
    }
  };

  const renderSeedCard = ({ item }: { item: AiSeed }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/ai-federation/seed-details?id=${item.id}` as any)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, item.isPublished && styles.statusBadgePublished]}>
          <Text style={styles.statusBadgeText}>
            {item.isPublished ? 'Published' : 'Private'}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>Archetype: {item.personality.archetype}</Text>
        <Text style={styles.cardMeta}>Version: {item.version}</Text>
      </View>
      <View style={styles.cardStats}>
        <Text style={styles.cardStat}>
          {item.metadata.totalInteractions} interactions
        </Text>
        <Text style={styles.cardStat}>
          {item.metadata.totalExports} exports
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6c5ce7" />
        <Text style={styles.loadingText}>Loading your AI Seeds...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My AI Seeds</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/ai-federation/seed-builder' as any)}
        >
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      {seeds.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No AI Seeds Yet</Text>
          <Text style={styles.emptyStateText}>
            Create your first AI character to get started
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => router.push('/ai-federation/seed-builder' as any)}
          >
            <Text style={styles.emptyStateButtonText}>Create AI Seed</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={seeds}
          renderItem={renderSeedCard}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusBadgePublished: {
    backgroundColor: '#00b894',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 12,
    color: '#666',
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cardStat: {
    fontSize: 12,
    color: '#6c5ce7',
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
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
