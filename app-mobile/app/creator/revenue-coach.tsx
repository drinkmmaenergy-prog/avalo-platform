/**
 * PACK 452 — Revenue Coach Screen
 * Displays NON-BLOCKING suggestions to help earners optimize their revenue.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { colors, spacing, fontSizes, fontWeights } from '@/shared/theme';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Suggestion {
  suggestionId: string;
  type: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  dismissed: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: colors.error,
  medium: colors.warning,
  low: colors.primary,
};

const PRIORITY_ICONS: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🔵',
};

const TYPE_ICONS: Record<string, string> = {
  ENABLE_EARNING: '💰',
  INCREASE_ENTRY_THRESHOLD: '📈',
  DECREASE_ENTRY_THRESHOLD: '📉',
  HIGH_MULTIPLIER_WARNING: '⚠️',
  TRY_PREMIUM_OFFER: '⭐',
};

export default function RevenueCoachScreen() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const functions = getFunctions();

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    try {
      setLoading(true);
      const getSuggestions = httpsCallable(functions, 'pack452_getRevenueCoachSuggestions');
      const result = await getSuggestions({});
      const data = result.data as { success: boolean; suggestions: Suggestion[] };
      if (data.success) {
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDismiss(suggestionId: string) {
    setDismissing(suggestionId);
    try {
      const dismiss = httpsCallable(functions, 'pack452_dismissRevenueCoachSuggestion');
      await dismiss({ suggestionId });
      setSuggestions(prev => prev.filter(s => s.suggestionId !== suggestionId));
    } catch (error) {
      console.error('Failed to dismiss suggestion:', error);
    } finally {
      setDismissing(null);
    }
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Revenue Coach" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>💡 Revenue Coach</Text>
        <Text style={styles.description}>
          Personalized suggestions to help you maximize your earnings.
          These are recommendations only — they never block your actions.
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Analyzing your performance...</Text>
          </View>
        ) : suggestions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyDescription}>
              No new suggestions right now. Keep up the great work!
            </Text>
          </View>
        ) : (
          suggestions.map((suggestion) => (
            <View
              key={suggestion.suggestionId}
              style={[
                styles.suggestionCard,
                { borderLeftColor: PRIORITY_COLORS[suggestion.priority] || colors.primary },
              ]}
            >
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionIcon}>
                  {TYPE_ICONS[suggestion.type] || '💡'}
                </Text>
                <Text style={styles.priorityBadge}>
                  {PRIORITY_ICONS[suggestion.priority]} {suggestion.priority.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.suggestionMessage}>{suggestion.message}</Text>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => handleDismiss(suggestion.suggestionId)}
                disabled={dismissing === suggestion.suggestionId}
              >
                {dismissing === suggestion.suggestionId ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <Text style={styles.dismissText}>Dismiss</Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    marginTop: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    textAlign: 'center',
  },
  suggestionCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  suggestionIcon: {
    fontSize: 24,
  },
  priorityBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.secondary,
  },
  suggestionMessage: {
    fontSize: fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  dismissButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dismissText: {
    fontSize: fontSizes.sm,
    color: colors.secondary,
    fontWeight: fontWeights.medium,
  },
});
