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

interface LegalRequirement {
  type: string;
  currentVersion: number;
  userAcceptedVersion?: number;
  required: boolean;
  pending: boolean;
}

/**
 * PACK 89: Pre-Registration Legal Acceptance Screen
 * 
 * This screen BLOCKS signup until user accepts required legal documents.
 * Users must explicitly accept TOS and Privacy Policy before proceeding.
 */
export default function LegalAcceptanceScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Required documents for signup
  const REQUIRED_TYPES = ['TOS', 'PRIVACY'];

  useEffect(() => {
    loadLegalDocuments();
  }, []);

  const loadLegalDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const getAllDocs = httpsCallable(functions, 'legal_getAllDocuments');
      const result = await getAllDocs({ language: 'en' });
      const data = result.data as any;

      if (data.success && data.documents) {
        // Filter to only required documents for signup
        const requiredDocs = data.documents.filter((doc: LegalDocument) =>
          REQUIRED_TYPES.includes(doc.type)
        );
        setDocuments(requiredDocs);
      }
    } catch (err: any) {
      console.error('Error loading legal documents:', err);
      setError('Failed to load legal documents. Please try again.');
    } finally {
      setLoading(false);
    }
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

  const toggleAcceptance = (type: string) => {
    setAccepted(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const handleContinue = async () => {
    // Verify all required documents are accepted
    const allAccepted = REQUIRED_TYPES.every(type => accepted[type]);

    if (!allAccepted) {
      Alert.alert(
        'Acceptance Required',
        'You must accept all required legal documents to continue.'
      );
      return;
    }

    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setAccepting(true);
      setError(null);

      // Accept each required document
      const acceptDoc = httpsCallable(functions, 'legal_acceptDocument');

      for (const doc of documents) {
        if (REQUIRED_TYPES.includes(doc.type)) {
          await acceptDoc({
            type: doc.type,
            version: doc.version,
            platform: 'mobile'
          });
        }
      }

      // Navigate to next onboarding step
      router.replace('/(onboarding)/selfie-verify');
    } catch (err: any) {
      console.error('Error accepting documents:', err);
      setError('Failed to accept documents. Please try again.');
      Alert.alert('Error', 'Failed to accept legal documents. Please try again.');
    } finally {
      setAccepting(false);
    }
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#40E0D0" />
          <Text style={styles.loadingText}>Loading legal documents...</Text>
        </View>
      </View>
    );
  }

  const allAccepted = REQUIRED_TYPES.every(type => accepted[type]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Legal Agreement</Text>
          <Text style={styles.subtitle}>
            Before continuing, please review and accept our legal documents
          </Text>
        </View>

        {/* PACK 204: Safety Message */}
        <View style={styles.safetyMessageContainer}>
          <Text style={styles.safetyMessageText}>
            Romance and flirting are welcome — explicit sexual services are strictly prohibited.
          </Text>
        </View>

        {/* Error message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={20} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Legal Documents */}
        <View style={styles.documentsContainer}>
          {documents.map(doc => (
            <View key={doc.id} style={styles.documentCard}>
              <View style={styles.documentHeader}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => toggleAcceptance(doc.type)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      accepted[doc.type] && styles.checkboxChecked
                    ]}
                  >
                    {accepted[doc.type] && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </View>
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentTitle}>
                      {getDocumentTitle(doc.type)}
                    </Text>
                    <Text style={styles.documentVersion}>
                      Version {doc.version}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => openDocument(doc.url)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewButtonText}>View</Text>
                  <Ionicons name="open-outline" size={16} color="#40E0D0" />
                </TouchableOpacity>
              </View>

              <Text style={styles.documentDescription}>
                {doc.type === 'TOS' && 'Terms and conditions for using Avalo'}
                {doc.type === 'PRIVACY' && 'How we collect and protect your data'}
              </Text>
            </View>
          ))}
        </View>

        {/* Compliance Notice */}
        <View style={styles.noticeContainer}>
          <Ionicons name="information-circle-outline" size={24} color="#40E0D0" />
          <Text style={styles.noticeText}>
            By accepting these documents, you acknowledge that you have read and
            understood our legal terms and policies.
          </Text>
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!allAccepted || accepting) && styles.continueButtonDisabled
          ]}
          onPress={handleContinue}
          disabled={!allAccepted || accepting}
          activeOpacity={0.8}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#0F0F0F" />
          ) : (
            <Text style={styles.continueButtonText}>
              Accept & Continue
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          You must accept all required documents to continue
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
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
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    lineHeight: 22,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 14,
    color: '#FF6B6B',
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
    alignItems: 'center',
    marginBottom: 8,
  },
  checkboxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#40E0D0',
    borderColor: '#40E0D0',
  },
  documentInfo: {
    marginLeft: 12,
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  documentVersion: {
    fontSize: 12,
    color: '#8E8E93',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#40E0D020',
    borderRadius: 6,
  },
  viewButtonText: {
    fontSize: 14,
    color: '#40E0D0',
    marginRight: 4,
    fontWeight: '500',
  },
  documentDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginLeft: 36,
  },
  noticeContainer: {
    flexDirection: 'row',
    backgroundColor: '#40E0D020',
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F0F0F',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  continueButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  continueButtonDisabled: {
    backgroundColor: '#2C2C2E',
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  footerNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  safetyMessageContainer: {
    backgroundColor: '#A62EFF20',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#A62EFF',
  },
  safetyMessageText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    fontWeight: '500',
  },
});
