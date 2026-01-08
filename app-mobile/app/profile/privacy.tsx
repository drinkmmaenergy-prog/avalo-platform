/**
 * PACK 269 - Privacy Settings Screen
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <AppHeader title="Privacy" />
      <ScrollView style={styles.content}>
        <View style={styles.placeholder}>
          <Text style={styles.icon}>🔒</Text>
          <Text style={styles.title}>Privacy Settings</Text>
          <Text style={styles.subtitle}>Control who can see your profile and activity</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  placeholder: { padding: spacing.xxxl, alignItems: 'center', minHeight: 400 },
  icon: { fontSize: 80, marginBottom: spacing.lg },
  title: { fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { fontSize: fontSizes.base, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  button: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 24 },
  buttonText: { fontSize: fontSizes.base, fontWeight: fontWeights.bold, color: colors.background },
});
