/**
 * PACK 143 - Broadcasts
 * Send messages to segments (ethical, opt-out enabled)
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface Broadcast {
  id: string;
  subject: string;
  content: string;
  status: string;
  targetCount: number;
  deliveredCount: number;
  openedCount: number;
  createdAt: any;
}

interface Segment {
  id: string;
  name: string;
  contactCount: number;
}

export default function BroadcastsScreen() {
  const [loading, setLoading] = useState(true);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    loadBroadcasts();
    loadSegments();
  }, []);

  const loadBroadcasts = async () => {
    try {
      setLoading(true);
      const getBroadcasts = httpsCallable(functions, 'getMyBroadcasts');
      const result = await getBroadcasts({});
      const data = result.data as any;
      
      if (data.success) {
        setBroadcasts(data.broadcasts);
      }
    } catch (err) {
      console.error('Error loading broadcasts:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSegments = async () => {
    try {
      const getSegments = httpsCallable(functions, 'getMySegments');
      const result = await getSegments({});
      const data = result.data as any;
      
      if (data.success) {
        setSegments(data.segments);
      }
    } catch (err) {
      console.error('Error loading segments:', err);
    }
  };

  const createBroadcast = async () => {
    if (!selectedSegmentId) {
      Alert.alert('Error', 'Please select a segment');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('Error', 'Please enter a subject');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Error', 'Please enter content');
      return;
    }

    try {
      setCreating(true);
      const createBroadcastFunc = httpsCallable(functions, 'createBroadcast');
      
      const result = await createBroadcastFunc({
        segmentId: selectedSegmentId,
        subject,
        content,
        contentType: 'text',
      });

      const data = result.data as any;
      if (data.success) {
        setShowCreateModal(false);
        setSelectedSegmentId('');
        setSubject('');
        setContent('');
        loadBroadcasts();
        Alert.alert('Success', 'Broadcast created successfully');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create broadcast');
    } finally {
      setCreating(false);
    }
  };

  const sendBroadcast = async (broadcastId: string) => {
    Alert.alert(
      'Send Broadcast',
      'Are you sure you want to send this broadcast? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            try {
              const sendFunc = httpsCallable(functions, 'sendBroadcast');
              await sendFunc({ broadcastId });
              loadBroadcasts();
              Alert.alert('Success', 'Broadcast sent successfully');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to send broadcast');
            }
          },
        },
      ]
    );
  };

  const renderBroadcast = ({ item }: { item: Broadcast }) => (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastHeader}>
        <Text style={styles.broadcastSubject}>{item.subject}</Text>
        <View style={[
          styles.statusBadge,
          item.status === 'sent' && styles.statusSent,
          item.status === 'draft' && styles.statusDraft,
        ]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <Text style={styles.broadcastContent} numberOfLines={2}>
        {item.content}
      </Text>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.targetCount}</Text>
          <Text style={styles.statLabel}>Target</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.deliveredCount}</Text>
          <Text style={styles.statLabel}>Delivered</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.openedCount}</Text>
          <Text style={styles.statLabel}>Opened</Text>
        </View>
      </View>

      {item.status === 'draft' && (
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => sendBroadcast(item.id)}
        >
          <Text style={styles.sendButtonText}>Send Now</Text>
        </TouchableOpacity>
      )}
    </View>
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
        <View>
          <Text style={styles.title}>Broadcasts</Text>
          <Text style={styles.subtitle}>Send messages to your segments</Text>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          ⚠️ Users can opt out anytime{'\n'}
          ❌ No romantic or emotional content{'\n'}
          ❌ No external payment links
        </Text>
      </View>

      <FlatList
        data={broadcasts}
        renderItem={renderBroadcast}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No broadcasts yet</Text>
            <Text style={styles.emptySubtext}>
              Create and send messages to your segments
            </Text>
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
          <ScrollView style={styles.modalScroll}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Create Broadcast</Text>

              <Text style={styles.label}>Select Segment</Text>
              <View style={styles.segmentPicker}>
                {segments.map((segment) => (
                  <TouchableOpacity
                    key={segment.id}
                    style={[
                      styles.segmentOption,
                      selectedSegmentId === segment.id && styles.segmentOptionSelected,
                    ]}
                    onPress={() => setSelectedSegmentId(segment.id)}
                  >
                    <Text style={[
                      styles.segmentOptionText,
                      selectedSegmentId === segment.id && styles.segmentOptionTextSelected,
                    ]}>
                      {segment.name} ({segment.contactCount})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Subject</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter subject"
                value={subject}
                onChangeText={setSubject}
                placeholderTextColor="#6c757d"
              />

              <Text style={styles.label}>Content</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Enter your message (product/event/educational only)"
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={5}
                placeholderTextColor="#6c757d"
              />

              <View style={styles.safetyNote}>
                <Text style={styles.safetyNoteText}>
                  🚫 Forbidden content:{'\n'}
                  • Romantic or flirtatious language{'\n'}
                  • Emotional manipulation{'\n'}
                  • External payment links{'\n'}
                  • "Pay for attention" patterns
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
                  onPress={createBroadcast}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Create Draft</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 2,
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
  warningBox: {
    backgroundColor: '#fff3cd',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20,
  },
  listContainer: {
    padding: 16,
  },
  broadcastCard: {
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
  broadcastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  broadcastSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#6c757d',
  },
  statusSent: {
    backgroundColor: '#28a745',
  },
  statusDraft: {
    backgroundColor: '#ffc107',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  broadcastContent: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    marginTop: 50,
    minHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  segmentPicker: {
    marginBottom: 16,
  },
  segmentOption: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#f8f9fa',
  },
  segmentOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#e7f3ff',
  },
  segmentOptionText: {
    fontSize: 14,
    color: '#212529',
  },
  segmentOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#212529',
    marginBottom: 16,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  safetyNote: {
    backgroundColor: '#f8d7da',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  safetyNoteText: {
    fontSize: 12,
    color: '#721c24',
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
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
