/**
 * PACK 150: Pending Integration Requests
 * Review and approve/deny integration requests from partners
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

interface IntegrationRequest {
  requestId: string;
  partnerId: string;
  integrationName: string;
  category: string;
  purpose: string;
  requestedPermissions: string[];
  createdAt: any;
  status: string;
}

export default function PendingRequestsScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<IntegrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const loadPendingRequests = async () => {
    try {
      const response = await fetch('/api/integrations/requests/pending');
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPendingRequests();
  };

  const handleApprove = async (requestId: string, integrationName: string) => {
    Alert.alert(
      'Approve Integration',
      `Grant ${integrationName} read-only access to your data?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessingId(requestId);
            try {
              const approveIntegrationRequest = httpsCallable(
                functions,
                'approveIntegrationRequest'
              );
              const result: any = await approveIntegrationRequest({ requestId });

              if (result.data.success) {
                Alert.alert('Success', 'Integration approved');
                loadPendingRequests();
              }
            } catch (error) {
              console.error('Error approving request:', error);
              Alert.alert('Error', 'Failed to approve integration');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleDeny = async (requestId: string, integrationName: string) => {
    Alert.alert(
      'Deny Integration',
      `Deny access for ${integrationName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(requestId);
            try {
              const denyIntegrationRequest = httpsCallable(
                functions,
                'denyIntegrationRequest'
              );
              const result: any = await denyIntegrationRequest({
                requestId,
                reason: 'Denied by user'
              });

              if (result.data.success) {
                Alert.alert('Success', 'Integration request denied');
                loadPendingRequests();
              }
            } catch (error) {
              console.error('Error denying request:', error);
              Alert.alert('Error', 'Failed to deny request');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const getPermissionLabel = (permission: string) => {
    return permission
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'scheduling': return 'calendar';
      case 'analytics': return 'bar-chart';
      case 'fitness': return 'fitness';
      case 'wellbeing': return 'heart';
      case 'events': return 'people';
      case 'marketing': return 'megaphone';
      case 'crm': return 'briefcase';
      case 'ecommerce': return 'cart';
      default: return 'apps';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading requests...</Text>
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
        <Text style={styles.title}>Pending Requests</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle" size={64} color="#10B981" />
            <Text style={styles.emptyTitle}>No Pending Requests</Text>
            <Text style={styles.emptyText}>
              You're all caught up! New integration requests will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.requestsContainer}>
            {requests.map((request) => (
              <View key={request.requestId} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <View style={styles.iconContainer}>
                    <Ionicons 
                      name={getCategoryIcon(request.category)} 
                      size={24} 
                      color="#8B5CF6" 
                    />
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName}>{request.integrationName}</Text>
                    <Text style={styles.requestCategory}>{request.category}</Text>
                  </View>
                </View>

                {request.purpose && (
                  <View style={styles.purposeSection}>
                    <Text style={styles.purposeLabel}>Purpose:</Text>
                    <Text style={styles.purposeText}>{request.purpose}</Text>
                  </View>
                )}

                <View style={styles.permissionsSection}>
                  <Text style={styles.permissionsTitle}>
                    Requested Permissions ({request.requestedPermissions.length})
                  </Text>
                  {request.requestedPermissions.map((permission, index) => (
                    <View key={index} style={styles.permissionItem}>
                      <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                      <Text style={styles.permissionText}>
                        {getPermissionLabel(permission)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.securityNote}>
                  <Ionicons name="lock-closed" size={16} color="#6B7280" />
                  <Text style={styles.securityNoteText}>
                    Read-only access • No personal data • No messaging
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.button, styles.denyButton]}
                    onPress={() => handleDeny(request.requestId, request.integrationName)}
                    disabled={processingId === request.requestId}
                  >
                    {processingId === request.requestId ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="close" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Deny</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.approveButton]}
                    onPress={() => handleApprove(request.requestId, request.integrationName)}
                    disabled={processingId === request.requestId}
                  >
                    {processingId === request.requestId ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
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
    height: 40
  },
  content: {
    flex: 1
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginTop: 80
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
  requestsContainer: {
    padding: 16
  },
  requestCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    opacity: 0.2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  requestInfo: {
    marginLeft: 12,
    flex: 1
  },
  requestName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  requestCategory: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'capitalize'
  },
  purposeSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8
  },
  purposeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 4
  },
  purposeText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20
  },
  permissionsSection: {
    marginBottom: 16
  },
  permissionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8
  },
  permissionText: {
    fontSize: 13,
    color: '#9CA3AF',
    flex: 1
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    marginBottom: 16,
    gap: 8
  },
  securityNoteText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1
  },
  actions: {
    flexDirection: 'row',
    gap: 12
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8
  },
  denyButton: {
    backgroundColor: '#EF4444'
  },
  approveButton: {
    backgroundColor: '#10B981'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  }
});
