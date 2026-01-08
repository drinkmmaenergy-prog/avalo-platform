/**
 * PACK 192: Social Memory Hub
 * Main screen for managing cross-AI memory sharing
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface MemoryAnalytics {
  totalPreferencesShared: number;
  categoriesActive: string[];
  aiAccessLog: Array<{
    aiId: string;
    aiName: string;
    lastAccessAt: any;
    totalAccesses: number;
  }>;
}

interface MemoryPermissions {
  crossAiSharingEnabled: boolean;
  allowedCategories: string[];
  excludedAiIds: string[];
}

export default function SocialMemoryHubScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [analytics, setAnalytics] = useState<MemoryAnalytics | null>(null);
  const [permissions, setPermissions] = useState<MemoryPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemoryData();
  }, []);

  const loadMemoryData = async () => {
    try {
      setLoading(true);

      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const getAnalytics = httpsCallable(functions, 'getMemoryAnalytics');
      const analyticsResult = await getAnalytics({ userId });

      if ((analyticsResult.data as any).ok) {
        setAnalytics((analyticsResult.data as any).analytics);
      }

      const permissionsSnapshot = await fetch(
        `https://firestore.googleapis.com/v1/ai_memory_permissions/${userId}`
      );
      const permData = await permissionsSnapshot.json();

      if (permData.fields) {
        setPermissions({
          crossAiSharingEnabled:
            permData.fields.crossAiSharingEnabled?.booleanValue ?? true,
          allowedCategories:
            permData.fields.allowedCategories?.arrayValue?.values?.map(
              (v: any) => v.stringValue
            ) || [],
          excludedAiIds:
            permData.fields.excludedAiIds?.arrayValue?.values?.map(
              (v: any) => v.stringValue
            ) || [],
        });
      }
    } catch (error) {
      console.error('Failed to load memory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCrossAiSharing = async (enabled: boolean) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const updatePermissions = httpsCallable(functions, 'updateMemoryPermissions');
      await updatePermissions({
        userId,
        crossAiSharingEnabled: enabled,
      });

      setPermissions((prev) => (prev ? { ...prev, crossAiSharingEnabled: enabled } : null));

      Alert.alert(
        'Settings Updated',
        enabled
          ? 'Cross-AI memory sharing is now enabled'
          : 'Cross-AI memory sharing is now disabled'
      );
    } catch (error) {
      console.error('Failed to update permissions:', error);
      Alert.alert('Error', 'Failed to update settings');
    }
  };

  const handleWipeMemory = () => {
    Alert.alert(
      'Wipe All Memory?',
      'This will permanently delete all shared preferences across all AIs. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Memory',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = auth.currentUser?.uid;
              if (!userId) return;

              const wipeMemory = httpsCallable(functions, 'wipeUserMemory');
              const result = await wipeMemory({ userId });

              if ((result.data as any).ok) {
                Alert.alert('Success', 'All memory has been wiped');
                loadMemoryData();
              }
            } catch (error) {
              console.error('Failed to wipe memory:', error);
              Alert.alert('Error', 'Failed to wipe memory');
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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Social Memory Hub',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cross-AI Memory Sharing</Text>
          <Text style={styles.cardDescription}>
            Allow AIs to share safe preferences about topics, humor, and activities. 
            Emotional data, finances, and personal information are NEVER shared.
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleLabel}>
              <Text style={styles.toggleText}>Enable Sharing</Text>
              <Text style={styles.toggleSubtext}>
                {permissions?.crossAiSharingEnabled
                  ? 'AIs can access shared preferences'
                  : 'Memory sharing is disabled'}
              </Text>
            </View>
            <Switch
              value={permissions?.crossAiSharingEnabled ?? true}
              onValueChange={toggleCrossAiSharing}
              trackColor={{ false: '#ccc', true: '#8B5CF6' }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Memory Statistics</Text>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Preferences Shared</Text>
            <Text style={styles.statValue}>
              {analytics?.totalPreferencesShared || 0}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Active Categories</Text>
            <Text style={styles.statValue}>
              {analytics?.categoriesActive?.length || 0}
            </Text>
          </View>

          {analytics?.categoriesActive && analytics.categoriesActive.length > 0 && (
            <View style={styles.categoryList}>
              {analytics.categoriesActive.map((cat, index) => (
                <View key={index} style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>
                    {getCategoryLabel(cat)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/profile/social-memory/what-ais-know')}
        >
          <Text style={styles.actionButtonText}>What AIs Know About You</Text>
          <Text style={styles.actionButtonIcon}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/profile/social-memory/preferences')}
        >
          <Text style={styles.actionButtonText}>Manage Preferences</Text>
          <Text style={styles.actionButtonIcon}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/profile/social-memory/permissions')}
        >
          <Text style={styles.actionButtonText}>Memory Permissions</Text>
          <Text style={styles.actionButtonIcon}>→</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy Guarantee</Text>
          <Text style={styles.privacyText}>✓ No emotional vulnerability shared</Text>
          <Text style={styles.privacyText}>✓ No financial data shared</Text>
          <Text style={styles.privacyText}>✓ No personal secrets shared</Text>
          <Text style={styles.privacyText}>✓ No AI rankings or favorites</Text>
          <Text style={styles.privacyText}>✓ No relationship pain shared</Text>
        </View>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleWipeMemory}
        >
          <Text style={styles.dangerButtonText}>Wipe All Memory</Text>
        </TouchableOpacity>

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
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    flex: 1,
  },
  toggleText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  toggleSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statLabel: {
    fontSize: 15,
    color: '#ccc',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  actionButtonIcon: {
    fontSize: 20,
    color: '#8B5CF6',
  },
  privacyText: {
    fontSize: 14,
    color: '#4ade80',
    marginBottom: 8,
    paddingLeft: 4,
  },
  dangerButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  spacer: {
    height: 32,
  },
});
