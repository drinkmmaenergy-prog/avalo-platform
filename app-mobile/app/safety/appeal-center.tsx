/**
 * PACK 153 — Safety Appeal Center
 * 
 * Allows users to appeal safety decisions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { submitSafetyAppeal, getMyIncidents } from "@/services/safetyService";

interface SafetyIncident {
  id: string;
  violationType: string;
  severity: string;
  contentType: string;
  actionTaken: string;
  createdAt: any;
  appealed: boolean;
}

export default function AppealCenterScreen() {
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<SafetyIncident | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    try {
      const result = await getMyIncidents(50);
      setIncidents(result);
    } catch (error) {
      console.error('Error loading incidents:', error);
      Alert.alert('Error', 'Failed to load safety incidents');
    }
  };

  const handleSubmitAppeal = async () => {
    if (!selectedIncident) return;

    if (!appealReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for your appeal');
      return;
    }

    setLoading(true);

    try {
      await submitSafetyAppeal({
        incidentId: selectedIncident.id,
        reason: appealReason,
        evidence: evidence || undefined,
      });

      Alert.alert(
        'Appeal Submitted',
        'Your appeal has been submitted and will be reviewed by our team.',
        [{ text: 'OK', onPress: () => {
          setSelectedIncident(null);
          setAppealReason('');
          setEvidence('');
          loadIncidents();
        }}]
      );
    } catch (error: any) {
      console.error('Error submitting appeal:', error);
      Alert.alert('Error', error.message || 'Failed to submit appeal');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return '#DC2626'; // Red 600
      case 'HIGH':
        return '#EA580C'; // Orange 600
      case 'MEDIUM':
        return '#F59E0B'; // Amber 600
      case 'LOW':
        return '#10B981'; // Green 500
      default:
        return '#6B7280'; // Gray 500
    }
  };

  if (selectedIncident) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setSelectedIncident(null)}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Appeal Safety Decision</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Incident Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>
              {selectedIncident.violationType.replace(/_/g, ' ')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Severity:</Text>
            <Text
              style={[
                styles.detailValue,
                { color: getSeverityColor(selectedIncident.severity) },
              ]}
            >
              {selectedIncident.severity}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Action Taken:</Text>
            <Text style={styles.detailValue}>
              {selectedIncident.actionTaken.replace(/_/g, ' ')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>
              {formatDate(selectedIncident.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Appeal</Text>

          <Text style={styles.inputLabel}>
            Reason for Appeal <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={6}
            placeholder="Explain why you believe this decision should be reconsidered..."
            value={appealReason}
            onChangeText={setAppealReason}
            textAlignVertical="top"
          />

          <Text style={styles.inputLabel}>Additional Evidence (Optional)</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Provide any additional context or evidence..."
            value={evidence}
            onChangeText={setEvidence}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmitAppeal}
          disabled={loading || !appealReason.trim()}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Submitting...' : 'Submit Appeal'}
          </Text>
        </TouchableOpacity>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            ℹ️ Appeals are typically reviewed within 24-48 hours. You will be
            notified of the decision.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Safety Appeal Center</Text>
        <Text style={styles.subtitle}>
          Review and appeal safety decisions on your account
        </Text>
      </View>

      {incidents.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>No Safety Incidents</Text>
          <Text style={styles.emptyText}>
            You don't have any safety incidents to appeal.
          </Text>
        </View>
      ) : (
        <View style={styles.incidentsList}>
          {incidents.map((incident) => (
            <TouchableOpacity
              key={incident.id}
              style={styles.incidentCard}
              onPress={() => setSelectedIncident(incident)}
              disabled={incident.appealed}
            >
              <View style={styles.incidentHeader}>
                <Text style={styles.incidentType}>
                  {incident.violationType.replace(/_/g, ' ')}
                </Text>
                {incident.appealed && (
                  <View style={styles.appealedBadge}>
                    <Text style={styles.appealedBadgeText}>Appealed</Text>
                  </View>
                )}
              </View>

              <View style={styles.incidentDetails}>
                <View style={styles.incidentDetailItem}>
                  <Text style={styles.incidentDetailLabel}>Severity:</Text>
                  <Text
                    style={[
                      styles.incidentDetailValue,
                      { color: getSeverityColor(incident.severity) },
                    ]}
                  >
                    {incident.severity}
                  </Text>
                </View>

                <View style={styles.incidentDetailItem}>
                  <Text style={styles.incidentDetailLabel}>Action:</Text>
                  <Text style={styles.incidentDetailValue}>
                    {incident.actionTaken.replace(/_/g, ' ')}
                  </Text>
                </View>

                <View style={styles.incidentDetailItem}>
                  <Text style={styles.incidentDetailLabel}>Date:</Text>
                  <Text style={styles.incidentDetailValue}>
                    {formatDate(incident.createdAt)}
                  </Text>
                </View>
              </View>

              {!incident.appealed && (
                <View style={styles.incidentActions}>
                  <Text style={styles.appealLink}>Tap to appeal →</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  incidentsList: {
    padding: 16,
  },
  incidentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  incidentType: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
    flex: 1,
  },
  appealedBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  appealedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  incidentDetails: {
    gap: 8,
  },
  incidentDetailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  incidentDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  incidentDetailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  incidentActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  appealLink: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  required: {
    color: '#DC2626',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
  },
  noticeText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
});
