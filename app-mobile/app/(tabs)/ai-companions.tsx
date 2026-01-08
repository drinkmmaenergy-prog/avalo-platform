/**
 * PACK 185 - AI Companions Gallery
 * 
 * Browse and discover AI companions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { aiCharacters, AICharacter, getPersonalityEmoji } from "@/lib/aiCharacters";
import { getAuth } from 'firebase/auth';

export default function AICompanionsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'personality' | 'interests'>('all');

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      const allCharacters = await aiCharacters.getAllCharacters(50);
      setCharacters(allCharacters);
    } catch (error) {
      console.error('Error loading characters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCharacters();
    setRefreshing(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadCharacters();
      return;
    }

    try {
      setLoading(true);
      let results: AICharacter[] = [];

      if (filterCategory === 'personality') {
        results = await aiCharacters.searchByPersonality(searchQuery.toLowerCase(), 20);
      } else if (filterCategory === 'interests') {
        results = await aiCharacters.searchByInterest(searchQuery.toLowerCase(), 20);
      } else {
        results = await aiCharacters.searchByTag(searchQuery.toLowerCase(), 20);
      }

      setCharacters(results);
    } catch (error) {
      console.error('Error searching characters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterPress = (characterId: string) => {
    router.push(`/ai-companion/${characterId}`);
  };

  const handleCreateCharacter = () => {
    router.push('/ai-companion/create');
  };

  if (loading && characters.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Loading AI companions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Companions</Text>
        <Text style={styles.subtitle}>Discover your perfect match</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, personality, or interests..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Categories */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filterCategory === 'all' && styles.filterButtonActive]}
          onPress={() => setFilterCategory('all')}
        >
          <Text style={[styles.filterButtonText, filterCategory === 'all' && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterCategory === 'personality' && styles.filterButtonActive]}
          onPress={() => setFilterCategory('personality')}
        >
          <Text style={[styles.filterButtonText, filterCategory === 'personality' && styles.filterButtonTextActive]}>
            Personality
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterCategory === 'interests' && styles.filterButtonActive]}
          onPress={() => setFilterCategory('interests')}
        >
          <Text style={[styles.filterButtonText, filterCategory === 'interests' && styles.filterButtonTextActive]}>
            Interests
          </Text>
        </TouchableOpacity>
      </View>

      {/* Character Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C3AED" />
        }
      >
        {characters.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No AI companions found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {characters.map((character) => (
              <CharacterCard
                key={character.characterId}
                character={character}
                onPress={() => handleCharacterPress(character.characterId)}
              />
            ))}
          </View>
        )}

        {/* Create Custom Character Button */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreateCharacter}>
          <Text style={styles.createButtonText}>✨ Create Custom Companion</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

interface CharacterCardProps {
  character: AICharacter;
  onPress: () => void;
}

function CharacterCard({ character, onPress }: CharacterCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {/* Character Image Placeholder */}
      <View style={styles.cardImage}>
        <Text style={styles.cardImagePlaceholder}>
          {getPersonalityEmoji(character.personalityStyle)}
        </Text>
      </View>

      {/* Character Info */}
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{character.name}</Text>
        <Text style={styles.cardAge}>{character.age} • {character.currentLocation}</Text>
        
        <View style={styles.cardTags}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{character.personalityStyle}</Text>
          </View>
          {character.interests.slice(0, 2).map((interest, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{interest}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.cardBio} numberOfLines={2}>
          {character.communicationVibe} • {character.flirtStyle}
        </Text>

        {/* Safety Indicator */}
        <View style={styles.safetyIndicator}>
          <View style={[styles.safetyDot, { backgroundColor: character.safetyScore >= 90 ? '#10B981' : '#F59E0B' }]} />
          <Text style={styles.safetyText}>Verified Safe</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    marginRight: 12,
  },
  searchButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#7C3AED',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  card: {
    width: '50%',
    padding: 8,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardImagePlaceholder: {
    fontSize: 48,
  },
  cardContent: {
    paddingHorizontal: 4,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  cardAge: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  tag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 4,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: '600',
  },
  cardBio: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  safetyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  safetyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  safetyText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  createButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
