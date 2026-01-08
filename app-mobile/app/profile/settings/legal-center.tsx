/**
 * PACK 281 - Legal Center
 * View and manage legal document acceptances
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import LegalService from "@/lib/services/legalService";
import { 
  LegalDocument, 
  UserLegalAcceptances,
  LegalDocType 
} from "@/shared/types/legal.types";

interface LegalCenterDocument {
  docId: LegalDocType;
  title: string;
  slug: string;
  required: boolean;
  currentVersion: number;
  acceptedVersion?: number;
  acceptedAt?: string;
  url: string;
  isOutdated: boolean;
  isMissing: boolean;
}

export default function LegalCenterScreen() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<LegalCenterDocument[]>([]);
  const [language, setLanguage] = useState<'en' | 'pl'>('en');

  useEffect(() => {
    loadLegalCenter();
  }, []);

  const loadLegalCenter = async () => {
    try {
      setLoading(true);
      const deviceLang = LegalService.getDeviceLanguage();
      setLanguage(deviceLang);

      // Get all legal documents
      const docsResult = await LegalService.getLegalDocuments({ language: deviceLang });
      
      // Get user acceptances
      const acceptancesResult = await LegalService.getUserLegalAcceptances();

      if (!docsResult.success) {
        throw new Error('Failed to load legal documents');
      }

      // Build display list
      const centerDocs: LegalCenterDocument[] = docsResult.documents.map(doc => {
        const acceptance = acceptancesResult.acceptances?.docs[doc.docId];
        const text = doc.texts[deviceLang] || doc.texts.en;

        return {
          docId: doc.docId,
          title: text.title,
          slug: doc.slug,
          required: doc.required,
          currentVersion: doc.version,
          acceptedVersion: acceptance?.version,
          acceptedAt: acceptance?.acceptedAt,
          url: text.url,
          isOutdated: acceptance ? acceptance.version < doc.version : false,
          isMissing: !acceptance
        };
      });

      // Sort: required first, then by outdated/missing status
      centerDocs.sort((a, b) => {
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        if (a.isOutdated && !b.isOutdated) return -1;
        if (!a.isOutdated && b.isOutdated) return 1;
        if (a.isMissing && !b.isMissing) return -1;
        if (!a.isMissing && b.isMissing) return 1;
        return 0;
      });

      setDocuments(centerDocs);
    } catch (error: any) {
      console.error('Error loading legal center:', error);
      Alert.alert('Error', error.message || 'Failed to load legal center');
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
        Alert.alert('Error', `Unable to open: ${url}`);
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert('Error', 'Failed to open document');
    }
  };

  const handleUpdateAcceptances = () => {
    router.push('/legal/update-required' as any);
  };

  const getStatusBadge = (doc: LegalCenterDocument) => {
    if (doc.isMissing) {
      return (
        <View style={[styles.badge, styles.badgeMissing]}>
          <Ionicons name="alert-circle" size={14} color="#FFF" />
          <Text style={styles.badgeText}>
            {language === 'pl' ? 'Nie zaakceptowano' : 'Not Accepted'}
          </Text>
        </View>
      );
    }
    if (doc.isOutdated) {
      return (
        <View style={[styles.badge, styles.badgeOutdated]}>
          <Ionicons name="warning" size={14} color="#FFF" />
          <Text style={styles.badgeText}>
            {language === 'pl' ? 'Wymaga aktualizacji' : 'Update Required'}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeCurrent]}>
        <Ionicons name="checkmark-circle" size={14} color="#FFF" />
        <Text style={styles.badgeText}>
          {language === 'pl' ? 'Aktualne' : 'Current'}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF1493" />
          <Text style={styles.loadingText}>
            {language === 'pl' ? 'Ładowanie...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasOutdated = documents.some(d => d.isOutdated || d.isMissing);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {language === 'pl' ? 'Centrum Prawne' : 'Legal & Safety'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Warning Banner if outdated */}
        {hasOutdated && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle" size={24} color="#FFA500" />
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>
                {language === 'pl' ? 'Wymagana akcja' : 'Action Required'}
              </Text>
              <Text style={styles.warningText}>
                {language === 'pl' 
                  ? 'Niektóre dokumenty wymagają Twojej akceptacji'
                  : 'Some documents require your acceptance'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.updateButton}
              onPress={handleUpdateAcceptances}
            >
              <Text style={styles.updateButtonText}>
                {language === 'pl' ? 'Aktualizuj' : 'Update'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info Text */}
        <Text style={styles.infoText}>
          {language === 'pl'
            ? 'Poniżej znajdują się wszystkie dokumenty prawne Avalo. Wymagane dokumenty muszą być zaakceptowane w aktualnej wersji, aby korzystać z aplikacji.'
            : 'Below are all Avalo legal documents. Required documents must be accepted at the current version to use the app.'}
        </Text>

        {/* Documents List */}
        {documents.map((doc) => (
          <View key={doc.docId} style={styles.documentCard}>
            {/* Header Row */}
            <View style={styles.documentHeader}>
              <View style={styles.documentTitleRow}>
                <Text style={styles.documentTitle}>{doc.title}</Text>
                {doc.required && (
                  <View style={styles.requiredBadge}>
                    <Text style={styles.requiredText}>
                      {language === 'pl' ? 'Wymagane' : 'Required'}
                    </Text>
                  </View>
                )}
              </View>
              {getStatusBadge(doc)}
            </View>

            {/* Version Info */}
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>
                {language === 'pl' ? 'Aktualna wersja:' : 'Current version:'}
              </Text>
              <Text style={styles.versionValue}>v{doc.currentVersion}</Text>
            </View>

            {doc.acceptedVersion && (
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>
                  {language === 'pl' ? 'Zaakceptowana:' : 'Accepted:'}
                </Text>
                <Text style={styles.versionValue}>
                  v{doc.acceptedVersion}
                  {doc.acceptedAt && (
                    <Text style={styles.dateText}>
                      {' '}• {LegalService.formatAcceptanceDate(doc.acceptedAt, language === 'pl' ? 'pl-PL' : 'en-US')}
                    </Text>
                  )}
                </Text>
              </View>
            )}

            {/* Action Button */}
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => openDocument(doc.url)}
            >
              <Ionicons name="document-text-outline" size={20} color="#FF1493" />
              <Text style={styles.viewButtonText}>
                {language === 'pl' ? 'Przeczytaj dokument' : 'View Document'}
              </Text>
              <Ionicons name="open-outline" size={16} color="#FF1493" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Footer Info */}
        <View style={styles.footerInfo}>
          <Ionicons name="information-circle-outline" size={20} color="#888" />
          <Text style={styles.footerText}>
            {language === 'pl'
              ? 'Nie możesz cofnąć akceptacji dokumentów. Jeśli chcesz przestać korzystać z Avalo, usuń swoje konto w ustawieniach.'
              : 'You cannot un-accept documents. If you want to stop using Avalo, delete your account in settings.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1F00',
    borderWidth: 1,
    borderColor: '#FFA500',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  warningTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFA500',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#FFF',
  },
  updateButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  updateButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
    marginBottom: 20,
  },
  documentCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    marginBottom: 12,
  },
  documentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
  },
  requiredBadge: {
    backgroundColor: '#FF1493',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  requiredText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeCurrent: {
    backgroundColor: '#28a745',
  },
  badgeOutdated: {
    backgroundColor: '#FFA500',
  },
  badgeMissing: {
    backgroundColor: '#dc3545',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 4,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  versionLabel: {
    fontSize: 14,
    color: '#888',
    marginRight: 8,
  },
  versionValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: '#888',
    fontWeight: 'normal',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1A2A',
    borderWidth: 1,
    borderColor: '#FF1493',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 12,
  },
  viewButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF1493',
    marginLeft: 8,
    marginRight: 8,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginLeft: 12,
  },
});
