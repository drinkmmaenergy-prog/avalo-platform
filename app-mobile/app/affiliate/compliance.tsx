/**
 * PACK 131: Affiliate Compliance Center
 * Manage agreements, verification, and compliance status
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface ComplianceStatus {
  agreementSigned: boolean;
  identityVerified: boolean;
  antiMLMAccepted: boolean;
  antiSpamAccepted: boolean;
  taxInfoComplete: boolean;
  payoutMethodConfigured: boolean;
  violationCount: number;
  canCreateLandingPage: boolean;
  canReceivePayouts: boolean;
}

interface Violation {
  violationId: string;
  type: string;
  description: string;
  severity: number;
  actionTaken: string;
  detectedAt: Date;
}

export default function AffiliateComplianceCenter() {
  const auth = getAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [antiMLMChecked, setAntiMLMChecked] = useState(false);
  const [antiSpamChecked, setAntiSpamChecked] = useState(false);

  useEffect(() => {
    loadComplianceStatus();
  }, []);

  const loadComplianceStatus = async () => {
    try {
      const functions = getFunctions();
      const getStatus = httpsCallable(functions, 'affiliateGetComplianceStatus');
      
      const result = await getStatus({ affiliateId: 'aff_123' });
      setStatus(result.data as ComplianceStatus);
    } catch (error) {
      console.error('Error loading compliance status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignAgreement = async () => {
    if (!antiMLMChecked || !antiSpamChecked) {
      Alert.alert('Error', 'You must accept all terms to continue');
      return;
    }

    try {
      const functions = getFunctions();
      const signAgreement = httpsCallable(functions, 'affiliateSignAgreement');
      
      await signAgreement({
        affiliateId: 'aff_123',
        antiMLMAccepted: antiMLMChecked,
        antiSpamAccepted: antiSpamChecked,
      });

      Alert.alert('Success', 'Agreement signed successfully');
      setShowAgreement(false);
      loadComplianceStatus();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign agreement');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load compliance status</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Compliance Center</Text>
        <Text style={styles.subtitle}>
          Complete all requirements to activate your affiliate account
        </Text>
      </View>

      {/* Overall Status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Account Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Can Create Landing Pages</Text>
          <View style={[styles.statusBadge, status.canCreateLandingPage ? styles.statusBadgeSuccess : styles.statusBadgePending]}>
            <Text style={styles.statusBadgeText}>
              {status.canCreateLandingPage ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Can Receive Payouts</Text>
          <View style={[styles.statusBadge, status.canReceivePayouts ? styles.statusBadgeSuccess : styles.statusBadgePending]}>
            <Text style={styles.statusBadgeText}>
              {status.canReceivePayouts ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>
      </View>

      {/* Requirements Checklist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Requirements Checklist</Text>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.agreementSigned)} Business Agreement
            </Text>
            {!status.agreementSigned && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowAgreement(true)}
              >
                <Text style={styles.actionButtonText}>Sign Now</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.requirementDescription}>
            Sign the affiliate business agreement
          </Text>
        </View>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.identityVerified)} Identity Verification
            </Text>
            {!status.identityVerified && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => Alert.alert('Info', 'Contact support to verify identity')}
              >
                <Text style={styles.actionButtonText}>Verify</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.requirementDescription}>
            Verify your identity to prevent fraud
          </Text>
        </View>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.antiMLMAccepted)} Anti-MLM Policy
            </Text>
          </View>
          <Text style={styles.requirementDescription}>
            Accept that multi-level marketing is prohibited
          </Text>
        </View>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.antiSpamAccepted)} Anti-Spam Policy
            </Text>
          </View>
          <Text style={styles.requirementDescription}>
            Accept anti-spam and ethical marketing guidelines
          </Text>
        </View>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.taxInfoComplete)} Tax Information
            </Text>
            {!status.taxInfoComplete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => Alert.alert('Info', 'Navigate to tax settings')}
              >
                <Text style={styles.actionButtonText}>Complete</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.requirementDescription}>
            Provide tax ID and country for payout processing
          </Text>
        </View>

        <View style={styles.requirement}>
          <View style={styles.requirementHeader}>
            <Text style={styles.requirementTitle}>
              {getStatusIcon(status.payoutMethodConfigured)} Payout Method
            </Text>
            {!status.payoutMethodConfigured && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => Alert.alert('Info', 'Navigate to payout settings')}
              >
                <Text style={styles.actionButtonText}>Setup</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.requirementDescription}>
            Configure bank transfer, PayPal, or Stripe
          </Text>
        </View>
      </View>

      {/* Violations */}
      {status.violationCount > 0 && (
        <View style={styles.violationsCard}>
          <Text style={styles.violationsTitle}>⚠️ Violations</Text>
          <Text style={styles.violationsText}>
            You have {status.violationCount} violation(s) on record.
          </Text>
          <Text style={styles.violationsWarning}>
            Additional violations may result in suspension or termination.
          </Text>
        </View>
      )}

      {/* Policy Guidelines */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Policy Guidelines</Text>
        
        <View style={styles.guideline}>
          <Text style={styles.guidelineTitle}>✓ Allowed</Text>
          <Text style={styles.guidelineText}>
            • Share referral links on social media{'\n'}
            • Create content about your Avalo experience{'\n'}
            • Use pre-approved landing page templates{'\n'}
            • Promote app features honestly
          </Text>
        </View>

        <View style={styles.guideline}>
          <Text style={styles.guidelineTitle}>✗ Prohibited</Text>
          <Text style={styles.guidelineText}>
            • Making monetization promises{'\n'}
            • Claiming users can "earn money"{'\n'}
            • Implying dating/escort services{'\n'}
            • Advertising explicit content{'\n'}
            • Multi-level marketing structures{'\n'}
            • Spam or deceptive practices{'\n'}
            • Fake accounts or referral farms
          </Text>
        </View>
      </View>

      {/* Agreement Modal */}
      {showAgreement && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Affiliate Business Agreement</Text>
            
            <ScrollView style={styles.agreementText}>
              <Text style={styles.agreementParagraph}>
                By signing this agreement, you acknowledge and agree to the following terms:
              </Text>
              
              <Text style={styles.agreementParagraph}>
                1. You will promote Avalo honestly and ethically{'\n'}
                2. You will not make false or misleading claims{'\n'}
                3. You will not engage in spam or deceptive practices{'\n'}
                4. You will not create multi-level marketing structures{'\n'}
                5. You will not promise earnings or monetary benefits{'\n'}
                6. You will comply with all applicable laws and regulations
              </Text>

              <Text style={styles.agreementParagraph}>
                Violations may result in:
                • 1st violation: Warning and education{'\n'}
                • 2nd violation: Suspension and withheld payouts{'\n'}
                • 3rd violation: Permanent ban from program
              </Text>
            </ScrollView>

            <View style={styles.checkbox}>
              <TouchableOpacity
                style={styles.checkboxButton}
                onPress={() => setAntiMLMChecked(!antiMLMChecked)}
              >
                <Text style={styles.checkboxIcon}>
                  {antiMLMChecked ? '☑' : '☐'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>
                I accept the Anti-MLM policy and will not create pyramid structures
              </Text>
            </View>

            <View style={styles.checkbox}>
              <TouchableOpacity
                style={styles.checkboxButton}
                onPress={() => setAntiSpamChecked(!antiSpamChecked)}
              >
                <Text style={styles.checkboxIcon}>
                  {antiSpamChecked ? '☑' : '☐'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>
                I accept the Anti-Spam policy and will market ethically
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowAgreement(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonSign,
                  (!antiMLMChecked || !antiSpamChecked) && styles.modalButtonDisabled,
                ]}
                onPress={handleSignAgreement}
                disabled={!antiMLMChecked || !antiSpamChecked}
              >
                <Text style={styles.modalButtonSignText}>Sign Agreement</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function getStatusIcon(completed: boolean): string {
  return completed ? '✅' : '⏳';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#000000',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: '#000000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeSuccess: {
    backgroundColor: '#34C759',
  },
  statusBadgePending: {
    backgroundColor: '#FF9500',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  requirement: {
    marginBottom: 20,
  },
  requirementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  requirementDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  violationsCard: {
    backgroundColor: '#FFF3CD',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  violationsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  violationsText: {
    fontSize: 16,
    color: '#856404',
    marginBottom: 8,
  },
  violationsWarning: {
    fontSize: 14,
    color: '#856404',
    fontStyle: 'italic',
  },
  guideline: {
    marginBottom: 20,
  },
  guidelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  guidelineText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
    textAlign: 'center',
  },
  agreementText: {
    maxHeight: 300,
    marginBottom: 16,
  },
  agreementParagraph: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
    marginBottom: 12,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkboxButton: {
    marginRight: 12,
  },
  checkboxIcon: {
    fontSize: 24,
    color: '#007AFF',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButtonCancel: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonSign: {
    flex: 1,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    backgroundColor: '#8E8E93',
  },
  modalButtonSignText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
});
