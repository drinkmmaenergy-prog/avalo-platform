/**
 * PACK 114 — Agency Management Screen (Creator View)
 * Allows creators to manage their agency relationship
 * 
 * Features:
 * - View current agency link status
 * - Accept/reject agency link requests
 * - Remove agency link
 * - View earnings split
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
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { getFunctions, httpsCallable } from 'firebase/functions';

interface AgencyLinkRequest {
  requestId: string;
  agencyId: string;
  agencyName?: string;
  proposedPercentage: number;
  message?: string;
  status: string;
  createdAt: any;
}

interface AgencyLink {
  hasAgency: boolean;
  agencyName?: string;
  agencyPercentage?: number;
  totalEarnings?: number;
  creatorShare?: number;
  agencyShare?: number;
  linkStatus?: string;
  linkedSince?: string;
}

export default function AgencySettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [agencyLink, setAgencyLink] = useState<AgencyLink | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AgencyLinkRequest[]>([]);
  const [processing, setProcessing] = useState(false);

  const auth = getAuth();
  const functions = getFunctions();

  useEffect(() => {
    loadAgencyData();
    loadPendingRequests();
  }, []);

  /**
   * Load current agency link data
   */
  const loadAgencyData = async () => {
    try {
      const getCreatorAgencyView = httpsCallable(functions, 'getCreatorAgencyView');
      const result = await getCreatorAgencyView({});
      setAgencyLink(result.data as AgencyLink);
    } catch (error) {
      console.error('Error loading agency data:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load pending agency link requests
   */
  const loadPendingRequests = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const requestsRef = collection(db, 'agency_link_requests');
      const q = query(
        requestsRef,
        where('creatorUserId', '==', userId),
        where('status', '==', 'PENDING')
      );

      const snapshot = await getDocs(q);
      const requests: AgencyLinkRequest[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Get agency name
        const agencyDoc = await getDocs(
          query(collection(db, 'creator_agency_accounts'), where('agencyId', '==', data.agencyId))
        );
        const agencyName = agencyDoc.docs[0]?.data()?.name || 'Unknown Agency';

        requests.push({
          requestId: doc.id,
          agencyId: data.agencyId,
          agencyName,
          proposedPercentage: data.proposedPercentage,
          message: data.message,
          status: data.status,
          createdAt: data.createdAt,
        });
      }

      setPendingRequests(requests);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  };

  /**
   * Accept agency link request
   */
  const acceptRequest = async (requestId: string) => {
    Alert.alert(
      'Accept Agency Link',
      'Are you sure you want to link with this agency? They will receive a percentage of your earnings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          style: 'default',
          onPress: async () => {
            setProcessing(true);
            try {
              const acceptAgencyLinkRequest = httpsCallable(
                functions,
                'acceptAgencyLinkRequest'
              );
              await acceptAgencyLinkRequest({ requestId });
              
              Alert.alert('Success', 'Agency link accepted');
              await loadAgencyData();
              await loadPendingRequests();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to accept request');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Reject agency link request
   */
  const rejectRequest = async (requestId: string) => {
    Alert.alert(
      'Reject Agency Link',
      'Are you sure you want to reject this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const rejectAgencyLinkRequest = httpsCallable(
                functions,
                'rejectAgencyLinkRequest'
              );
              await rejectAgencyLinkRequest({ requestId });
              
              Alert.alert('Success', 'Request rejected');
              await loadPendingRequests();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to reject request');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Remove current agency link
   */
  const removeAgencyLink = async () => {
    Alert.alert(
      'Remove Agency',
      'Are you sure you want to remove your agency? This will stop revenue sharing with them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              // Find the link ID first
              const userId = auth.currentUser?.uid;
              if (!userId) return;

              const linksRef = collection(db, 'creator_agency_links');
              const q = query(
                linksRef,
                where('creatorUserId', '==', userId),
                where('status', '==', 'ACTIVE')
              );
              const snapshot = await getDocs(q);
              
              if (!snapshot.empty) {
                const linkId = snapshot.docs[0].id;
                
                const removeAgencyLink = httpsCallable(functions, 'removeAgencyLink');
                await removeAgencyLink({ linkId, reason: 'Removed by creator' });
                
                Alert.alert('Success', 'Agency removed');
                await loadAgencyData();
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove agency');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Agency Settings',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container}>
        {/* Current Agency Link */}
        {agencyLink?.hasAgency ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={24} color="#6366f1" />
              <Text style={styles.sectionTitle}>Current Agency</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.agencyName}>{agencyLink.agencyName}</Text>
              <Text style={styles.agencyStatus}>Status: Active</Text>

              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Agency Share</Text>
                  <Text style={styles.statValue}>{agencyLink.agencyPercentage}%</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Your Share</Text>
                  <Text style={styles.statValue}>
                    {100 - (agencyLink.agencyPercentage || 0)}%
                  </Text>
                </View>
              </View>

              <View style={styles.earningsContainer}>
                <Text style={styles.earningsLabel}>Total Earnings Generated</Text>
                <Text style={styles.earningsValue}>
                  {agencyLink.totalEarnings?.toLocaleString() || 0} tokens
                </Text>

                <View style={styles.splitContainer}>
                  <View style={styles.splitItem}>
                    <Text style={styles.splitLabel}>Your Earnings</Text>
                    <Text style={styles.splitValue}>
                      {agencyLink.creatorShare?.toLocaleString() || 0} tokens
                    </Text>
                  </View>
                  <View style={styles.splitItem}>
                    <Text style={styles.splitLabel}>Agency Earnings</Text>
                    <Text style={styles.splitValueAgency}>
                      {agencyLink.agencyShare?.toLocaleString() || 0} tokens
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.removeButton}
                onPress={removeAgencyLink}
                disabled={processing}
              >
                <Ionicons name="close-circle" size={20} color="#ef4444" />
                <Text style={styles.removeButtonText}>Remove Agency</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#6366f1" />
              <Text style={styles.infoText}>
                Your agency receives {agencyLink.agencyPercentage}% of your 65% creator share.
                Avalo always keeps 35%. You can remove your agency at any time.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business-outline" size={24} color="#9ca3af" />
              <Text style={styles.sectionTitle}>No Agency Linked</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.noAgencyText}>
                You're not currently working with an agency. Agencies can help you grow your
                presence and manage your creator business.
              </Text>
              <Text style={styles.noAgencySubtext}>
                If you receive agency link requests, they will appear below.
              </Text>
            </View>
          </View>
        )}

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mail" size={24} color="#f59e0b" />
              <Text style={styles.sectionTitle}>
                Pending Requests ({pendingRequests.length})
              </Text>
            </View>

            {pendingRequests.map((request) => (
              <View key={request.requestId} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestAgencyName}>{request.agencyName}</Text>
                  <Text style={styles.requestPercentage}>
                    {request.proposedPercentage}%
                  </Text>
                </View>

                {request.message && (
                  <Text style={styles.requestMessage}>{request.message}</Text>
                )}

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => acceptRequest(request.requestId)}
                    disabled={processing}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => rejectRequest(request.requestId)}
                    disabled={processing}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Information Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark" size={24} color="#10b981" />
            <Text style={styles.sectionTitle}>How It Works</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.infoItemText}>
                You always keep at least 60% of all earnings
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.infoItemText}>
                Avalo always receives 35% (this never changes)
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.infoItemText}>
                Agency share comes from your 65% creator portion
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.infoItemText}>
                You can remove your agency at any time
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.infoItemText}>
                No free tokens or bonuses involved
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  agencyName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  agencyStatus: {
    fontSize: 14,
    color: '#10b981',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
  },
  earningsContainer: {
    marginTop: 12,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  splitContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  splitValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  splitValueAgency: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 8,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    marginLeft: 8,
    lineHeight: 20,
  },
  noAgencyText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    marginBottom: 12,
  },
  noAgencySubtext: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  requestCard: {
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
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestAgencyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  requestPercentage: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f59e0b',
  },
  requestMessage: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 12,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoItemText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
});
