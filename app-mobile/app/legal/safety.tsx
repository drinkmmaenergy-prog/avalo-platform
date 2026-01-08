import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Safety Policy Screen
 * Display full safety policy with localization support
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

export default function SafetyScreen() {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSafety();
  }, [locale]);

  const loadSafety = async () => {
    try {
      setLoading(true);
      
      // Load the appropriate markdown file based on locale
      const fileName = locale === 'pl' ? 'safety-policy.md' : 'safety-policy.md';
      const folderName = locale === 'pl' ? 'pl' : 'en';
      
      // Load the markdown content
      const asset = Asset.fromModule(LEGAL_REGISTRY);
      await asset.downloadAsync();
      
      // Read the file content
      const response = await fetch(asset.localUri || asset.uri);
      const text = await response.text();
      
      setContent(text);
    } catch (error) {
      console.error('Error loading safety policy:', error);
      // Fallback content
      setContent(getStaticSafety());
    } finally {
      setLoading(false);
    }
  };

  const getStaticSafety = () => {
    if (locale === 'pl') {
      return `# Polityka Bezpieczeństwa Avalo

**Ostatnia aktualizacja: 22 stycznia 2025**

Avalo jest zaangażowane w tworzenie bezpiecznego, chronionego i godnego zaufania środowiska dla wszystkich użytkowników.

Aby uzyskać pełną Politykę Bezpieczeństwa, odwiedź avalo.app lub skontaktuj się z safety@avalo.app`;
    }
    
    return `# Avalo Safety Policy

**Last Updated: January 22, 2025**

Avalo is committed to creating a safe, secure, and trustworthy environment for all users.

For the complete Safety Policy, visit avalo.app or contact safety@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Polityka Bezpieczeństwa' : 'Safety Policy',
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






