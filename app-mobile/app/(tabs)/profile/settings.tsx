/**
 * Settings Screen - Phase 17 Integration + Phase 29 Multilang
 * App settings including ads preferences for VIP/Royal users and language selection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useLocaleContext } from "@/contexts/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Locale, Region } from "@/hooks/useLocale";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { locale, region, currency, currencySymbol, isAutoDetected, changeLocale, changeRegion } = useLocaleContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // User profile data
  const [isVIPorRoyal, setIsVIPorRoyal] = useState(false);
  const [showAdsToEarnTokens, setShowAdsToEarnTokens] = useState(false);
  
  // Other settings
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      loadSettings();
    }
  }, [user?.uid]);

  const loadSettings = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const app = getApp();
      const db = getFirestore(app);
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // Check if user is VIP or Royal
        const isVIP = userData.roles?.vip || userData.vipMember || false;
        const isRoyal = userData.roles?.royal || userData.royalClubTier !== undefined || false;
        setIsVIPorRoyal(isVIP || isRoyal);
        
        // Load ads preference (default is false for VIP/Royal)
        setShowAdsToEarnTokens(userData.showAdsToEarnTokens || false);
        
        // Load other settings
        setNotifications(userData.notificationsEnabled ?? true);
        setEmailUpdates(userData.emailUpdatesEnabled ?? false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAds = async (value: boolean) => {
    if (!user?.uid) return;
    
    try {
      setSaving(true);
      const app = getApp();
      const db = getFirestore(app);
      const userRef = doc(db, 'users', user.uid);
      
      await updateDoc(userRef, {
        showAdsToEarnTokens: value,
        updatedAt: new Date(),
      });
      
      setShowAdsToEarnTokens(value);
      
      Alert.alert(
        'Settings Updated',
        value
          ? 'You will now see ads in discovery/feed. Visit the Earn Tokens screen to watch rewarded ads!'
          : 'Passive ads will be hidden. You can still watch rewarded ads in the Earn Tokens screen.'
      );
    } catch (error) {
      console.error('Error updating ads setting:', error);
      Alert.alert('Error', 'Failed to update setting');
      setShowAdsToEarnTokens(!value); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (!user?.uid) return;
    
    try {
      const app = getApp();
      const db = getFirestore(app);
      const userRef = doc(db, 'users', user.uid);
      
      await updateDoc(userRef, {
        notificationsEnabled: value,
        updatedAt: new Date(),
      });
      
      setNotifications(value);
    } catch (error) {
      console.error('Error updating notifications:', error);
      setNotifications(!value);
    }
  };

  const handleToggleEmailUpdates = async (value: boolean) => {
    if (!user?.uid) return;
    
    try {
      const app = getApp();
      const db = getFirestore(app);
      const userRef = doc(db, 'users', user.uid);
      
      await updateDoc(userRef, {
        emailUpdatesEnabled: value,
        updatedAt: new Date(),
      });
      
      setEmailUpdates(value);
    } catch (error) {
      console.error('Error updating email updates:', error);
      setEmailUpdates(!value);
    }
  };

  const handleChangeLanguage = async (newLocale: Locale) => {
    try {
      await changeLocale(newLocale);
      Alert.alert(
        'Language Changed',
        `Language has been changed to ${newLocale === 'pl' ? 'Polish' : 'English'}`
      );
    } catch (error) {
      console.error('Error changing language:', error);
      Alert.alert('Error', 'Failed to change language');
    }
  };

  const handleChangeRegion = async (newRegion: Region) => {
    try {
      await changeRegion(newRegion);
      Alert.alert(
        'Region Changed',
        `Region has been changed. Currency: ${currencySymbol}`
      );
    } catch (error) {
      console.error('Error changing region:', error);
      Alert.alert('Error', 'Failed to change region');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Settings' }} />
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerBackTitle: 'Back',
        }}
      />

      {/* Language & Region Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌍 Language & Region</Text>
        {isAutoDetected && (
          <Text style={styles.sectionDescription}>
            Language and region were automatically detected based on your device settings.
          </Text>
        )}
        
        <View style={styles.languageContainer}>
          <Text style={styles.settingTitle}>App Language</Text>
          <View style={styles.languageButtons}>
            <TouchableOpacity
              style={[
                styles.languageButton,
                locale === 'en' && styles.languageButtonActive,
              ]}
              onPress={() => handleChangeLanguage('en')}
            >
              <Text style={[
                styles.languageButtonText,
                locale === 'en' && styles.languageButtonTextActive,
              ]}>
                🇬🇧 English
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.languageButton,
                locale === 'pl' && styles.languageButtonActive,
              ]}
              onPress={() => handleChangeLanguage('pl')}
            >
              <Text style={[
                styles.languageButtonText,
                locale === 'pl' && styles.languageButtonTextActive,
              ]}>
                🇵🇱 Polski
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.regionContainer}>
          <Text style={styles.settingTitle}>Region & Currency</Text>
          <View style={styles.regionInfo}>
            <View style={styles.regionItem}>
              <Text style={styles.regionLabel}>Detected Region:</Text>
              <Text style={styles.regionValue}>{region}</Text>
            </View>
            <View style={styles.regionItem}>
              <Text style={styles.regionLabel}>Currency:</Text>
              <Text style={styles.regionValue}>{currency} ({currencySymbol})</Text>
            </View>
          </View>
          <Text style={styles.regionNote}>
            💡 Prices are displayed in your local currency for convenience. Token amounts remain the same.
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ℹ️ Changing language updates the app interface. Your chats and profile can be translated on-demand.
          </Text>
        </View>
      </View>

      {/* VIP/Royal Ads Section */}
      {isVIPorRoyal && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💎 Premium Features</Text>
          <Text style={styles.sectionDescription}>
            As a {isVIPorRoyal ? 'VIP/Royal' : 'premium'} member, you have control over your ad experience.
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Show Ads to Earn Tokens</Text>
              <Text style={styles.settingDescription}>
                {showAdsToEarnTokens
                  ? 'Ads are enabled. You can earn tokens from rewarded ads.'
                  : 'Passive ads are hidden. You can still watch rewarded ads explicitly.'}
              </Text>
            </View>
            <Switch
              value={showAdsToEarnTokens}
              onValueChange={handleToggleAds}
              disabled={saving}
              trackColor={{ false: '#E5E7EB', true: '#4CAF50' }}
              thumbColor={showAdsToEarnTokens ? '#fff' : '#f4f3f4'}
            />
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              ℹ️ With this ON, you'll see ads in discovery/feed and can earn tokens. 
              With it OFF, you won't see passive ads but can still watch rewarded ads explicitly.
            </Text>
          </View>
        </View>
      )}

      {/* Earn Tokens Link for All Users */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 Earn Tokens</Text>
        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/(tabs)/earn-tokens' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>Watch Ads & Earn</Text>
            <Text style={styles.linkDescription}>
              Earn up to 220 tokens per day by watching rewarded ads
            </Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔔 Notifications</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Push Notifications</Text>
            <Text style={styles.settingDescription}>
              Get notified about matches, messages, and important updates
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: '#E5E7EB', true: '#4CAF50' }}
            thumbColor={notifications ? '#fff' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Email Updates</Text>
            <Text style={styles.settingDescription}>
              Receive weekly summaries and promotional emails
            </Text>
          </View>
          <Switch
            value={emailUpdates}
            onValueChange={handleToggleEmailUpdates}
            trackColor={{ false: '#E5E7EB', true: '#4CAF50' }}
            thumbColor={emailUpdates ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Legal Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 {t('legal.legal')}</Text>
        
        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/terms' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.terms')}</Text>
            <Text style={styles.linkDescription}>{t('legal.termsDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/privacy' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.privacy')}</Text>
            <Text style={styles.linkDescription}>{t('legal.privacyDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/community' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.community')}</Text>
            <Text style={styles.linkDescription}>{t('legal.communityDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/safety' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.safety')}</Text>
            <Text style={styles.linkDescription}>{t('legal.safetyDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/creator-monetization' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.creatorMonetization')}</Text>
            <Text style={styles.linkDescription}>{t('legal.creatorMonetizationDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/legal/age-verification' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('legal.ageVerification')}</Text>
            <Text style={styles.linkDescription}>{t('legal.ageVerificationDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Safety & Restrictions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛡️ {t('safety.safetyAndRestrictions')}</Text>
        
        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/safety/status' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('safety.yourSafetyStatus')}</Text>
            <Text style={styles.linkDescription}>{t('safety.viewAccountStatus')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/safety/history' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('safety.moderationHistory')}</Text>
            <Text style={styles.linkDescription}>{t('safety.viewPastIncidents')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkItem}
          onPress={() => router.push('/safety/appeal' as any)}
        >
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>{t('safety.submitAppeal')}</Text>
            <Text style={styles.linkDescription}>{t('safety.appealDescription')}</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👤 Account</Text>
        
        <TouchableOpacity style={styles.linkItem} onPress={() => {}}>
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>About</Text>
            <Text style={styles.linkDescription}>App version 1.0.0</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacing} />
    </ScrollView>
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
    backgroundColor: '#F9FAFB',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 20,
    marginBottom: 12,
    lineHeight: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  linkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  linkDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  linkArrow: {
    fontSize: 28,
    color: '#D1D5DB',
    marginLeft: 12,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  languageContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  languageButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#F0F9F4',
  },
  languageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  languageButtonTextActive: {
    color: '#4CAF50',
  },
  regionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  regionInfo: {
    marginTop: 8,
    marginBottom: 8,
  },
  regionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  regionLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  regionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  regionNote: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  bottomSpacing: {
    height: 32,
  },
});
