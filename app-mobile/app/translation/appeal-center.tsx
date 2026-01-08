/**
 * PACK 154 — Translation Appeal Center
 * Users can view blocked translations and submit appeals
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getBlockedTranslations,
  getMyAppeals,
  submitTranslationAppeal,
  checkAppealEligibility,
  formatBlockReason,
  getLanguageName,
  getLanguageFlag,
  TranslationAppeal,
} from "@/services/translationService";

export default function AppealCenterScreen() {
  const [activeTab, setActiveTab] = useState<'blocked' | 'appeals'>('blocked');
  const [blockedTranslations, setBlockedTranslations] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<TranslationAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTranslation, setSelectedTranslation] = useState<any | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealEvidence, setAppealEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'blocked') {
        const result = await getBlockedTranslations(50);
        setBlockedTranslations(result.blockedTranslations);
      } else {
        const result = await getMyAppeals();
        setAppeals(result.appeals);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAppealPress = async (translation: any) => {
    // Check eligibility
    const eligibility = await checkAppealEligibility(translation.translationId);
    
    if (!eligibility.eligible) {
      Alert.alert('Cannot Appeal', eligibility.reason || 'This translation cannot be appealed.');
      return;
    }

    setSelectedTranslation(translation);
    setAppealReason('');
    setAppealEvidence('');
  };

  const handleSubmitAppeal = async () => {
    if (!selectedTranslation || !appealReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for your appeal.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await submitTranslationAppeal(
        selectedTranslation.translationId,
        appealReason.trim(),
        appealEvidence.trim() || undefined
      );

      Alert.alert('Success', result.message, [
        {
          text: 'OK',
          onPress: () => {
            setSelectedTranslation(null);
            setAppealReason('');
            setAppealEvidence('');
            loadData();
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit appeal.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBlockedTranslation = (translation: any, index: number) => (
    <View key={index} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.languageInfo}>
          <Text style={styles.languageFlag}>
            {getLanguageFlag(translation.sourceLanguage)}
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#999" />
          <Text style={styles.languageFlag}>
            {getLanguageFlag(translation.targetLanguage)}
          </Text>
          <Text style={styles.languageName}>
            {getLanguageName(translation.sourceLanguage)} → {getLanguageName(translation.targetLanguage)}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(translation.timestamp).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.blockReasonContainer}>
        <Ionicons name="shield-outline" size={20} color="#FF3B30" />
        <Text style={styles.blockReason}>
          {formatBlockReason(translation.blockReason)}
        </Text>
      </View>

      {translation.appealEligible && (
        <TouchableOpacity
          style={styles.appealButton}
          onPress={() => handleAppealPress(translation)}
        >
          <Ionicons name="document-text-outline" size={20} color="#007AFF" />
          <Text style={styles.appealButtonText}>Submit Appeal</Text>
        </TouchableOpacity>
      )}

      {translation.appealStatus && (
        <View style={styles.appealStatus}>
          <Text style={styles.appealStatusText}>
            Appeal Status: {translation.appealStatus.toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );

  const renderAppeal = (appeal: TranslationAppeal, index: number) => {
    const statusColors = {
      pending: '#FF9500',
      under_review: '#007AFF',
      approved: '#34C759',
      rejected: '#FF3B30',
      escalated: '#5856D6',
    };

    const statusColor = statusColors[appeal.status] || '#999';

    return (
      <View key={index} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {appeal.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timestamp}>
            {new Date(appeal.submittedAt).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.appealContent}>
          <Text style={styles.appealLabel}>Block Reason:</Text>
          <Text style={styles.appealText}>
            {formatBlockReason(appeal.blockReason)}
          </Text>
        </View>

        {appeal.reviewedAt && (
          <View style={styles.reviewInfo}>
            <Ionicons 
              name={appeal.decision === 'allow_translation' ? 'checkmark-circle' : 'close-circle'} 
              size={20} 
              color={appeal.decision === 'allow_translation' ? '#34C759' : '#FF3B30'} 
            />
            <Text style={styles.reviewText}>
              Reviewed on {new Date(appeal.reviewedAt).toLocaleDateString()}
            </Text>
          </View>
        )}

        {appeal.reviewerNotes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Reviewer Notes:</Text>
            <Text style={styles.notesText}>{appeal.reviewerNotes}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Translation Appeals',
          headerBackTitle: 'Back',
        }}
      />

      <View style={styles.container}>
        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'blocked' && styles.activeTab]}
            onPress={() => setActiveTab('blocked')}
          >
            <Text style={[styles.tabText, activeTab === 'blocked' && styles.activeTabText]}>
              Blocked Translations
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'appeals' && styles.activeTab]}
            onPress={() => setActiveTab('appeals')}
          >
            <Text style={[styles.tabText, activeTab === 'appeals' && styles.activeTabText]}>
              My Appeals
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            {activeTab === 'blocked' ? (
              blockedTranslations.length > 0 ? (
                blockedTranslations.map((translation, index) =>
                  renderBlockedTranslation(translation, index)
                )
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle" size={64} color="#34C759" />
                  <Text style={styles.emptyText}>No blocked translations</Text>
                </View>
              )
            ) : appeals.length > 0 ? (
              appeals.map((appeal, index) => renderAppeal(appeal, index))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={64} color="#999" />
                <Text style={styles.emptyText}>No appeals submitted</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Appeal Modal */}
        {selectedTranslation && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Submit Appeal</Text>
                <TouchableOpacity onPress={() => setSelectedTranslation(null)}>
                  <Ionicons name="close" size={28} color="#000" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.modalLabel}>Block Reason:</Text>
                <Text style={styles.modalText}>
                  {formatBlockReason(selectedTranslation.blockReason)}
                </Text>

                <Text style={[styles.modalLabel, { marginTop: 16 }]}>
                  Reason for Appeal: <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.textArea}
                  value={appealReason}
                  onChangeText={setAppealReason}
                  placeholder="Explain why you believe this was a mistake..."
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={styles.charCount}>{appealReason.length}/500</Text>

                <Text style={[styles.modalLabel, { marginTop: 16 }]}>
                  Additional Evidence (Optional):
                </Text>
                <TextInput
                  style={styles.textArea}
                  value={appealEvidence}
                  onChangeText={setAppealEvidence}
                  placeholder="Provide any additional context..."
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
                <Text style={styles.charCount}>{appealEvidence.length}/300</Text>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setSelectedTranslation(null)}
                  disabled={submitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleSubmitAppeal}
                  disabled={submitting || !appealReason.trim()}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit Appeal</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageFlag: {
    fontSize: 20,
  },
  languageName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  blockReasonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    marginBottom: 12,
  },
  blockReason: {
    flex: 1,
    fontSize: 14,
    color: '#FF3B30',
    lineHeight: 20,
  },
  appealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  appealButtonText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
  appealStatus: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    alignItems: 'center',
  },
  appealStatusText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  appealContent: {
    marginBottom: 12,
  },
  appealLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    fontWeight: '600',
  },
  appealText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  reviewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  reviewText: {
    fontSize: 13,
    color: '#666',
  },
  notesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  modalBody: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF3B30',
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#000',
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 10,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
