/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Payout Methods Management Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { usePayoutMethods } from "@/hooks/usePayouts";
import type {
  PayoutMethod,
  PayoutMethodType,
  BankTransferDetails,
  WiseDetails,
  StripeConnectDetails,
} from "@/types/payouts";
import {
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_ICONS,
  getMaskedMethodDetails,
} from "@/types/payouts";

export default function PayoutMethodsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;
  const {
    methods,
    isLoading,
    error,
    deleteMethod,
    updateMethod,
    refresh,
  } = usePayoutMethods(user?.uid || null);

  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);

  const handleAddMethod = () => {
    // TODO: Navigate to add payout method screen when created
    Alert.alert('Coming Soon', 'Add payout method screen will be added');
  };

  const handleEditMethod = (method: PayoutMethod) => {
    // TODO: Navigate to edit payout method screen when created
    Alert.alert('Coming Soon', 'Edit payout method screen will be added');
  };

  const handleSetDefault = async (method: PayoutMethod) => {
    try {
      await updateMethod(method.id, { isDefault: true });
      Alert.alert('Success', 'Default payout method updated');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to set default method');
    }
  };

  const handleDeleteMethod = (method: PayoutMethod) => {
    Alert.alert(
      'Delete Payout Method',
      `Are you sure you want to delete "${method.displayName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingMethodId(method.id);
              await deleteMethod(method.id);
              Alert.alert('Success', 'Payout method deleted');
            } catch (err: any) {
              Alert.alert(
                'Error',
                err.message || 'Failed to delete payout method'
              );
            } finally {
              setDeletingMethodId(null);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading payout methods...</Text>
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
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payout Methods</Text>
          <Text style={styles.subtitle}>
            Manage how you receive payouts from Avalo
          </Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Add at least one payout method to withdraw your earnings. All
            payout requests are reviewed by Avalo before processing.
          </Text>
        </View>

        {/* Methods List */}
        {methods.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💳</Text>
            <Text style={styles.emptyTitle}>No Payout Methods</Text>
            <Text style={styles.emptySubtitle}>
              Add a payout method to start withdrawing your earnings
            </Text>
          </View>
        ) : (
          <View style={styles.methodsList}>
            {methods.map((method) => (
              <PayoutMethodCard
                key={method.id}
                method={method}
                onEdit={() => handleEditMethod(method)}
                onSetDefault={() => handleSetDefault(method)}
                onDelete={() => handleDeleteMethod(method)}
                isDeleting={deletingMethodId === method.id}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Method Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddMethod}
          disabled={methods.length >= 5}
        >
          <Text style={styles.addButtonText}>
            {methods.length >= 5 ? 'Maximum Methods Reached' : '+ Add Payout Method'}
          </Text>
        </TouchableOpacity>
        {methods.length >= 5 && (
          <Text style={styles.maxMethodsNote}>
            You can have a maximum of 5 payout methods
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// PAYOUT METHOD CARD COMPONENT
// ============================================================================

interface PayoutMethodCardProps {
  method: PayoutMethod;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function PayoutMethodCard({
  method,
  onEdit,
  onSetDefault,
  onDelete,
  isDeleting,
}: PayoutMethodCardProps) {
  return (
    <View style={styles.methodCard}>
      {/* Header */}
      <View style={styles.methodHeader}>
        <View style={styles.methodTitleRow}>
          <Text style={styles.methodIcon}>
            {PAYOUT_METHOD_ICONS[method.type]}
          </Text>
          <View style={styles.methodTitleContainer}>
            <Text style={styles.methodName}>{method.displayName}</Text>
            <Text style={styles.methodType}>
              {PAYOUT_METHOD_LABELS[method.type]} • {method.currency}
            </Text>
          </View>
        </View>
        {method.isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <Text style={styles.methodDetails}>{getMaskedMethodDetails(method)}</Text>

      {/* Actions */}
      <View style={styles.methodActions}>
        {!method.isDefault && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onSetDefault}
            disabled={isDeleting}
          >
            <Text style={styles.actionButtonText}>Set as Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onEdit}
          disabled={isDeleting}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
              Delete
            </Text>
          )}
        </TouchableOpacity>
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
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  methodsList: {
    padding: 16,
    gap: 12,
  },
  methodCard: {
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
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  methodTitleContainer: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  methodType: {
    fontSize: 13,
    color: '#6B7280',
  },
  defaultBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  methodDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  methodActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  deleteButton: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    color: '#DC2626',
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
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  maxMethodsNote: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
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
