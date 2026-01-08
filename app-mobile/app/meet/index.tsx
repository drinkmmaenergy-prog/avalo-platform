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
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { MEET_CONFIG } from "@/config/monetization";

interface Host {
  userId: string;
  displayName: string;
  photoURL: string | null;
  realMeetEnabled: boolean;
  socialMeetEnabled: boolean;
  realMeetPrice: number;
  socialMeetPrice: number;
  bio: string;
}

export default function MeetMarketplace() {
  const router = useRouter();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'real_meet' | 'social_meet'>('all');

  const loadHosts = async () => {
    try {
      const functions = getFunctions(getApp());
      const listHostsFunc = httpsCallable(functions, 'meet_listHosts');
      
      const result = await listHostsFunc({
        meetType: filter === 'all' ? undefined : filter,
        limit: 50,
      });

      const data = result.data as { success: boolean; hosts?: Host[] };
      if (data.success && data.hosts) {
        setHosts(data.hosts);
      }
    } catch (error) {
      console.error('Error loading hosts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHosts();
  }, [filter]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHosts();
  };

  const renderHost = ({ item }: { item: Host }) => (
    <TouchableOpacity
      style={styles.hostCard}
      onPress={() => router.push(`/meet/${item.userId}`)}
      activeOpacity={0.7}
    >
      <Image
        source={
          item.photoURL
            ? { uri: item.photoURL }
            : require('../../assets/icon.png')
        }
        style={styles.hostPhoto}
      />
      <View style={styles.hostInfo}>
        <Text style={styles.hostName}>{item.displayName}</Text>
        <Text style={styles.hostBio} numberOfLines={2}>
          {item.bio}
        </Text>
        <View style={styles.priceContainer}>
          {item.realMeetEnabled && (
            <View style={styles.priceTag}>
              <Text style={styles.priceLabel}>Real Meet</Text>
              <Text style={styles.priceValue}>{item.realMeetPrice} 🪙</Text>
            </View>
          )}
          {item.socialMeetEnabled && (
            <View style={styles.priceTag}>
              <Text style={styles.priceLabel}>Social Meet</Text>
              <Text style={styles.priceValue}>{item.socialMeetPrice} 🪙</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.arrowContainer}>
        <Text style={styles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>Ładowanie hostów...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Marketplace Spotkań</Text>
        <Text style={styles.subtitle}>
          Zarezerwuj spotkanie offline lub online
        </Text>
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Wszystkie
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'real_meet' && styles.filterButtonActive]}
          onPress={() => setFilter('real_meet')}
        >
          <Text style={[styles.filterText, filter === 'real_meet' && styles.filterTextActive]}>
            Real Meet
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'social_meet' && styles.filterButtonActive]}
          onPress={() => setFilter('social_meet')}
        >
          <Text style={[styles.filterText, filter === 'social_meet' && styles.filterTextActive]}>
            Social Meet
          </Text>
        </TouchableOpacity>
      </View>

      {hosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Brak dostępnych hostów</Text>
        </View>
      ) : (
        <FlatList
          data={hosts}
          renderItem={renderHost}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#40E0D0"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1A1A1A',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#40E0D0',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  filterTextActive: {
    color: '#0A0A0A',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  hostCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  hostPhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#2A2A2A',
  },
  hostInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  hostName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  hostBio: {
    fontSize: 14,
    color: '#A0A0A0',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priceTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
  },
  priceLabel: {
    fontSize: 10,
    color: '#A0A0A0',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  arrowContainer: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  arrow: {
    fontSize: 32,
    color: '#40E0D0',
    fontWeight: '300',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#A0A0A0',
    textAlign: 'center',
  },
});
