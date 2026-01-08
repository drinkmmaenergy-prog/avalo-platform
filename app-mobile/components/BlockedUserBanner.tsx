/**
 * Blocked User Banner Component
 * 
 * Displays a banner when viewing a blocked user's profile or chat.
 * Prevents interaction with blocked users.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BlockedUserBannerProps {
  locale?: 'en' | 'pl';
}

export const BlockedUserBanner: React.FC<BlockedUserBannerProps> = ({ locale = 'en' }) => {
  const bannerText = locale === 'pl' 
    ? 'Zablokowałeś tego użytkownika.'
    : 'You blocked this user.';

  return (
    <View style={styles.container}>
      <Text style={styles.bannerText}>🚫 {bannerText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  bannerText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default BlockedUserBanner;
