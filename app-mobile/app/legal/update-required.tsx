import { getLegalDoc } from '@/shared/legal/legalRegistry';
/**
 * PACK 281 - Legal Document Update Required
 * Shown when user has outdated document acceptances
 * Blocks access to monetized features until accepted
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
import { LegalDocument, LegalDocType, LegalLanguage } from "@/shared/types/legal.types";

export default function UpdateRequiredScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState<LegalLanguage>('en');
  const [documentsToUpdate, setDocumentsToUpdate] = useState<LegalDocument[]>([]);
  const [acceptedDocs, setAcceptedDocs] = useState<Set<LegalDocType>>(new Set());

  useEffect(() => {
    loadRequiredUpdates();
  }, []);

  const loadRequiredUpdates = async () => {
    try {
      setLoading(true);
      const deviceLang = LegalService.getDeviceLanguage();
      setLanguage(deviceLang);

      const result = await LegalService.needsLegalConsent();
      
      if (!result.needsConsent) {
        // User is already compliant, redirect to feed
        router.replace('/feed' as any);
        return;
      }

      setDocumentsToUpdate(result.documents);
    } catch (error: any) {
      console.error('Error loading required updates:', error);
      Alert.alert('Error', error.message || 'Failed to load updates');
    } finally {
      setLoading(false);
    }
  };

  const toggleAcceptance = (docId: LegalDocType) => {
    setAcceptedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const openDocument = async (doc: LegalDocument) => {
    try {
      const url = doc.texts[language]?.url || doc.texts.en.url;
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

  const canSubmit = () => {
    return acceptedDocs.size === documentsToUpdate.length;
  };

  const handleAcceptUpdates = async () => {
    if (!canSubmit()) {
      Alert.alert(
        language === 'pl' ? 'Wymagane' : 'Required',
        language === 'pl'
          ? 'Musisz zaakceptować wszystkie zaktualizowane dokumenty'
          : 'You must accept all updated documents'
      );
      return;
    }

    try {
      setSubmitting(true);

      const acceptances = documentsToUpdate.map(doc => ({
        docId: doc.docId,
        version: doc.version,
        language
      }));

      const result = await LegalService.acceptLegalDocuments(acceptances);

      if (result.success) {
        Alert.alert(
          language === 'pl' ? 'Sukces' : 'Success',
          language === 'pl' 
            ? 'Dokumenty zostały zaakceptowane'
            : 'Documents accepted successfully',
          [{
            text: 'OK',
            onPress: () => router.replace('/feed' as any)
          }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to save acceptance');
      }
    } catch (error: any) {
      console.error('Error accepting updates:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'pl' : 'en');
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="alert-circle" size={48} color="#FFA500" />
          </View>
          <Text style={styles.title}>
            {language === 'pl' ? 'Aktualizacja Wymagana' : 'Update Required'}
          </Text>
          <Text style={styles.subtitle}>
            {language === 'pl'
              ? 'Nasze dokumenty prawne zostały zaktualizowane. Musisz zaakceptować zmiany, aby kontynuować korzystanie z Avalo.'
              : 'Our legal documents have been updated. You must accept the changes to continue using Avalo.'}
          </Text>
        </View>

        {/* Language Toggle */}
        <TouchableOpacity style={styles.languageToggle} onPress={toggleLanguage}>
          <Text style={styles.languageToggleText}>
            🌐 {language === 'en' ? 'Switch to Polski' : 'Switch to English'}
          </Text>
        </TouchableOpacity>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="lock-closed" size={20} color="#FF1493" />
          <Text style={styles.infoBannerText}>
            {language === 'pl'
              ? 'Dostęp do czatu, połączeń, kalendarza, wydarzeń, portfela i AI jest zablokowany do czasu akceptacji'
              : 'Chat, calls, calendar, events, wallet, and AI access is blocked until you accept'}
          </Text>
        </View>

        {/* Documents to Update */}
        <Text style={styles.sectionTitle}>
          {language === 'pl' ? 'Dokumenty wymagające akceptacji:' : 'Documents requiring acceptance:'}
        </Text>

        {documentsToUpdate.map((doc) => {
          const text = doc.texts[language] || doc.texts.en;
          const isAccepted = acceptedDocs.has(doc.docId);

          return (
            <View key={doc.docId} style={styles.documentCard}>
              {/* Document Header */}
              <View style={styles.documentHeader}>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentTitle}>{text.title}</Text>
                  <Text style={styles.documentVersion}>
                    {language === 'pl' ? 'Wersja' : 'Version'} {doc.version}
                  </Text>
                </View>
                {doc.required && (
                  <View style={styles.requiredBadge}>
                    <Text style={styles.requiredText}>
                      {language === 'pl' ? 'Wymagane' : 'Required'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Summary if available */}
              {text.summary && (
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryLabel}>
                    {language === 'pl' ? 'Co się zmieniło:' : "What's changed:"}
                  </Text>
                  <Text style={styles.summaryText}>{text.summary}</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.viewDocButton}
                  onPress={() => openDocument(doc)}
                >
                  <Ionicons name="document-text-outline" size={18} color="#FF1493" />
                  <Text style={styles.viewDocText}>
                    {language === 'pl' ? 'Przeczytaj' : 'Read Document'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.acceptCheckbox, isAccepted && styles.acceptCheckboxChecked]}
                  onPress={() => toggleAcceptance(doc.docId)}
                  activeOpacity={0.7}
                >
                  {isAccepted && <Ionicons name="checkmark" size={20} color="#FFF" />}
                  {!isAccepted && (
                    <Text style={styles.acceptCheckboxText}>
                      {language === 'pl' ? 'Akceptuję' : 'I Accept'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Accept Button */}
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit() && styles.submitButtonDisabled]}
          onPress={handleAcceptUpdates}
          disabled={!canSubmit() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                {language === 'pl' ? 'Akceptuj Wszystkie i Kontynuuj' : 'Accept All and Continue'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </>
          )}
        </TouchableOpacity>

        {/* Footer Note */}
        <Text style={styles.footerNote}>
          {language === 'pl'
            ? 'Nie możesz korzystać z funkcji zarobkowych Avalo bez akceptacji zaktualizowanych dokumentów.'
            : "You cannot use Avalo's monetized features without accepting the updated documents."}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },
  languageToggle: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 20,
  },
  languageToggleText: {
    color: '#FF1493',
    fontSize: 14,
    fontWeight: '600',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1A2A',
    borderWidth: 1,
    borderColor: '#FF1493',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#FFF',
    marginLeft: 12,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  documentCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  documentVersion: {
    fontSize: 14,
    color: '#888',
  },
  requiredBadge: {
    backgroundColor: '#FF1493',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  requiredText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  summaryContainer: {
    backgroundColor: '#0A0A0A',
    borderLeftWidth: 3,
    borderLeftColor: '#FFA500',
    padding: 12,
    marginBottom: 12,
    borderRadius: 6,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFA500',
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewDocButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1A2A',
    borderWidth: 1,
    borderColor: '#FF1493',
    borderRadius: 8,
    paddingVertical: 12,
  },
  viewDocText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF1493',
    marginLeft: 8,
  },
  acceptCheckbox: {
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#555',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptCheckboxChecked: {
    backgroundColor: '#FF1493',
    borderColor: '#FF1493',
  },
  acceptCheckboxText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#FF1493',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#777',
    marginTop: 20,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});





