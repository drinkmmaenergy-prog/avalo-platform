/**
 * Trust Warning Banner Component
 * 
 * Displays a warning banner when a user profile has high risk flags.
 * This is informational only and does not change pricing or economic flows.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTrustState, isUserHighRisk, TrustState } from '../services/trustService';

interface TrustWarningBannerProps {
  userId: string;
  locale?: 'en' | 'pl';
}

export const TrustWarningBanner: React.FC<TrustWarningBannerProps> = ({ 
  userId, 
  locale = 'en' 
}) => {
  const [trustState, setTrustState] = useState<TrustState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrustState();
  }, [userId]);

  const loadTrustState = async () => {
    try {
      const state = await getTrustState(userId);
      setTrustState(state);
    } catch (error) {
      console.error('Error loading trust state:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !trustState) {
    return null;
  }

  const showWarning = isUserHighRisk(trustState);

  if (!showWarning) {
    return null;
  }

  const warningText = locale === 'pl' 
    ? '⚠ Ten profil był zgłaszany przez innych użytkowników. Zachowaj ostrożność.'
    : '⚠ This profile has been reported by other users. Interact with caution.';

  return (
    <View style={styles.container}>
      <Text style={styles.warningText}>{warningText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default TrustWarningBanner;
