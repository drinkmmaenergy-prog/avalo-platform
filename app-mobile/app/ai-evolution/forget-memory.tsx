import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

interface Memory {
  memoryId: string;
  category: string;
  content: string;
  context?: string;
  createdAt: any;
  expiresAt: any;
  accessCount: number;
}

export default function ForgetMemoryScreen() {
  const router = useRouter();
  const { characterId } = useLocalSearchParams();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    loadMemories();
  }, [characterId]);

  const loadMemories = async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) return;

      const functions = getFunctions();
      const getMemories = httpsCallable(functions, 'getUserAIMemories');
      
      const result = await getMemories({ characterId }) as any;
      
      if (result.data.success) {
        setMemories(result.data.memories);
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
      Alert.alert('Error', 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (memoryId: string) => {
    Alert.alert(
      'Delete Memory',
      'Are you sure you want to forget this memory? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const auth = getAuth();
              if (!auth.currentUser) return;

              const functions = getFunctions();
              const deleteMemoryFn = httpsCallable(functions, 'deleteAIMemory');
              
              const result = await deleteMemoryFn({ memoryId }) as any;

              if (result.data.success) {
                setMemories(prev => prev.filter(m => m.memoryId !== memoryId));
                Alert.alert('Success', 'Memory deleted successfully');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete memory');
            }
          }
        }
      ]
    );
  };

  const deleteAllMemories = async () => {
    Alert.alert(
      'Delete All Memories',
      'Are you sure you want to forget ALL memories with this AI? This will reset your relationship completely and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAll(true);
              
              const auth = getAuth();
              if (!auth.currentUser) return;

              const functions = getFunctions();
              const deleteAll = httpsCallable(functions, 'deleteAllAIMemories');
              
              const result = await deleteAll({ characterId }) as any;

              if (result.data.success) {
                setMemories([]);
                Alert.alert(
                  'Success',
                  `${result.data.deletedCount} memories deleted successfully`,
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete all memories');
            } finally {
              setDeletingAll(false);
            }
          }
        }
      ]
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      preferences: '#007AFF',
      safe_topics: '#34C759',
      dislikes: '#FF3B30',
      conversational_style: '#FF9500',
      lore_continuity: '#AF52DE',
      interests: '#5AC8FA'
    };
    return colors[category] || '#8E8E93';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Manage Memories</Text>
          <Text style={styles.subtitle}>
            You have full control over what the AI remembers. Delete specific memories or reset everything.
          </Text>
        </View>

        {memories.length > 0 && (
          <View style={styles.deleteAllContainer}>
            <TouchableOpacity
              style={[styles.deleteAllButton, deletingAll && styles.deleteAllButtonDisabled]}
              onPress={deleteAllMemories}
              disabled={deletingAll}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={styles.deleteAllButtonText}>
                {deletingAll ? 'Deleting...' : `Forget All (${memories.length})`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {memories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#34C759" />
            <Text style={styles.emptyTitle}>No Memories Stored</Text>
            <Text style={styles.emptyText}>
              The AI has no memories about you yet, or all memories have been deleted.
            </Text>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.memoriesContainer}>
            {memories.map(memory => (
              <View key={memory.memoryId} style={styles.memoryCard}>
                <View style={styles.memoryHeader}>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(memory.category) }]}>
                    <Text style={styles.categoryBadgeText}>
                      {memory.category.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteMemory(memory.memoryId)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.memoryContent}>{memory.content}</Text>
                
                {memory.context && (
                  <Text style={styles.memoryContext}>Context: {memory.context}</Text>
                )}
                
                <View style={styles.memoryFooter}>
                  <Text style={styles.memoryDate}>
                    Created: {formatDate(memory.createdAt)}
                  </Text>
                  <Text style={styles.memoryDate}>
                    Expires: {formatDate(memory.expiresAt)}
                  </Text>
                </View>
                
                <Text style={styles.accessCount}>
                  Accessed {memory.accessCount} times
                </Text>
              </View>
            ))}
          </View>
        )}
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
  loader: {
    marginTop: 40,
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
  deleteAllContainer: {
    padding: 16,
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    gap: 8,
  },
  deleteAllButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  deleteAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  memoriesContainer: {
    padding: 16,
  },
  memoryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textTransform: 'capitalize',
  },
  deleteButton: {
    padding: 8,
  },
  memoryContent: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  memoryContext: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  memoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  memoryDate: {
    fontSize: 12,
    color: '#999',
  },
  accessCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
