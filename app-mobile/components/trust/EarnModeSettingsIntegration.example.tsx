/**
 * EXAMPLE: Earn Mode Settings Integration with Trust Engine
 * 
 * This file demonstrates how to control the "earns from chat" toggle
 * based on the user's trust state (earnModeAllowed).
 * 
 * Copy relevant parts to your actual settings/profile screen.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { getTrustState, isEarnModeAllowed, TrustState } from '../../services/trustService';

interface EarnModeSettingsProps {
  currentUserId: string;
  locale?: 'en' | 'pl';
}

export const EarnModeSettingsExample: React.FC<EarnModeSettingsProps> = ({
  currentUserId,
  locale = 'en'
}) => {
  const [trustState, setTrustState] = useState<TrustState | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnModeEnabled, setEarnModeEnabled] = useState(false);

  useEffect(() => {
    loadTrustState();
    loadEarnModePreference();
  }, [currentUserId]);

  const loadTrustState = async () => {
    try {
      const state = await getTrustState(currentUserId);
      setTrustState(state);
    } catch (error) {
      console.error('Error loading trust state:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEarnModePreference = async () => {
    // Load from AsyncStorage or user preferences
    // This is a placeholder - integrate with your actual preference storage
    setEarnModeEnabled(false);
  };

  const handleToggleEarnMode = async (enabled: boolean) => {
    // Only allow change if earnModeAllowed is true
    if (!trustState || !isEarnModeAllowed(trustState)) {
      // Cannot enable if not allowed
      return;
    }

    setEarnModeEnabled(enabled);

    // Save to backend/AsyncStorage
    // This is a placeholder - integrate with your actual save logic
    try {
      // await saveEarnModePreference(currentUserId, enabled);
      console.log('Earn mode preference saved:', enabled);
    } catch (error) {
      console.error('Error saving earn mode preference:', error);
      // Revert on error
      setEarnModeEnabled(!enabled);
    }
  };

  const canEarn = trustState ? isEarnModeAllowed(trustState) : true;

  // Text labels
  const title = locale === 'pl' ? 'Zarabianie na czacie' : 'Earn from chat';
  const description = locale === 'pl'
    ? 'Włącz aby zarabiać gdy inni wysyłają Ci płatne wiadomości'
    : 'Enable to earn when others send you paid messages';
  const disabledMessage = locale === 'pl'
    ? 'Zarabianie na czacie jest tymczasowo wyłączone na Twoim koncie.'
    : 'Earning from chat is temporarily disabled on your account.';

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
          
          {!canEarn && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠ {disabledMessage}</Text>
            </View>
          )}
        </View>

        <Switch
          value={earnModeEnabled}
          onValueChange={handleToggleEarnMode}
          disabled={!canEarn}
          trackColor={{ false: '#CCC', true: '#34C759' }}
          thumbColor={earnModeEnabled ? '#fff' : '#f4f3f4'}
        />
      </View>

      {/* Optional: Show trust score info */}
      {trustState && (
        <View style={styles.trustInfo}>
          <Text style={styles.trustInfoText}>
            {locale === 'pl' ? 'Wynik zaufania' : 'Trust score'}: {trustState.trustScore}/100
          </Text>
          {trustState.trustScore < 40 && (
            <Text style={styles.trustInfoHint}>
              {locale === 'pl'
                ? 'Zwiększ wynik zaufania poprzez pozytywne interakcje'
                : 'Increase trust score through positive interactions'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 3,
    borderLeftColor: '#FFA500',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
  },
  trustInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  trustInfoText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  trustInfoHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default EarnModeSettingsExample;
