import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Creator Monetization Policy Screen
 * Display full creator monetization policy with localization support
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

export default function CreatorMonetizationScreen() {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCreatorMonetization();
  }, [locale]);

  const loadCreatorMonetization = async () => {
    try {
      setLoading(true);
      
      // Load the appropriate markdown file based on locale
      const fileName = 'creator-monetization-policy.md';
      const folderName = locale === 'pl' ? 'pl' : 'en';
      
      // Load the markdown content
      const asset = Asset.fromModule(LEGAL_REGISTRY);
      await asset.downloadAsync();
      
      // Read the file content
      const response = await fetch(asset.localUri || asset.uri);
      const text = await response.text();
      
      setContent(text);
    } catch (error) {
      console.error('Error loading creator monetization policy:', error);
      // Fallback content
      setContent(getStaticCreatorMonetization());
    } finally {
      setLoading(false);
    }
  };

  const getStaticCreatorMonetization = () => {
    if (locale === 'pl') {
      return `# Polityka Monetyzacji Twórców Avalo

**Ostatnia aktualizacja: 22 stycznia 2025**

Avalo daje Twórcom możliwość budowania znaczących połączeń przy jednoczesnym zarabianiu dzięki autentycznemu zaangażowaniu.

Aby uzyskać pełną Politykę Monetyzacji Twórców, odwiedź avalo.app lub skontaktuj się z creators@avalo.app`;
    }
    
    return `# Avalo Creator Monetization Policy

**Last Updated: January 22, 2025**

Avalo empowers Creators to build meaningful connections while earning income through authentic engagement.

For the complete Creator Monetization Policy, visit avalo.app or contact creators@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Polityka Monetyzacji Twórców' : 'Creator Monetization Policy',
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






