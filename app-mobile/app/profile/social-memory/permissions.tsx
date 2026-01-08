/**
 * PACK 192: Memory Permissions
 * Configure which categories and AIs can access shared memory
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface MemoryPermissions {
  crossAiSharingEnabled: boolean;
  allowedCategories: string[];
  excludedAiIds: string[];
}

const ALL_CATEGORIES = [
  { id: 'topics_liked', label: 'Topics & Interests', description: 'Things you like to discuss' },
  { id: 'humor_preference', label: 'Humor Style', description: 'Your sense of humor' },
  { id: 'activity_preference', label: 'Activity Preferences', description: 'Voice notes, texts, games' },
  { id: 'languages', label: 'Languages', description: 'Language preferences' },
  { id: 'safe_boundaries', label: 'Safe Boundaries', description: 'What you don\'t like' },
  { id: 'story_progress', label: 'Story Progress', description: 'Progress in story arcs' },
];

export default function MemoryPermissionsScreen() {
  const auth = getAuth();
  const functions = getFunctions();

  const [permissions, setPermissions] = useState<MemoryPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const db = await import('firebase/firestore').then((m) => m.getFirestore());
      const { doc, getDoc } = await import('firebase/firestore');

      const permDoc = await getDoc(doc(db, 'ai_memory_permissions', userId));

      if (permDoc.exists()) {
        setPermissions(permDoc.data() as MemoryPermissions);
      } else {
        setPermissions({
          crossAiSharingEnabled: true,
          allowedCategories: ALL_CATEGORIES.map((c) => c.id),
          excludedAiIds: [],
        });
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePermissions = async (updates: Partial<MemoryPermissions>) => {
    try {
      setSaving(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const updatePermissions = httpsCallable(functions, 'updateMemoryPermissions');
      await updatePermissions({ userId, ...updates });

      setPermissions((prev) => (prev ? { ...prev, ...updates } : null));
      Alert.alert('Success', 'Permissions updated');
    } catch (error) {
      console.error('Failed to save permissions:', error);
      Alert.alert('Error', 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    if (!permissions) return;

    const isCurrentlyAllowed = permissions.allowedCategories.includes(categoryId);
    const newCategories = isCurrentlyAllowed
      ? permissions.allowedCategories.filter((c) => c !== categoryId)
      : [...permissions.allowedCategories, categoryId];

    savePermissions({ allowedCategories: newCategories });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Memory Permissions' }} />
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Memory Permissions' }} />

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What Gets Shared</Text>
          <Text style={styles.cardDescription}>
            Control which types of preferences AIs can access. Only safe,
            non-personal information is eligible for sharing.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allowed Categories</Text>

          {ALL_CATEGORIES.map((category) => {
            const isAllowed = permissions?.allowedCategories.includes(category.id) ?? true;

            return (
              <View key={category.id} style={styles.categoryCard}>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  <Text style={styles.categoryDescription}>
                    {category.description}
                  </Text>
                </View>
                <Switch
                  value={isAllowed}
                  onValueChange={() => toggleCategory(category.id)}
                  disabled={saving}
                  trackColor={{ false: '#ccc', true: '#8B5CF6' }}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What's NEVER Shared</Text>
          <Text style={styles.blockedItem}>🚫 Emotional vulnerability</Text>
          <Text style={styles.blockedItem}>🚫 Loneliness or mental health</Text>
          <Text style={styles.blockedItem}>🚫 Financial data or purchases</Text>
          <Text style={styles.blockedItem}>🚫 Trauma or fears</Text>
          <Text style={styles.blockedItem}>🚫 Sexual interests</Text>
          <Text style={styles.blockedItem}>🚫 Relationship pain</Text>
          <Text style={styles.blockedItem}>🚫 AI rankings or favorites</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>💡 Privacy Guarantee</Text>
          <Text style={styles.infoText}>
            Even with all categories enabled, the system automatically blocks any
            emotional, financial, or personal information. AIs can only see
            high-level preferences about topics, humor, and activities.
          </Text>
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
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#999',
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
  categoryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryInfo: {
    flex: 1,
    marginRight: 16,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 13,
    color: '#999',
  },
  blockedItem: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
    paddingLeft: 4,
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
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
  spacer: {
    height: 32,
  },
});
