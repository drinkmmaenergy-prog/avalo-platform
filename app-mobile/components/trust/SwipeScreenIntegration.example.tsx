/**
 * EXAMPLE: Swipe/Discovery Screen Integration with Blocklist
 * 
 * This file demonstrates how to filter out blocked users from discovery/swipe.
 * Copy relevant parts to your actual swipe/discovery screen.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { getBlocklist, isUserBlocked, Blocklist } from '../../services/trustService';

interface Profile {
  userId: string;
  name: string;
  age: number;
  bio: string;
  photoUrl: string;
}

interface SwipeScreenProps {
  currentUserId: string;
  profiles: Profile[];
  locale?: 'en' | 'pl';
}

export const SwipeScreenExample: React.FC<SwipeScreenProps> = ({
  currentUserId,
  profiles,
  locale = 'en'
}) => {
  const [blocklist, setBlocklist] = useState<Blocklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    loadBlocklistAndFilter();
  }, [currentUserId, profiles]);

  const loadBlocklistAndFilter = async () => {
    try {
      setLoading(true);
      
      // Fetch blocklist
      const list = await getBlocklist(currentUserId);
      setBlocklist(list);

      // Filter out blocked users
      const filtered = profiles.filter(profile => 
        !isUserBlocked(list, profile.userId)
      );

      setFilteredProfiles(filtered);
    } catch (error) {
      console.error('Error loading blocklist:', error);
      // On error, show all profiles (fail open for discovery)
      setFilteredProfiles(profiles);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (filteredProfiles.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>
          {locale === 'pl' ? 'Brak więcej profili' : 'No more profiles'}
        </Text>
        <Text style={styles.emptySubtext}>
          {locale === 'pl' 
            ? 'Sprawdź później lub dostosuj filtry' 
            : 'Check back later or adjust your filters'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredProfiles}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{item.name}, {item.age}</Text>
            <Text style={styles.profileBio}>{item.bio}</Text>
            
            {/* Note: TrustWarningBanner would be added here for each profile if needed */}
          </View>
        )}
      />

      <Text style={styles.debugInfo}>
        {locale === 'pl' 
          ? `Pokazano ${filteredProfiles.length} z ${profiles.length} profili` 
          : `Showing ${filteredProfiles.length} of ${profiles.length} profiles`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  profileCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  profileBio: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  debugInfo: {
    padding: 8,
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
  },
});

export default SwipeScreenExample;
