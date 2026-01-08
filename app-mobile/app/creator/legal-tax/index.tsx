/**
 * PACK 195: Legal & Tax Dashboard
 * Main entry point for creator legal and tax management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface DashboardStats {
  activeContracts: number;
  pendingSignatures: number;
  unpaidInvoices: number;
  monthlyRevenue: number;
  taxCollected: number;
}

export default function LegalTaxDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [hasTaxProfile, setHasTaxProfile] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const getTaxProfile = httpsCallable(functions, 'getTaxProfileFunction');
      const profileResult = await getTaxProfile({});
      setHasTaxProfile(!!profileResult.data);

      const getContracts = httpsCallable(functions, 'getCreatorContractsFunction');
      const contractsResult = await getContracts({ limit: 100 });
      const contracts = contractsResult.data as any[];

      const getInvoices = httpsCallable(functions, 'getCreatorInvoicesFunction');
      const invoicesResult = await getInvoices({ limit: 100 });
      const invoices = invoicesResult.data as any[];

      const activeContracts = contracts.filter((c) => c.status === 'active').length;
      const pendingSignatures = contracts.filter(
        (c) => c.status === 'pending_signature'
      ).length;
      const unpaidInvoices = invoices.filter((i) => i.status === 'pending').length;

      const thisMonth = new Date();
      thisMonth.setDate(1);
      const monthlyInvoices = invoices.filter(
        (i) =>
          i.status === 'paid' &&
          new Date(i.paidAt.seconds * 1000) >= thisMonth
      );

      const monthlyRevenue = monthlyInvoices.reduce(
        (sum, inv) => sum + inv.totalAmount,
        0
      );
      const taxCollected = monthlyInvoices.reduce(
        (sum, inv) => sum + inv.taxAmount,
        0
      );

      setStats({
        activeContracts,
        pendingSignatures,
        unpaidInvoices,
        monthlyRevenue,
        taxCollected,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  if (!hasTaxProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Set Up Tax Profile</Text>
          <Text style={styles.setupDescription}>
            Before using legal and tax features, you need to set up your tax profile
            with your business information.
          </Text>
          <TouchableOpacity
            style={styles.setupButton}
            onPress={() => router.push('/creator/legal-tax/tax-profile/setup')}
          >
            <Text style={styles.setupButtonText}>Set Up Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Legal & Tax Center</Text>
        <Text style={styles.headerSubtitle}>
          Manage contracts, invoices, and compliance
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.activeContracts || 0}</Text>
          <Text style={styles.statLabel}>Active Contracts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.pendingSignatures || 0}</Text>
          <Text style={styles.statLabel}>Pending Signatures</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.unpaidInvoices || 0}</Text>
          <Text style={styles.statLabel}>Unpaid Invoices</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ${(stats?.monthlyRevenue || 0).toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Monthly Revenue</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/contracts/create')}
        >
          <Text style={styles.actionIcon}>📄</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Create Contract</Text>
            <Text style={styles.actionDescription}>
              Generate professional contracts with anti-exploitation protection
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/invoices/create')}
        >
          <Text style={styles.actionIcon}>🧾</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Generate Invoice</Text>
            <Text style={styles.actionDescription}>
              Create professional invoices with automatic tax calculation
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/contracts')}
        >
          <Text style={styles.actionIcon}>📑</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Contracts</Text>
            <Text style={styles.actionDescription}>
              Manage all your business contracts and agreements
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/invoices')}
        >
          <Text style={styles.actionIcon}>💰</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Invoice Center</Text>
            <Text style={styles.actionDescription}>
              Track payments and manage invoices
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/tax-reports')}
        >
          <Text style={styles.actionIcon}>📊</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Tax Reports</Text>
            <Text style={styles.actionDescription}>
              Download monthly and quarterly tax reports
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/creator/legal-tax/certificates')}
        >
          <Text style={styles.actionIcon}>🏆</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Earnings Certificates</Text>
            <Text style={styles.actionDescription}>
              Generate proof of income for banks and lenders
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resources</Text>

        <TouchableOpacity
          style={styles.resourceCard}
          onPress={() => router.push('/creator/legal-tax/resources')}
        >
          <Text style={styles.resourceIcon}>📚</Text>
          <Text style={styles.resourceText}>Legal Resources Library</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resourceCard}
          onPress={() => router.push('/creator/legal-tax/tax-profile')}
        >
          <Text style={styles.resourceIcon}>⚙️</Text>
          <Text style={styles.resourceText}>Tax Profile Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.safetyBanner}>
        <Text style={styles.safetyIcon}>🛡️</Text>
        <View style={styles.safetyContent}>
          <Text style={styles.safetyTitle}>Protected by Avalo</Text>
          <Text style={styles.safetyText}>
            All contracts are checked for exploitation and predatory terms
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  setupCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#FFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  setupDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  setupButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  setupButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    margin: '1%',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: '#666',
  },
  resourceCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  resourceIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  resourceText: {
    fontSize: 16,
    fontWeight: '500',
  },
  safetyBanner: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  safetyIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  safetyContent: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  safetyText: {
    fontSize: 14,
    color: '#4CAF50',
  },
});
