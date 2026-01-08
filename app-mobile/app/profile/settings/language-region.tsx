/**
 * PACK 295 — Globalization & Localization
 * Language & Region Settings Screen
 * Allows users to view and configure language and regional settings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  SUPPORTED_LOCALES,
  LOCALE_METADATA,
  LocaleCode,
  getRegionConfig,
  detectTimezone,
  getCurrencyForRegion,
  CURRENCY_METADATA,
  formatCurrency,
} from '@avalo/i18n';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

interface UserLocaleProfile {
  userId: string;
  preferredLocale: LocaleCode;
  deviceLocaleLast: LocaleCode;
  regionCountry: string;
  timeZone: string;
  createdAt: string;
  updatedAt: string;
}

interface RegionInfo {
  country: string;
  countryName: string;
  currency: string;
  timezone: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function LanguageAndRegionScreen() {
  const [currentLocale, setCurrentLocale] = useState<LocaleCode>('en-US');
  const [regionInfo, setRegionInfo] = useState<RegionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in to access settings');
        router.back();
        return;
      }

      // Load user locale profile from Firestore
      const userLocaleRef = doc(db, 'userLocales', user.uid);
      const userLocaleDoc = await getDoc(userLocaleRef);
      
      if (userLocaleDoc.exists()) {
        const profile = userLocaleDoc.data() as UserLocaleProfile;
        setCurrentLocale(profile.preferredLocale);
        
        // Get region information
        const config = getRegionConfig(profile.regionCountry);
        const currency = getCurrencyForRegion(profile.regionCountry);
        
        setRegionInfo({
          country: profile.regionCountry,
          countryName: getCountryName(profile.regionCountry),
          currency: currency,
          timezone: profile.timeZone,
        });
      } else {
        // Initialize with detected locale
        const detectedTimezone = detectTimezone();
        const detectedLocale: LocaleCode = 'en-US'; // Would use detection in production
        const detectedCountry = 'US';
        
        const newProfile: UserLocaleProfile = {
          userId: user.uid,
          preferredLocale: detectedLocale,
          deviceLocaleLast: detectedLocale,
          regionCountry: detectedCountry,
          timeZone: detectedTimezone,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await setDoc(userLocaleRef, newProfile);
        setCurrentLocale(detectedLocale);
        
        const currency = getCurrencyForRegion(detectedCountry);
        setRegionInfo({
          country: detectedCountry,
          countryName: getCountryName(detectedCountry),
          currency: currency,
          timezone: detectedTimezone,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load language and region settings');
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = async (newLocale: LocaleCode) => {
    if (newLocale === currentLocale) return;
    
    try {
      Alert.alert(
        'Change Language?',
        'The app will reload to apply the new language.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change',
            onPress: async () => {
              setSaving(true);
              
              const user = auth.currentUser;
              if (!user) return;
              
              // Update Firestore
              const userLocaleRef = doc(db, 'userLocales', user.uid);
              await updateDoc(userLocaleRef, {
                preferredLocale: newLocale,
                updatedAt: new Date().toISOString(),
              });
              
              setCurrentLocale(newLocale);
              setSaving(false);
              
              Alert.alert('Success', 'Language changed successfully. Please restart the app to see changes.');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error changing language:', error);
      Alert.alert('Error', 'Failed to change language');
      setSaving(false);
    }
  };

  const renderLanguageItem = (locale: LocaleCode) => {
    const metadata = LOCALE_METADATA[locale];
    const isSelected = locale === currentLocale;
    const isRTL = metadata.direction === 'rtl';

    return (
      <TouchableOpacity
        key={locale}
        style={[styles.languageItem, isSelected && styles.languageItemSelected]}
        onPress={() => handleLanguageChange(locale)}
        disabled={saving}
      >
        <View style={styles.languageInfo}>
          <Text style={[styles.languageName, isSelected && styles.textSelected]}>
            {metadata.nativeName}
          </Text>
          <Text style={[styles.languageEnglishName, isSelected && styles.textSelected]}>
            {metadata.englishName}
          </Text>
          {isRTL && (
            <Text style={styles.rtlBadge}>RTL</Text>
          )}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
        )}
      </TouchableOpacity>
    );
  };

  const getContentRestrictions = () => {
    if (!regionInfo) return [];
    
    const config = getRegionConfig(regionInfo.country);
    const restrictions = [];
    
    if (!config.allowBikini) restrictions.push('Bikini content restricted');
    if (!config.allowLingerie) restrictions.push('Lingerie content restricted');
    if (!config.allowSoftEroticPhoto) restrictions.push('Soft erotic content restricted');
    if (!config.allowAdultWebContent) restrictions.push('Adult web content restricted');
    
    return restrictions;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  const restrictions = getContentRestrictions();
  const regionConfig = regionInfo ? getRegionConfig(regionInfo.country) : null;
  const currencyMeta = regionInfo ? CURRENCY_METADATA[regionInfo.currency as any] : null;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Language & Region</Text>
      </View>

      {/* Region Information */}
      {regionInfo && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Region</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="location" size={20} color="#666" />
              <Text style={styles.infoLabel}>Region:</Text>
              <Text style={styles.infoValue}>{regionInfo.countryName} ({regionInfo.country})</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="cash" size={20} color="#666" />
              <Text style={styles.infoLabel}>Currency:</Text>
              <Text style={styles.infoValue}>
                {currencyMeta?.name} ({currencyMeta?.symbol})
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time" size={20} color="#666" />
              <Text style={styles.infoLabel}>Timezone:</Text>
              <Text style={styles.infoValue}>{regionInfo.timezone}</Text>
            </View>
            <Text style={styles.infoNote}>
              Region is automatically detected. Contact support to change if incorrect.
            </Text>
          </View>
        </View>
      )}

      {/* Regional Compliance Status */}
      {regionConfig && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Availability</Text>
          <View style={styles.infoCard}>
            <View style={styles.complianceRow}>
              <Ionicons
                name={restrictions.length === 0 ? 'checkmark-circle' : 'information-circle'}
                size={20}
                color={restrictions.length === 0 ? '#34C759' : '#FF9500'}
              />
              <Text style={styles.complianceText}>
                {restrictions.length === 0 
                  ? 'All content types available in your region'
                  : `${restrictions.length} content restriction(s) apply`
                }
              </Text>
            </View>
            {restrictions.length > 0 && (
              <View style={styles.restrictionsList}>
                {restrictions.map((restriction, index) => (
                  <Text key={index} style={styles.restrictionItem}>• {restriction}</Text>
                ))}
              </View>
            )}
            <View style={styles.complianceRow}>
              <Ionicons
                name={regionConfig.minimumAge === 18 ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={regionConfig.minimumAge === 18 ? '#34C759' : '#FF9500'}
              />
              <Text style={styles.complianceText}>
                Minimum age: {regionConfig.minimumAge}+
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Language Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display Language</Text>
        <Text style={styles.sectionDescription}>
          Choose your preferred language for the app interface
        </Text>
        <View style={styles.languageList}>
          {SUPPORTED_LOCALES.map(renderLanguageItem)}
        </View>
      </View>

      {/* Information Notice */}
      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={20} color="#666" />
        <Text style={styles.noticeText}>
          Token prices remain 0.20 PLN per token regardless of region or language. Currency display is for convenience only. The 65/35 and 80/20 splits apply globally.
        </Text>
      </View>

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getCountryName(countryCode: string): string {
  const names: Record<string, string> = {
    'PL': 'Poland',
    'US': 'United States',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'ES': 'Spain',
    'IT': 'Italy',
    'PT': 'Portugal',
    'BR': 'Brazil',
    'RU': 'Russia',
    'UA': 'Ukraine',
    'CZ': 'Czech Republic',
    'SK': 'Slovakia',
    'RO': 'Romania',
    'BG': 'Bulgaria',
    'HR': 'Croatia',
    'SI': 'Slovenia',
    'RS': 'Serbia',
    'HU': 'Hungary',
    'TR': 'Turkey',
    'SA': 'Saudi Arabia',
    'JP': 'Japan',
    'KR': 'South Korea',
    'CN': 'China',
    'TW': 'Taiwan',
  };
  return names[countryCode] || countryCode;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
    flex: 1,
  },
  infoNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  complianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  complianceText: {
    fontSize: 14,
    color: '#000',
    marginLeft: 8,
    flex: 1,
  },
  restrictionsList: {
    marginLeft: 28,
    marginTop: 8,
    marginBottom: 8,
  },
  restrictionItem: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  languageList: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  languageItemSelected: {
    backgroundColor: '#F0F8FF',
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  languageEnglishName: {
    fontSize: 12,
    color: '#666',
  },
  rtlBadge: {
    fontSize: 10,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '600',
  },
  textSelected: {
    color: '#007AFF',
  },
  notice: {
    flexDirection: 'row',
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 12,
    lineHeight: 18,
  },
  bottomSpacing: {
    height: 40,
  },
});
