/**
 * Swipe Icebreakers Settings Screen
 * PACK 38: Configure icebreaker preferences
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
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  SwipeIcebreakerStyle,
  getSwipeIcebreakerSettings,
  updateSwipeIcebreakerSettings,
} from "@/services/swipeIcebreakerService";
import { useTranslation } from "@/hooks/useTranslation";

export default function SwipeIcebreakersSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState<SwipeIcebreakerStyle>('ELEGANT');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const settings = await getSwipeIcebreakerSettings(currentUser.uid);
      setAutoSendEnabled(settings.autoSendOnSwipe);
      setSelectedStyle(settings.preferredStyle);
    } catch (error) {
      console.error('[SwipeIcebreakers] Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;

    try {
      setSaving(true);
      await updateSwipeIcebreakerSettings(currentUser.uid, {
        preferredStyle: selectedStyle,
        autoSendOnSwipe: autoSendEnabled,
      });

      Alert.alert(
        t('common.success'),
        'Swipe icebreaker settings saved successfully'
      );
      router.back();
    } catch (error) {
      console.error('[SwipeIcebreakers] Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleStyleSelect = (style: SwipeIcebreakerStyle) => {
    setSelectedStyle(style);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('swipeIcebreakers.settingsTitle')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Auto-send Toggle */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                {t('swipeIcebreakers.autoSendLabel')}
              </Text>
              <Text style={styles.settingDescription}>
                {t('swipeIcebreakers.autoSendDescription')}
              </Text>
            </View>
            <Switch
              value={autoSendEnabled}
              onValueChange={setAutoSendEnabled}
              trackColor={{ false: '#3E3E3E', true: '#D4AF37' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Style Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('swipeIcebreakers.styleLabel')}
          </Text>

          <TouchableOpacity
            style={[
              styles.styleCard,
              selectedStyle === 'ELEGANT' && styles.styleCardSelected,
            ]}
            onPress={() => handleStyleSelect('ELEGANT')}
            activeOpacity={0.7}
          >
            <View style={styles.styleCardContent}>
              <Text style={styles.styleCardTitle}>
                {t('swipeIcebreakers.styleElegant')}
              </Text>
              <Text style={styles.styleCardDescription}>
                Classy, slightly formal, high-value tone
              </Text>
            </View>
            {selectedStyle === 'ELEGANT' && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedIndicatorText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.styleCard,
              selectedStyle === 'PLAYFUL' && styles.styleCardSelected,
            ]}
            onPress={() => handleStyleSelect('PLAYFUL')}
            activeOpacity={0.7}
          >
            <View style={styles.styleCardContent}>
              <Text style={styles.styleCardTitle}>
                {t('swipeIcebreakers.stylePlayful')}
              </Text>
              <Text style={styles.styleCardDescription}>
                Light, teasing, friendly approach
              </Text>
            </View>
            {selectedStyle === 'PLAYFUL' && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedIndicatorText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.styleCard,
              selectedStyle === 'CONFIDENT' && styles.styleCardSelected,
            ]}
            onPress={() => handleStyleSelect('CONFIDENT')}
            activeOpacity={0.7}
          >
            <View style={styles.styleCardContent}>
              <Text style={styles.styleCardTitle}>
                {t('swipeIcebreakers.styleConfident')}
              </Text>
              <Text style={styles.styleCardDescription}>
                Bold, direct, self-assured tone
              </Text>
            </View>
            {selectedStyle === 'CONFIDENT' && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedIndicatorText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Helper Text */}
        <View style={styles.helperSection}>
          <Text style={styles.helperText}>
            These openers are only suggestions. You can always edit your message in chat.
          </Text>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#101010" />
          ) : (
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#101010',
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#999999',
    lineHeight: 20,
  },
  styleCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleCardSelected: {
    borderColor: '#D4AF37',
    backgroundColor: '#1F1F1F',
  },
  styleCardContent: {
    flex: 1,
  },
  styleCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  styleCardDescription: {
    fontSize: 13,
    color: '#999999',
  },
  selectedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIndicatorText: {
    color: '#101010',
    fontSize: 16,
    fontWeight: 'bold',
  },
  helperSection: {
    padding: 20,
  },
  helperText: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    backgroundColor: '#101010',
    borderTopWidth: 1,
    borderTopColor: '#282828',
  },
  saveButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#101010',
  },
});
