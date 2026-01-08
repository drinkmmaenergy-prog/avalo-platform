/**
 * PACK 143 - Smart Funnels
 * Create and manage automated sales funnels
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface Funnel {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'archived';
  steps: any[];
  analytics: {
    totalEntered: number;
    completionRate: number;
    revenueGenerated: number;
  };
}

export default function FunnelsScreen() {
  const [loading, setLoading] = useState(true);
  const [funnels, setFunnels] = useState<Funnel[]>([]);

  useEffect(() => {
    loadFunnels();
  }, []);

  const loadFunnels = async () => {
    try {
      setLoading(true);
      const getFunnels = httpsCallable(functions, 'getMyFunnels');
      const result = await getFunnels({});
      const data = result.data as any;
      
      if (data.success) {
        setFunnels(data.funnels);
      }
    } catch (err) {
      console.error('Error loading funnels:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFunnelStatus = async (funnelId: string, currentStatus: string) => {
    try {
      const updateFunnel = httpsCallable(functions, 'updateFunnel');
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      
      await updateFunnel({
        funnelId,
        status: newStatus,
      });

      loadFunnels();
      Alert.alert('Success', `Funnel ${newStatus === 'active' ? 'activated' : 'paused'}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update funnel');
    }
  };

  const renderFunnel = ({ item }: { item: Funnel }) => (
    <View style={styles.funnelCard}>
      <View style={styles.funnelHeader}>
        <View style={styles.funnelTitleContainer}>
          <Text style={styles.funnelName}>{item.name}</Text>
          <View style={[
            styles.statusBadge,
            item.status === 'active' && styles.statusActive,
            item.status === 'paused' && styles.statusPaused,
          ]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => toggleFunnelStatus(item.id, item.status)}
        >
          <Text style={styles.toggleButtonText}>
            {item.status === 'active' ? 'Pause' : 'Activate'}
          </Text>
        </TouchableOpacity>
      </View>

      {item.description ? (
        <Text style={styles.funnelDescription}>{item.description}</Text>
      ) : null}

      <View style={styles.stepsInfo}>
        <Text style={styles.stepsText}>{item.steps?.length || 0} steps</Text>
      </View>

      <View style={styles.analyticsContainer}>
        <View style={styles.analyticItem}>
          <Text style={styles.analyticValue}>{item.analytics?.totalEntered || 0}</Text>
          <Text style={styles.analyticLabel}>Entered</Text>
        </View>
        <View style={styles.analyticItem}>
          <Text style={styles.analyticValue}>
            {(item.analytics?.completionRate || 0).toFixed(0)}%
          </Text>
          <Text style={styles.analyticLabel}>Completion</Text>
        </View>
        <View style={styles.analyticItem}>
          <Text style={styles.analyticValue}>
            ${(item.analytics?.revenueGenerated || 0).toFixed(0)}
          </Text>
          <Text style={styles.analyticLabel}>Revenue</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Smart Funnels</Text>
          <Text style={styles.subtitle}>Automate your sales sequences</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ✅ Product-driven content only{'\n'}
          ❌ No romantic or attention-seeking content{'\n'}
          ❌ No emotional manipulation patterns
        </Text>
      </View>

      <FlatList
        data={funnels}
        renderItem={renderFunnel}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No funnels yet</Text>
            <Text style={styles.emptySubtext}>
              Create automated sequences to nurture your audience
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: '#e7f3ff',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  infoText: {
    fontSize: 13,
    color: '#004085',
    lineHeight: 20,
  },
  listContainer: {
    padding: 16,
  },
  funnelCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  funnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  funnelTitleContainer: {
    flex: 1,
  },
  funnelName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#6c757d',
  },
  statusActive: {
    backgroundColor: '#28a745',
  },
  statusPaused: {
    backgroundColor: '#ffc107',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  toggleButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  funnelDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 8,
  },
  stepsInfo: {
    marginBottom: 12,
  },
  stepsText: {
    fontSize: 13,
    color: '#007AFF',
  },
  analyticsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  analyticItem: {
    alignItems: 'center',
  },
  analyticValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 2,
  },
  analyticLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
  },
});
