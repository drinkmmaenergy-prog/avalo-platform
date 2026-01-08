/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Payout Requests History Screen
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { usePayoutRequests } from "@/hooks/usePayouts";
import type { PayoutRequest } from "@/types/payouts";
import {
  PAYOUT_STATUS_LABELS,
  PAYOUT_STATUS_COLORS,
  formatCurrency,
  formatTokens,
} from "@/types/payouts";

export default function PayoutRequestsHistoryScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const {
    requests,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
  } = usePayoutRequests(user?.uid || null);

  const handleRequestDetails = (request: PayoutRequest) => {
    // Show request details modal
    // For now, we'll just show an alert with the details
    const statusDetails = getStatusDetails(request);
    alert(
      `Payout Request Details\n\n` +
        `Amount: ${formatTokens(request.requestedTokens)} tokens\n` +
        `Fiat: ${formatCurrency(request.requestedFiat, request.currency)}\n` +
        `Status: ${PAYOUT_STATUS_LABELS[request.status]}\n` +
        `Created: ${new Date(request.createdAt as any).toLocaleString()}\n` +
        statusDetails
    );
  };

  const getStatusDetails = (request: PayoutRequest): string => {
    switch (request.status) {
      case 'REJECTED':
        return request.rejectionReason
          ? `\nReason: ${request.rejectionReason}`
          : '';
      case 'PAID':
        return request.reviewedAt
          ? `\nPaid on: ${new Date(request.reviewedAt as any).toLocaleString()}`
          : '';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading payout requests...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>⚠️ {error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payout Requests</Text>
          <Text style={styles.subtitle}>
            View and track your payout requests
          </Text>
        </View>

        {/* Summary Card */}
        {total > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Requests</Text>
              <Text style={styles.summaryValue}>{total}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Pending</Text>
              <Text style={styles.summaryValue}>
                {
                  requests.filter(
                    (r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW'
                  ).length
                }
              </Text>
            </View>
          </View>
        )}

        {/* Requests List */}
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>No Payout Requests</Text>
            <Text style={styles.emptySubtitle}>
              When you request a payout, it will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map((request) => (
              <PayoutRequestCard
                key={request.id}
                request={request}
                onPress={() => handleRequestDetails(request)}
              />
            ))}

            {/* Load More */}
            {hasMore && (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.loadMoreText}>Load More</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Create Request Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/wallet/create-payout-request' as any)}
        >
          <Text style={styles.createButtonText}>+ New Payout Request</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// PAYOUT REQUEST CARD COMPONENT
// ============================================================================

interface PayoutRequestCardProps {
  request: PayoutRequest;
  onPress: () => void;
}

function PayoutRequestCard({ request, onPress }: PayoutRequestCardProps) {
  const statusColors = PAYOUT_STATUS_COLORS[request.status];
  const createdDate = new Date(request.createdAt as any);

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress}>
      {/* Header */}
      <View style={styles.requestHeader}>
        <View style={styles.requestTitleRow}>
          <Text style={styles.requestAmount}>
            {formatTokens(request.requestedTokens)} tokens
          </Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: statusColors.bg,
                borderColor: statusColors.border,
              },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {PAYOUT_STATUS_LABELS[request.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.requestFiatAmount}>
          {formatCurrency(request.requestedFiat, request.currency)}
        </Text>
      </View>

      {/* Details */}
      <View style={styles.requestDetails}>
        <View style={styles.requestDetailRow}>
          <Text style={styles.requestDetailLabel}>Created</Text>
          <Text style={styles.requestDetailValue}>
            {createdDate.toLocaleDateString()} at{' '}
            {createdDate.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {request.reviewedAt && (
          <View style={styles.requestDetailRow}>
            <Text style={styles.requestDetailLabel}>Reviewed</Text>
            <Text style={styles.requestDetailValue}>
              {new Date(request.reviewedAt as any).toLocaleDateString()}
            </Text>
          </View>
        )}

        {request.status === 'REJECTED' && request.rejectionReason && (
          <View style={styles.rejectionReasonContainer}>
            <Text style={styles.rejectionReasonLabel}>Reason:</Text>
            <Text style={styles.rejectionReasonText}>
              {request.rejectionReason}
            </Text>
          </View>
        )}
      </View>

      {/* Status Timeline */}
      <View style={styles.timeline}>
        <TimelineStep
          label="Requested"
          isCompleted={true}
          date={createdDate}
        />
        <TimelineStep
          label="Under Review"
          isCompleted={
            request.status === 'UNDER_REVIEW' ||
            request.status === 'APPROVED' ||
            request.status === 'REJECTED' ||
            request.status === 'PAID'
          }
          isActive={request.status === 'UNDER_REVIEW'}
        />
        <TimelineStep
          label={request.status === 'REJECTED' ? 'Rejected' : 'Approved'}
          isCompleted={
            request.status === 'APPROVED' ||
            request.status === 'REJECTED' ||
            request.status === 'PAID'
          }
          isActive={request.status === 'APPROVED'}
          date={request.reviewedAt ? new Date(request.reviewedAt as any) : undefined}
        />
        {request.status !== 'REJECTED' && (
          <TimelineStep
            label="Paid"
            isCompleted={request.status === 'PAID'}
            isActive={request.status === 'PAID'}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// TIMELINE STEP COMPONENT
// ============================================================================

interface TimelineStepProps {
  label: string;
  isCompleted: boolean;
  isActive?: boolean;
  date?: Date;
}

function TimelineStep({
  label,
  isCompleted,
  isActive,
  date,
}: TimelineStepProps) {
  return (
    <View style={styles.timelineStep}>
      <View
        style={[
          styles.timelineDot,
          isCompleted && styles.timelineDotCompleted,
          isActive && styles.timelineDotActive,
        ]}
      >
        {isCompleted && <Text style={styles.timelineDotCheck}>✓</Text>}
      </View>
      <View style={styles.timelineContent}>
        <Text
          style={[
            styles.timelineLabel,
            (isCompleted || isActive) && styles.timelineLabelActive,
          ]}
        >
          {label}
        </Text>
        {date && (
          <Text style={styles.timelineDate}>
            {date.toLocaleDateString()} {date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  requestsList: {
    padding: 16,
    gap: 12,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  requestHeader: {
    marginBottom: 16,
  },
  requestTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  requestFiatAmount: {
    fontSize: 16,
    color: '#6B7280',
  },
  requestDetails: {
    marginBottom: 16,
    gap: 8,
  },
  requestDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  requestDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  requestDetailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  rejectionReasonContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  rejectionReasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 4,
  },
  rejectionReasonText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  timeline: {
    gap: 12,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCompleted: {
    backgroundColor: '#10B981',
  },
  timelineDotActive: {
    backgroundColor: '#3B82F6',
  },
  timelineDotCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  timelineLabelActive: {
    color: '#111827',
    fontWeight: '500',
  },
  timelineDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  loadMoreButton: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
