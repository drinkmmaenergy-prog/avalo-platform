import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface LegalDocument {
  id: string;
  type: string;
  version: number;
  language: string;
  title: string;
  url: string;
}

interface DocumentStatus {
  currentVersion: number;
  acceptedVersion?: number;
  pending: boolean;
}

/**
 * PACK 89: Legal Center Screen
 * 
 * Displays all legal documents with acceptance status.
 * Users can view documents and accept new versions.
 */
export default function LegalCenterScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [status, setStatus] = useState<Record<string, DocumentStatus>>({});
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    loadLegalCenter();
  }, []);

  const loadLegalCenter = async () => {
    try {
      setLoading(true);

      // Load all documents
      const getAllDocs = httpsCallable(functions, 'legal_getAllDocuments');
      const docsResult = await getAllDocs({ language: 'en' });
      const docsData = docsResult.data as any;

      if (docsData.success && docsData.documents) {
        setDocuments(docsData.documents);
      }

      // Load user's status
      if (user) {
        const getStatus = httpsCallable(functions, 'legal_getUserStatus');
        const statusResult = await getStatus({ language: 'en' });
        const statusData = statusResult.data as any;

        if (statusData.success && statusData.status) {
          setStatus(statusData.status);
        }
      }
    } catch (err: any) {
      console.error('Error loading legal center:', err);
      Alert.alert('Error', 'Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLegalCenter();
    setRefreshing(false);
  };

  const openDocument = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open document URL');
      }
    } catch (err) {
      console.error('Error opening document:', err);
      Alert.alert('Error', 'Failed to open document');
    }
  };

  const acceptNewVersion = async (doc: LegalDocument) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to accept documents');
      return;
    }

    Alert.alert(
      'Accept New Version',
      `Do you want to accept the new version (v${doc.version}) of ${getDocumentTitle(doc.type)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setAccepting(doc.type);

              const acceptDoc = httpsCallable(functions, 'legal_acceptDocument');
              await acceptDoc({
                type: doc.type,
                version: doc.version,
                platform: 'mobile'
              });

              // Refresh to show updated status
              await loadLegalCenter();

              Alert.alert('Success', 'Document accepted successfully');
            } catch (err: any) {
              console.error('Error accepting document:', err);
              Alert.alert('Error', 'Failed to accept document');
            } finally {
              setAccepting(null);
            }
          }
        }
      ]
    );
  };

  const getDocumentTitle = (type: string): string => {
    const titles: Record<string, string> = {
      TOS: 'Terms of Service',
      PRIVACY: 'Privacy Policy',
      CONTENT_POLICY: 'Content Policy',
      SAFETY_POLICY: 'Safety Policy',
      PAYOUT_TERMS: 'Payout Terms',
      KYC_TERMS: 'KYC Terms'
    };
    return titles[type] || type;
  };

  const getDocumentDescription = (type: string): string => {
    const descriptions: Record<string, string> = {
      TOS: 'Terms and conditions for using Avalo',
      PRIVACY: 'How we collect and protect your data',
      CONTENT_POLICY: 'Rules for content creation and sharing',
      SAFETY_POLICY: 'Safety guidelines and best practices',
      PAYOUT_TERMS: 'Terms for creator earnings and payouts',
      KYC_TERMS: 'Identity verification requirements'
    };
    return descriptions[type] || 'Legal document';
  };

  const getStatusBadge = (type: string) => {
    const docStatus = status[type];
    if (!docStatus) {
      return { text: 'Not Accepted', color: '#8E8E93', icon: 'close-circle' };
    }
    if (docStatus.pending) {
      return { text: 'New Version Available', color: '#FF9500', icon: 'alert-circle' };
    }
    return { text: `Accepted v${docStatus.acceptedVersion}`, color: '#34C759', icon: 'checkmark-circle' };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#40E0D0" />
          <Text style={styles.loadingText}>Loading legal center...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal Center</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#40E0D0"
          />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color="#40E0D0" />
          <Text style={styles.infoBannerText}>
            Review all legal documents and their acceptance status. You'll be notified
            when new versions are available.
          </Text>
        </View>

        {/* Documents List */}
        <View style={styles.documentsContainer}>
          {documents.map(doc => {
            const badge = getStatusBadge(doc.type);
            const docStatus = status[doc.type];
            const isPending = docStatus?.pending;

            return (
              <View key={doc.id} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentTitle}>
                      {getDocumentTitle(doc.type)}
                    </Text>
                    <Text style={styles.documentDescription}>
                      {getDocumentDescription(doc.type)}
                    </Text>
                    <View style={styles.versionInfo}>
                      <Text style={styles.versionText}>
                        Current: v{doc.version}
                      </Text>
                      {docStatus?.acceptedVersion && (
                        <Text style={styles.versionText}>
                          {' • '}
                          Accepted: v{docStatus.acceptedVersion}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: `${badge.color}20` }]}>
                    <Ionicons name={badge.icon as any} size={16} color={badge.color} />
                  </View>
                </View>

                <View style={styles.documentActions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => openDocument(doc.url)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#40E0D0" />
                    <Text style={styles.viewButtonText}>View Document</Text>
                  </TouchableOpacity>

                  {isPending && (
                    <TouchableOpacity
                      style={[
                        styles.acceptButton,
                        accepting === doc.type && styles.acceptButtonDisabled
                      ]}
                      onPress={() => acceptNewVersion(doc)}
                      disabled={accepting === doc.type}
                      activeOpacity={0.7}
                    >
                      {accepting === doc.type ? (
                        <ActivityIndicator size="small" color="#0F0F0F" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={18} color="#0F0F0F" />
                          <Text style={styles.acceptButtonText}>Accept New Version</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer Info */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>
            Legal documents are versioned and tracked for compliance. You'll need to
            accept new versions when they're published to continue using certain features.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#40E0D020',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  documentsContainer: {
    marginBottom: 24,
  },
  documentCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  documentInfo: {
    flex: 1,
    marginRight: 12,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  documentDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 8,
  },
  versionInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  versionText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  documentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#40E0D020',
    borderRadius: 8,
    gap: 6,
  },
  viewButtonText: {
    fontSize: 14,
    color: '#40E0D0',
    fontWeight: '500',
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FF9500',
    borderRadius: 8,
    gap: 6,
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  acceptButtonText: {
    fontSize: 14,
    color: '#0F0F0F',
    fontWeight: '600',
  },
  footerInfo: {
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
});
