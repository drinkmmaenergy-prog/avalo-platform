import { getLegalDoc } from '@/shared/legal/legalRegistry';
import { LEGAL_REGISTRY } from '@/shared/legal/legalRegistry';
/**
 * Community Rules Screen
 * Display full community guidelines with localization support
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
import { Asset } from 'expo-asset';
import { useTranslation } from "@/hooks/useTranslation";

/* =========================
   STATIC ASSET MAP (REQUIRED)
   ========================= */

const COMMUNITY_ASSETS = {
  pl: LEGAL_REGISTRY,
  en: LEGAL_REGISTRY,
} as const;

type SupportedLocale = keyof typeof COMMUNITY_ASSETS;

export default function CommunityScreen() {
  const { locale } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommunityRules();
  }, [locale]);

  const loadCommunityRules = async () => {
    try {
      setLoading(true);

      const lang: SupportedLocale = locale === 'pl' ? 'pl' : 'en';
      const assetModule = COMMUNITY_ASSETS[lang];

      const asset = Asset.fromModule(assetModule);
      await asset.downloadAsync();

      const response = await fetch(asset.localUri ?? asset.uri);
      const text = await response.text();

      setContent(text);
    } catch (error) {
      console.error('Error loading community rules:', error);
      setContent(getStaticCommunityRules());
    } finally {
      setLoading(false);
    }
  };

  const getStaticCommunityRules = () => {
    if (locale === 'pl') {
      return `# Zasady Społeczności

**Ostatnia aktualizacja: 22 listopada 2024**

Witamy w społeczności Avalo!

## 1. Podstawowe Wartości
- Szacunek
- Bezpieczeństwo
- Autentyczność
- Inkluzywność
- Odpowiedzialność

## 2. Zabronione Zachowania
- Nękanie i nadużycia
- Nielegalne działania
- Szkodliwe treści
- Spam

Kontakt: community@avalo.app`;
    }

    return `# Community Rules

**Last Updated: November 22, 2024**

Welcome to the Avalo community!

## 1. Core Values
- Respect
- Safety
- Authenticity
- Inclusivity
- Responsibility

## 2. Prohibited Behavior
- Harassment
- Illegal activities
- Harmful content
- Spam

Contact: community@avalo.app`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Zasady Społeczności' : 'Community Rules',
          headerBackTitle: locale === 'pl' ? 'Wstecz' : 'Back',
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>
            {locale === 'pl' ? 'Ładowanie…' : 'Loading…'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.content} selectable>
            {content}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

/* =========================
   STYLES
   ========================= */

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
  },
});







