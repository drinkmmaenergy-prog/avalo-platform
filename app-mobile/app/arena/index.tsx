/**
 * Live Arena Home Screen
 * Browse and discover SFW interactive livestreams
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { liveArenaSDK, LiveStream, StreamCategory } from "@/lib/live-arena-sdk";

const CATEGORIES: { id: StreamCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'fitness', label: 'Fitness', icon: 'fitness' },
  { id: 'gaming', label: 'Gaming', icon: 'game-controller' },
  { id: 'education', label: 'Education', icon: 'school' },
  { id: 'art', label: 'Art', icon: 'color-palette' },
  { id: 'music', label: 'Music', icon: 'musical-notes' },
  { id: 'travel', label: 'Travel', icon: 'airplane' },
  { id: 'lifestyle', label: 'Lifestyle', icon: 'heart' },
  { id: 'entertainment', label: 'Entertainment', icon: 'sparkles' },
  { id: 'cooking', label: 'Cooking', icon: 'restaurant' },
  { id: 'business', label: 'Business', icon: 'briefcase' },
  { id: 'wellness', label: 'Wellness', icon: 'leaf' },
  { id: 'dance', label: 'Dance', icon: 'body' },
  { id: 'sports', label: 'Sports', icon: 'football' },
];

export default function LiveArenaScreen() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<StreamCategory | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = liveArenaSDK.watchLiveStreams(
      (updatedStreams) => {
        setStreams(updatedStreams);
        setLoading(false);
      },
      selectedCategory
    );

    return () => unsubscribe();
  }, [selectedCategory]);

  const handleStreamPress = (streamId: string) => {
    router.push(`/arena/${streamId}` as any);
  };

  const handleCreateStream = () => {
    router.push('/arena/create' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Arena</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateStream}
        >
          <Ionicons name="add-circle" size={28} color="#FF6B6B" />
          <Text style={styles.createButtonText}>Go Live</Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryContainer}
        contentContainerStyle={styles.categoryContent}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            !selectedCategory && styles.categoryChipActive,
          ]}
          onPress={() => setSelectedCategory(undefined)}
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
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Ionicons
              name={category.icon}
              size={16}
              color={selectedCategory === category.id ? '#FFF' : '#666'}
              style={styles.categoryIcon}
            />
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === category.id && styles.categoryChipTextActive,
              ]}
            >
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Live Streams */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading live streams...</Text>
        </View>
      ) : streams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-off" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>No Live Streams</Text>
          <Text style={styles.emptySubtitle}>
            {selectedCategory
              ? `No ${selectedCategory} streams are currently live`
              : 'Be the first to go live!'}
          </Text>
          <TouchableOpacity
            style={styles.createButtonLarge}
            onPress={handleCreateStream}
          >
            <Text style={styles.createButtonLargeText}>Start Streaming</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.streamsList}
          contentContainerStyle={styles.streamsContent}
        >
          {streams.map((stream) => (
            <TouchableOpacity
              key={stream.streamId}
              style={styles.streamCard}
              onPress={() => handleStreamPress(stream.streamId)}
            >
              {/* Stream Thumbnail */}
              <View style={styles.streamThumbnail}>
                <Image
                  source={{ uri: stream.hostAvatar || 'https://via.placeholder.com/300x200' }}
                  style={styles.thumbnailImage}
                />
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.viewerCount}>
                  <Ionicons name="eye" size={14} color="#FFF" />
                  <Text style={styles.viewerCountText}>{stream.viewerCount}</Text>
                </View>
              </View>

              {/* Stream Info */}
              <View style={styles.streamInfo}>
                <View style={styles.streamHeader}>
                  <Image
                    source={{ uri: stream.hostAvatar || 'https://via.placeholder.com/40' }}
                    style={styles.hostAvatar}
                  />
                  <View style={styles.streamDetails}>
                    <Text style={styles.streamTitle} numberOfLines={2}>
                      {stream.title}
                    </Text>
                    <Text style={styles.hostName}>{stream.hostName}</Text>
                  </View>
                  {stream.isVerified && (
                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  )}
                </View>
                <View style={styles.streamMeta}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{stream.category}</Text>
                  </View>
                  {stream.participantIds.length > 1 && (
                    <View style={styles.collabBadge}>
                      <Ionicons name="people" size={12} color="#FFF" />
                      <Text style={styles.collabBadgeText}>
                        {stream.participantIds.length} creators
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  createButtonText: {
    color: '#FF6B6B',
    fontWeight: '600',
    marginLeft: 4,
  },
  categoryContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#FF6B6B',
  },
  categoryIcon: {
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  createButtonLarge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  createButtonLargeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  streamsList: {
    flex: 1,
  },
  streamsContent: {
    padding: 16,
  },
  streamCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  streamThumbnail: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  liveIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    marginRight: 4,
  },
  liveText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewerCount: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewerCountText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  streamInfo: {
    padding: 12,
  },
  streamHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  streamDetails: {
    flex: 1,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  hostName: {
    fontSize: 14,
    color: '#666',
  },
  streamMeta: {
    flexDirection: 'row',
    marginTop: 8,
  },
  categoryBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
  collabBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  collabBadgeText: {
    fontSize: 12,
    color: '#7B1FA2',
    fontWeight: '500',
    marginLeft: 4,
  },
});
