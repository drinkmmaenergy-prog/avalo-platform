/**
 * Account Management Screen
 * 
 * Allows users to:
 * - Pause/resume account
 * - Delete account (soft delete with preference save)
 * - Permanently delete account
 * 
 * Phase 9: Account Lifecycle Management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import {
  suspendAccount,
  reactivateAccount,
  softDeleteAccount,
  hardDeleteAccount,
  getDeletionEligibility,
  getAccountStatus,
  type DeletionEligibility,
  type AccountStatusInfo
} from "@/services/accountService";

export default function AccountManagementScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatusInfo | null>(null);
  const [eligibility, setEligibility] = useState<DeletionEligibility | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadAccountInfo();
    }
  }, [user]);

  const loadAccountInfo = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const [status, deleteEligibility] = await Promise.all([
        getAccountStatus(user.uid),
        getDeletionEligibility(user.uid)
      ]);
      
      setAccountStatus(status);
      setEligibility(deleteEligibility);
    } catch (error) {
      console.error('Error loading account info:', error);
      Alert.alert('Error', 'Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  const handlePauseAccount = async () => {
    if (!user?.uid) return;
    
    Alert.alert(
      'Pause Account',
      'Your account will be hidden from discovery, and you won\'t receive new chats or calls. You can reactivate anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const result = await suspendAccount(user.uid);
              Alert.alert('Success', result.message);
              await loadAccountInfo();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to pause account');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleReactivateAccount = async () => {
    if (!user?.uid) return;
    
    try {
      setActionLoading(true);
      const result = await reactivateAccount(user.uid);
      Alert.alert('Success', result.message);
      await loadAccountInfo();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reactivate account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!user?.uid) return;
    
    Alert.alert(
      'Delete Account',
      'Your account will be deleted, but we\'ll save your preferences so you can easily return later. Your photos, bio, and personal info will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Save Preferences',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const result = await softDeleteAccount(user.uid, true);
              Alert.alert(
                'Account Deleted',
                result.message,
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await signOut();
                      router.replace('/');
                    }
                  }
                ]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete account');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleHardDelete = async () => {
    if (!user?.uid || !eligibility) return;
    
    // Check if deletion is blocked
    if (eligibility.blockers.blocked) {
      Alert.alert(
        'Cannot Delete Account',
        `You cannot delete your account yet:\n\n${eligibility.blockers.reasons.join('\n')}\n\nPlease resolve these issues first.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Build warning message
    let warningMessages = [
      'This action is PERMANENT and CANNOT be undone.',
      'All your data will be permanently deleted.'
    ];
    
    if (eligibility.warnings && eligibility.warnings.length > 0) {
      warningMessages = [...warningMessages, ...eligibility.warnings];
    }
    
    Alert.alert(
      'Permanently Delete Account?',
      warningMessages.join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            // Double confirmation for permanent deletion
            Alert.alert(
              'Are You Absolutely Sure?',
              'This is your final warning. Your account will be permanently deleted and cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setActionLoading(true);
                      const result = await hardDeleteAccount(user.uid);
                      Alert.alert(
                        'Account Deleted',
                        result.message,
                        [
                          {
                            text: 'OK',
                            onPress: async () => {
                              await signOut();
                              router.replace('/');
                            }
                          }
                        ]
                      );
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete account');
                    } finally {
                      setActionLoading(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF3B5C" />
        <Text style={styles.loadingText}>Loading account settings...</Text>
      </View>
    );
  }

  const isSuspended = accountStatus?.status === 'suspended';
  const isActive = accountStatus?.status === 'active';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Status</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <View style={[
              styles.statusBadge,
              isActive ? styles.statusActive : styles.statusInactive
            ]}>
              <Text style={styles.statusBadgeText}>
                {isActive ? 'Active' : isSuspended ? 'Paused' : 'Inactive'}
              </Text>
            </View>
          </View>
          
          {isSuspended && accountStatus?.suspendedAt && (
            <Text style={styles.statusInfo}>
              Account paused. You are hidden from discovery.
            </Text>
          )}
        </View>
      </View>

      {/* Pause/Resume Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pause Account</Text>
        <Text style={styles.sectionDescription}>
          Temporarily hide your profile from discovery. You can reactivate anytime.
        </Text>
        
        {isActive ? (
          <TouchableOpacity
            style={[styles.button, styles.buttonWarning]}
            onPress={handlePauseAccount}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Pause My Account</Text>
            )}
          </TouchableOpacity>
        ) : isSuspended ? (
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleReactivateAccount}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Reactivate Account</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Delete Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delete Account</Text>
        <Text style={styles.sectionDescription}>
          Choose how you want to delete your account.
        </Text>

        {/* Soft Delete */}
        <View style={styles.deleteOption}>
          <Text style={styles.deleteOptionTitle}>
            Delete but Remember Preferences
          </Text>
          <Text style={styles.deleteOptionDescription}>
            We'll save your preferences so you can easily return. Your photos, bio, and personal info will be removed, but settings like gender preferences and search radius will be saved.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={handleSoftDelete}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Delete & Save Preferences</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Hard Delete */}
        <View style={styles.deleteOption}>
          <Text style={styles.deleteOptionTitle}>
            Delete Everything Permanently
          </Text>
          <Text style={styles.deleteOptionDescription}>
            Permanently delete all your data. This cannot be undone.
          </Text>
          
          {eligibility?.blockers.blocked && (
            <View style={styles.blockerCard}>
              <Text style={styles.blockerTitle}>⚠️ Cannot Delete Yet</Text>
              {eligibility.blockers.reasons.map((reason, index) => (
                <Text key={index} style={styles.blockerReason}>
                  • {reason}
                </Text>
              ))}
              {eligibility.blockers.details && (
                <Text style={styles.blockerDetails}>
                  Please close active chats and complete pending withdrawals first.
                </Text>
              )}
            </View>
          )}
          
          {eligibility?.warnings && eligibility.warnings.length > 0 && (
            <View style={styles.warningCard}>
              {eligibility.warnings.map((warning, index) => (
                <Text key={index} style={styles.warningText}>
                  ⚠️ {warning}
                </Text>
              ))}
            </View>
          )}
          
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonDestructive,
              eligibility?.blockers.blocked && styles.buttonDisabled
            ]}
            onPress={handleHardDelete}
            disabled={actionLoading || eligibility?.blockers.blocked}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Delete Forever</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666'
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20
  },
  statusCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  statusActive: {
    backgroundColor: '#10B981'
  },
  statusInactive: {
    backgroundColor: '#EF4444'
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  statusInfo: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  },
  deleteOption: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12
  },
  deleteOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8
  },
  deleteOptionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20
  },
  blockerCard: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2'
  },
  blockerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 8
  },
  blockerReason: {
    fontSize: 14,
    color: '#991B1B',
    marginBottom: 4,
    lineHeight: 20
  },
  blockerDetails: {
    fontSize: 13,
    color: '#991B1B',
    marginTop: 8,
    fontStyle: 'italic'
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEF3C7'
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 8,
    lineHeight: 20
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    backgroundColor: '#10B981'
  },
  buttonWarning: {
    backgroundColor: '#F59E0B'
  },
  buttonDanger: {
    backgroundColor: '#EF4444'
  },
  buttonDestructive: {
    backgroundColor: '#DC2626'
  },
  buttonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  spacer: {
    height: 40
  }
});
