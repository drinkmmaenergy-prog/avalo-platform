/**
 * PACK 420 — Data Rights Management (Mobile)
 * Main screen for viewing and creating data rights requests
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Link, Stack } from 'expo-router';
import { useAuth } from "@/lib/auth-context";
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import type { DataRightsRequest, DataRequestType, DataRequestStatus } from "@/shared/types/pack420-data-rights.types";

export default function DataRightsScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<DataRightsRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'dataRightsRequests'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      })) as DataRightsRequest[];
      setRequests(requestsData);
      setLoading(false);
    });

    return ()=> unsubscribe();
  }, [user]);

  const getRequestTypeLabel = (type: DataRequestType): string => {
    switch (type) {
      case 'EXPORT':
        return 'Data Export';
      case 'DELETE':
        return 'Account Deletion';
      case 'RESTRICT_PROCESSING':
        return 'Restrict Processing';
      default:
        return type;
    }
  };

  const getStatusColor = (status: DataRequestStatus): string => {
    switch (status) {
      case 'PENDING':
        return '#FFA500';
      case 'IN_PROGRESS':
        return '#4A90E2';
      case 'COMPLETED':
        return '#34C759';
      case 'REJECTED':
        return '#FF3B30';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: DataRequestStatus): string => {
    switch (status) {
      case 'PENDING':
        return 'Pending Review';
      case 'IN_PROGRESS':
        return 'Processing';
      case 'COMPLETED':
        return 'Completed';
      case 'REJECTED':
        return 'Rejected';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Data Rights' }} />
        <ActivityIndicator size="large" color="#6200EA" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Data Rights' }} />
      
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Data Rights</Text>
          <Text style={styles.headerSubtitle}>
            Manage your personal data and privacy preferences
          </Text>
        </View>

        {/* Action Cards */}
        <View style={styles.actionCards}>
          <Link href="/settings/data-rights/create-export" asChild>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Text style={styles.actionIconText}>📥</Text>
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Request Data Export</Text>
                <Text style={styles.actionDescription}>
                  Download a copy of all your personal data
                </Text>
              </View>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/settings/data-rights/create-delete" asChild>
            <TouchableOpacity style={[styles.actionCard, styles.dangerCard]}>
              <View style={[styles.actionIcon, { backgroundColor: '#FFEBEE' }]}>
                <Text style={styles.actionIconText}>🗑️</Text>
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, styles.dangerText]}>Delete Account</Text>
                <Text style={styles.actionDescription}>
                  Permanently delete your account and data
                </Text>
              </View>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/settings/data-rights/create-restrict" asChild>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
                <Text style={styles.actionIconText}>⏸️</Text>
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Restrict Processing</Text>
                <Text style={styles.actionDescription}>
                  Limit how we process your personal data
                </Text>
              </View>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Previous Requests */}
        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Requests</Text>
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/settings/data-rights/${request.id}`}
                asChild
              >
                <TouchableOpacity style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestType}>
                      {getRequestTypeLabel(request.type)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(request.status) },
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {getStatusLabel(request.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestDate}>
                    {new Date(request.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                  {request.reason && (
                    <Text style={styles.requestReason} numberOfLines={2}>
                      {request.reason}
                    </Text>
                  )}
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        )}

        {/* Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>GDPR & Data Rights</Text>
          <Text style={styles.infoText}>
            Under GDPR and similar privacy laws, you have the right to:
          </Text>
          <Text style={styles.infoBullet}>• Access your personal data</Text>
          <Text style={styles.infoBullet}>• Request data portability</Text>
          <Text style={styles.infoBullet}>• Request deletion (right to be forgotten)</Text>
          <Text style={styles.infoBullet}>• Restrict processing of your data</Text>
          <Text style={styles.infoText} style={{ marginTop: 12 }}>
            We typically process requests within 30 days. You'll receive updates via email.
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  actionCards: {
    padding: 16,
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionIconText: {
    fontSize: 24,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  dangerText: {
    color: '#D32F2F',
  },
  actionDescription: {
    fontSize: 13,
    color: '#666',
  },
  actionChevron: {
    fontSize: 24,
    color: '#999',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  requestCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  requestDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  requestReason: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  infoSection: {
    padding: 16,
    margin: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    marginBottom:  32,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#424242',
    marginBottom: 4,
  },
  infoBullet: {
    fontSize: 13,
    color: '#424242',
    marginLeft: 8,
    marginVertical: 2,
  },
});

