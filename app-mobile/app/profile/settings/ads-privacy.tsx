/**
 * PACK 121 — Avalo Global Ads Network
 * Ads & Privacy Settings Screen
 * 
 * Allows users to control ad preferences and learn about privacy
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

interface UserAdPreferences {
  userId: string;
  hiddenCategories: string[];
  updatedAt: Date;
}

const AD_CATEGORIES = [
  { id: 'RETAIL', name: 'Retail & Shopping', description: 'Clothing, accessories, products' },
  { id: 'TECH', name: 'Technology', description: 'Gadgets, apps, software' },
  { id: 'ENTERTAINMENT', name: 'Entertainment', description: 'Movies, games, music' },
  { id: 'FOOD', name: 'Food & Beverage', description: 'Restaurants, food delivery' },
  { id: 'TRAVEL', name: 'Travel', description: 'Hotels, flights, experiences' },
  { id: 'FITNESS', name: 'Fitness & Wellness', description: 'Gym, health, wellness' },
  { id: 'EDUCATION', name: 'Education', description: 'Courses, books, learning' },
  { id: 'AUTOMOTIVE', name: 'Automotive', description: 'Cars, parts, services' },
  { id: 'HOME', name: 'Home & Garden', description: 'Furniture, decor, tools' },
  { id: 'BEAUTY', name: 'Beauty & Personal Care', description: 'Cosmetics, skincare' },
];

export default function AdsPrivacySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const getPreferencesFn = httpsCallable(functions, 'pack121_getAdPreferences');
      const result: any = await getPreferencesFn();
      
      if (result.data.success && result.data.preferences) {
        setHiddenCategories(result.data.preferences.hiddenCategories || []);
      }
    } catch (error) {
      console.error('Failed to load ad preferences:', error);
      Alert.alert('Error', 'Failed to load your preferences');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = async (categoryId: string) => {
    const newHiddenCategories = hiddenCategories.includes(categoryId)
      ? hiddenCategories.filter(id => id !== categoryId)
      : [...hiddenCategories, categoryId];

    setHiddenCategories(newHiddenCategories);
    await savePreferences(newHiddenCategories);
  };

  const savePreferences = async (categories: string[]) => {
    setSaving(true);
    try {
      const updatePreferencesFn = httpsCallable(functions, 'pack121_updateAdPreferences');
      await updatePreferencesFn({
        hiddenCategories: categories,
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      Alert.alert('Error', 'Failed to save your preferences');
    } finally {
      setSaving(false);
    }
  };

  const isCategoryHidden = (categoryId: string) => {
    return hiddenCategories.includes(categoryId);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Ads & Privacy' }} />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Ads & Privacy',
          headerRight: () => saving ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : null,
        }} 
      />

      <ScrollView style={styles.scrollView}>
        {/* Privacy Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerTitle}>🔒 Your Privacy Matters</Text>
          <Text style={styles.infoBannerText}>
            Avalo shows ads to support the platform, but we never:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletPoint}>• Sell your personal data</Text>
            <Text style={styles.bulletPoint}>• Track you across other apps</Text>
            <Text style={styles.bulletPoint}>• Read your private messages</Text>
            <Text style={styles.bulletPoint}>• Share your activity with advertisers</Text>
          </View>
        </View>

        {/* How Targeting Works */}
        <TouchableOpacity
          style={styles.infoCard}
          onPress={() => setShowInfo(!showInfo)}
        >
          <View style={styles.infoCardHeader}>
            <Text style={styles.infoCardTitle}>How ad targeting works</Text>
            <Text style={styles.expandIcon}>{showInfo ? '▼' : '▶'}</Text>
          </View>
          {showInfo && (
            <View style={styles.infoCardContent}>
              <Text style={styles.infoText}>
                Ads are selected based on:{'\n\n'}
                • Your region and language{'\n'}
                • Your age segment (18-24, 25-34, etc.){'\n'}
                • Public interests (derived from content you view, not your messages){'\n'}
                • Device type{'\n\n'}
                <Text style={styles.boldText}>What we DON'T use:</Text>{'\n'}
                • Your private messages{'\n'}
                • Your earnings or spending{'\n'}
                • Your relationships or follows{'\n'}
                • Data from other apps or websites
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Category Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hide Ad Categories</Text>
          <Text style={styles.sectionDescription}>
            Choose which types of ads you don't want to see. This won't affect your experience.
          </Text>

          {AD_CATEGORIES.map((category) => (
            <View key={category.id} style={styles.categoryItem}>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </View>
              <Switch
                value={isCategoryHidden(category.id)}
                onValueChange={() => toggleCategory(category.id)}
                trackColor={{ false: '#E5E5E5', true: '#34C759' }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </View>

        {/* Transparency Statement */}
        <View style={styles.transparencyCard}>
          <Text style={styles.transparencyTitle}>Our Commitment</Text>
          <Text style={styles.transparencyText}>
            Ads help us keep Avalo free while paying creators fairly. We're committed to:
          </Text>
          <View style={styles.commitmentList}>
            <Text style={styles.commitmentItem}>✓ Safety-first advertising (no NSFW or gambling)</Text>
            <Text style={styles.commitmentItem}>✓ Privacy-safe targeting only</Text>
            <Text style={styles.commitmentItem}>✓ No impact on creator rankings</Text>
            <Text style={styles.commitmentItem}>✓ Full transparency about data use</Text>
          </View>
        </View>

        {/* Report Ad Note */}
        <View style={styles.reportNote}>
          <Text style={styles.reportNoteText}>
            💡 See an inappropriate ad? Tap the info button (ⓘ) on any ad to report it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 8,
  },
  bulletList: {
    marginLeft: 8,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 4,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  expandIcon: {
    fontSize: 14,
    color: '#666666',
  },
  infoCardContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#666666',
  },
  boldText: {
    fontWeight: '700',
    color: '#000000',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  categoryInfo: {
    flex: 1,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 12,
    color: '#666666',
  },
  transparencyCard: {
    backgroundColor: '#F0F9FF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  transparencyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  transparencyText: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 12,
  },
  commitmentList: {
    marginLeft: 4,
  },
  commitmentItem: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 6,
    lineHeight: 20,
  },
  reportNote: {
    backgroundColor: '#FFF9E6',
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  reportNoteText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
});
