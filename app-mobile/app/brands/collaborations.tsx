import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface Collaboration {
  id: string;
  brand_id: string;
  creator_id: string;
  type: string;
  status: string;
  created_at: number;
  metadata?: {
    total_products?: number;
    total_revenue?: number;
  };
}

export default function CollaborationsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'proposed' | 'active'>('all');

  useEffect(() => {
    loadCollaborations();
  }, [filter]);

  const loadCollaborations = async () => {
    try {
      const functions = getFunctions();
      const listUserCollaborations = httpsCallable(functions, 'listUserCollaborations');
      
      const result = await listUserCollaborations({
        status: filter === 'all' ? undefined : filter,
        limit: 50,
      });

      const data = result.data as any;
      if (data.success) {
        setCollaborations(data.collaborations);
      }
    } catch (error) {
      console.error('Error loading collaborations:', error);
      Alert.alert('Error', 'Failed to load collaborations');
    } finally {
      setLoading(false);
    }
  };

  const approveCollaboration = async (collabId: string) => {
    try {
      const functions = getFunctions();
      const approveCollab = httpsCallable(functions, 'approveCollaboration');
      
      const result = await approveCollab({ collaboration_id: collabId });
      const data = result.data as any;
      
      if (data.success) {
        Alert.alert('Success', 'Collaboration approved');
        loadCollaborations();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to approve collaboration');
    }
  };

  const updateCollaborationStatus = async (collabId: string, status: string) => {
    try {
      const functions = getFunctions();
      const updateStatus = httpsCallable(functions, 'updateCollaborationStatus');
      
      const result = await updateStatus({
        collaboration_id: collabId,
        status,
      });
      
      const data = result.data as any;
      if (data.success) {
        Alert.alert('Success', `Collaboration ${status}`);
        loadCollaborations();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'proposed': return '#FF9800';
      case 'approved': return '#2196F3';
      case 'active': return '#4CAF50';
      case 'completed': return '#9E9E9E';
      case 'cancelled': return '#F44336';
      default: return '#757575';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'sponsored_merch_drop': return 'Sponsored Drop';
      case 'licensed_collection': return 'Licensed Collection';
      case 'creator_owned': return 'Creator Owned';
      case 'collab_bundle': return 'Collab Bundle';
      default: return type;
    }
  };

  const renderCollaboration = ({ item }: { item: Collaboration }) => (
    <View style={styles.collabCard}>
      <View style={styles.collabHeader}>
        <View style={styles.collabInfo}>
          <Text style={styles.collabType}>{getTypeLabel(item.type)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push(`/brands/collaborations/${item.id}` as any)}
        >
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.collabStats}>
        <View style={styles.stat}>
          <Ionicons name="cube-outline" size={16} color="#666" />
          <Text style={styles.statText}>
            {item.metadata?.total_products || 0} Products
          </Text>
        </View>
        {item.metadata?.total_revenue ? (
          <View style={styles.stat}>
            <Ionicons name="diamond-outline" size={16} color="#FFD700" />
            <Text style={styles.statText}>
              {item.metadata.total_revenue.toLocaleString()} tokens
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.collabDate}>
        Created {new Date(item.created_at).toLocaleDateString()}
      </Text>

      {item.status === 'proposed' && item.creator_id === auth.currentUser?.uid && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => approveCollaboration(item.id)}
          >
            <Text style={styles.actionButtonText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => updateCollaborationStatus(item.id, 'cancelled')}
          >
            <Text style={styles.actionButtonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === 'approved' && (
        <TouchableOpacity
          style={[styles.actionButton, styles.activateButton]}
          onPress={() => updateCollaborationStatus(item.id, 'active')}
        >
          <Text style={styles.actionButtonText}>Activate</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Collaborations',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/brands/collaborations/new' as any)}
              style={styles.headerButton}
            >
              <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.filterContainer}>
          {['all', 'proposed', 'active'].map((filterOption) => (
            <TouchableOpacity
              key={filterOption}
              style={[
                styles.filterButton,
                filter === filterOption && styles.filterButtonActive,
              ]}
              onPress={() => {
                setFilter(filterOption as any);
                setLoading(true);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === filterOption && styles.filterTextActive,
                ]}
              >
                {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <FlatList
            data={collaborations}
            keyExtractor={(item) => item.id}
            renderItem={renderCollaboration}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No collaborations yet</Text>
                <Text style={styles.emptySubtext}>
                  Start collaborating with brands
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerButton: {
    marginRight: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  collabCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  collabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  collabInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collabType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  collabStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#666',
  },
  collabDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#F44336',
  },
  activateButton: {
    backgroundColor: '#007AFF',
    marginTop: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
