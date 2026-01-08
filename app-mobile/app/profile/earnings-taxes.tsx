/**
 * PACK 129 — Earnings & Taxes Dashboard
 * Main screen for tax profile management and earnings overview
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useTax } from "@/hooks/useTax";
import { useTreasury } from "@/hooks/useTreasury";
import {
  REVENUE_CATEGORY_LABELS,
  ENTITY_TYPE_LABELS,
} from "@/types/tax";

export default function EarningsTaxesScreen() {
  const auth = getAuth();
  const user = auth.currentUser;
  
  const {
    profile,
    profileExists,
    profileLoading,
    compliance,
    isCompliant,
    complianceBlockers,
    documents,
    withholdingRecords,
    totalWithheld,
    reloadProfile,
  } = useTax();

  const { creatorBalance } = useTreasury(user?.uid || null, true);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await reloadProfile();
    setRefreshing(false);
  };

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading earnings & taxes...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings & Taxes</Text>
        <Text style={styles.headerSubtitle}>
          Manage your tax profile and download earnings statements
        </Text>
      </View>

      {/* Earnings Summary Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Earnings</Text>
        <View style={styles.earningsRow}>
          <Text style={styles.earningsLabel}>Available Balance</Text>
          <Text style={styles.earningsValue}>
            {creatorBalance?.availableTokens?.toLocaleString() || 0} tokens
          </Text>
        </View>
        <View style={styles.earningsRow}>
          <Text style={styles.earningsLabel}>Locked (Pending Payout)</Text>
          <Text style={styles.earningsValue}>
            {creatorBalance?.lockedTokens?.toLocaleString() || 0} tokens
          </Text>
        </View>
        <View style={styles.earningsRow}>
          <Text style={styles.earningsLabel}>Lifetime Earned</Text>
          <Text style={styles.earningsValue}>
            {creatorBalance?.lifetimeEarned?.toLocaleString() || 0} tokens
          </Text>
        </View>
        {totalWithheld > 0 && (
          <View style={[styles.earningsRow, styles.taxRow]}>
            <Text style={styles.taxLabel}>Total Tax Withheld</Text>
            <Text style={styles.taxValue}>
              {totalWithheld.toLocaleString()} tokens
            </Text>
          </View>
        )}
      </View>

      {/* Tax Profile Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Tax Profile</Text>
          {profileExists && (
            <TouchableOpacity
              onPress={() => Alert.alert('Edit Tax Profile', 'Feature coming soon')}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {!profileExists ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No tax profile found. Submit your tax information to enable
              payouts.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Alert.alert('Submit Tax Profile', 'Feature coming soon')}
            >
              <Text style={styles.primaryButtonText}>Submit Tax Profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Entity Type</Text>
              <Text style={styles.profileValue}>
                {profile ? ENTITY_TYPE_LABELS[profile.entityType] : 'N/A'}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Country</Text>
              <Text style={styles.profileValue}>{profile?.country || 'N/A'}</Text>
            </View>
            {profile?.businessName && (
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Business Name</Text>
                <Text style={styles.profileValue}>{profile.businessName}</Text>
              </View>
            )}
            {profile?.taxId && (
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Tax ID</Text>
                <Text style={styles.profileValue}>{profile.taxId}</Text>
              </View>
            )}
            {profile?.vatId && (
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>VAT ID</Text>
                <Text style={styles.profileValue}>{profile.vatId}</Text>
              </View>
            )}
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  profile?.status === 'ACTIVE' && styles.statusActive,
                  profile?.status === 'REVIEW_REQUIRED' && styles.statusReview,
                  profile?.status === 'SUSPENDED' && styles.statusSuspended,
                ]}
              >
                <Text style={styles.statusText}>{profile?.status || 'N/A'}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Tax Compliance Status */}
      {profileExists && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payout Compliance</Text>
          {isCompliant ? (
            <View style={styles.complianceGood}>
              <Text style={styles.complianceGoodText}>
                ✓ All compliance requirements met
              </Text>
            </View>
          ) : (
            <View style={styles.complianceIssues}>
              <Text style={styles.complianceIssuesTitle}>
                Requirements Not Met:
              </Text>
              {complianceBlockers.map((blocker, index) => (
                <Text key={index} style={styles.complianceIssueText}>
                  • {blocker}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Withholding Information */}
      {profile?.requiresWithholding && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tax Withholding</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Your region requires tax withholding. Taxes will be automatically
              calculated and withheld from your payouts according to {profile.country}{' '}
              regulations.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => Alert.alert('Withholding Details', `Total withheld: ${totalWithheld} tokens`)}
          >
            <Text style={styles.secondaryButtonText}>
              View Withholding History
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tax Documents */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Tax Documents</Text>
          <Text style={styles.documentCount}>
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {documents.length === 0 ? (
          <Text style={styles.emptyDocuments}>
            No tax documents yet. Documents are generated automatically after your
            first payout.
          </Text>
        ) : (
          <View>
            {documents.slice(0, 5).map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.documentRow}
                onPress={() => Alert.alert('Tax Document', `Document: ${doc.documentNumber}`)}
              >
                <View>
                  <Text style={styles.documentTitle}>
                    {doc.documentType.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.documentSubtitle}>
                    {doc.documentNumber} • {new Date(doc.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.documentArrow}>›</Text>
              </TouchableOpacity>
            ))}
            {documents.length > 5 && (
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => Alert.alert('All Documents', `${documents.length} documents total`)}
              >
                <Text style={styles.viewAllText}>View All Documents →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Generate Documents Actions */}
        <View style={styles.documentActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Generate Invoice', 'Feature coming soon')}
          >
            <Text style={styles.actionButtonText}>Generate Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Generate Report', 'Feature coming soon')}
          >
            <Text style={styles.actionButtonText}>Tax Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Important Note */}
      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>📋 Important Note</Text>
        <Text style={styles.noteText}>
          Tax profiles are for compliance only. All creators receive the same 65/35
          revenue split regardless of business entity type or tax status.
        </Text>
        <Text style={[styles.noteText, { marginTop: 8 }]}>
          Taxes are automatically calculated based on your region's requirements.
          You can download tax documents at any time for your records or
          accountant.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
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
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFF',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  editLink: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  earningsLabel: {
    fontSize: 16,
    color: '#666',
  },
  earningsValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  taxRow: {
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 12,
    marginHorizontal: -16,
    marginTop: 8,
    borderBottomWidth: 0,
  },
  taxLabel: {
    fontSize: 16,
    color: '#856404',
    fontWeight: '500',
  },
  taxValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  profileLabel: {
    fontSize: 15,
    color: '#666',
  },
  profileValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E5E5E5',
  },
  statusActive: {
    backgroundColor: '#D4EDDA',
  },
  statusReview: {
    backgroundColor: '#FFF3CD',
  },
  statusSuspended: {
    backgroundColor: '#F8D7DA',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  complianceGood: {
    backgroundColor: '#D4EDDA',
    padding: 12,
    borderRadius: 8,
  },
  complianceGoodText: {
    fontSize: 15,
    color: '#155724',
    fontWeight: '500',
  },
  complianceIssues: {
    backgroundColor: '#F8D7DA',
    padding: 12,
    borderRadius: 8,
  },
  complianceIssuesTitle: {
    fontSize: 15,
    color: '#721C24',
    fontWeight: '600',
    marginBottom: 8,
  },
  complianceIssueText: {
    fontSize: 14,
    color: '#721C24',
    marginVertical: 2,
  },
  infoBox: {
    backgroundColor: '#E7F3FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#004085',
    lineHeight: 20,
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  documentCount: {
    fontSize: 14,
    color: '#666',
  },
  emptyDocuments: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  documentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  documentSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  documentArrow: {
    fontSize: 24,
    color: '#CCC',
  },
  viewAllButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  documentActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  noteCard: {
    backgroundColor: '#FFFBF0',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE066',
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
});
