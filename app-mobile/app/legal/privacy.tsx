import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Privacy Policy Screen
 * Display full privacy policy with localization support
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

export default function PrivacyScreen() {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrivacy();
  }, [locale]);

  const loadPrivacy = async () => {
    try {
      setLoading(true);
      
      // Load the appropriate markdown file based on locale
      const fileName = locale === 'pl' ? 'privacy-pl.md' : 'privacy-en.md';
      const assetPath = `../../assets/legal/${fileName}`;
      
      // Load the markdown content
      const asset = Asset.fromModule(LEGAL_REGISTRY);
      await asset.downloadAsync();
      
      // Read the file content
      const response = await fetch(asset.localUri || asset.uri);
      const text = await response.text();
      
      setContent(text);
    } catch (error) {
      console.error('Error loading privacy policy:', error);
      // Fallback content
      setContent(getStaticPrivacy());
    } finally {
      setLoading(false);
    }
  };

  const getStaticPrivacy = () => {
    if (locale === 'pl') {
      return `# Polityka Prywatności

**Ostatnia aktualizacja: 22 listopada 2024**

Niniejsza Polityka Prywatności opisuje, w jaki sposób Avalo zbiera, wykorzystuje i udostępnia Twoje dane osobowe.

## 1. Informacje, Które Zbieramy
- Informacje o koncie
- Informacje profilowe
- Dane o użytkowaniu
- Informacje płatnicze

## 2. Jak Wykorzystujemy Twoje Informacje
Wykorzystujemy Twoje informacje do świadczenia i ulepszania Usługi.

W przypadku pytań dotyczących prywatności, skontaktuj się z nami: privacy@avalo.app`;
    }
    
    return `# Privacy Policy

**Last Updated: November 22, 2024**

This Privacy Policy describes how Avalo collects, uses, and shares your personal information.

## 1. Information We Collect
- Account information
- Profile information
- Usage data
- Payment information

## 2. How We Use Your Information
We use your information to provide and improve the Service.

For questions about privacy, contact us at: privacy@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Polityka Prywatności' : 'Privacy Policy',
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






