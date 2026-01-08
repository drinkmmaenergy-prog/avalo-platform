import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

interface GrowthEvent {
  eventId: string;
  eventType: string;
  title: string;
  description: string;
  timestamp: any;
}

export default function LoreUpdatesScreen() {
  const router = useRouter();
  const { characterId, characterName } = useLocalSearchParams();
  const [updates, setUpdates] = useState<GrowthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUpdate, setSelectedUpdate] = useState<GrowthEvent | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadLoreUpdates();
  }, [characterId]);

  const loadLoreUpdates = async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) return;

      const functions = getFunctions();
      const getUpdates = httpsCallable(functions, 'getCharacterGrowth');
      
      const result = await getUpdates({ characterId, limit: 20 }) as any;
      
      if (result.data.success) {
        setUpdates(result.data.events);
      }
    } catch (error) {
      console.error('Failed to load lore updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const openUpdateDetails = (update: GrowthEvent) => {
    setSelectedUpdate(update);
    setModalVisible(true);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, string> = {
      new_hobby: 'heart-outline',
      new_skill: 'school-outline',
      new_travel: 'airplane-outline',
      new_project: 'rocket-outline',
      new_outfit: 'shirt-outline',
      new_voice_mood: 'mic-outline',
      new_language: 'language-outline'
    };
    return icons[eventType] || 'star-outline';
  };

  const getEventColor = (eventType: string) => {
    const colors: Record<string, string> = {
      new_hobby: '#FF6B6B',
      new_skill: '#4ECDC4',
      new_travel: '#45B7D1',
      new_project: '#FFA07A',
      new_outfit: '#DDA15E',
      new_voice_mood: '#BC6C25',
      new_language: '#9B59B6'
    };
    return colors[eventType] || '#95A5A6';
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
          <Text style={styles.title}>{characterName || 'AI'} Growth Journal</Text>
          <Text style={styles.subtitle}>
            Discover how your AI companion has been evolving and growing over time
          </Text>
        </View>

        {updates.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Updates Yet</Text>
            <Text style={styles.emptyText}>
              Check back soon to see how your AI companion grows and develops new interests
            </Text>
          </View>
        ) : (
          <View style={styles.updatesContainer}>
            {updates.map(update => (
              <TouchableOpacity
                key={update.eventId}
                style={styles.updateCard}
                onPress={() => openUpdateDetails(update)}
              >
                <View style={[styles.iconContainer, { backgroundColor: getEventColor(update.eventType) }]}>
                  <Ionicons name={getEventIcon(update.eventType) as any} size={24} color="white" />
                </View>
                
                <View style={styles.updateContent}>
                  <Text style={styles.updateTitle}>{update.title}</Text>
                  <Text style={styles.updateDescription} numberOfLines={2}>
                    {update.description}
                  </Text>
                  <Text style={styles.updateDate}>
                    {formatDate(update.timestamp)}
                  </Text>
                </View>
                
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedUpdate && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIconContainer, { backgroundColor: getEventColor(selectedUpdate.eventType) }]}>
                    <Ionicons name={getEventIcon(selectedUpdate.eventType) as any} size={32} color="white" />
                  </View>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalTitle}>{selectedUpdate.title}</Text>
                <Text style={styles.modalDate}>{formatDate(selectedUpdate.timestamp)}</Text>
                
                <ScrollView style={styles.modalScrollView}>
                  <Text style={styles.modalDescription}>{selectedUpdate.description}</Text>
                  
                  <View style={styles.modalFooter}>
                    <View style={styles.safetyBadge}>
                      <Ionicons name="shield-checkmark" size={16} color="#34C759" />
                      <Text style={styles.safetyText}>Safe & Positive Update</Text>
                    </View>
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  },
  updatesContainer: {
    padding: 16,
  },
  updateCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  updateContent: {
    flex: 1,
    marginRight: 12,
  },
  updateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  updateDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 4,
  },
  updateDate: {
    fontSize: 12,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalDate: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  modalScrollView: {
    marginBottom: 16,
  },
  modalDescription: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalFooter: {
    marginTop: 16,
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  safetyText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
    marginLeft: 6,
  },
  doneButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
