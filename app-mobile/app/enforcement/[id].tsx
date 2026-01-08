/**
 * PACK 419 — Enforcement Detail & Appeal Screen
 * 
 * Shows detailed information about a specific enforcement decision
 * and allows user to submit an appeal if applicable
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import {
  EnforcementDecision,
  EnforcementAppeal,
  EnforcementScope,
  EnforcementActionType,
  AppealStatus,
} from '@/shared/types/pack419-enforcement.types';
import { AppealPrompt } from '../../components/enforcement/AppealPrompt';

export default function EnforcementDetailScreen() {
  const router = useRouter();
  const { id, appeal: showAppealParam } = useLocalSearchParams();
  const enforcementId = Array.isArray(id) ? id[0] : id;

  const [enforcement, setEnforcement] = useState<EnforcementDecision | null>(null);
  const [existingAppeal, setExistingAppeal] = useState<EnforcementAppeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAppealModal, setShowAppealModal] = useState(false);

  useEffect(() => {
    loadEnforcementData();
    if (showAppealParam === 'true') {
      setShowAppealModal(true);
    }
  }, [enforcementId]);

  const loadEnforcementData = async () => {
    if (!enforcementId || !auth.currentUser) return;

    try {
      // Load enforcement decision
      const enforcementDoc = await getDoc(doc(db, 'enforcementDecisions', enforcementId));
      
      if (!enforcementDoc.exists()) {
        Alert.alert('Not Found', 'Enforcement decision not found');
        router.back();
        return;
      }

      const enforcementData = { id: enforcementDoc.id, ...enforcementDoc.data() } as EnforcementDecision;

      // Verify user owns this enforcement
      if (enforcementData.userId !== auth.currentUser.uid) {
        Alert.alert('Access Denied', 'You do not have permission to view this enforcement');
        router.back();
        return;
      }

      setEnforcement(enforcementData);

      // Load existing appeal if any
      if (enforcementData.appealId) {
        const appealDoc = await getDoc(doc(db, 'enforcementAppeals', enforcementData.appealId));
        if (appealDoc.exists()) {
          setExistingAppeal({ id: appealDoc.id, ...appealDoc.data() } as EnforcementAppeal);
        }
      }
    } catch (error) {
      console.error('Failed to load enforcement:', error);
      Alert.alert('Error', 'Failed to load enforcement details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = async (message: string) => {
    if (!enforcement || !auth.currentUser) return;

    try {
      const appealData = {
        userId: auth.currentUser.uid,
        enforcementId: enforcement.id,
        status: AppealStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userMessage: message,
      };

      const appealRef = await addDoc(collection(db, 'enforcementAppeals'), appealData);

      // Update enforcement with appeal ID
      await updateDoc(doc(db, 'enforcementDecisions', enforcement.id), {
        appealId: appealRef.id,
        updatedAt: Date.now(),
      });

      setShowAppealModal(false);
      Alert.alert(
        'Appeal Submitted',
        'Your appeal has been submitted successfully. Our team will review it within 24-48 hours.',
        [{ text: 'OK', onPress: () => loadEnforcementData() }]
      );
    } catch (error) {
      console.error('Failed to submit appeal:', error);
      throw new Error('Failed to submit appeal. Please try again.');
    }
  };

  const getActionBadge = (action: EnforcementActionType) => {
    const badges = {
      [EnforcementActionType.WARNING]: { label: 'Warning', color: '#FFC107', bg: '#FFF3CD' },
      [EnforcementActionType.TEMP_RESTRICTION]: { label: 'Temporary Restriction', color: '#FF9800', bg: '#FFE5CC' },
      [EnforcementActionType.PERMA_BAN]: { label: 'Permanent Ban', color: '#DC3545', bg: '#F8D7DA' },
      [EnforcementActionType.SHADOW_RESTRICTION]: { label: 'Shadow Restriction', color: '#6C757D', bg: '#E2E3E5' },
    };
    return badges[action];
  };

  const getReasonDescription = (reasonCode: string): string => {
    const descriptions: Record<string, string> = {
      HARASSMENT: 'Harassment or bullying behavior',
      SPAM: 'Spam or excessive unwanted contact',
      SCAM: 'Fraudulent or scam activity',
      FAKE_ID: 'Identity verification violation',
      HATE_SPEECH: 'Hate speech or discrimination',
      NSFW_VIOLATION: 'Adult content policy violation',
      TOS_VIOLATION: 'Terms of service violation',
      SUSPICIOUS_ACTIVITY: 'Suspicious behavior detected',
      PAYMENT_FRAUD: 'Payment or transaction fraud',
      ACCOUNT_ABUSE: 'Multiple accounts or ban evasion',
      IMPERSONATION: 'Impersonating another user',
      CHARGEBACK_ABUSE: 'Excessive payment chargebacks',
    };
    return descriptions[reasonCode] || 'Policy violation';
  };

  const getScopeDescriptions = (scopes: EnforcementScope[]): string[] => {
    const descriptions: Record<EnforcementScope, string> = {
      [EnforcementScope.CHAT]: 'Chat and messaging',
      [EnforcementScope.CALLS]: 'Voice and video calls',
      [EnforcementScope.MEETINGS]: 'Meeting bookings',
      [EnforcementScope.EVENTS]: 'Event participation',
      [EnforcementScope.FEED]: 'Feed posting',
      [EnforcementScope.DISCOVERY]: 'User discovery',
      [EnforcementScope.SWIPE]: 'Swipe features',
      [EnforcementScope.AI_COMPANIONS]: 'AI companions',
      [EnforcementScope.MONETIZATION]: 'Earning and monetization',
      [EnforcementScope.ACCOUNT_FULL]: 'Full account access',
    };
    return scopes.map(scope => descriptions[scope] || scope);
  };

  const getAppealStatusBadge = (status: AppealStatus) => {
    const badges = {
      [AppealStatus.PENDING]: { label: 'Pending Review', color: '#FFC107', bg: '#FFF3CD' },
      [AppealStatus.APPROVED]: { label: 'Approved', color: '#28A745', bg: '#D4EDDA' },
      [AppealStatus.REJECTED]: { label: 'Rejected', color: '#DC3545', bg: '#F8D7DA' },
      [AppealStatus.ESCALATED]: { label: 'Escalated', color: '#17A2B8', bg: '#D1ECF1' },
    };
    return badges[status];
  };

  const isActive = enforcement && enforcement.isActive && 
    (!enforcement.expiresAt || enforcement.expiresAt > Date.now());

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!enforcement) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Enforcement not found</Text>
      </View>
    );
  }

  const actionBadge = getActionBadge(enforcement.action);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: actionBadge.bg }]}>
          <View style={[styles.actionBadge, { backgroundColor: actionBadge.color }]}>
            <Text style={styles.actionBadgeText}>{actionBadge.label}</Text>
          </View>
          {isActive && (
            <View style={styles.activeIndicator}>
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>

        {/* Reason */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reason</Text>
          <Text style={styles.reasonText}>{getReasonDescription(enforcement.reasonCode)}</Text>
        </View>

        {/* Affected Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Affected Features</Text>
          {getScopeDescriptions(enforcement.scopes).map((scope, index) => (
            <View key={index} style={styles.scopeItem}>
              <Text style={styles.scopeBullet}>•</Text>
              <Text style={styles.scopeText}>{scope}</Text>
            </View>
          ))}
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.timelineItem}>
            <Text style={styles.timelineLabel}>Issued:</Text>
            <Text style={styles.timelineValue}>
              {new Date(enforcement.createdAt).toLocaleString()}
            </Text>
          </View>
          {enforcement.expiresAt && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>
                {isActive ? 'Expires:' : 'Expired:'}
              </Text>
              <Text style={styles.timelineValue}>
                {new Date(enforcement.expiresAt).toLocaleString()}
              </Text>
            </View>
          )}
          {!enforcement.expiresAt && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Duration:</Text>
              <Text style={[styles.timelineValue, styles.permanentText]}>
                Permanent
              </Text>
            </View>
          )}
        </View>

        {/* Appeal Section */}
        {existingAppeal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appeal Status</Text>
            <View style={[
              styles.appealStatusCard,
              { backgroundColor: getAppealStatusBadge(existingAppeal.status).bg }
            ]}>
              <View style={[
                styles.appealStatusBadge,
                { backgroundColor: getAppealStatusBadge(existingAppeal.status).color }
              ]}>
                <Text style={styles.appealStatusText}>
                  {getAppealStatusBadge(existingAppeal.status).label}
                </Text>
              </View>
              <Text style={styles.appealMessage}>{existingAppeal.userMessage}</Text>
              <Text style={styles.appealDate}>
                Submitted: {new Date(existingAppeal.createdAt).toLocaleDateString()}
              </Text>
              {existingAppeal.outcome?.publicExplanation && (
                <View style={styles.appealOutcome}>
                  <Text style={styles.appealOutcomeTitle}>Response:</Text>
                  <Text style={styles.appealOutcomeText}>
                    {existingAppeal.outcome.publicExplanation}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        {isActive && enforcement.isAppealable && !existingAppeal && (
          <TouchableOpacity
            style={styles.appealButton}
            onPress={() => setShowAppealModal(true)}
          >
            <Text style={styles.appealButtonText}>Submit Appeal</Text>
          </TouchableOpacity>
        )}

        {/* Help Text */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            If you believe this restriction was issued in error or would like more information,
            you can {enforcement.isAppealable && !existingAppeal ? 'submit an appeal above or ' : ''}
            contact our support team.
          </Text>
        </View>
      </ScrollView>

      {/* Appeal Modal */}
      <Modal
        visible={showAppealModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAppealModal(false)}
      >
        <AppealPrompt
          enforcement={enforcement}
          onSubmit={handleSubmitAppeal}
          onCancel={() => setShowAppealModal(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6C757D',
  },
  errorText: {
    fontSize: 18,
    color: '#DC3545',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  actionBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeIndicator: {
    backgroundColor: '#28A745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  reasonText: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24,
  },
  scopeItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  scopeBullet: {
    fontSize: 16,
    color: '#495057',
    marginRight: 8,
  },
  scopeText: {
    fontSize: 16,
    color: '#495057',
    flex: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timelineLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C757D',
    width: 100,
  },
  timelineValue: {
    fontSize: 15,
    color: '#212529',
    flex: 1,
  },
  permanentText: {
    color: '#DC3545',
    fontWeight: '600',
  },
  appealStatusCard: {
    padding: 16,
    borderRadius: 12,
  },
  appealStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  appealStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appealMessage: {
    fontSize: 15,
    color: '#212529',
    lineHeight: 22,
    marginBottom: 12,
  },
  appealDate: {
    fontSize: 13,
    color: '#6C757D',
  },
  appealOutcome: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  appealOutcomeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 6,
  },
  appealOutcomeText: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  appealButton: {
    backgroundColor: '#007BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  appealButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helpSection: {
    backgroundColor: '#E7F3FF',
    padding: 20,
    marginTop: 24,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#004085',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#004085',
    lineHeight: 20,
  },
});
