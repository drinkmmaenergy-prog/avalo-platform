/**
 * PACK 101 — Creator Success Screen
 * Main screen for displaying success toolkit to creators
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { CreatorSuccessSignals } from "@/types/success";
import { SuccessScorecardComponent } from "@/components/SuccessScorecard";
import { SuggestionsListComponent } from "@/components/SuggestionsList";


export default function CreatorSuccessScreen() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [successSignals, setSuccessSignals] = useState<CreatorSuccessSignals | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSuccessSignals = async () => {
    if (!user) return;

    try {
      setError(null);
      const functions = getFunctions();
      const getSignals = httpsCallable<any, CreatorSuccessSignals>(
        functions,
        'getCreatorSuccessSignals'
      );

      const result = await getSignals({});
      setSuccessSignals(result.data);
    } catch (err: any) {
      console.error('[CreatorSuccess] Error fetching signals:', err);
      setError(err.message || 'Failed to load success toolkit');
      Alert.alert(
        'Error',
        'Failed to load success toolkit. Please try again later.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSuccessSignals();
  };

  useEffect(() => {
    fetchSuccessSignals();
  }, [user]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading success toolkit...</Text>
      </View>
    );
  }

  if (error && !successSignals) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Unable to Load</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!successSignals) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>📊</Text>
        <Text style={styles.errorTitle}>No Data Available</Text>
        <Text style={styles.errorText}>
          Success signals will be available once you start creating content.
        </Text>
      </View>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#667eea"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Success Toolkit</Text>
        <Text style={styles.headerSubtitle}>
          Data-driven insights to optimize your creator journey
        </Text>
        <Text style={styles.lastUpdated}>
          Last updated: {formatDate(successSignals.updatedAt)}
        </Text>
      </View>

      {/* Scorecard */}
      <SuccessScorecardComponent scorecard={successSignals.scorecard} />

      {/* Suggestions */}
      <SuggestionsListComponent suggestions={successSignals.suggestions} />

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerIcon}>💡</Text>
        <Text style={styles.footerTitle}>About Success Signals</Text>
        <Text style={styles.footerText}>
          Success signals are calculated daily based on your activity,
          engagement, and audience metrics. These are behavioral insights to
          help you improve your creator strategy, not guarantees of earnings.
        </Text>
        <Text style={styles.footerNote}>
          Scores update every 24 hours. Pull down to refresh.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  header: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 12,
  },
  lastUpdated: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  footer: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  footerIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    color: '#1e3a8a',
    lineHeight: 20,
    marginBottom: 12,
  },
  footerNote: {
    fontSize: 12,
    color: '#3b82f6',
    fontStyle: 'italic',
  },
});
