/**
 * PACK 269 - Messages Screen
 * Chat list and messaging interface
 * Integrates with PACK 268 paid chat system
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";

export default function MessagesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // TODO: Implement messages refresh logic
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Messages" />
      
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>💬</Text>
          <Text style={styles.placeholderTitle}>No Messages Yet</Text>
          <Text style={styles.placeholderText}>
            Start swiping to make matches and begin conversations
          </Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/swipe' as any)}
          >
            <Text style={styles.buttonText}>Start Swiping</Text>
          </TouchableOpacity>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>💎 Paid Messaging</Text>
            <Text style={styles.infoText}>
              Earn tokens when others message you first!
            </Text>
          </View>
        </View>
      </ScrollView>

      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    minHeight: 400,
  },
  placeholderIcon: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  placeholderTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  placeholderText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 24,
    marginBottom: spacing.xl,
  },
  buttonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.background,
  },
  infoCard: {
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
