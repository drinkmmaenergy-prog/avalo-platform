/**
 * PACK 156: Compliance Warnings Screen
 * View and acknowledge compliance warnings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { auth } from "@/lib/firebase";

interface ComplianceWarning {
  reason: string;
  reasonCode: string;
  severity: number;
  issuedAt: Date;
  acknowledged: boolean;
}

export default function ComplianceWarningsScreen() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUserId(currentUser.uid);
    }
  }, []);
  const [warnings, setWarnings] = useState<ComplianceWarning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWarnings();
  }, [userId]);

  const loadWarnings = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/warnings/${userId}`
      );
      const data = await response.json();
      setWarnings(data.warnings || []);
    } catch (error) {
      console.error('Failed to load warnings:', error);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeWarning = async (index: number) => {
    if (!userId) return;

    try {
      await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/warnings/${userId}/acknowledge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warningIndex: index })
        }
      );

      const updatedWarnings = [...warnings];
      updatedWarnings[index].acknowledged = true;
      setWarnings(updatedWarnings);

      Alert.alert('Acknowledged', 'Warning has been acknowledged.');
    } catch (error) {
      Alert.alert('Error', 'Failed to acknowledge warning');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Compliance Warnings' }} />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Compliance Warnings',
          headerBackTitle: 'Back'
        }}
      />

      <ScrollView style={styles.scrollView}>
        {warnings.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={64} color="#4caf50" />
            <Text style={styles.emptyTitle}>No Warnings</Text>
            <Text style={styles.emptyText}>
              You have no compliance warnings at this time.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.headerText}>
                You have {warnings.filter(w => !w.acknowledged).length} unacknowledged warning(s)
              </Text>
            </View>

            {warnings.map((warning, index) => (
              <WarningCard
                key={index}
                warning={warning}
                onAcknowledge={() => acknowledgeWarning(index)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface WarningCardProps {
  warning: ComplianceWarning;
  onAcknowledge: () => void;
}

function WarningCard({ warning, onAcknowledge }: WarningCardProps) {
  const severityColor = getSeverityColor(warning.severity);
  const severityLabel = getSeverityLabel(warning.severity);

  return (
    <View style={[styles.card, { borderLeftColor: severityColor.text }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.severityBadge, { backgroundColor: severityColor.background }]}>
          <Text style={[styles.severityText, { color: severityColor.text }]}>
            {severityLabel}
          </Text>
        </View>
        {warning.acknowledged && (
          <View style={styles.acknowledgedBadge}>
            <MaterialIcons name="check" size={14} color="#4caf50" />
            <Text style={styles.acknowledgedText}>Acknowledged</Text>
          </View>
        )}
      </View>

      <Text style={styles.reasonCode}>{warning.reasonCode}</Text>
      <Text style={styles.reason}>{warning.reason}</Text>
      
      <Text style={styles.date}>
        Issued: {new Date(warning.issuedAt).toLocaleDateString()}
      </Text>

      {!warning.acknowledged && (
        <TouchableOpacity
          style={styles.acknowledgeButton}
          onPress={onAcknowledge}
        >
          <Text style={styles.acknowledgeButtonText}>Acknowledge</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getSeverityColor(severity: number) {
  switch (severity) {
    case 5:
      return { background: '#fee', text: '#c00' };
    case 4:
      return { background: '#ffd7d7', text: '#900' };
    case 3:
      return { background: '#fff3cd', text: '#856404' };
    default:
      return { background: '#d1ecf1', text: '#0c5460' };
  }
}

function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 5:
      return 'Critical';
    case 4:
      return 'Severe';
    case 3:
      return 'Moderate';
    case 2:
      return 'Minor';
    default:
      return 'Notice';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollView: {
    flex: 1
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  emptyState: {
    padding: 48,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    color: '#333'
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700'
  },
  acknowledgedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  acknowledgedText: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600'
  },
  reasonCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8
  },
  reason: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12
  },
  acknowledgeButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center'
  },
  acknowledgeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  }
});
