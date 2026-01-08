/**
 * PACK 193 — Club Toxicity Monitor
 * Moderator interface for viewing and resolving toxicity events
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface ToxicityEvent {
  eventId: string;
  toxicityType: string;
  severityLevel: string;
  reportedUserId?: string;
  reportedContentId?: string;
  description: string;
  detectedBy: string;
  detectedAt: any;
  isResolved: boolean;
  resolution?: string;
}

const TOXICITY_TYPES = {
  flame_war: { label: 'Flame War', icon: '🔥', color: '#E74C3C' },
  club_raiding: { label: 'Club Raiding', icon: '⚔️', color: '#C0392B' },
  topic_hijacking: { label: 'Topic Hijacking', icon: '🎯', color: '#E67E22' },
  drama_instigation: { label: 'Drama Instigation', icon: '🎭', color: '#F39C12' },
  bullying: { label: 'Bullying', icon: '😢', color: '#E74C3C' },
  harassment: { label: 'Harassment', icon: '⚠️', color: '#C0392B' },
};

const SEVERITY_COLORS = {
  low: '#95A5A6',
  medium: '#F39C12',
  high: '#E74C3C',
  critical: '#C0392B',
};

export default function ClubToxicityMonitor() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ToxicityEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ToxicityEvent | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolution, setResolution] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadToxicityEvents();
    }
  }, [clubId]);

  const loadToxicityEvents = async () => {
    try {
      setLoading(true);
      // Note: This would need a backend function to list toxicity events
      // For now, we'll show the UI structure
      setEvents([]);
    } catch (error) {
      console.error('Error loading toxicity events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveEvent = async () => {
    if (!selectedEvent || !resolution) {
      Alert.alert('Error', 'Please provide a resolution description');
      return;
    }

    try {
      setResolving(true);

      const result = await httpsCallable(functions, 'resolveToxicityEvent')({
        eventId: selectedEvent.eventId,
        resolution,
        actions,
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert('Success', 'Toxicity event resolved');
        setShowResolveModal(false);
        setSelectedEvent(null);
        setResolution('');
        setActions([]);
        loadToxicityEvents();
      } else {
        Alert.alert('Error', data.error || 'Failed to resolve event');
      }
    } catch (error: any) {
      console.error('Error resolving event:', error);
      Alert.alert('Error', error.message || 'Failed to resolve event');
    } finally {
      setResolving(false);
    }
  };

  const toggleAction = (action: string) => {
    if (actions.includes(action)) {
      setActions(actions.filter(a => a !== action));
    } else {
      setActions([...actions, action]);
    }
  };

  const getTypeConfig = (type: string) => {
    return TOXICITY_TYPES[type as keyof typeof TOXICITY_TYPES] || {
      label: type,
      icon: '⚠️',
      color: '#95A5A6',
    };
  };

  const getSeverityColor = (severity: string) => {
    return SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || '#95A5A6';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading toxicity monitor...</Text>
      </View>
    );
  }

  const unresolvedEvents = events.filter(e => !e.isResolved);
  const resolvedEvents = events.filter(e => e.isResolved);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Toxicity Monitor</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{unresolvedEvents.length}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Status Banner */}
        <View style={[
          styles.statusBanner,
          unresolvedEvents.length === 0 ? styles.statusBannerGood : styles.statusBannerWarning
        ]}>
          <Ionicons
            name={unresolvedEvents.length === 0 ? 'shield-checkmark' : 'warning'}
            size={24}
            color={unresolvedEvents.length === 0 ? '#27AE60' : '#F39C12'}
          />
          <View style={styles.statusInfo}>
            <Text style={[
              styles.statusTitle,
              unresolvedEvents.length === 0 ? styles.statusTitleGood : styles.statusTitleWarning
            ]}>
              {unresolvedEvents.length === 0 ? 'All Clear' : 'Action Needed'}
            </Text>
            <Text style={styles.statusText}>
              {unresolvedEvents.length === 0
                ? 'No unresolved toxicity events'
                : `${unresolvedEvents.length} event(s) require attention`}
            </Text>
          </View>
        </View>

        {/* Unresolved Events */}
        {unresolvedEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unresolved Events</Text>
            {unresolvedEvents.map((event) => {
              const typeConfig = getTypeConfig(event.toxicityType);
              const severityColor = getSeverityColor(event.severityLevel);

              return (
                <TouchableOpacity
                  key={event.eventId}
                  style={[styles.eventCard, { borderLeftColor: severityColor }]}
                  onPress={() => {
                    setSelectedEvent(event);
                    setShowResolveModal(true);
                  }}
                >
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventIcon}>{typeConfig.icon}</Text>
                    <View style={styles.eventHeaderInfo}>
                      <Text style={styles.eventType}>{typeConfig.label}</Text>
                      <View style={styles.eventMeta}>
                        <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
                          <Text style={styles.severityText}>
                            {event.severityLevel.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.detectedBy}>
                          by {event.detectedBy === 'ai' ? '🤖 AI' : '👤 Report'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.eventDescription}>{event.description}</Text>

                  <View style={styles.eventFooter}>
                    <Text style={styles.eventTime}>
                      {new Date(event.detectedAt).toLocaleString()}
                    </Text>
                    <TouchableOpacity style={styles.resolveButton}>
                      <Text style={styles.resolveButtonText}>Resolve</Text>
                      <Ionicons name="arrow-forward" size={14} color="#4A90E2" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Resolved Events */}
        {resolvedEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Resolved</Text>
            {resolvedEvents.slice(0, 5).map((event) => {
              const typeConfig = getTypeConfig(event.toxicityType);

              return (
                <View key={event.eventId} style={styles.resolvedCard}>
                  <Text style={styles.resolvedIcon}>✅</Text>
                  <View style={styles.resolvedInfo}>
                    <Text style={styles.resolvedType}>{typeConfig.label}</Text>
                    <Text style={styles.resolvedDescription} numberOfLines={1}>
                      {event.description}
                    </Text>
                    {event.resolution && (
                      <Text style={styles.resolvedResolution} numberOfLines={1}>
                        Resolution: {event.resolution}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Empty State */}
        {events.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark" size={64} color="#27AE60" />
            <Text style={styles.emptyTitle}>No Toxicity Detected</Text>
            <Text style={styles.emptyText}>
              Your club is maintaining a healthy, positive environment
            </Text>
          </View>
        )}

        {/* Guidelines */}
        <View style={styles.guidelines}>
          <Text style={styles.guidelinesTitle}>How Toxicity Detection Works</Text>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>AI monitors posts for toxic patterns</Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>Users can report concerning content</Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>Moderators review and resolve issues</Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>High severity content is auto-hidden</Text>
          </View>
        </View>
      </ScrollView>

      {/* Resolve Modal */}
      <Modal
        visible={showResolveModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowResolveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resolve Toxicity Event</Text>
              <TouchableOpacity onPress={() => setShowResolveModal(false)}>
                <Ionicons name="close" size={24} color="#2C3E50" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedEvent && (
                <>
                  <View style={styles.eventSummary}>
                    <Text style={styles.eventSummaryLabel}>Event Type</Text>
                    <Text style={styles.eventSummaryValue}>
                      {getTypeConfig(selectedEvent.toxicityType).label}
                    </Text>
                  </View>

                  <View style={styles.eventSummary}>
                    <Text style={styles.eventSummaryLabel}>Description</Text>
                    <Text style={styles.eventSummaryValue}>{selectedEvent.description}</Text>
                  </View>

                  <Text style={styles.inputLabel}>Resolution *</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={resolution}
                    onChangeText={setResolution}
                    placeholder="Describe how you resolved this issue..."
                    multiline
                    numberOfLines={4}
                  />

                  <Text style={styles.inputLabel}>Actions Taken</Text>
                  <View style={styles.actionsList}>
                    {['Content removed', 'User warned', 'Cooldown applied', 'Topic locked', 'Other mitigation'].map((action) => (
                      <TouchableOpacity
                        key={action}
                        style={[
                          styles.actionCheckbox,
                          actions.includes(action) && styles.actionCheckboxSelected
                        ]}
                        onPress={() => toggleAction(action)}
                      >
                        <Ionicons
                          name={actions.includes(action) ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={actions.includes(action) ? '#4A90E2' : '#BDC3C7'}
                        />
                        <Text style={styles.actionLabel}>{action}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowResolveModal(false)}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleResolveEvent}
                disabled={resolving || !resolution}
              >
                {resolving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Mark Resolved</Text>
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
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    flex: 1,
    marginLeft: 12,
  },
  headerBadge: {
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  statusBanner: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    gap: 12,
  },
  statusBannerGood: {
    backgroundColor: '#D5F4E6',
  },
  statusBannerWarning: {
    backgroundColor: '#FFF4E5',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusTitleGood: {
    color: '#27AE60',
  },
  statusTitleWarning: {
    color: '#F39C12',
  },
  statusText: {
    fontSize: 13,
    color: '#7F8C8D',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  eventCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  eventHeaderInfo: {
    flex: 1,
  },
  eventType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 6,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  detectedBy: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  eventDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
    marginBottom: 12,
  },
  eventFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTime: {
    fontSize: 12,
    color: '#95A5A6',
  },
  resolveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resolveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90E2',
  },
  resolvedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  resolvedIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  resolvedInfo: {
    flex: 1,
  },
  resolvedType: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 2,
  },
  resolvedDescription: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 2,
  },
  resolvedResolution: {
    fontSize: 11,
    color: '#27AE60',
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    padding: 60,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginVertical: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#27AE60',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#7F8C8D',
    marginTop: 8,
    textAlign: 'center',
  },
  guidelines: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  modalBody: {
    padding: 20,
  },
  eventSummary: {
    marginBottom: 16,
  },
  eventSummaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8C8D',
    marginBottom: 4,
  },
  eventSummaryValue: {
    fontSize: 14,
    color: '#2C3E50',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2C3E50',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ECF0F1',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  actionsList: {
    gap: 8,
  },
  actionCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  actionCheckboxSelected: {
    backgroundColor: '#E8F4FD',
  },
  actionLabel: {
    fontSize: 14,
    color: '#2C3E50',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1',
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#4A90E2',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  buttonSecondary: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#BDC3C7',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7F8C8D',
  },
});
