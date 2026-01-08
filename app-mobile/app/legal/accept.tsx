import { getLegalDoc } from '@/shared/legal/legalRegistry';
/**
 * Legal Acceptance Screen
 * PHASE 30B-3: Legal Acceptance System
 * 
 * Modal-style full screen for accepting legal documents
 * Cannot be exited without acceptance
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface CheckboxState {
  terms: boolean;
  privacy: boolean;
  community: boolean;
  safety: boolean;
}

export default function LegalAcceptScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<CheckboxState>({
    terms: false,
    privacy: false,
    community: false,
    safety: false,
  });

  const allChecked = Object.values(checked).every((v) => v);

  const handleCheckbox = (key: keyof CheckboxState) => {
    setChecked((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleViewDocument = (type: string) => {
    // Navigate to legal document viewer
    // For now, show alert - you can implement proper navigation
    Alert.alert(
      'View Document',
      `Opening ${type} document...`,
      [
        {
          text: 'OK',
          onPress: () => {
            // TODO: Navigate to legal document page
            // router.push(`/legal/${type}` as any);
          },
        },
      ]
    );
  };

  const handleAccept = async () => {
    if (!allChecked) {
      Alert.alert('Wymagane', 'Musisz zaakceptować wszystkie dokumenty prawne.');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Błąd', 'Musisz być zalogowany.');
      return;
    }

    setLoading(true);

    try {
      const acceptLegalDocuments = httpsCallable(functions, 'acceptLegalDocuments');
      const result = await acceptLegalDocuments({
        platform: 'mobile',
      });

      if ((result.data as any).success) {
        // Navigate to home tab
        router.replace('/(tabs)/home' as any);
      } else {
        throw new Error('Failed to accept legal documents');
      }
    } catch (error) {
      console.error('Error accepting legal documents:', error);
      Alert.alert(
        'Błąd',
        'Nie udało się zaakceptować dokumentów. Spróbuj ponownie.'
      );
    } finally {
      setLoading(false);
    }
  };

  const documents = [
    {
      key: 'terms' as keyof CheckboxState,
      title: 'Terms of Service',
      subtitle: 'Warunki korzystania z Avalo',
    },
    {
      key: 'privacy' as keyof CheckboxState,
      title: 'Privacy Policy',
      subtitle: 'Polityka prywatności',
    },
    {
      key: 'community' as keyof CheckboxState,
      title: 'Community Guidelines',
      subtitle: 'Zasady społeczności',
    },
    {
      key: 'safety' as keyof CheckboxState,
      title: 'Safety & Security',
      subtitle: 'Bezpieczeństwo',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.emoji}>📋</Text>
          <Text style={styles.title}>Legal Documents</Text>
          <Text style={styles.subtitle}>
            Please review and accept all legal documents to continue using Avalo
          </Text>
        </View>

        <View style={styles.documentsContainer}>
          {documents.map((doc) => (
            <View key={doc.key} style={styles.documentItem}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => handleCheckbox(doc.key)}
              >
                <View style={[styles.checkbox, checked[doc.key] && styles.checkboxChecked]}>
                  {checked[doc.key] && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentTitle}>{doc.title}</Text>
                  <Text style={styles.documentSubtitle}>{doc.subtitle}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewButton}
                onPress={() => handleViewDocument(doc.key)}
              >
                <Text style={styles.viewButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🔒 Twoje dane są chronione zgodnie z GDPR i polskim prawem
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.acceptButton,
            !allChecked && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={!allChecked || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptButtonText}>
              {allChecked ? 'Accept & Continue' : 'Please check all boxes'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          By accepting, you agree to all terms and policies
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  documentsContainer: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 4,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CCC',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#40E0D0',
    borderColor: '#40E0D0',
  },
  checkmark: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  documentSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  viewButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginLeft: 8,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
    textAlign: 'center',
    lineHeight: 20,
  },
  acceptButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  acceptButtonDisabled: {
    backgroundColor: '#CCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});





