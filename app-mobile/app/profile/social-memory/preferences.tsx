/**
 * PACK 192: Manage Preferences
 * Edit and delete shared preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
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

export default function ManagePreferencesScreen() {
  const auth = getAuth();
  const functions = getFunctions();

  const [preferences, setPreferences] = useState<SharedPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

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
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreference = (pref: SharedPreference) => {
    Alert.alert(
      'Delete Preference?',
      `Remove "${pref.key}" from shared memory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = auth.currentUser?.uid;
              if (!userId) return;

              const blockPreference = httpsCallable(
                functions,
                'blockPreferenceSharing'
              );
              await blockPreference({ userId, preferenceId: pref.id });

              setPreferences((prev) => prev.filter((p) => p.id !== pref.id));
              Alert.alert('Success', 'Preference deleted');
            } catch (error) {
              console.error('Failed to delete preference:', error);
              Alert.alert('Error', 'Failed to delete preference');
            }
          },
        },
      ]
    );
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

  const categories = ['all', ...Array.from(new Set(preferences.map((p) => p.category)))];

  const filteredPreferences =
    selectedCategory === 'all'
      ? preferences
      : preferences.filter((p) => p.category === selectedCategory);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Manage Preferences' }} />
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Manage Preferences' }} />

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                selectedCategory === cat && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === cat && styles.filterChipTextActive,
                ]}
              >
                {cat === 'all' ? 'All' : getCategoryLabel(cat)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {filteredPreferences.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {selectedCategory === 'all'
                ? 'No preferences stored yet'
                : `No preferences in ${getCategoryLabel(selectedCategory)}`}
            </Text>
          </View>
        ) : (
          filteredPreferences.map((pref, index) => (
            <View key={index} style={styles.prefCard}>
              <View style={styles.prefHeader}>
                <View style={styles.prefHeaderLeft}>
                  <Text style={styles.prefCategory}>
                    {getCategoryLabel(pref.category)}
                  </Text>
                  <Text style={styles.prefKey}>{pref.key}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeletePreference(pref)}
                >
                  <Text style={styles.deleteButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.prefValue}>{formatValue(pref.value)}</Text>

              <View style={styles.prefFooter}>
                <Text style={styles.prefMeta}>
                  Confidence: {Math.round(pref.confidence * 100)}%
                </Text>
                <Text style={styles.prefMeta}>
                  Accessed {pref.accessCount} times
                </Text>
              </View>
            </View>
          ))
        )}

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
  filterContainer: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filterChip: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#8B5CF6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  prefHeaderLeft: {
    flex: 1,
  },
  prefCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B5CF6',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  prefKey: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  prefValue: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 12,
    lineHeight: 20,
  },
  prefFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  prefMeta: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
    marginTop: -2,
  },
  spacer: {
    height: 32,
  },
});
