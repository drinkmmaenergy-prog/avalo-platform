/**
 * PACK 155: Account Deletion Flow
 * GDPR Article 17, CCPA §1798.105 - Right to Erasure
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

interface DeletionRequest {
  id: string;
  status: string;
  requestedAt: string;
  accountFrozenAt?: string;
  completedAt?: string;
  deletionSteps: {
    step: string;
    description: string;
    status: 'pending' | 'completed' | 'failed';
    completedAt?: string;
  }[];
}

export default function DeleteAccountScreen() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState<DeletionRequest | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    checkExistingRequest();
  }, []);

  const checkExistingRequest = async () => {
    try {
      const getDeletionRequest = httpsCallable(functions, 'getDeletionRequestStatus');
      const result = await getDeletionRequest();
      
      if (result.data) {
        setExistingRequest(result.data as DeletionRequest);
      }
    } catch (error) {
      console.error('Error checking deletion request:', error);
    }
  };

  const requestDeletion = async () => {
    if (confirmText.toUpperCase() !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm account deletion');
      return;
    }

    Alert.alert(
      'Final Confirmation',
      'This action cannot be undone. Your account and all associated data will be permanently deleted. Are you absolutely sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: confirmDeletion
        }
      ]
    );
  };

  const confirmDeletion = async () => {
    try {
      setLoading(true);

      const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
      await requestAccountDeletion();

      Alert.alert(
        'Deletion Requested',
        'Your account deletion has been initiated. Your account has been frozen and deletion will begin shortly. You will be logged out now.',
        [
          {
            text: 'OK',
            onPress: () => {
              auth.signOut();
              router.replace('/' as any);
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Error requesting deletion:', error);
      
      if (error.message?.includes('legal hold')) {
        Alert.alert(
          'Cannot Delete Account',
          'Your account is currently under a legal hold and cannot be deleted at this time. Please contact support for more information.'
        );
      } else {
        Alert.alert('Error', 'Failed to request account deletion. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelDeletion = async () => {
    if (!existingRequest) return;

    Alert.alert(
      'Cancel Deletion',
      'Are you sure you want to cancel your account deletion request?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes, Cancel Deletion',
          onPress: async () => {
            try {
              const cancelAccountDeletion = httpsCallable(functions, 'cancelAccountDeletion');
              await cancelAccountDeletion({ deletionRequestId: existingRequest.id });

              Alert.alert('Success', 'Your account deletion has been cancelled');
              setExistingRequest(null);
            } catch (error) {
              console.error('Error cancelling deletion:', error);
              Alert.alert('Error', 'Failed to cancel deletion request');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'failed':
        return 'close-circle';
      default:
        return 'ellipse-outline';
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#34C759';
      case 'failed':
        return '#FF3B30';
      default:
        return '#C7C7CC';
    }
  };

  if (existingRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Account Deletion' }} />
        
        <ScrollView style={styles.scrollView}>
          <View style={styles.statusHeader}>
            <Ionicons 
              name={existingRequest.status === 'completed' ? 'checkmark-circle' : 'time'} 
              size={64} 
              color={existingRequest.status === 'completed' ? '#34C759' : '#FF9500'} 
            />
            <Text style={styles.statusTitle}>
              {existingRequest.status === 'completed' ? 'Account Deleted' :
               existingRequest.status === 'processing' ? 'Deletion in Progress' :
               existingRequest.status === 'account_frozen' ? 'Account Frozen' :
               'Deletion Requested'}
            </Text>
            <Text style={styles.statusDescription}>
              {existingRequest.status === 'completed' 
                ? 'Your account has been permanently deleted' 
                : 'Your account deletion is being processed'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deletion Progress</Text>
            
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>
                Requested: {formatDate(existingRequest.requestedAt)}
              </Text>
            </View>

            {existingRequest.accountFrozenAt && (
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>
                  Account Frozen: {formatDate(existingRequest.accountFrozenAt)}
                </Text>
              </View>
            )}

            {existingRequest.deletionSteps.map((step, index) => (
              <View key={index} style={styles.stepCard}>
                <Ionicons 
                  name={getStepIcon(step.status)} 
                  size={24} 
                  color={getStepColor(step.status)} 
                />
                <View style={styles.stepContent}>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                  {step.completedAt && (
                    <Text style={styles.stepTime}>
                      {formatDate(step.completedAt)}
                    </Text>
                  )}
                </View>
              </View>
            ))}

            {existingRequest.completedAt && (
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>
                  Completed: {formatDate(existingRequest.completedAt)}
                </Text>
              </View>
            )}
          </View>

          {existingRequest.status === 'requested' || existingRequest.status === 'account_frozen' ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelDeletion}
            >
              <Text style={styles.cancelButtonText}>Cancel Deletion Request</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              {existingRequest.status === 'completed' 
                ? 'Your account and all associated data have been permanently deleted. Thank you for using Avalo.'
                : 'You will be automatically logged out once the deletion process is complete.'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Delete Account' }} />
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.warningHeader}>
          <Ionicons name="warning" size={64} color="#FF3B30" />
          <Text style={styles.warningTitle}>Delete Account</Text>
          <Text style={styles.warningDescription}>
            This action is permanent and cannot be undone
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Happens When You Delete:</Text>
          
          <View style={styles.listItem}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.listText}>
              Your account will be immediately frozen
            </Text>
          </View>

          <View style={styles.listItem}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.listText}>
              All chats, messages, and calls will be deleted
            </Text>
          </View>

          <View style={styles.listItem}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.listText}>
              Your public posts and content will be removed
            </Text>
          </View>

          <View style={styles.listItem}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.listText}>
              AI companion data and history will be erased
            </Text>
          </View>

          <View style={styles.listItem}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.listText}>
              All uploaded media will be permanently deleted
            </Text>
          </View>

          <View style={styles.listItem}>
            <Ionicons name="information-circle" size={24} color="#FF9500" />
            <Text style={styles.listText}>
              Financial transactions will be anonymized (required by law for 7 years)
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Before You Go:</Text>
          
          <Text style={styles.beforeText}>
            • Consider downloading your data first{'\n'}
            • Creator earnings already paid out will remain on record (anonymized){'\n'}
            • You won't be able to recover your account{'\n'}
            • Your username may become available to others
          </Text>

          <TouchableOpacity
            style={styles.exportLink}
            onPress={() => router.push('/profile/settings/data-export' as any)}
          >
            <Ionicons name="download-outline" size={20} color="#007AFF" />
            <Text style={styles.exportLinkText}>Download Your Data First</Text>
          </TouchableOpacity>
        </View>

        {!showConfirmation ? (
          <TouchableOpacity
            style={styles.proceedButton}
            onPress={() => setShowConfirmation(true)}
          >
            <Text style={styles.proceedButtonText}>Proceed with Deletion</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.confirmationSection}>
            <Text style={styles.confirmLabel}>
              Type DELETE to confirm:
            </Text>
            <TextInput
              style={styles.confirmInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.deleteButton,
                (loading || confirmText.toUpperCase() !== 'DELETE') && styles.deleteButtonDisabled
              ]}
              onPress={requestDeletion}
              disabled={loading || confirmText.toUpperCase() !== 'DELETE'}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="trash" size={20} color="#FFFFFF" />
                  <Text style={styles.deleteButtonText}>Delete My Account Permanently</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setShowConfirmation(false);
                setConfirmText('');
              }}
            >
              <Text style={styles.backButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            Under GDPR Article 17 and CCPA §1798.105, you have the right to request deletion of your personal information. 
            Some data may be retained for legal compliance (e.g., financial records for 7 years).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  scrollView: {
    flex: 1
  },
  warningHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 16
  },
  warningTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FF3B30',
    marginTop: 16,
    marginBottom: 8
  },
  warningDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center'
  },
  statusHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 16
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8
  },
  statusDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center'
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12
  },
  listText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24
  },
  beforeText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 16
  },
  exportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12
  },
  exportLinkText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500'
  },
  timelineItem: {
    paddingVertical: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#E5E5EA',
    paddingLeft: 16,
    marginBottom: 8
  },
  timelineLabel: {
    fontSize: 14,
    color: '#666'
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 8
  },
  stepContent: {
    flex: 1
  },
  stepDescription: {
    fontSize: 16,
    lineHeight: 22
  },
  stepTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4
  },
  proceedButton: {
    backgroundColor: '#FF3B30',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  confirmationSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16
  },
  confirmLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12
  },
  confirmInput: {
    borderWidth: 2,
    borderColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12
  },
  deleteButtonDisabled: {
    opacity: 0.5
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  cancelButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500'
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F4FD',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    gap: 12
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#014361',
    lineHeight: 20
  },
  legalBox: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12
  },
  legalText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18
  }
});
