/**
 * PACK 113 — Connected Apps Screen
 * Allows creators to manage external app integrations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface UserAppAuthorization {
  authorizationId: string;
  userId: string;
  appId: string;
  grantedScopes: string[];
  grantedAt: any;
  activeTokenCount: number;
  lastUsedAt?: any;
}

interface ExternalApp {
  appId: string;
  name: string;
  description: string;
  type: string;
  status: string;
}

interface ConnectedApp {
  authorization: UserAppAuthorization;
  app: ExternalApp;
}

export default function ConnectedAppsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConnectedApps();
  }, []);

  const loadConnectedApps = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const getConnectedApps = httpsCallable(functions, 'getConnectedApps');
      const result = await getConnectedApps();
      const data = result.data as { connectedApps: ConnectedApp[] };

      setConnectedApps(data.connectedApps || []);
    } catch (error: any) {
      console.error('Error loading connected apps:', error);
      Alert.alert('Error', 'Failed to load connected apps');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadConnectedApps();
  };

  const revokeAccess = async (appId: string, appName: string) => {
    Alert.alert(
      'Revoke Access',
      `Are you sure you want to revoke access for ${appName}? This will disable all integrations for this app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const revokeAppAccess = httpsCallable(functions, 'revokeAppAccess');
              await revokeAppAccess({ appId });

              Alert.alert('Success', 'App access revoked successfully');
              loadConnectedApps();
            } catch (error: any) {
              console.error('Error revoking access:', error);
              Alert.alert('Error', 'Failed to revoke app access');
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'Never';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 30) return `${days}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const getScopeLabel = (scope: string): string => {
    const labels: Record<string, string> = {
      'PROFILE_READ': 'Read Profile',
      'PROFILE_UPDATE': 'Update Profile',
      'POST_STORY': 'Post Stories',
      'POST_FEED_CONTENT': 'Post Feed Content',
      'DELETE_OWN_CONTENT': 'Delete Content',
      'ANALYTICS_READ': 'Read Analytics',
      'AUDIENCE_READ_AGGREGATE': 'Read Audience Insights',
      'WEBHOOK_CONTENT': 'Content Webhooks',
      'WEBHOOK_FOLLOWERS': 'Follower Webhooks',
    };
    return labels[scope] || scope;
  };

  const getScopeIcon = (scope: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      'PROFILE_READ': 'person-outline',
      'PROFILE_UPDATE': 'create-outline',
      'POST_STORY': 'camera-outline',
      'POST_FEED_CONTENT': 'newspaper-outline',
      'DELETE_OWN_CONTENT': 'trash-outline',
      'ANALYTICS_READ': 'stats-chart-outline',
      'AUDIENCE_READ_AGGREGATE': 'people-outline',
      'WEBHOOK_CONTENT': 'notifications-outline',
      'WEBHOOK_FOLLOWERS': 'person-add-outline',
    };
    return icons[scope] || 'key-outline';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connected Apps</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connected Apps</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
          <Text style={styles.infoBannerText}>
            Manage external apps that have access to your Avalo account. You can revoke access at any time.
          </Text>
        </View>

        {connectedApps.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="link-outline" size={64} color="#999" />
            <Text style={styles.emptyStateTitle}>No Connected Apps</Text>
            <Text style={styles.emptyStateText}>
              You haven't authorized any external apps yet. When you connect third-party tools or integrations, they'll appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.appsList}>
            {connectedApps.map((item, index) => (
              <View key={item.authorization.authorizationId} style={styles.appCard}>
                {/* App Header */}
                <View style={styles.appHeader}>
                  <View style={styles.appIcon}>
                    <Ionicons name="apps-outline" size={24} color="#007AFF" />
                  </View>
                  <View style={styles.appInfo}>
                    <Text style={styles.appName}>{item.app.name}</Text>
                    <Text style={styles.appType}>{item.app.type.replace(/_/g, ' ')}</Text>
                  </View>
                  <View style={[styles.statusBadge, item.app.status === 'ACTIVE' ? styles.statusActive : styles.statusInactive]}>
                    <Text style={styles.statusText}>{item.app.status}</Text>
                  </View>
                </View>

                {/* App Description */}
                <Text style={styles.appDescription}>{item.app.description}</Text>

                {/* Connection Info */}
                <View style={styles.connectionInfo}>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <Text style={styles.infoLabel}>Connected:</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(item.authorization.grantedAt)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="pulse-outline" size={16} color="#666" />
                    <Text style={styles.infoLabel}>Last used:</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(item.authorization.lastUsedAt)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="key-outline" size={16} color="#666" />
                    <Text style={styles.infoLabel}>Active tokens:</Text>
                    <Text style={styles.infoValue}>
                      {item.authorization.activeTokenCount}
                    </Text>
                  </View>
                </View>

                {/* Granted Permissions */}
                <View style={styles.permissionsSection}>
                  <Text style={styles.permissionsTitle}>Granted Permissions:</Text>
                  <View style={styles.permissionsList}>
                    {item.authorization.grantedScopes.map((scope, idx) => (
                      <View key={idx} style={styles.permissionItem}>
                        <Ionicons
                          name={getScopeIcon(scope)}
                          size={16}
                          color="#007AFF"
                        />
                        <Text style={styles.permissionText}>
                          {getScopeLabel(scope)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Actions */}
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => revokeAccess(item.app.appId, item.app.name)}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#FF3B30" />
                  <Text style={styles.revokeButtonText}>Revoke Access</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Security Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#34C759" />
          <Text style={styles.securityNoticeText}>
            Your data is protected. External apps can never access your private messages, token balances, or payout information.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  appsList: {
    padding: 16,
  },
  appCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  appType: {
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: '#E8F5E9',
  },
  statusInactive: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  appDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  connectionInfo: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    marginRight: 4,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
  },
  permissionsSection: {
    marginBottom: 16,
  },
  permissionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  permissionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  permissionText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
    fontWeight: '500',
  },
  revokeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  revokeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
    marginLeft: 8,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  securityNoticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 18,
  },
});
