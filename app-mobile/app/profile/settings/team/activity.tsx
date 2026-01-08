/**
 * PACK 123 - Team Activity Log Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ActivityEntry {
  id: string;
  memberUserId: string;
  memberEmail?: string;
  action: string;
  target: string;
  metadata: any;
  timestamp: any;
  success: boolean;
  errorMessage?: string;
}

export default function TeamActivityLogScreen() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const functions = getFunctions();
      const getTeamActivity = httpsCallable(functions, 'getTeamActivity');

      const result = await getTeamActivity({ limit: 50 });
      const data = result.data as any;

      if (data.success) {
        setActivities(data.activities);
        setHasMore(data.hasMore);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadActivities();
  };

  const getActionColor = (action: string) => {
    if (action.includes('remove') || action.includes('revoke')) {
      return '#F44336';
    }
    if (action.includes('grant') || action.includes('invite')) {
      return '#4CAF50';
    }
    if (action.includes('update') || action.includes('edit')) {
      return '#FF9800';
    }
    return '#2196F3';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('remove') || action.includes('revoke')) return '🚫';
    if (action.includes('grant') || action.includes('invite')) return '✅';
    if (action.includes('update') || action.includes('edit')) return '✏️';
    if (action.includes('view') || action.includes('analytics')) return '👁️';
    if (action.includes('post') || action.includes('content')) return '📝';
    if (action.includes('dm') || action.includes('message')) return '💬';
    return '📋';
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const formatActionText = (activity: ActivityEntry) => {
    const action = activity.action.replace(/_/g, ' ');
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Activity Log</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity Log</Text>
        <Text style={styles.subtitle}>
          {activities.length} recent {activities.length === 1 ? 'action' : 'actions'}
        </Text>
      </View>

      <ScrollView
        style={styles.activityList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No activity yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Team member actions will appear here
            </Text>
          </View>
        ) : (
          activities.map((activity) => (
            <View
              key={activity.id}
              style={[
                styles.activityCard,
                !activity.success && styles.activityCardError,
              ]}
            >
              <View style={styles.activityHeader}>
                <Text style={styles.actionIcon}>
                  {getActionIcon(activity.action)}
                </Text>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityAction}>
                    {formatActionText(activity)}
                  </Text>
                  <Text style={styles.activityUser}>
                    {activity.memberEmail || 'Unknown user'}
                  </Text>
                </View>
                <Text style={styles.activityTime}>
                  {formatTimestamp(activity.timestamp)}
                </Text>
              </View>

              {activity.metadata?.actionDescription && (
                <Text style={styles.activityDescription}>
                  {activity.metadata.actionDescription}
                </Text>
              )}

              {activity.metadata?.roleChanged && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Role:</Text>
                  <Text style={styles.metadataValue}>
                    {activity.metadata.roleChanged.from} → {activity.metadata.roleChanged.to}
                  </Text>
                </View>
              )}

              {activity.metadata?.targetMemberUserId && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Target:</Text>
                  <Text style={styles.metadataValue}>
                    {activity.metadata.targetMemberUserId.substring(0, 8)}...
                  </Text>
                </View>
              )}

              {!activity.success && (
                <View style={styles.errorBadge}>
                  <Text style={styles.errorText}>
                    ❌ {activity.errorMessage || 'Action failed'}
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.actionBadge,
                  { backgroundColor: getActionColor(activity.action) },
                ]}
              >
                <Text style={styles.actionBadgeText}>
                  {activity.action.replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
          ))
        )}

        {hasMore && (
          <TouchableOpacity style={styles.loadMoreButton}>
            <Text style={styles.loadMoreText}>Load More</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
  },
  activityList: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    color: '#FFF',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: '#1a1a1a',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  activityCardError: {
    borderColor: '#F44336',
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  activityUser: {
    fontSize: 14,
    color: '#999',
  },
  activityTime: {
    fontSize: 12,
    color: '#666',
  },
  activityDescription: {
    fontSize: 14,
    color: '#CCC',
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  metadataLabel: {
    fontSize: 12,
    color: '#999',
    marginRight: 8,
    fontWeight: '600',
  },
  metadataValue: {
    fontSize: 12,
    color: '#CCC',
  },
  errorBadge: {
    backgroundColor: '#F44336',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  errorText: {
    color: '#FFF',
    fontSize: 12,
  },
  actionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  actionBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  loadMoreButton: {
    margin: 20,
    padding: 16,
    backgroundColor: '#333',
    borderRadius: 12,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
