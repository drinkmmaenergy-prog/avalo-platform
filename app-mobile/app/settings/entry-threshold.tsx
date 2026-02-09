/**
 * PACK 452 — Entry Threshold Settings Screen
 * Allows earners to configure their chat entry token requirement.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { colors, spacing, fontSizes, fontWeights } from '@/shared/theme';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PRESET_VALUES = [100, 200, 300, 500, 1000, 2000, 5000];
const MIN_THRESHOLD = 100;

export default function EntryThresholdScreen() {
  const router = useRouter();
  const [currentThreshold, setCurrentThreshold] = useState<number>(100);
  const [newThreshold, setNewThreshold] = useState<string>('100');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const functions = getFunctions();

  useEffect(() => {
    loadCurrentThreshold();
  }, []);

  async function loadCurrentThreshold() {
    try {
      setLoading(true);
      const getThreshold = httpsCallable(functions, 'pack452_getEntryThreshold');
      const result = await getThreshold({});
      const data = result.data as { success: boolean; chatEntryTokens: number };
      if (data.success) {
        setCurrentThreshold(data.chatEntryTokens);
        setNewThreshold(String(data.chatEntryTokens));
      }
    } catch (error) {
      console.error('Failed to load threshold:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const value = parseInt(newThreshold, 10);
    if (isNaN(value) || value < MIN_THRESHOLD) {
      Alert.alert('Invalid Value', `Minimum entry threshold is ${MIN_THRESHOLD} tokens.`);
      return;
    }

    setSaving(true);
    try {
      const updateThreshold = httpsCallable(functions, 'pack452_updateEntryThreshold');
      const result = await updateThreshold({ chatEntryTokens: value });
      const data = result.data as { success: boolean; chatEntryTokens?: number; error?: string };

      if (data.success) {
        setCurrentThreshold(data.chatEntryTokens!);
        Alert.alert(
          'Threshold Updated',
          `New chats will require ${data.chatEntryTokens} tokens to start. Existing chats are unaffected.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to update threshold');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update threshold');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Entry Threshold" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Entry Threshold" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Chat Entry Tokens</Text>
        <Text style={styles.description}>
          Set how many tokens a supporter must deposit to start a paid chat with you.
          This only affects new conversations — existing chats are not changed.
        </Text>

        <View style={styles.currentValue}>
          <Text style={styles.currentLabel}>Current threshold</Text>
          <Text style={styles.currentAmount}>{currentThreshold} tokens</Text>
        </View>

        <Text style={styles.label}>Quick Select</Text>
        <View style={styles.presetGrid}>
          {PRESET_VALUES.map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.presetButton,
                parseInt(newThreshold, 10) === value && styles.presetButtonSelected,
              ]}
              onPress={() => setNewThreshold(String(value))}
            >
              <Text
                style={[
                  styles.presetText,
                  parseInt(newThreshold, 10) === value && styles.presetTextSelected,
                ]}
              >
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Custom Amount</Text>
        <TextInput
          style={styles.input}
          value={newThreshold}
          onChangeText={setNewThreshold}
          keyboardType="number-pad"
          placeholder="Enter token amount"
          placeholderTextColor={colors.border}
        />
        <Text style={styles.hint}>Minimum: {MIN_THRESHOLD} tokens</Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Save Threshold</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  currentValue: {
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  currentLabel: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  currentAmount: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  label: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  presetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  presetText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.secondary,
  },
  presetTextSelected: {
    color: colors.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: fontSizes.lg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.secondary,
    marginBottom: spacing.xl,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 24,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.background,
  },
});
