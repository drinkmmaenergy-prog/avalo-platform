/**
 * PACK 150: Integrations Dashboard
 * Main screen for viewing and managing API integrations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { Ionicons } from '@expo/vector-icons';

interface Integration {
  integrationId: string;
  partnerId: string;
  integrationName: string;
  description: string;
  category: string;
  status: string;
  consentGrantedAt: Date;
  consentExpiresAt: Date;
  autoRenew: boolean;
  approvedPermissions: string[];
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const listCreatorIntegrations = httpsCallable(functions, 'listCreatorIntegrations');
      const result = await listCreatorIntegrations({});
      
      if (result.data.success) {
        setIntegrations(result.data.integrations || []);
      }
    } catch (error) {
      console.error('Error loading integrations:', error);
      Alert.alert('Error', 'Failed to load integrations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadIntegrations();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10B981';
      case 'suspended': return '#F59E0B';
      case 'revoked': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'checkmark-circle';
      case 'suspended': return 'pause-circle';
      case 'revoked': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'scheduling': return 'calendar';
      case 'analytics': return 'bar-chart';
      case 'fitness': return 'fitness';
      case 'wellbeing': return 'heart';
      case 'events': return 'people';
      case 'marketing': return 'megaphone';
      case 'crm': return 'contacts';
      case 'ecommerce': return 'cart';
      default: return 'apps';
    }
  };

  const getDaysUntilExpiry = (expiresAt: Date) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading integrations...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>API Integrations</Text>
        <TouchableOpacity 
          onPress={() => router.push('/profile/integrations/pending')}
          style={styles.headerButton}
        >
          <Ionicons name="notifications" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={32} color="#8B5CF6" />
          <Text style={styles.infoTitle}>Read-Only Access</Text>
          <Text style={styles.infoText}>
            All integrations have read-only access to your data. They cannot send messages, 
            modify your profile, or access sensitive information.
          </Text>
        </View>

        {integrations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="apps" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Integrations</Text>
            <Text style={styles.emptyText}>
              You haven't connected any external apps yet. Integrations allow approved partners 
              to access analytics and performance data.
            </Text>
          </View>
        ) : (
          <View style={styles.integrationsContainer}>
            <Text style={styles.sectionTitle}>
              Active Integrations ({integrations.filter(i => i.status === 'active').length})
            </Text>
            {integrations.map((integration) => {
              const daysLeft = getDaysUntilExpiry(integration.consentExpiresAt);
              const isExpiringSoon = daysLeft <= 7;

              return (
                <TouchableOpacity
                  key={integration.integrationId}
                  style={styles.integrationCard}
                  onPress={() => router.push(`/profile/integrations/${integration.integrationId}`)}
                >
                  <View style={styles.integrationHeader}>
                    <View style={styles.integrationIconContainer}>
                      <Ionicons 
                        name={getCategoryIcon(integration.category)} 
                        size={24} 
                        color="#8B5CF6" 
                      />
                    </View>
                    <View style={styles.integrationInfo}>
                      <Text style={styles.integrationName}>{integration.integrationName}</Text>
                      <Text style={styles.integrationCategory}>{integration.category}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(integration.status) }]}>
                      <Ionicons 
                        name={getStatusIcon(integration.status)} 
                        size={16} 
                        color="#fff" 
                      />
                    </View>
                  </View>

                  {integration.description && (
                    <Text style={styles.integrationDescription} numberOfLines={2}>
                      {integration.description}
                    </Text>
                  )}

                  <View style={styles.integrationFooter}>
                    <View style={styles.permissionsInfo}>
                      <Ionicons name="key" size={14} color="#6B7280" />
                      <Text style={styles.permissionsText}>
                        {integration.approvedPermissions.length} permissions
                      </Text>
                    </View>

                    {integration.status === 'active' && (
                      <View style={[styles.expiryInfo, isExpiringSoon && styles.expiryWarning]}>
                        <Ionicons 
                          name="time" 
                          size={14} 
                          color={isExpiringSoon ? '#F59E0B' : '#6B7280'} 
                        />
                        <Text style={[
                          styles.expiryText,
                          isExpiringSoon && styles.expiryWarningText
                        ]}>
                          {daysLeft > 0 
                            ? `${daysLeft}d left` 
                            : 'Expired'
                          }
                        </Text>
                      </View>
                    )}
                  </View>

                  {integration.autoRenew && (
                    <View style={styles.autoRenewBadge}>
                      <Ionicons name="sync" size={12} color="#10B981" />
                      <Text style={styles.autoRenewText}>Auto-renew</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 48,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center'
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  content: {
    flex: 1
  },
  infoCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    alignItems: 'center'
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    marginBottom: 8
  },
  infoText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20
  },
  integrationsContainer: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  integrationCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  integrationIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    opacity: 0.2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  integrationInfo: {
    flex: 1,
    marginLeft: 12
  },
  integrationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  integrationCategory: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'capitalize'
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  integrationDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
    lineHeight: 20
  },
  integrationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  permissionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  permissionsText: {
    fontSize: 12,
    color: '#6B7280'
  },
  expiryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  expiryWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  expiryText: {
    fontSize: 12,
    color: '#6B7280'
  },
  expiryWarningText: {
    color: '#F59E0B',
    fontWeight: '600'
  },
  autoRenewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  autoRenewText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600'
  }
});
