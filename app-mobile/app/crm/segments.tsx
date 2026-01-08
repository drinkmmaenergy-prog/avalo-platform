/**
 * PACK 143 - CRM Segments
 * Create and manage audience segments
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface Segment {
  id: string;
  name: string;
  description: string;
  contactCount: number;
  filters: any;
}

export default function SegmentsScreen() {
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentDescription, setNewSegmentDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSegments();
  }, []);

  const loadSegments = async () => {
    try {
      setLoading(true);
      const getSegments = httpsCallable(functions, 'getMySegments');
      const result = await getSegments({});
      const data = result.data as any;
      
      if (data.success) {
        setSegments(data.segments);
      }
    } catch (err) {
      console.error('Error loading segments:', err);
    } finally {
      setLoading(false);
    }
  };

  const createSegment = async () => {
    if (!newSegmentName.trim()) {
      Alert.alert('Error', 'Please enter a segment name');
      return;
    }

    try {
      setCreating(true);
      const createSegmentFunc = httpsCallable(functions, 'createSegment');
      
      const result = await createSegmentFunc({
        name: newSegmentName,
        description: newSegmentDescription,
        filters: {},
      });

      const data = result.data as any;
      if (data.success) {
        setShowCreateModal(false);
        setNewSegmentName('');
        setNewSegmentDescription('');
        loadSegments();
        Alert.alert('Success', 'Segment created successfully');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create segment');
    } finally {
      setCreating(false);
    }
  };

  const renderSegment = ({ item }: { item: Segment }) => (
    <TouchableOpacity style={styles.segmentCard}>
      <View style={styles.segmentHeader}>
        <Text style={styles.segmentName}>{item.name}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{item.contactCount}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={styles.segmentDescription}>{item.description}</Text>
      ) : null}
      <Text style={styles.segmentFilters}>
        {Object.keys(item.filters).length} filters applied
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Segments</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={segments}
        renderItem={renderSegment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No segments yet</Text>
            <Text style={styles.emptySubtext}>
              Create segments to group and target specific audiences
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyButtonText}>Create First Segment</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Segment</Text>

            <TextInput
              style={styles.input}
              placeholder="Segment Name"
              value={newSegmentName}
              onChangeText={setNewSegmentName}
              placeholderTextColor="#6c757d"
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optional)"
              value={newSegmentDescription}
              onChangeText={setNewSegmentDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor="#6c757d"
            />

            <View style={styles.safetyNote}>
              <Text style={styles.safetyNoteText}>
                ⚠️ Segments cannot filter by personal attributes, location, or vulnerability indicators
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
                disabled={creating}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={createSegment}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  segmentCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  segmentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 8,
  },
  segmentFilters: {
    fontSize: 12,
    color: '#007AFF',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#212529',
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  safetyNote: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  safetyNoteText: {
    fontSize: 12,
    color: '#856404',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
