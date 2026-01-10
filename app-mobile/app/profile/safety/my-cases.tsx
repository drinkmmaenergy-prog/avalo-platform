/**
 * PACK 158 — My Safety Cases Screen
 * 
 * Shows user their own safety cases (if they are a victim/reporter)
 * NOT for spying on others
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";
const LegalCaseCard = ({ caseId }: any) => (
  <View style={{ padding: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginBottom: 8 }}>
    <Text>Case ID: {caseId}</Text>
    <Text>Status: stubbed</Text>
  </View>
);

interface SafetyCase {
  caseId: string;
  vaultId: string;
  category: string;
  severity: string;
  status: 'open' | 'closed' | 'pending';
  createdAt: Date;
  reporterId: string;
}

export default function MyCasesScreen() {
  const router = useRouter();
  const [cases, setCases] = useState<SafetyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const q = query(
        collection(db, 'legal_evidence_vaults'),
        where('reporterId', '==', userId)
      );

      const snapshot = await getDocs(q);
      const loadedCases: SafetyCase[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedCases.push({
          caseId: data.caseId,
          vaultId: doc.id,
          category: data.category,
          severity: data.severity,
          status: determineStatus(data),
          createdAt: data.createdAt?.toDate() || new Date(),
          reporterId: data.reporterId,
        });
      });

      setCases(loadedCases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error('Error loading cases:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const determineStatus = (vaultData: any): 'open' | 'closed' | 'pending' => {
    if (vaultData.status) return vaultData.status;
    return 'open';
  };

  const handleRequestExport = (caseData: SafetyCase) => {
    Alert.alert(
      'Request Evidence Export',
      'Do you want to request an export of the evidence in this case? This may take 48-72 hours to process.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: () => {
            router.push({
              pathname: '/legal/evidence-request' as any,
              params: { vaultId: caseData.vaultId },
            });
          },
        },
      ]
    );
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCases();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your cases...</Text>
      </View>
    );
  }

  if (cases.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No Safety Cases</Text>
          <Text style={styles.emptyText}>
            You don't have any active safety cases.{'\n\n'}
            If you need to report a safety concern, please use the report feature in the app.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>My Safety Cases</Text>
        <Text style={styles.subtitle}>
          Cases where you reported a safety or legal violation
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ About Your Cases</Text>
        <Text style={styles.infoText}>
          • These are cases YOU reported{'\n'}
          • Evidence is encrypted and protected{'\n'}
          • You can request export copies{'\n'}
          • Cases auto-delete after retention period
        </Text>
      </View>

      <View style={styles.casesList}>
        {cases.map((caseData) => (
          <LegalCaseCard
            key={caseData.vaultId}
            caseId={caseData.caseId}
            category={caseData.category}
            severity={caseData.severity}
            status={caseData.status}
            createdAt={caseData.createdAt}
            onRequestExport={() => handleRequestExport(caseData)}
          />
        ))}
      </View>

      <View style={styles.privacyNote}>
        <Text style={styles.privacyTitle}>🔒 Privacy & Protection</Text>
        <Text style={styles.privacyText}>
          Evidence vaults only store legally relevant violations.{'\n\n'}
          We do NOT store:{'\n'}
          • Consensual adult conversations{'\n'}
          • Romantic messages without abuse{'\n'}
          • Regular dating interactions{'\n'}
          • Private consensual content{'\n\n'}
          Your privacy is protected.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  infoBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  casesList: {
    padding: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  privacyNote: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9c27b0',
    marginBottom: 32,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#7b1fa2',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 13,
    color: '#6a1b9a',
    lineHeight: 20,
  },
});
