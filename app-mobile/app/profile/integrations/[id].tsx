/**
 * PACK 150: Integration Detail Screen
 * View and manage individual integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';
import { Ionicons } from '@expo/vector-icons';

interface IntegrationDetail {
  integrationId: string;
  partnerId: string;
  integrationName: string;
  description: string;
  category: string;
  status: string;
  consentGrantedAt: any;
  consentExpiresAt: any;
  consentRenewedAt?: any;
  autoRenew: boolean;
  approvedPermissions: string[];
  activatedAt: any;
}

interface PartnerInfo {
  companyName: string;
  category: string;
  website: string;
}

export default function IntegrationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [integration, setIntegration] = useState<IntegrationDetail | null>(null);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  useEffect(() => {
    loadIntegrationDetails();
  }, [id]);

  const loadIntegrationDetails = async () => {
    try {
      const getIntegrationDetails = httpsCallable(functions, 'getIntegrationDetails');
      const result: any = await getIntegrationDetails({ integrationId: id });
      
      if (result.data.success) {
        setIntegration(result.data.integration);
        setPartner(result.data.partner);
        setAutoRenew(result.data.integration.autoRenew);
      }
    } catch (error) {
      console.error('Error loading integration:', error);
      Alert.alert('Error', 'Failed to load integration details');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeIntegration = () => {
    Alert.alert(
      'Revoke Integration',
      'Are you sure you want to revoke this integration? The partner will immediately lose access to your data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const revokeIntegrationPermission = httpsCallable(
                functions,
                'revokeIntegrationPermission'
              );
              const result: any = await revokeIntegrationPermission({
                integrationId: id,
                reason: 'Revoked by user'
              });

              if (result.data.success) {
                Alert.alert('Success', 'Integration revoked successfully');
                router.back();
              }
            } catch (error) {
              console.error('Error revoking integration:', error);
              Alert.alert('Error', 'Failed to revoke integration');
            }
          }
        }
      ]
    );
  };

  const handleRenewConsent = async () => {
    try {
      const renewIntegrationConsent = httpsCallable(functions, 'renewIntegrationConsent');
      const result: any = await renewIntegrationConsent({ integrationId: id });

      if (result.data.success) {
        Alert.alert('Success', 'Consent renewed for 90 days');
        loadIntegrationDetails();
      }
    } catch (error) {
      console.error('Error renewing consent:', error);
      Alert.alert('Error', 'Failed to renew consent');
    }
  };

  const handleToggleAutoRenew = async (value: boolean) => {
    try {
      const updateAutoRenew = httpsCallable(functions, 'updateAutoRenew');
      const result: any = await updateAutoRenew({
        integrationId: id,
        autoRenew: value
      });

      if (result.data.success) {
        setAutoRenew(value);
        Alert.alert('Success', result.data.message);
      }
    } catch (error) {
      console.error('Error updating auto-renew:', error);
      Alert.alert('Error', 'Failed to update auto-renew setting');
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getPermissionLabel = (permission: string) => {
    return permission
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading integration...</Text>
        </View>
      </View>
    );
  }

  if (!integration) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Integration</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorText}>Integration not found</Text>
        </View>
      </View>
    );
  }

  const daysUntilExpiry = Math.ceil(
    (new Date(integration.consentExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Integration Details</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.integrationHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="apps" size={32} color="#8B5CF6" />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.integrationName}>{integration.integrationName}</Text>
              {partner && (
                <Text style={styles.companyName}>{partner.companyName}</Text>
              )}
              <Text style={styles.category}>{integration.category}</Text>
            </View>
          </View>

          {integration.description && (
            <Text style={styles.description}>{integration.description}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Current Status</Text>
              <View style={[
                styles.statusBadge,
                integration.status === 'active' && styles.statusActive,
                integration.status === 'suspended' && styles.statusSuspended,
                integration.status === 'revoked' && styles.statusRevoked
              ]}>
                <Text style={styles.statusText}>
                  {integration.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Activated</Text>
              <Text style={styles.statusValue}>{formatDate(integration.activatedAt)}</Text>
            </View>
            {daysUntilExpiry > 0 && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Expires In</Text>
                <Text style={[
                  styles.statusValue,
                  daysUntilExpiry <= 7 && styles.warningText
                ]}>
                  {daysUntilExpiry} days
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consent Management</Text>
          <View style={styles.consentCard}>
            <View style={styles.consentRow}>
              <Ionicons name="time" size={20} color="#9CA3AF" />
              <View style={styles.consentInfo}>
                <Text style={styles.consentLabel}>Consent Granted</Text>
                <Text style={styles.consentValue}>{formatDate(integration.consentGrantedAt)}</Text>
              </View>
            </View>
            <View style={styles.consentRow}>
              <Ionicons name="calendar" size={20} color="#9CA3AF" />
              <View style={styles.consentInfo}>
                <Text style={styles.consentLabel}>Consent Expires</Text>
                <Text style={styles.consentValue}>{formatDate(integration.consentExpiresAt)}</Text>
              </View>
            </View>
            {integration.consentRenewedAt && (
              <View style={styles.consentRow}>
                <Ionicons name="sync" size={20} color="#9CA3AF" />
                <View style={styles.consentInfo}>
                  <Text style={styles.consentLabel}>Last Renewed</Text>
                  <Text style={styles.consentValue}>{formatDate(integration.consentRenewedAt)}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.autoRenewCard}>
            <View style={styles.autoRenewRow}>
              <View>
                <Text style={styles.autoRenewTitle}>Auto-Renew</Text>
                <Text style={styles.autoRenewDescription}>
                  Automatically renew consent every 90 days
                </Text>
              </View>
              <Switch
                value={autoRenew}
                onValueChange={handleToggleAutoRenew}
                trackColor={{ false: '#374151', true: '#8B5CF6' }}
                thumbColor={autoRenew ? '#fff' : '#9CA3AF'}
              />
            </View>
          </View>

          {integration.status === 'active' && daysUntilExpiry <= 7 && (
            <TouchableOpacity style={styles.renewButton} onPress={handleRenewConsent}>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.renewButtonText}>Renew Now (90 Days)</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Data Permissions ({integration.approvedPermissions.length})
          </Text>
          <View style={styles.permissionsCard}>
            {integration.approvedPermissions.map((permission, index) => (
              <View key={index} style={styles.permissionRow}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.permissionText}>{getPermissionLabel(permission)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.permissionNote}>
            <Ionicons name="information-circle" size={16} color="#6B7280" />
            <Text style={styles.permissionNoteText}>
              All data is read-only and anonymized. No personal identifiers are shared.
            </Text>
          </View>
        </View>

        {partner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partner Information</Text>
            <View style={styles.partnerCard}>
              <View style={styles.partnerRow}>
                <Text style={styles.partnerLabel}>Company</Text>
                <Text style={styles.partnerValue}>{partner.companyName}</Text>
              </View>
              <View style={styles.partnerRow}>
                <Text style={styles.partnerLabel}>Category</Text>
                <Text style={styles.partnerValue}>{partner.category}</Text>
              </View>
              <View style={styles.partnerRow}>
                <Text style={styles.partnerLabel}>Website</Text>
                <Text style={[styles.partnerValue, styles.linkText]}>{partner.website}</Text>
              </View>
            </View>
          </View>
        )}

        {integration.status === 'active' && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
            <TouchableOpacity
              style={styles.revokeButton}
              onPress={handleRevokeIntegration}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
              <Text style={styles.revokeButtonText}>Revoke Integration</Text>
            </TouchableOpacity>
            <Text style={styles.revokeNote}>
              This will immediately revoke all access. This action cannot be undone.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444'
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
    height: 40
  },
  content: {
    flex: 1
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  headerInfo: {
    flex: 1
  },
  integrationName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  companyName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4
  },
  category: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize'
  },
  description: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  statusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  statusLabel: {
    fontSize: 14,
    color: '#9CA3AF'
  },
  statusValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  statusActive: {
    backgroundColor: '#10B981'
  },
  statusSuspended: {
    backgroundColor: '#F59E0B'
  },
  statusRevoked: {
    backgroundColor: '#EF4444'
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff'
  },
  warningText: {
    color: '#F59E0B',
    fontWeight: '700'
  },
  consentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  consentInfo: {
    marginLeft: 12,
    flex: 1
  },
  consentLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4
  },
  consentValue: {
    fontSize: 14,
    color: '#fff'
  },
  autoRenewCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  autoRenewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  autoRenewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4
  },
  autoRenewDescription: {
    fontSize: 12,
    color: '#9CA3AF'
  },
  renewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    gap: 8
  },
  renewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  },
  permissionsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12
  },
  permissionText: {
    fontSize: 14,
    color: '#fff',
    flex: 1
  },
  permissionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    gap: 8
  },
  permissionNoteText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
    lineHeight: 16
  },
  partnerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16
  },
  partnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  partnerLabel: {
    fontSize: 14,
    color: '#9CA3AF'
  },
  partnerValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12
  },
  linkText: {
    color: '#8B5CF6'
  },
  dangerZone: {
    padding: 16,
    backgroundColor: '#1E293B',
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444'
  },
  dangerZoneTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 12
  },
  revokeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 8
  },
  revokeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  },
  revokeNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center'
  }
});