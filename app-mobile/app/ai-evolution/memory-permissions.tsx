import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const MEMORY_CATEGORIES = [
  { id: 'preferences', name: 'Preferences', description: 'Things you like or prefer in conversations' },
  { id: 'safe_topics', name: 'Safe Topics', description: 'Topics you enjoy discussing' },
  { id: 'dislikes', name: 'Dislikes', description: 'Things you prefer to avoid' },
  { id: 'conversational_style', name: 'Conversation Style', description: 'How you like to communicate' },
  { id: 'lore_continuity', name: 'Lore Continuity', description: 'Story and background references' },
  { id: 'interests', name: 'Interests', description: 'Your hobbies and passions' }
];

export default function MemoryPermissionsScreen() {
  const router = useRouter();
  const { characterId } = useLocalSearchParams();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, [characterId]);

  const loadPermissions = async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) return;

      const functions = getFunctions();
      const getPermissions = httpsCallable(functions, 'getMemoryPermissionsStatus');
      
      const result = await getPermissions({ characterId }) as any;
      
      if (result.data.success) {
        const permMap: Record<string, boolean> = {};
        MEMORY_CATEGORIES.forEach(cat => {
          permMap[cat.id] = result.data.memoryTypes.includes(cat.id);
        });
        setPermissions(permMap);
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (categoryId: string) => {
    setPermissions(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const savePermissions = async () => {
    try {
      setSaving(true);
      
      const enabledTypes = Object.entries(permissions)
        .filter(([_, enabled]) => enabled)
        .map(([id, _]) => id);

      const auth = getAuth();
      if (!auth.currentUser) {
        Alert.alert('Error', 'You must be logged in to save permissions');
        return;
      }

      const functions = getFunctions();
      const updatePermissions = httpsCallable(functions, 'updateMemoryPermissions');
      
      const result = await updatePermissions({
        characterId,
        memoryTypes: enabledTypes
      }) as any;

      if (result.data.success) {
        Alert.alert(
          'Success',
          'Memory permissions updated successfully',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading permissions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Memory Permissions</Text>
          <Text style={styles.subtitle}>
            Choose what the AI can remember about your conversations. You can change this anytime.
          </Text>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Your Privacy Matters</Text>
          <Text style={styles.warningText}>
            AI will never remember: emotional vulnerability, trauma, addictions, financial details, or mental health information.
          </Text>
        </View>

        <View style={styles.categoriesContainer}>
          {MEMORY_CATEGORIES.map(category => (
            <View key={category.id} style={styles.categoryItem}>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </View>
              <Switch
                value={permissions[category.id] || false}
                onValueChange={() => togglePermission(category.id)}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={permissions[category.id] ? '#007AFF' : '#f4f3f4'}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={savePermissions}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Permissions'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  warningBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  categoriesContainer: {
    margin: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoryInfo: {
    flex: 1,
    marginRight: 16,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  saveButton: {
    margin: 16,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  cancelButton: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
});
