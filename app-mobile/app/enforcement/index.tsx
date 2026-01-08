/**
 * PACK 419 — User Enforcement List Screen
 * 
 * Shows user's active restrictions and enforcement history
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";
import {
  EnforcementDecision,
  EnforcementScope,
  EnforcementActionType,
} from "@/shared/types/pack419-enforcement.types";

export default function EnforcementListScreen() {
  const router = useRouter();
  const [enforcements, setEnforcements] = useState<EnforcementDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEnforcements = async () => {
    if (!auth.currentUser) return;

    try {
      const q = query(
        collection(db, 'enforcementDecisions'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const decisions = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as EnforcementDecision[];

      setEnforcements(decisions);
    } catch (error) {
      console.error('Failed to load enforcements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEnforcements();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEnforcements();
  };

  const getActionBadge = (action: EnforcementActionType) => {
    const badges = {
      [EnforcementActionType.WARNING]: { label: 'Warning', color: '#FFC107' },
      [EnforcementActionType.TEMP_RESTRICTION]: { label: 'Temporary', color: '#FF9800' },
      [EnforcementActionType.PERMA_BAN]: { label: 'Permanent', color: '#DC3545' },
      [EnforcementActionType.SHADOW_RESTRICTION]: { label: 'Restricted', color: '#6C757D' },
    };
    return badges[action];
  };

  const getScopeLabel = (scopes: EnforcementScope[]) => {
    if (scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
      return 'Full Account';
    }
    return scopes.slice(0, 2).map(s => s.toLowerCase().replace('_', ' ')).join(', ');
  };

  const isActive = (enforcement: EnforcementDecision) => {
    if (!enforcement.isActive) return false;
    if (!enforcement.expiresAt) return true;
    return enforcement.expiresAt > Date.now();
  };

  const renderEnforcementItem = ({ item }: { item: EnforcementDecision }) => {
    const badge = getActionBadge(item.action);
    const active = isActive(item);

    return (
      <TouchableOpacity
        style={styles.enforcementCard}
        onPress={() => router.push(`/enforcement/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
          {active && (
            <View style={styles.activeIndicator}>
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>

        <Text style={styles.scopeText}>{getScopeLabel(item.scopes)}</Text>
        
        <Text style={styles.dateText}>
          Issued: {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        {item.expiresAt && (
          <Text style={styles.expiryText}>
            {active 
              ? `Expires: ${new Date(item.expiresAt).toLocaleDateString()}`
              : 'Expired'
            }
          </Text>
        )}

        {item.appealId && (
          <View style={styles.appealBadge}>
            <Text style={styles.appealBadgeText}>Appeal Submitted</Text>
          </View>
        )}

        {item.isAppealable && !item.appealId && active && (
          <Text style={styles.appealableText}>Appealable</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.loadingText}>Loading restrictions...</Text>
      </View>
    );
  }

  if (enforcements.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={styles.emptyTitle}>No Restrictions</Text>
        <Text style={styles.emptyText}>
          Your account has no active restrictions or enforcement history.
        </Text>
      </View>
    );
  }

  const activeEnforcements = enforcements.filter(isActive);
  const inactiveEnforcements = enforcements.filter(e => !isActive(e));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account Restrictions</Text>
        <Text style={styles.headerSubtitle}>
          View your enforcement history and appeals
        </Text>
      </View>

      <FlatList
        data={enforcements}
        renderItem={renderEnforcementItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          activeEnforcements.length > 0 ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Restrictions</Text>
              <Text style={styles.sectionCount}>{activeEnforcements.length}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6C757D',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6C757D',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C757D',
  },
  listContent: {
    padding: 16,
  },
  enforcementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeIndicator: {
    backgroundColor: '#28A745',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scopeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 4,
  },
  expiryText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 8,
  },
  appealBadge: {
    backgroundColor: '#E7F3FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  appealBadgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0056B3',
  },
  appealableText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#007BFF',
    marginTop: 8,
  },
});

