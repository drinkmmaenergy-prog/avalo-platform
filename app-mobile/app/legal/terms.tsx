import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Terms & Conditions Screen
 * Display full legal terms with localization support
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { Asset } from 'expo-asset';

export default function TermsScreen() {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTerms();
  }, [locale]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      
      // Load the appropriate markdown file based on locale
      const fileName = locale === 'pl' ? 'terms-pl.md' : 'terms-en.md';
      const assetPath = `../../assets/legal/${fileName}`;
      
      // Load the markdown content
      const asset = Asset.fromModule(LEGAL_REGISTRY);
      await asset.downloadAsync();
      
      // Read the file content
      const response = await fetch(asset.localUri || asset.uri);
      const text = await response.text();
      
      setContent(text);
    } catch (error) {
      console.error('Error loading terms:', error);
      // Fallback content
      setContent(getStaticTerms());
    } finally {
      setLoading(false);
    }
  };

  const getStaticTerms = () => {
    if (locale === 'pl') {
      return `# Regulamin

**Ostatnia aktualizacja: 22 listopada 2024**

Witamy w Avalo. Niniejszy Regulamin reguluje dostęp do platformy Avalo i korzystanie z niej.

## 1. Akceptacja Regulaminu
Uzyskując dostęp do Avalo lub korzystając z niego, zgadzasz się na przestrzeganie niniejszego Regulaminu.

## 2. Kwalifikowalność
Musisz mieć ukończone 18 lat, aby korzystać z Avalo.

W przypadku pytań dotyczących Regulaminu, skontaktuj się z nami: legal@avalo.app`;
    }
    
    return `# Terms & Conditions

**Last Updated: November 22, 2024**

Welcome to Avalo. These Terms & Conditions govern your access to and use of the Avalo platform.

## 1. Acceptance of Terms
By accessing or using Avalo, you agree to be bound by these Terms.

## 2. Eligibility
You must be at least 18 years old to use Avalo.

For questions about these Terms, contact us at: legal@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Regulamin' : 'Terms & Conditions',
          headerBackTitle: locale === 'pl' ? 'Wstecz' : 'Back',
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>
            {locale === 'pl' ? 'Ładowanie...' : 'Loading...'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.content} selectable>
            {content}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  content: {
    fontSize: 14,
    lineHeight: 22,
    color: '#374151',
    fontFamily: 'System',
  },
});






