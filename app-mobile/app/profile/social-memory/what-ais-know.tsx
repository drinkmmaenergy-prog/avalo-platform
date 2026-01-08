/**
 * PACK 192: What AIs Know About You
 * Transparency screen showing shared preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface SharedPreference {
  id: string;
  category: string;
  key: string;
  value: any;
  confidence: number;
  accessCount: number;
  sourceAiId?: string;
}

interface AiAccessLog {
  aiId: string;
  aiName: string;
  lastAccessAt: any;
  totalAccesses: number;
  accessedPreferences: string[];
}

export default function WhatAIsKnowScreen() {
  const auth = getAuth();
  const functions = getFunctions();

  const [preferences, setPreferences] = useState<SharedPreference[]>([]);
  const [accessLogs, setAccessLogs] = useState<AiAccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const getAnalytics = httpsCallable(functions, 'getMemoryAnalytics');
      const result = await getAnalytics({ userId });

      if ((result.data as any).ok) {
        const analytics = (result.data as any).analytics;
        setAccessLogs(analytics.aiAccessLog || []);
      }

      const db = await import('firebase/firestore').then((m) => m.getFirestore());
      const { collection, query, where, getDocs } = await import('firebase/firestore');

      const prefsQuery = query(
        collection(db, 'ai_shared_preferences'),
        where('userId', '==', userId)
      );

      const prefsSnap = await getDocs(prefsQuery);
      const prefsData = prefsSnap.docs.map((doc) => doc.data() as SharedPreference);
      setPreferences(prefsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      topics_liked: 'Topics & Interests',
      humor_preference: 'Humor Style',
      activity_preference: 'Activity Preferences',
      languages: 'Languages',
      safe_boundaries: 'Safe Boundaries',
      story_progress: 'Story Progress',
    };
    return labels[category] || category;
  };

  const formatValue = (value: any): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'What AIs Know' }} />
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'What AIs Know About You' }} />

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Transparency Guarantee</Text>
          <Text style={styles.infoText}>
            This screen shows EVERYTHING that AIs can see about you. No hidden
            data, no secret tracking.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Preferences ({preferences.length})</Text>

          {preferences.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No preferences shared yet. Start chatting with AIs to build your profile.
              </Text>
            </View>
          ) : (
            preferences.map((pref, index) => (
              <View key={index} style={styles.prefCard}>
                <View style={styles.prefHeader}>
                  <Text style={styles.prefCategory}>
                    {getCategoryLabel(pref.category)}
                  </Text>
                  <Text style={styles.prefConfidence}>
                    {Math.round(pref.confidence * 100)}% confident
                  </Text>
                </View>

                <Text style={styles.prefKey}>{pref.key}</Text>
                <Text style={styles.prefValue}>{formatValue(pref.value)}</Text>

                <View style={styles.prefFooter}>
                  <Text style={styles.prefMeta}>
                    Accessed {pref.accessCount} times
                  </Text>
                  {pref.sourceAiId && (
                    <Text style={styles.prefMeta}>Source: {pref.sourceAiId}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Access Log</Text>

          {accessLogs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No AI access recorded yet</Text>
            </View>
          ) : (
            accessLogs.map((log, index) => (
              <View key={index} style={styles.logCard}>
                <Text style={styles.logAiName}>{log.aiName}</Text>
                <Text style={styles.logStats}>
                  {log.totalAccesses} total accesses
                </Text>
                <Text style={styles.logStats}>
                  Accessed {log.accessedPreferences.length} preferences
                </Text>
                {log.lastAccessAt && (
                  <Text style={styles.logTime}>
                    Last access:{' '}
                    {new Date(log.lastAccessAt.seconds * 1000).toLocaleString()}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  prefCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  prefHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  prefCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B5CF6',
    textTransform: 'uppercase',
  },
  prefConfidence: {
    fontSize: 12,
    color: '#4ade80',
  },
  prefKey: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  prefValue: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 12,
  },
  prefFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  prefMeta: {
    fontSize: 12,
    color: '#666',
  },
  logCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  logAiName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  logStats: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  logTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  spacer: {
    height: 32,
  },
});
