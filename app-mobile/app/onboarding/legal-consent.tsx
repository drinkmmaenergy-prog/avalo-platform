/**
 * PACK 281 - Legal Consent Screen
 * Mandatory legal documents acceptance during onboarding
 * User cannot proceed without accepting all required documents
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
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LegalService from "@/lib/services/legalService";
import { LegalDocument, LegalDocType, LegalLanguage } from "@/shared/types/legal.types";

export default function LegalConsentScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState<LegalLanguage>('en');
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  
  // Acceptance states
  const [acceptAge18, setAcceptAge18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptSafety, setAcceptSafety] = useState(false);

  useEffect(() => {
    loadLegalDocuments();
  }, []);

  const loadLegalDocuments = async () => {
    try {
      setLoading(true);
      const deviceLang = LegalService.getDeviceLanguage();
      setLanguage(deviceLang);

      const result = await LegalService.getLegalDocuments({
        requiredOnly: true,
        language: deviceLang
      });

      if (result.success) {
        setDocuments(result.documents);
      } else {
        Alert.alert(
          'Error',
          'Failed to load legal documents. Please try again.',
          [{ text: 'Retry', onPress: loadLegalDocuments }]
        );
      }
    } catch (error) {
      console.error('Error loading legal documents:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
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

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'pl' : 'en');
  };

  const canSubmit = () => {
    return acceptAge18 && acceptTerms && acceptPrivacy && acceptSafety;
  };

  const handleAccept = async () => {
    if (!canSubmit()) {
      Alert.alert(
        language === 'pl' ? 'Wymagane' : 'Required',
        language === 'pl' 
          ? 'Musisz zaakceptować wszystkie wymagane dokumenty, aby kontynuować.'
          : 'You must accept all required documents to continue.'
      );
      return;
    }

    try {
      setSubmitting(true);

      // Build acceptances array
      const acceptances = documents.map(doc => ({
        docId: doc.docId,
        version: doc.version,
        language
      }));

      const result = await LegalService.acceptLegalDocuments(acceptances);

      if (result.success) {
        // Navigate to next onboarding step or main app
        router.replace('/feed' as any);
      } else {
        Alert.alert(
          'Error',
          result.error || 'Failed to save acceptance. Please try again.'
        );
      }
    } catch (error: any) {
      console.error('Error accepting documents:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const getDocTitle = (docId: LegalDocType): string => {
    const doc = documents.find(d => d.docId === docId);
    if (doc) {
      return doc.texts[language]?.title || doc.texts.en.title;
    }
    return LegalService.getDocumentDisplayName(docId, language);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF1493" />
          <Text style={styles.loadingText}>
            {language === 'pl' ? 'Ładowanie dokumentów...' : 'Loading documents...'}
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
          <Text style={styles.title}>
            {language === 'pl' ? 'Dokumenty Prawne' : 'Legal Documents'}
          </Text>
          <Text style={styles.subtitle}>
            {language === 'pl' 
              ? 'Przed kontynuacją musisz zaakceptować następujące dokumenty'
              : 'You must accept the following documents before continuing'}
          </Text>
        </View>

        {/* Language Toggle */}
        <TouchableOpacity style={styles.languageToggle} onPress={toggleLanguage}>
          <Text style={styles.languageToggleText}>
            🌐 {language === 'en' ? 'Switch to Polski' : 'Switch to English'}
          </Text>
        </TouchableOpacity>

        {/* Age Confirmation */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAcceptAge18(!acceptAge18)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, acceptAge18 && styles.checkboxChecked]}>
            {acceptAge18 && <Ionicons name="checkmark" size={18} color="#FFF" />}
          </View>
          <Text style={styles.checkboxLabel}>
            {language === 'pl' 
              ? 'Potwierdzam, że mam ukończone 18 lat'
              : 'I confirm that I am at least 18 years old'}
            <Text style={styles.required}> *</Text>
          </Text>
        </TouchableOpacity>

        {/* Terms of Service */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAcceptTerms(!acceptTerms)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
            {acceptTerms && <Ionicons name="checkmark" size={18} color="#FFF" />}
          </View>
          <View style={styles.checkboxTextContainer}>
            <Text style={styles.checkboxLabel}>
              {language === 'pl' ? 'Przeczytałem i akceptuję ' : 'I have read and accept the '}
              <Text 
                style={styles.link}
                onPress={() => {
                  const doc = documents.find(d => d.docId === 'terms');
                  if (doc) openDocument(doc);
                }}
              >
                {getDocTitle('terms')}
              </Text>
              <Text style={styles.required}> *</Text>
            </Text>
          </View>
        </TouchableOpacity>

        {/* Privacy Policy */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAcceptPrivacy(!acceptPrivacy)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, acceptPrivacy && styles.checkboxChecked]}>
            {acceptPrivacy && <Ionicons name="checkmark" size={18} color="#FFF" />}
          </View>
          <View style={styles.checkboxTextContainer}>
            <Text style={styles.checkboxLabel}>
              {language === 'pl' ? 'Przeczytałem i akceptuję ' : 'I have read and accept the '}
              <Text 
                style={styles.link}
                onPress={() => {
                  const doc = documents.find(d => d.docId === 'privacy');
                  if (doc) openDocument(doc);
                }}
              >
                {getDocTitle('privacy')}
              </Text>
              <Text style={styles.required}> *</Text>
            </Text>
          </View>
        </TouchableOpacity>

        {/* Safety Rules */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAcceptSafety(!acceptSafety)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, acceptSafety && styles.checkboxChecked]}>
            {acceptSafety && <Ionicons name="checkmark" size={18} color="#FFF" />}
          </View>
          <View style={styles.checkboxTextContainer}>
            <Text style={styles.checkboxLabel}>
              {language === 'pl' ? 'Rozumiem i akceptuję ' : 'I understand and accept the '}
              <Text 
                style={styles.link}
                onPress={() => {
                  const doc = documents.find(d => d.docId === 'safety_rules');
                  if (doc) openDocument(doc);
                }}
              >
                {getDocTitle('safety_rules')}
              </Text>
              <Text style={styles.required}> *</Text>
            </Text>
          </View>
        </TouchableOpacity>

        {/* Document Versions Info */}
        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>
            {language === 'pl' ? 'Wersje dokumentów:' : 'Document versions:'}
          </Text>
          {documents.map(doc => (
            <Text key={doc.docId} style={styles.versionItem}>
              • {doc.texts[language]?.title || doc.texts.en.title}: v{doc.version}
            </Text>
          ))}
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={[styles.acceptButton, !canSubmit() && styles.acceptButtonDisabled]}
          onPress={handleAccept}
          disabled={!canSubmit() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.acceptButtonText}>
              {language === 'pl' ? 'Akceptuję i Kontynuuj' : 'Accept and Continue'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Footer Note */}
        <Text style={styles.footerNote}>
          {language === 'pl'
            ? 'Nie możesz korzystać z Avalo bez akceptacji powyższych dokumentów.'
            : 'You cannot use Avalo without accepting the above documents.'}
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
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#AAA',
    lineHeight: 22,
  },
  languageToggle: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 24,
  },
  languageToggleText: {
    color: '#FF1493',
    fontSize: 14,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FF1493',
    borderColor: '#FF1493',
  },
  checkboxTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
    lineHeight: 22,
    marginLeft: 12,
  },
  link: {
    color: '#FF1493',
    textDecorationLine: 'underline',
  },
  required: {
    color: '#FF1493',
    fontWeight: 'bold',
  },
  versionInfo: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  versionItem: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
    marginTop: 4,
  },
  acceptButton: {
    backgroundColor: '#FF1493',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  acceptButtonDisabled: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  acceptButtonText: {
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
  },
});
