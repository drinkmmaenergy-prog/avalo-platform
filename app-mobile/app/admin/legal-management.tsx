/**
 * PACK 338: Admin Legal Management Console
 * 
 * Admin interface for managing:
 * - Legal documents
 * - User compliance status
 * - Content strikes
 * - Geo-legal rules
 * - Audit logs
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import {
  getAllActiveLegalDocuments,
  getUserAuditLogs,
  type LegalDocument,
  type RegulatorAuditLog
} from "@/lib/legal-compliance";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

type TabType = 'DOCUMENTS' | 'STRIKES' | 'GEO_RULES' | 'AUDIT_LOGS';

export default function LegalManagementScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('DOCUMENTS');
  const [loading, setLoading] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Legal Compliance Management</Text>
        <Text style={styles.headerSubtitle}>Pack 338 - Admin Console</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'DOCUMENTS' && styles.activeTab]}
          onPress={() => setActiveTab('DOCUMENTS')}
        >
          <Text style={[styles.tabText, activeTab === 'DOCUMENTS' && styles.activeTabText]}>
            Documents
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'STRIKES' && styles.activeTab]}
          onPress={() => setActiveTab('STRIKES')}
        >
          <Text style={[styles.tabText, activeTab === 'STRIKES' && styles.activeTabText]}>
            Strikes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'GEO_RULES' && styles.activeTab]}
          onPress={() => setActiveTab('GEO_RULES')}
        >
          <Text style={[styles.tabText, activeTab === 'GEO_RULES' && styles.activeTabText]}>
            Geo Rules
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'AUDIT_LOGS' && styles.activeTab]}
          onPress={() => setActiveTab('AUDIT_LOGS')}
        >
          <Text style={[styles.tabText, activeTab === 'AUDIT_LOGS' && styles.activeTabText]}>
            Audit Logs
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'DOCUMENTS' && <DocumentsTab />}
        {activeTab === 'STRIKES' && <StrikesTab />}
        {activeTab === 'GEO_RULES' && <GeoRulesTab />}
        {activeTab === 'AUDIT_LOGS' && <AuditLogsTab />}
      </ScrollView>
    </View>
  );
}

// ========================================
// DOCUMENTS TAB
// ========================================

function DocumentsTab() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await getAllActiveLegalDocuments('en');
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF006B" />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Active Legal Documents</Text>
      {documents.map(doc => (
        <View key={doc.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{doc.type}</Text>
            <Text style={styles.badge}>{doc.version}</Text>
          </View>
          <Text style={styles.cardSubtitle}>Language: {doc.language}</Text>
          <Text style={styles.cardText} numberOfLines={3}>
            {doc.bodyMarkdown.substring(0, 100)}...
          </Text>
        </View>
      ))}
      
      <TouchableOpacity style={styles.addButton}>
        <Text style={styles.addButtonText}>+ Create New Document</Text>
      </TouchableOpacity>
    </View>
  );
}

// ========================================
// STRIKES TAB
// ========================================

function StrikesTab() {
  const [searchUserId, setSearchUserId] = useState('');

  const handleSearch = () => {
    if (!searchUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }
    // In production, load and display user strikes
    Alert.alert('Search', `Searching strikes for user: ${searchUserId}`);
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>User Strikes Search</Text>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter User ID"
          placeholderTextColor="#555"
          value={searchUserId}
          onChangeText={setSearchUserId}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Issue New Strike</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Strike Management</Text>
        <Text style={styles.cardText}>
          Strikes should be issued through automated systems or admin review processes.
        </Text>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Manual Strike Tool</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Strike Enforcement Rules:</Text>
        <Text style={styles.infoText}>• Severity 1: Warning only</Text>
        <Text style={styles.infoText}>• Severity 2: 24-72h freeze</Text>
        <Text style={styles.infoText}>• Severity 3+: Permanent ban</Text>
      </View>
    </View>
  );
}

// ========================================
// GEO RULES TAB
// ========================================

function GeoRulesTab() {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Geo-Legal Rules Configuration</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Default Global Rules</Text>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Adult Content Allowed:</Text>
          <Text style={styles.ruleValue}>✅ Yes</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>AI Erotic Allowed:</Text>
          <Text style={styles.ruleValue}>✅ Yes</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Payouts Allowed:</Text>
          <Text style={styles.ruleValue}>✅ Yes</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Crypto Payments:</Text>
          <Text style={styles.ruleValue}>✅ Yes</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.addButton}>
        <Text style={styles.addButtonText}>+ Add Country-Specific Rule</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Rule Enforcement:</Text>
        <Text style={styles.infoText}>
          Stricter rule always wins when user and earner are in different jurisdictions.
        </Text>
      </View>
    </View>
  );
}

// ========================================
// AUDIT LOGS TAB
// ========================================

function AuditLogsTab() {
  const [searchUserId, setSearchUserId] = useState('');
  const [logs, setLogs] = useState<RegulatorAuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }

    setLoading(true);
    try {
      const userLogs = await getUserAuditLogs(searchUserId);
      setLogs(userLogs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      Alert.alert('Error', 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    Alert.alert('Export', 'Export functionality for authorities would be implemented here');
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Regulator Audit Logs</Text>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter User ID"
          placeholderTextColor="#555"
          value={searchUserId}
          onChangeText={setSearchUserId}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#FF006B" style={{ marginTop: 20 }} />}

      {logs.length > 0 && (
        <>
          <Text style={styles.resultsCount}>{logs.length} log entries found</Text>
          {logs.map(log => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <Text style={styles.logAction}>{log.actionType}</Text>
                <Text style={styles.logDate}>
                  {log.createdAt && 'toDate' in log.createdAt 
                    ? log.createdAt.toDate().toLocaleDateString() 
                    : 'N/A'}
                </Text>
              </View>
              {log.relatedEntityId && (
                <Text style={styles.logDetail}>Entity: {log.relatedEntityId}</Text>
              )}
              {log.metaJson && (
                <Text style={styles.logMeta}>{JSON.stringify(log.metaJson, null, 2)}</Text>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
            <Text style={styles.exportButtonText}>📥 Export for Authorities</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Audit Log Features:</Text>
        <Text style={styles.infoText}>• Append-only, immutable records</Text>
        <Text style={styles.infoText}>• Never deletable</Text>
        <Text style={styles.infoText}>• Exportable for regulatory compliance</Text>
      </View>
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#FF006B',
  },
  tabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  cardText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    backgroundColor: '#FF006B',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  addButton: {
    backgroundColor: '#0088ff',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginRight: 12,
  },
  searchButton: {
    backgroundColor: '#FF006B',
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#1a1a2a',
    borderWidth: 1,
    borderColor: '#0088ff',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  infoTitle: {
    color: '#4488ff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    color: '#8888cc',
    fontSize: 13,
    marginBottom: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  ruleLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  ruleValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsCount: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  logCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  logAction: {
    color: '#FF006B',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logDate: {
    color: '#888',
    fontSize: 12,
  },
  logDetail: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  logMeta: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  exportButton: {
    backgroundColor: '#00aa44',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

