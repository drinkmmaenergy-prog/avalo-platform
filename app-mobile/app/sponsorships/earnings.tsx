/**
 * PACK 151 - Sponsorship Earnings Dashboard
 * Track sponsorship revenue and payouts
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity
} from 'react-native';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { getAuth } from 'firebase/auth';
import type { SponsorshipContract } from "@/lib/sponsorships/types";
import { formatCurrency, getStatusColor, calculateEscrowFees } from "@/lib/sponsorships/sdk";

interface EarningsData {
  totalEarnings: number;
  pendingEarnings: number;
  inEscrow: number;
  completedContracts: number;
  activeContracts: number;
}

export default function SponsorshipEarnings() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [earnings, setEarnings] = useState<EarningsData>({
    totalEarnings: 0,
    pendingEarnings: 0,
    inEscrow: 0,
    completedContracts: 0,
    activeContracts: 0
  });
  const [contracts, setContracts] = useState<SponsorshipContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadEarnings();
    }
  }, [user]);

  const loadEarnings = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const contractsQuery = query(
        collection(db, 'sponsorship_contracts'),
        where('creatorId', '==', user.uid)
      );

      const snapshot = await getDocs(contractsQuery);
      const contractsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          deliverables: data.deliverables || [],
          metadata: {
            ...data.metadata,
            createdAt: data.metadata.createdAt instanceof Timestamp 
              ? data.metadata.createdAt.toDate() 
              : new Date(data.metadata.createdAt),
            updatedAt: data.metadata.updatedAt instanceof Timestamp 
              ? data.metadata.updatedAt.toDate() 
              : new Date(data.metadata.updatedAt),
            startedAt: data.metadata.startedAt 
              ? (data.metadata.startedAt instanceof Timestamp 
                ? data.metadata.startedAt.toDate() 
                : new Date(data.metadata.startedAt))
              : undefined,
            completedAt: data.metadata.completedAt 
              ? (data.metadata.completedAt instanceof Timestamp 
                ? data.metadata.completedAt.toDate() 
                : new Date(data.metadata.completedAt))
              : undefined
          },
          agreement: {
            ...data.agreement,
            acceptedAt: data.agreement.acceptedAt instanceof Timestamp 
              ? data.agreement.acceptedAt.toDate() 
              : new Date(data.agreement.acceptedAt)
          },
          compensation: {
            ...data.compensation,
            paidAt: data.compensation.paidAt 
              ? (data.compensation.paidAt instanceof Timestamp 
                ? data.compensation.paidAt.toDate() 
                : new Date(data.compensation.paidAt))
              : undefined
          }
        } as SponsorshipContract;
      });

      let totalEarnings = 0;
      let pendingEarnings = 0;
      let inEscrow = 0;
      let completedCount = 0;
      let activeCount = 0;

      contractsData.forEach(contract => {
        const amount = contract.compensation.useTokens
          ? calculateEscrowFees(contract.compensation.amount).creatorAmount
          : contract.compensation.amount;

        if (contract.status === 'completed' && contract.compensation.paidAt) {
          totalEarnings += amount;
          completedCount++;
        } else if (contract.status === 'in_progress' || contract.status === 'awaiting_approval') {
          pendingEarnings += amount;
          activeCount++;
        }

        if (contract.compensation.escrowId && !contract.compensation.paidAt) {
          inEscrow += amount;
        }
      });

      setEarnings({
        totalEarnings,
        pendingEarnings,
        inEscrow,
        completedContracts: completedCount,
        activeContracts: activeCount
      });

      setContracts(contractsData.sort((a, b) => 
        b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime()
      ));
    } catch (error) {
      console.error('Error loading earnings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadEarnings();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading earnings...</Text>
      </View>
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
        <Text style={styles.headerTitle}>Sponsorship Earnings</Text>
        <Text style={styles.headerSubtitle}>Track your revenue</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Earned</Text>
          <Text style={styles.statValue}>{formatCurrency(earnings.totalEarnings)}</Text>
          <Text style={styles.statSubtext}>{earnings.completedContracts} completed</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={[styles.statValue, styles.pendingValue]}>
            {formatCurrency(earnings.pendingEarnings)}
          </Text>
          <Text style={styles.statSubtext}>{earnings.activeContracts} active</Text>
        </View>
      </View>

      {earnings.inEscrow > 0 && (
        <View style={styles.escrowCard}>
          <Text style={styles.escrowLabel}>In Escrow</Text>
          <Text style={styles.escrowValue}>{formatCurrency(earnings.inEscrow)}</Text>
          <Text style={styles.escrowNote}>
            Funds held until deliverables are approved
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Contracts</Text>
        {contracts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No sponsorship contracts yet</Text>
            <Text style={styles.emptySubtext}>
              Apply to sponsorships to start earning!
            </Text>
          </View>
        ) : (
          contracts.map(contract => (
            <View key={contract.id} style={styles.contractCard}>
              <View style={styles.contractHeader}>
                <View style={styles.contractInfo}>
                  <Text style={styles.contractTitle}>Contract #{contract.id.slice(0, 8)}</Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(contract.status) }
                  ]}>
                    <Text style={styles.statusText}>{contract.status}</Text>
                  </View>
                </View>
                <Text style={styles.contractAmount}>
                  {contract.compensation.useTokens && '🪙 '}
                  {formatCurrency(
                    contract.compensation.useTokens
                      ? calculateEscrowFees(contract.compensation.amount).creatorAmount
                      : contract.compensation.amount
                  )}
                </Text>
              </View>

              <View style={styles.contractDetails}>
                <Text style={styles.contractDetailLabel}>Deliverables:</Text>
                <Text style={styles.contractDetailValue}>
                  {contract.deliverables.filter(d => d.status === 'approved').length} / {contract.deliverables.length}
                </Text>
              </View>

              {contract.metadata.completedAt && (
                <Text style={styles.contractDate}>
                  Completed: {contract.metadata.completedAt.toLocaleDateString()}
                </Text>
              )}

              {contract.compensation.paidAt && (
                <View style={styles.paidBadge}>
                  <Text style={styles.paidText}>✓ Paid Out</Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280'
  },
  header: {
    padding: 20,
    backgroundColor: '#8B5CF6',
    paddingTop: 60
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E9D5FF'
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4
  },
  pendingValue: {
    color: '#F59E0B'
  },
  statSubtext: {
    fontSize: 12,
    color: '#9CA3AF'
  },
  escrowCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D'
  },
  escrowLabel: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 8
  },
  escrowValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#B45309',
    marginBottom: 4
  },
  escrowNote: {
    fontSize: 12,
    color: '#92400E'
  },
  section: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16
  },
  contractCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  contractInfo: {
    flex: 1
  },
  contractTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start'
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize'
  },
  contractAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981'
  },
  contractDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6'
  },
  contractDetailLabel: {
    fontSize: 14,
    color: '#6B7280'
  },
  contractDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827'
  },
  contractDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8
  },
  paidBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  paidText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600'
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center'
  }
});
