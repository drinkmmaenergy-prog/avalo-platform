import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Age Verification Policy Screen
 * Display full age verification policy with localization support
 */

const LEGAL_ASSETS: Record<string, any> = {
  'age/terms-pl.md': LEGAL_REGISTRY,
  'age/terms-en.md': LEGAL_REGISTRY,
  'privacy/pl.md': LEGAL_REGISTRY,
  'privacy/en.md': LEGAL_REGISTRY,
}

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

export default function AgeVerificationScreen() {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgeVerification();
  }, [locale]);

  const loadAgeVerification = async () => {
    try {
      setLoading(true);
      
      // Load the appropriate markdown file based on locale
      const fileName = 'age-verification-policy.md';
      const folderName = locale === 'pl' ? 'pl' : 'en';
      
      // Load the markdown content
const assetKey = `${folderName}/${fileName}`;
const moduleRef = LEGAL_ASSETS[assetKey];

if (!moduleRef) {
  throw new Error(`Missing legal asset: ${assetKey}`);
}

const asset = Asset.fromModule(moduleRef);
await asset.downloadAsync();
      await asset.downloadAsync();
      
      // Read the file content
      const response = await fetch(asset.localUri || asset.uri);
      const text = await response.text();
      
      setContent(text);
    } catch (error) {
      console.error('Error loading age verification policy:', error);
      // Fallback content
      setContent(getStaticAgeVerification());
    } finally {
      setLoading(false);
    }
  };

  const getStaticAgeVerification = () => {
    if (locale === 'pl') {
      return `# Polityka Weryfikacji Wieku Avalo

**Ostatnia aktualizacja: 22 stycznia 2025**

Avalo jest platformą wyłącznie dla dorosłych, zaprojektowaną dla użytkowników w wieku 18 lat lub starszych.

Aby uzyskać pełną Politykę Weryfikacji Wieku, odwiedź avalo.app lub skontaktuj się z verification@avalo.app`;
    }
    
    return `# Avalo Age Verification Policy

**Last Updated: January 22, 2025**

Avalo is an adults-only platform designed exclusively for users aged 18 years or older.

For the complete Age Verification Policy, visit avalo.app or contact verification@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Polityka Weryfikacji Wieku' : 'Age Verification Policy',
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






