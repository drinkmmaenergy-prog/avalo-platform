/**
 * PACK 84 — KYC Status Screen
 * Shows current KYC verification status and allows users to start verification
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKycStatus } from "@/hooks/useKyc";
import { getKycStatusDisplay } from "@/types/kyc";
import { useAuth } from "@/hooks/useAuth";

export default function KycStatusScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { status, isLoading, error, refresh } = useKycStatus(user?.uid);

  const handleStartVerification = () => {
    router.push('/wallet/kyc-form');
  };

  const handleViewDocuments = () => {
    router.push('/wallet/kyc-documents');
  };

  const handleResubmit = () => {
    router.push('/wallet/kyc-form');
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading verification status...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorTitle}>Error Loading Status</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No status available</Text>
      </View>
    );
  }

  const displayInfo = getKycStatusDisplay(status.status);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refresh} />
      }
    >
      <View style={styles.content}>
        {/* Status Card */}
        <View style={[styles.statusCard, { borderLeftColor: displayInfo.color }]}>
          <View style={styles.statusHeader}>
            <View style={[styles.iconContainer, { backgroundColor: displayInfo.color + '20' }]}>
              <Ionicons name={displayInfo.icon as any} size={32} color={displayInfo.color} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>{displayInfo.label}</Text>
              <Text style={styles.statusDate}>
                Last updated: {new Date(status.lastUpdatedAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
          
          <Text style={styles.statusDescription}>{displayInfo.description}</Text>

          {status.rejectionReason && (
            <View style={styles.rejectionReasonBox}>
              <Ionicons name="information-circle" size={20} color="#EF4444" />
              <Text style={styles.rejectionReasonText}>{status.rejectionReason}</Text>
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Why Verification is Required</Text>
          <Text style={styles.infoText}>
            To comply with financial regulations and ensure the security of all users, we require identity verification before you can request payouts. This is a one-time process.
          </Text>
        </View>

        {/* What You Need Section */}
        <View style={styles.requirementsSection}>
          <Text style={styles.requirementsTitle}>What You'll Need</Text>
          <View style={styles.requirement}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.requirementText}>
              Valid government-issued ID (Passport, ID Card, or Driver's License)
            </Text>
          </View>
          <View style={styles.requirement}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.requirementText}>
              Clear photo of front (and back if applicable)
            </Text>
          </View>
          <View style={styles.requirement}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.requirementText}>
              Selfie holding your ID document
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          {status.status === 'NOT_STARTED' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleStartVerification}
            >
              <Text style={styles.primaryButtonText}>Start Verification</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {status.status === 'PENDING' && (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleViewDocuments}
              >
                <Ionicons name="document-text-outline" size={20} color="#8B5CF6" />
                <Text style={styles.secondaryButtonText}>View Submitted Documents</Text>
              </TouchableOpacity>
              <View style={styles.pendingNote}>
                <Ionicons name="time-outline" size={16} color="#F59E0B" />
                <Text style={styles.pendingNoteText}>
                  Verification usually takes 1-2 business days
                </Text>
              </View>
            </>
          )}

          {status.status === 'VERIFIED' && (
            <>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={styles.verifiedText}>You're all set!</Text>
              </View>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleViewDocuments}
              >
                <Ionicons name="document-text-outline" size={20} color="#8B5CF6" />
                <Text style={styles.secondaryButtonText}>View Verification Details</Text>
              </TouchableOpacity>
            </>
          )}

          {status.status === 'REJECTED' && (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleResubmit}
              >
                <Ionicons name="refresh" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Resubmit Verification</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleViewDocuments}
              >
                <Ionicons name="document-text-outline" size={20} color="#8B5CF6" />
                <Text style={styles.secondaryButtonText}>View Previous Submission</Text>
              </TouchableOpacity>
            </>
          )}

          {status.status === 'BLOCKED' && (
            <View style={styles.blockedNote}>
              <Ionicons name="information-circle" size={20} color="#DC2626" />
              <Text style={styles.blockedNoteText}>
                For more information, please contact support.
              </Text>
            </View>
          )}
        </View>

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            If you have questions about the verification process, please visit our Help Center or contact support.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  statusDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusDescription: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
  },
  rejectionReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  rejectionReasonText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
    marginLeft: 8,
    lineHeight: 20,
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  requirementsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  requirement: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requirementText: {
    flex: 1,
    fontSize: 15,
    color: '#4B5563',
    marginLeft: 12,
    lineHeight: 22,
  },
  actionsSection: {
    marginBottom: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    marginBottom: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
    marginLeft: 8,
  },
  pendingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  pendingNoteText: {
    fontSize: 14,
    color: '#92400E',
    marginLeft: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    marginBottom: 12,
  },
  verifiedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#065F46',
    marginLeft: 12,
  },
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
  },
  blockedNoteText: {
    flex: 1,
    fontSize: 15,
    color: '#DC2626',
    marginLeft: 12,
    lineHeight: 22,
  },
  helpSection: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 20,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
});
