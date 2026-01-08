/**
 * DiscoveryGrid Component
 * Mini grid view showing discovery profiles
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
} from 'react-native';
import { ProfileData } from '../lib/profileService';

const { width } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_SPACING = 8;
const CARD_SIZE = (width - 40 - (GRID_SPACING * (GRID_COLUMNS + 1))) / GRID_COLUMNS;

interface DiscoveryGridProps {
  profiles: ProfileData[];
  onProfilePress: (profile: ProfileData) => void;
}

export default function DiscoveryGrid({ profiles, onProfilePress }: DiscoveryGridProps) {
  const renderProfile = ({ item }: { item: ProfileData }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onProfilePress(item)}
      activeOpacity={0.8}
    >
      {/* Photo */}
      {item.photos && item.photos.length > 0 ? (
        <Image
          source={{ uri: item.photos[0] }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, styles.placeholderImage]}>
          <Text style={styles.placeholderText}>📷</Text>
        </View>
      )}

      {/* Gradient Overlay */}
      <View style={styles.overlay} />

      {/* Name */}
      <View style={styles.nameContainer}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {item.age && (
          <Text style={styles.age}>, {item.age}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (profiles.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💫 Discover</Text>
        <Text style={styles.subtitle}>People near you</Text>
      </View>

      <FlatList
        data={profiles}
        renderItem={renderProfile}
        keyExtractor={(item) => item.uid}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={styles.grid}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  grid: {
    gap: GRID_SPACING,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE * 1.4,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: GRID_SPACING,
    marginBottom: GRID_SPACING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    opacity: 0.3,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  nameContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  age: {
    fontSize: 12,
    color: '#fff',
  },
});
